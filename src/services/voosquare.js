'use strict';
// VooSquare: the one account for every Zedapex tool.
// 1. Login: OpenID Connect (Authorization Code + PKCE) against VOO_ISSUER. Users are keyed by voo_id, never by email.
// 2. Summary: GET /api/voosquare/summary gives VooSquare the headline numbers for its dashboard card.
// 3. Events: key moments are queued in voo_outbox and posted (HMAC signed) by a background job, retried for 24 hours.
// 4. Referrals and links: voo_ref is stored once; links to other tools work only while the user keeps them switched on.
// VooSquare never takes or moves money. Payments, credits and wallets stay inside Replyvoo.
const crypto = require('node:crypto');
const config = require('../config');
const db = require('../db');
const { token, sha256, hmac, safeEqual, encrypt } = require('../lib/security');
const { HttpError } = require('../lib/http');

const TOOL = 'replyvoo';
const HOUR = 3600e3;
const cfg = { ...config.voo };
let disco = null; let jwks = null;

const enabled = () => !!(cfg.issuer && cfg.clientId);
const eventsOn = () => !!(cfg.webhookSecret && cfg.eventsUrl);
// Tests and the admin check point this at a different issuer without a restart.
function setConfig(patch) { Object.assign(cfg, patch); disco = null; jwks = null; }
function publicInfo() {
  return { enabled: enabled(), home_url: cfg.homeUrl, dashboard_url: cfg.homeUrl + '/#dashboard', referrals_url: cfg.homeUrl + '/#referrals', connected_url: cfg.homeUrl + '/#connected-tools' };
}

/* ---------------- OIDC ---------------- */
const b64u = buf => Buffer.from(buf).toString('base64url');

async function getJson(url, init) {
  let res;
  try { res = await fetch(url, init); } catch (e) { throw new HttpError(502, 'VooSquare could not be reached. Please try again in a moment.'); }
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new HttpError(502, 'VooSquare login failed: ' + (data.error_description || data.error || res.status));
  return data;
}

async function discovery() {
  if (disco && disco.at > Date.now() - HOUR) return disco.doc;
  const doc = await getJson(cfg.issuer + '/.well-known/openid-configuration');
  if (!doc.authorization_endpoint || !doc.token_endpoint || !doc.jwks_uri) throw new HttpError(502, 'VooSquare login is not set up correctly (discovery document incomplete).');
  disco = { at: Date.now(), doc };
  return doc;
}

async function keyFor(kid) {
  const find = () => jwks && jwks.keys.find(k => !kid || k.kid === kid);
  if (!jwks || jwks.at < Date.now() - HOUR || !find()) {
    const d = await discovery();
    jwks = { at: Date.now(), keys: (await getJson(d.jwks_uri)).keys || [] };
  }
  const k = find();
  if (!k) throw new HttpError(401, 'VooSquare login could not be verified (unknown signing key).');
  return crypto.createPublicKey({ key: k, format: 'jwk' });
}

