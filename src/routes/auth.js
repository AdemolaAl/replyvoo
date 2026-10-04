'use strict';
// Sign up, log in, password reset, email verification, team invites.
const db = require('../db');
const config = require('../config');
const auth = require('../lib/auth');
const ws = require('../services/workspace');
const mailer = require('../services/mailer');
const settings = require('../services/settings');
const { hashPassword, verifyPassword, token, sha256 } = require('../lib/security');
const { HttpError, rateLimit } = require('../lib/http');
const voo = require('../services/voosquare');
// With VooSquare on, people sign up and log in with their Voo ID. Only platform admins keep a password (break-glass).
const vooOnly = () => { if (voo.enabled()) throw new HttpError(403, 'Replyvoo uses your Voo ID now. Continue with VooSquare to sign up or log in.', { login_url: '/auth/voosquare' }); };

const emailOk = e => /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(String(e || '')) && String(e).length <= 200;
const first = n => String(n || '').trim().split(' ')[0] || 'there';
const { cleanMoji } = require('../lib/moji');

function makeToken(userId, kind, hours, data = {}) {
  const raw = token(32);
  db.insert('tokens', { user_id: userId, kind, token_hash: sha256(raw), data: JSON.stringify(data), expires_at: new Date(Date.now() + hours * 3600e3).toISOString(), created_at: db.now() });
  return raw;
}
function useToken(raw, kind) {
  const t = db.one('SELECT * FROM tokens WHERE token_hash = ? AND kind = ?', sha256(String(raw || '')), kind);
  if (!t || t.used_at || new Date(t.expires_at) < new Date()) return null;
  db.update('tokens', t.id, { used_at: db.now() });
  return t;
}

function sendVerify(user) {
  const raw = makeToken(user.id, 'verify', 24);
  return mailer.send(user.email, 'verify-email', { name: first(user.name), verify_url: config.appUrl + '/app/verify?token=' + raw });
}

