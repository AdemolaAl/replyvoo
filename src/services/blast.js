'use strict';
// Blasts: audiences and the sender that runs in the background scheduler.
const db = require('../db');
const tg = require('./telegram');
const ws = require('./workspace');
const { decrypt } = require('../lib/security');

const BASE = 'SELECT DISTINCT t.id thread_id, t.chat_id, t.channel_id FROM threads t JOIN contacts c ON c.id = t.contact_id JOIN channels ch ON ch.id = t.channel_id ' +
  'WHERE t.workspace_id = ? AND ch.type = \'telegram_bot\' AND ch.status = \'active\' AND t.business_connection_id = \'\' AND c.blocked = 0 AND t.chat_id NOT LIKE \'-%\'';

function segmentRecipients(wsId, seg) {
  if (seg === 'hot') return db.all(BASE + ' AND c.heat = \'hot\'', wsId);
  if (seg === 'no_buy') return db.all(BASE + ' AND c.stage IN (\'qualified\',\'checkout\')', wsId);
  if (seg === 'quiet') return db.all(BASE + ' AND c.last_seen < ?', wsId, new Date(Date.now() - 7 * 864e5).toISOString());
  if (seg === 'won') return db.all(BASE + ' AND c.stage = \'won\'', wsId);
  return db.all(BASE, wsId);
}

// Only charge for people the Blast actually reached: refund credits for the rest.
function refundUnsent(b, sent) {
  const per = require('./settings').get('billing').blast_people_per_credit || 10;
  const used = Math.min(b.credits, Math.ceil(sent / per));
  const refund = Math.max(0, b.credits - used);
  if (refund > 0) ws.addCredits(b.workspace_id, refund, 'Blast refund (' + (b.total - sent) + ' not reached)', 'blast:' + b.id);
  return refund;
}

const running = new Set();
async function runDue() {
  const due = db.all('SELECT * FROM blasts WHERE status = \'queued\' AND scheduled_at <= ? ORDER BY id LIMIT 3', db.now());
  for (const b of due) {
    if (running.has(b.id)) continue;
    running.add(b.id);
    db.update('blasts', b.id, { status: 'sending' });
    let sent = 0, failed = 0;
    try {
      // Never send to more people than the Blast was paid for.
      const rec = segmentRecipients(b.workspace_id, b.segment).slice(0, b.total || undefined);
      const tokens = new Map();
      for (const r of rec) {
        if (!tokens.has(r.channel_id)) { const ch = db.one('SELECT token_enc FROM channels WHERE id = ?', r.channel_id); tokens.set(r.channel_id, ch ? decrypt(ch.token_enc) : ''); }
        const tok = tokens.get(r.channel_id);
        if (!tok) { failed++; continue; }
        try {
          await tg.sendText(tok, r.chat_id, b.message);
          const thread = db.one('SELECT * FROM threads WHERE id = ?', r.thread_id);
          require('./engine').addMessage(thread, 'out', 'system', b.message, 'text', { blast_id: b.id });
          sent++;
        } catch (e) {
          if (e.retryAfter) await new Promise(res => setTimeout(res, (e.retryAfter + 1) * 1000));
          failed++;
          if (e.code === 403) db.run('UPDATE contacts SET blocked = 1 WHERE id = (SELECT contact_id FROM threads WHERE id = ?)', r.thread_id);
        }
        if ((sent + failed) % 20 === 0) { db.update('blasts', b.id, { sent, failed }); await new Promise(res => setTimeout(res, 1100)); }
      }
      const refund = refundUnsent(b, sent);
      db.update('blasts', b.id, { status: sent ? 'sent' : 'failed', sent, failed, total: rec.length, credits: b.credits - refund });
      ws.event(b.workspace_id, 'blast', (sent ? 'Blast sent to ' + sent + ' people' + (failed ? ' (' + failed + ' could not be reached)' : '') : 'Blast could not be delivered to anyone') + (refund ? '. ' + refund + ' credit' + (refund > 1 ? 's' : '') + ' refunded.' : ''), { blast_id: b.id });
    } catch (e) {
      console.error('[blast]', e.message);
      let refund = 0;
      try { refund = refundUnsent(b, sent); } catch (e2) { console.error('[blast] refund', e2.message); }
      db.update('blasts', b.id, { status: 'failed', sent, failed, credits: b.credits - refund });
    } finally { running.delete(b.id); }
  }
}

module.exports = { segmentRecipients, runDue };
