'use strict';
// Dashboard API for signed-in workspace members.
const db = require('../db');
const config = require('../config');
const auth = require('../lib/auth');
const ws = require('../services/workspace');
const catalog = require('../services/catalog');
const settings = require('../services/settings');
const engine = require('../services/engine');
const payments = require('../services/payments');
const mailer = require('../services/mailer');
const ai = require('../services/ai');
const tg = require('../services/telegram');
const web = require('../services/website');
const training = require('../services/training');
const { encrypt, decrypt, token, sha256 } = require('../lib/security');
const { HttpError, rateLimit } = require('../lib/http');

const int = (v, d = 0) => (Number.isFinite(Number(v)) ? Math.trunc(Number(v)) : d);
const str = (v, max = 200) => String(v == null ? '' : v).trim().slice(0, max);
const SKILL_KEYS = catalog.SKILLS.map(s => s[0]);
const first = n => String(n || '').split(' ')[0] || 'there';

function closerOut(c, full) {
  const out = { id: c.id, name: c.name, template: c.template, persona: db.json(c.persona, {}), skills: db.json(c.skills, {}), instructions: c.instructions, knowledge: c.knowledge, pay_link: c.pay_link, pro_brain: !!c.pro_brain, active: !!c.active, locked: !ws.closerUnlocked(c), replies: c.replies, created_at: c.created_at,
    rules: db.json(c.rules, {}), updated_at: c.updated_at,
    channels: db.all('SELECT id, type, name, username FROM channels WHERE closer_id = ? AND status = \'active\'', c.id) };
  if (full) {
    // Training score + open gaps, so the Closers page can show how well each Closer is trained.
    const items = training.loadItems(c.id, true);
    const g = training.gaps(c.id, c.workspace_id, db.json(c.training, {}), items).length;
    const sc = training.score(c, items, g);
    Object.assign(out, { score: sc.score, gaps: g, knowledge_items: items.length });
  }
  return out;
}
function channelOut(c) {
  const d = db.json(c.data, {});
  const out = { id: c.id, type: c.type, name: c.name, username: c.username, closer_id: c.closer_id, status: c.status, created_at: c.created_at, business: d.business || null, chats: db.one('SELECT COUNT(*) n FROM threads WHERE channel_id = ?', c.id).n };
  if (c.type === 'website') {
    const { widget, domains } = web.widgetOf(c);
    const assets = {};
    for (const k of web.ASSET_KINDS) if (widget.assets && widget.assets[k]) assets[k] = web.assetUrl(c, k, widget.assets[k]);
    Object.assign(out, { key: c.external_id, widget, domains, assets, install: d.install || null, unlocked: c.status === 'active' && web.channelUnlocked(c),
      snippet: '<script src="' + config.appUrl + '/widget.js" data-key="' + c.external_id + '" async></script>', leads: db.one('SELECT COUNT(*) n FROM contacts WHERE channel_id = ? AND (email != \'\' OR phone != \'\')', c.id).n });
  }
  return out;
}
function getChannel(req, id) { const c = db.one('SELECT * FROM channels WHERE id = ? AND workspace_id = ? AND status != \'deleted\'', int(id), req.ws.id); if (!c) throw new HttpError(404, 'Channel not found'); return c; }
function websiteLimit(req) {
  const u = ws.usage(req.ws);
  if (u.website.used >= u.website.sites) {
    throw new HttpError(402, u.website.sites ? 'All your website chat slots are in use (' + u.website.used + ' of ' + u.website.sites + '). Upgrade your plan or add the Website chat power-up.' : 'Website chat is locked on your plan. It’s available on Pro and up, or add the Website chat power-up to any plan.', { code: 'website_limit', sites: u.website.sites, used: u.website.used });
  }
}
function getClosed(req, id) { const c = db.one('SELECT * FROM closers WHERE id = ? AND workspace_id = ?', int(id), req.ws.id); if (!c) throw new HttpError(404, 'Closer not found'); return c; }
function getThread(req, id) { const t = db.one('SELECT * FROM threads WHERE id = ? AND workspace_id = ?', int(id), req.ws.id); if (!t) throw new HttpError(404, 'Chat not found'); return t; }

