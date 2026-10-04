'use strict';
// VooSquare: Voo ID login (OIDC + PKCE against a fake issuer), summary API, signed events, links, onboarding.
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const crypto = require('node:crypto');
const h = require('./helpers');

let ctx, voo, issuer, iss;
const CLIENT = 'replyvoo-test';
const SERVICE_KEY = 'svc_' + 'k'.repeat(40);
const HOOK = 'whsec_test_secret';
const { privateKey, publicKey } = crypto.generateKeyPairSync('rsa', { modulusLength: 2048 });
const jwk = { ...publicKey.export({ format: 'jwk' }), kid: 'k1', alg: 'RS256', use: 'sig' };
const pending = new Map(); // code -> { claims, challenge }
const received = [];
let eventsStatus = 200;

const b64 = o => Buffer.from(JSON.stringify(o)).toString('base64url');
function sign(claims, key = privateKey) {
  const head = b64({ alg: 'RS256', kid: 'k1', typ: 'JWT' }) + '.' + b64(claims);
  return head + '.' + crypto.sign('sha256', Buffer.from(head), key).toString('base64url');
}

before(async () => {
  ctx = await h.boot();
  issuer = http.createServer((req, res) => {
    const u = new URL(req.url, iss);
    let body = '';
    req.on('data', c => { body += c; });
    req.on('end', () => {
      const json = (o, s = 200) => { res.writeHead(s, { 'Content-Type': 'application/json' }); res.end(JSON.stringify(o)); };
      if (u.pathname === '/.well-known/openid-configuration') return json({ issuer: iss, authorization_endpoint: iss + '/authorize', token_endpoint: iss + '/token', jwks_uri: iss + '/jwks', end_session_endpoint: iss + '/logout', token_endpoint_auth_methods_supported: ['client_secret_basic'] });
      if (u.pathname === '/jwks') return json({ keys: [jwk] });
      if (u.pathname === '/token') {
        const f = new URLSearchParams(body);
        const p = pending.get(f.get('code'));
        const basic = Buffer.from(String(req.headers.authorization || '').replace('Basic ', ''), 'base64').toString();
        if (!p || basic !== CLIENT + ':secret') return json({ error: 'invalid_grant' }, 400);
        const challenge = crypto.createHash('sha256').update(f.get('code_verifier') || '').digest('base64url');
        if (challenge !== p.challenge) return json({ error: 'invalid_grant', error_description: 'PKCE' }, 400);
        pending.delete(f.get('code'));
        return json({ access_token: 'at', token_type: 'Bearer', id_token: p.idToken || sign(p.claims) });
      }
      if (u.pathname === '/events') {
        received.push({ sig: req.headers['x-voo-signature'], body });
        res.writeHead(eventsStatus); return res.end();
      }
      res.writeHead(404); res.end();
    });
  });
  await new Promise(r => issuer.listen(0, '127.0.0.1', r));
  iss = 'http://127.0.0.1:' + issuer.address().port;
  voo = require('../src/services/voosquare');
});
after(async () => { await new Promise(r => issuer.close(r)); await ctx.close(); });

function enable() { voo.setConfig({ issuer: iss, clientId: CLIENT, clientSecret: 'secret', serviceKey: SERVICE_KEY, webhookSecret: HOOK, eventsUrl: iss + '/events', redirectUri: 'http://localhost:3000/auth/voosquare/callback' }); }
function disable() { voo.setConfig({ issuer: '', clientId: '', webhookSecret: '' }); }

