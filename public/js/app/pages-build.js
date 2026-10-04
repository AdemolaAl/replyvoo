/* Replyvoo dashboard pages: My Closers, Agent Studio, Channels, Blast, Juno. */
(function () {
  'use strict';
  const RV = window.RV;
  const { $, esc, fmt, GET, PUT, POST, DEL, toast, fail, go, ic } = RV;
  const S = RV.S;
  const panel = (cls, head, body, attrs) => RV.panel(cls, head, body, attrs);

  /* ======================= MY CLOSERS ======================= */
  async function closers(ctx) {
    const [list] = await Promise.all([RV.loadClosers(true), RV.loadChannels(true)]);
    if (!ctx.ok()) return;
    RV.paintChrome();
    const u = S.boot.usage, mgr = RV.isManager(), lim = u.closers_limit, used = list.length;
    const studio = RV.flag('studio');
    const newBtn = mgr && studio ? '<button class="btn btn-jade" data-newc>' + ic('plus', '#121110', 18, 2.6) + 'Build a Closer</button>' : '';
    ctx.el.innerHTML = '<section class="panel a-in" style="flex-direction:row;flex-wrap:wrap;align-items:center;gap:16px"><span class="col" style="gap:4px;flex:1 1 260px;min-width:0"><strong style="font-size:17px">' + used + ' of ' + (lim > 9000 ? 'unlimited' : lim) + ' Closers on ' + esc(u.plan.name) + '</strong><span class="muted small">Need more? Unlock an extra Closer for ' + fmt(S.boot.billing.extra_closer_credits) + ' credits, or upgrade your plan.</span></span><span class="meter" style="flex:1 1 200px"><span style="width:' + Math.min(100, used / Math.max(1, lim) * 100) + '%"></span></span>' + newBtn + '</section>' +
      (list.length ? '<div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(280px,1fr));gap:14px">' + list.map((c, i) => {
        const t = RV.tpl(c.template), ch = c.channels || [];
        return '<article class="card lift a-in" style="animation-delay:' + (i * 0.06) + 's;padding:20px;border-radius:26px;display:flex;flex-direction:column;gap:12px;position:relative;overflow:hidden"><div style="position:absolute;right:-50px;top:-50px;width:170px;height:170px;border-radius:50%;background:' + t.color + ';opacity:.25"></div>' +
          '<div class="row" style="gap:12px;position:relative">' + RV.closerBot(t.color, 70, t.letter) + '<span class="col grow" style="gap:0;line-height:1.25"><strong class="ell" style="font-size:21px;letter-spacing:-0.03em">' + esc(c.name) + '</strong><span style="font-size:13.5px;color:var(--mut);font-weight:600">' + esc(t.role) + '</span>' + (c.pro_brain ? '<span class="pill" style="background:#121110;color:#FFC21A;align-self:flex-start;margin-top:4px">Pro Brain</span>' : '') + '</span>' +
          (mgr ? '<button class="toggle ' + (c.active ? 'on' : 'off') + '" data-ctog="' + c.id + '" aria-label="' + esc(c.name) + ' is ' + (c.active ? 'on' : 'paused') + '. Toggle." aria-pressed="' + c.active + '"><span></span></button>' : '<span class="pill" style="background:' + (c.active ? '#E8F6EC;color:#1E6B3A' : '#F2F0EA;color:#5E5A50') + '">' + (c.active ? 'On' : 'Paused') + '</span>') + '</div>' +
          '<div style="display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:8px;position:relative"><div style="background:var(--soft);border-radius:14px;padding:10px 12px"><span style="font-size:12px;color:var(--mut);font-weight:700">Replies</span><br><b class="tnum" style="font-size:20px">' + fmt(c.replies) + '</b></div>' + (studio ? '<a href="/app/studio?id=' + c.id + '&tab=tests" class="cl-score" aria-label="Training score ' + (c.score || 0) + '">' + RV.scoreRing(c.score || 0, 40) + '<span class="col" style="gap:0;line-height:1.2;min-width:0"><span style="font-size:12px;color:var(--mut);font-weight:700">Training</span><b style="font-size:13.5px" class="ell">' + ((c.score || 0) >= 80 ? 'Ready' : (c.score || 0) >= 50 ? 'Getting there' : 'Needs training') + '</b></span></a>' : '<div style="background:var(--soft);border-radius:14px;padding:10px 12px"><span style="font-size:12px;color:var(--mut);font-weight:700">Knowledge</span><br><b style="font-size:20px">' + fmt(c.knowledge_items || 0) + '</b></div>') + '</div>' +
          (c.locked ? '<a href="/app/plan" class="pill" style="position:relative;align-self:flex-start;background:#121110;color:#FFC21A;text-decoration:none;padding:6px 11px">Paused: over your plan’s Closer limit · Upgrade →</a>' : '') +
          (studio && c.gaps ? '<a href="/app/studio?id=' + c.id + '&tab=gaps" class="pill" style="position:relative;align-self:flex-start;background:#FFF0EC;color:#9A2A12;text-decoration:none;padding:6px 11px">' + c.gaps + ' gap' + (c.gaps === 1 ? '' : 's') + ' to teach →</a>' : '') +
          '<span style="font-size:13.5px;color:var(--mut);position:relative">' + (ch.length ? 'Answers on ' + ch.map(x => '<strong style="color:var(--ink)">' + esc(x.username ? '@' + x.username : x.name) + '</strong>').join(', ') : 'Not on a channel yet. <a href="/app/channels" style="font-weight:800">Connect one</a>') + '</span>' +
          '<div class="row" style="gap:8px;position:relative;margin-top:auto">' + (studio ? '<a class="btn btn-ghost btn-sm grow" href="/app/studio?id=' + c.id + '">' + (mgr ? 'Tune' : 'View') + '</a>' : '') + (RV.flag('live_room') ? '<a class="btn btn-ink btn-sm grow" href="/app/live">Watch live</a>' : '<a class="btn btn-ink btn-sm grow" href="/app/inbox">Inbox</a>') + '</div></article>';
      }).join('') + (mgr && studio ? '<button class="card a-in" data-newc style="border:2px dashed var(--line2);background:var(--soft);border-radius:26px;padding:24px;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:12px;cursor:pointer;min-height:280px"><span style="width:64px;height:64px;border-radius:22px;background:var(--jade);display:flex;align-items:center;justify-content:center">' + ic('plus', '#121110', 30, 2.6) + '</span><strong style="font-size:18px">Build a new Closer</strong><span class="muted small" style="text-align:center">Sales, support, VIP, bookings, win-backs or group guarding.</span></button>' : '') + '</div>'
        : '<section class="panel a-in">' + RV.empty('Hire your first Closer', 'Stop spending heavy money on staff when an agent can do it. Pick a job, add your FAQ and your Closer answers Telegram customers in seconds, day and night.', newBtn || '<p class="small">Ask your workspace owner to build one.</p>', '<div class="row" style="gap:0">' + ['#FFC21A', '#8FB8FF', '#7EE0B0'].map((c, i) => '<span style="margin-left:' + (i ? -18 : 0) + 'px;animation-delay:' + (i * 0.4) + 's">' + RV.closerBot(c, 90, ['A', 'M', 'B'][i]) + '</span>').join('') + '</div>') + '</section>');
    ctx.el.querySelectorAll('[data-newc]').forEach(b => b.addEventListener('click', newCloser));
    ctx.el.querySelectorAll('[data-ctog]').forEach(b => b.addEventListener('click', async () => {
      const id = +b.getAttribute('data-ctog'), c = list.find(x => x.id === id), on = !c.active;
      b.className = 'toggle ' + (on ? 'on' : 'off'); b.disabled = true;
      try { await PUT('/api/app/closers/' + id, { active: on }); c.active = on; toast(c.name + (on ? ' is back on' : ' is paused')); RV.paintChrome(); }
      catch (e) { b.className = 'toggle ' + (c.active ? 'on' : 'off'); fail(e); }
      b.disabled = false; b.setAttribute('aria-pressed', c.active);
    }));
  }
  function newCloser() {
    const u = S.boot.usage;
    if ((S.closers || []).length >= u.closers_limit) { RV.closerFull(); return; }
    go('/app/studio');
  }
  RV.route('closers', { render: closers });

  /* Agent Studio lives in pages-studio.js. */
  function chanLabel(type) { return { telegram_bot: 'Telegram bot', telegram_business: 'Telegram account', telegram_group: 'Telegram group', website: 'Website chat' }[type] || 'Telegram'; }
  RV.chanLabel = chanLabel;

  /* ======================= CHANNELS ======================= */
  function phoneMock(step) {
    const msgs = [
      ['me', '/newbot'], ['bf', 'Alright, a new bot. How are we going to call it?'], ['me', 'Glow Labs Shop'], ['bf', 'Good. Now choose a username. It must end in “bot”.'], ['me', 'glowlabs_shop_bot'], ['bf', 'Done! Use this token to access the HTTP API:\n7123456789:AAH-xY...'], ['me', 'Copied ✓']
    ];
    const upto = step === 0 ? 2 : step === 1 ? 5 : 7;
    return '<div class="phone" style="width:240px"><div class="phone-screen" style="height:400px;border-radius:34px"><div class="row" style="background:#fff;padding:16px 12px 10px;gap:8px;border-bottom:1px solid var(--line)">' + RV.brandIcon('telegram', 32) + '<span class="col" style="gap:0;line-height:1.2"><strong style="font-size:13.5px">BotFather</strong><span style="font-size:11px;color:var(--mut)">bot</span></span></div><div class="col" style="flex:1;padding:10px;gap:6px;justify-content:flex-end;background:#DCE8F0">' +
      msgs.slice(0, upto).map((m, i) => '<div class="' + (m[0] === 'me' ? 'bub-me' : 'bub-in') + ' a-in" style="font-size:12px;padding:7px 10px;animation-delay:' + (i * 0.35) + 's;' + (m[0] === 'me' ? 'background:#2AABEE' : '') + (i === 5 ? ';font-family:ui-monospace,monospace' : '') + '">' + esc(m[1]) + '</div>').join('') + '</div></div></div>';
  }
  async function channels(ctx) {
    const [list] = await Promise.all([RV.loadChannels(true), RV.loadClosers(), RV.refreshBoot()]);
    if (!ctx.ok()) return;
    const mgr = RV.isManager(), b = S.boot, cat = b.channels_catalog || [];
    const fBot = RV.chan('telegram_bot'), fBiz = RV.chan('telegram_business'), fGrp = RV.chan('telegram_group');
    const bots = list.filter(c => c.type === 'telegram_bot');
    const others = cat.filter(c => c.id !== 'telegram' && c.id !== 'website' && RV.chan(c.flag) !== 'off');
    const fWeb = RV.chan('website'), sites = list.filter(c => c.type === 'website');
    const wl = new Set(b.waitlist || []);
    const mock = id => {
      const lines = { whatsapp: [['in', 'Hi! Is the blue one in stock?'], ['out', 'Yes! Want me to reserve it?'], ['in', 'Yes please 🙏']], instagram: [['in', 'Replied to your story: price? 😍'], ['out', 'It’s $24. Shall I send the link?'], ['in', 'Send it!']], tiktok: [['in', 'Saw your video, how do I order?'], ['out', 'Easy! Tap the link and pick your size.'], ['in', 'Done ✅']], messenger: [['in', 'Are you open on Sunday?'], ['out', 'We are, 10am to 4pm!'], ['in', 'See you then']] }[id] || [];
      const col = { whatsapp: ['#E7F8EE', '#25D366'], instagram: ['#FFF0F5', '#E1306C'], tiktok: ['#F2F0EA', '#121110'], messenger: ['#EFEDFF', '#6D5BFF'] }[id] || ['#F2F0EA', '#121110'];
      return '<div class="soon-mock" style="background:' + col[0] + '">' + lines.map((l, i) => '<span class="mb" style="animation-delay:' + (i * 1.1) + 's;' + (l[0] === 'out' ? 'align-self:flex-end;background:' + col[1] + ';color:#fff' : 'align-self:flex-start;background:#fff') + '">' + esc(l[1]) + '</span>').join('') + '</div>';
    };
    ctx.el.innerHTML =
      '<section class="hero-ink a-in" style="gap:24px"><div class="mesh a-mesh" style="width:420px;height:420px;right:-140px;top:-160px;background:#2AABEE;opacity:.28"></div><div class="mesh a-mesh2" style="width:320px;height:320px;left:-120px;bottom:-160px;background:#FFC21A;opacity:.25"></div>' +
      '<div class="col" style="flex:1 1 320px;gap:12px;position:relative;min-width:0"><span class="eyebrow" style="color:var(--jade)">Channels</span><strong style="font-size:clamp(26px,3.4vw,40px);letter-spacing:-0.045em;line-height:1.05">You’re killing conversion with delay response. <span class="it" style="color:var(--jade)">Fix it today.</span></strong><span style="color:#C4BFB3">Plug in a Telegram bot, your own account or a group. Your Closers answer in seconds, 24/7.</span>' +
      '<div class="row" style="gap:8px;flex-wrap:wrap">' + (mgr && fBot === 'live' ? '<button class="btn btn-jade" data-wizard>' + ic('plus', '#121110', 18, 2.6) + 'Connect a Telegram bot</button>' : '') + (mgr && fWeb === 'live' ? '<button class="btn btn-dark" data-addweb>' + ic('globe', '#FFC21A', 18, 2.2) + 'Add to my website</button>' : '') + '<span class="pill" style="background:var(--ink2);border:1px solid var(--ink3);color:#E5E0D4;padding:10px 14px">' + list.length + ' connected</span></div></div>' +
      '<div class="row" style="flex:0 1 auto;gap:10px;position:relative;margin:0 auto">' + ['telegram', 'website', 'whatsapp', 'instagram', 'tiktok', 'messenger'].filter(id => id !== 'website' || fWeb !== 'off').map((id, i) => '<span class="a-floats" style="animation-delay:' + (i * 0.3) + 's;' + (id === 'telegram' || id === 'website' ? '' : 'opacity:.55') + '">' + RV.brandIcon(id, i === 0 ? 64 : 46) + '</span>').join('') + '</div></section>' +
      // connected
      RV.panel('a-in', '<strong>Connected</strong>' + (list.length ? '<span class="small muted">Each channel can have its own Closer</span>' : ''), list.length ? '<div class="col" style="gap:10px">' + list.map(c => '<div class="row" style="gap:14px;flex-wrap:wrap;border:1px solid var(--line);border-radius:20px;padding:14px 16px">' + RV.brandIcon(c.type === 'website' ? 'website' : 'telegram', 46) +
        '<span class="col grow" style="gap:0;min-width:160px"><strong class="ell">' + esc(c.username ? '@' + c.username : c.name) + '</strong><span class="small muted">' + esc(chanLabel(c.type)) + (c.name && c.username ? ' · ' + esc(c.name) : '') + (c.type === 'website' ? ' · ' + (c.domains && c.domains.length ? esc(c.domains.slice(0, 2).join(', ')) : 'no domain yet') : '') + ' · ' + fmt(c.chats) + ' chats</span></span>' +
        (c.type === 'website' ? (c.unlocked === false ? '<span class="pill" style="background:#FFE3D6;color:#9A3412">Paused · plan limit</span>' : '') + '<a class="btn btn-ink btn-sm" href="/app/widget?id=' + c.id + '">Widget Studio</a>' : '') +
        '<span class="pill" style="background:' + (c.status === 'active' ? '#E8F6EC;color:#1E6B3A' : '#FFE3D6;color:#9A3412') + '"><span class="live-dot" style="' + (c.status === 'active' ? '' : 'background:#FF7A59;animation:none') + '"></span>' + (c.status === 'active' ? 'Live' : esc(c.status)) + '</span>' +
        (mgr ? '<label class="sr" for="chc' + c.id + '">Closer for ' + esc(c.username || c.name) + '</label><select class="input" id="chc' + c.id + '" data-chcl="' + c.id + '" style="width:auto;min-width:150px;padding:9px 36px 9px 12px;font-size:14px;border-radius:999px"><option value="0">No Closer</option>' + (S.closers || []).map(x => '<option value="' + x.id + '"' + (x.id === c.closer_id ? ' selected' : '') + '>' + esc(x.name) + '</option>').join('') + '</select><button class="btn btn-ghost btn-sm" data-chdel="' + c.id + '">Disconnect</button>' : '<span class="small muted">' + esc(((S.closers || []).find(x => x.id === c.closer_id) || {}).name || 'No Closer') + '</span>') + '</div>').join('') + '</div>'
        : RV.empty('Nothing connected yet', 'Connect a Telegram bot in two minutes. You only need the token from @BotFather.', mgr && fBot === 'live' ? '<button class="btn btn-jade" data-wizard>Connect a Telegram bot</button>' : '', '<div class="a-floats">' + RV.brandIcon('telegram', 84) + '</div>')) +
      // ways to connect
      '<div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(280px,1fr));gap:14px">' +
      (fBot !== 'off' ? '<section class="connect-card a-in" style="background:#fff;border:1px solid var(--line)"><div class="row" style="gap:12px">' + RV.brandIcon('telegram', 48) + '<span class="col" style="gap:0"><strong style="font-size:17px">Telegram bot</strong><span class="small muted">BotFather token. No Premium needed.</span></span></div>' +
        '<ol class="steps light"><li>Open <strong>@BotFather</strong> in Telegram and send <strong>/newbot</strong></li><li>Pick a name and a username ending in “bot”</li><li>Copy the token and paste it here</li></ol>' +
        (fBot === 'live' ? (mgr ? '<button class="btn btn-ink" data-wizard style="margin-top:auto">Connect a bot</button>' : '<p class="small muted" style="margin:0">Ask an owner or admin to connect it.</p>') : soonBtn('telegram_bot', wl)) + '</section>' : '') +
      (fBiz !== 'off' ? '<section class="connect-card a-in" style="background:var(--ink);color:#fff;animation-delay:.05s"><div class="mesh" style="width:200px;height:200px;right:-80px;top:-80px;background:#2AABEE;opacity:.35"></div><div class="row" style="gap:12px;position:relative">' + RV.brandIcon('telegram', 48) + '<span class="col" style="gap:0"><strong style="font-size:17px">Personal account</strong><span style="font-size:13px;color:#C4BFB3">Telegram Business · needs Telegram Premium</span></span></div>' +
        '<ol class="steps light" style="position:relative"><li>Connect a Telegram bot here first' + (bots.length ? ' <span class="pill" style="background:#1E6B3A;color:#fff">done ✓</span>' : '') + '</li><li>In Telegram open <strong>Settings → Telegram Business → Chatbots</strong></li><li>Enter your bot’s username' + (bots.length ? ': ' + bots.map(x => '<button class="pill" data-copyu="@' + esc(x.username) + '" style="background:var(--jade);color:var(--ink);border:0;cursor:pointer">@' + esc(x.username) + ' ⧉</button>').join(' ') : '') + '</li><li>Choose which chats it can answer. It appears here automatically.</li></ol>' +
        (fBiz === 'live' ? '' : soonBtn('telegram_business', wl)) + '</section>' : '') +
      (fWeb !== 'off' ? '<section class="connect-card a-in" style="background:linear-gradient(160deg,#FFD23F,#FFC21A);animation-delay:.08s"><div class="mesh" style="width:200px;height:200px;right:-70px;top:-90px;background:#FFFFFF;opacity:.45"></div><div class="row" style="gap:12px;position:relative">' + RV.brandIcon('website', 48).replace('background:#FFC21A', 'background:#121110').replace('stroke="#121110"', 'stroke="#FFC21A"') + '<span class="col" style="gap:0"><strong style="font-size:17px">Website chat <span class="pill" style="background:#121110;color:#FFC21A;vertical-align:2px">' + (fWeb === 'live' ? 'Live' : 'Soon') + '</span></strong><span class="small" style="color:#3B3000">An AI chat bubble on your own site</span></span></div>' +
        '<ol class="steps" style="position:relative"><li>Pick your colours, logo and texts in Widget Studio</li><li>Paste one line of code on your site</li><li>Leads and chats land in Pulse Inbox</li></ol>' +
        (fWeb === 'live' ? (sites.length ? '<a class="btn btn-ink" href="/app/widget" style="margin-top:auto;position:relative">Open Widget Studio</a>' : mgr ? '<button class="btn btn-ink" data-addweb style="margin-top:auto;position:relative">Add to my website</button>' : '<p class="small" style="margin:0">Ask an owner or admin to add it.</p>') + (RV.webCanAdd() ? '' : '<span class="small" style="position:relative;font-weight:700;color:#3B3000">' + (RV.webUsage().sites ? 'All ' + RV.webUsage().sites + ' website slots used.' : 'Pro and up, or the $29 power-up.') + '</span>') : soonBtn('website', wl)) + '</section>' : '') +
      (fGrp !== 'off' ? '<section class="connect-card a-in" style="background:var(--mint);border:1px solid var(--mint2);animation-delay:.1s"><div class="row" style="gap:12px">' + RV.brandIcon('telegram', 48) + '<span class="col" style="gap:0"><strong style="font-size:17px">Groups</strong><span class="small" style="color:var(--jade-dd)">Welcome, answer FAQs, wipe spam with Shield</span></span></div>' +
        '<ol class="steps"><li>Add your connected bot to the group</li><li>Make it an <strong>admin</strong> with the <strong>Delete messages</strong> permission</li><li>Build a Closer from the <strong>Bolt · Group Guardian</strong> template for Shield</li></ol>' +
        (fGrp === 'live' ? (mgr && RV.flag('studio') ? '<a class="btn btn-ink" href="/app/studio?template=guard" style="margin-top:auto">Build a Group Guardian</a>' : '') : soonBtn('telegram_group', wl)) + '</section>' : '') + '</div>' +
      // coming soon showcase
      (others.length ? '<section class="a-in" style="display:flex;flex-direction:column;gap:14px;margin-top:6px"><div class="row" style="justify-content:space-between;flex-wrap:wrap;gap:8px"><span class="col" style="gap:4px"><span class="eyebrow">More channels</span><strong style="font-size:clamp(22px,2.6vw,30px);letter-spacing:-0.04em;line-height:1.1">One Closer team. <span class="it">Every app your customers love.</span></strong></span></div>' +
        '<div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(230px,1fr));gap:14px">' + others.map((c, i) => { const st = RV.chan(c.flag); return '<article class="soon-tile lift" style="animation-delay:' + (i * 0.06) + 's">' + mock(c.id) + '<div class="row" style="gap:12px">' + RV.brandIcon(c.id, 44) + '<span class="col grow" style="gap:0"><strong>' + esc(c.name) + '</strong><span class="pill" style="align-self:flex-start;background:' + (st === 'live' ? '#E8F6EC;color:#1E6B3A' : 'var(--mint);color:var(--jade-dd)') + '">' + (st === 'live' ? 'Available' : 'Coming soon') + '</span></span></div><span class="small muted">' + esc(c.desc) + '</span>' +
          (st === 'live' ? '<a class="btn btn-ink btn-sm" href="/contact?channel=' + esc(c.id) + '" style="margin-top:auto">Talk to us to connect</a>' : soonBtn(c.id, wl)) + '</article>'; }).join('') + '</div></section>' : '');
    ctx.el.querySelectorAll('[data-wizard]').forEach(x => x.addEventListener('click', () => wizard(ctx)));
    ctx.el.querySelectorAll('[data-addweb]').forEach(x => x.addEventListener('click', () => { if (RV.webCanAdd()) go('/app/widget?new=1'); else RV.websiteLocked(); }));
    ctx.el.querySelectorAll('[data-copyu]').forEach(x => x.addEventListener('click', () => RV.copy(x.getAttribute('data-copyu'), 'Username copied')));
    ctx.el.querySelectorAll('[data-wl]').forEach(x => x.addEventListener('click', async () => {
      const item = x.getAttribute('data-wl'); RV.busy(x, true);
      try { await POST('/api/app/waitlist', { item }); (S.boot.waitlist = S.boot.waitlist || []).push(item); x.outerHTML = '<span class="pill a-pop" style="background:#E8F6EC;color:#1E6B3A;padding:10px 14px;align-self:flex-start;margin-top:auto">✓ You’re on the list</span>'; toast('You’re on the list. We’ll email you the day it goes live.'); }
      catch (e) { RV.busy(x, false); fail(e); }
    }));
    ctx.el.querySelectorAll('[data-chcl]').forEach(sel => sel.addEventListener('change', async () => {
      try { await PUT('/api/app/channels/' + sel.getAttribute('data-chcl'), { closer_id: +sel.value }); toast(+sel.value ? ((S.closers || []).find(x => x.id === +sel.value) || {}).name + ' now answers here' : 'No Closer on this channel now'); RV.loadClosers(true); RV.loadChannels(true); }
      catch (e) { fail(e); }
    }));
    ctx.el.querySelectorAll('[data-chdel]').forEach(x => x.addEventListener('click', async () => {
      const c = list.find(y => y.id === +x.getAttribute('data-chdel'));
      if (!(await RV.confirmBox('Disconnect ' + (c.username ? '@' + c.username : c.name) + '?', (c.type === 'website' ? 'The chat disappears from your website right away. Chats and leads stay in Pulse Inbox and Leads.' : 'Your Closers stop answering there right away. Chats stay in Pulse Inbox. You can reconnect anytime with the same token.'), 'Disconnect', true))) return;
      try { await DEL('/api/app/channels/' + c.id); toast('Disconnected'); await Promise.all([RV.loadClosers(true), RV.refreshBoot()]); channels(ctx); }
      catch (e) { fail(e); }
    }));
  }
  function soonBtn(item, wl) { return wl.has(item) ? '<span class="pill" style="background:#E8F6EC;color:#1E6B3A;padding:10px 14px;align-self:flex-start;margin-top:auto">✓ You’re on the list</span>' : '<button class="btn btn-ghost btn-sm" data-wl="' + esc(item) + '" style="margin-top:auto;align-self:flex-start">Join waitlist</button>'; }
  function friendlyTg(msg) {
    if (/fetch failed|Bad response|ENOTFOUND|EAI_AGAIN|ECONN|timed? ?out|network|abort|reach/i.test(msg)) return 'We couldn’t reach Telegram right now. Check your token and try again in a minute.';
    if (/Unauthorized|401|Not Found|404/i.test(msg)) return 'Telegram says this token isn’t valid. Copy it again from @BotFather (send /mybots → your bot → API Token).';
    return msg;
  }
  function wizard(ctx) {
    let step = 0, token = '', closerId = ((S.closers || [])[0] || {}).id || 0;
    const steps = [
      ['Open @BotFather', 'In Telegram, search for <strong>@BotFather</strong> (with the blue tick) and send <strong>/newbot</strong>.', '<a class="btn btn-ghost btn-sm" href="https://t.me/BotFather" target="_blank" rel="noopener">Open @BotFather</a>'],
      ['Name your bot', 'Pick a display name customers will see, like “Glow Labs Shop”. Then a username that ends in <strong>bot</strong>, like <span class="mono">glowlabs_shop_bot</span>.', ''],
      ['Paste your token', 'BotFather replies with a token that looks like <span class="mono">123456789:AAH…</span>. Copy it and paste it below.', '']
    ];
    function draw(err) {
      const s = steps[step];
      RV.modal('<div class="row" style="gap:22px;align-items:flex-start;flex-wrap:wrap"><div class="col grow" style="gap:14px;min-width:240px;flex:1 1 280px">' +
        '<span class="eyebrow">Step ' + (step + 1) + ' of 3</span><div class="su-bars" style="grid-template-columns:repeat(3,1fr)">' + [0, 1, 2].map(i => '<span class="' + (i < step ? 'done' : i === step ? 'cur' : '') + '"></span>').join('') + '</div>' +
        '<strong class="h3">' + s[0] + '</strong><p class="muted" style="margin:0">' + s[1] + '</p>' + s[2] +
        (step === 2 ? '<form id="wzForm" class="col" style="gap:12px"><div class="field"><label class="lbl" for="wzTok">Bot token</label><input id="wzTok" class="input mono" placeholder="123456789:AAH..." autocomplete="off" spellcheck="false" value="' + esc(token) + '" required></div>' +
          ((S.closers || []).length ? '<div class="field"><label class="lbl" for="wzCl">Which Closer answers?</label><select id="wzCl" class="input">' + S.closers.map(c => '<option value="' + c.id + '"' + (c.id === closerId ? ' selected' : '') + '>' + esc(c.name) + ' · ' + esc(RV.tpl(c.template).role) + '</option>').join('') + '</select></div>' : '<p class="small muted" style="margin:0">You don’t have a Closer yet. Connect now and build one right after.</p>') +
          (err ? '<div class="err" role="alert">' + esc(err) + '</div>' : '') + '<button class="btn btn-jade" type="submit" id="wzGo" style="padding:15px">Connect bot</button></form>' : '') +
        '<div class="row" style="gap:8px;margin-top:4px">' + (step ? '<button class="btn btn-ghost" data-wz="back">Back</button>' : '') + (step < 2 ? '<button class="btn btn-ink grow" data-wz="next">' + (step === 0 ? 'I’ve sent /newbot' : 'I’ve got my token') + '</button>' : '') + '</div></div>' +
        '<div class="hide-sm" style="flex:0 0 240px;margin:0 auto">' + phoneMock(step) + '</div></div>', { wide: true, label: 'Connect a Telegram bot', noFocus: step < 2 });
      RV.qsa('[data-wz]').forEach(b => b.addEventListener('click', () => { const t = $('wzTok'); if (t) token = t.value; step += b.getAttribute('data-wz') === 'next' ? 1 : -1; draw(); }));
      const f = $('wzForm');
      if (f) f.addEventListener('submit', async e => {
        e.preventDefault();
        token = $('wzTok').value.trim(); const cl = $('wzCl'); if (cl) closerId = +cl.value;
        if (!/^\d{5,}:[A-Za-z0-9_-]{30,}$/.test(token.replace(/\s/g, ''))) { draw('That doesn’t look like a bot token. It should look like 123456789:AAH… from @BotFather.'); return; }
        const btn = $('wzGo'); RV.busy(btn, true, 'Checking with Telegram…');
        try {
          const ch = await POST('/api/app/channels/telegram', { token, closer_id: closerId });
          RV.closeModal(); RV.confetti(40);
          toast('@' + (ch.username || ch.name) + ' is connected!');
          await Promise.all([RV.loadChannels(true), RV.loadClosers(true)]);
          channels(ctx);
        } catch (er) { RV.busy(btn, false); toast(friendlyTg(er.message), 'err'); draw(friendlyTg(er.message)); }
      });
    }
    draw();
  }
  RV.route('channels', { render: channels });

  /* ======================= BLAST ======================= */
  const SEG = { all: ['Everyone', 'Everyone who chatted with your bots'], hot: ['Hot leads', 'Asked for prices or payment links'], no_buy: ['Chatted, didn’t buy', 'Qualified or at checkout, not paid yet'], quiet: ['Quiet for 7 days', 'Haven’t written in a week'], won: ['Customers', 'People who already bought'] };
  const BL = { seg: 'no_buy', msg: '', when: 'now', at: '' };
  async function blast(ctx) {
    const d = await GET('/api/app/blasts');
    if (!ctx.ok()) return;
    const per = S.boot.billing.blast_people_per_credit || 10, mgr = RV.isManager();
    const segs = d.segments;
    if (!segs.find(s => s.id === BL.seg && s.count)) { const firstWith = segs.find(s => s.count); if (firstWith) BL.seg = firstWith.id; }
    const cost = () => { const s = segs.find(x => x.id === BL.seg); return s ? Math.ceil(s.count / per) : 0; };
    const count = () => (segs.find(x => x.id === BL.seg) || {}).count || 0;
    const statusPill = b => { const m = { queued: ['#FFF3CC', '#7A5800', new Date(b.scheduled_at) > new Date() ? 'Scheduled' : 'Queued'], sending: ['#E3ECFF', '#1E3A8A', 'Sending'], sent: ['#E8F6EC', '#1E6B3A', 'Sent'], done: ['#E8F6EC', '#1E6B3A', 'Sent'], failed: ['#FFE3D6', '#9A3412', 'Failed'] }[b.status] || ['#F2F0EA', '#5E5A50', b.status]; return '<span class="pill" style="background:' + m[0] + ';color:' + m[1] + '">' + m[2] + '</span>'; };
    const minDt = new Date(Date.now() + 5 * 60e3); const pad = n => String(n).padStart(2, '0');
    const minStr = minDt.getFullYear() + '-' + pad(minDt.getMonth() + 1) + '-' + pad(minDt.getDate()) + 'T' + pad(minDt.getHours()) + ':' + pad(minDt.getMinutes());
    ctx.el.innerHTML = '<div class="dgrid">' +
      RV.panel('c7 a-in', '<strong>New Blast</strong><span class="pill" style="background:var(--mint);color:var(--jade-dd)" id="blCost"></span>',
        '<div class="col" style="gap:8px"><span class="lbl" id="segL">Send to</span><div role="radiogroup" aria-labelledby="segL" style="display:grid;grid-template-columns:repeat(auto-fill,minmax(170px,1fr));gap:8px">' + segs.map(s => '<button type="button" role="radio" class="pick' + (BL.seg === s.id ? ' on' : '') + '" data-seg="' + s.id + '" aria-checked="' + (BL.seg === s.id) + '" style="flex-direction:column;align-items:flex-start;gap:4px"' + (s.count ? '' : ' disabled') + '><span class="row" style="justify-content:space-between;width:100%"><strong style="font-size:14.5px">' + SEG[s.id][0] + '</strong><b class="tnum">' + fmt(s.count) + '</b></span><span style="font-size:12px;color:var(--mut)">' + SEG[s.id][1] + '</span></button>').join('') + '</div></div>' +
        '<div class="field"><div class="row" style="justify-content:space-between;gap:8px;flex-wrap:wrap"><label class="lbl" for="blMsg">Message</label>' + '<button type="button" class="btn btn-ghost btn-sm" id="blDraft">' + ic('spark', '#121110', 16) + 'Draft with Juno</button></div><textarea id="blMsg" class="input" rows="5" maxlength="3500" placeholder="Hey! Your picks are still waiting. Reply here and we’ll help you finish your order today.">' + esc(BL.msg) + '</textarea><span class="row hint" style="justify-content:space-between"><span>Sent from your connected bots. Telegram only lets bots message people who chatted with them.</span><span class="tnum" id="blLen">' + BL.msg.length + '/3500</span></span></div>' +
        '<div class="col" style="gap:8px"><span class="lbl">When</span><div class="seg" role="radiogroup" aria-label="When to send"><button type="button" data-when="now" class="' + (BL.when === 'now' ? 'on' : '') + '">Send now</button><button type="button" data-when="later" class="' + (BL.when === 'later' ? 'on' : '') + '">Schedule</button></div><div id="blAtWrap" class="field"' + (BL.when === 'later' ? '' : ' hidden') + '><label class="lbl sr" for="blAt">Send at</label><input id="blAt" class="input" type="datetime-local" min="' + minStr + '" value="' + esc(BL.at || minStr) + '" style="max-width:280px"></div></div>' +
        '<div class="row" style="gap:12px;flex-wrap:wrap;background:var(--soft);border:1px solid var(--line);border-radius:16px;padding:12px 14px"><span class="col grow" style="gap:0"><strong id="blSum"></strong><span class="small muted">1 credit per ' + per + ' people · you have <b class="tnum" data-bal data-v="' + S.credits + '">' + fmt(S.credits) + '</b> credits</span></span>' + (mgr ? '<button class="btn btn-jade" id="blSend">Send Blast</button>' : '<span class="small muted">Only owners and admins can send.</span>') + '</div>') +
      RV.panel('c5 a-in', '<strong>Recent Blasts</strong>', d.blasts.length ? '<div class="col" style="gap:10px">' + d.blasts.map(b => { const done = b.sent + b.failed; const p = b.total ? Math.round(done / b.total * 100) : 0; return '<div class="col" style="gap:8px;border:1px solid var(--line);border-radius:16px;padding:12px 14px"><div class="row" style="justify-content:space-between;gap:10px"><strong class="ell small" style="font-size:14px">' + esc(b.message.slice(0, 60)) + '</strong>' + statusPill(b) + '</div><div class="meter"><span style="width:' + p + '%"></span></div><span class="small muted">' + esc(SEG[b.segment] ? SEG[b.segment][0] : b.segment) + ' · ' + fmt(b.sent) + ' sent' + (b.failed ? ' · ' + fmt(b.failed) + ' failed' : '') + ' of ' + fmt(b.total) + ' · ' + fmt(b.credits) + ' credits · ' + (new Date(b.scheduled_at) > new Date() ? 'sends ' + RV.date(b.scheduled_at) + ' ' + RV.time(b.scheduled_at) : RV.ago(b.scheduled_at)) + '</span></div>'; }).join('') + '</div>'
        : RV.empty('No Blasts yet', 'Bring back people who chatted but never paid. One message, the right segment, real sales.', '', '<svg viewBox="0 0 120 90" width="120" aria-hidden="true"><g class="a-floats"><path d="M10 50 110 10 80 80 58 58z" fill="#FFC21A" stroke="#121110" stroke-width="4" stroke-linejoin="round"/><path d="M58 58 110 10" stroke="#121110" stroke-width="4"/></g></svg>')) + '</div>';
    const sum = () => { const n = count(), c = cost(); $('blCost').textContent = fmt(c) + ' credit' + (c === 1 ? '' : 's'); $('blSum').textContent = n ? 'Goes to ' + fmt(n) + ' ' + (n === 1 ? 'person' : 'people') + ' for ' + fmt(c) + ' credit' + (c === 1 ? '' : 's') : 'Nobody is in this group yet'; };
    sum();
    ctx.el.querySelectorAll('[data-seg]').forEach(b => b.addEventListener('click', () => { BL.seg = b.getAttribute('data-seg'); ctx.el.querySelectorAll('[data-seg]').forEach(x => { x.classList.toggle('on', x === b); x.setAttribute('aria-checked', x === b); }); sum(); }));
    ctx.el.querySelectorAll('[data-when]').forEach(b => b.addEventListener('click', () => { BL.when = b.getAttribute('data-when'); ctx.el.querySelectorAll('[data-when]').forEach(x => x.classList.toggle('on', x === b)); $('blAtWrap').hidden = BL.when !== 'later'; }));
    const m = $('blMsg'); m.addEventListener('input', () => { BL.msg = m.value; $('blLen').textContent = m.value.length + '/3500'; });
    $('blAt').addEventListener('change', e => { BL.at = e.target.value; });
    $('blDraft').addEventListener('click', () => {
      RV.modal('<form id="dfForm" class="col" style="gap:14px"><div class="row" style="gap:12px">' + RV.junoArt(64) + '<strong class="h3">What should this Blast do?</strong></div><div class="field"><label class="lbl" for="dfGoal">Goal</label><input id="dfGoal" class="input" placeholder="e.g. bring back people who chatted but didn’t buy" value="' + esc(SEG[BL.seg] ? 'Re-engage: ' + SEG[BL.seg][1].toLowerCase() : '') + '"></div><button class="btn btn-ink" type="submit" id="dfGo">' + ic('spark', '#FFC21A', 16) + 'Write it for me</button></form>', { label: 'Draft with Juno' });
      $('dfForm').addEventListener('submit', async e => {
        e.preventDefault(); const b = $('dfGo'); RV.busy(b, true, 'Juno is writing…');
        try {
          const r = await POST('/api/app/blasts/draft', { goal: $('dfGoal').value.trim() });
          RV.closeModal();
          const txt = r.text || ''; let i = 0; m.value = ''; BL.msg = txt;
          const iv = setInterval(() => { i += 3; m.value = txt.slice(0, i); $('blLen').textContent = m.value.length + '/3500'; if (i >= txt.length) { clearInterval(iv); m.value = txt; m.focus(); } }, RV.reduced() ? 0 : 22);
        } catch (er) { RV.busy(b, false); fail(er); }
      });
    });
    const send = $('blSend');
    if (send) send.addEventListener('click', async () => {
      const msg = m.value.trim();
      if (msg.length < 2) { toast('Write your message first.', 'err'); m.focus(); return; }
      if (!count()) { toast('Nobody is in that group yet.', 'err'); return; }
      let when = null;
      if (BL.when === 'later') { const v = $('blAt').value; if (!v || new Date(v) <= new Date()) { toast('Pick a time in the future.', 'err'); return; } when = new Date(v).toISOString(); }
      if (cost() > S.credits) { toast('This Blast needs ' + cost() + ' credits. You have ' + fmt(S.credits) + '.', 'err', RV.flag('wallet') ? { label: 'Top up', fn: () => go('/app/wallet') } : null); return; }
      if (!(await RV.confirmBox('Send this Blast?', 'It goes to ' + fmt(count()) + ' people' + (when ? ' on ' + RV.date(when) + ' at ' + RV.time(when) : ' right now') + ' and uses ' + fmt(cost()) + ' credits.', when ? 'Schedule Blast' : 'Send now'))) return;
      RV.busy(send, true, 'Sending…');
      try {
        const r = await POST('/api/app/blasts', { segment: BL.seg, message: msg, scheduled_at: when || undefined });
        BL.msg = ''; toast((when ? 'Blast scheduled for ' : 'Blast on its way to ') + fmt(r.total) + ' people'); RV.confetti(30);
        RV.setBalance(S.credits - r.credits);
        blast(ctx);
      } catch (e) { RV.busy(send, false); if (e.code === 'no_credits') toast(e.message, 'err', { label: 'Top up', fn: () => go('/app/wallet') }); else fail(e); }
    });
  }
  RV.route('blast', { render: blast, flag: 'blast' });

  /* ======================= JUNO ======================= */
  const JL = [];
  async function juno(ctx) {
    const fn = RV.first(S.boot.user.name);
    const sug = ['How was today?', 'Who should I follow up first?', 'Which chats are waiting for a human?', 'What do customers ask most?', 'Which Closer is doing best?', 'Write a Blast for people who didn’t buy'];
    ctx.el.innerHTML = '<div class="dgrid"><section class="c8 card a-in" style="border-radius:26px;overflow:hidden;display:flex;flex-direction:column;min-height:560px">' +
      '<div class="row" style="background:linear-gradient(135deg,#FFD23F,#FFC21A);padding:18px 20px;gap:14px">' + RV.junoArt(70) + '<div class="col" style="gap:0"><strong style="font-size:21px;letter-spacing:-0.03em">Ask Juno</strong><span style="font-size:14px;color:#3B3000">Juno reads every chat so you don’t have to.</span></div></div>' +
      '<div id="junoLog" style="flex:1;padding:18px;display:flex;flex-direction:column;gap:10px;background:#F8F7F2;min-height:300px;max-height:56vh;overflow-y:auto" aria-live="polite"><div class="bub-in">Hi' + (fn ? ' ' + esc(fn) : '') + '! Ask me anything about your chats, leads and sales, or tap a question below.</div>' + JL.map(x => '<div class="' + (x.q ? 'bub-me' : 'bub-in') + '">' + esc(x.q || x.a) + '</div>').join('') + '</div>' +
      '<div class="row" style="padding:12px;flex-wrap:wrap;gap:8px;border-top:1px solid var(--line)">' + sug.slice(0, 4).map(q => '<button class="chip" data-jq>' + esc(q) + '</button>').join('') + '</div>' +
      '<form id="junoForm" class="row" style="gap:8px;padding:12px;border-top:1px solid var(--line)"><label for="junoIn" class="sr">Ask Juno</label><input id="junoIn" class="input" placeholder="Ask Juno anything…" autocomplete="off" maxlength="600" style="padding:12px 14px"><button class="btn btn-ink" type="submit" id="junoGo">Ask</button></form></section>' +
      '<div class="c4 col" style="gap:14px">' + RV.panel('a-in', '<strong>Try asking</strong>', '<div class="col" style="gap:6px">' + sug.map(q => '<button class="chk" data-jq style="border:1px solid var(--line)"><span class="ck" style="background:var(--mint);border-color:var(--mint2)">' + ic('spark', '#7A5800', 12, 2.4) + '</span><span>' + esc(q) + '</span></button>').join('') + '</div>') +
      RV.panel('a-in', '<strong>What Juno knows</strong>', '<ul style="margin:0;padding-left:18px;display:flex;flex-direction:column;gap:6px;font-size:14px;color:var(--mut)"><li>Today’s chats and Closer replies</li><li>Hot leads and pipeline stages</li><li>Chats waiting for a human</li><li>What customers keep asking</li><li>Your plan, credits and Closers</li></ul>') + '</div></div>';
    const log = $('junoLog'); log.scrollTop = log.scrollHeight;
    const ask = async q => {
      if (!q) return;
      JL.push({ q });
      log.insertAdjacentHTML('beforeend', '<div class="bub-me a-in">' + esc(q) + '</div><div id="jt" class="bub-in" style="display:flex;gap:5px;padding:12px 14px"><span class="dot"></span><span class="dot"></span><span class="dot"></span></div>'); log.scrollTop = log.scrollHeight;
      const b = $('junoGo'); if (b) b.disabled = true;
      try { const r = await POST('/api/app/juno', { question: q }); JL.push({ a: r.answer }); const t = $('jt'); if (t) t.remove(); log.insertAdjacentHTML('beforeend', '<div class="bub-in a-in">' + esc(r.answer) + '</div>'); }
      catch (e) { const t = $('jt'); if (t) t.remove(); JL.pop(); fail(e); }
      if (b) b.disabled = false; log.scrollTop = log.scrollHeight;
    };
    ctx.el.querySelectorAll('[data-jq]').forEach(b => b.addEventListener('click', () => ask(b.textContent.trim())));
    $('junoForm').addEventListener('submit', e => { e.preventDefault(); const v = $('junoIn').value.trim(); $('junoIn').value = ''; ask(v); });
  }
  RV.route('juno', { render: juno, flag: 'juno' });
})();