// Verifies an ID token's signature, issuer, audience, expiry and nonce. Returns its claims.
async function verifyIdToken(idToken, nonce) {
  const parts = String(idToken || '').split('.');
  if (parts.length !== 3) throw new HttpError(401, 'VooSquare login could not be verified.');
  let header, claims;
  try { header = JSON.parse(Buffer.from(parts[0], 'base64url')); claims = JSON.parse(Buffer.from(parts[1], 'base64url')); } catch { throw new HttpError(401, 'VooSquare login could not be verified.'); }
  const algs = { RS256: ['sha256', {}], RS384: ['sha384', {}], RS512: ['sha512', {}], PS256: ['sha256', { padding: crypto.constants.RSA_PKCS1_PSS_PADDING, saltLength: 32 }], ES256: ['sha256', { dsaEncoding: 'ieee-p1363' }], ES384: ['sha384', { dsaEncoding: 'ieee-p1363' }] };
  const alg = algs[header.alg];
  if (!alg) throw new HttpError(401, 'VooSquare login uses an unsupported signature (' + header.alg + ').');
  const key = await keyFor(header.kid);
  const ok = crypto.verify(alg[0], Buffer.from(parts[0] + '.' + parts[1]), { key, ...alg[1] }, Buffer.from(parts[2], 'base64url'));
  if (!ok) throw new HttpError(401, 'VooSquare login could not be verified (bad signature).');
  const d = await discovery();
  const now = Math.floor(Date.now() / 1000);
  const aud = [].concat(claims.aud || []);
  if (claims.iss !== (d.issuer || cfg.issuer)) throw new HttpError(401, 'VooSquare login came from the wrong issuer.');
  if (!aud.includes(cfg.clientId) || (aud.length > 1 && claims.azp && claims.azp !== cfg.clientId)) throw new HttpError(401, 'VooSquare login was not meant for Replyvoo.');
  if (!claims.exp || claims.exp < now - 60) throw new HttpError(401, 'VooSquare login expired. Please try again.');
  if (claims.iat && claims.iat > now + 300) throw new HttpError(401, 'VooSquare login could not be verified (clock).');
  if (!nonce || !safeEqual(claims.nonce || '', nonce)) throw new HttpError(401, 'VooSquare login could not be verified (nonce).');
  if (!claims.sub) throw new HttpError(401, 'VooSquare login had no Voo ID.');
  return claims;
}

// Login state lives in a short-lived signed cookie, so nothing is stored before the user comes back.
const STATE_COOKIE = 'rv_voo';
const sign = v => v + '.' + hmac('voo-state:' + v).slice(0, 43);
function readState(raw) {
  const s = String(raw || ''); const i = s.lastIndexOf('.');
  if (i < 1 || !safeEqual(sign(s.slice(0, i)), s)) return null;
  try { const o = JSON.parse(Buffer.from(s.slice(0, i), 'base64url')); return o.t > Date.now() - 15 * 60e3 ? o : null; } catch { return null; }
}
const safeReturn = r => ((/^\/app(\/|\?|$)/.test(String(r || '')) || /^\/admin(\/|\?|$)/.test(String(r || ''))) && !/^\/app\/(login|signup|forgot|reset)/.test(r) && !String(r).startsWith('//') ? String(r).slice(0, 500) : '/app');

async function startLogin(req, res, { returnTo, signup } = {}) {
  const d = await discovery();
  const st = { s: token(18), n: token(18), v: token(32), r: safeReturn(returnTo), t: Date.now() };
  res.cookie(STATE_COOKIE, sign(b64u(JSON.stringify(st))), { maxAge: 900, path: '/auth/voosquare' });
  const q = new URLSearchParams({ response_type: 'code', client_id: cfg.clientId, redirect_uri: cfg.redirectUri, scope: 'openid email profile', state: st.s, nonce: st.n, code_challenge: b64u(crypto.createHash('sha256').update(st.v).digest()), code_challenge_method: 'S256' });
  if (signup) { q.set('screen_hint', 'signup'); q.set('prompt', 'login'); }
  return d.authorization_endpoint + (d.authorization_endpoint.includes('?') ? '&' : '?') + q.toString();
}