// Runs the whole browser round trip: /auth/voosquare → (VooSquare) → /auth/voosquare/callback.
async function vooLogin(c, claims, { returnTo, tamper } = {}) {
  const start = await c.get('/auth/voosquare' + (returnTo ? '?return_to=' + encodeURIComponent(returnTo) : ''));
  assert.equal(start.status, 302);
  const auth = new URL(start.location);
  assert.equal(auth.origin + auth.pathname, iss + '/authorize');
  assert.equal(auth.searchParams.get('code_challenge_method'), 'S256');
  const code = 'code_' + crypto.randomBytes(6).toString('hex');
  const now = Math.floor(Date.now() / 1000);
  const full = { iss, aud: CLIENT, iat: now, exp: now + 300, nonce: auth.searchParams.get('nonce'), email_verified: true, ...claims };
  let idToken;
  if (tamper === 'signature') idToken = sign(full, crypto.generateKeyPairSync('rsa', { modulusLength: 2048 }).privateKey);
  if (tamper === 'nonce') idToken = sign({ ...full, nonce: 'other' });
  if (tamper === 'audience') idToken = sign({ ...full, aud: 'someone-else' });
  pending.set(code, { claims: full, challenge: auth.searchParams.get('code_challenge'), idToken });
  return c.get('/auth/voosquare/callback?code=' + code + '&state=' + encodeURIComponent(tamper === 'state' ? 'wrong' : auth.searchParams.get('state')));
}

test('switched off: password login works and /auth/voosquare falls back', async () => {
  disable();
  const c = h.client();
  assert.equal((await c.get('/auth/voosquare')).location, '/app/login');
  assert.equal((await c.get('/app/login')).status, 200);
  assert.equal((await c.get('/api/public/site')).body.voo.enabled, false);
  await h.login(h.DEMO.email, h.DEMO.password);
});

test('switched on: login and sign-up pages go to VooSquare', async () => {
  enable();
  const c = h.client();
  assert.equal((await c.get('/app/login')).location, '/auth/voosquare');
  const su = await c.get('/app/signup?plan=pro&interval=year');
  assert.match(su.location, /^\/auth\/voosquare\?/);
  const q = new URLSearchParams(su.location.split('?')[1]);
  assert.equal(q.get('signup'), '1');
  assert.equal(q.get('return_to'), '/app/plan?checkout=pro&interval=year');
  assert.equal((await c.get('/app/forgot')).location, '/auth/voosquare');
  assert.equal((await c.get('/app')).status, 200); // the dashboard itself still loads
  assert.equal((await c.get('/api/public/site')).body.voo.enabled, true);
});

test('first Voo ID login creates the user and workspace, keyed by voo_id', async () => {
  enable();
  const c = h.client();
  const r = await vooLogin(c, { sub: 'voo_user_1', email: 'Ada@Example.com', name: 'Ada Stone', country: 'ng', voo_ref: 'FRIEND1' });
  assert.equal(r.status, 302);
  assert.equal(r.location, '/app/welcome');
  const u = ctx.db.one('SELECT * FROM users WHERE voo_id = ?', 'voo_user_1');
  assert.equal(u.email, 'ada@example.com');
  assert.equal(u.country, 'NG');
  assert.equal(u.referred_by, 'FRIEND1');
  assert.equal(u.password_hash, '');
  const w = ctx.db.one('SELECT * FROM workspaces WHERE owner_id = ?', u.id);
  assert.ok(w);
  assert.equal(JSON.parse(w.settings).onboarding, true);
  const me = await c.get('/api/auth/me');
  assert.equal(me.body.user.email, 'ada@example.com');
  assert.equal(me.body.user.voo, true);
  assert.equal(me.body.user.country, 'NG');
  const boot = await c.get('/api/app/bootstrap');
  assert.equal(boot.body.onboarding, true);
  assert.equal(boot.body.voo.linked, true);
  // Onboarding finishes the setup the old sign-up form used to collect.
  const ob = await c.post('/api/auth/onboard', { business: 'Ada Wigs', niche: 'Beauty and fashion', team: 'Just me', moji: { gender: 'female', skin: 2 } });
  assert.equal(ob.status, 200);
  const w2 = ctx.db.one('SELECT * FROM workspaces WHERE id = ?', w.id);
  assert.equal(w2.name, 'Ada Wigs');
  assert.equal(JSON.parse(w2.settings).onboarding, false);
  assert.equal(JSON.parse(w2.settings).niche, 'Beauty and fashion');
});

