'use strict';
// Gatevoo crypto checkout: invoice creation, signed webhooks, re-checking with Gatevoo, sandbox flow, admin tools.
const { test, before, after, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const h = require('./helpers');

let ctx, db, config, gatevoo, settings, srv, base;
const KEY = 'gv_live_' + 'k'.repeat(32);
const SECRET = 'gvwh_' + 's'.repeat(32);
const invoices = new Map(); // id -> invoice
const calls = [];
let failCreate = 0;

before(async () => {
  ctx = await h.boot();
  db = ctx.db;
  config = require('../src/config');
  gatevoo = require('../src/services/gatevoo');
  settings = require('../src/services/settings');
  srv = http.createServer((req, res) => {
    let body = '';
    req.on('data', c => { body += c; });
    req.on('end', () => {
      const json = (o, s = 200) => { res.writeHead(s, { 'Content-Type': 'application/json' }); res.end(JSON.stringify(o)); };
      calls.push({ method: req.method, url: req.url, auth: req.headers.authorization, idem: req.headers['idempotency-key'], body: body ? JSON.parse(body) : null });
      if (req.headers.authorization !== 'Bearer ' + KEY) return json({ error: { message: 'Bad key' } }, 401);
      if (req.method === 'GET' && req.url === '/v1/me') return json({ data: { name: 'Zedapex' } });
      if (req.method === 'POST' && req.url === '/v1/invoices') {
        if (failCreate) { failCreate--; return json({ error: { message: 'coins not enabled' } }, 422); }
        const b = JSON.parse(body);
        const id = 'inv_' + (invoices.size + 1);
        const inv = { id, reference: b.reference, status: 'pending', amount: b.amount, checkout_url: 'https://pay.gatevoo.com/i/' + id };
        invoices.set(id, inv);
        return json({ data: inv }, 201);
      }
      const m = req.url.match(/^\/v1\/invoices\/(.+)$/);
      if (req.method === 'GET' && m && invoices.has(m[1])) return json({ data: invoices.get(m[1]) });
      json({ error: 'not found' }, 404);
    });
  });
  await new Promise(r => srv.listen(0, '127.0.0.1', r));
  base = 'http://127.0.0.1:' + srv.address().port + '/v1';
});
after(async () => { await new Promise(r => srv.close(r)); await ctx.close(); });

function live() { Object.assign(config.gatevoo, { apiUrl: base, apiKey: KEY, webhookSecret: SECRET }); }
function off() { Object.assign(config.gatevoo, { apiKey: '', webhookSecret: '' }); }
beforeEach(() => { live(); settings.set('billing', { ...settings.get('billing'), gatevoo_enabled: true, gatevoo_usdt: true, gatevoo_btc: true }); });

async function owner() { return h.signup(); }
const order = ref => db.one('SELECT * FROM orders WHERE ref = ?', ref);
function hook(c, ev, sig) {
  const raw = JSON.stringify(ev);
  return c.req('POST', '/webhooks/gatevoo', raw, { raw: true, csrf: false, headers: { 'content-type': 'application/json', 'x-gatevoo-signature': sig || gatevoo.sign(raw) } });
}

test('checkout offers Gatevoo crypto with both coins and hides the manual USDT option', async () => {
  settings.set('billing', { ...settings.get('billing'), crypto_enabled: true, crypto_wallet: 'TManual' });
  const s = await owner();
  const r = await s.client.post('/api/app/checkout/preview', { kind: 'plan', item_id: 'starter', interval: 'month' });
  assert.equal(r.status, 200);
  const gv = r.body.providers.find(p => p.id === 'gatevoo');
  assert.ok(gv, 'gatevoo offered');
  assert.deepEqual(gv.coins.map(c => c.id), ['USDT_TRC20', 'BTC']);
  assert.ok(!r.body.providers.some(p => p.id === 'crypto'), 'manual USDT hidden while Gatevoo is on');
  settings.set('billing', { ...settings.get('billing'), gatevoo_btc: false });
  const r2 = await s.client.post('/api/app/checkout/preview', { kind: 'plan', item_id: 'starter', interval: 'month' });
  assert.deepEqual(r2.body.providers.find(p => p.id === 'gatevoo').coins.map(c => c.id), ['USDT_TRC20']);
  settings.set('billing', { ...settings.get('billing'), gatevoo_enabled: false });
  const r3 = await s.client.post('/api/app/checkout/preview', { kind: 'plan', item_id: 'starter', interval: 'month' });
  assert.ok(!r3.body.providers.some(p => p.id === 'gatevoo'));
  assert.ok(r3.body.providers.some(p => p.id === 'crypto'), 'manual USDT is the backup when Gatevoo is off');
  settings.set('billing', { ...settings.get('billing'), crypto_enabled: false });
});

test('starting a payment creates a Gatevoo invoice and redirects to its page', async () => {
  const s = await owner();
  calls.length = 0;
  const r = await s.client.post('/api/app/checkout', { kind: 'plan', item_id: 'starter', interval: 'month', provider: 'gatevoo', coin: 'BTC' });
  assert.equal(r.status, 200, r.text);
  assert.match(r.body.redirect, /^https:\/\/pay\.gatevoo\.com\/i\/inv_/);
  const c = calls.find(x => x.method === 'POST');
  assert.equal(c.idem, 'replyvoo-' + r.body.ref, 'idempotency key');
  assert.equal(c.body.reference, r.body.ref);
  assert.equal(c.body.amount.currency, 'USD');
  assert.equal(Number(c.body.amount.value), order(r.body.ref).amount_usd);
  assert.equal(c.body.preferred_coin, 'BTC');
  assert.deepEqual(c.body.coins, ['USDT_TRC20', 'BTC']);
  assert.match(c.body.webhook_url, /\/webhooks\/gatevoo$/);
  const o = order(r.body.ref);
  assert.equal(o.provider, 'gatevoo');
  assert.equal(o.status, 'pending');
  assert.match(o.provider_ref, /^inv_/);
});

test('signed webhook + paid invoice activates the order once; amount is re-checked with Gatevoo', async () => {
  const s = await owner();
  const r = await s.client.post('/api/app/checkout', { kind: 'plan', item_id: 'starter', interval: 'month', provider: 'gatevoo' });
  const o = order(r.body.ref);
  const inv = invoices.get(o.provider_ref);
  // The webhook body claims "paid" but Gatevoo still says pending: nothing happens.
  const w1 = await hook(h.client(), { type: 'invoice.paid', data: { id: inv.id, reference: o.ref, status: 'paid', paid_usd: 999 } });
  assert.equal(w1.status, 200);
  await h.sleep(150);
  assert.equal(order(o.ref).status, 'pending', 'body alone is never trusted');
  Object.assign(inv, { status: 'paid', paid_usd: o.amount_usd, payment: { coin: 'USDT_TRC20', tx_hash: 'abc123', amount: o.amount_usd.toFixed(2), confirmations: 20 } });
  await hook(h.client(), { type: 'invoice.paid', data: { id: inv.id, reference: o.ref } });
  await h.waitFor(() => order(o.ref).status === 'paid');
  assert.equal(db.one('SELECT plan_id FROM workspaces WHERE id = ?', s.ws.id).plan_id, 'starter');
  const meta = JSON.parse(order(o.ref).meta);
  assert.equal(meta.tx_hash, 'abc123');
  assert.equal(meta.coin, 'USDT_TRC20');
  // Replays don't double-apply.
  await hook(h.client(), { type: 'invoice.paid', data: { id: inv.id, reference: o.ref } });
  await h.sleep(100);
  assert.equal(db.one('SELECT COUNT(*) n FROM orders WHERE ref = ? AND status = \'paid\'', o.ref).n, 1);
  // Customer sees the coin and a transaction link.
  const w = await s.client.get('/api/app/wallet');
  const row = w.body.orders.find(x => x.ref === o.ref);
  assert.equal(row.coin, 'USDT');
  assert.equal(row.tx_url, 'https://tronscan.org/#/transaction/abc123');
  assert.equal(row.meta, undefined, 'raw meta stays private');
});

test('bad, missing or stale signatures are rejected', async () => {
  const c = h.client();
  const ev = { type: 'invoice.paid', data: { reference: 'X' } };
  assert.equal((await hook(c, ev, 't=' + Math.floor(Date.now() / 1000) + ',v1=deadbeef')).status, 401);
  const raw = JSON.stringify(ev);
  assert.equal((await hook(c, ev, gatevoo.sign(raw, Math.floor(Date.now() / 1000) - 3600))).status, 401, 'old timestamp');
  assert.equal((await c.req('POST', '/webhooks/gatevoo', raw, { raw: true, csrf: false, headers: { 'content-type': 'application/json' } })).status, 401);
});

test('underpaid invoices stay pending and are flagged; expired ones fail', async () => {
  const s = await owner();
  const r = await s.client.post('/api/app/checkout', { kind: 'plan', item_id: 'starter', interval: 'month', provider: 'gatevoo' });
  const o = order(r.body.ref);
  Object.assign(invoices.get(o.provider_ref), { status: 'paid', paid_usd: o.amount_usd - 5, payment: { coin: 'BTC', tx_hash: 'f00', amount: '0.0001' } });
  const v = await (require('../src/services/payments')).verify(o.ref);
  assert.equal(v.ok, false);
  assert.match(v.reason, /Underpaid/);
  assert.equal(order(o.ref).status, 'pending');
  assert.equal(JSON.parse(order(o.ref).meta).underpaid, true);
  const r2 = await s.client.post('/api/app/checkout', { kind: 'plan', item_id: 'starter', interval: 'month', provider: 'gatevoo' });
  const o2 = order(r2.body.ref);
  invoices.get(o2.provider_ref).status = 'expired';
  const poll = await s.client.get('/api/app/orders/' + o2.ref);
  assert.equal(poll.body.status, 'failed');
});

test('an invoice for another order cannot settle this one', async () => {
  const s = await owner();
  const a = order((await s.client.post('/api/app/checkout', { kind: 'plan', item_id: 'starter', interval: 'month', provider: 'gatevoo' })).body.ref);
  const r = gatevoo.settle({ id: 'inv_other', reference: a.ref, status: 'paid', paid_usd: 1e6 });
  assert.equal(r.ok, false);
  assert.equal(order(a.ref).status, 'pending');
});

test('Gatevoo errors fail the order with a friendly message', async () => {
  const s = await owner();
  failCreate = 1;
  const r = await s.client.post('/api/app/checkout', { kind: 'plan', item_id: 'starter', interval: 'month', provider: 'gatevoo' });
  assert.equal(r.status, 502);
  assert.match(r.body.error, /Gatevoo could not start the payment/);
  config.gatevoo.apiUrl = 'http://127.0.0.1:1/v1';
  const r2 = await s.client.post('/api/app/checkout', { kind: 'plan', item_id: 'starter', interval: 'month', provider: 'gatevoo' });
  assert.equal(r2.status, 502);
  assert.match(r2.body.error, /could not be reached/);
});

test('sandbox: without keys the local Gatevoo page completes the purchase', async () => {
  off();
  assert.equal(gatevoo.mode(), 'sandbox');
  const s = await owner();
  const r = await s.client.post('/api/app/checkout', { kind: 'plan', item_id: 'starter', interval: 'month', provider: 'gatevoo', coin: 'BTC' });
  assert.match(r.body.redirect, /^\/pay\/gatevoo\/.+\?coin=BTC$/);
  const page = await s.client.get(r.body.redirect);
  assert.equal(page.status, 200);
  assert.match(page.text, /Gatevoo/);
  assert.match(page.text, /bc1q/);
  assert.match(page.text, /Sandbox/);
  // A stranger can't see or pay it.
  const other = await owner();
  assert.equal((await other.client.get(r.body.redirect)).status, 404);
  assert.equal((await other.client.post('/pay/gatevoo/' + r.body.ref, { coin: 'BTC' }, { form: true })).status, 404);
  const pay = await s.client.post('/pay/gatevoo/' + r.body.ref, { coin: 'BTC' }, { form: true });
  assert.equal(pay.status, 302);
  assert.equal(order(r.body.ref).status, 'paid');
  assert.equal(JSON.parse(order(r.body.ref).meta).coin, 'BTC');
  // Off entirely when payments demo is off too.
  const prev = config.pay.demo; config.pay.demo = false;
  try { assert.equal(gatevoo.mode(), 'off'); assert.equal((await s.client.get(r.body.redirect)).status, 404); }
  finally { config.pay.demo = prev; }
});

test('admin: status, connection test, check payment, and staff access', async () => {
  const a = await h.login(h.ADMIN.email, h.ADMIN.password);
  const st = await a.get('/api/admin/gatevoo');
  assert.equal(st.status, 200);
  assert.equal(st.body.mode, 'live');
  assert.match(st.body.webhook_url, /\/webhooks\/gatevoo$/);
  const t = await a.post('/api/admin/gatevoo/test');
  assert.equal(t.body.ok, true);
  assert.match(t.body.message, /Connected as Zedapex/);
  const s = await owner();
  const o = order((await s.client.post('/api/app/checkout', { kind: 'plan', item_id: 'starter', interval: 'month', provider: 'gatevoo' })).body.ref);
  const c1 = await a.post('/api/admin/orders/' + o.ref + '/check');
  assert.equal(c1.body.ok, false);
  Object.assign(invoices.get(o.provider_ref), { status: 'confirmed', paid_usd: o.amount_usd, payment: { coin: 'BTC', tx_hash: 'b7c', amount: '0.00100000' } });
  const c2 = await a.post('/api/admin/orders/' + o.ref + '/check');
  assert.equal(c2.body.ok, true);
  assert.equal(c2.body.status, 'paid');
  const list = await a.get('/api/admin/orders');
  const row = list.body.find(x => x.ref === o.ref);
  assert.equal(row.gatevoo.coin, 'Bitcoin');
  assert.equal(row.gatevoo.tx_url, 'https://mempool.space/tx/b7c');
  // A support agent has no pricing access, so no Gatevoo settings.
  const sam = await h.login('sam@replyvoo.local', 'staff12345').catch(() => null);
  if (sam) { const r = await sam.get('/api/admin/gatevoo'); assert.ok([401, 403].includes(r.status)); }
  // Wrong key shows a clear message.
  config.gatevoo.apiKey = 'nope';
  const bad = await a.post('/api/admin/gatevoo/test');
  assert.equal(bad.body.ok, false);
  assert.match(bad.body.message, /rejected the API key/);
});