async function finishLogin(req, res) {
  const st = readState(req.cookies[STATE_COOKIE]);
  res.cookie(STATE_COOKIE, '', { maxAge: 0, path: '/auth/voosquare' });
  if (req.query.error) throw new HttpError(400, req.query.error === 'access_denied' ? 'Login was cancelled.' : 'VooSquare login failed: ' + String(req.query.error_description || req.query.error).slice(0, 160));
  if (!st || !req.query.code || !safeEqual(String(req.query.state || ''), st.s)) throw new HttpError(400, 'This login link expired or was opened in another browser. Please log in again.');
  const d = await discovery();
  const form = new URLSearchParams({ grant_type: 'authorization_code', code: String(req.query.code), redirect_uri: cfg.redirectUri, code_verifier: st.v, client_id: cfg.clientId });
  const headers = { 'Content-Type': 'application/x-www-form-urlencoded', Accept: 'application/json' };
  const methods = d.token_endpoint_auth_methods_supported || ['client_secret_basic'];
  if (cfg.clientSecret) {
    if (methods.includes('client_secret_basic')) headers.Authorization = 'Basic ' + Buffer.from(encodeURIComponent(cfg.clientId) + ':' + encodeURIComponent(cfg.clientSecret)).toString('base64');
    else form.set('client_secret', cfg.clientSecret);
  }
  const tok = await getJson(d.token_endpoint, { method: 'POST', headers, body: form.toString() });
  const claims = await verifyIdToken(tok.id_token, st.n);
  return { claims, idToken: tok.id_token, returnTo: st.r };
}

async function endSessionUrl(idToken) {
  if (!enabled()) return '/';
  try {
    const d = await discovery();
    if (!d.end_session_endpoint) return '/';
    const q = new URLSearchParams({ client_id: cfg.clientId, post_logout_redirect_uri: config.appUrl + '/' });
    if (idToken) q.set('id_token_hint', idToken);
    return d.end_session_endpoint + (d.end_session_endpoint.includes('?') ? '&' : '?') + q.toString();
  } catch { return '/'; }
}

/* ---------------- users ---------------- */
const cleanCountry = c => (/^[A-Za-z]{2}$/.test(String(c || '')) ? String(c).toUpperCase() : '');

// Finds the user for a Voo ID, or creates one (and their workspace) on first login.
// Accounts made before VooSquare (e.g. the seeded admin) are linked once, only when VooSquare
// says the email is verified and the account has no Voo ID yet. After that, voo_id is the only key.
function userFromClaims(claims, { needWorkspace = true } = {}) {
  const ws = require('./workspace');
  const vooId = String(claims.sub).slice(0, 200);
  const email = String(claims.email || '').trim().toLowerCase().slice(0, 200);
  const name = String(claims.name || claims.given_name || '').trim().slice(0, 80) || (email ? email.split('@')[0] : 'there');
  const country = cleanCountry(claims.country);
  const ref = String(claims.voo_ref || '').trim().slice(0, 64);
  return db.tx(() => {
    let u = db.one('SELECT * FROM users WHERE voo_id = ?', vooId);
    let isNew = false;
    if (!u && email && claims.email_verified !== false) {
      const legacy = db.one('SELECT * FROM users WHERE email = ? AND voo_id IS NULL', email);
      if (legacy) { db.update('users', legacy.id, { voo_id: vooId }); u = db.one('SELECT * FROM users WHERE id = ?', legacy.id); }
    }
    if (!u) {
      if (!email) throw new HttpError(400, 'Your Voo ID has no email address. Add one in VooSquare and try again.');
      if (db.one('SELECT id FROM users WHERE email = ?', email)) throw new HttpError(409, 'This email is already linked to another Voo ID. Contact support and we’ll sort it out.');
      const id = db.insert('users', { email, name, password_hash: '', email_verified: claims.email_verified === false ? 0 : 1, voo_id: vooId, referred_by: ref, country, moji: '{}', created_at: db.now() });
      u = db.one('SELECT * FROM users WHERE id = ?', id); isNew = true;
    } else {
      const patch = {};
      if (email && email !== u.email && !db.one('SELECT id FROM users WHERE email = ? AND id != ?', email, u.id)) patch.email = email;
      if (claims.name && name !== u.name) patch.name = name;
      if (country && country !== u.country) patch.country = country;
      if (claims.email_verified === true && !u.email_verified) patch.email_verified = 1;
      if (ref && !u.referred_by) patch.referred_by = ref; // stored once, never changed
      if (Object.keys(patch).length) { db.update('users', u.id, patch); u = { ...u, ...patch }; }
    }
    let wsId = null;
    if (needWorkspace && !db.one('SELECT workspace_id FROM members WHERE user_id = ? LIMIT 1', u.id)) {
      const w = ws.createWorkspace(u, (name.split(' ')[0] || 'My') + '’s business', { invited: !!u.referred_by, settings: { onboarding: true, alerts: { handoff: true, night_report: true, hot: true, low_credits: true } } });
      wsId = w.id; isNew = true;
    }
    return { user: u, isNew, workspaceId: wsId };
  });
}