test('later logins find the same user by voo_id even after an email change; voo_ref never changes', async () => {
  enable();
  const c = h.client();
  const r = await vooLogin(c, { sub: 'voo_user_1', email: 'ada.new@example.com', name: 'Ada Stone', voo_ref: 'SOMEONE_ELSE' }, { returnTo: '/app/inbox' });
  assert.equal(r.location, '/app/inbox');
  const rows = ctx.db.all('SELECT * FROM users WHERE voo_id = ?', 'voo_user_1');
  assert.equal(rows.length, 1);
  assert.equal(rows[0].email, 'ada.new@example.com');
  assert.equal(rows[0].referred_by, 'FRIEND1');
  assert.equal(ctx.db.all('SELECT id FROM workspaces WHERE owner_id = ?', rows[0].id).length, 1);
});

test('unsafe return_to values land on /app', async () => {
  enable();
  for (const bad of ['https://evil.example', '//evil.example', '/adminx', '/app/login']) {
    const r = await vooLogin(h.client(), { sub: 'voo_user_1', email: 'ada.new@example.com' }, { returnTo: bad });
    assert.equal(r.location, '/app', bad);
  }
});

test('bad state, signature, nonce or audience are rejected', async () => {
  enable();
  for (const [tamper, status] of [['state', 400], ['signature', 401], ['nonce', 401], ['audience', 401]]) {
    const c = h.client();
    const r = await vooLogin(c, { sub: 'voo_attacker', email: 'x@example.com' }, { tamper });
    assert.equal(r.status, status, tamper);
    assert.match(r.text, /couldn’t log you in/);
    assert.equal((await c.get('/api/auth/me')).body.user, null, tamper);
  }
  assert.equal(ctx.db.one('SELECT id FROM users WHERE voo_id = ?', 'voo_attacker'), null);
});

test('an account from before VooSquare is linked once, then keyed by voo_id', async () => {
  enable();
  const { user } = h.makeWorkspace({ email: 'legacy@example.com' });
  const r = await vooLogin(h.client(), { sub: 'voo_legacy', email: 'legacy@example.com', name: 'Legacy' });
  assert.equal(r.location, '/app');
  assert.equal(ctx.db.one('SELECT voo_id FROM users WHERE id = ?', user.id).voo_id, 'voo_legacy');
  // A different Voo ID with the same email is not merged into it.
  const r2 = await vooLogin(h.client(), { sub: 'voo_other', email: 'legacy@example.com' });
  assert.equal(r2.status, 409);
});

test('passwords are off for customers; platform admins keep a break-glass login', async () => {
  enable();
  const c = h.client();
  const s = await c.post('/api/auth/signup', { email: 'pw@example.com', password: 'password123', name: 'Pw' });
  assert.equal(s.status, 403);
  assert.equal(s.body.login_url, '/auth/voosquare');
  assert.equal((await c.post('/api/auth/login', { email: h.DEMO.email, password: h.DEMO.password })).status, 403);
  await h.login(h.ADMIN.email, h.ADMIN.password);
  const n = h.emails(h.DEMO.email, 'password-reset').length;
  await c.post('/api/auth/forgot', { email: h.DEMO.email });
  assert.equal(h.emails(h.DEMO.email, 'password-reset').length, n);
});

test('logout ends the VooSquare session too', async () => {
  enable();
  const c = h.client();
  await vooLogin(c, { sub: 'voo_user_1', email: 'ada.new@example.com' });
  const out = await c.post('/api/auth/logout');
  assert.equal(out.body.next, '/auth/voosquare/logout');
  const r = await c.get('/auth/voosquare/logout');
  assert.equal(r.status, 302);
  assert.ok(r.location.startsWith(iss + '/logout?'));
  assert.match(r.location, /id_token_hint=/);
  assert.equal((await c.get('/api/auth/me')).body.user, null);
});

test('password changes are managed in VooSquare', async () => {
  enable();
  const c = h.client();
  await vooLogin(c, { sub: 'voo_user_1', email: 'ada.new@example.com' });
  const r = await c.put('/api/app/password', { current: 'x', password: 'newpassword1' });
  assert.equal(r.status, 400);
  assert.match(r.body.error, /VooSquare/);
});

