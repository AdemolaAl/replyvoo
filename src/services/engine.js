'use strict';
// The conversation engine: stores messages, scores leads, bills, asks the AI and replies.
const db = require('../db');
const ws = require('./workspace');
const ai = require('./ai');
const tg = require('./telegram');
const notify = require('./notify');
const settings = require('./settings');
const { decrypt } = require('../lib/security');

const busy = new Set();
// A customer who writes again while the Closer is still typing gets an answer to their latest message right after.
const again = new Map();

function loadCloser(id) {
  const c = db.one('SELECT * FROM closers WHERE id = ?', id);
  return c ? { ...c, persona: db.json(c.persona, {}), skills: db.json(c.skills, {}), rules: db.json(c.rules, {}), items: require('./training').loadItems(c.id, true) } : null;
}
// Website channels have no token: replies are only stored, and the widget fetches them.
function channelToken(channel) { return channel && channel.type !== 'website' ? decrypt(channel.token_enc) : ''; }
const isWeb = channel => channel && channel.type === 'website';

function upsertContact(wsId, channelId, ext) {
  const now = db.now();
  let c = db.one('SELECT * FROM contacts WHERE workspace_id = ? AND channel_id = ? AND external_id = ?', wsId, channelId, String(ext.id));
  if (!c) {
    const id = db.insert('contacts', { workspace_id: wsId, channel_id: channelId, external_id: String(ext.id), name: ext.name || '', username: ext.username || '', lang: ext.lang || '', last_seen: now, created_at: now });
    c = db.one('SELECT * FROM contacts WHERE id = ?', id);
  } else {
    db.update('contacts', c.id, { name: ext.name || c.name, username: ext.username || c.username, lang: ext.lang || c.lang, last_seen: now });
  }
  return c;
}

function upsertThread(wsId, channel, contact, chatId, bc = '') {
  let t = db.one('SELECT * FROM threads WHERE channel_id = ? AND chat_id = ? AND business_connection_id = ?', channel.id, String(chatId), bc);
  if (!t) {
    const id = db.insert('threads', { workspace_id: wsId, channel_id: channel.id, contact_id: contact.id, chat_id: String(chatId), business_connection_id: bc, closer_id: channel.closer_id, last_message_at: db.now(), created_at: db.now() });
    t = db.one('SELECT * FROM threads WHERE id = ?', id);
  }
  return t;
}

function addMessage(thread, dir, author, text, kind = 'text', meta = {}) {
  const now = db.now();
  const id = db.insert('messages', { workspace_id: thread.workspace_id, thread_id: thread.id, dir, author, kind, text: String(text || '').slice(0, 8000), meta: JSON.stringify(meta), created_at: now });
  const patch = { last_message_at: now, last_text: String(text || (kind === 'image' ? '[image]' : kind === 'voice' ? '[voice note]' : '')).slice(0, 200) };
  if (dir === 'in') { patch.last_customer_at = now; db.run('UPDATE threads SET unread = unread + 1 WHERE id = ?', thread.id); }
  db.update('threads', thread.id, patch);
  return id;
}

// What the Closer may remember about a customer: name, how often they've chatted, stage, value and team notes.
function memory(contactId) {
  const c = db.one('SELECT * FROM contacts WHERE id = ?', contactId);
  if (!c) return null;
  const chats = db.one('SELECT COALESCE(SUM(units), 0) n FROM threads WHERE contact_id = ?', c.id).n;
  return { name: c.name, chats, first_seen: c.created_at, stage: c.stage, heat: c.heat, value: c.value, notes: c.notes, lang: c.lang };
}
// Typing time grows with the reply's length (about 30 characters a second), capped so customers never wait long.
const config = require('../config');
function typingMs(text, i) { if (config.env === 'test') return 0; return Math.min(i ? 2600 : 3200, 500 + String(text).length * 32); }
const pause = ms => new Promise(r => setTimeout(r, ms));

// Simple, transparent lead scoring.
const HOT = /\b(pay|paid|payment|buy|order|checkout|link|account number|transfer|deposit|send (me )?the link|i want (it|this|one)|how do i (pay|order|buy))\b/i;
const WARM = /\b(price|cost|how much|available|in stock|deliver|delivery|size|discount|offer|plan|details|interested)\b|\?/i;
function score(contact, text, kind, receipt) {
  const order = ['cold', 'warm', 'hot', 'won'];
  let heat = contact.heat; let stage = contact.stage;
  if (receipt) { heat = 'won'; stage = 'won'; }
  else if (HOT.test(text) || kind === 'image') { if (order.indexOf(heat) < 2) heat = 'hot'; if (['new', 'qualified'].includes(stage)) stage = 'checkout'; }
  else if (WARM.test(text)) { if (order.indexOf(heat) < 1) heat = 'warm'; if (stage === 'new') stage = 'qualified'; }
  if (heat !== contact.heat || stage !== contact.stage) {
    db.update('contacts', contact.id, { heat, stage });
    const voo = require('./voosquare');
    const chType = (db.one('SELECT type FROM channels WHERE id = ?', contact.channel_id) || {}).type;
    if (heat === 'hot' && contact.heat !== 'hot') { ws.event(contact.workspace_id, 'hot', (contact.name || 'A lead') + ' is now Hot', { contact_id: contact.id }); voo.safeEmit(contact.workspace_id, 'lead_qualified', { channel: chType }); }
    if (stage === 'won' && contact.stage !== 'won') { ws.event(contact.workspace_id, 'won', (contact.name || 'A customer') + ' sent a payment screenshot', { contact_id: contact.id }); voo.safeEmit(contact.workspace_id, 'sale_closed', { channel: chType, valueUsd: contact.value }); }
  }
  return { heat, stage };
}

