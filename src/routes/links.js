'use strict';
// Short links and payment return pages: /r/:code, /go/joinvoo, /pay/callback, /pay/demo/:ref,
// plus the single-page app shells for /app and /admin.
const fs = require('node:fs');
const path = require('node:path');
const db = require('../db');
const config = require('../config');
const settings = require('../services/settings');
const payments = require('../services/payments');
const ws = require('../services/workspace');
const { sha256 } = require('../lib/security');
const { esc } = require('../lib/md');

const VIEWS = path.join(config.root, 'views');
const shellCache = new Map();
function shell(name) {
  if (config.isProd && shellCache.has(name)) return shellCache.get(name);
  const html = fs.readFileSync(path.join(VIEWS, name), 'utf8');
  shellCache.set(name, html);
  return html;
}
function click(req, target, source, wsId) {
  db.insert('clicks', { target, source: String(source || '').slice(0, 40), workspace_id: wsId || null, user_id: req.user ? req.user.id : null, ip_hash: sha256(req.ip + config.secret).slice(0, 16), created_at: db.now() });
}
function page(title, body) {
  return '<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex"><title>' + esc(title) + ' | Replyvoo</title>' +
    '<style>body{margin:0;min-height:100vh;display:grid;place-items:center;background:#FAF9F5;color:#121110;font-family:"Plus Jakarta Sans",system-ui,-apple-system,"Segoe UI",sans-serif;padding:20px}' +
    '.card{width:100%;max-width:440px;background:#fff;border:1px solid #EEEBE2;border-radius:26px;padding:30px;box-shadow:0 30px 60px -40px rgba(18,17,16,.35)}' +
    'h1{margin:0 0 6px;font-size:26px;letter-spacing:-0.04em}p{color:#5E5A50;margin:0 0 18px;line-height:1.55}.row{display:flex;justify-content:space-between;padding:12px 0;border-bottom:1px solid #EEEBE2;font-size:15px}' +
    '.btn{display:flex;align-items:center;justify-content:center;width:100%;margin-top:20px;border:0;border-radius:999px;background:#121110;color:#fff;font:700 16px/1 inherit;padding:16px;cursor:pointer;text-decoration:none}.btn.y{background:#FFC21A;color:#121110}' +
    '.tag{display:inline-block;background:#FFF7DD;color:#7A5800;border-radius:999px;padding:6px 12px;font-size:12px;font-weight:800;letter-spacing:.06em;margin-bottom:14px}.logo{width:44px;height:44px;border-radius:14px;background:#FFC21A;margin-bottom:18px}</style></head><body><div class="card"><div class="logo"></div>' + body + '</div></body></html>';
}

