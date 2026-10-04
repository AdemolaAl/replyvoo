/* Replyvoo dashboard: app shell (sidebar, topbar, dock, sheet), live polling, notifications, Juno quick-ask, checkout. */
(function () {
  'use strict';
  const RV = window.RV;
  const { $, esc, fmt, GET, POST, toast, fail, go, ic, svgI } = RV;
  const S = RV.S;

  /* ---------- data ---------- */
  RV.loadMe = async function () { const r = await GET('/api/auth/me'); S.me = r.user; S.wsId = r.workspace_id; return r; };
  RV.loadBoot = async function (force) {
    if (S.boot && !force) return S.boot;
    S.boot = await GET('/api/app/bootstrap');
    S.me = S.boot.user;
    S.credits = S.boot.usage.credits;
    return S.boot;
  };
  RV.refreshBoot = async function () { try { await RV.loadBoot(true); paintChrome(); } catch (e) { /* ignore */ } };
  RV.loadClosers = async function (force) { if (S.closers && !force) return S.closers; S.closers = await GET('/api/app/closers'); return S.closers; };
  RV.loadChannels = async function (force) { if (S.channels && !force) return S.channels; S.channels = await GET('/api/app/channels'); return S.channels; };
  RV.flag = k => !S.boot || !S.boot.flags || !S.boot.flags.features || S.boot.flags.features[k] !== false;
  RV.chan = k => (S.boot && S.boot.flags && S.boot.flags.channels && S.boot.flags.channels[k]) || 'off';
  RV.isManager = () => S.boot && ['owner', 'admin'].includes(S.boot.role);
  RV.tpl = id => ((S.boot && S.boot.templates) || []).find(t => t.id === id) || ((S.boot && S.boot.templates) || [])[0] || { id: 'sales', name: 'Ace', role: 'Sales Closer', color: '#FFC21A', letter: 'A', desc: '', skills: [] };
  RV.joinvooOn = () => RV.flag('joinvoo') && S.boot && S.boot.joinvoo && S.boot.joinvoo.enabled !== false;

  /* ---------- nav ---------- */
  function navItems() {
    const f = RV.flag, m = RV.isManager();
    return [
      ['Overview'],
      ['home', 'Home', 'home'],
      f('live_room') && ['live', 'Live Room', 'live', 'LIVE'],
      ['inbox', 'Pulse Inbox', 'inbox', 'badge'],
      ['leads', 'Leads', 'fire'],
      ['Closers'],
      ['closers', 'My Closers', 'bot'],
      f('studio') && ['studio', 'Agent Studio', 'pen'],
      ['channels', 'Channels', 'plane'],
      RV.chan('website') !== 'off' && ['widget', 'Widget Studio', 'globe', 'NEW'],
      f('blast') && ['blast', 'Blast', 'send'],
      f('juno') && ['juno', 'Juno', 'chat', 'AI'],
      ['Money'],
      f('wallet') && ['wallet', 'Voo Wallet', 'wallet'],
      m && ['plan', 'Plan', 'card'],
      f('squad') && ['squad', 'Voo Squad', 'squad'],
      ['Workspace'],
      ['team', 'Team', 'team'],
      ['settings', 'Settings', 'gear'],
      RV.joinvooOn() && ['joinvoo', 'Joinvoo', 'joinvoo', 'SISTER']
    ].filter(Boolean).filter((n, i, arr) => n.length > 1 || (arr[i + 1] && arr[i + 1].length > 1));
  }
  RV.navItems = navItems;
  RV.TITLES = {
    home: ['Home', 'Everything happening right now'], live: ['Live Room', 'Watch your Closers work in real time'], inbox: ['Pulse Inbox', 'Every chat, every channel, one place'],
    leads: ['Leads', 'HeatScore sorts them by how ready they are'], closers: ['My Closers', 'Your AI sales and support team'], studio: ['Agent Studio', 'Build and tune a Closer'],
    channels: ['Channels', 'Where your Closers answer'], widget: ['Widget Studio', 'AI chat on your own website'], blast: ['Blast', 'Broadcast to the right people'], juno: ['Juno', 'Ask your business anything'],
    wallet: ['Voo Wallet', 'Credits, top-ups and spending'], plan: ['Plan', 'Your plan, usage and power-ups'], squad: ['Voo Squad', 'Invite friends, earn every month'],
    joinvoo: ['Joinvoo', 'Our sister app for ad tracking'], team: ['Team', 'People who work in your inbox'], settings: ['Settings', 'Profile, workspace and alerts']
  };
  const href = id => id === 'home' ? '/app' : '/app/' + id;
  function tagHtml(n) {
    if (n[3] === 'badge') return S.unread ? '<span class="side-tag hot tnum" data-unread>' + fmt(S.unread) + '</span>' : '<span class="side-tag hot tnum" data-unread hidden></span>';
    if (n[3] === 'LIVE') return '<span class="side-tag"><span class="live-dot y" style="width:6px;height:6px;flex-basis:6px"></span>LIVE</span>';
    if (n[3] === 'SISTER') return '<span class="side-tag sis">Sister app</span>';
    return n[3] ? '<span class="side-tag">' + n[3] + '</span>' : '';
  }

  /* ---------- shell ---------- */
  RV.shell = function (root) {
    if ($('appRoot')) return;
    const rail = RV.store.get('rail', false);
    root.innerHTML = '<div class="app' + (rail ? ' rail' : '') + '" id="appRoot">' +
      '<aside class="side" id="side" aria-label="Main menu">' +
      '<div class="side-top"><a class="logo" href="/app" aria-label="Replyvoo home" style="color:#FFFFFF">' + RV.LOGO + '<span class="logo-word">Replyvoo</span></a><button class="rail-btn" id="railBtn" aria-label="Collapse menu" title="Collapse menu">' + ic('back', '#C4BFB3', 16, 2.2) + '</button></div>' +
      '<button class="ws hide-rail" id="wsBtn" aria-label="Switch workspace"></button>' +
      '<nav id="sideNav" style="display:flex;flex-direction:column;gap:2px"></nav>' +
      '<div style="margin-top:auto;display:flex;flex-direction:column;gap:10px;padding-top:10px">' +
      '<a class="side-wallet hide-rail shine" href="/app/wallet" id="sideWallet"><span style="font-size:12px;font-weight:800;letter-spacing:.1em;text-transform:uppercase;opacity:.75">Voo Wallet</span><strong class="tnum" style="font-size:26px;letter-spacing:-0.04em" data-bal>0</strong><span style="font-size:12.5px;font-weight:700;opacity:.8">credits · tap to top up</span></a>' +
      '<a class="side-me" href="/app/settings" id="sideMe" aria-label="Your profile"></a>' +
      (S.boot && S.boot.voo && S.boot.voo.enabled ? '<a class="voo-link hide-rail" href="' + RV.esc(S.boot.voo.dashboard_url) + '" target="_blank" rel="noopener">' + RV.vooMark(18) + '<span>Part of ' + RV.VOO_WORD + '</span><span aria-hidden="true">↗</span></a>' : '') + '</div></aside>' +
      '<div class="main"><div id="verifyBar"></div><header class="topbar" id="topbar">' +
      '<a class="show-sm" href="/app/settings" id="topMoji" aria-label="Your profile"></a>' +
      '<div class="top-title"><strong id="pageTitle"></strong><span id="pageSub"></span></div>' +
      '<div class="top-right">' +
      '<span class="pill hide-sm" id="livePill" style="background:#FFFFFF;border:1px solid var(--line);padding:9px 12px;font-size:12.5px"><span class="live-dot"></span><span id="liveCount">0</span>&nbsp;Closers live</span>' +
      '<button class="top-btn" id="helpBtn" data-help aria-label="Help and support" title="Help and support"><span class="help-q">?</span><span class="hide-sm">Help</span><span class="help-dot" data-help-dot hidden></span></button>' +
      '<button class="top-btn hide-xs" id="junoBtn" aria-label="Ask Juno" title="Ask Juno" hidden>' + ic('chat', '#121110', 18, 2.2) + '<span class="hide-sm">Ask Juno</span></button>' +
      '<a class="top-btn" href="/app/wallet" id="topCredits" aria-label="Voo Credits"><span style="width:24px;height:24px;border-radius:50%;background:var(--jade);display:flex;align-items:center;justify-content:center;font-size:12px;font-weight:800">V</span><span class="tnum" data-bal>0</span></a>' +
      '<button class="top-btn round" id="bellBtn" aria-label="Notifications">' + ic('bell', '#121110', 18, 2.2) + '<span class="bell-dot" id="bellDot" hidden></span></button>' +
      '</div></header>' +
      '<main class="page" id="page" tabindex="-1"></main></div>' +
      '<nav class="dock" id="dock" aria-label="App menu"></nav></div>' +
      '<div class="sheet-ovl" id="sheetOvl"></div><div class="sheet" id="sheet" role="dialog" aria-label="Menu" aria-modal="true"></div><div id="popRoot"></div>';
    $('railBtn').addEventListener('click', () => { const r = $('appRoot').classList.toggle('rail'); RV.store.set('rail', r); $('railBtn').setAttribute('aria-label', r ? 'Expand menu' : 'Collapse menu'); });
    $('wsBtn').addEventListener('click', openWorkspaces);
    $('bellBtn').addEventListener('click', openNotifications);
    $('junoBtn').addEventListener('click', openJunoQuick);
    $('sheetOvl').addEventListener('click', () => openSheet(false));
    $('dock').addEventListener('click', e => { if (e.target.closest('#moreBtn')) openSheet(true); });
    $('sheet').addEventListener('click', e => { if (e.target.closest('a,[data-close-sheet]')) openSheet(false); const lo = e.target.closest('[data-logout]'); if (lo) RV.logout(); });
  };

  function paintChrome() {
    if (!$('appRoot') || !S.boot) return;
    const b = S.boot, page = RV.parse().name;
    const items = navItems();
    $('sideNav').innerHTML = items.map(n => n.length === 1 ? '<span class="side-sec">' + n[0] + '</span>' :
      '<a class="side-item' + (page === n[0] ? ' on' : '') + '" href="' + href(n[0]) + '" title="' + n[1] + '"' + (page === n[0] ? ' aria-current="page"' : '') + '>' + svgI(n[2]) + '<span class="lbl-t">' + n[1] + '</span>' + tagHtml(n) + '</a>').join('');
    const plan = b.usage.plan;
    $('wsBtn').innerHTML = '<span class="av" style="width:36px;height:36px;flex-basis:36px;border-radius:11px;background:#FFE58A">' + esc(RV.initials(b.workspace.name)) + '</span><span class="col grow" style="gap:0;line-height:1.25"><strong class="ell" style="font-size:14px">' + esc(b.workspace.name) + '</strong><span style="font-size:12px;color:#A8A294">' + esc(plan.name) + ' plan · ' + esc(b.role) + '</span></span>' + ic('M8 9l4-4 4 4M8 15l4 4 4-4', '#A8A294', 14, 2.4);
    $('sideMe').innerHTML = RV.mojiCircle(b.user.moji, 42) + '<span class="lbl-t col grow" style="gap:0;line-height:1.3"><strong class="ell" style="color:#FFFFFF">' + esc(b.user.name || 'You') + '</strong><span style="font-size:12px;color:#A8A294;text-transform:capitalize">' + esc(b.role) + '</span></span>';
    $('topMoji').innerHTML = RV.mojiCircle(b.user.moji, 38);
    $('sideWallet').hidden = !RV.flag('wallet');
    $('topCredits').hidden = !RV.flag('wallet');
    $('junoBtn').hidden = !RV.flag('juno') || page === 'juno';
    RV.qsa('[data-bal]').forEach(el => { if (el.getAttribute('data-v') == null) { el.textContent = fmt(S.credits); el.setAttribute('data-v', S.credits); } else RV.countTo(el, S.credits); });
    const live = (S.closers || []).filter(c => c.active).length;
    $('liveCount').textContent = live;
    $('livePill').hidden = !S.closers;
    // dock
    const dock = [['home', 'Home', 'home'], RV.flag('live_room') ? ['live', 'Live', 'live'] : ['leads', 'Leads', 'fire'], ['inbox', 'Inbox', 'inbox'], ['closers', 'Closers', 'bot']];
    const inDock = dock.some(d => d[0] === page) || page === 'studio' && false;
    $('dock').innerHTML = dock.map(d => '<a href="' + href(d[0]) + '" class="' + (page === d[0] ? 'on' : '') + '"' + (page === d[0] ? ' aria-current="page"' : '') + '>' + svgI(d[2]) + d[1] + (d[0] === 'inbox' && S.unread ? '<span class="ddot" data-unread-dot></span>' : '') + '</a>').join('') +
      '<button id="moreBtn" class="' + (inDock ? '' : 'on') + '" aria-label="More pages" aria-haspopup="dialog">' + svgI('menu') + 'More</button>';
    // verify banner
    const vb = $('verifyBar');
    if (!b.user.email_verified) {
      if (!vb.innerHTML) vb.innerHTML = '<div class="verify-bar a-drop">' + ic('info', '#FFC21A', 18, 2.2) + '<span class="grow">Please verify your email (' + esc(b.user.email) + ') so you never miss a handoff or receipt.</span><button class="btn btn-jade" id="resendV">Resend link</button></div>';
      const r = $('resendV'); if (r && !r.onclick) r.onclick = async () => { RV.busy(r, true); try { await POST('/api/auth/resend-verify'); toast('Verification link sent to ' + b.user.email); r.textContent = 'Sent ✓'; r.disabled = true; } catch (e) { RV.busy(r, false); fail(e); } };
    } else vb.innerHTML = '';
    const t = RV.TITLES[page] || RV.TITLES.home;
    $('pageTitle').textContent = t[0]; $('pageSub').textContent = t[1];
    document.title = t[0] + ' | Replyvoo';
    paintUnread();
  }
  RV.paintChrome = paintChrome;
  function paintUnread() {
    RV.qsa('[data-unread]').forEach(el => { el.hidden = !S.unread; el.textContent = fmt(S.unread); });
    const dot = RV.qs('[data-unread-dot]');
    if (!dot && S.unread && $('dock')) { const a = RV.qs('#dock a[href="/app/inbox"]'); if (a) a.insertAdjacentHTML('beforeend', '<span class="ddot" data-unread-dot></span>'); }
    if (dot && !S.unread) dot.remove();
  }
  RV.setBalance = function (n) { if (n == null || n === S.credits) return; S.credits = n; if (S.boot) S.boot.usage.credits = n; RV.qsa('[data-bal]').forEach(el => RV.countTo(el, n)); };

  function openSheet(o) {
    $('sheet').classList.toggle('show', o); $('sheetOvl').classList.toggle('show', o);
    if (!o) return;
    const b = S.boot, page = RV.parse().name;
    const items = navItems().filter(n => n.length > 1);
    $('sheet').innerHTML = '<div style="width:44px;height:5px;border-radius:5px;background:var(--line2);margin:4px auto 16px"></div>' +
      '<div class="row" style="gap:12px;margin-bottom:16px">' + RV.mojiCircle(b.user.moji, 46) + '<span class="col grow" style="gap:0;line-height:1.3"><strong class="ell">' + esc(b.user.name || 'You') + '</strong><span class="ell" style="font-size:13px;color:var(--mut)">' + esc(b.workspace.name) + ' · ' + esc(b.usage.plan.name) + '</span></span>' + (RV.flag('wallet') ? '<a class="btn btn-jade btn-sm" href="/app/wallet"><span class="tnum" data-bal data-v="' + S.credits + '">' + fmt(S.credits) + '</span> credits</a>' : '') + '</div>' +
      '<div style="display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:8px">' + items.map(n => '<a class="tile' + (page === n[0] ? ' on' : '') + '" href="' + href(n[0]) + '"><span class="ti">' + ic(n[2], '#121110', 20) + '</span>' + n[1].replace('Pulse Inbox', 'Inbox').replace('Agent Studio', 'Studio') + (n[3] === 'badge' && S.unread ? '<span class="tbadge">' + fmt(S.unread) + '</span>' : '') + (n[3] === 'SISTER' ? '<span class="tbadge">Sister</span>' : '') + '</a>').join('') + '</div>' +
      '<div class="row" style="margin-top:14px;gap:8px">' + (S.boot.workspaces.length > 1 ? '<button class="btn btn-ghost grow" data-close-sheet id="sheetWs">Switch workspace</button>' : '') + '<button class="btn btn-ghost grow" data-close-sheet data-help><span class="help-q sm">?</span>Help</button><button class="btn btn-ghost grow" data-logout>' + ic('logout', '#121110', 18) + 'Log out</button></div>' +
      (S.boot.voo && S.boot.voo.enabled ? '<a class="voo-link voo-link-l" href="' + RV.esc(S.boot.voo.dashboard_url) + '" target="_blank" rel="noopener">' + RV.vooMark(18) + '<span>Part of ' + RV.VOO_WORD + '</span><span aria-hidden="true">↗</span></a>' : '');
    const w = $('sheetWs'); if (w) w.addEventListener('click', openWorkspaces);
  }
  RV.openSheet = openSheet;

  RV.logout = async function () {
    let next = null;
    try { next = (await POST('/api/auth/logout')).next; } catch (e) { /* ignore */ }
    if (next) { location.href = next; return; } // Voo ID: also signs out of VooSquare and every Zedapex tool
    stopPolling(); S.boot = null; S.me = null; S.closers = null; S.channels = null;
    const ar = $('appRoot'); if (ar) ar.remove();
    go('/app/login', { replace: true });
  };

  function openWorkspaces() {
    const b = S.boot;
    RV.modal('<strong class="h3">Workspaces</strong><p class="muted" style="margin:6px 0 16px">Each workspace has its own Closers, inbox and wallet.</p><div class="col" style="gap:8px">' +
      b.workspaces.map(w => '<button class="pick' + (w.id === b.workspace.id ? ' on' : '') + '" data-ws="' + w.id + '"><span class="av" style="background:#FFE58A;border-radius:12px">' + esc(RV.initials(w.name)) + '</span><span class="col grow" style="gap:0"><strong class="ell">' + esc(w.name) + '</strong><span style="font-size:13px;color:var(--mut);text-transform:capitalize">' + esc(w.role) + (w.id === b.workspace.id ? ' · current' : '') + '</span></span></button>').join('') +
      '</div><p class="small muted" style="margin:14px 0 0">Need another workspace for a client? Ask a teammate to invite you, or contact us about agency plans.</p><button class="btn btn-ink" data-close style="width:100%;margin-top:16px">Done</button>', { label: 'Workspaces' });
    RV.qsa('[data-ws]').forEach(btn => btn.addEventListener('click', async () => {
      const id = +btn.getAttribute('data-ws'); if (id === b.workspace.id) { RV.closeModal(); return; }
      RV.busy(btn, true);
      try { await POST('/api/app/workspaces/switch', { id }); RV.closeModal(); S.closers = null; S.channels = null; S.live = null; await RV.loadBoot(true); RV.loadClosers(true).then(paintChrome).catch(() => {}); startPolling(); toast('Switched to ' + S.boot.workspace.name); go('/app'); }
      catch (e) { RV.busy(btn, false); fail(e); }
    }));
  }

  /* ---------- popovers ---------- */
  RV.closePops = function () { const p = $('popRoot'); if (p) p.innerHTML = ''; };
  document.addEventListener('click', e => { const p = $('popRoot'); if (p && p.innerHTML && !e.target.closest('.popover') && !e.target.closest('#bellBtn') && !e.target.closest('#junoBtn')) RV.closePops(); });
  const EV = { handoff: ['#C9A7FF', '→'], hot: ['#FFB199', '🔥'], won: ['#FFC21A', '$'], credits: ['#FFF3CC', 'V'], plan: ['#E3ECFF', '★'], paused: ['#FFE3D6', '!'], squad: ['#E8F6EC', '+'], channel: ['#D7F0FC', '✈'], error: ['#FFE3D6', '!'], closer: ['#FFF3CC', '★'], blast: ['#F1E8FF', '✉'], reply: ['#E8F6EC', '✓'], shield: ['#E8F6EC', '⛨'], nudge: ['#FFF3CC', '↻'], addon: ['#E3ECFF', '+'], lead: ['#E8F6EC', '✉'] };
  RV.EV = EV;
  const evLink = n => n.type === 'handoff' || n.type === 'hot' || n.type === 'won' ? (n.data && n.data.thread_id ? '/app/inbox?t=' + n.data.thread_id : '/app/inbox') : n.type === 'credits' ? '/app/wallet' : n.type === 'plan' ? '/app/plan' : n.type === 'channel' ? '/app/channels' : n.type === 'lead' ? (n.data && n.data.thread_id ? '/app/inbox?t=' + n.data.thread_id : '/app/leads') : n.type === 'squad' ? '/app/squad' : n.type === 'paused' ? '/app/wallet' : n.type === 'blast' ? '/app/blast' : '/app';
  RV.evLink = evLink;
  async function openNotifications() {
    const root = $('popRoot');
    if (root.innerHTML && root.querySelector('#notifPop')) { RV.closePops(); return; }
    root.innerHTML = '<div class="popover a-drop" id="notifPop" role="dialog" aria-label="Notifications"><div class="pop-h"><strong>Notifications</strong><span class="small muted">Handoffs, hot leads, payments</span></div><div class="pop-list" id="notifList"><div class="col" style="padding:10px;gap:8px"><div class="sk" style="height:44px"></div><div class="sk" style="height:44px"></div><div class="sk" style="height:44px"></div></div></div></div>';
    try {
      const list = await GET('/api/app/notifications');
      const el = $('notifList'); if (!el) return;
      if (list.length) RV.store.set('seen_' + S.boot.workspace.id, list[0].id);
      $('bellDot').hidden = true;
      el.innerHTML = list.length ? list.map(n => { const c = EV[n.type] || ['#F2F0EA', '•']; return '<a class="ev" href="' + evLink(n) + '" style="text-decoration:none;color:inherit"><span class="ev-ic" style="background:' + c[0] + '">' + c[1] + '</span><span class="col grow" style="gap:2px"><span>' + esc(n.text) + '</span><span style="font-size:12px;color:var(--mut2);font-weight:700">' + RV.ago(n.created_at) + '</span></span></a>'; }).join('')
        : RV.empty('All quiet', 'Handoffs, hot leads and payments will show up here.', '');
    } catch (e) { fail(e); RV.closePops(); }
  }
  function openJunoQuick() {
    const root = $('popRoot');
    if (root.querySelector('#junoPop')) { RV.closePops(); return; }
    const sug = ['How was today?', 'Who should I follow up first?', 'Which chats need a human?'];
    root.innerHTML = '<div class="popover a-drop" id="junoPop" role="dialog" aria-label="Ask Juno"><div class="pop-h" style="background:linear-gradient(135deg,#FFD23F,#FFC21A)"><span class="row" style="gap:10px">' + RV.junoArt(40) + '<strong>Ask Juno</strong></span><a class="small" href="/app/juno" style="font-weight:800">Open Juno</a></div>' +
      '<div class="col" style="padding:14px;gap:10px"><div id="jqAns" class="small muted">Juno reads your chats and stats. Ask anything about today.</div><div class="row" style="flex-wrap:wrap;gap:6px">' + sug.map(s => '<button class="chip" data-jq="' + esc(s) + '" style="padding:6px 11px;font-size:12.5px">' + esc(s) + '</button>').join('') + '</div>' +
      '<form id="jqForm" class="row" style="gap:8px"><label for="jqIn" class="sr">Question for Juno</label><input id="jqIn" class="input" placeholder="Ask Juno…" autocomplete="off" style="padding:11px 13px;font-size:15px"><button class="btn btn-ink" type="submit" style="padding:11px 16px">Ask</button></form></div></div>';
    const ask = async q => {
      if (!q) return;
      const a = $('jqAns'); a.className = ''; a.innerHTML = '<div class="bub-me" style="max-width:100%;margin-left:auto;width:fit-content">' + esc(q) + '</div><div class="bub-in" style="margin-top:8px;display:flex;gap:5px;width:fit-content"><span class="dot"></span><span class="dot"></span><span class="dot"></span></div>';
      try { const r = await POST('/api/app/juno', { question: q }); a.innerHTML = '<div class="bub-me" style="margin-left:auto;width:fit-content;max-width:100%">' + esc(q) + '</div><div class="bub-in a-in" style="margin-top:8px;max-width:100%">' + esc(r.answer) + '</div>'; }
      catch (e) { a.innerHTML = ''; fail(e); }
    };
    $('jqForm').addEventListener('submit', e => { e.preventDefault(); const v = $('jqIn').value.trim(); $('jqIn').value = ''; ask(v); });
    root.querySelectorAll('[data-jq]').forEach(b => b.addEventListener('click', () => ask(b.getAttribute('data-jq'))));
    setTimeout(() => { const i = $('jqIn'); if (i) i.focus(); }, 50);
  }

  /* ---------- live polling ---------- */
  let timer = null, inflight = false;
  const listeners = new Set();
  RV.onLive = fn => { listeners.add(fn); return () => listeners.delete(fn); };
  RV.clearLive = () => listeners.clear();
  async function poll() {
    if (inflight || !S.boot || document.hidden) return;
    inflight = true;
    const L = S.live || (S.live = { ev: 0, msg: 0, msgs: [], events: [], first: true });
    try {
      const r = await GET('/api/app/live?after=' + L.ev + '&after_msg=' + L.msg);
      const msgs = r.messages.slice().reverse(), evs = r.events.slice().reverse();
      if (msgs.length) L.msg = msgs[msgs.length - 1].id;
      if (evs.length) L.ev = evs[evs.length - 1].id;
      L.msgs = L.msgs.concat(msgs).slice(-80);
      L.events = L.events.concat(evs).slice(-50);
      const firstRun = L.first; L.first = false;
      const prevUnread = S.unread;
      S.unread = r.unread;
      if (prevUnread !== S.unread) { paintUnread(); }
      RV.setBalance(r.credits);
      if (!firstRun) {
        evs.forEach(ev => {
          if (ev.type === 'handoff') toast(ev.text, 'handoff', { label: 'Open', fn: () => go(evLink(ev)) });
          else if (ev.type === 'hot') toast(ev.text, 'hot', { label: 'Open', fn: () => go(evLink(ev)) });
          else if (ev.type === 'won') { toast(ev.text, 'won'); RV.confetti(24, true); }
          else if (ev.type === 'paused' || ev.type === 'error') toast(ev.text, 'err');
          else if (ev.type === 'credits' || ev.type === 'plan' || ev.type === 'squad') toast(ev.text, 'credits');
          if (ev.type === 'lead') toast(ev.text, 'ok', { label: 'Open', fn: () => go(evLink(ev)) });
          if (['handoff', 'hot', 'won', 'credits', 'plan', 'paused', 'squad', 'channel', 'error', 'lead'].includes(ev.type)) { const d = $('bellDot'); if (d) { d.hidden = false; const bb = $('bellBtn'); bb.classList.remove('a-ring'); void bb.offsetWidth; bb.classList.add('a-ring'); } }
        });
      } else {
        const seen = RV.store.get('seen_' + S.boot.workspace.id, 0);
        const top = evs.filter(e => ['handoff', 'hot', 'won', 'credits', 'plan', 'paused', 'squad', 'channel', 'error'].includes(e.type)).pop();
        if (top && top.id > seen && $('bellDot')) $('bellDot').hidden = false;
      }
      listeners.forEach(fn => { try { fn({ messages: msgs, events: evs, first: firstRun, unread: r.unread, conv_used: r.conv_used }); } catch (e) { console.warn(e); } });
    } catch (e) { /* network hiccup: try again next tick */ }
    inflight = false;
  }
  RV.poll = poll;
  function startPolling() { stopPolling(); S.live = null; poll(); timer = setInterval(poll, 4000); }
  function stopPolling() { if (timer) clearInterval(timer); timer = null; }
  RV.startPolling = startPolling; RV.stopPolling = stopPolling;
  document.addEventListener('visibilitychange', () => { if (!document.hidden && timer) poll(); });

  /* ---------- checkout ---------- */
  // opts: {kind:'plan'|'pack'|'addon', item_id, interval, coupon}
  RV.checkout = async function (opts) {
    if (!RV.isManager()) { toast('Only owners and admins can buy. Ask your workspace owner.', 'err'); return; }
    const st = { kind: opts.kind, item_id: String(opts.item_id), interval: opts.interval || 'month', coupon: opts.coupon || '', provider: null, coin: null, pv: null };
    RV.modal('<div id="coBody" class="col" style="gap:14px"><strong class="h3">Checkout</strong><div class="sk" style="height:120px"></div><div class="sk" style="height:56px"></div></div>', { label: 'Checkout' });
    async function load(couponTry) {
      try {
        st.pv = await POST('/api/app/checkout/preview', { kind: st.kind, item_id: st.item_id, interval: st.interval, coupon: couponTry != null ? couponTry : st.coupon });
        if (couponTry != null) { st.coupon = couponTry; if (couponTry) toast('Coupon applied'); }
        if (!st.provider || !st.pv.providers.some(p => p.id === st.provider)) st.provider = (st.pv.providers[0] || {}).id || null;
        draw();
      } catch (e) {
        if (couponTry != null) { const ce = $('coErr'); if (ce) { ce.textContent = e.message; ce.hidden = false; } else fail(e); return; }
        RV.closeModal(); fail(e);
      }
    }
    // Gatevoo: pick the coin here so the payment page opens on it (the customer can still switch there).
    function coinPicker(p) {
      const gv = st.provider === 'gatevoo' && p.providers.find(x => x.id === 'gatevoo');
      if (!gv || !(gv.coins || []).length) return '';
      if (!gv.coins.some(c => c.id === st.coin)) st.coin = gv.coins[0].id;
      return '<div class="gv-pay a-in" role="radiogroup" aria-label="Choose a coin">' + gv.coins.map(c => '<button type="button" role="radio" class="gv-opt' + (c.id === st.coin ? ' on' : '') + '" data-coin="' + esc(c.id) + '" aria-checked="' + (c.id === st.coin) + '"><span class="gv-coin gv-' + esc(c.id) + '">' + (c.id === 'BTC' ? '₿' : '₮') + '</span><span class="col" style="gap:0;text-align:left"><strong>' + esc(c.label) + '</strong><small>' + esc(c.network) + '</small></span></button>').join('') +
        '<p class="gv-note">' + RV.gatevooMark(16) + '<span>Pay from any wallet or exchange. Your order activates on its own once the coins land' + (gv.sandbox ? '. <b>Sandbox: no real coins.</b>' : '.') + '</span></p></div>';
    }
    function draw() {
      const p = st.pv, body = $('coBody'); if (!body) return;
      const icon = st.kind === 'plan' ? '★' : st.kind === 'pack' ? 'V' : '+';
      body.innerHTML = '<div class="row" style="gap:12px"><span style="width:52px;height:52px;border-radius:16px;background:linear-gradient(135deg,#FFD23F,#FFC21A);display:flex;align-items:center;justify-content:center;font-weight:800;font-size:22px">' + icon + '</span><span class="col grow" style="gap:0"><span class="eyebrow" style="font-size:11px">Checkout</span><strong style="font-size:19px;letter-spacing:-0.02em">' + esc(p.item_name) + '</strong></span></div>' +
        '<div class="col" style="gap:0;background:var(--soft);border:1px solid var(--line);border-radius:18px;padding:6px 16px">' +
        '<div class="row" style="justify-content:space-between;padding:10px 0"><span class="muted">Price</span><strong class="tnum">' + RV.usd(p.amount) + '</strong></div>' +
        (p.offer ? '<div class="row" style="justify-content:space-between;padding:10px 0;border-top:1px solid var(--line)"><span class="muted">Offer</span><span class="pill" style="background:var(--mint);color:var(--jade-dd)">' + esc(p.offer) + ' applied</span></div>' : '') +
        (p.discount ? '<div class="row" style="justify-content:space-between;padding:10px 0;border-top:1px solid var(--line)"><span class="muted">Coupon ' + esc(p.coupon || '') + '</span><strong class="tnum" style="color:#1E6B3A">−' + RV.usd(p.discount) + '</strong></div>' : '') +
        '<div class="row" style="justify-content:space-between;padding:12px 0;border-top:1px solid var(--line)"><strong>Total</strong><strong class="tnum" style="font-size:24px;letter-spacing:-0.03em">' + RV.usd(p.total) + '</strong></div></div>' +
        '<form id="coCoupon" class="col" style="gap:6px"><label class="lbl" for="coCode">Coupon code</label><div class="row" style="gap:8px"><input id="coCode" class="input" placeholder="e.g. WELCOME20" value="' + esc(st.coupon) + '" autocomplete="off" style="text-transform:uppercase;padding:11px 14px"><button class="btn btn-ghost" type="submit" style="padding:11px 16px">' + (p.coupon ? 'Update' : 'Apply') + '</button>' + (p.coupon ? '<button class="btn btn-ghost" type="button" id="coRemove" style="padding:11px 14px" aria-label="Remove coupon">' + ic('x', '#121110', 16, 2.4) + '</button>' : '') + '</div><span id="coErr" class="small" style="color:#9A2A12;font-weight:700" hidden></span></form>' +
        (p.total > 0 ? (p.providers.length ? '<div class="col" style="gap:8px"><span class="lbl">Pay with</span>' + p.providers.map(pr => '<button type="button" class="pick' + (pr.id === 'gatevoo' ? ' gv-pick' : '') + (pr.id === st.provider ? ' on' : '') + '" data-prov="' + esc(pr.id) + '" aria-pressed="' + (pr.id === st.provider) + '">' + (pr.id === 'gatevoo' ? '<span class="av" style="background:none;border-radius:12px">' + RV.gatevooMark(40) + '</span><span class="col grow" style="gap:2px;min-width:0"><strong class="row" style="gap:8px;flex-wrap:wrap">Crypto<span class="gv-coins">' + (pr.coins || []).map(c => '<span class="gv-coin gv-' + esc(c.id) + '">' + (c.id === 'BTC' ? '₿' : '₮') + '</span>').join('') + '</span></strong><span style="font-size:13px;color:var(--mut)">' + esc((pr.coins || []).map(c => c.label).join(' or ')) + ' · secured by ' + RV.gatevooWord(13) + '</span></span>' : '<span class="av" style="background:' + (pr.id === 'crypto' ? '#E8F6EC' : pr.id === 'demo' ? '#F1E8FF' : '#E3ECFF') + ';border-radius:12px;font-size:12px">' + esc(pr.name.slice(0, 2).toUpperCase()) + '</span><span class="col grow" style="gap:0"><strong>' + esc(pr.name) + '</strong><span style="font-size:13px;color:var(--mut)">' + esc(pr.note || '') + '</span></span>') + '<span class="ck" style="width:20px;height:20px;border-radius:50%;border:2px solid ' + (pr.id === st.provider ? 'var(--ink)' : 'var(--line2)') + ';background:' + (pr.id === st.provider ? 'radial-gradient(circle,#121110 40%,#fff 45%)' : '#fff') + '"></span></button>' + (pr.id === 'gatevoo' ? coinPicker(p) : '')).join('') + '</div>'
          : '<div class="err">Payments aren’t set up yet. Please contact support.</div>') : '<div class="ok-box">Nothing to pay. Your coupon covers it all.</div>') +
        '<button class="btn btn-main" id="coPay" style="justify-content:space-between;width:100%"' + (p.total > 0 && !p.providers.length ? ' disabled' : '') + '>' + (p.total > 0 ? 'Pay ' + RV.usd(p.total) + (st.provider === 'gatevoo' ? ' in ' + (st.coin === 'BTC' ? 'Bitcoin' : 'USDT') : '') : 'Activate now') + '<span class="arr">' + ic('right', '#121110', 18, 2.6) + '</span></button>' +
        '<p class="small muted" style="margin:0;text-align:center">Secure checkout. You’ll come straight back here when it’s done.</p>';
      $('coCoupon').addEventListener('submit', e => { e.preventDefault(); load($('coCode').value.trim().toUpperCase()); });
      const rm = $('coRemove'); if (rm) rm.addEventListener('click', () => load(''));
      body.querySelectorAll('[data-prov]').forEach(b => b.addEventListener('click', () => { st.provider = b.getAttribute('data-prov'); draw(); }));
      body.querySelectorAll('[data-coin]').forEach(b => b.addEventListener('click', () => { st.coin = b.getAttribute('data-coin'); draw(); }));
      $('coPay').addEventListener('click', pay);
    }
    async function pay() {
      const btn = $('coPay'); RV.busy(btn, true, 'Starting checkout…');
      try {
        const r = await POST('/api/app/checkout', { kind: st.kind, item_id: st.item_id, interval: st.interval, coupon: st.coupon, provider: st.provider, coin: st.provider === 'gatevoo' ? st.coin : undefined });
        if (r.redirect) { location.href = r.redirect; return; }
        if (r.instructions) { showUsdt(r); return; }
        if (r.done) { RV.closeModal(); celebrate('Done! ' + st.pv.item_name + ' is active.'); await afterPurchase(); return; }
        RV.busy(btn, false);
      } catch (e) { RV.busy(btn, false); fail(e); }
    }
    function showUsdt(r) {
      const i = r.instructions, body = $('coBody');
      const line = (l, v) => '<div class="col" style="gap:4px"><span class="lbl">' + l + '</span><div class="copy-row"><span class="mono">' + esc(v) + '</span><button class="btn btn-ink btn-sm" data-copy="' + esc(v) + '">Copy</button></div></div>';
      body.innerHTML = '<strong class="h3">Pay with USDT</strong><p class="muted" style="margin:0">' + esc(i.note) + '</p>' + line('Network', i.network) + line('Wallet address', i.wallet) + line('Amount (' + i.currency + ')', String(i.amount)) + line('Your reference', r.ref) +
        '<div class="ok-box">We’ll activate your order as soon as the transfer is confirmed. You can track it in your Voo Wallet under Orders.</div><a class="btn btn-ink" href="/app/wallet" data-close style="width:100%">Got it</a>';
      body.querySelectorAll('[data-copy]').forEach(b => b.addEventListener('click', () => RV.copy(b.getAttribute('data-copy'), 'Copied')));
    }
    load();
  };
  function celebrate(msg) { RV.confetti(60, true); toast(msg, 'won'); }
  async function afterPurchase() { await RV.refreshBoot(); S.closers = null; RV.loadClosers(true).then(paintChrome).catch(() => {}); if (RV.rerender) RV.rerender(); }
  RV.afterPurchase = afterPurchase;

  // Returning from a payment page with ?order=<ref>
  RV.watchOrder = async function (ref) {
    if (!ref || S.watching === ref) return;
    S.watching = ref;
    const t0 = Date.now();
    RV.modal('<div class="col" style="align-items:center;text-align:center;gap:14px;padding:10px 0" id="owBody">' + RV.moneyGuy(180) + '<strong class="h3">Confirming your payment…</strong><p class="muted" style="margin:0">This usually takes a few seconds. Reference <strong>' + esc(ref) + '</strong></p><span class="spin" style="width:28px;height:28px;border-radius:50%;border:3px solid #121110;border-top-color:transparent;animation:aSpin .8s linear infinite;display:inline-block"></span></div>', { label: 'Confirming payment', noFocus: true });
    const clean = () => { const u = new URL(location.href); u.searchParams.delete('order'); history.replaceState({}, '', u.pathname + u.search); };
    while (Date.now() - t0 < 60000) {
      let o = null;
      try { o = await GET('/api/app/orders/' + encodeURIComponent(ref)); } catch (e) { if (e.status === 404) { RV.closeModal(); toast('We couldn’t find that order.', 'err'); clean(); S.watching = null; return; } }
      if (o && o.status === 'paid') {
        clean();
        const b = $('owBody');
        if (b) b.innerHTML = '<div class="a-pop">' + RV.moneyGuy(200) + '</div><strong class="h3">Payment received!</strong><p class="muted" style="margin:0">' + esc(o.item_name) + ' is active. Thank you.</p><button class="btn btn-ink" data-close style="width:100%">Awesome</button>';
        RV.confetti(70, true);
        await afterPurchase();
        S.watching = null; return;
      }
      if (o && (o.status === 'failed' || o.status === 'cancelled')) { clean(); const b = $('owBody'); if (b) b.innerHTML = '<strong class="h3">Payment didn’t go through</strong><p class="muted" style="margin:0">No money was taken for ' + esc(o.item_name) + '. You can try again anytime.</p><button class="btn btn-ink" data-close style="width:100%">Close</button>'; S.watching = null; return; }
      if (!$('owBody')) { S.watching = null; clean(); return; }
      await new Promise(r => setTimeout(r, 2500));
    }
    clean();
    const b = $('owBody'); if (b) b.innerHTML = '<strong class="h3">Still waiting on the payment</strong><p class="muted" style="margin:0">Your order ' + esc(ref) + ' is pending. If you paid, it will activate automatically. Check Orders in your Voo Wallet.</p><button class="btn btn-ink" data-close style="width:100%">OK</button>';
    S.watching = null;
  };

  // Shared: "Closer team is full" modal.
  RV.closerFull = function () {
    const b = S.boot, cost = b.billing.extra_closer_credits || 150, u = b.usage, canBuy = RV.isManager();
    const next = (b.plans || []).filter(p => !p.contact_sales && p.price_month > (u.plan.price_month || 0)).sort((a, c) => a.price_month - c.price_month)[0];
    RV.modal('<div class="col" style="gap:14px"><div class="row" style="gap:0">' + ['#FFC21A', '#8FB8FF', '#7EE0B0'].map((c, i) => '<span style="margin-left:' + (i ? -14 : 0) + 'px">' + RV.closerBot(c, 56, '') + '</span>').join('') + '</div><strong class="h3">Your Closer team is full</strong><span class="muted">You’re using ' + u.closers_used + ' of ' + u.closers_limit + ' Closers on ' + esc(u.plan.name) + '. Pick how you want to grow:</span>' +
      (canBuy ? '<button class="pick" id="slotBtn"><span class="av" style="background:#FFF3CC;border-radius:12px">V</span><span class="col grow" style="gap:0"><strong>Unlock an extra Closer for ' + fmt(cost) + ' credits</strong><span style="font-size:13px;color:var(--mut)">30 days, paid from your Voo Wallet (' + fmt(S.credits) + ' credits)</span></span></button>' +
        (next ? '<a class="pick" href="/app/plan" data-close style="text-decoration:none"><span class="av" style="background:#121110;color:#FFC21A;border-radius:12px">' + (next.closers > 999 ? '∞' : next.closers) + '</span><span class="col grow" style="gap:0"><strong>Upgrade to ' + esc(next.name) + ' · ' + (next.closers > 999 ? 'unlimited' : next.closers) + ' Closers</strong><span style="font-size:13px;color:var(--mut)">' + RV.usd(next.price_month) + '/month with ' + fmt(next.conversations) + ' conversations</span></span></a>' : '') : '<p class="muted" style="margin:0">Ask your workspace owner to add a Closer slot or upgrade.</p>') +
      '<button class="btn btn-ghost" data-close>Not now</button></div>', { label: 'Closer team is full' });
    const sb = $('slotBtn');
    if (sb) sb.addEventListener('click', async () => {
      RV.busy(sb, true, 'Unlocking…');
      try { await POST('/api/app/closers/slot'); RV.closeModal(); toast('Extra Closer unlocked for 30 days'); RV.confetti(30); await RV.refreshBoot(); if (RV.rerender) RV.rerender(); }
      catch (e) { RV.busy(sb, false); if (e.code === 'no_credits') { RV.closeModal(); toast(e.message, 'err', { label: 'Top up', fn: () => go('/app/wallet') }); } else fail(e); }
    });
  };
})();