/* ---------------- summary ---------------- */
const PERIODS = { '1d': 1, '7d': 7, '30d': 30 };
function summary(vooId, period) {
  const ws = require('./workspace');
  const days = PERIODS[period] || 1;
  const p = PERIODS[period] ? period : '1d';
  const u = vooId ? db.one('SELECT * FROM users WHERE voo_id = ?', String(vooId)) : null;
  if (!u) return { tool: TOOL, linked: false };
  const owned = db.all("SELECT w.id, w.plan_id, w.status FROM workspaces w JOIN members m ON m.workspace_id = w.id WHERE m.user_id = ? AND m.role = 'owner'", u.id);
  const base = { tool: TOOL, linked: true, period: p, open_url: config.appUrl + '/app' };
  if (!owned.length) return { ...base, status: 'none', metrics: [] };
  const ids = owned.map(w => w.id);
  const inWs = 'workspace_id IN (' + ids.map(() => '?').join(',') + ')';
  const now = Date.now(); const span = days * 864e5;
  const from = new Date(now - span).toISOString(); const prevFrom = new Date(now - 2 * span).toISOString();
  const answered = (a, b) => db.one('SELECT COUNT(DISTINCT thread_id) n FROM messages WHERE ' + inWs + " AND author = 'ai' AND created_at >= ? AND created_at < ?", ...ids, a, b).n || 0;
  const evts = (type, a, b) => db.one('SELECT COUNT(*) n FROM events WHERE ' + inWs + ' AND type = ? AND created_at >= ? AND created_at < ?', ...ids, type, a, b).n || 0;
  const salesUsd = (a, b) => Math.round(db.all('SELECT data FROM events WHERE ' + inWs + " AND type = 'won' AND created_at >= ? AND created_at < ?", ...ids, a, b)
    .reduce((s, e) => { const c = db.json(e.data, {}).contact_id; const r = c ? db.one('SELECT value FROM contacts WHERE id = ?', c) : null; return s + (r ? Number(r.value) || 0 : 0); }, 0) * 100) / 100;
  const nowIso = new Date(now + 1000).toISOString();
  const metric = (key, label, unit, fn) => {
    const cur = fn(from, nowIso); const prev = fn(prevFrom, from);
    const change = prev ? Math.round((cur - prev) / prev * 1000) / 10 : (cur ? 100 : 0);
    return { key, label, value: cur, unit, change_pct: change };
  };
  const plans = owned.map(w => ws.plan(w.plan_id));
  const status = owned.every(w => w.status !== 'active') ? 'paused' : plans.some(pl => pl && pl.price_month > 0) ? 'active' : 'trial';
  return {
    ...base, status,
    metrics: [
      metric('chats_answered', 'Chats answered', 'count', answered),
      metric('leads_qualified', 'Leads qualified', 'count', (a, b) => evts('hot', a, b)),
      metric('sales_closed', 'Sales closed', 'count', (a, b) => evts('won', a, b)),
      metric('sales_usd', 'Sales value', 'usd', salesUsd)
    ]
  };
}

function checkServiceKey(req) {
  const h = String(req.headers.authorization || '');
  const got = h.startsWith('Bearer ') ? h.slice(7).trim() : '';
  if (!cfg.serviceKey || !got || !safeEqual(got, cfg.serviceKey)) throw new HttpError(401, 'Invalid service key');
}

