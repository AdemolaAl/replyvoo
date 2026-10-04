'use strict';
// Telegram and payment webhooks.
const db = require('../db');
const config = require('../config');
const engine = require('../services/engine');
const payments = require('../services/payments');
const settings = require('../services/settings');
const ws = require('../services/workspace');
const tg = require('../services/telegram');
const { safeEqual, decrypt, encrypt } = require('../lib/security');
const { HttpError } = require('../lib/http');

const LINK = /(https?:\/\/|t\.me\/|www\.)\S+/i;

function person(u) {
  return { id: u.id, name: [u.first_name, u.last_name].filter(Boolean).join(' ') || u.username || 'Telegram user', username: u.username || '', lang: u.language_code || '' };
}

async function largestPhoto(token, photos) {
  const p = photos[photos.length - 1];
  try {
    const f = await tg.download(token, p.file_id, 4.5 * 1024 * 1024);
    const ext = (f.path.split('.').pop() || 'jpg').toLowerCase();
    return [{ media_type: ext === 'png' ? 'image/png' : ext === 'webp' ? 'image/webp' : 'image/jpeg', data: f.buffer.toString('base64') }];
  } catch (e) { console.warn('[photo]', e.message); return []; }
}

async function handleUpdate(channel, u) {
  const token = decrypt(channel.token_enc);
  // A Telegram Business account connected (or disconnected) this bot.
  if (u.business_connection) {
    const bc = u.business_connection;
    const flag = settings.channel('telegram_business');
    let row = db.one('SELECT * FROM channels WHERE workspace_id = ? AND type = \'telegram_business\' AND external_id = ?', channel.workspace_id, bc.id);
    const data = JSON.stringify({ bot_channel_id: channel.id, user_id: bc.user && bc.user.id, can_reply: bc.can_reply !== false && !(bc.rights && bc.rights.can_reply === false) });
    const status = bc.is_enabled === false || flag !== 'live' ? 'disabled' : 'active';
    if (!row) {
      db.insert('channels', { workspace_id: channel.workspace_id, type: 'telegram_business', name: bc.user ? person(bc.user).name : 'Telegram account', username: bc.user && bc.user.username || '', external_id: bc.id, token_enc: encrypt(token), closer_id: channel.closer_id, status, data, created_at: db.now() });
      ws.event(channel.workspace_id, 'channel', 'Your Telegram account is connected through Telegram Business', {});
    } else db.update('channels', row.id, { status, data, token_enc: encrypt(token) });
    return;
  }
  const isBusiness = !!u.business_message;
  const m = u.message || u.business_message;
  if (!m || !m.chat || !m.from) return;
  let target = channel;
  let bcId = '';
  if (isBusiness) {
    bcId = m.business_connection_id || '';
    target = db.one('SELECT * FROM channels WHERE workspace_id = ? AND type = \'telegram_business\' AND external_id = ? AND status = \'active\'', channel.workspace_id, bcId);
    if (!target) return;
    const d = db.json(target.data, {});
    if (d.user_id && m.from.id === d.user_id) {
      // The account owner typed this themselves: record it as a human reply.
      const contact = engine.upsertContact(target.workspace_id, target.id, person(m.chat));
      const thread = engine.upsertThread(target.workspace_id, target, contact, m.chat.id, bcId);
      engine.addMessage(thread, 'out', 'human', m.text || m.caption || '[media]', 'text', { owner: true });
      return;
    }
  }
  const isGroup = m.chat.type === 'group' || m.chat.type === 'supergroup';
  const text = m.text || m.caption || '';
  if (isGroup) {
    if (settings.channel('telegram_group') !== 'live') return;
    const closer = channel.closer_id ? engine.loadCloser(channel.closer_id) : null;
    if (m.new_chat_members && closer && closer.active) {
      const names = m.new_chat_members.filter(x => !x.is_bot).map(x => x.first_name).join(', ');
      if (names && closer.template === 'guard') await tg.sendText(token, m.chat.id, 'Welcome, ' + names + '! Please read the pinned message. Ask me anything by mentioning me.').catch(() => {});
      return;
    }
    if (closer && closer.template === 'guard' && LINK.test(text)) {
      try {
        const member = await tg.call(token, 'getChatMember', { chat_id: m.chat.id, user_id: m.from.id });
        if (!['creator', 'administrator'].includes(member.status)) {
          await tg.call(token, 'deleteMessage', { chat_id: m.chat.id, message_id: m.message_id });
          ws.event(channel.workspace_id, 'shield', 'Shield removed a link posted by ' + person(m.from).name, {});
          return;
        }
      } catch (e) { /* bot may not be admin */ }
    }
    const me = db.json(channel.data, {});
    const mentioned = (channel.username && text.toLowerCase().includes('@' + channel.username.toLowerCase())) || (m.reply_to_message && m.reply_to_message.from && String(m.reply_to_message.from.id) === channel.external_id);
    void me;
    if (!mentioned) return;
    await engine.handleInbound({ channel, chatId: m.chat.id, from: { ...person(m.from), id: m.chat.id + ':' + m.from.id }, text: (channel.username ? text.replace(new RegExp('@' + channel.username.replace(/[^A-Za-z0-9_]/g, ''), 'ig'), '') : text).trim(), messageId: m.message_id, group: true, mentioned: true });
    return;
  }
  if (m.chat.type !== 'private') return;
  if (/^\/start(@\w+)?(\s|$)/.test(text)) {
    const closer = target.closer_id ? engine.loadCloser(target.closer_id) : null;
    const hello = closer ? 'Hi ' + (m.from.first_name || 'there') + '! I’m ' + closer.name + '. How can I help you today?' : 'Hi! How can we help you today?';
    const contact = engine.upsertContact(target.workspace_id, target.id, person(m.from));
    const thread = engine.upsertThread(target.workspace_id, target, contact, m.chat.id, bcId);
    engine.addMessage(thread, 'in', 'customer', text.slice(0, 200));
    await tg.sendText(token, m.chat.id, hello, { business_connection_id: bcId || undefined }).catch(() => {});
    engine.addMessage(thread, 'out', 'ai', hello, 'text', { closer_id: closer && closer.id });
    return;
  }
  let kind = 'text', images = [], voiceFile = null;
  if (m.photo && m.photo.length) { kind = 'image'; images = settings.feature('voice') ? await largestPhoto(token, m.photo) : []; }
  else if (m.voice || m.audio) { kind = 'voice'; voiceFile = (m.voice || m.audio).file_id; }
  else if (!text) kind = 'other';
  await engine.handleInbound({ channel: target, chatId: m.chat.id, bc: bcId, from: person(m.from), text, kind, images, voiceFile, messageId: m.message_id });
}

