/* Replyvoo dashboard: "Help" panel. Customers write to the Replyvoo team; replies from the support desk show up here.
   Opens from the Help button in the top bar, the mobile menu, or ?help=1 in the address (support emails link there). */
(function () {
  'use strict';
  const RV = window.RV;
  const { $, esc, POST, GET, toast } = RV;
  const TOPICS = [['setup', 'Setup help', 'Telegram, Closers, website chat'], ['billing', 'Billing', 'Plans, credits, payments'], ['other', 'Something else', 'Ideas, bugs, anything']];
  let data = null; let view = 'list'; let cur = null; let topic = 'setup'; let poll = null;

  const when = iso => { const d = new Date(iso); return new Date().toDateString() === d.toDateString() ? d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : d.toLocaleDateString([], { day: 'numeric', month: 'short' }); };
  const status = s => s === 'solved' ? '<span class="hp-st done">Solved</span>' : s === 'pending' ? '<span class="hp-st rep">Replied</span>' : '<span class="hp-st">Open</span>';
  const textHtml = s => esc(s).replace(/(https?:\/\/[^\s<]+)/g, '<a href="$1" target="_blank" rel="noopener">$1</a>').replace(/\n/g, '<br>');
  const unread = () => (data ? data.tickets.reduce((n, t) => n + (t.unread || 0), 0) : 0);
  function dot() { const n = unread(); RV.qsa('[data-help-dot]').forEach(d => { d.hidden = !n; }); }

  async function load() { data = await GET('/api/app/support'); dot(); return data; }

  function head(title, sub, back) {
    return '<div class="hp-h">' + (back ? '<button class="hp-back" data-hp="back" aria-label="Back">' + RV.ic('back', '#121110', 18, 2.4) + '</button>' : '<span class="hp-team" aria-hidden="true"><i style="background:#FFC21A"></i><i style="background:#8FB8FF"></i><i style="background:#7EE0B0"></i></span>') +
      '<div class="col" style="gap:0;min-width:0"><strong class="h3 ell">' + title + '</strong><span class="small muted">' + sub + '</span></div></div>';
  }

  function render() {
    const m = $('modalRoot') && document.querySelector('#modalRoot .modal.hp');
    if (!m) return;
    const body = m.querySelector('.hp-body');
    if (view === 'list') {
      const t = data.tickets;
      body.innerHTML = head('Talk to our team', 'Real people. We usually reply within a few hours.') +
        '<button class="hp-new" data-hp="new"><span class="hp-plus">+</span><span class="col" style="gap:0"><strong>Ask a question</strong><span class="small muted">Setup, billing or anything else</span></span>' + RV.ic('right', '#121110', 18, 2.4) + '</button>' +
        (t.length ? '<div class="hp-sub">Your conversations</div><div class="hp-list">' + t.map((x, i) => '<button class="hp-row a-in" style="animation-delay:' + i * 0.04 + 's" data-ref="' + esc(x.ref) + '"><span class="col grow" style="gap:1px;min-width:0"><span class="row" style="gap:8px;justify-content:space-between"><strong class="ell">' + esc(x.subject || 'Your question') + '</strong><span class="small muted">' + when(x.last_message_at) + '</span></span><span class="small muted ell">' + esc(x.last_text) + '</span><span class="row" style="gap:6px;margin-top:3px">' + status(x.status) + '<span class="small muted">' + esc(x.ref) + '</span></span></span>' + (x.unread ? '<span class="hp-dot"></span>' : '') + '</button>').join('') + '</div>' : '<div class="hp-empty"><strong>No conversations yet</strong><span class="small muted">Ask anything. Your questions and our replies stay here.</span></div>') +
        '<div class="hp-alt">' + (data.telegram ? '<a href="https://t.me/' + esc(data.telegram) + '" target="_blank" rel="noopener">' + RV.brandIcon('telegram', 20) + 'Message us on Telegram</a>' : '') + (data.email ? '<a href="mailto:' + esc(data.email) + '">' + RV.ic('M4 6h16v12H4zM4 7l8 6 8-6', '#121110', 18, 2) + esc(data.email) + '</a>' : '') + '</div>';
    } else if (view === 'new') {
      body.innerHTML = head('Ask a question', 'Tell us what’s going on. Screens and steps help.', true) +
        '<form class="col" id="hpForm" style="gap:14px" novalidate><div class="hp-topics" role="radiogroup" aria-label="Topic">' + TOPICS.map(x => '<button type="button" role="radio" aria-checked="' + (topic === x[0]) + '" class="hp-topic' + (topic === x[0] ? ' on' : '') + '" data-topic="' + x[0] + '"><strong>' + x[1] + '</strong><span>' + x[2] + '</span></button>').join('') + '</div>' +
        '<div class="field"><label class="lbl" for="hpSubj">Subject</label><input id="hpSubj" class="input" maxlength="120" placeholder="e.g. My bot isn’t replying"></div>' +
        '<div class="field"><label class="lbl" for="hpText">Message</label><textarea id="hpText" class="input" rows="5" maxlength="6000" placeholder="What happened, and what did you expect?"></textarea></div>' +
        '<button class="btn btn-ink" type="submit" id="hpSend" style="padding:15px">Send to the team</button></form>';
      $('hpSubj').focus();
    } else {
      const t = cur;
      body.innerHTML = head(esc(t.subject || 'Your question'), esc(t.ref) + ' · ' + (t.status === 'solved' ? 'Solved' : t.status === 'pending' ? 'We replied' : 'We’re on it'), true) +
        '<div class="hp-msgs" id="hpMsgs">' + t.messages.map(m => '<div class="hp-msg ' + (m.dir === 'in' ? 'me' : 'them') + '"><div class="hp-bub">' + textHtml(m.text) + '</div><span class="hp-mm">' + (m.dir === 'in' ? 'You' : esc(m.author_name || 'Replyvoo team') + ' · Replyvoo') + ' · ' + when(m.created_at) + '</span></div>').join('') + '</div>' +
        '<form class="hp-reply" id="hpReply" novalidate><textarea id="hpR" class="input" rows="2" maxlength="6000" placeholder="' + (t.status === 'solved' ? 'Reply to reopen this conversation…' : 'Write a reply…') + '"></textarea><button class="btn btn-ink" type="submit" id="hpRGo" aria-label="Send">' + RV.ic('M5 12h14M13 6l6 6-6 6', '#FFFFFF', 18, 2.6) + '</button></form>';
      const ms = $('hpMsgs'); ms.scrollTop = ms.scrollHeight;
      if (t.unread) { t.unread = 0; POST('/api/app/support/' + encodeURIComponent(t.ref) + '/seen').catch(() => {}); dot(); }
    }
  }

  async function open(opts) {
    opts = opts || {};
    RV.modal('<div class="hp-body"><div class="col" style="gap:12px;padding:8px 0"><div class="sk" style="height:46px;width:70%"></div><div class="sk" style="height:70px"></div><div class="sk" style="height:70px"></div></div></div>', { label: 'Help', noFocus: true, onClose: () => { clearInterval(poll); } });
    const m = document.querySelector('#modalRoot .modal'); m.classList.add('hp');
    try { await load(); } catch (e) { m.querySelector('.hp-body').innerHTML = '<p>' + esc(e.message) + '</p>'; return; }
    view = opts.ref ? 'thread' : data.tickets.length ? 'list' : 'new';
    if (opts.ref) cur = data.tickets.find(t => t.ref === opts.ref) || null;
    if (view === 'thread' && !cur) view = 'list';
    render();
    clearInterval(poll);
    poll = setInterval(async () => {
      if (document.hidden || view === 'new') return;
      const before = JSON.stringify(cur ? cur.messages.length : 0);
      try { await load(); } catch (e) { return; }
      if (view === 'thread' && cur) { const fresh = data.tickets.find(t => t.ref === cur.ref); if (fresh && JSON.stringify(fresh.messages.length) !== before && !($('hpR') && $('hpR').value)) { cur = fresh; render(); } }
      else if (view === 'list') render();
    }, 15000);
  }
  RV.openHelp = open;

  document.addEventListener('click', async e => {
    if (e.target.closest('[data-help]')) { e.preventDefault(); RV.closePops && RV.closePops(); open(); return; }
    const m = e.target.closest('#modalRoot .modal.hp'); if (!m) return;
    const a = e.target.closest('[data-hp]');
    if (a && a.dataset.hp === 'new') { view = 'new'; render(); return; }
    if (a && a.dataset.hp === 'back') { view = 'list'; render(); return; }
    const tp = e.target.closest('[data-topic]'); if (tp) { topic = tp.dataset.topic; RV.qsa('.hp-topic').forEach(b => { const on = b === tp; b.classList.toggle('on', on); b.setAttribute('aria-checked', on); }); return; }
    const r = e.target.closest('[data-ref]'); if (r) { cur = data.tickets.find(t => t.ref === r.dataset.ref); view = 'thread'; render(); }
  });
  document.addEventListener('submit', async e => {
    if (e.target.id === 'hpForm') {
      e.preventDefault();
      const text = $('hpText').value.trim();
      if (text.length < 3) { $('hpText').focus(); toast('Write a short message first.', 'err'); return; }
      const btn = $('hpSend'); RV.busy(btn, true, 'Sending…');
      try { const r = await POST('/api/app/support', { topic, subject: $('hpSubj').value.trim(), text, page: RV.parse().name }); await load(); cur = data.tickets.find(t => t.ref === r.ticket.ref) || r.ticket; view = 'thread'; render(); toast('Sent! We’ll reply here and by email.'); RV.confetti && RV.confetti(18); }
      catch (er) { RV.busy(btn, false); RV.fail(er); }
    }
    if (e.target.id === 'hpReply') {
      e.preventDefault();
      const ta = $('hpR'); const text = ta.value.trim(); if (!text) { ta.focus(); return; }
      const btn = $('hpRGo'); btn.disabled = true;
      try { const r = await POST('/api/app/support/' + encodeURIComponent(cur.ref) + '/reply', { text }); cur = r.ticket; const i = data.tickets.findIndex(t => t.ref === cur.ref); if (i >= 0) data.tickets[i] = cur; render(); }
      catch (er) { btn.disabled = false; RV.fail(er); }
    }
  });
  document.addEventListener('keydown', e => { if (e.target && e.target.id === 'hpR' && e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); $('hpReply').requestSubmit(); } });

  // Quiet check for replies so the Help button can show a dot.
  RV.checkHelp = () => load().catch(() => {});
  // ?help=1 (links in support emails): open the panel once the dashboard is on screen, then tidy the address.
  if (/[?&]help=1\b/.test(location.search)) {
    let tries = 0;
    const t = setInterval(() => {
      if (++tries > 60) return clearInterval(t);
      if (!document.getElementById('helpBtn')) return;
      clearInterval(t);
      try { const u = new URL(location.href); u.searchParams.delete('help'); history.replaceState(history.state, '', u.pathname + u.search + u.hash); } catch (e) { /* ignore */ }
      open();
    }, 150);
  }
})();