test('summary API: service key, unknown users and metrics shape', async () => {
  enable();
  const c = h.client();
  assert.equal((await c.get('/api/voosquare/summary?voo_id=voo_user_1')).status, 401);
  assert.equal((await c.get('/api/voosquare/summary?voo_id=voo_user_1', { headers: { authorization: 'Bearer wrong' } })).status, 401);
  const auth = { headers: { authorization: 'Bearer ' + SERVICE_KEY } };
  assert.deepEqual((await c.get('/api/voosquare/summary?voo_id=nobody', auth)).body, { tool: 'replyvoo', linked: false });
  const u = ctx.db.one('SELECT * FROM users WHERE voo_id = ?', 'voo_user_1');
  const w = ctx.db.one('SELECT * FROM workspaces WHERE owner_id = ?', u.id);
  const { threadId, contactId } = h.makeThread(w.id);
  ctx.db.insert('messages', { workspace_id: w.id, thread_id: threadId, dir: 'out', author: 'ai', kind: 'text', text: 'Hi', meta: '{}', created_at: ctx.db.now() });
  ctx.db.update('contacts', contactId, { value: 120 });
  ctx.db.insert('events', { workspace_id: w.id, type: 'hot', text: 'x', data: '{}', created_at: ctx.db.now() });
  ctx.db.insert('events', { workspace_id: w.id, type: 'won', text: 'x', data: JSON.stringify({ contact_id: contactId }), created_at: ctx.db.now() });
  const t0 = Date.now();
  const r = await c.get('/api/voosquare/summary?voo_id=voo_user_1&period=7d', auth);
  assert.ok(Date.now() - t0 < 800);
  assert.equal(r.body.tool, 'replyvoo');
  assert.equal(r.body.linked, true);
  assert.equal(r.body.period, '7d');
  assert.equal(r.body.status, 'trial');
  assert.equal(r.body.open_url, 'http://localhost:3000/app');
  const m = Object.fromEntries(r.body.metrics.map(x => [x.key, x]));
  assert.deepEqual(Object.keys(m), ['chats_answered', 'leads_qualified', 'sales_closed', 'sales_usd']);
  assert.equal(m.chats_answered.value, 1);
  assert.equal(m.leads_qualified.value, 1);
  assert.equal(m.sales_closed.value, 1);
  assert.equal(m.sales_usd.value, 120);
  assert.equal(m.sales_usd.unit, 'usd');
  assert.equal(m.chats_answered.change_pct, 100);
  assert.equal((await c.get('/api/voosquare/summary?voo_id=voo_user_1&period=bad', auth)).body.period, '1d');
});