/* ---------------- events ---------------- */
const LABELS = {
  chat_answered: ch => 'Closer answered a ' + ch + ' chat',
  lead_qualified: ch => 'New hot lead on ' + ch,
  payment_link_sent: ch => 'Payment link sent on ' + ch,
  sale_closed: ch => 'Sale closed on ' + ch
};
const channelName = type => (type === 'website' ? 'website' : !type || /^telegram/.test(type) ? 'Telegram' : String(type).split('_')[0].replace(/^./, c => c.toUpperCase()));

// Queues an event for the workspace owner's Voo ID. Labels never carry customer names or contact details.
function emit(wsId, type, { label, channel, valueUsd } = {}) {
  if (!eventsOn()) return null;
  const o = db.one('SELECT u.voo_id FROM workspaces w JOIN users u ON u.id = w.owner_id WHERE w.id = ?', wsId);
  if (!o || !o.voo_id) return null;
  const body = { event_id: 'rv_' + Date.now().toString(36) + crypto.randomBytes(6).toString('hex'), tool: TOOL, voo_id: o.voo_id, type, occurred_at: new Date().toISOString(), label: String(label || (LABELS[type] ? LABELS[type](channelName(channel)) : type)).slice(0, 120) };
  if (valueUsd != null && Number(valueUsd) > 0) body.value_usd = Math.round(Number(valueUsd) * 100) / 100;
  db.insert('voo_outbox', { event_id: body.event_id, body: JSON.stringify(body), next_at: db.now(), created_at: db.now() });
  return body;
}
// Never lets an event problem break a reply or a payment.
function safeEmit(...a) { try { return emit(...a); } catch (e) { console.error('[voosquare] emit', e.message); return null; } }

const signBody = raw => crypto.createHmac('sha256', cfg.webhookSecret).update(raw).digest('hex');

// Background job: posts due events (up to 100 per call) and retries with backoff for 24 hours.
// Posts the due events for one destination (up to 100), retrying with backoff for 24 hours.
async function flushTo(url, rows) {
  const events = rows.map(r => { try { return JSON.parse(r.body); } catch { return null; } }).filter(Boolean);
  const raw = JSON.stringify(events.length === 1 ? events[0] : { events });
  let error = '';
  try {
    const res = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Voo-Signature': signBody(raw) }, body: raw, signal: AbortSignal.timeout(10000) });
    if (!res.ok) error = 'HTTP ' + res.status;
  } catch (e) { error = String(e.message || e).slice(0, 200); }
  const now = Date.now();
  db.tx(() => {
    for (const r of rows) {
      if (!error) { db.update('voo_outbox', r.id, { sent_at: db.now(), attempts: r.attempts + 1, last_error: '' }); continue; }
      const attempts = r.attempts + 1;
      const giveUp = now - new Date(r.created_at).getTime() > 24 * HOUR;
      const wait = Math.min(HOUR, 30e3 * 2 ** Math.min(attempts, 7));
      db.update('voo_outbox', r.id, { attempts, last_error: error, next_at: new Date(now + wait).toISOString(), failed_at: giveUp ? db.now() : null });
    }
  });
  return error ? { sent: 0, error } : { sent: rows.length };
}

// Background job: product events go to VOO_EVENTS_URL, support events to VOO_SUPPORT_EVENTS_URL.
async function flush() {
  if (!cfg.webhookSecret) return { sent: 0 };
  const rows = db.all('SELECT * FROM voo_outbox WHERE sent_at IS NULL AND failed_at IS NULL AND next_at <= ? ORDER BY id LIMIT 200', db.now());
  const groups = new Map();
  for (const r of rows) {
    const u = r.url || cfg.eventsUrl;
    let okBody = true; try { JSON.parse(r.body); } catch { okBody = false; }
    // Nowhere to send it, or a broken row: mark it failed so it never blocks the queue.
    if (!u || !okBody) { db.update('voo_outbox', r.id, { failed_at: db.now(), last_error: !u ? 'No events URL configured' : 'Unreadable event body' }); continue; }
    if (!groups.has(u)) groups.set(u, []); if (groups.get(u).length < 100) groups.get(u).push(r);
  }
  let sent = 0; let error = '';
  for (const [u, rs] of groups) { const out = await flushTo(u, rs); sent += out.sent; if (out.error) error = out.error; }
  db.run('DELETE FROM voo_outbox WHERE COALESCE(sent_at, failed_at) < ?', new Date(Date.now() - 7 * 24 * HOUR).toISOString());
  return error ? { sent, error } : { sent };
}

