'use strict';
// Notification emails with simple throttling so nobody gets spammed.
const db = require('../db');
const config = require('../config');
const mailer = require('./mailer');

function ws() { return require('./workspace'); }
function ownerOf(wsId) { return db.one('SELECT u.* FROM workspaces w JOIN users u ON u.id = w.owner_id WHERE w.id = ?', wsId); }
function first(name) { return String(name || '').split(' ')[0] || 'there'; }

function throttled(wsId, key, hours) {
  const w = ws().get(wsId);
  const last = w.settings['mail_' + key];
  if (last && Date.now() - new Date(last).getTime() < hours * 3600e3) return true;
  ws().saveSettings(wsId, { ['mail_' + key]: db.now() });
  return false;
}

module.exports = {
  lowCredits(w) {
    require('./payments').autoTopup(w.id).catch(e => console.warn('[auto-topup]', e.message));
    if (throttled(w.id, 'low', 24)) return;
    const o = ownerOf(w.id); if (!o) return;
    ws().event(w.id, 'credits', 'Your Voo Wallet is low: ' + w.credits + ' credits left.');
    mailer.send(o.email, 'low-credits', { name: first(o.name), balance: String(w.credits), topup_url: config.appUrl + '/app/wallet' });
  },
  outOfCredits(wsId) {
    if (throttled(wsId, 'empty', 12)) return;
    const o = ownerOf(wsId); if (!o) return;
    ws().event(wsId, 'credits', 'Your Closers paused: no conversations or credits left. Top up to switch them back on.');
    mailer.send(o.email, 'low-credits', { name: first(o.name), balance: '0', topup_url: config.appUrl + '/app/wallet' });
  },
  planExpired(wsId, plan) {
    const o = ownerOf(wsId); if (!o) return;
    mailer.send(o.email, 'plan-expired', { name: first(o.name), plan: plan.name, renew_url: config.appUrl + '/app/plan' });
  },
  handoff(wsId, thread, contact, closerName, snippet) {
    if (throttled(wsId, 'handoff_' + thread.id, 6)) return;
    const o = ownerOf(wsId); if (!o) return;
    const w = ws().get(wsId);
    if (w.settings.alerts && w.settings.alerts.handoff === false) return;
    mailer.send(o.email, 'handoff-alert', { name: first(o.name), customer: contact.name || 'A customer', closer_name: closerName || 'Your Closer', snippet: String(snippet).slice(0, 180), inbox_url: config.appUrl + '/app/inbox?t=' + thread.id });
  }
};