function cleanCloser(b, existing = {}) {
  const persona = b.persona || {};
  const skills = {};
  for (const k of SKILL_KEYS) skills[k] = b.skills && k in b.skills ? !!b.skills[k] : (existing.skills ? !!existing.skills[k] : ['paylink', 'vision', 'handoff', 'upsell'].includes(k));
  const tplId = catalog.TEMPLATES.some(t => t.id === b.template) ? b.template : (existing.template || 'sales');
  const link = str(b.pay_link, 500);
  if (link && !/^https?:\/\//i.test(link)) throw new HttpError(400, 'Your payment link must start with https://');
  const p = { tone: Math.min(100, Math.max(0, int(persona.tone, 30))), length: Math.min(100, Math.max(0, int(persona.length, 40))), emoji: Math.min(100, Math.max(0, int(persona.emoji, 30))) };
  if (/^#[0-9a-f]{6}$/i.test(String(persona.color || ''))) p.color = String(persona.color).toUpperCase();
  // Human-like replies (typing pauses, two short messages when natural) are on unless switched off.
  p.human = persona.human !== false && persona.human !== 'false';
  const style = str(persona.style, 3000); if (style) p.style = style;
  const out = {
    name: str(b.name, 40) || existing.name || catalog.template(tplId).name, template: tplId,
    persona: JSON.stringify(p),
    skills: JSON.stringify(skills), instructions: str(b.instructions, 4000), knowledge: str(b.knowledge, 60000), pay_link: link, pro_brain: b.pro_brain ? 1 : 0
  };
  if (b.rules !== undefined && b.rules !== null) out.rules = JSON.stringify(training.cleanRules(b.rules));
  return out;
}

function dayKey(d) { return new Date(d).toISOString().slice(0, 10); }

// Orders as the customer sees them: Gatevoo orders carry the coin, a link to the transaction and, while pending, the payment page.
function orderOut(o) {
  if (!o) return o;
  const m = db.json(o.meta, {}); delete o.meta;
  if (o.provider === 'gatevoo') {
    const gatevoo = require('../services/gatevoo');
    o.coin = m.coin && gatevoo.COINS[m.coin] ? gatevoo.COINS[m.coin].label : null;
    o.tx_url = gatevoo.txUrl(m.coin, m.tx_hash);
    if (o.status === 'pending' && m.checkout_url && (!m.expires_at || new Date(m.expires_at) > new Date())) o.pay_url = m.checkout_url;
    if (m.underpaid) o.underpaid = true;
  }
  return o;
}

module.exports = function (app) {
  const W = req => auth.needWs(req);
  const M = req => auth.needManager(req);
  const aiLimit = rateLimit('ai-test', 40, 3600e3);

  app.get('/api/app/bootstrap', W, req => {
    const w = req.ws;
    const ms = db.all('SELECT w.id, w.name, m.role FROM members m JOIN workspaces w ON w.id = m.workspace_id WHERE m.user_id = ?', req.user.id);
    return {
      user: auth.publicUser(req.user), role: req.role, workspaces: ms,
      workspace: { id: w.id, name: w.name, ref_code: w.ref_code, auto_topup: !!w.auto_topup, settings: { niche: w.settings.niche || '', alerts: w.settings.alerts || {}, timezone: w.settings.timezone || 'Africa/Lagos', auto_topup_pack: w.settings.auto_topup_pack || null }, created_at: w.created_at },
      usage: ws.usage(w), plans: ws.publicPlans(), packs: db.all('SELECT * FROM packs WHERE active = 1 ORDER BY sort, price'),
      addons: db.all('SELECT * FROM addons WHERE active = 1 ORDER BY sort'), flags: settings.get('flags'), templates: catalog.TEMPLATES.map(({ brief, ...t }) => t), skills: catalog.SKILLS,
      channels_catalog: catalog.CHANNELS, billing: (b => ({ conversation_reply_limit: b.conversation_reply_limit, extra_closer_credits: b.extra_closer_credits, blast_people_per_credit: b.blast_people_per_credit, credit_value_usd: b.credit_value_usd, yearly_months_free: b.yearly_months_free }))(settings.get('billing')),
      joinvoo: settings.get('joinvoo'), providers: payments.providers(req.user.country), voo: { ...require('../services/voosquare').publicInfo(), linked: !!req.user.voo_id }, onboarding: !!w.settings.onboarding, ai_live: !!config.ai.key, company: settings.get('company'),
      waitlist: db.all('SELECT item FROM waitlist WHERE workspace_id = ?', w.id).map(r => r.item),
      widget_catalog: { presets: web.PRESETS, fonts: Object.fromEntries(Object.entries(web.FONTS).map(([k, f]) => [k, { name: f.name, family: f.family, css: f.css }])), defaults: web.defaults(w.name) }
    };
  });

  // ---------- profile & workspace ----------
  app.put('/api/app/profile', W, req => {
    const b = req.body || {};
    const patch = {};
    if (b.name != null) patch.name = str(b.name, 80);
    if (b.moji) patch.moji = JSON.stringify(require('../lib/moji').cleanMoji(b.moji));
    db.update('users', req.user.id, patch);
    return { ok: true };
  });
  app.put('/api/app/password', W, req => {
    if (req.user.voo_id && require('../services/voosquare').enabled()) throw new HttpError(400, 'Your login is managed by VooSquare. Change your password there.');
    const { verifyPassword, hashPassword } = require('../lib/security');
    const b = req.body || {};
    if (!verifyPassword(b.current || '', req.user.password_hash)) throw new HttpError(400, 'Your current password is not right.');
    if (String(b.password || '').length < 8) throw new HttpError(400, 'Your new password needs at least 8 characters.');
    db.update('users', req.user.id, { password_hash: hashPassword(b.password) });
    db.run('DELETE FROM sessions WHERE user_id = ? AND id != ?', req.user.id, req.session.id);
    return { ok: true };
  });
  app.put('/api/app/workspace', M, req => {
    const b = req.body || {};
    if (b.name != null) db.update('workspaces', req.ws.id, { name: str(b.name, 80) || req.ws.name });
    if (b.auto_topup != null) db.update('workspaces', req.ws.id, { auto_topup: b.auto_topup ? 1 : 0 });
    const patch = {};
    if (b.alerts) patch.alerts = { handoff: !!b.alerts.handoff, night_report: !!b.alerts.night_report, hot: !!b.alerts.hot, low_credits: !!b.alerts.low_credits };
    if (b.niche != null) patch.niche = str(b.niche, 60);
    if (b.timezone != null) patch.timezone = str(b.timezone, 60);
    if (b.auto_topup_pack != null) patch.auto_topup_pack = int(b.auto_topup_pack) || null;
    if (Object.keys(patch).length) ws.saveSettings(req.ws.id, patch);
    return { ok: true };
  });
  app.post('/api/app/workspaces/switch', W, (req) => {
    const id = int((req.body || {}).id);
    if (!ws.memberRole(id, req.user.id)) throw new HttpError(403, 'Not a member of that workspace');
    db.update('sessions', req.session.id, { workspace_id: id });
    return { ok: true };
  });

  // ---------- stats & live ----------
  app.get('/api/app/stats', W, req => {
    const id = req.ws.id;
    const today = new Date(); today.setHours(0, 0, 0, 0);
    const t0 = today.toISOString();
    const since14 = new Date(Date.now() - 13 * 864e5); since14.setHours(0, 0, 0, 0);
    const q = (sql, ...p) => db.one(sql, ...p).n;
    const chatsToday = q('SELECT COUNT(DISTINCT thread_id) n FROM messages WHERE workspace_id = ? AND dir = \'in\' AND created_at >= ?', id, t0);
    const repliesToday = q('SELECT COUNT(*) n FROM messages WHERE workspace_id = ? AND author = \'ai\' AND created_at >= ?', id, t0);
    const handoffs = q('SELECT COUNT(*) n FROM threads WHERE workspace_id = ? AND status = \'handoff\'', id);
    const hot = q('SELECT COUNT(*) n FROM contacts WHERE workspace_id = ? AND heat = \'hot\'', id);
    const wonToday = q('SELECT COUNT(*) n FROM events WHERE workspace_id = ? AND type = \'won\' AND created_at >= ?', id, t0);
    const series = {}; for (let i = 0; i < 14; i++) series[dayKey(since14.getTime() + i * 864e5)] = { chats: 0, replies: 0 };
    for (const r of db.all('SELECT substr(created_at,1,10) d, COUNT(DISTINCT thread_id) c FROM messages WHERE workspace_id = ? AND dir = \'in\' AND created_at >= ? GROUP BY d', id, since14.toISOString())) if (series[r.d]) series[r.d].chats = r.c;
    for (const r of db.all('SELECT substr(created_at,1,10) d, COUNT(*) c FROM messages WHERE workspace_id = ? AND author = \'ai\' AND created_at >= ? GROUP BY d', id, since14.toISOString())) if (series[r.d]) series[r.d].replies = r.c;
    const stages = {}; for (const r of db.all('SELECT stage, COUNT(*) n FROM contacts WHERE workspace_id = ? GROUP BY stage', id)) stages[r.stage] = r.n;
    const rpm = [];
    const base = Date.now() - 20 * 60e3;
    const recent = db.all('SELECT created_at FROM messages WHERE workspace_id = ? AND author = \'ai\' AND created_at >= ?', id, new Date(base).toISOString());
    for (let i = 0; i < 20; i++) rpm.push(0);
    for (const r of recent) { const k = Math.min(19, Math.floor((new Date(r.created_at).getTime() - base) / 60e3)); if (k >= 0) rpm[k]++; }
    const closers = db.all('SELECT id, name, template, active, replies FROM closers WHERE workspace_id = ? ORDER BY id', id).map(c => ({ ...c, active: !!c.active, today: q('SELECT COUNT(*) n FROM messages m JOIN threads t ON t.id = m.thread_id WHERE m.workspace_id = ? AND m.author = \'ai\' AND m.created_at >= ? AND json_extract(m.meta, \'$.closer_id\') = ?', id, t0, c.id) }));
    const hotLeads = db.all('SELECT c.id, c.name, c.username, c.heat, c.stage, c.last_seen, (SELECT t.id FROM threads t WHERE t.contact_id = c.id ORDER BY t.last_message_at DESC LIMIT 1) thread_id, (SELECT t.last_text FROM threads t WHERE t.contact_id = c.id ORDER BY t.last_message_at DESC LIMIT 1) last_text FROM contacts c WHERE c.workspace_id = ? AND c.heat IN (\'hot\',\'warm\') AND c.stage != \'won\' ORDER BY CASE c.heat WHEN \'hot\' THEN 0 ELSE 1 END, c.last_seen DESC LIMIT 6', id);
    return { today: { chats: chatsToday, replies: repliesToday, handoffs, hot, won: wonToday }, series: Object.entries(series).map(([d, v]) => ({ d, ...v })), stages, rpm, closers, hot_leads: hotLeads, usage: ws.usage(req.ws), total_contacts: q('SELECT COUNT(*) n FROM contacts WHERE workspace_id = ?', id) };
  });

  app.get('/api/app/live', W, req => {
    const after = int(req.query.after);
    const events = db.all('SELECT id, type, text, data, created_at FROM events WHERE workspace_id = ? AND id > ? ORDER BY id DESC LIMIT 30', req.ws.id, after).map(e => ({ ...e, data: db.json(e.data, {}) }));
    const afterMsg = int(req.query.after_msg);
    const messages = db.all('SELECT m.id, m.thread_id, m.dir, m.author, m.kind, m.text, m.meta, m.created_at, c.name contact, t.closer_id FROM messages m JOIN threads t ON t.id = m.thread_id JOIN contacts c ON c.id = t.contact_id WHERE m.workspace_id = ? AND m.id > ? ORDER BY m.id DESC LIMIT 40', req.ws.id, afterMsg).map(m => ({ ...m, meta: db.json(m.meta, {}) }));
    const unread = db.one('SELECT COALESCE(SUM(unread),0) n FROM threads WHERE workspace_id = ?', req.ws.id).n;
    const w = ws.get(req.ws.id);
    return { events, messages, unread, credits: w.credits, conv_used: w.conv_used };
  });

  // ---------- closers ----------
  app.get('/api/app/closers', W, req => db.all('SELECT * FROM closers WHERE workspace_id = ? ORDER BY id', req.ws.id).map(c => closerOut(c, true)));
  app.post('/api/app/closers', M, req => {
    const u = ws.usage(req.ws);
    if (u.closers_used >= u.closers_limit) throw new HttpError(402, 'Your Closer team is full on this plan.', { code: 'closer_limit' });
    const c = cleanCloser(req.body || {});
    const id = db.insert('closers', { ...c, workspace_id: req.ws.id, active: (req.body || {}).active === false ? 0 : 1, created_at: db.now(), updated_at: db.now() });
    training.saveVersion(db.one('SELECT * FROM closers WHERE id = ?', id), req.user.id, 'Created');
    const chId = int((req.body || {}).channel_id);
    if (chId && db.one('SELECT id FROM channels WHERE id = ? AND workspace_id = ?', chId, req.ws.id)) db.update('channels', chId, { closer_id: id });
    ws.event(req.ws.id, 'closer', c.name + ' joined your team', { closer_id: id });
    if (u.closers_used === 0) mailer.send(req.user.email, 'closer-launched', { name: first(req.user.name), closer_name: c.name, channel: 'Telegram', studio_url: config.appUrl + '/app/studio?id=' + id });
    return closerOut(db.one('SELECT * FROM closers WHERE id = ?', id));
  });
  app.put('/api/app/closers/:id', M, req => {
    const c = getClosed(req, req.params.id);
    const b = req.body || {};
    if (Object.keys(b).length === 1 && 'active' in b) { db.update('closers', c.id, { active: b.active ? 1 : 0, updated_at: db.now() }); return closerOut(db.one('SELECT * FROM closers WHERE id = ?', c.id)); }
    const data = cleanCloser({ ...closerOut(c), ...b }, { ...c, skills: db.json(c.skills, {}) });
    if (b.active !== undefined) data.active = b.active ? 1 : 0;
    db.update('closers', c.id, { ...data, updated_at: db.now() });
    training.saveVersion(db.one('SELECT * FROM closers WHERE id = ?', c.id), req.user.id, str(b.version_label, 60) || 'Saved');
    if (b.channel_id !== undefined) {
      const chId = int(b.channel_id);
      if (chId && db.one('SELECT id FROM channels WHERE id = ? AND workspace_id = ?', chId, req.ws.id)) db.update('channels', chId, { closer_id: c.id });
    }
    return closerOut(db.one('SELECT * FROM closers WHERE id = ?', c.id));
  });
  app.del('/api/app/closers/:id', M, req => {
    const c = getClosed(req, req.params.id);
    db.run('UPDATE channels SET closer_id = NULL WHERE closer_id = ?', c.id);
    db.run('UPDATE threads SET closer_id = NULL WHERE closer_id = ?', c.id);
    db.run('DELETE FROM closers WHERE id = ?', c.id);
    return { ok: true };
  });
  // Test chat. Uses the unsaved draft (persona, rules, instructions, notes) plus, with closer_id,
  // the Closer's saved structured knowledge. With scenario {key, expect} the run is checked and recorded.
  app.post('/api/app/closers/preview', W, aiLimit, async req => {
    const b = req.body || {};
    const c = cleanCloser(b);
    const closer = { ...c, persona: JSON.parse(c.persona), skills: JSON.parse(c.skills), rules: c.rules ? JSON.parse(c.rules) : {}, items: [] };
    let saved = null;
    if (int(b.closer_id)) {
      saved = getClosed(req, b.closer_id);
      closer.id = saved.id;
      closer.items = training.loadItems(saved.id, true);
      if (b.rules === undefined) closer.rules = db.json(saved.rules, {});
    }
    const out = await ai.reply({ closer, business: req.ws.name, history: (Array.isArray(b.history) ? b.history : []).slice(-8).map(h => ({ role: h && h.role === 'assistant' ? 'assistant' : 'user', text: str(h && h.text, 1000) })), message: str(b.message, 1000) });
    const res = { text: out.text, handoff: out.handoff, demo: !config.ai.key, sources: out.sources || [], used: out.used || null };
    const sc = b.scenario && typeof b.scenario === 'object' ? b.scenario : null;
    if (sc) {
      res.check = training.checkScenario(str(sc.expect, 20), out, closer.rules);
      if (saved) {
        const tr = db.json(saved.training, {});
        tr.runs = tr.runs || {};
        tr.runs[str(sc.key, 40).replace(/[^\w-]/g, '') || 'custom'] = { at: db.now(), pass: res.check.pass, note: res.check.note, reply: out.text.slice(0, 300) };
        const keys = Object.keys(tr.runs); if (keys.length > 40) delete tr.runs[keys[0]];
        db.update('closers', saved.id, { training: JSON.stringify(tr) });
      }
    }
    return res;
  });
  app.post('/api/app/closers/slot', M, req => {
    const b = settings.get('billing');
    const cost = b.extra_closer_credits || 150;
    if (!ws.spendCredits(req.ws.id, cost, 'Extra Closer slot (30 days)')) throw new HttpError(402, 'You need ' + cost + ' credits for an extra Closer. Top up your Voo Wallet first.', { code: 'no_credits' });
    payments.applyAddon(ws.get(req.ws.id), 'extra-closer', 'credits');
    return { ok: true };
  });

  // ---------- channels ----------
  app.get('/api/app/channels', W, req => db.all('SELECT * FROM channels WHERE workspace_id = ? AND status != \'deleted\' ORDER BY id', req.ws.id).map(channelOut));
  app.post('/api/app/channels/telegram', M, rateLimit('tg-connect', 20, 3600e3), async req => {
    if (settings.channel('telegram_bot') !== 'live') throw new HttpError(403, 'Telegram connections are paused right now.');
    const b = req.body || {};
    const botToken = str(b.token, 100).replace(/\s/g, '');
    if (!/^\d{5,}:[A-Za-z0-9_-]{30,}$/.test(botToken)) throw new HttpError(400, 'That doesn’t look like a bot token. It should look like 123456789:AAH... from @BotFather.');
    let me;
    try { me = await tg.call(botToken, 'getMe'); } catch (e) { throw new HttpError(400, 'Telegram rejected that token: ' + e.message); }
    const existing = db.one('SELECT * FROM channels WHERE external_id = ? AND type = \'telegram_bot\' AND status != \'deleted\'', String(me.id));
    if (existing && existing.workspace_id !== req.ws.id) throw new HttpError(409, 'This bot is already connected to another Replyvoo workspace.');
    // One Telegram bot or account per Closer on the plan (Spark: 1). Reconnecting an existing bot is always fine.
    if (!existing) {
      const tgUsed = db.one("SELECT COUNT(*) n FROM channels WHERE workspace_id = ? AND type IN ('telegram_bot', 'telegram_business') AND status = 'active'", req.ws.id).n;
      const tgMax = Math.max(1, ws.limits(req.ws).closers);
      if (tgUsed >= tgMax) throw new HttpError(402, 'Your plan allows ' + tgMax + ' Telegram bot' + (tgMax === 1 ? '' : 's') + ' or account' + (tgMax === 1 ? '' : 's') + '. Upgrade your plan or add an Extra Closer to connect more.', { code: 'channel_limit' });
    }
    const secret = token(24).replace(/[^A-Za-z0-9_-]/g, '');
    const closerId = int(b.closer_id) && db.one('SELECT id FROM closers WHERE id = ? AND workspace_id = ?', int(b.closer_id), req.ws.id) ? int(b.closer_id) : (db.one('SELECT id FROM closers WHERE workspace_id = ? ORDER BY id LIMIT 1', req.ws.id) || {}).id || null;
    let id;
    if (existing) { id = existing.id; db.update('channels', id, { token_enc: encrypt(botToken), webhook_secret: secret, name: me.first_name, username: me.username || '', status: 'active', closer_id: closerId || existing.closer_id }); }
    else id = db.insert('channels', { workspace_id: req.ws.id, type: 'telegram_bot', name: me.first_name, username: me.username || '', external_id: String(me.id), token_enc: encrypt(botToken), webhook_secret: secret, closer_id: closerId, data: JSON.stringify({ can_join_groups: me.can_join_groups, business: me.can_connect_to_business || false }), created_at: db.now() });
    const hook = config.appUrl + '/webhooks/telegram/' + id;
    try {
      await tg.call(botToken, 'setWebhook', { url: hook, secret_token: secret, allowed_updates: ['message', 'business_connection', 'business_message', 'my_chat_member'], drop_pending_updates: true });
    } catch (e) {
      if (config.isProd) throw new HttpError(400, 'Connected, but Telegram could not reach ' + hook + '. Check APP_URL and HTTPS. (' + e.message + ')');
    }
    ws.event(req.ws.id, 'channel', '@' + (me.username || me.first_name) + ' is connected', { channel_id: id });
    return channelOut(db.one('SELECT * FROM channels WHERE id = ?', id));
  });
  app.get('/api/app/channels/:id', W, req => channelOut(getChannel(req, req.params.id)));
  app.put('/api/app/channels/:id', M, req => {
    const c = db.one('SELECT * FROM channels WHERE id = ? AND workspace_id = ?', int(req.params.id), req.ws.id);
    if (!c) throw new HttpError(404, 'Channel not found');
    const b = req.body || {};
    if (c.type === 'website' && (b.widget !== undefined || b.domains !== undefined || b.name !== undefined)) {
      const d = db.json(c.data, {});
      const patch = {};
      if (b.widget !== undefined) d.widget = web.cleanWidget(b.widget, d.widget || web.defaults(req.ws.name), ws.limits(req.ws));
      if (b.domains !== undefined) d.domains = web.cleanDomains(b.domains);
      if (b.name !== undefined) patch.name = str(b.name, 60) || c.name;
      patch.data = JSON.stringify(d);
      db.update('channels', c.id, patch);
    }
    if (b.closer_id !== undefined) { const cid = int(b.closer_id); db.update('channels', c.id, { closer_id: cid && db.one('SELECT id FROM closers WHERE id = ? AND workspace_id = ?', cid, req.ws.id) ? cid : null }); }
    return channelOut(db.one('SELECT * FROM channels WHERE id = ?', c.id));
  });
  // Website chat: create a widget (plan-gated), upload its images.
  app.post('/api/app/channels/website', M, rateLimit('web-create', 30, 3600e3), req => {
    if (settings.channel('website') !== 'live') throw new HttpError(403, 'Website chat is switched off right now.');
    websiteLimit(req);
    const b = req.body || {};
    const name = str(b.name, 60) || req.ws.name + ' website';
    const domains = web.cleanDomains(Array.isArray(b.domains) ? b.domains : (b.domains ? String(b.domains).split(/[\s,]+/) : []));
    const closerId = int(b.closer_id) && db.one('SELECT id FROM closers WHERE id = ? AND workspace_id = ?', int(b.closer_id), req.ws.id) ? int(b.closer_id) : (db.one('SELECT id FROM closers WHERE workspace_id = ? AND active = 1 ORDER BY id LIMIT 1', req.ws.id) || {}).id || null;
    const widget = web.defaults(req.ws.name, '');
    const id = db.insert('channels', { workspace_id: req.ws.id, type: 'website', name, username: '', external_id: web.newKey(), token_enc: '', webhook_secret: '', closer_id: closerId, data: JSON.stringify({ widget, domains }), created_at: db.now() });
    ws.event(req.ws.id, 'channel', 'Website chat “' + name + '” is ready to install', { channel_id: id });
    return channelOut(db.one('SELECT * FROM channels WHERE id = ?', id));
  });
  app.post('/api/app/channels/:id/upload', M, rateLimit('web-upload', 60, 3600e3), req => {
    const c = getChannel(req, req.params.id);
    if (c.type !== 'website') throw new HttpError(400, 'Images can only be added to website chat widgets.');
    const b = req.body || {};
    const kind = String(b.kind || '');
    if (!web.ASSET_KINDS.includes(kind)) throw new HttpError(400, 'Choose logo, avatar or launcher.');
    const d = db.json(c.data, {});
    d.widget = { ...web.defaults(req.ws.name), ...(d.widget || {}) };
    d.widget.assets = { ...(d.widget.assets || {}) };
    if (b.data_url === null || b.remove) {
      db.run('DELETE FROM widget_assets WHERE channel_id = ? AND kind = ?', c.id, kind);
      delete d.widget.assets[kind];
      if (kind === 'avatar') d.widget.avatar_mode = 'initials';
    } else {
      const { mime, buf } = web.parseUpload(b.data_url);
      db.run('INSERT INTO widget_assets (channel_id, kind, mime, data, updated_at) VALUES (?, ?, ?, ?, ?) ON CONFLICT(channel_id, kind) DO UPDATE SET mime = excluded.mime, data = excluded.data, updated_at = excluded.updated_at', c.id, kind, mime, buf, db.now());
      d.widget.assets[kind] = Date.now().toString(36);
      if (kind === 'avatar') d.widget.avatar_mode = 'upload';
    }
    db.update('channels', c.id, { data: JSON.stringify(d) });
    return channelOut(db.one('SELECT * FROM channels WHERE id = ?', c.id));
  });
  app.del('/api/app/channels/:id', M, async req => {
    const c = db.one('SELECT * FROM channels WHERE id = ? AND workspace_id = ?', int(req.params.id), req.ws.id);
    if (!c) throw new HttpError(404, 'Channel not found');
    if (c.type === 'telegram_bot') { try { await tg.call(decrypt(c.token_enc), 'deleteWebhook', {}); } catch {} }
    db.update('channels', c.id, { status: 'deleted', token_enc: '' });
    db.run('UPDATE channels SET status = \'deleted\' WHERE workspace_id = ? AND json_extract(data, \'$.bot_channel_id\') = ?', req.ws.id, c.id);
    return { ok: true };
  });
  app.post('/api/app/waitlist', W, req => {
    const item = str((req.body || {}).item, 40);
    if (!/^[a-z0-9_-]+$/.test(item)) throw new HttpError(400, 'Bad item');
    db.run('INSERT OR IGNORE INTO waitlist (workspace_id, email, item, created_at) VALUES (?, ?, ?, ?)', req.ws.id, req.user.email, item, db.now());
    return { ok: true };
  });

  // ---------- inbox ----------
  app.get('/api/app/threads', W, req => {
    const f = str(req.query.filter, 20);
    const where = ['t.workspace_id = ?']; const p = [req.ws.id];
    if (f === 'hot') where.push('c.heat = \'hot\'');
    if (f === 'handoff') where.push('(t.status = \'handoff\' OR t.ai_on = 0)');
    if (f === 'unread') where.push('t.unread > 0');
    if (req.query.q) { where.push('(c.name LIKE ? OR c.username LIKE ? OR t.last_text LIKE ?)'); const like = '%' + str(req.query.q, 60) + '%'; p.push(like, like, like); }
    return db.all('SELECT t.id, t.ai_on, t.status, t.unread, t.last_text, t.last_message_at, t.closer_id, t.channel_id, c.id contact_id, c.name, c.username, c.heat, c.stage, ch.type channel_type, ch.username channel_username, cl.name closer_name, cl.template closer_template FROM threads t JOIN contacts c ON c.id = t.contact_id JOIN channels ch ON ch.id = t.channel_id LEFT JOIN closers cl ON cl.id = t.closer_id WHERE ' + where.join(' AND ') + ' ORDER BY t.last_message_at DESC LIMIT 200', ...p);
  });
  app.get('/api/app/threads/:id', W, req => {
    const t = getThread(req, req.params.id);
    db.update('threads', t.id, { unread: 0 });
    const contact = db.one('SELECT * FROM contacts WHERE id = ?', t.contact_id);
    const ch = db.one('SELECT id, type, name, username FROM channels WHERE id = ?', t.channel_id);
    const page = ch && ch.type === 'website' ? db.one('SELECT json_extract(meta, \'$.page_url\') url, json_extract(meta, \'$.page_title\') title, created_at FROM messages WHERE thread_id = ? AND dir = \'in\' AND json_extract(meta, \'$.page_url\') IS NOT NULL AND json_extract(meta, \'$.page_url\') != \'\' ORDER BY id DESC LIMIT 1', t.id) : null;
    return { thread: { ...t, unread: 0 }, contact, channel: ch, page, messages: db.all('SELECT id, dir, author, kind, text, meta, created_at FROM messages WHERE thread_id = ? ORDER BY id DESC LIMIT 200', t.id).reverse().map(m => ({ ...m, meta: db.json(m.meta, {}) })) };
  });
  app.post('/api/app/threads/:id/messages', W, async req => {
    const t = getThread(req, req.params.id);
    const text = str((req.body || {}).text, 4000);
    if (!text) throw new HttpError(400, 'Write a message first.');
    try { await engine.humanReply(t, req.user, text); } catch (e) { throw new HttpError(502, 'Telegram did not accept the message: ' + e.message); }
    return { ok: true };
  });
  app.put('/api/app/threads/:id', W, req => {
    const t = getThread(req, req.params.id);
    const b = req.body || {};
    const patch = {};
    if (b.ai_on !== undefined) { patch.ai_on = b.ai_on ? 1 : 0; if (b.ai_on) patch.status = 'open'; engine.addMessage(t, 'note', 'system', b.ai_on ? 'AI replies switched back on by ' + first(req.user.name) : first(req.user.name) + ' took over this chat'); }
    if (b.status && ['open', 'handoff', 'closed'].includes(b.status)) patch.status = b.status;
    if (b.closer_id !== undefined) { const cid = int(b.closer_id); patch.closer_id = cid && db.one('SELECT id FROM closers WHERE id = ? AND workspace_id = ?', cid, req.ws.id) ? cid : null; }
    db.update('threads', t.id, patch);
    return { ok: true };
  });

  // ---------- leads ----------
  app.get('/api/app/contacts', W, req => db.all('SELECT c.*, (SELECT t.id FROM threads t WHERE t.contact_id = c.id ORDER BY t.last_message_at DESC LIMIT 1) thread_id, (SELECT t.last_text FROM threads t WHERE t.contact_id = c.id ORDER BY t.last_message_at DESC LIMIT 1) last_text FROM contacts c WHERE c.workspace_id = ? ORDER BY c.last_seen DESC LIMIT 400', req.ws.id));
  app.put('/api/app/contacts/:id', W, req => {
    const c = db.one('SELECT * FROM contacts WHERE id = ? AND workspace_id = ?', int(req.params.id), req.ws.id);
    if (!c) throw new HttpError(404, 'Lead not found');
    const b = req.body || {}; const patch = {};
    if (['new', 'qualified', 'checkout', 'won', 'lost'].includes(b.stage)) patch.stage = b.stage;
    if (['cold', 'warm', 'hot', 'won'].includes(b.heat)) patch.heat = b.heat;
    if (b.notes != null) patch.notes = str(b.notes, 2000);
    if (b.value != null) patch.value = Math.max(0, Number(b.value) || 0);
    if (b.blocked != null) patch.blocked = b.blocked ? 1 : 0;
    db.update('contacts', c.id, patch);
    if (patch.stage === 'won' && c.stage !== 'won') {
      // A sale the team closed by hand still counts in reports and on VooSquare.
      ws.event(req.ws.id, 'won', (c.name || 'A customer') + ' was marked as won', { contact_id: c.id });
      const ch = db.one('SELECT type FROM channels WHERE id = ?', c.channel_id);
      require('../services/voosquare').safeEmit(req.ws.id, 'sale_closed', { channel: ch && ch.type, valueUsd: patch.value != null ? patch.value : c.value });
    }
    return { ok: true };
  });

  // ---------- blast ----------
  const { segmentRecipients } = require('../services/blast');
  app.get('/api/app/blasts', W, req => ({
    blasts: db.all('SELECT * FROM blasts WHERE workspace_id = ? ORDER BY id DESC LIMIT 50', req.ws.id),
    segments: ['all', 'hot', 'no_buy', 'quiet', 'won'].map(s => ({ id: s, count: segmentRecipients(req.ws.id, s).length }))
  }));
  app.post('/api/app/blasts', M, req => {
    if (!settings.feature('blast')) throw new HttpError(403, 'Blasts are switched off right now.');
    const b = req.body || {};
    const message = str(b.message, 3500);
    if (message.length < 2) throw new HttpError(400, 'Write your message first.');
    const seg = ['all', 'hot', 'no_buy', 'quiet', 'won'].includes(b.segment) ? b.segment : 'all';
    const rec = segmentRecipients(req.ws.id, seg);
    if (!rec.length) throw new HttpError(400, 'Nobody is in that group yet.');
    const per = settings.get('billing').blast_people_per_credit || 10;
    const cost = Math.ceil(rec.length / per);
    const when = b.scheduled_at && new Date(b.scheduled_at) > new Date() ? new Date(b.scheduled_at).toISOString() : db.now();
    if (!ws.spendCredits(req.ws.id, cost, 'Blast to ' + rec.length + ' people')) throw new HttpError(402, 'This Blast needs ' + cost + ' credits. Top up your Voo Wallet first.', { code: 'no_credits' });
    const id = db.insert('blasts', { workspace_id: req.ws.id, segment: seg, message, total: rec.length, credits: cost, scheduled_at: when, created_at: db.now() });
    ws.event(req.ws.id, 'blast', 'Blast scheduled for ' + rec.length + ' people', { blast_id: id });
    return { ok: true, id, total: rec.length, credits: cost };
  });
  app.post('/api/app/blasts/draft', W, aiLimit, async req => {
    const goal = str((req.body || {}).goal, 300) || 'bring back people who chatted but did not buy';
    const fallback = 'Hey! Your picks are still waiting for you. Reply here and we’ll help you finish your order today.';
    if (!config.ai.key) return { text: fallback, demo: true };
    try {
      const out = await ai.reply({ closer: { name: 'Juno', template: 'win', persona: { tone: 30, length: 30, emoji: 50 }, skills: { handoff: false }, knowledge: '' }, business: req.ws.name, message: 'Write one short Telegram broadcast message (max 40 words, no hashtags) for this goal: ' + goal + '. Output only the message.' });
      return { text: out.text };
    } catch { return { text: fallback }; }
  });

  // ---------- juno ----------
  app.post('/api/app/juno', W, rateLimit('juno', 60, 3600e3), async req => {
    if (!settings.feature('juno')) throw new HttpError(403, 'Juno is switched off right now.');
    const qn = str((req.body || {}).question, 600);
    if (!qn) throw new HttpError(400, 'Ask Juno something.');
    const id = req.ws.id;
    const t0 = new Date(); t0.setHours(0, 0, 0, 0);
    const snap = {
      business: req.ws.name, plan: ws.usage(req.ws).plan.name, conversations_used: req.ws.conv_used, credits: req.ws.credits,
      chats_today: db.one('SELECT COUNT(DISTINCT thread_id) n FROM messages WHERE workspace_id = ? AND dir = \'in\' AND created_at >= ?', id, t0.toISOString()).n,
      ai_replies_today: db.one('SELECT COUNT(*) n FROM messages WHERE workspace_id = ? AND author = \'ai\' AND created_at >= ?', id, t0.toISOString()).n,
      waiting_for_human: db.all('SELECT c.name, t.last_text FROM threads t JOIN contacts c ON c.id = t.contact_id WHERE t.workspace_id = ? AND t.status = \'handoff\' ORDER BY t.last_message_at DESC LIMIT 5', id),
      hot_leads: db.all('SELECT name, stage, last_seen FROM contacts WHERE workspace_id = ? AND heat = \'hot\' ORDER BY last_seen DESC LIMIT 8', id),
      stages: db.all('SELECT stage, COUNT(*) n FROM contacts WHERE workspace_id = ? GROUP BY stage', id),
      recent_customer_questions: db.all('SELECT text FROM messages WHERE workspace_id = ? AND dir = \'in\' AND length(text) > 8 ORDER BY id DESC LIMIT 25', id).map(r => r.text.slice(0, 160)),
      closers: db.all('SELECT name, template, active, replies FROM closers WHERE workspace_id = ?', id)
    };
    let answer = null;
    try { answer = await ai.juno(qn, snap); } catch (e) { console.warn('[juno]', e.message); }
    if (!answer) {
      const hot = snap.hot_leads.map(h => h.name || 'someone').slice(0, 3);
      answer = 'Today you had ' + snap.chats_today + ' chats and your Closers sent ' + snap.ai_replies_today + ' replies. ' + (hot.length ? 'Your hottest leads right now: ' + hot.join(', ') + '. ' : 'No hot leads yet today. ') + (snap.waiting_for_human.length ? snap.waiting_for_human.length + ' chat(s) are waiting for a human in Pulse Inbox.' : 'Nobody is waiting for a human.') + (config.ai.key ? '' : ' (Add an AI key for smarter answers.)');
    }
    return { answer };
  });

  // ---------- wallet, billing ----------
  app.get('/api/app/wallet', W, req => {
    const id = req.ws.id;
    const since = new Date(Date.now() - 30 * 864e5).toISOString();
    return {
      credits: ws.get(id).credits, auto_topup: !!req.ws.auto_topup, auto_topup_pack: req.ws.settings.auto_topup_pack || null, has_saved_card: !!req.ws.settings.paystack_auth,
      tx: db.all('SELECT id, amount, balance, reason, ref, created_at FROM credit_tx WHERE workspace_id = ? ORDER BY id DESC LIMIT 60', id),
      spend: db.all('SELECT reason, -SUM(amount) n FROM credit_tx WHERE workspace_id = ? AND amount < 0 AND created_at >= ? GROUP BY reason ORDER BY n DESC', id, since),
      orders: db.all('SELECT ref, kind, item_name, amount_usd, currency, amount_local, provider, status, created_at, paid_at, meta FROM orders WHERE workspace_id = ? ORDER BY id DESC LIMIT 30', id).map(orderOut)
    };
  });
  app.post('/api/app/checkout/preview', W, req => payments.preview(req.ws.id, req.body || {}, req.user.country));
  app.post('/api/app/checkout', M, rateLimit('checkout', 30, 3600e3), req => payments.checkout(req.ws.id, req.user, req.body || {}));
  app.get('/api/app/orders/:ref', W, async req => {
    const o = db.one('SELECT * FROM orders WHERE ref = ? AND workspace_id = ?', str(req.params.ref, 60), req.ws.id);
    if (!o) throw new HttpError(404, 'Order not found');
    if (o.status === 'pending' && ['paystack', 'flutterwave', 'gatevoo'].includes(o.provider)) { try { await payments.verify(o.ref); } catch (e) { console.warn('[verify]', e.message); } }
    const fresh = orderOut(db.one('SELECT ref, kind, item_name, amount_usd, currency, amount_local, provider, status, created_at, paid_at, meta FROM orders WHERE id = ?', o.id));
    return fresh;
  });

  // ---------- referrals ----------
  app.get('/api/app/squad', W, req => {
    const id = req.ws.id;
    const earned = db.one('SELECT COALESCE(SUM(credits),0) c, COALESCE(SUM(amount_usd),0) usd FROM referral_earnings WHERE referrer_ws = ?', id);
    const paying = db.one('SELECT COUNT(DISTINCT referee_ws) n FROM referral_earnings WHERE referrer_ws = ?', id).n;
    const tiers = settings.get('billing').referral_tiers;
    const board = db.all('SELECT w.id, w.name, COALESCE(SUM(r.amount_usd),0) usd FROM referral_earnings r JOIN workspaces w ON w.id = r.referrer_ws WHERE r.created_at >= ? GROUP BY w.id ORDER BY usd DESC LIMIT 5', new Date(Date.now() - 30 * 864e5).toISOString())
      .map((r, i) => ({ rank: i + 1, name: r.id === id ? 'You' : r.name.split(' ')[0] + ' ' + (r.name.split(' ')[1] || '').charAt(0), usd: r.usd, you: r.id === id }));
    return {
      link: config.appUrl + '/r/' + req.ws.ref_code, code: req.ws.ref_code,
      clicks: db.one('SELECT COUNT(*) n FROM clicks WHERE target = \'ref\' AND workspace_id = ?', id).n,
      signups: db.one('SELECT COUNT(*) n FROM workspaces WHERE referred_by = ?', id).n, paying, earned_credits: earned.c, earned_usd: earned.usd,
      rate: payments.referralRate(id), tiers, leaderboard: board, min_payout: Number(settings.get('billing').referral_min_payout_usd) || 300
    };
  });

  // ---------- team ----------
  app.get('/api/app/team', W, req => ({
    members: db.all('SELECT u.id, u.name, u.email, u.moji, u.last_login, m.role, m.created_at FROM members m JOIN users u ON u.id = m.user_id WHERE m.workspace_id = ? ORDER BY m.created_at', req.ws.id).map(m => ({ ...m, moji: db.json(m.moji, {}), replies: db.one("SELECT COUNT(*) n FROM messages WHERE workspace_id = ? AND author = 'human' AND json_extract(meta, '$.user_id') = ?", req.ws.id, m.id).n })),
    voo: require('../services/voosquare').enabled(),
    invites: db.all('SELECT id, email, role, created_at, expires_at FROM invites WHERE workspace_id = ? AND accepted_at IS NULL AND expires_at > ? ORDER BY id DESC', req.ws.id, db.now()),
    seats: ws.usage(req.ws).seats_limit
  }));
  app.post('/api/app/team/invite', M, rateLimit('invite', 30, 3600e3), req => {
    const b = req.body || {};
    const email = str(b.email, 200).toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) throw new HttpError(400, 'Enter a valid email address.');
    const u = ws.usage(req.ws);
    const pending = db.one('SELECT COUNT(*) n FROM invites WHERE workspace_id = ? AND accepted_at IS NULL AND expires_at > ?', req.ws.id, db.now()).n;
    if (db.one('SELECT m.user_id FROM members m JOIN users u ON u.id = m.user_id WHERE m.workspace_id = ? AND u.email = ?', req.ws.id, email)) throw new HttpError(409, email + ' is already on your team.');
    db.run('DELETE FROM invites WHERE workspace_id = ? AND email = ? AND accepted_at IS NULL', req.ws.id, email);
    const pendingNow = db.one('SELECT COUNT(*) n FROM invites WHERE workspace_id = ? AND accepted_at IS NULL AND expires_at > ?', req.ws.id, db.now()).n;
    if (u.seats_used + pendingNow >= u.seats_limit) throw new HttpError(402, 'All your team seats are used. Upgrade your plan or add a seat.', { code: 'seat_limit' });
    void pending;
    const role = b.role === 'admin' ? 'admin' : 'agent';
    const raw = token(32);
    db.insert('invites', { workspace_id: req.ws.id, email, role, token_hash: sha256(raw), invited_by: req.user.id, expires_at: new Date(Date.now() + 7 * 864e5).toISOString(), created_at: db.now() });
    mailer.send(email, 'team-invite', { inviter_name: req.user.name || 'Your teammate', workspace_name: req.ws.name, invite_url: config.appUrl + '/app/invite?token=' + raw });
    return { ok: true };
  });
  app.del('/api/app/team/:userId', M, req => {
    const uid = int(req.params.userId);
    const role = ws.memberRole(req.ws.id, uid);
    if (!role) throw new HttpError(404, 'Not a member');
    if (role === 'owner') throw new HttpError(400, 'The owner can’t be removed.');
    db.run('DELETE FROM members WHERE workspace_id = ? AND user_id = ?', req.ws.id, uid);
    return { ok: true };
  });
  // Change a teammate between Agent and Admin (the owner stays owner).
  app.put('/api/app/team/:userId', M, req => {
    const uid = int(req.params.userId);
    const role = ws.memberRole(req.ws.id, uid);
    if (!role) throw new HttpError(404, 'Not a member');
    if (role === 'owner') throw new HttpError(400, 'The owner’s role can’t be changed.');
    if (uid === req.user.id) throw new HttpError(400, 'You can’t change your own role.');
    const next = (req.body || {}).role === 'admin' ? 'admin' : 'agent';
    db.run('UPDATE members SET role = ? WHERE workspace_id = ? AND user_id = ?', next, req.ws.id, uid);
    return { ok: true, role: next };
  });
  app.post('/api/app/invites/:id/resend', M, rateLimit('invite', 30, 3600e3), req => {
    const inv = db.one('SELECT * FROM invites WHERE id = ? AND workspace_id = ? AND accepted_at IS NULL', int(req.params.id), req.ws.id);
    if (!inv) throw new HttpError(404, 'Invite not found');
    const raw = token(32);
    db.update('invites', inv.id, { token_hash: sha256(raw), expires_at: new Date(Date.now() + 7 * 864e5).toISOString() });
    mailer.send(inv.email, 'team-invite', { inviter_name: req.user.name || 'Your teammate', workspace_name: req.ws.name, invite_url: config.appUrl + '/app/invite?token=' + raw });
    return { ok: true };
  });
  app.del('/api/app/invites/:id', M, req => { db.run('DELETE FROM invites WHERE id = ? AND workspace_id = ?', int(req.params.id), req.ws.id); return { ok: true }; });

  // ---------- notifications ----------
  app.get('/api/app/notifications', W, req => db.all('SELECT id, type, text, created_at FROM events WHERE workspace_id = ? AND type IN (\'handoff\',\'hot\',\'won\',\'credits\',\'plan\',\'paused\',\'squad\',\'channel\',\'error\',\'lead\') ORDER BY id DESC LIMIT 40', req.ws.id));

  // ---------- data export ----------
  app.get('/api/app/export', M, req => {
    const id = req.ws.id;
    return { exported_at: db.now(), workspace: { id, name: req.ws.name }, contacts: db.all('SELECT name, username, email, phone, heat, stage, notes, value, created_at, last_seen FROM contacts WHERE workspace_id = ?', id), closers: db.all('SELECT name, template, instructions, knowledge, rules, created_at FROM closers WHERE workspace_id = ?', id),
      knowledge: db.all('SELECT k.kind, k.title, k.question, k.answer, k.data, k.enabled, c.name closer FROM closer_knowledge k JOIN closers c ON c.id = k.closer_id WHERE k.workspace_id = ? ORDER BY k.closer_id, k.id', id) };
  });

  require('./studio')(app, { getCloser: getClosed, closerOut });
};