module.exports = function (app) {
  // Voo Squad referral link: remember the code for 30 days, count the click, go to the homepage.
  app.get('/r/:code', (req, res) => {
    const code = String(req.params.code).replace(/[^A-Za-z0-9_-]/g, '').slice(0, 24);
    const w = code ? db.one('SELECT id FROM workspaces WHERE ref_code = ?', code) : null;
    if (w) { res.cookie('rv_ref', code, { maxAge: 30 * 86400 }); click(req, 'ref', code, w.id); }
    res.redirect('/?ref=' + encodeURIComponent(code));
  });

  // Sister company: Joinvoo. Tracks the click, then sends the visitor on with UTM tags.
  app.get('/go/joinvoo', (req, res) => {
    const j = settings.get('joinvoo');
    const src = String(req.query.from || 'dashboard').replace(/[^a-z0-9_-]/gi, '').slice(0, 30);
    click(req, 'joinvoo', src, req.ws ? req.ws.id : null);
    let url = /^https:\/\//.test(j.url) ? j.url : 'https://joinvoo.com';
    url += (url.includes('?') ? '&' : '?') + (j.utm || 'utm_source=replyvoo') + '&utm_content=' + encodeURIComponent(src);
    res.redirect(url);
  });

  // Return page after Paystack / Flutterwave.
  app.get('/pay/callback', async (req, res) => {
    const ref = String(req.query.ref || req.query.reference || req.query.tx_ref || '').slice(0, 60);
    if (ref) { try { await payments.verify(ref); } catch (e) { console.warn('[callback]', e.message); } }
    res.redirect('/app/wallet?order=' + encodeURIComponent(ref));
  });

  // Demo checkout (only when PAYMENTS_DEMO=true). Lets you test the full purchase flow without money.
  function demoOrder(req) {
    if (!config.pay.demo || !req.user) return null;
    const o = db.one('SELECT * FROM orders WHERE ref = ? AND provider = \'demo\'', String(req.params.ref));
    if (!o || !ws.memberRole(o.workspace_id, req.user.id)) return null;
    return o;
  }
  app.get('/pay/demo/:ref', (req, res) => {
    const o = demoOrder(req);
    if (!o) return res.send(page('Not found', '<h1>Checkout not found</h1><p>This demo checkout link is invalid, or demo payments are switched off.</p><a class="btn" href="/app/wallet">Back to dashboard</a>'), 404);
    if (o.status === 'paid') return res.redirect('/app/wallet?order=' + o.ref);
    res.send(page('Demo checkout', '<span class="tag">TEST MODE · NO REAL MONEY</span><h1>Demo checkout</h1><p>This is how a purchase completes. In production your customers pay with Paystack, Flutterwave or USDT here.</p>' +
      '<div class="row"><span>Item</span><strong>' + esc(o.item_name) + '</strong></div><div class="row"><span>Total</span><strong>$' + o.amount_usd.toFixed(2) + '</strong></div><div class="row"><span>Reference</span><strong>' + esc(o.ref) + '</strong></div>' +
      '<form method="post" action="/pay/demo/' + encodeURIComponent(o.ref) + '"><button class="btn y" type="submit">Pay $' + o.amount_usd.toFixed(2) + ' (demo)</button></form><a class="btn" href="/app/wallet">Cancel</a>'));
  });
  app.post('/pay/demo/:ref', (req, res) => {
    const o = demoOrder(req);
    if (!o) return res.send(page('Not found', '<h1>Checkout not found</h1><p>This demo checkout is not available.</p>'), 404);
    // Same-origin check instead of the API header (this is a plain HTML form).
    const origin = req.headers.origin || req.headers.referer || '';
    if (origin && !origin.startsWith(config.appUrl) && !origin.includes('//' + req.headers.host)) return res.send(page('Blocked', '<h1>Blocked</h1><p>Please start the checkout again from your dashboard.</p>'), 403);
    payments.fulfill(o.ref, { via: 'demo' });
    res.redirect('/app/wallet?order=' + o.ref);
  });

  // Gatevoo sandbox checkout (no keys + PAYMENTS_DEMO): the same flow as Gatevoo's hosted page, without real coins.
  function gvOrder(req) {
    const gatevoo = require('../services/gatevoo');
    if (gatevoo.mode() !== 'sandbox' || !req.user) return null;
    const o = db.one('SELECT * FROM orders WHERE ref = ? AND provider = \'gatevoo\'', String(req.params.ref));
    if (!o || !ws.memberRole(o.workspace_id, req.user.id)) return null;
    return o;
  }
  app.get('/pay/gatevoo/:ref', (req, res) => {
    const o = gvOrder(req);
    if (!o) return res.send(page('Not found', '<h1>Checkout not found</h1><p>This crypto checkout link is invalid or has expired.</p><a class="btn" href="/app/wallet">Back to dashboard</a>'), 404);
    if (o.status !== 'pending') return res.redirect('/app/wallet?order=' + encodeURIComponent(o.ref));
    const gatevoo = require('../services/gatevoo');
    const coins = gatevoo.coins().map(c => gatevoo.COINS[c]);
    res.send(require('../../views/gatevoo-checkout').render({ order: o, coins, coin: String(req.query.coin || db.json(o.meta, {}).coin || ''), action: '/pay/gatevoo/' + encodeURIComponent(o.ref), cancelUrl: '/app/wallet' }), 200, 'text/html; charset=utf-8', { 'Cache-Control': 'no-store', 'X-Robots-Tag': 'noindex' });
  });
  app.post('/pay/gatevoo/:ref', (req, res) => {
    const o = gvOrder(req);
    if (!o) return res.send(page('Not found', '<h1>Checkout not found</h1><p>This crypto checkout is not available.</p>'), 404);
    const origin = req.headers.origin || req.headers.referer || '';
    if (origin && !origin.startsWith(config.appUrl) && !origin.includes('//' + req.headers.host)) return res.send(page('Blocked', '<h1>Blocked</h1><p>Please start the checkout again from your dashboard.</p>'), 403);
    require('../services/gatevoo').sandboxPay(o.ref, String((req.body || {}).coin || ''));
    res.redirect('/app/wallet?order=' + encodeURIComponent(o.ref));
  });

  // One-click unsubscribe from broadcast emails (account emails such as receipts are still sent).
  app.get('/unsubscribe', (req, res) => {
    const { hmac, safeEqual } = require('../lib/security');
    const email = String(req.query.e || '').toLowerCase().slice(0, 200);
    const ok = email && safeEqual(String(req.query.t || ''), hmac('unsub:' + email).slice(0, 32));
    if (ok) db.run('UPDATE users SET marketing_opt_out = 1 WHERE email = ?', email);
    res.send(page('Unsubscribed', ok ? '<h1>You’re unsubscribed</h1><p>You won’t get Replyvoo news and offers by email anymore. Important account emails, like receipts and security alerts, will still reach you.</p><a class="btn" href="/">Back to Replyvoo</a>' : '<h1>Link not valid</h1><p>This unsubscribe link is broken or incomplete. Email us and we’ll take you off the list.</p><a class="btn" href="/">Back to Replyvoo</a>'), ok ? 200 : 400);
  });

  // Single-page apps.
  const sendShell = file => (req, res) => res.send(shell(file), 200, 'text/html; charset=utf-8', { 'Cache-Control': 'no-cache', 'X-Robots-Tag': 'noindex' });
  app.get('/app', sendShell('app.html'));
  const appShell = sendShell('app.html');
  app.get('/app/*', (req, res) => { if (!require('./voosquare').appRedirect(req, res)) appShell(req, res); });
  app.get('/admin', sendShell('admin.html'));
  app.get('/admin/*', sendShell('admin.html'));
};
module.exports.page = page;
