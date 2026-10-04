'use strict';
// VooSquare routes: Voo ID login and logout, the summary API, tool links and the Castvoo inbound bridge.
const config = require('../config');
const db = require('../db');
const auth = require('../lib/auth');
const voo = require('../services/voosquare');
const mailer = require('../services/mailer');
const { HttpError, rateLimit } = require('../lib/http');
const { esc } = require('../lib/md');

const ID_COOKIE = 'rv_vit';
const first = n => String(n || '').trim().split(' ')[0] || 'there';

function errorPage(res, e) {
  const { page } = require('./links');
  const msg = e instanceof HttpError ? e.message : 'Something went wrong while logging you in.';
  if (!(e instanceof HttpError)) console.error('[voosquare] login', e.message);
  res.send(page('Login problem', '<span class="tag">VOOSQUARE LOGIN</span><h1>We couldn’t log you in</h1><p>' + esc(msg) + '</p><a class="btn y" href="/auth/voosquare">Try again</a><a class="btn" href="/">Back to Replyvoo</a>'), e.status && e.status < 500 ? e.status : 502);
}

// Every way into the dashboard's login pages goes through VooSquare once it is configured.
// Called by the /app/* shell route; returns true when it redirected.
const LOGIN_PAGES = /^\/app\/(login|signup|forgot|reset)\/?$/;
function appRedirect(req, res) {
  if (!voo.enabled() || !LOGIN_PAGES.test(req.path)) return false;
  const signup = /signup/.test(req.path);
  const q = new URLSearchParams();
  const next = req.query.next || (req.query.plan ? '/app/plan?checkout=' + encodeURIComponent(req.query.plan) + '&interval=' + (req.query.interval === 'year' ? 'year' : 'month') : '');
  if (next) q.set('return_to', next);
  if (signup) q.set('signup', '1');
  res.redirect('/auth/voosquare' + (q.toString() ? '?' + q : ''));
  return true;
}