test('events are queued without personal data, signed, batched and retried', async () => {
  enable();
  const u = ctx.db.one('SELECT * FROM users WHERE voo_id = ?', 'voo_user_1');
  const w = ctx.db.one('SELECT * FROM workspaces WHERE owner_id = ?', u.id);
  ctx.db.run('DELETE FROM voo_outbox');
  voo.emit(w.id, 'lead_qualified', { channel: 'telegram_bot' });
  voo.emit(w.id, 'chat_answered', { channel: 'website' });
  // Payments report spend and plan_started (for VooSquare's referral rate table).
  const { fulfill } = require('../src/services/payments');
  const ref = 'RV-TEST-' + Date.now();
  ctx.db.insert('orders', { ref, workspace_id: w.id, user_id: u.id, kind: 'plan', item_id: 'pro', item_name: 'Pro plan (monthly)', interval: 'month', amount_usd: 79, currency: 'USD', amount_local: 79, provider: 'demo', status: 'pending', created_at: ctx.db.now() });
  fulfill(ref, { via: 'demo' });
  const rows = ctx.db.all('SELECT body FROM voo_outbox ORDER BY id').map(r => JSON.parse(r.body));
  assert.deepEqual(rows.map(r => r.type), ['lead_qualified', 'chat_answered', 'plan_started', 'spend']);
  assert.equal(rows[0].label, 'New hot lead on Telegram');
  assert.equal(rows[1].label, 'Closer answered a website chat');
  assert.equal(rows[3].value_usd, 79);
  for (const e of rows) { assert.equal(e.tool, 'replyvoo'); assert.equal(e.voo_id, 'voo_user_1'); assert.match(e.event_id, /^rv_/); assert.ok(!/ada|@/i.test(e.label)); }
  // VooSquare runs referrals, so Replyvoo does not pay its own Squad reward on top.
  assert.equal(ctx.db.one('SELECT COUNT(*) n FROM referral_earnings WHERE referee_ws = ?', w.id).n, 0);

  received.length = 0; eventsStatus = 500;
  let out = await voo.flush();
  assert.equal(out.sent, 0);
  const failed = ctx.db.one('SELECT * FROM voo_outbox ORDER BY id LIMIT 1');
  assert.equal(failed.attempts, 1);
  assert.ok(new Date(failed.next_at) > new Date());
  assert.equal(failed.sent_at, null);

  ctx.db.run('UPDATE voo_outbox SET next_at = ?', ctx.db.now());
  eventsStatus = 200;
  out = await voo.flush();
  assert.equal(out.sent, 4);
  const last = received[received.length - 1];
  assert.equal(last.sig, crypto.createHmac('sha256', HOOK).update(last.body).digest('hex'));
  assert.equal(JSON.parse(last.body).events.length, 4);
  assert.equal(ctx.db.one('SELECT COUNT(*) n FROM voo_outbox WHERE sent_at IS NULL').n, 0);

  // Older than 24 hours: given up, not retried forever.
  voo.emit(w.id, 'sale_closed', {});
  ctx.db.run("UPDATE voo_outbox SET created_at = '2020-01-01T00:00:00.000Z' WHERE sent_at IS NULL");
  eventsStatus = 503;
  await voo.flush();
  assert.ok(ctx.db.one('SELECT failed_at FROM voo_outbox WHERE sent_at IS NULL').failed_at);
  eventsStatus = 200;
});

test('no events without a Voo ID or webhook secret', () => {
  enable();
  const { ws } = h.makeWorkspace();
  assert.equal(voo.emit(ws.id, 'chat_answered', {}), null);
  voo.setConfig({ webhookSecret: '' });
  const u = ctx.db.one('SELECT * FROM users WHERE voo_id = ?', 'voo_user_1');
  const w = ctx.db.one('SELECT * FROM workspaces WHERE owner_id = ?', u.id);
  assert.equal(voo.emit(w.id, 'chat_answered', {}), null);
  enable();
});

test('tool links: switched on with a scoped key, revoked when switched off', async () => {
  enable();
  const c = h.client();
  const auth = { headers: { authorization: 'Bearer ' + SERVICE_KEY } };
  const scoped = 'lnk_' + crypto.randomBytes(20).toString('hex');
  assert.equal((await c.post('/api/voosquare/links', { voo_id: 'voo_user_1', link: 'castvoo-replyvoo', key: scoped })).status, 401);
  assert.equal((await c.post('/api/voosquare/links', { voo_id: 'voo_user_1', link: 'nope', key: scoped }, auth)).status, 400);
  assert.equal((await c.post('/api/voosquare/links', { voo_id: 'voo_user_1', link: 'castvoo-replyvoo', key: scoped }, auth)).status, 200);
  assert.equal((await c.get('/api/voosquare/links?voo_id=voo_user_1', auth)).body.links[0].enabled, true);
  const call = (key, body) => c.post('/api/voosquare/inbound/castvoo', body, { headers: { authorization: 'Bearer ' + key } });
  assert.equal((await call('wrong-key', { chat_id: 1, text: 'hi' })).status, 401);
  assert.equal((await call(scoped, { chat_id: 1 })).status, 400);
  assert.equal((await call(scoped, { chat_id: 1, text: 'Price?', bot_username: 'not_connected_bot' })).status, 409);
  const u = ctx.db.one('SELECT * FROM users WHERE voo_id = ?', 'voo_user_1');
  const w = ctx.db.one('SELECT * FROM workspaces WHERE owner_id = ?', u.id);
  ctx.db.insert('channels', { workspace_id: w.id, type: 'telegram_bot', name: 'Shop', username: 'AdaShopBot', external_id: '777', created_at: ctx.db.now() });
  const ok = await call(scoped, { chat_id: 4242, text: 'How much is the wig?', bot_id: '777', from: { id: 4242, name: 'Buyer' } });
  assert.equal(ok.status, 200);
  assert.equal(ok.body.ok, true);
  assert.ok(ctx.db.one("SELECT id FROM messages WHERE workspace_id = ? AND dir = 'in' AND text = 'How much is the wig?'", w.id));
  // Switched off in VooSquare: the key stops working at once.
  await c.post('/api/voosquare/links', { voo_id: 'voo_user_1', link: 'castvoo-replyvoo', enabled: false }, auth);
  assert.equal((await call(scoped, { chat_id: 4242, text: 'again', bot_id: '777' })).status, 401);
});