function history(threadId) {
  return db.all('SELECT dir, author, text FROM messages WHERE thread_id = ? AND dir IN (\'in\',\'out\') ORDER BY id DESC LIMIT 14', threadId).reverse()
    .map(m => ({ role: m.dir === 'in' ? 'user' : 'assistant', text: m.text || '(attachment)' }));
}

// Handle one inbound customer message. Returns the reply text (or null).
// With detail: true it returns { text, id, created_at, handoff } instead (the website widget needs the stored reply).
async function handleInbound({ channel, chatId, bc = '', from, text = '', kind = 'text', images = [], voiceFile = null, messageId = null, group = false, mentioned = true, meta = null, detail = false, replyOnly = false }) {
  const w = ws.get(channel.workspace_id);
  if (!w || w.status !== 'active') return null;
  const contact = upsertContact(w.id, channel.id, from);
  if (contact.blocked) return null;
  const thread = upsertThread(w.id, channel, contact, chatId, bc);
  const token = channelToken(channel);

  let content = text;
  if (!replyOnly && kind === 'voice' && voiceFile && settings.feature('voice')) {
    try { const f = await tg.download(token, voiceFile, 10 * 1024 * 1024); const tr = await ai.transcribe(f.buffer); if (tr) content = tr; } catch (e) { console.warn('[voice]', e.message); }
  }
  if (!replyOnly) addMessage(thread, 'in', 'customer', content || (kind === 'voice' ? '[voice note]' : ''), kind, { message_id: messageId, transcribed: kind === 'voice' && !!content, ...(meta || {}) });
  const scored = replyOnly ? { heat: contact.heat, stage: contact.stage } : score(contact, content, kind, false);

  if (group && !mentioned) return null;
  const fresh = db.one('SELECT * FROM threads WHERE id = ?', thread.id);
  if (!fresh.ai_on || fresh.status === 'handoff') return null;
  const closerId = fresh.closer_id || channel.closer_id;
  const closer = closerId ? loadCloser(closerId) : null;
  if (!closer || !closer.active) return null;
  if (!ws.closerUnlocked(closer)) return null; // over the plan's Closer limit: saved, but paused
  if (kind === 'voice' && !content) {
    const msg = 'Thanks for the voice note! Could you type your question so I can help you faster?';
    const r = await send(channel, token, fresh, msg, bc);
    if (!r.ok) ws.event(w.id, 'error', 'A reply could not be delivered: ' + r.error.slice(0, 120), { thread_id: thread.id });
    return detail ? { text: msg, id: r.id, created_at: r.created_at, handoff: false } : msg;
  }
  if (busy.has(thread.id)) { if (!detail) again.set(thread.id, { channel, chatId, bc, from, text: content, kind: 'text', group, mentioned }); return null; }
  busy.add(thread.id);
  let charge = null;
  try {
    const pro = !!closer.pro_brain && settings.feature('pro_brain');
    charge = ws.chargeForReply(w.id, fresh, { pro });
    if (!charge.ok) { charge = null; notify.outOfCredits(w.id); ws.event(w.id, 'paused', 'A reply was skipped for ' + (contact.name || 'a customer') + ' because you are out of conversations and credits.', { thread_id: thread.id }); return null; }
    if (token) tg.typing(token, chatId, bc);
    const t0 = Date.now();
    // A follow-up written while the Closer was replying: its reply is already in the history, so answer the newer message on top of it.
    const out = await ai.reply({ closer, business: w.name, history: replyOnly ? history(thread.id) : history(thread.id).slice(0, -1), message: replyOnly ? '[The customer sent this while you were replying: "' + String(content).slice(0, 1500) + '". Answer it naturally without repeating what you just said.]' : content, images: closer.skills.vision === false ? [] : images, pro, channel: isWeb(channel) ? 'website' : 'telegram', customer: memory(contact.id) });
    if (out.receipt) score(db.one('SELECT * FROM contacts WHERE id = ?', contact.id), content, kind, true);
    // Like a person texting: a short typing pause, and two quick messages when the reply has two thoughts.
    const human = closer.persona.human !== false && !!token;
    const parts = human && out.parts ? out.parts : [out.text];
    let r = { ok: true }; let sent = 0; let first = null;
    for (let i = 0; i < parts.length && r.ok; i++) {
      if (human) { if (i) tg.typing(token, chatId, bc); await pause(Math.max(0, typingMs(parts[i], i) - (i ? 0 : Date.now() - t0))); }
      r = await send(channel, token, fresh, parts[i], bc, closer);
      if (r.ok) { sent++; if (!first) first = r; }
    }
    // Part of a two-message reply got through: the customer has an answer, so it counts as delivered.
    if (!r.ok && sent) { ws.event(w.id, 'error', 'Part of a reply could not be delivered: ' + r.error.slice(0, 120), { thread_id: thread.id }); r = first; }
    if (!r.ok) {
      // Nothing reached the customer: give the conversation back and tell the team.
      ws.refundCharge(w.id, charge); charge = null;
      ws.event(w.id, 'error', 'A reply could not be delivered on Telegram: ' + r.error.slice(0, 120), { thread_id: thread.id });
      return null;
    }
    const newChat = !!charge.newUnit;
    charge = null;
    ws.commitReply(thread.id);
    const voo = require('./voosquare');
    if (newChat) voo.safeEmit(w.id, 'chat_answered', { channel: channel.type });
    if (closer.pay_link && out.text.includes(closer.pay_link)) voo.safeEmit(w.id, 'payment_link_sent', { channel: channel.type });
    db.run('UPDATE closers SET replies = replies + 1 WHERE id = ?', closer.id);
    if (out.handoff && closer.skills.handoff !== false) {
      db.update('threads', thread.id, { status: 'handoff' });
      addMessage(fresh, 'note', 'system', closer.name + ' handed this chat to your team');
      ws.event(w.id, 'handoff', (contact.name || 'A customer') + ' needs a human', { thread_id: thread.id });
      notify.handoff(w.id, fresh, contact, closer.name, content);
    } else {
      ws.event(w.id, 'reply', closer.name + ' replied to ' + (contact.name || 'a customer'), { thread_id: thread.id, closer_id: closer.id, heat: scored.heat });
    }
    if (detail) return { text: out.text, id: r.id, created_at: r.created_at, handoff: !!(out.handoff && closer.skills.handoff !== false) };
    return out.text;
  } catch (e) {
    console.error('[engine]', e.message);
    if (charge) { try { ws.refundCharge(w.id, charge); } catch (e2) { console.error('[engine] refund', e2.message); } }
    ws.event(w.id, 'error', 'A reply failed: ' + String(e.message).slice(0, 120), { thread_id: thread.id });
    return null;
  } finally {
    busy.delete(thread.id);
    const nx = again.get(thread.id);
    if (nx) { again.delete(thread.id); setImmediate(() => handleInbound({ ...nx, replyOnly: true }).catch(e => console.error('[engine] follow-up', e.message))); }
  }
}