module.exports = function (app) {
  const loginLimit = rateLimit('voo-login', 60, 900e3);

  app.get('/auth/voosquare', loginLimit, async (req, res) => {
    if (!voo.enabled()) return res.redirect('/app/login');
    try { res.redirect(await voo.startLogin(req, res, { returnTo: req.query.return_to, signup: req.query.signup === '1' })); }
    catch (e) { errorPage(res, e); }
  });

  app.get('/auth/voosquare/callback', loginLimit, async (req, res) => {
    if (!voo.enabled()) return res.redirect('/app/login');
    try {
      const { claims, idToken, returnTo } = await voo.finishLogin(req, res);
      const joining = returnTo.startsWith('/app/invite') || returnTo.startsWith('/admin'); // invited teammates and staff don't get a workspace of their own
      const { user, isNew, workspaceId } = voo.userFromClaims(claims, { needWorkspace: !joining });
      if (user.suspended) throw new HttpError(403, 'This account is suspended. Contact support.');
      auth.startSession(req, res, user, workspaceId || undefined);
      res.cookie(ID_COOKIE, idToken, { maxAge: 30 * 86400 });
      if (isNew && workspaceId) {
        mailer.send(user.email, 'welcome', { name: first(user.name), dashboard_url: config.appUrl + '/app' });
        return res.redirect('/app/welcome' + (returnTo !== '/app' ? '?next=' + encodeURIComponent(returnTo) : ''));
      }
      res.redirect(returnTo);
    } catch (e) { errorPage(res, e); }
  });

  // Logging out here ends the VooSquare session too, so one sign-out signs out of every tool.
  app.get('/auth/voosquare/logout', async (req, res) => {
    const idToken = req.cookies[ID_COOKIE];
    auth.endSession(req, res);
    res.cookie(ID_COOKIE, '', { maxAge: 0 });
    res.redirect(await voo.endSessionUrl(idToken));
  });

  // Server-to-server: headline numbers for the VooSquare dashboard card.
  app.get('/api/voosquare/summary', req => {
    voo.checkServiceKey(req);
    return voo.summary(req.query.voo_id, req.query.period);
  });

  // Server-to-server: VooSquare turns a link between tools on (with a scoped key) or off (key revoked).
  app.post('/api/voosquare/links', req => { voo.checkServiceKey(req); return { ok: true, ...voo.saveLink(req.body || {}) }; });
  app.get('/api/voosquare/links', req => { voo.checkServiceKey(req); return { links: voo.listLinks(req.query.voo_id) }; });

  // Castvoo → Replyvoo: a reply to a Castvoo broadcast, answered by the Closer on the same Telegram bot.
  const inboundLimit = rateLimit('voo-inbound', 600, 60e3);
  app.post('/api/voosquare/inbound/castvoo', inboundLimit, async req => {
    const link = voo.linkFor(req, 'castvoo-replyvoo');
    const b = req.body || {};
    const text = String(b.text || '').trim().slice(0, 4000);
    if (!text || !b.chat_id) throw new HttpError(400, 'chat_id and text are required.');
    const u = db.one('SELECT id FROM users WHERE voo_id = ?', link.voo_id);
    if (!u) throw new HttpError(404, 'This Voo ID has no Replyvoo account yet.');
    const botId = String(b.bot_id || ''); const botUser = String(b.bot_username || '').replace(/^@/, '').toLowerCase();
    const channel = db.all("SELECT c.* FROM channels c JOIN members m ON m.workspace_id = c.workspace_id AND m.user_id = ? AND m.role IN ('owner','admin') WHERE c.type = 'telegram_bot' AND c.status = 'active'", u.id)
      .find(c => (botId && c.external_id === botId) || (botUser && String(c.username).toLowerCase() === botUser));
    if (!channel) throw new HttpError(409, 'Connect this Telegram bot in Replyvoo first, so the Closer can answer on it.');
    const from = b.from || {};
    const reply = await require('../services/engine').handleInbound({ channel, chatId: String(b.chat_id), from: { id: String(from.id || b.chat_id), name: String(from.name || '').slice(0, 80), username: String(from.username || '').slice(0, 64) }, text, meta: { via: 'castvoo' } });
    return { ok: true, replied: !!reply, text: reply || null };
  });

  // Dashboard: what VooSquare shows this user (account page and "Part of VooSquare" links).
  app.get('/api/app/voosquare', req => {
    auth.needUser(req);
    return { ...voo.publicInfo(), linked: !!req.user.voo_id, country: req.user.country || '', links: req.user.voo_id ? voo.listLinks(req.user.voo_id) : [] };
  });

  // ---------- VooSquare support HQ (server-to-server, service key) ----------
  // VooSquare invites staff once and sends their access here; staff act by Voo ID.
  const staffSvc = require('../services/staff');
  const support = require('../services/support');
  const staffByVoo = vooId => {
    const u = vooId ? db.one('SELECT * FROM users WHERE voo_id = ?', String(vooId)) : null;
    const st = u ? staffSvc.get(u.id) : null;
    if (!st) throw new HttpError(403, 'That Voo ID is not on Replyvoo staff.');
    return { u, st };
  };
  app.get('/api/voosquare/staff', req => {
    voo.checkServiceKey(req);
    return { staff: db.all('SELECT u.voo_id, u.email, u.name, s.role, s.status, s.source, s.all_boxes, s.boxes, s.title, s.last_seen FROM staff s JOIN users u ON u.id = s.user_id ORDER BY s.created_at').map(r => ({ ...r, all_boxes: !!r.all_boxes, boxes: db.json(r.boxes, []) })), roles: Object.keys(staffSvc.ROLES), sections: staffSvc.SECTIONS };
  });
  app.post('/api/voosquare/staff', req => {
    voo.checkServiceKey(req);
    const b = req.body || {};
    if (!b.voo_id) throw new HttpError(400, 'voo_id is required.');
    if (b.role === 'owner') throw new HttpError(400, 'Owners are added inside Replyvoo, not from VooSquare.');
    const vooId = String(b.voo_id).slice(0, 200);
    const email = String(b.email || '').trim().toLowerCase().slice(0, 200);
    // Checks first, with no side effects: never re-link an existing account by email from here.
    let user = db.one('SELECT * FROM users WHERE voo_id = ?', vooId);
    if (!user && email && db.one('SELECT id FROM users WHERE email = ?', email)) throw new HttpError(409, 'An account with this email already exists in Replyvoo. Ask them to log in to Replyvoo with VooSquare once, then try again.');
    const cur = user ? db.one('SELECT role FROM staff WHERE user_id = ?', user.id) : null;
    if (cur && cur.role === 'owner') throw new HttpError(409, 'This person is a Replyvoo owner; change them inside Replyvoo.');
    if (b.active === false) {
      if (user && cur) { db.run("UPDATE staff SET status = 'disabled' WHERE user_id = ?", user.id); staffSvc.syncRole(user.id); db.run('DELETE FROM sessions WHERE user_id = ?', user.id); }
      return { ok: true, active: false };
    }
    if (b.role && !staffSvc.ROLES[b.role]) throw new HttpError(400, 'Unknown role');
    if (!user) {
      if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) throw new HttpError(400, 'A valid email is required for a new staff member.');
      const id = db.insert('users', { email, name: String(b.name || '').trim().slice(0, 80) || email.split('@')[0], password_hash: '', email_verified: 1, voo_id: vooId, moji: '{}', created_at: db.now() });
      user = db.one('SELECT * FROM users WHERE id = ?', id);
    }
    const st = staffSvc.upsert(user.id, { role: b.role || 'support', perms: b.perms || {}, all_boxes: b.all_boxes !== false, boxes: b.boxes || [], title: b.title || '', source: 'voosquare' });
    return { ok: true, active: true, staff: staffSvc.publicInfo(st), admin_url: config.appUrl + '/admin' };
  });
  app.get('/api/voosquare/support/boxes', req => { voo.checkServiceKey(req); return { boxes: support.boxes(true).map(b => ({ id: b.id, name: b.name, color: b.color, active: !!b.active, open: db.one("SELECT COUNT(*) n FROM support_tickets WHERE box_id = ? AND status != 'solved'", b.id).n })) }; });
  app.get('/api/voosquare/support/tickets', req => {
    voo.checkServiceKey(req);
    const q = req.query;
    // Without voo_id VooSquare sees every box (HQ view); with it, only what that staff member may see.
    const scope = q.voo_id ? staffByVoo(q.voo_id) : { u: null, st: { all_boxes: true, boxes: [] } };
    if (q.voo_id && !staffSvc.can(scope.st, 'support', 'view')) throw new HttpError(403, 'This staff member has no access to the support desk.');
    return { tickets: support.list(scope.st, { status: q.status || 'active', box: q.box_id || '', mine: q.view === 'mine' ? true : q.view === 'unassigned' ? 'unassigned' : false, q: String(q.q || '').slice(0, 80), userId: scope.u ? scope.u.id : null, limit: q.limit, before: q.before || '' }).map(t => ({ ...t, url: config.appUrl + '/admin/support/' + t.ref })) };
  });
  app.get('/api/voosquare/support/tickets/:ref', req => {
    voo.checkServiceKey(req);
    const t = db.one('SELECT * FROM support_tickets WHERE ref = ?', String(req.params.ref));
    if (!t) throw new HttpError(404, 'Ticket not found');
    if (req.query.voo_id) {
      const { u, st } = staffByVoo(req.query.voo_id);
      if (!staffSvc.can(st, 'support', 'view')) throw new HttpError(403, 'This staff member has no access to the support desk.');
      if (!staffSvc.canBox(st, t.box_id) && t.assignee_id !== u.id) throw new HttpError(403, 'Not in this staff member’s boxes.');
    }
    return { ...support.ticketOut(t, true), url: config.appUrl + '/admin/support/' + t.ref };
  });
  app.post('/api/voosquare/support/tickets/:ref/reply', async req => {
    voo.checkServiceKey(req);
    const b = req.body || {};
    const { u, st } = staffByVoo(b.voo_id);
    if (!staffSvc.can(st, 'support', 'edit')) throw new HttpError(403, 'This staff member can only view the desk.');
    const t = support.getForStaff(st, req.params.ref);
    return await support.reply(t, u, support.fill(b.text == null ? '' : b.text, t), { note: !!b.note });
  });
  app.post('/api/voosquare/support/tickets/:ref/update', req => {
    voo.checkServiceKey(req);
    const b = req.body || {};
    const { u, st } = staffByVoo(b.voo_id);
    if (!staffSvc.can(st, 'support', 'edit')) throw new HttpError(403, 'This staff member can only view the desk.');
    const t = support.getForStaff(st, req.params.ref);
    if (b.box_id != null && !staffSvc.canBox(st, b.box_id)) throw new HttpError(403, 'This staff member can only move tickets to their own boxes.');
    const patch = { status: b.status, priority: b.priority, box_id: b.box_id };
    if (b.assignee_voo_id !== undefined) patch.assignee_id = b.assignee_voo_id ? staffByVoo(b.assignee_voo_id).u.id : null;
    return { ok: true, ticket: support.ticketOut(support.update(t, u, patch)) };
  });
};
module.exports.appRedirect = appRedirect;