module.exports = function (app) {
  const signupLimit = rateLimit('signup', 10, 3600e3);
  const loginLimit = rateLimit('login', 20, 900e3);
  const mailLimit = rateLimit('mail', 6, 3600e3);

  app.post('/api/auth/signup', signupLimit, (req, res) => {
    vooOnly();
    if (!settings.feature('signup')) throw new HttpError(403, 'Sign-ups are paused right now. Please try again soon.');
    const b = req.body || {};
    const email = String(b.email || '').trim().toLowerCase();
    if (!emailOk(email)) throw new HttpError(400, 'Please enter a valid email address.');
    if (String(b.password || '').length < 8) throw new HttpError(400, 'Your password needs at least 8 characters.');
    if (db.one('SELECT id FROM users WHERE email = ?', email)) throw new HttpError(409, 'An account with this email already exists. Try logging in.');
    const name = String(b.name || '').trim().slice(0, 80) || email.split('@')[0];
    const refCode = String(b.ref || req.cookies.rv_ref || '').trim();
    const referrer = refCode ? db.one('SELECT id FROM workspaces WHERE ref_code = ?', refCode) : null;
    const user = db.tx(() => {
      const id = db.insert('users', { email, name, password_hash: hashPassword(b.password), moji: JSON.stringify(cleanMoji(b.moji)), created_at: db.now() });
      const u = db.one('SELECT * FROM users WHERE id = ?', id);
      const w = ws.createWorkspace(u, String(b.business || '').trim().slice(0, 80) || (first(name) + '’s business'), { referred_by: referrer ? referrer.id : null, settings: { niche: String(b.niche || '').slice(0, 60), team: String(b.team || '').slice(0, 20), alerts: { handoff: true, night_report: true, hot: true, low_credits: true } } });
      u.workspace_id = w.id;
      return u;
    });
    auth.startSession(req, res, user, user.workspace_id);
    sendVerify(user);
    mailer.send(user.email, 'welcome', { name: first(user.name), dashboard_url: config.appUrl + '/app' });
    return { ok: true, user: auth.publicUser(user) };
  });

  app.post('/api/auth/login', loginLimit, (req, res) => {
    const b = req.body || {};
    const u = db.one('SELECT * FROM users WHERE email = ?', String(b.email || '').trim().toLowerCase());
    // With VooSquare on, only owners keep a password login (a backup if VooSquare is down).
    if (voo.enabled() && !(u && u.role === 'admin' && (db.one("SELECT role FROM staff WHERE user_id = ? AND status = 'active'", u.id) || {}).role === 'owner')) vooOnly();
    if (!u || !verifyPassword(b.password || '', u.password_hash)) throw new HttpError(401, 'That email and password don’t match.');
    if (u.suspended) throw new HttpError(403, 'This account is suspended. Contact support.');
    auth.startSession(req, res, u);
    return { ok: true, user: auth.publicUser(u) };
  });

  app.post('/api/auth/logout', (req, res) => {
    // Voo ID users finish at /auth/voosquare/logout, which also ends the VooSquare session.
    const viaVoo = voo.enabled() && req.user && req.user.voo_id;
    if (!viaVoo) auth.endSession(req, res);
    return { ok: true, next: viaVoo ? '/auth/voosquare/logout' : null };
  });

  // First visit after a VooSquare sign-up: business name, niche, team size and Moji.
  app.post('/api/auth/onboard', req => {
    auth.needWs(req);
    const b = req.body || {};
    const w = req.ws;
    const patch = { onboarding: false };
    if (b.niche) patch.niche = String(b.niche).slice(0, 60);
    if (b.team) patch.team = String(b.team).slice(0, 20);
    ws.saveSettings(w.id, patch);
    const name = String(b.business || '').trim().slice(0, 80);
    if (name && ['owner', 'admin'].includes(req.role)) db.update('workspaces', w.id, { name });
    if (b.name) db.update('users', req.user.id, { name: String(b.name).trim().slice(0, 80) || req.user.name });
    if (b.moji) db.update('users', req.user.id, { moji: JSON.stringify(cleanMoji(b.moji)) });
    return { ok: true };
  });

  app.get('/api/auth/me', req => ({ user: req.user ? auth.publicUser(req.user) : null, workspace_id: req.ws ? req.ws.id : null }));

  app.post('/api/auth/forgot', mailLimit, req => {
    const u = db.one('SELECT * FROM users WHERE email = ?', String((req.body || {}).email || '').trim().toLowerCase());
    if (u && !u.suspended && (!voo.enabled() || u.role === 'admin')) {
      const raw = makeToken(u.id, 'reset', 1);
      mailer.send(u.email, 'password-reset', { name: first(u.name), reset_url: config.appUrl + '/app/reset?token=' + raw });
    }
    return { ok: true };
  });

  app.post('/api/auth/reset', loginLimit, (req, res) => {
    const b = req.body || {};
    if (String(b.password || '').length < 8) throw new HttpError(400, 'Your password needs at least 8 characters.');
    const t = useToken(b.token, 'reset');
    if (!t) throw new HttpError(400, 'This reset link is invalid or has expired. Ask for a new one.');
    db.update('users', t.user_id, { password_hash: hashPassword(b.password) });
    db.run('DELETE FROM sessions WHERE user_id = ?', t.user_id);
    auth.startSession(req, res, db.one('SELECT * FROM users WHERE id = ?', t.user_id));
    return { ok: true };
  });

  app.post('/api/auth/verify', req => {
    const t = useToken((req.body || {}).token, 'verify');
    if (!t) throw new HttpError(400, 'This link is invalid or has expired.');
    db.update('users', t.user_id, { email_verified: 1 });
    return { ok: true };
  });

  app.post('/api/auth/resend-verify', mailLimit, req => { auth.needUser(req); if (!req.user.email_verified) sendVerify(req.user); return { ok: true }; });

  app.get('/api/auth/invite', req => {
    const inv = db.one('SELECT i.*, w.name ws_name FROM invites i JOIN workspaces w ON w.id = i.workspace_id WHERE token_hash = ?', sha256(String(req.query.token || '')));
    if (!inv || inv.accepted_at || new Date(inv.expires_at) < new Date()) throw new HttpError(400, 'This invite is invalid or has expired.');
    return { email: inv.email, workspace: inv.ws_name, has_account: !!db.one('SELECT id FROM users WHERE email = ?', inv.email), voo: voo.enabled() };
  });

  app.post('/api/auth/invite/accept', loginLimit, (req, res) => {
    const b = req.body || {};
    const inv = db.one('SELECT * FROM invites WHERE token_hash = ?', sha256(String(b.token || '')));
    if (!inv || inv.accepted_at || new Date(inv.expires_at) < new Date()) throw new HttpError(400, 'This invite is invalid or has expired.');
    let u = req.user && req.user.email.toLowerCase() === inv.email.toLowerCase() ? req.user : db.one('SELECT * FROM users WHERE email = ?', inv.email);
    if (voo.enabled()) {
      // Voo ID: log in with VooSquare first; the invite email must match the Voo ID's email.
      if (!req.user) throw new HttpError(401, 'Continue with VooSquare to join the team.', { login_url: '/auth/voosquare?return_to=' + encodeURIComponent('/app/invite?token=' + String(b.token || '')) });
      if (req.user.email.toLowerCase() !== inv.email.toLowerCase()) throw new HttpError(403, 'This invite is for ' + inv.email + '. Log in to VooSquare with that email to join.');
      u = req.user;
    } else if (u && !(req.user && req.user.id === u.id)) {
      if (!verifyPassword(b.password || '', u.password_hash)) throw new HttpError(401, 'Enter the password for ' + inv.email + ' to join.');
    }
    if (!u) {
      if (String(b.password || '').length < 8) throw new HttpError(400, 'Choose a password with at least 8 characters.');
      const id = db.insert('users', { email: inv.email, name: String(b.name || inv.email.split('@')[0]).slice(0, 80), password_hash: hashPassword(b.password), email_verified: 1, moji: JSON.stringify(cleanMoji(b.moji)), created_at: db.now() });
      u = db.one('SELECT * FROM users WHERE id = ?', id);
    }
    db.tx(() => {
      if (!ws.memberRole(inv.workspace_id, u.id)) db.insert('members', { workspace_id: inv.workspace_id, user_id: u.id, role: inv.role, created_at: db.now() });
      db.update('invites', inv.id, { accepted_at: db.now() });
    });
    auth.startSession(req, res, u, inv.workspace_id);
    return { ok: true };
  });

  return { makeToken, sendVerify, cleanMoji };
};