module.exports = function (app) {
  app.post('/webhooks/telegram/:id', (req, res) => {
    const channel = db.one('SELECT * FROM channels WHERE id = ? AND type = \'telegram_bot\' AND status = \'active\'', Number(req.params.id));
    if (!channel || !safeEqual(req.headers['x-telegram-bot-api-secret-token'] || '', channel.webhook_secret)) throw new HttpError(403, 'Forbidden');
    const u = req.body || {};
    res.json({ ok: true });
    if (!u.update_id || u.update_id <= channel.last_update_id) return;
    db.update('channels', channel.id, { last_update_id: u.update_id });
    handleUpdate(channel, u).catch(e => console.error('[telegram]', e.message));
  });

  app.post('/webhooks/paystack', (req, res) => {
    if (!payments.paystackSignatureOk(req.rawBody || Buffer.from(''), req.headers['x-paystack-signature'])) throw new HttpError(401, 'Bad signature');
    const ev = req.body || {};
    res.json({ ok: true });
    if (ev.event === 'charge.success' && ev.data && ev.data.reference) payments.verify(ev.data.reference).catch(e => console.error('[paystack]', e.message));
  });

  app.post('/webhooks/flutterwave', (req, res) => {
    if (!payments.flutterwaveSignatureOk(req.headers['verif-hash'])) throw new HttpError(401, 'Bad signature');
    const ev = req.body || {};
    res.json({ ok: true });
    const ref = ev.data && (ev.data.tx_ref || ev.data.txRef);
    if (ref) payments.verify(ref).catch(e => console.error('[flutterwave]', e.message));
  });

  // Gatevoo: signed invoice events. We re-read the invoice from Gatevoo before giving anything (never trust the body alone).
  app.post('/webhooks/gatevoo', (req, res) => {
    const gatevoo = require('../services/gatevoo');
    if (!gatevoo.signatureOk(req.rawBody || Buffer.from(''), req.headers['x-gatevoo-signature'])) throw new HttpError(401, 'Bad signature');
    const ev = req.body || {};
    const inv = ev.data || {};
    res.json({ ok: true });
    const o = inv.reference ? db.one('SELECT * FROM orders WHERE ref = ? AND provider = \'gatevoo\'', String(inv.reference)) : null;
    if (o) gatevoo.verify(o).catch(e => console.error('[gatevoo]', e.message));
  });

  void config;
};

module.exports.handleUpdate = handleUpdate;