test('payment methods follow the country from sign-up', () => {
  const config = require('../src/config');
  const { providers } = require('../src/services/payments');
  const settings = require('../src/services/settings');
  const prev = { ...config.pay };
  const b = settings.get('billing');
  config.pay.paystackSecret = 'sk'; config.pay.flwSecret = 'fk';
  settings.set && settings.set('billing', { ...b, crypto_enabled: true, crypto_wallet: 'T123' });
  try {
    const ids = cc => providers(cc).map(p => p.id).filter(x => x !== 'demo');
    assert.equal(ids('NG')[0], 'paystack');
    assert.ok(!ids('CM').includes('paystack'));
    assert.equal(ids('CM')[0], 'flutterwave');
    assert.ok(!ids('GB').includes('paystack'));
    if (settings.set) assert.ok(['crypto', 'gatevoo'].includes(ids('GB')[0]), 'crypto first outside Africa');
    assert.ok(ids('').includes('paystack'));
  } finally { Object.assign(config.pay, prev); if (settings.set) settings.set('billing', b); }
});

test('team invites with Voo ID: log in first, email must match', async () => {
  enable();
  const owner = ctx.db.one('SELECT * FROM users WHERE voo_id = ?', 'voo_user_1');
  const ow = ctx.db.one('SELECT * FROM workspaces WHERE owner_id = ?', owner.id);
  const tok = crypto.randomBytes(24).toString('base64url');
  ctx.db.insert('invites', { workspace_id: ow.id, email: 'mate@example.com', role: 'agent', token_hash: crypto.createHash('sha256').update(tok).digest('hex'), invited_by: owner.id, expires_at: new Date(Date.now() + 864e5).toISOString(), created_at: ctx.db.now() });
  const anon = h.client();
  assert.equal((await anon.get('/api/auth/invite?token=' + encodeURIComponent(tok))).body.voo, true);
  const a = await anon.post('/api/auth/invite/accept', { token: tok });
  assert.equal(a.status, 401);
  assert.match(a.body.login_url, /^\/auth\/voosquare\?return_to=/);
  const wrong = h.client();
  await vooLogin(wrong, { sub: 'voo_wrong', email: 'wrong@example.com' });
  assert.equal((await wrong.post('/api/auth/invite/accept', { token: tok })).status, 403);
  const mate = h.client();
  const r = await vooLogin(mate, { sub: 'voo_mate', email: 'mate@example.com' }, { returnTo: '/app/invite?token=' + tok });
  assert.equal(r.location, '/app/invite?token=' + tok);
  const u = ctx.db.one('SELECT * FROM users WHERE voo_id = ?', 'voo_mate');
  assert.equal(ctx.db.one('SELECT COUNT(*) n FROM members WHERE user_id = ?', u.id).n, 0); // no stray workspace
  assert.equal((await mate.post('/api/auth/invite/accept', { token: tok })).status, 200);
  assert.equal(ctx.db.one('SELECT role FROM members WHERE user_id = ?', u.id).role, 'agent');
});