// Sends a reply and stores it. Never throws on a Telegram failure: the message is kept (marked failed)
// so the team can see what the Closer tried to say.
async function send(channel, token, thread, text, bc, closer) {
  if (!text) return { ok: true };
  let sent = null; let error = '';
  if (token) {
    try { sent = await tg.sendText(token, thread.chat_id, text, { business_connection_id: bc || undefined }); }
    catch (e) {
      error = String(e.message || 'Telegram error');
      if (e.code === 403) db.run('UPDATE contacts SET blocked = 1 WHERE id = ?', thread.contact_id);
    }
  }
  const meta = { message_id: sent && sent.message_id, closer_id: closer && closer.id };
  if (error) { meta.failed = true; meta.error = error.slice(0, 200); }
  const id = addMessage(thread, 'out', closer ? 'ai' : 'system', text, 'text', meta);
  return error ? { ok: false, error, id } : { ok: true, id, created_at: db.now() };
}

// Human reply from the inbox. Takes over the chat from the AI.
async function humanReply(thread, user, text) {
  const channel = db.one('SELECT * FROM channels WHERE id = ?', thread.channel_id);
  const token = channel ? channelToken(channel) : '';
  let sent = null;
  if (token) sent = await tg.sendText(token, thread.chat_id, text, { business_connection_id: thread.business_connection_id || undefined });
  addMessage(thread, 'out', 'human', text, 'text', { user_id: user.id, user_name: user.name, message_id: sent && sent.message_id });
  db.update('threads', thread.id, { ai_on: 0, unread: 0 });
}

module.exports = { memory, typingMs, handleInbound, humanReply, addMessage, upsertContact, upsertThread, loadCloser, channelToken, score, history };
