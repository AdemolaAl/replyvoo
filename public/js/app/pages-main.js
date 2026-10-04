/* Replyvoo dashboard pages: Home, Live Room, Pulse Inbox, Leads. */
(function () {
  'use strict';
  const RV = window.RV;
  const { $, esc, fmt, GET, PUT, POST, toast, fail, go, ic, avatar, ago } = RV;
  const S = RV.S;

  /* ---------- shared bits ---------- */
  const HEAT = { hot: ['#FFE3D6', '#9A3412', 'Hot 🔥'], warm: ['#FFF3CC', '#7A5800', 'Warm'], cold: ['#E3ECFF', '#1E3A8A', 'Cold'], won: ['#121110', '#FFC21A', 'Won'] };
  const STAGE = { new: ['#E8F6EC', '#1E6B3A', 'New'], qualified: ['#FFF3CC', '#7A5800', 'Qualified'], checkout: ['#FFE3D6', '#9A3412', 'Checkout'], won: ['#121110', '#FFC21A', 'Won'], lost: ['#F2F0EA', '#5E5A50', 'Lost'] };
  const heatPill = h => { const m = HEAT[h] || HEAT.cold; return '<span class="heat" style="background:' + m[0] + ';color:' + m[1] + '">' + m[2] + '</span>'; };
  const stagePill = s => { const m = STAGE[s] || STAGE.new; return '<span class="heat" style="background:' + m[0] + ';color:' + m[1] + '">' + m[2] + '</span>'; };
  RV.heatPill = heatPill; RV.stagePill = stagePill; RV.HEAT = HEAT; RV.STAGE = STAGE;
  const panel = (cls, head, body, attrs) => '<section class="panel ' + (cls || '') + '" ' + (attrs || '') + '>' + (head ? '<div class="panel-h">' + head + '</div>' : '') + body + '</section>';
  RV.panel = panel;
  const closerName = id => { const c = (S.closers || []).find(x => x.id === id); return c ? c.name : ''; };
  const closerOf = id => (S.closers || []).find(x => x.id === id);
  function botFor(closerId, size) { const c = closerOf(closerId); const t = RV.tpl(c ? c.template : 'sales'); return RV.closerBot(t.color, size, t.letter); }
  RV.botFor = botFor;
  const pagePath = u => { try { const x = new URL(u); return (x.pathname + x.search).slice(0, 60) || '/'; } catch (e) { return String(u || '').slice(0, 60); } };
  const contactLine = c => c.email || c.phone ? esc([c.email, c.phone].filter(Boolean).join(' · ')) : (c.username ? '@' + esc(c.username) : '');
  function msgPreview(m) { return m.kind === 'image' ? '📷 ' + (m.text || 'Photo') : m.kind === 'voice' ? '🎙 ' + (m.text && m.text !== '[voice note]' ? m.text : 'Voice note') : (m.text || ''); }

  function bars(vals, h, hi) {
    const max = Math.max(1, ...vals);
    return '<span class="row" style="align-items:flex-end;gap:3px;height:' + h + 'px">' + vals.map((v, j) => '<span style="width:6px;border-radius:3px;height:' + Math.max(3, v / max * h) + 'px;background:' + (j === vals.length - 1 ? (hi || '#FFC21A') : '#EEEBE2') + ';transition:height .6s"></span>').join('') + '</span>';
  }
  function sparkSvg(vals, w, h, color, id) {
    const max = Math.max(1, ...vals) * 1.15, sx = w / Math.max(1, vals.length - 1);
    const d = vals.map((x, i) => (i ? 'L' : 'M') + (i * sx).toFixed(1) + ' ' + (h - 4 - x / max * (h - 10)).toFixed(1)).join(' ');
    return '<svg viewBox="0 0 ' + w + ' ' + h + '" width="100%" height="' + h + '" preserveAspectRatio="none" aria-hidden="true"><defs><linearGradient id="' + id + '" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="' + color + '" stop-opacity=".45"/><stop offset="1" stop-color="' + color + '" stop-opacity="0"/></linearGradient></defs><path d="' + d + ' L' + w + ' ' + h + ' L0 ' + h + 'Z" fill="url(#' + id + ')"/><path d="' + d + '" fill="none" stroke="' + color + '" stroke-width="2.5" stroke-linejoin="round" vector-effect="non-scaling-stroke"/></svg>';
  }
  RV.sparkSvg = sparkSvg;

  /* ======================= HOME ======================= */
  async function home(ctx) {
    const mgr = RV.isManager();
    const [stats, closers, channels, team] = await Promise.all([GET('/api/app/stats'), RV.loadClosers(true), RV.loadChannels(true), mgr ? GET('/api/app/team').catch(() => null) : Promise.resolve(null)]);
    if (!ctx.ok()) return;
    RV.paintChrome();
    const b = S.boot, u = stats.usage, me = b.user, fn = RV.first(me.name);
    const hr = new Date().getHours(), greet = hr < 12 ? 'Good morning' : hr < 18 ? 'Good afternoon' : 'Good evening';
    const T = stats.today;
    const checks = [
      ['Connect a Telegram channel', channels.length > 0, '/app/channels'],
      ['Create your first Closer', closers.length > 0, RV.flag('studio') ? '/app/studio' : '/app/closers'],
      ['Teach it your FAQ and prices', closers.some(c => (c.knowledge || '').length > 40), closers[0] ? '/app/studio?id=' + closers[0].id : '/app/studio'],
      ['Get your first AI reply', closers.some(c => c.replies > 0) || T.replies > 0, RV.flag('live_room') ? '/app/live' : '/app/inbox'],
      ['Invite a teammate', u.seats_used > 1 || !!(team && team.invites.length), '/app/team']
    ];
    const done = checks.filter(c => c[1]).length, pct = done / checks.length, C = 2 * Math.PI * 34;
    const rpmNow = stats.rpm[stats.rpm.length - 1] || 0;
    const series = stats.series;
    const kpis = [
      ['kChats', 'Chats today', T.chats, '#E8F6EC', '#1E6B3A', series.map(s => s.chats).slice(-8), 'today'],
      ['kReplies', 'Closer replies', T.replies, '#FFF3CC', '#7A5800', series.map(s => s.replies).slice(-8), 'by AI'],
      ['kHand', 'Waiting for you', T.handoffs, '#F1E8FF', '#5B21B6', null, T.handoffs ? 'reply now' : 'all clear'],
      ['kHot', 'Hot leads', T.hot, '#FFE3D6', '#9A3412', null, 'call first'],
      ['kWon', 'Won today', T.won, '#121110', '#FFC21A', null, 'sales']
    ];
    const plan = u.plan;
    const convPct = Math.min(100, u.conversations.used / Math.max(1, u.conversations.included) * 100);
    const meter = (label, used, total, warnAt, extra) => { const p = total > 0 ? Math.min(100, used / total * 100) : 0; return '<div class="col" style="gap:6px"><div class="row" style="justify-content:space-between;font-size:14px;font-weight:700"><span>' + label + '</span><span class="tnum">' + fmt(used) + ' / ' + (total > 9000 ? '∞' : fmt(total)) + '</span></div><div class="meter' + (p >= (warnAt || 85) ? ' warn' : '') + '"><span style="width:' + p + '%"></span></div>' + (extra || '') + '</div>'; };
    const next = (b.plans || []).filter(p => !p.contact_sales && p.price_month > plan.price_month).sort((a, c) => a.price_month - c.price_month)[0];
    const hasChats = stats.total_contacts > 0;

    ctx.el.innerHTML = '<div class="dgrid">' +
      '<div class="c8 hero-ink a-in"><div class="mesh a-mesh" style="width:380px;height:380px;right:-120px;top:-140px;background:#FFC21A;opacity:.3"></div>' +
      '<div class="col" style="flex:1 1 280px;min-width:0;gap:12px;position:relative">' +
      '<div class="row" style="gap:12px">' + '<span class="moji-c a-floats" style="width:64px;height:64px;background:linear-gradient(160deg,#FFD23F,#FFC21A)">' + RV.moji(me.moji, 74, true, true) + '</span>' + '<span class="col" style="gap:0"><span style="font-size:13px;font-weight:700;color:var(--jade)">' + esc(b.workspace.name) + '</span><span style="font-size:12.5px;color:#A8A294">' + esc(plan.name) + ' plan</span></span></div>' +
      '<strong style="font-size:clamp(26px,3.4vw,40px);letter-spacing:-0.045em;line-height:1.02">' + greet + (fn ? ', ' + esc(fn) : '') + '.</strong>' +
      '<span style="color:#C4BFB3;font-size:15.5px">' + (hasChats ? 'Your Closers sent <b class="tnum" style="color:#fff" data-count="' + T.replies + '">0</b> replies across <b class="tnum" style="color:#fff">' + fmt(T.chats) + '</b> chats today. ' + (T.handoffs ? '<b style="color:#fff">' + T.handoffs + (T.handoffs === 1 ? ' person is' : ' people are') + '</b> waiting for a human.' : 'Nobody is waiting for a human.') : 'Let’s get your first Closer answering customers. Finish the checklist and you’re live.') + '</span>' +
      '<div class="row" style="flex-wrap:wrap;gap:8px;margin-top:4px">' + (hasChats ? '<a class="btn btn-jade btn-sm" href="/app/inbox">Open Pulse Inbox</a>' : '<a class="btn btn-jade btn-sm" href="' + (channels.length ? (RV.flag('studio') ? '/app/studio' : '/app/closers') : '/app/channels') + '">' + (channels.length ? 'Build a Closer' : 'Connect Telegram') + '</a>') + (RV.flag('juno') ? '<a class="btn btn-dark btn-sm" href="/app/juno">Ask Juno</a>' : '') + '</div></div>' +
      '<div class="ink-box col" style="flex:1 1 240px;min-width:0;gap:6px;position:relative"><span class="row" style="gap:6px;font-size:12.5px;font-weight:700;color:#A8A294"><span class="live-dot y"></span>Replies per minute</span><b class="tnum" id="rpmNow" style="font-size:38px;letter-spacing:-0.05em;color:var(--jade);line-height:1.1">' + rpmNow + '</b><div id="rpmWrap" style="height:70px">' + sparkSvg(stats.rpm.length > 1 ? stats.rpm : [0, 0], 300, 70, '#FFC21A', 'rg1') + '</div><span style="font-size:12px;color:#A8A294">Last 20 minutes</span></div></div>' +
      (pct < 1 ? panel('c4 a-in', '<strong>Setup checklist</strong><span class="pill" style="background:var(--mint);color:var(--jade-dd)">' + done + '/' + checks.length + '</span>',
        '<div class="row" style="gap:16px"><svg width="84" height="84" viewBox="0 0 84 84" role="img" aria-label="' + Math.round(pct * 100) + '% set up"><circle cx="42" cy="42" r="34" fill="none" stroke="#EEEBE2" stroke-width="10"/><circle cx="42" cy="42" r="34" fill="none" stroke="#FFC21A" stroke-width="10" stroke-linecap="round" stroke-dasharray="' + C.toFixed(1) + '" stroke-dashoffset="' + C.toFixed(1) + '" data-ring="' + (C * (1 - pct)).toFixed(1) + '" transform="rotate(-90 42 42)" style="transition:stroke-dashoffset 1s var(--ease)"/><text x="42" y="48" text-anchor="middle" font-family="Plus Jakarta Sans,sans-serif" font-weight="800" font-size="18" fill="#121110">' + Math.round(pct * 100) + '%</text></svg><span class="muted small">Five quick steps and your Closers sell for you around the clock.</span></div>' +
        '<div class="col" style="gap:2px">' + checks.map(c => '<a class="chk' + (c[1] ? ' done' : '') + '" href="' + c[2] + '"><span class="ck">' + (c[1] ? '✓' : '') + '</span><span class="t">' + c[0] + '</span>' + (c[1] ? '' : '<span style="margin-left:auto;color:var(--mut2)">→</span>') + '</a>').join('') + '</div>', 'style="animation-delay:.06s"')
        : planCard(u, next, 'c4')) +
      '<div class="c12 kpi5" style="display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:14px">' + kpis.map((k, i) => '<div class="kpi lift a-in" style="animation-delay:' + (0.1 + i * 0.05) + 's' + (k[0] === 'kWon' ? ';background:#121110;color:#fff;border-color:#121110' : '') + '"><span class="k-l"' + (k[0] === 'kWon' ? ' style="color:#A8A294"' : '') + '>' + k[1] + '</span><b id="' + k[0] + '" data-count="' + k[2] + '"' + (k[0] === 'kWon' ? ' style="color:#FFC21A"' : '') + '>0</b><div class="row" style="justify-content:space-between;align-items:flex-end"><span class="pill" style="background:' + k[3] + ';color:' + k[4] + '">' + k[6] + '</span>' + (k[5] ? bars(k[5], 30) : '') + '</div></div>').join('') + '</div>' +
      panel('c8 a-in', '<strong>Last 14 days</strong><span class="row" style="gap:12px;font-size:12.5px;font-weight:700"><span class="row" style="gap:6px"><span style="width:14px;height:4px;border-radius:2px;background:#121110"></span>Chats</span><span class="row" style="gap:6px"><span style="width:14px;height:10px;border-radius:3px;background:#FFE58A"></span>Closer replies</span></span>', chart14(series), 'style="animation-delay:.3s"') +
      panel('c4 a-in', '<strong>Live activity</strong><span class="pill" style="background:#E8F6EC;color:#1E6B3A"><span class="live-dot"></span>Live</span>', '<div id="homeFeed" class="feed" style="gap:4px"></div>', 'style="animation-delay:.35s"') +
      webCard(channels) +
      panel('c6 a-in', '<strong>Your Closers</strong><a class="btn btn-ghost btn-sm" href="/app/closers">Manage</a>', closers.length ? '<div class="col" style="gap:8px">' + stats.closers.map(c => { const t = RV.tpl(c.template); const full = closers.find(x => x.id === c.id) || {}; const ch = (full.channels || [])[0]; return '<a href="' + (RV.flag('studio') ? '/app/studio?id=' + c.id : '/app/closers') + '" class="row" style="gap:12px;border:1px solid var(--line);border-radius:16px;padding:10px 12px;text-decoration:none;color:inherit;background:#fff"><span style="flex:0 0 46px">' + RV.closerBot(t.color, 46, t.letter) + '</span><span class="col grow" style="gap:0;line-height:1.3"><strong class="ell">' + esc(c.name) + ' <span style="font-weight:600;color:var(--mut);font-size:13px">· ' + esc(t.role) + '</span></strong><span class="ell" style="font-size:13px;color:var(--mut)">' + (c.active ? (ch ? 'Listening on @' + esc(ch.username || ch.name) : 'Not connected to a channel yet') : 'Paused') + '</span></span><span class="tnum" style="font-weight:800;text-align:right">' + fmt(c.today) + '<span style="font-size:11px;color:var(--mut2);display:block;font-weight:700">today</span></span></a>'; }).join('') + '</div>'
        : RV.empty('No Closers yet', 'Build your first AI Closer. Pick a job, add your FAQ and launch.', '<a class="btn btn-jade" href="' + (RV.flag('studio') ? '/app/studio' : '/app/closers') + '">Build a Closer</a>', RV.closerBot('#FFC21A', 110, 'A')), 'style="animation-delay:.4s"') +
      panel('c6 a-in', '<strong>Call these first</strong><a class="btn btn-ghost btn-sm" href="/app/leads">All leads</a>', stats.hot_leads.length ? '<div class="col" style="gap:4px">' + stats.hot_leads.map(l => '<a class="feed-row" href="/app/inbox' + (l.thread_id ? '?t=' + l.thread_id : '') + '" style="text-decoration:none;color:inherit;align-items:center">' + avatar(l.name, 38) + '<span class="col grow" style="gap:0;line-height:1.3"><span class="row" style="gap:8px"><strong class="ell">' + esc(l.name || 'Customer') + '</strong>' + heatPill(l.heat) + '</span><span class="ell small muted">' + esc(l.last_text || '') + '</span></span><span style="font-size:12px;color:var(--mut2);font-weight:700;white-space:nowrap">' + ago(l.last_seen) + '</span></a>').join('') + '</div>'
        : RV.empty('No hot leads yet', 'When someone asks for a price or a payment link, HeatScore puts them here.', ''), 'style="animation-delay:.45s"') +
      panel('c4 a-in', '<strong>Usage this period</strong><span class="pill" style="background:var(--soft);border:1px solid var(--line)">' + (u.plan && u.plan.price_month > 0 ? 'Ends ' : 'Resets ') + RV.date(u.period_end) + '</span>',
        meter('Conversations', u.conversations.used, u.conversations.included, 85, convPct >= 85 ? '<span class="small" style="color:#9A2A12;font-weight:700">Running low. Extra chats use Voo Credits.</span>' : '') +
        meter('AI Closers', u.closers_used, u.closers_limit, 100) +
        meter('Team seats', u.seats_used, u.seats_limit, 100) +
        (RV.flag('pro_brain') && u.pro.included ? meter('Pro Brain chats', u.pro.used, u.pro.included, 90) : '') +
        (RV.flag('wallet') ? '<a href="/app/wallet" class="row" style="justify-content:space-between;background:var(--soft);border:1px solid var(--line);border-radius:14px;padding:10px 12px;text-decoration:none;color:inherit"><span class="row" style="gap:8px;font-weight:700"><span style="width:24px;height:24px;border-radius:50%;background:var(--jade);display:flex;align-items:center;justify-content:center;font-size:12px;font-weight:800">V</span>Voo Credits</span><b class="tnum" data-bal data-v="' + S.credits + '">' + fmt(S.credits) + '</b></a>' : ''), 'style="animation-delay:.5s"') +
      (pct < 1 ? planCard(u, next, 'c4') : panel('c4 a-in', '<strong>Channels</strong><a class="btn btn-ghost btn-sm" href="/app/channels">Manage</a>', '<div class="col" style="gap:8px">' + channels.slice(0, 4).map(c => '<div class="row" style="gap:10px">' + RV.brandIcon(c.type === 'website' ? 'website' : 'telegram', 36) + '<span class="col grow" style="gap:0"><strong class="ell">' + esc(c.username ? '@' + c.username : c.name) + '</strong><span class="small muted">' + fmt(c.chats) + ' chats</span></span></div>').join('') + '</div>')) +
      (RV.joinvooOn() ? joinvooPromo('c4') : '') +
      '</div>';
    // count-ups + ring
    requestAnimationFrame(() => {
      RV.qsa('[data-count]', ctx.el).forEach(el => RV.countTo(el, +el.getAttribute('data-count'), { dur: 1100 }));
      RV.qsa('[data-ring]', ctx.el).forEach(el => { el.style.strokeDashoffset = el.getAttribute('data-ring'); });
    });
    paintFeed();
    const sc = $('homeScene'); if (sc) { if (S.homeScene) S.homeScene.stop(); S.homeScene = RV.mountScene(sc, { compact: true }); }
    ctx.el.querySelectorAll('[data-weblock]').forEach(x => x.addEventListener('click', RV.websiteLocked));
    if (ctx.el.querySelector('.web-hero') && RV.isManager() && !RV.store.get('web_spot_seen', false)) { RV.store.set('web_spot_seen', true); setTimeout(() => { if (ctx.ok() && !document.querySelector('#modalRoot .modal')) webSpotlight(); }, 1800); }
    let lastStats = Date.now();
    RV.onLive(d => {
      if (!ctx.ok()) return;
      if (d.messages.length || d.events.length) paintFeed();
      if ((d.messages.length || d.events.length) && Date.now() - lastStats > 8000) {
        lastStats = Date.now();
        GET('/api/app/stats').then(s => {
          if (!ctx.ok()) return;
          const T2 = s.today;
          [['kChats', T2.chats], ['kReplies', T2.replies], ['kHand', T2.handoffs], ['kHot', T2.hot], ['kWon', T2.won]].forEach(k => RV.countTo($(k[0]), k[1]));
          const rn = $('rpmNow'); if (rn) rn.textContent = s.rpm[s.rpm.length - 1] || 0;
          const rw = $('rpmWrap'); if (rw) rw.innerHTML = sparkSvg(s.rpm, 300, 70, '#FFC21A', 'rg1');
        }).catch(() => {});
      }
    });
  }
  // Website chat: an attention-grabbing, step-by-step card (or a calm status card once it is live).
  function webCard(channels) {
    if (RV.chan('website') === 'off' || !RV.mountScene) return '';
    const sites = channels.filter(c => c.type === 'website' && c.status === 'active');
    const live = sites.find(c => c.install && c.install.seen_at);
    if (live) {
      return '<section class="c12 panel a-in web-home" style="animation-delay:.38s"><div class="col" style="gap:10px;min-width:0"><span class="eyebrow">Website chat · Live</span><strong style="font-size:clamp(22px,2.6vw,30px);letter-spacing:-0.045em;line-height:1.08">Your <span class="wh-word">website</span> is answering like your best salesperson.</strong>' +
        '<span class="muted" style="font-size:15px">Live on <b style="color:var(--ink)">' + esc(live.install.host) + '</b> · ' + fmt(live.chats) + ' chats · ' + fmt(live.leads || 0) + ' leads captured.</span>' +
        '<div class="row" style="gap:8px;flex-wrap:wrap"><a class="btn btn-jade btn-sm" href="/app/widget">Open Widget Studio</a></div></div><div id="homeScene" style="min-width:0"></div></section>';
    }
    const site = sites[0];
    const mgr = RV.isManager();
    const can = RV.webCanAdd();
    const tag = site || can ? 'Included in your plan' : 'Add it for $29/mo or upgrade';
    const step = (n, done, title, body) => '<li class="wh-step' + (done ? ' done' : '') + '"><span class="wh-n">' + (done ? ic('check', '#121110', 14, 3) : n) + '</span><span class="col" style="gap:2px;min-width:0"><strong>' + title + '</strong><span>' + body + '</span></span></li>';
    const code = site ? '<div class="wh-code"><code>' + esc(site.snippet) + '</code><button type="button" class="btn btn-jade btn-sm" data-web-copy="' + esc(site.snippet) + '">' + ic('copy', '#121110', 15, 2.4) + 'Copy code</button></div>' : '';
    const primary = !mgr ? '' : site ? '<a class="btn btn-main wh-cta" href="/app/widget?id=' + site.id + '&tab=install">Finish setup: paste your code<span class="arr">' + ic('right', '#FFC21A', 18, 2.6) + '</span></a>'
      : can ? '<a class="btn btn-main wh-cta" href="/app/widget?new=1">Add chat to my website<span class="arr">' + ic('right', '#FFC21A', 18, 2.6) + '</span></a>'
      : '<button class="btn btn-main wh-cta" data-weblock>Add chat to my website<span class="arr">' + ic('right', '#FFC21A', 18, 2.6) + '</span></button>';
    return '<section class="c12 a-in web-hero" style="animation-delay:.38s" aria-labelledby="whH"><div class="wh-glow" aria-hidden="true"></div>' +
      '<div class="wh-copy"><div class="row" style="gap:8px;flex-wrap:wrap"><span class="wh-new"><i></i>NEW</span><span class="wh-tag">' + esc(tag) + '</span></div>' +
      '<h2 id="whH" class="wh-h">Put your AI Closer on your <span class="wh-word">website</span>. <span class="it">Every visitor answered in seconds.</span></h2>' +
      '<p class="wh-p">A chat bubble appears on your site. Visitors ask, your Closer answers like your best salesperson, and every name and number lands in your Leads.</p>' +
      '<ol class="wh-steps">' + step(1, !!site, 'Style it', 'Your colours, logo and greeting.') + step(2, false, 'Copy 1 line of code', site ? 'It’s ready below. Tap “Copy code”.' : 'We make it for you.') + step(3, false, 'Paste on your site', 'Shopify, WordPress, Wix or any site. Live in 2 minutes.') + '</ol>' + code +
      '<div class="row" style="gap:10px;flex-wrap:wrap;align-items:center">' + primary + '<button type="button" class="btn btn-ghost-d wh-how" data-web-how>' + ic('play', '#FFC21A', 14, 2.6) + 'See how it works</button></div></div>' +
      '<div class="wh-art"><span class="wh-arrow" aria-hidden="true">This could be your site ↓</span><div id="homeScene" style="min-width:0"></div></div></section>';
  }
  // A short "how it works" spotlight. Shown once automatically for owners who haven't installed it yet.
  function webSpotlight() {
    const m = RV.modal('<div class="col wh-spot" style="gap:14px"><div class="row" style="gap:8px"><span class="wh-new dark"><i></i>NEW</span><span class="eyebrow">Website chat</span></div>' +
      '<h2 class="h3" style="margin:0;font-size:clamp(24px,4vw,32px);letter-spacing:-0.045em;line-height:1.05">Your <span class="wh-word">website</span> can sell while you sleep.</h2>' +
      '<div id="spotScene" style="min-width:0"></div>' +
      '<ol class="wh-steps light"><li class="wh-step"><span class="wh-n">1</span><span class="col" style="gap:2px"><strong>Style it</strong><span>Colours, logo, greeting.</span></span></li><li class="wh-step"><span class="wh-n">2</span><span class="col" style="gap:2px"><strong>Copy 1 line</strong><span>We give you the code.</span></span></li><li class="wh-step"><span class="wh-n">3</span><span class="col" style="gap:2px"><strong>Paste & go live</strong><span>Answers start in seconds.</span></span></li></ol>' +
      (RV.isManager() ? '<a class="btn btn-main" href="' + (RV.webCanAdd() ? '/app/widget?new=1' : '/app/widget') + '" data-close style="justify-content:space-between">Add chat to my website<span class="arr">' + ic('right', '#121110', 18, 2.6) + '</span></a>' : '') +
      '<button type="button" class="btn-link small" data-close style="color:var(--mut)">Maybe later</button></div>', { wide: true, label: 'Website chat', noFocus: true });
    const sc = m && m.querySelector('#spotScene'); let run = sc ? RV.mountScene(sc, {}) : null;
    const obs = new MutationObserver(() => { if (!document.contains(sc)) { if (run && run.stop) run.stop(); run = null; obs.disconnect(); } }); obs.observe(document.body, { childList: true, subtree: true });
  }
  RV.webSpotlight = webSpotlight;
  document.addEventListener('click', e => {
    const c = e.target.closest && e.target.closest('[data-web-copy]');
    if (c) {
      const t = c.getAttribute('data-web-copy');
      const ok = () => { RV.toast('Code copied. Now paste it on your website.', 'ok'); c.innerHTML = ic('check', '#121110', 15, 3) + 'Copied!'; setTimeout(() => { c.innerHTML = ic('copy', '#121110', 15, 2.4) + 'Copy code'; }, 2200); };
      try { navigator.clipboard.writeText(t).then(ok, () => RV.toast('Select the code and copy it.', 'info')); } catch (er) { RV.toast('Select the code and copy it.', 'info'); }
      return;
    }
    if (e.target.closest && e.target.closest('[data-web-how]')) webSpotlight();
  });
  function planCard(u, next, cls) {
    const p = u.plan;
    return '<section class="' + cls + ' a-in" style="background:linear-gradient(160deg,#FFD23F,#FFC21A);border-radius:24px;padding:20px;display:flex;flex-direction:column;gap:10px;position:relative;overflow:hidden;min-width:0"><div class="mesh a-mesh" style="width:220px;height:220px;right:-80px;bottom:-90px;background:#fff;opacity:.45"></div>' +
      '<span class="eyebrow" style="color:#3B3000">Your plan</span><strong style="font-size:30px;letter-spacing:-0.045em;line-height:1;position:relative">' + esc(p.name) + '</strong><span style="font-size:14px;color:#3B3000;position:relative">' + (p.price_month > 0 ? RV.usd(p.price_month) + '/month · ' : 'Free · ') + fmt(p.conversations) + ' conversations · ' + (p.closers > 999 ? 'unlimited' : p.closers) + (p.closers === 1 ? ' Closer' : ' Closers') + '</span>' +
      (next && RV.isManager() ? '<div class="col" style="gap:8px;margin-top:auto;position:relative"><span style="font-size:13.5px;font-weight:700">Upgrade to ' + esc(next.name) + ' for ' + fmt(next.conversations) + ' conversations and ' + (next.closers > 999 ? 'unlimited' : next.closers) + ' Closers.</span><a class="btn btn-ink" href="/app/plan">' + ic('upgrade', '#FFC21A', 18, 2.4) + 'See plans</a></div>' : '<a class="btn btn-ink" href="/app/plan" style="margin-top:auto;position:relative">View plan</a>') + '</section>';
  }
  function joinvooPromo(cls) {
    const j = S.boot.joinvoo || {};
    return '<section class="' + cls + ' a-in" style="background:var(--ink);color:#fff;border-radius:24px;padding:20px;display:flex;flex-direction:column;gap:10px;position:relative;overflow:hidden;min-width:0"><div class="mesh a-mesh2" style="width:240px;height:240px;right:-90px;top:-100px;background:#FFC21A;opacity:.3"></div>' +
      '<span class="row" style="gap:8px;position:relative"><span class="pill" style="background:transparent;border:1px solid #5A4A1A;color:var(--jade)">Sister app</span><strong style="color:var(--jade)">Joinvoo</strong></span>' +
      '<strong style="font-size:19px;letter-spacing:-0.03em;line-height:1.2;position:relative">' + esc(j.headline || 'Running ads to Telegram? Stop paying for fake traffic.') + '</strong>' +
      '<svg viewBox="0 0 260 50" width="100%" height="50" aria-hidden="true" style="position:relative">' + [0, 1, 2, 3, 4].map(i => '<g class="walker" style="animation-delay:' + (i * 1) + 's"><circle cx="0" cy="18" r="7" fill="' + (i % 2 ? '#7EE0B0' : '#FFFFFF') + '" opacity="' + (i % 2 ? 1 : 0.35) + '"/><path d="M-9 44c0-10 4-16 9-16s9 6 9 16z" fill="' + (i % 2 ? '#7EE0B0' : '#FFFFFF') + '" opacity="' + (i % 2 ? 1 : 0.35) + '"/></g>').join('') + '</svg>' +
      '<div class="row" style="gap:8px;margin-top:auto;position:relative;flex-wrap:wrap"><a class="btn btn-jade btn-sm" href="/go/joinvoo?from=dashboard_home" rel="noopener">Visit Joinvoo</a><a class="btn btn-dark btn-sm" href="/app/joinvoo">How it works</a></div></section>';
  }
  RV.joinvooPromo = joinvooPromo;
  function chart14(series) {
    const W = 600, H = 190, n = series.length;
    const max = Math.max(4, ...series.map(s => Math.max(s.chats, s.replies))) * 1.15, sx = W / Math.max(1, n - 1);
    const y = v => H - 8 - v / max * (H - 20);
    const line = k => series.map((s, i) => (i ? 'L' : 'M') + (i * sx).toFixed(1) + ' ' + y(s[k]).toFixed(1)).join(' ');
    const grid = [0, 1, 2, 3].map(g => '<line x1="0" x2="' + W + '" y1="' + (12 + g * ((H - 20) / 3)).toFixed(1) + '" y2="' + (12 + g * ((H - 20) / 3)).toFixed(1) + '" stroke="#EEEBE2" stroke-dasharray="4 6" vector-effect="non-scaling-stroke"/>').join('');
    const last = series[n - 1] || { chats: 0, replies: 0 };
    const totalC = series.reduce((a, s) => a + s.chats, 0), totalR = series.reduce((a, s) => a + s.replies, 0);
    const lbl = d => { const dt = new Date(d + 'T12:00:00'); return dt.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' }); };
    return '<div class="row" style="gap:22px;flex-wrap:wrap"><span class="col" style="gap:0"><b class="tnum" style="font-size:28px;letter-spacing:-0.045em">' + fmt(totalC) + '</b><span class="small muted">chats</span></span><span class="col" style="gap:0"><b class="tnum" style="font-size:28px;letter-spacing:-0.045em">' + fmt(totalR) + '</b><span class="small muted">AI replies</span></span></div>' +
      '<div style="position:relative"><svg viewBox="0 0 ' + W + ' ' + H + '" width="100%" height="' + H + '" preserveAspectRatio="none" role="img" aria-label="Chats and Closer replies over the last 14 days. Today: ' + last.chats + ' chats and ' + last.replies + ' replies."><defs><linearGradient id="c14" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#FFC21A" stop-opacity=".5"/><stop offset="1" stop-color="#FFC21A" stop-opacity="0"/></linearGradient></defs>' + grid +
      '<path d="' + line('replies') + ' L' + W + ' ' + H + ' L0 ' + H + 'Z" fill="url(#c14)"/><path d="' + line('replies') + '" fill="none" stroke="#FFC21A" stroke-width="2.5" vector-effect="non-scaling-stroke" stroke-linejoin="round"/>' +
      '<path d="' + line('chats') + '" fill="none" stroke="#121110" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" vector-effect="non-scaling-stroke" stroke-dasharray="2000" stroke-dashoffset="2000" style="animation:aSweep 1.6s var(--ease) forwards"/></svg>' +
      '<span style="position:absolute;right:-6px;top:' + (y(last.chats) / H * 100).toFixed(1) + '%;width:14px;height:14px;margin-top:-7px;border-radius:50%;background:#FFC21A;border:3px solid #121110" class="a-pulse"></span></div>' +
      '<div class="row" style="justify-content:space-between;font-size:11.5px;font-weight:700;color:var(--mut2)">' + series.filter((s, i) => i % 3 === 0 || i === n - 1).map((s, i, a) => '<span>' + (i === a.length - 1 ? 'Today' : lbl(s.d)) + '</span>').join('') + '</div>';
  }
  function paintFeed() {
    const f = $('homeFeed'); if (!f) return;
    const L = S.live || { msgs: [], events: [] };
    const items = [];
    L.events.forEach(e => items.push({ t: e.created_at, id: 'e' + e.id, html: evRow(e) }));
    L.msgs.forEach(m => items.push({ t: m.created_at, id: 'm' + m.id, html: msgRow(m) }));
    items.sort((a, b) => (a.t < b.t ? 1 : -1));
    const top = items.slice(0, 7);
    if (!top.length) { f.innerHTML = '<div class="empty" style="padding:14px">' + RV.waitingArt(120, 'Waiting for chats') + '<strong style="font-size:15px">Waiting for the first chat</strong><p class="small">Messages and events show up here the second they happen.</p></div>'; return; }
    const prev = f.getAttribute('data-top');
    f.innerHTML = top.map((x, i) => '<div class="' + (i === 0 && prev && prev !== x.id ? 'a-slide' : '') + '">' + x.html + '</div>').join('');
    f.setAttribute('data-top', top[0].id);
  }
  function evRow(e) { const c = RV.EV[e.type] || ['#F2F0EA', '•']; return '<a class="feed-row" href="' + RV.evLink(e) + '" style="text-decoration:none;color:inherit;align-items:center"><span class="ev-ic" style="background:' + c[0] + '">' + c[1] + '</span><span class="grow small" style="font-weight:600">' + esc(e.text) + '</span><span style="font-size:11.5px;color:var(--mut2);font-weight:700;white-space:nowrap">' + ago(e.created_at) + '</span></a>'; }
  function msgRow(m) {
    const who = m.author === 'ai' ? (closerName(m.meta && m.meta.closer_id || m.closer_id) || 'Closer') + ' replied to ' + RV.first(m.contact) : m.author === 'human' ? 'Your team replied to ' + RV.first(m.contact) : m.author === 'customer' ? RV.first(m.contact) + ' wrote' : 'Note';
    const icn = m.author === 'ai' ? ['#FFF3CC', '✓'] : m.author === 'human' ? ['#121110', '✎'] : ['#E3ECFF', '•'];
    return '<a class="feed-row" href="/app/inbox?t=' + m.thread_id + '" style="text-decoration:none;color:inherit;align-items:center"><span class="ev-ic" style="background:' + icn[0] + ';color:' + (m.author === 'human' ? '#FFC21A' : '#121110') + '">' + icn[1] + '</span><span class="col grow" style="gap:0;min-width:0"><span class="small" style="font-weight:700">' + esc(who) + '</span><span class="ell" style="font-size:12.5px;color:var(--mut)">' + esc(msgPreview(m)) + '</span></span><span style="font-size:11.5px;color:var(--mut2);font-weight:700;white-space:nowrap">' + ago(m.created_at) + '</span></a>';
  }
  RV.route('home', { render: home });

  /* ======================= LIVE ROOM ======================= */
  async function live(ctx) {
    const [stats, threads] = await Promise.all([GET('/api/app/stats'), GET('/api/app/threads'), RV.loadClosers()]);
    if (!ctx.ok()) return;
    const tmap = {}; threads.forEach(t => { tmap[t.id] = t; });
    const active = (S.closers || []).filter(c => c.active);
    const gauge = v => { const p = Math.min(1, v / Math.max(10, Math.max(...stats.rpm) * 1.3)), a = Math.PI * p, r = 46, cx = 60, cy = 56, x = cx - r * Math.cos(a), yy = cy - r * Math.sin(a); return '<svg viewBox="0 0 120 66" width="140" height="78" role="img" aria-label="' + v + ' replies per minute"><path d="M14 56a46 46 0 0 1 92 0" fill="none" stroke="#EEEBE2" stroke-width="10" stroke-linecap="round"/>' + (p > 0 ? '<path d="M14 56A46 46 0 0 1 ' + x.toFixed(1) + ' ' + yy.toFixed(1) + '" fill="none" stroke="#FFC21A" stroke-width="10" stroke-linecap="round"/>' : '') + '<text x="60" y="54" text-anchor="middle" font-family="Plus Jakarta Sans,sans-serif" font-weight="800" font-size="22" fill="#121110">' + v + '</text></svg>'; };
    const T = stats.today;
    ctx.el.innerHTML = '<div class="dgrid">' +
      '<div class="c3 half kpi a-in"><span class="k-l">Chats today</span><b id="lrChats" data-count="' + T.chats + '">0</b><span class="pill" style="align-self:flex-start;background:#E8F6EC;color:#1E6B3A"><span class="live-dot"></span>live</span></div>' +
      '<div class="c3 half kpi a-in" style="animation-delay:.05s"><span class="k-l">Replies per minute</span><div id="lrGauge">' + gauge(stats.rpm[stats.rpm.length - 1] || 0) + '</div></div>' +
      '<div class="c3 half kpi a-in" style="animation-delay:.1s"><span class="k-l">Closer replies today</span><b id="lrReplies" data-count="' + T.replies + '">0</b><span class="pill" style="align-self:flex-start;background:#FFF3CC;color:#7A5800">by AI</span></div>' +
      '<div class="c3 half kpi a-in" style="animation-delay:.15s"><span class="k-l">Waiting for a human</span><b id="lrHand" data-count="' + T.handoffs + '">0</b><a class="pill" href="/app/inbox?f=handoff" style="align-self:flex-start;background:#F1E8FF;color:#5B21B6;text-decoration:none">Open →</a></div>' +
      panel('c8 a-in', '<strong class="row" style="gap:8px"><span class="live-dot"></span>Everything, live</strong><span class="small muted">Tap any message to open the chat</span>', '<div id="lrFeed" class="col" style="gap:10px;min-height:340px"></div>', 'style="animation-delay:.2s"') +
      '<div class="c4 col" style="gap:14px;min-width:0">' +
      panel('a-in', '<strong>Closers on duty</strong><span class="pill" style="background:var(--soft);border:1px solid var(--line)">' + active.length + ' active</span>', active.length ? '<div class="col" style="gap:8px" id="lrClosers">' + active.map(c => { const t = RV.tpl(c.template); return '<div class="row" style="gap:10px;border:1px solid var(--line);border-radius:16px;padding:8px 10px;transition:background .3s" data-lane="' + c.id + '"><span style="flex:0 0 42px">' + RV.closerBot(t.color, 42, t.letter) + '</span><span class="col grow" style="gap:0;line-height:1.3"><strong class="ell">' + esc(c.name) + '</strong><span class="small muted ell" data-lane-status>' + ((c.channels || [])[0] ? 'Listening on @' + esc(c.channels[0].username || c.channels[0].name) : 'Ready, no channel yet') + '</span></span><span class="tnum" style="font-weight:800" data-lane-n>' + fmt((stats.closers.find(x => x.id === c.id) || {}).today || 0) + '</span></div>'; }).join('') + '</div>' : RV.empty('No Closers on duty', 'Turn on a Closer to see it work here.', '<a class="btn btn-ink btn-sm" href="/app/closers">My Closers</a>', RV.closerBot('#D9D4C8', 80, 'Z')), 'style="animation-delay:.25s"') +
      panel('a-in', '<strong>Events</strong>', '<div id="lrEvents" class="col" style="gap:2px"></div>', 'style="animation-delay:.3s"') + '</div></div>';
    requestAnimationFrame(() => RV.qsa('[data-count]', ctx.el).forEach(el => RV.countTo(el, +el.getAttribute('data-count'))));
    const seen = new Set();
    function bubble(m, fresh) {
      const t = tmap[m.thread_id] || {}, cust = m.author === 'customer';
      const heat = t.heat ? heatPill(t.heat) : '';
      if (m.dir === 'note' || m.author === 'system') return '<a href="/app/inbox?t=' + m.thread_id + '" class="' + (fresh ? 'a-drop ' : '') + 'bub-note" style="text-decoration:none">' + esc(m.text) + '</a>';
      if (cust) return '<a href="/app/inbox?t=' + m.thread_id + '" class="row ' + (fresh ? 'a-slide' : '') + '" style="gap:10px;align-items:flex-start;text-decoration:none;color:inherit">' + avatar(m.contact, 34) + '<span class="col" style="gap:4px;min-width:0;max-width:82%"><span class="row" style="gap:6px;font-size:12px;font-weight:800">' + esc(m.contact || 'Customer') + heat + '<span style="color:var(--mut2);font-weight:700">' + ago(m.created_at) + '</span></span><span class="bub-in" style="border:1px solid var(--line);max-width:100%">' + esc(msgPreview(m)) + '</span></span></a>';
      const cid = (m.meta && m.meta.closer_id) || m.closer_id;
      return '<a href="/app/inbox?t=' + m.thread_id + '" class="row ' + (fresh ? 'a-slide' : '') + '" style="gap:10px;align-items:flex-start;justify-content:flex-end;text-decoration:none;color:inherit"><span class="col" style="gap:4px;align-items:flex-end;min-width:0;max-width:82%"><span style="font-size:12px;font-weight:800">' + (m.author === 'human' ? esc((m.meta && m.meta.user_name) || 'Your team') : esc(closerName(cid) || 'Closer') + ' · AI') + ' <span style="color:var(--mut2);font-weight:700">to ' + esc(RV.first(m.contact)) + '</span></span><span class="' + (m.author === 'human' ? 'bub-me' : 'bub-out') + '" style="max-width:100%">' + esc(msgPreview(m)) + '</span></span><span style="flex:0 0 34px">' + (m.author === 'human' ? RV.mojiCircle(S.boot.user.moji, 34) : botFor(cid, 34)) + '</span></a>';
    }
    function paint(fresh) {
      const L = S.live || { msgs: [], events: [] };
      const feed = $('lrFeed'); if (!feed) return;
      const list = L.msgs.slice(-14).reverse();
      if (!list.length) { feed.innerHTML = RV.empty('Waiting for customers', 'The second someone messages your Telegram bot, it slides in here, with your Closer’s reply right after.', (S.channels && S.channels.length) ? '' : '<a class="btn btn-jade" href="/app/channels">Connect Telegram</a>'); }
      else {
        feed.innerHTML = list.map(m => bubble(m, fresh && !seen.has(m.id))).join('');
        list.forEach(m => seen.add(m.id));
      }
      const ev = $('lrEvents');
      if (ev) ev.innerHTML = L.events.length ? L.events.slice(-8).reverse().map(evRow).join('') : '<p class="small muted" style="margin:4px">Handoffs, hot leads, sales and Shield actions show up here.</p>';
    }
    paint(false);
    RV.loadChannels().then(() => { if (ctx.ok() && !(S.live && S.live.msgs.length)) paint(false); }).catch(() => {});
    RV.onLive(async d => {
      if (!ctx.ok()) return;
      if (d.messages.some(m => !tmap[m.thread_id])) { try { (await GET('/api/app/threads')).forEach(t => { tmap[t.id] = t; }); } catch (e) { /* ignore */ } }
      if (d.messages.length || d.events.length || d.first) paint(!d.first);
      // typing / busy indicator on Closer cards
      d.messages.forEach(m => {
        const t = tmap[m.thread_id]; const cid = (m.meta && m.meta.closer_id) || (t && t.closer_id);
        const row = RV.qs('[data-lane="' + cid + '"]'); if (!row) return;
        if (m.author === 'customer') { row.style.background = 'var(--mint)'; row.querySelector('[data-lane-status]').innerHTML = '<span class="dot" style="background:#121110"></span> <span class="dot" style="background:#121110"></span> <span class="dot" style="background:#121110"></span> replying to ' + esc(RV.first(m.contact)); }
        if (m.author === 'ai') { row.style.background = ''; const n = row.querySelector('[data-lane-n]'); n.textContent = fmt(+n.textContent.replace(/,/g, '') + 1); row.querySelector('[data-lane-status]').textContent = 'Replied to ' + RV.first(m.contact) + ' just now'; }
      });
      if (d.messages.length) {
        GET('/api/app/stats').then(s => { if (!ctx.ok()) return; RV.countTo($('lrChats'), s.today.chats); RV.countTo($('lrReplies'), s.today.replies); RV.countTo($('lrHand'), s.today.handoffs); const g = $('lrGauge'); if (g) g.innerHTML = gauge(s.rpm[s.rpm.length - 1] || 0); }).catch(() => {});
      }
    });
  }
  RV.route('live', { render: live, flag: 'live_room' });

  /* ======================= PULSE INBOX ======================= */
  const IB = { filter: 'all', q: '', threads: [], sel: null, detail: null, view: 'list', side: false };
  async function inbox(ctx) {
    if (ctx.q.f && ['all', 'hot', 'handoff', 'unread'].includes(ctx.q.f)) IB.filter = ctx.q.f;
    const want = ctx.q.t ? +ctx.q.t : null;
    await RV.loadClosers();
    if (!ctx.ok()) return;
    ctx.el.innerHTML = '<div class="ibx a-in" id="ibx" data-view="' + (want ? 'chat' : 'list') + '">' +
      '<div class="ibx-list"><div style="padding:12px;border-bottom:1px solid var(--line);display:flex;flex-direction:column;gap:10px"><div class="row" style="gap:8px;background:var(--soft);border:1px solid var(--line);border-radius:12px;padding:0 12px">' + ic('search', '#948F82', 16) + '<label for="ibQ" class="sr">Search chats</label><input id="ibQ" placeholder="Search name or message" value="' + esc(IB.q) + '" style="border:0;background:transparent;padding:10px 0;font-size:14.5px;flex:1;min-width:0;outline:none"></div>' +
      '<div class="row" style="gap:6px;overflow-x:auto;scrollbar-width:none" role="tablist" aria-label="Filter chats">' + [['all', 'All'], ['hot', 'Hot'], ['handoff', 'Needs you'], ['unread', 'Unread']].map(f => '<button class="chip' + (IB.filter === f[0] ? ' on' : '') + '" role="tab" aria-selected="' + (IB.filter === f[0]) + '" data-ibf="' + f[0] + '" style="padding:6px 12px;font-size:13px">' + f[1] + '</button>').join('') + '</div></div><div class="ibx-scroll" id="ibList"></div></div>' +
      '<div class="ibx-chat" id="ibChat"></div><div class="ibx-side" id="ibSide"></div></div>';
    IB.view = want ? 'chat' : 'list';
    $('ibQ').addEventListener('input', RV.debounce(() => { IB.q = $('ibQ').value.trim(); loadList(ctx); }, 300));
    ctx.el.querySelectorAll('[data-ibf]').forEach(b => b.addEventListener('click', () => { IB.filter = b.getAttribute('data-ibf'); ctx.el.querySelectorAll('[data-ibf]').forEach(x => { x.classList.toggle('on', x === b); x.setAttribute('aria-selected', x === b); }); loadList(ctx); }));
    await loadList(ctx);
    if (!ctx.ok()) return;
    const pick = want || (window.innerWidth > 980 && IB.threads[0] ? IB.threads[0].id : null);
    if (pick) await openThread(ctx, pick, !!want); else paintChatEmpty();
    RV.onLive(async d => {
      if (!ctx.ok() || !d.messages.length) return;
      await loadList(ctx, true);
      if (IB.sel && d.messages.some(m => m.thread_id === IB.sel)) await openThread(ctx, IB.sel, false, true);
    });
  }
  async function loadList(ctx, quiet) {
    try {
      IB.threads = await GET('/api/app/threads?filter=' + IB.filter + (IB.q ? '&q=' + encodeURIComponent(IB.q) : ''));
    } catch (e) { if (!quiet) fail(e); return; }
    if (!ctx.ok()) return;
    const el = $('ibList'); if (!el) return;
    const st = el.scrollTop;
    el.innerHTML = IB.threads.length ? IB.threads.map(t => '<button class="ibx-row' + (t.id === IB.sel ? ' on' : '') + '" data-th="' + t.id + '">' + avatar(t.name, 42) +
      '<span class="col grow" style="gap:1px;line-height:1.35"><span class="row" style="justify-content:space-between;gap:6px"><strong class="ell" style="font-size:14.5px">' + esc(t.name || 'Customer') + '</strong><span style="font-size:11.5px;color:var(--mut2);font-weight:700;white-space:nowrap">' + ago(t.last_message_at) + '</span></span>' +
      '<span class="ell" style="font-size:13px;color:var(--mut)">' + esc(t.last_text || '') + '</span>' +
      '<span class="row" style="gap:6px;margin-top:3px">' + (t.channel_type === 'website' ? '<span class="heat" style="background:#FFF7DD;color:#7A5800" title="Website chat">' + ic('globe', '#7A5800', 11, 2.4) + 'Web</span>' : '') + heatPill(t.heat) + (t.status === 'handoff' || !t.ai_on ? '<span class="heat" style="background:#F1E8FF;color:#5B21B6">' + (t.status === 'handoff' ? 'Needs you' : 'You’re on it') + '</span>' : '<span style="font-size:11.5px;color:var(--mut2);font-weight:700">' + esc(t.closer_name || 'No Closer') + ' on it</span>') + (t.unread ? '<span class="unread tnum" style="margin-left:auto">' + t.unread + '</span>' : '') + '</span></span></button>').join('')
      : '<div style="padding:10px">' + RV.empty(IB.q || IB.filter !== 'all' ? 'Nothing matches' : 'No chats yet', IB.q || IB.filter !== 'all' ? 'Try another filter or search.' : 'When customers message your Telegram bot, their chats land here.', IB.q || IB.filter !== 'all' ? '' : '<a class="btn btn-jade btn-sm" href="/app/channels">Connect Telegram</a>') + '</div>';
    el.scrollTop = st;
    el.querySelectorAll('[data-th]').forEach(b => b.addEventListener('click', () => openThread(ctx, +b.getAttribute('data-th'), true)));
  }
  function paintChatEmpty() {
    const c = $('ibChat'); if (!c) return;
    c.innerHTML = '<div class="grow" style="display:flex;align-items:center;justify-content:center;background:#F7F5EE">' + RV.empty('Pick a chat', 'Select a conversation to read it, take over from your Closer or reply yourself.', '') + '</div>';
    $('ibSide').innerHTML = '';
  }
  function setView(v) { IB.view = v; const b = $('ibx'); if (b) b.setAttribute('data-view', v); }
  async function openThread(ctx, id, userAction, quiet) {
    let d;
    try { d = await GET('/api/app/threads/' + id); }
    catch (e) { if (!quiet) fail(e); if (e.status === 404) { IB.sel = null; paintChatEmpty(); } return; }
    if (!ctx.ok()) return;
    IB.sel = id; IB.detail = d;
    if (userAction) { setView('chat'); const u = new URL(location.href); u.searchParams.set('t', id); history.replaceState({}, '', u.pathname + u.search); }
    RV.qsa('#ibList [data-th]').forEach(b => { const on = +b.getAttribute('data-th') === id; b.classList.toggle('on', on); if (on) { const u = b.querySelector('.unread'); if (u) u.remove(); } });
    paintChat(ctx, quiet);
    if (!quiet) paintSide(ctx);
  }
  function msgHtml(m, d) {
    const meta = m.meta || {};
    if (m.dir === 'note' || m.author === 'system') return '<div class="bub-note">' + esc(m.text) + '</div>';
    let body = esc(m.text || '');
    if (m.kind === 'image') body = '<span class="row" style="gap:8px;font-weight:700">' + ic('image', 'currentColor', 18) + 'Photo</span>' + (m.text && m.text !== '[image]' ? '<span style="display:block;margin-top:4px">' + esc(m.text) + '</span>' : '');
    if (m.kind === 'voice') body = '<span class="voice">' + ic('mic', 'currentColor', 16) + [8, 14, 10, 18, 12, 16, 9, 13, 7].map(h => '<i style="height:' + h + 'px"></i>').join('') + '<span style="font-size:12px;font-weight:700">Voice note</span></span>' + (m.text && m.text !== '[voice note]' ? '<span style="display:block;margin-top:4px;font-style:italic">“' + esc(m.text) + '”</span>' : '');
    const tm = '<span class="bub-meta">' + RV.time(m.created_at) + '</span>';
    if (m.author === 'customer') return '<div class="bub-in">' + body + tm + '</div>';
    if (m.author === 'human') return '<div class="bub-me">' + body + '<span class="bub-meta" style="color:#C4BFB3">' + esc(meta.user_name || 'Your team') + ' · ' + RV.time(m.created_at) + '</span></div>';
    const cid = meta.closer_id || d.thread.closer_id;
    const fix = m.author === 'ai' && cid && closerOf(cid) && RV.isManager() && RV.flag('studio') && RV.fixAnswer ? '<button type="button" class="bub-fix" data-fixmsg="' + m.id + '">✎ Fix this answer</button>' : '';
    return '<div class="bub-out">' + body + '<span class="bub-meta">' + esc(closerName(cid) || 'Closer') + ' · AI · ' + RV.time(m.created_at) + (meta.failed ? ' · <span style="color:#C2410C;font-weight:800" title="' + esc(meta.error || 'Telegram did not accept this message') + '">Not delivered</span>' : '') + '</span>' + fix + '</div>';
  }
  function paintChat(ctx, keep) {
    const d = IB.detail, t = d.thread, c = d.contact, el = $('ibChat'); if (!el) return;
    const draft = keep && $('ibIn') ? $('ibIn').value : '', focused = keep && document.activeElement && document.activeElement.id === 'ibIn';
    const cl = closerOf(t.closer_id);
    let lastDay = '';
    const msgs = d.messages.map(m => { const day = new Date(m.created_at).toDateString(); let sep = ''; if (day !== lastDay) { lastDay = day; sep = '<div class="day-sep">' + (day === new Date().toDateString() ? 'Today' : RV.date(m.created_at)) + '</div>'; } return sep + msgHtml(m, d); }).join('');
    el.innerHTML = '<div class="ibx-head"><button class="btn btn-icon show-sm" data-ibv="list" aria-label="Back to chats" style="width:36px;height:36px">' + ic('back', '#121110', 18, 2.4) + '</button>' + avatar(c.name, 40) +
      '<span class="col grow" style="gap:0;line-height:1.3;min-width:0"><strong class="ell">' + esc(c.name || 'Customer') + '</strong><span class="ell" style="font-size:12.5px;color:var(--mut)">' + (d.channel && d.channel.type === 'website' ? ic('globe', '#7A5800', 12, 2.4) + ' Website chat' + (d.page && d.page.url ? ' · on <a href="' + esc(d.page.url) + '" target="_blank" rel="noopener noreferrer nofollow" style="font-weight:700;color:inherit">' + esc(pagePath(d.page.url)) + '</a>' : ' · ' + esc(d.channel.name)) : (c.username ? '@' + esc(c.username) + ' · ' : '') + 'via ' + esc(d.channel ? (d.channel.username ? '@' + d.channel.username : d.channel.name) : 'Telegram')) + '</span></span>' +
      '<button class="btn btn-ghost btn-sm" data-ibv="side" aria-label="Lead details" id="ibInfo">' + ic('user', '#121110', 16) + '<span class="hide-xs">Details</span></button></div>' +
      '<div class="row" style="gap:10px;padding:10px 16px;border-bottom:1px solid var(--line);flex-wrap:wrap;background:#fff">' +
      '<span class="row" style="gap:8px;flex:1 1 200px;min-width:0"><span style="flex:0 0 32px">' + (t.ai_on ? botFor(t.closer_id, 32) : RV.mojiCircle(S.boot.user.moji, 32)) + '</span><span class="col" style="gap:0;line-height:1.25;min-width:0"><strong style="font-size:13.5px" class="ell">' + (t.ai_on ? esc(cl ? cl.name : 'No Closer') + ' is replying' : 'You’re on this chat') + '</strong><span style="font-size:12px;color:var(--mut)">' + (t.ai_on ? 'AI replies on' : 'AI replies paused') + '</span></span></span>' +
      '<button class="btn ' + (t.ai_on ? 'btn-ink' : 'btn-jade') + ' btn-sm" id="ibTake">' + (t.ai_on ? 'Take over' : 'Give back to ' + esc(cl ? cl.name : 'Closer')) + '</button>' +
      '<label class="sr" for="ibStatus">Chat status</label><select id="ibStatus" class="input" style="width:auto;padding:7px 34px 7px 12px;font-size:13.5px;border-radius:999px">' + [['open', 'Open'], ['handoff', 'Needs a human'], ['closed', 'Closed']].map(o => '<option value="' + o[0] + '"' + (t.status === o[0] ? ' selected' : '') + '>' + o[1] + '</option>').join('') + '</select>' +
      '<label class="sr" for="ibCloser">Assigned Closer</label><select id="ibCloser" class="input" style="width:auto;padding:7px 34px 7px 12px;font-size:13.5px;border-radius:999px"><option value="0">No Closer</option>' + (S.closers || []).map(x => '<option value="' + x.id + '"' + (x.id === t.closer_id ? ' selected' : '') + '>' + esc(x.name) + '</option>').join('') + '</select></div>' +
      '<div class="ibx-msgs" id="ibMsgs" aria-live="polite">' + (msgs || '<p class="muted small" style="align-self:center">No messages yet.</p>') + '</div>' +
      '<form id="ibForm" class="row" style="gap:8px;padding:12px;border-top:1px solid var(--line);background:#fff"><label for="ibIn" class="sr">Reply</label><textarea id="ibIn" class="input" rows="1" placeholder="' + (t.ai_on ? 'Type to take over from ' + esc(cl ? cl.name : 'your Closer') + '…' : 'Write a reply…') + '" style="padding:11px 14px;resize:none;max-height:140px"></textarea><button class="btn btn-ink" type="submit" id="ibSend" aria-label="Send">' + ic('send', '#FFC21A', 18, 2.2) + '<span class="hide-xs">Send</span></button></form>';
    const mb = $('ibMsgs'); mb.scrollTop = mb.scrollHeight;
    // "Fix this answer": saves a correction for the Closer that wrote this reply.
    mb.addEventListener('click', e => {
      const fb = e.target.closest('[data-fixmsg]'); if (!fb) return;
      const i = d.messages.findIndex(x => x.id === +fb.getAttribute('data-fixmsg')); if (i < 0) return;
      const m = d.messages[i], cid = (m.meta && m.meta.closer_id) || t.closer_id, cl2 = closerOf(cid);
      const q = (d.messages.slice(0, i).reverse().find(x => x.dir === 'in' && x.author === 'customer') || {}).text || '';
      RV.fixAnswer({ closerId: cid, closerName: cl2 ? cl2.name : 'Your Closer', color: cl2 ? (cl2.persona && cl2.persona.color) || RV.tpl(cl2.template).color : '#FFC21A', question: q, answer: m.text || '', onSaved: () => { fb.outerHTML = '<span class="bub-meta" style="color:#14532D;font-weight:800">✓ Correction saved</span>'; } });
    });
    const inp = $('ibIn'); if (draft) inp.value = draft; if (focused) inp.focus();
    inp.addEventListener('keydown', e => { if (e.key === 'Enter' && !e.shiftKey && !e.isComposing) { e.preventDefault(); $('ibForm').requestSubmit(); } });
    inp.addEventListener('input', () => { inp.style.height = 'auto'; inp.style.height = Math.min(140, inp.scrollHeight) + 'px'; });
    el.querySelectorAll('[data-ibv]').forEach(b => b.addEventListener('click', () => {
      const v = b.getAttribute('data-ibv');
      if (v === 'side') { if (window.innerWidth > 980) { $('ibx').classList.toggle('show-side'); } else setView('side'); }
      else setView(v);
    }));
    $('ibTake').addEventListener('click', async () => {
      const b = $('ibTake'); RV.busy(b, true);
      try { await PUT('/api/app/threads/' + t.id, { ai_on: !t.ai_on }); toast(t.ai_on ? 'You took over. ' + (cl ? cl.name : 'The Closer') + ' is paused on this chat.' : (cl ? cl.name : 'Your Closer') + ' is back on this chat'); await openThread(ctx, t.id, false, true); loadList(ctx, true); }
      catch (e) { RV.busy(b, false); fail(e); }
    });
    $('ibStatus').addEventListener('change', async e => { try { await PUT('/api/app/threads/' + t.id, { status: e.target.value }); t.status = e.target.value; toast('Chat marked ' + e.target.selectedOptions[0].text.toLowerCase()); loadList(ctx, true); } catch (er) { fail(er); } });
    $('ibCloser').addEventListener('change', async e => { try { await PUT('/api/app/threads/' + t.id, { closer_id: +e.target.value }); t.closer_id = +e.target.value || null; toast(+e.target.value ? closerName(+e.target.value) + ' now handles this chat' : 'Closer removed from this chat'); await openThread(ctx, t.id, false, true); loadList(ctx, true); } catch (er) { fail(er); } });
    $('ibForm').addEventListener('submit', async e => {
      e.preventDefault();
      const v = inp.value.trim(); if (!v) return;
      const b = $('ibSend'); RV.busy(b, true);
      mb.insertAdjacentHTML('beforeend', '<div class="bub-me a-in" style="opacity:.7">' + esc(v) + '<span class="bub-meta" style="color:#C4BFB3">Sending…</span></div>'); mb.scrollTop = mb.scrollHeight;
      inp.value = '';
      try { await POST('/api/app/threads/' + t.id + '/messages', { text: v }); await openThread(ctx, t.id, false, true); loadList(ctx, true); }
      catch (er) { RV.busy(b, false); inp.value = v; fail(er); openThread(ctx, t.id, false, true); }
    });
  }
  function paintSide(ctx) {
    const d = IB.detail, c = d.contact, el = $('ibSide'); if (!el) return;
    el.innerHTML = '<div class="row" style="gap:10px"><button class="btn btn-icon show-sm" data-ibv2="chat" aria-label="Back to chat" style="width:36px;height:36px">' + ic('back', '#121110', 18, 2.4) + '</button><strong>Lead details</strong></div>' +
      '<div class="col" style="align-items:center;text-align:center;gap:6px">' + avatar(c.name, 64) + '<strong style="font-size:18px">' + esc(c.name || 'Customer') + '</strong><span class="small muted">' + (c.username ? '@' + esc(c.username) + ' · ' : '') + 'first seen ' + RV.date(c.created_at) + '</span></div>' +
      (c.email || c.phone || (d.page && d.page.url) ? '<div class="col" style="gap:6px;background:var(--mint);border:1px solid var(--mint2);border-radius:16px;padding:12px;font-size:13.5px;min-width:0">' + (c.email ? '<a class="ell" href="mailto:' + esc(c.email) + '" style="font-weight:700;color:var(--ink)">✉ ' + esc(c.email) + '</a>' : '') + (c.phone ? '<a href="tel:' + esc(c.phone.replace(/[^+0-9]/g, '')) + '" style="font-weight:700;color:var(--ink)">☎ ' + esc(c.phone) + '</a>' : '') + (d.page && d.page.url ? '<span class="ell" style="color:var(--jade-dd)">' + ic('globe', '#7A5800', 12, 2.4) + ' Last page: <a href="' + esc(d.page.url) + '" target="_blank" rel="noopener noreferrer nofollow" style="color:inherit;font-weight:700">' + esc(d.page.title || pagePath(d.page.url)) + '</a></span>' : '') + '</div>' : '') +
      '<div class="col" style="gap:8px"><span class="lbl">HeatScore</span><div class="row" style="gap:6px;flex-wrap:wrap">' + ['cold', 'warm', 'hot', 'won'].map(h => '<button class="chip' + (c.heat === h ? ' on' : '') + '" data-heat="' + h + '" aria-pressed="' + (c.heat === h) + '" style="padding:6px 12px;font-size:13px">' + HEAT[h][2] + '</button>').join('') + '</div></div>' +
      '<div class="field"><label class="lbl" for="ldStage">Stage</label><select id="ldStage" class="input" style="padding:10px 40px 10px 12px">' + Object.keys(STAGE).map(s => '<option value="' + s + '"' + (c.stage === s ? ' selected' : '') + '>' + STAGE[s][2] + '</option>').join('') + '</select></div>' +
      '<div class="field"><label class="lbl" for="ldValue">Deal value (USD)</label><input id="ldValue" class="input" type="number" min="0" step="0.01" inputmode="decimal" value="' + (c.value || '') + '" placeholder="0" style="padding:10px 12px"></div>' +
      '<div class="field"><label class="lbl" for="ldNotes">Notes</label><textarea id="ldNotes" class="input" rows="4" maxlength="2000" placeholder="Anything your team should know" style="padding:10px 12px">' + esc(c.notes || '') + '</textarea></div>' +
      '<button class="btn btn-ink" id="ldSave">Save lead</button>' +
      '<div class="col" style="gap:6px;background:var(--soft);border:1px solid var(--line);border-radius:16px;padding:12px;font-size:13.5px"><span class="row" style="justify-content:space-between"><span class="muted">Last seen</span><strong>' + ago(c.last_seen) + '</strong></span><span class="row" style="justify-content:space-between"><span class="muted">Language</span><strong>' + esc(c.lang || 'Auto') + '</strong></span><span class="row" style="justify-content:space-between"><span class="muted">Messages</span><strong>' + d.messages.length + '</strong></span></div>';
    let heat = c.heat;
    el.querySelectorAll('[data-heat]').forEach(b => b.addEventListener('click', () => { heat = b.getAttribute('data-heat'); el.querySelectorAll('[data-heat]').forEach(x => { x.classList.toggle('on', x === b); x.setAttribute('aria-pressed', x === b); }); }));
    el.querySelector('[data-ibv2]').addEventListener('click', () => setView('chat'));
    $('ldSave').addEventListener('click', async () => {
      const b = $('ldSave'); RV.busy(b, true, 'Saving…');
      try { await PUT('/api/app/contacts/' + c.id, { heat, stage: $('ldStage').value, value: +$('ldValue').value || 0, notes: $('ldNotes').value }); Object.assign(c, { heat, stage: $('ldStage').value, value: +$('ldValue').value || 0, notes: $('ldNotes').value }); RV.busy(b, false); toast('Lead saved'); loadList(ctx, true); }
      catch (e) { RV.busy(b, false); fail(e); }
    });
  }
  RV.route('inbox', { render: inbox });

  /* ======================= LEADS ======================= */
  const LD = { heat: 'all', stage: 'all', q: '' };
  async function leads(ctx) {
    const list = await GET('/api/app/contacts');
    if (!ctx.ok()) return;
    const counts = { new: 0, qualified: 0, checkout: 0, won: 0, lost: 0 };
    list.forEach(c => { if (counts[c.stage] != null) counts[c.stage]++; });
    const hcount = { hot: 0, warm: 0, cold: 0, won: 0 }; list.forEach(c => { if (hcount[c.heat] != null) hcount[c.heat]++; });
    const total = list.length || 1;
    const value = list.filter(c => c.stage === 'won').reduce((a, c) => a + (c.value || 0), 0);
    ctx.el.innerHTML = '<div class="row a-in" style="flex-wrap:wrap;gap:10px;justify-content:space-between"><span class="muted small" style="max-width:560px">Your Closers score every chat and move leads between stages on their own. Fix anything in one tap.</span><span class="row" style="gap:8px">' + (RV.isManager() ? '<button class="btn btn-ghost btn-sm" id="ldExport">' + ic('download', '#121110', 16) + 'Export</button>' : '') + '</span></div>' +
      '<div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(140px,1fr));gap:10px" class="a-in">' + Object.keys(counts).map((s, i) => '<button class="kpi lift" data-st="' + s + '" aria-pressed="' + (LD.stage === s) + '" style="cursor:pointer;text-align:left;' + (LD.stage === s ? 'border-color:var(--ink);box-shadow:0 0 0 2px var(--ink)' : '') + (s === 'won' ? ';background:#121110;color:#fff' : '') + '"><span class="k-l"' + (s === 'won' ? ' style="color:#A8A294"' : '') + '>' + STAGE[s][2] + '</span><b class="tnum" data-count="' + counts[s] + '"' + (s === 'won' ? ' style="color:#FFC21A"' : '') + '>0</b><span style="height:6px;border-radius:6px;background:' + (s === 'won' ? '#2C2925' : 'var(--soft)') + ';overflow:hidden"><span style="display:block;height:100%;width:' + (counts[s] / total * 100) + '%;background:' + (s === 'won' ? '#FFC21A' : STAGE[s][1]) + ';animation:aBar 1s ' + (i * 0.08) + 's var(--ease) both"></span></span></button>').join('') + '</div>' +
      '<section class="panel a-in" style="animation-delay:.1s"><div class="panel-h"><div class="row" style="gap:6px;flex-wrap:wrap" role="group" aria-label="Filter by heat">' + [['all', 'All ' + list.length], ['hot', 'Hot ' + hcount.hot], ['warm', 'Warm ' + hcount.warm], ['cold', 'Cold ' + hcount.cold], ['won', 'Won ' + hcount.won]].map(h => '<button class="chip' + (LD.heat === h[0] ? ' on' : '') + '" data-hf="' + h[0] + '" aria-pressed="' + (LD.heat === h[0]) + '" style="padding:6px 12px;font-size:13px">' + h[1] + '</button>').join('') + (LD.stage !== 'all' ? '<button class="chip" data-st="all" style="padding:6px 12px;font-size:13px;border-style:dashed">Stage: ' + STAGE[LD.stage][2] + ' ✕</button>' : '') + '</div>' +
      '<div class="row" style="gap:8px;background:var(--soft);border:1px solid var(--line);border-radius:12px;padding:0 12px;min-width:220px">' + ic('search', '#948F82', 16) + '<label for="ldQ" class="sr">Search leads</label><input id="ldQ" placeholder="Search leads" value="' + esc(LD.q) + '" style="border:0;background:transparent;padding:9px 0;font-size:14.5px;flex:1;min-width:0;outline:none"></div></div>' +
      (value ? '<span class="small muted">Won deal value so far: <strong style="color:var(--ink)">' + RV.usd(value) + '</strong></span>' : '') +
      '<div id="ldTable"></div></section>';
    requestAnimationFrame(() => RV.qsa('[data-count]', ctx.el).forEach(el => RV.countTo(el, +el.getAttribute('data-count'))));
    const paintRows = () => {
      const q = LD.q.toLowerCase();
      const rows = list.filter(c => (LD.heat === 'all' || c.heat === LD.heat) && (LD.stage === 'all' || c.stage === LD.stage) && (!q || (c.name || '').toLowerCase().includes(q) || (c.username || '').toLowerCase().includes(q) || (c.email || '').toLowerCase().includes(q) || (c.phone || '').includes(q) || (c.last_text || '').toLowerCase().includes(q) || (c.notes || '').toLowerCase().includes(q)));
      const box = $('ldTable'); if (!box) return;
      if (!list.length) { box.innerHTML = RV.empty('No leads yet', 'Every person who messages your Closers becomes a lead here, scored hot, warm or cold.', '<a class="btn btn-jade" href="/app/channels">Connect Telegram</a>'); return; }
      if (!rows.length) { box.innerHTML = RV.empty('Nothing matches', 'Try another filter or search.', ''); return; }
      box.innerHTML = '<div class="hide-sm" style="overflow-x:auto"><table class="tbl"><thead><tr><th>Lead</th><th>Last message</th><th>Heat</th><th>Stage</th><th>Value</th><th>Last seen</th><th></th></tr></thead><tbody>' + rows.map(c => '<tr class="click" data-lead="' + c.id + '"><td><span class="row" style="gap:10px">' + avatar(c.name, 34) + '<span class="col" style="gap:0;line-height:1.25"><strong>' + esc(c.name || 'Customer') + '</strong><span class="small muted">' + contactLine(c) + '</span></span></span></td><td style="max-width:280px"><span class="ell small muted" style="display:block">' + esc(c.last_text || '') + '</span></td><td>' + heatPill(c.heat) + '</td><td>' + stagePill(c.stage) + '</td><td class="tnum">' + (c.value ? RV.usd(c.value) : '–') + '</td><td class="small muted" style="white-space:nowrap">' + ago(c.last_seen) + '</td><td style="text-align:right;white-space:nowrap">' + (c.thread_id ? '<a class="btn btn-ink btn-sm" href="/app/inbox?t=' + c.thread_id + '">Open chat</a>' : '') + '</td></tr>').join('') + '</tbody></table></div>' +
        '<div class="show-sm col" style="gap:8px">' + rows.map(c => '<button class="card" data-lead="' + c.id + '" style="padding:12px;border-radius:18px;display:flex;flex-direction:column;gap:8px;text-align:left;cursor:pointer;width:100%"><span class="row" style="gap:10px;width:100%">' + avatar(c.name, 36) + '<span class="col grow" style="gap:0;min-width:0"><strong class="ell">' + esc(c.name || 'Customer') + '</strong><span class="small muted ell">' + (c.email || c.phone ? esc(c.email || c.phone) + ' · ' : '') + ago(c.last_seen) + (c.value ? ' · ' + RV.usd(c.value) : '') + '</span></span>' + heatPill(c.heat) + '</span><span class="ell small muted" style="width:100%">' + esc(c.last_text || '') + '</span><span class="row" style="gap:6px">' + stagePill(c.stage) + '</span></button>').join('') + '</div>';
      box.querySelectorAll('[data-lead]').forEach(r => r.addEventListener('click', e => { if (e.target.closest('a')) return; editLead(list.find(c => c.id === +r.getAttribute('data-lead')), () => leads(Object.assign({}, ctx, { soft: true }))); }));
    };
    paintRows();
    ctx.el.querySelectorAll('[data-hf]').forEach(b => b.addEventListener('click', () => { LD.heat = b.getAttribute('data-hf'); ctx.el.querySelectorAll('[data-hf]').forEach(x => { x.classList.toggle('on', x === b); x.setAttribute('aria-pressed', x === b); }); paintRows(); }));
    ctx.el.querySelectorAll('[data-st]').forEach(b => b.addEventListener('click', () => { const s = b.getAttribute('data-st'); LD.stage = LD.stage === s ? 'all' : s; leads(ctx); }));
    $('ldQ').addEventListener('input', RV.debounce(() => { LD.q = $('ldQ').value.trim(); paintRows(); }, 200));
    const ex = $('ldExport'); if (ex) ex.addEventListener('click', exportModal);
  }
  function editLead(c, after) {
    if (!c) return;
    let heat = c.heat;
    RV.modal('<div class="col" style="gap:14px"><div class="row" style="gap:12px">' + avatar(c.name, 52) + '<span class="col grow" style="gap:0"><strong class="h3">' + esc(c.name || 'Customer') + '</strong><span class="small muted">' + (c.username ? '@' + esc(c.username) + ' · ' : '') + 'last seen ' + ago(c.last_seen) + '</span></span></div>' +
      (c.email || c.phone ? '<div class="row" style="gap:8px;flex-wrap:wrap">' + (c.email ? '<a class="pill" href="mailto:' + esc(c.email) + '" style="background:var(--mint);color:var(--jade-dd);padding:8px 12px">✉ ' + esc(c.email) + '</a>' : '') + (c.phone ? '<a class="pill" href="tel:' + esc(c.phone.replace(/[^+0-9]/g, '')) + '" style="background:var(--soft);color:var(--ink);padding:8px 12px;border:1px solid var(--line)">☎ ' + esc(c.phone) + '</a>' : '') + '</div>' : '') +
      (c.last_text ? '<div class="bub-in" style="max-width:100%;border:1px solid var(--line)">' + esc(c.last_text) + '</div>' : '') +
      '<div class="col" style="gap:8px"><span class="lbl">HeatScore</span><div class="row" style="gap:6px;flex-wrap:wrap">' + ['cold', 'warm', 'hot', 'won'].map(h => '<button class="chip' + (c.heat === h ? ' on' : '') + '" data-mh="' + h + '" aria-pressed="' + (c.heat === h) + '">' + HEAT[h][2] + '</button>').join('') + '</div></div>' +
      '<div class="row" style="gap:10px;flex-wrap:wrap"><div class="field grow" style="min-width:160px"><label class="lbl" for="mStage">Stage</label><select id="mStage" class="input">' + Object.keys(STAGE).map(s => '<option value="' + s + '"' + (c.stage === s ? ' selected' : '') + '>' + STAGE[s][2] + '</option>').join('') + '</select></div><div class="field grow" style="min-width:140px"><label class="lbl" for="mValue">Value (USD)</label><input id="mValue" class="input" type="number" min="0" step="0.01" inputmode="decimal" value="' + (c.value || '') + '" placeholder="0"></div></div>' +
      '<div class="field"><label class="lbl" for="mNotes">Notes</label><textarea id="mNotes" class="input" rows="3" maxlength="2000" placeholder="Anything your team should know">' + esc(c.notes || '') + '</textarea></div>' +
      '<div class="row" style="gap:8px;flex-wrap:wrap">' + (c.thread_id ? '<a class="btn btn-ghost" href="/app/inbox?t=' + c.thread_id + '" data-close>Open chat</a>' : '') + '<button class="btn btn-ink grow" id="mSave">Save lead</button></div></div>', { label: 'Edit lead' });
    RV.qsa('[data-mh]').forEach(b => b.addEventListener('click', () => { heat = b.getAttribute('data-mh'); RV.qsa('[data-mh]').forEach(x => { x.classList.toggle('on', x === b); x.setAttribute('aria-pressed', x === b); }); }));
    $('mSave').addEventListener('click', async () => {
      const b = $('mSave'); RV.busy(b, true, 'Saving…');
      try { await PUT('/api/app/contacts/' + c.id, { heat, stage: $('mStage').value, value: +$('mValue').value || 0, notes: $('mNotes').value }); RV.closeModal(); toast('Lead saved'); after && after(); }
      catch (e) { RV.busy(b, false); fail(e); }
    });
  }
  function exportModal() {
    RV.modal('<div class="col" style="gap:14px"><strong class="h3">Export your data</strong><p class="muted" style="margin:0">Download every lead (name, username, heat, stage, notes, value) plus your Closers’ setup. Your data, always yours.</p><div class="row" style="gap:8px;flex-wrap:wrap"><button class="btn btn-ink grow" data-exp="csv">Leads as CSV</button><button class="btn btn-ghost grow" data-exp="json">Everything as JSON</button></div></div>', { label: 'Export' });
    RV.qsa('[data-exp]').forEach(b => b.addEventListener('click', () => RV.exportData(b.getAttribute('data-exp'), b)));
  }
  RV.exportData = async function (kind, btn) {
    RV.busy(btn, true);
    try {
      const d = await GET('/api/app/export');
      const stamp = new Date().toISOString().slice(0, 10);
      if (kind === 'csv') {
        const cols = ['name', 'username', 'email', 'phone', 'heat', 'stage', 'value', 'notes', 'created_at', 'last_seen'];
        const cell = v => { const s = String(v == null ? '' : v); return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s; };
        RV.download('replyvoo-leads-' + stamp + '.csv', [cols.join(',')].concat(d.contacts.map(c => cols.map(k => cell(c[k])).join(','))).join('\n'), 'text/csv');
      } else RV.download('replyvoo-export-' + stamp + '.json', JSON.stringify(d, null, 2), 'application/json');
      RV.closeModal(); toast('Export downloaded');
    } catch (e) { RV.busy(btn, false); fail(e); }
  };
  RV.route('leads', { render: leads });
})();