// Support desk events for VooSquare HQ (no customer contact details, only the ticket summary and staff Voo IDs).
function supportEvent(type, t) {
  if (!cfg.webhookSecret || !cfg.supportEventsUrl || !t) return null;
  const body = { event_id: 'rvs_' + Date.now().toString(36) + crypto.randomBytes(6).toString('hex'), tool: TOOL, type, occurred_at: new Date().toISOString(),
    ticket: { ref: t.ref, subject: String(t.subject || '').slice(0, 140), status: t.status, priority: t.priority, source: t.source, box: t.box ? { id: t.box.id, name: t.box.name } : null, assignee_voo_id: t.assignee ? t.assignee.voo_id : null, url: config.appUrl + '/admin/support/' + t.ref } };
  db.insert('voo_outbox', { event_id: body.event_id, body: JSON.stringify(body), url: cfg.supportEventsUrl, next_at: db.now(), created_at: db.now() });
  return body;
}
function safeSupportEvent(...a) { try { return supportEvent(...a); } catch (e) { console.error('[voosquare] support event', e.message); return null; } }

/* ---------------- links between tools ---------------- */
const LINKS = { 'castvoo-replyvoo': 'Castvoo → Replyvoo (replies to broadcasts)' };
function saveLink({ voo_id: vooId, link, key, enabled: on }) {
  if (!vooId || !LINKS[link]) throw new HttpError(400, 'Unknown link. Replyvoo supports: ' + Object.keys(LINKS).join(', '));
  const row = db.one('SELECT * FROM voo_links WHERE voo_id = ? AND link = ?', String(vooId), link);
  if (on === false) { if (row) db.update('voo_links', row.id, { enabled: 0, key_hash: '', key_enc: '', updated_at: db.now() }); return { link, enabled: false }; }
  if (!key || String(key).length < 24) throw new HttpError(400, 'A scoped key of at least 24 characters is required.');
  const patch = { key_hash: sha256(key), key_enc: encrypt(String(key)), enabled: 1, updated_at: db.now() };
  if (row) db.update('voo_links', row.id, patch); else db.insert('voo_links', { voo_id: String(vooId), link, ...patch });
  return { link, enabled: true };
}
function linkFor(req, link) {
  const h = String(req.headers.authorization || '');
  const got = h.startsWith('Bearer ') ? h.slice(7).trim() : '';
  const row = got ? db.one('SELECT * FROM voo_links WHERE key_hash = ? AND link = ? AND enabled = 1', sha256(got), link) : null;
  if (!row) throw new HttpError(401, 'This link is switched off or the key was revoked in VooSquare.');
  return row;
}
const listLinks = vooId => db.all('SELECT link, enabled, updated_at FROM voo_links WHERE voo_id = ?', String(vooId)).map(l => ({ ...l, enabled: !!l.enabled, name: LINKS[l.link] || l.link }));

module.exports = { supportEvent, safeSupportEvent, TOOL, enabled, eventsOn, setConfig, publicInfo, discovery, verifyIdToken, startLogin, finishLogin, endSessionUrl, safeReturn, userFromClaims, summary, checkServiceKey, emit, safeEmit, flush, signBody, saveLink, linkFor, listLinks, LINKS, STATE_COOKIE, cleanCountry };
