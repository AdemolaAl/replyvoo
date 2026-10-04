/* Replyvoo dashboard pages: Voo Wallet, Plan, Voo Squad, Joinvoo, Team, Settings. */
(function () {
  'use strict';
  const RV = window.RV;
  const { $, esc, fmt, GET, PUT, POST, DEL, toast, fail, go, ic, usd } = RV;
  const S = RV.S;
  const panel = (cls, head, body, attrs) => RV.panel(cls, head, body, attrs);
  const arrow = '<span class="arr">' + ic('right', '#121110', 18, 2.6) + '</span>';

  /* ======================= VOO WALLET ======================= */
  function addonsHtml(mgr) {
    const list = (S.boot.addons || []).filter(a => a.status !== 'off');
    if (!list.length) return '';
    return '<div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(240px,1fr));gap:10px">' + list.map(a => {
      const soon = a.status === 'soon', buy = !soon && a.price > 0;
      let action;
      if (soon) action = '<span class="pill" style="background:var(--soft);border:1px solid var(--line);color:var(--mut)">Coming soon</span>';
      else if (!mgr) action = '';
      else if (a.slug === 'extra-closer') action = '<span class="row" style="gap:6px"><button class="btn btn-ghost btn-sm" data-slot>' + fmt(S.boot.billing.extra_closer_credits) + ' credits</button><button class="btn btn-ink btn-sm" data-addon="' + esc(a.slug) + '">' + usd(a.price) + '</button></span>';
      else if (buy) action = '<button class="btn btn-ink btn-sm" data-addon="' + esc(a.slug) + '">Add · ' + usd(a.price) + '</button>';
      else if (a.slug === 'pro-brain' && RV.flag('pro_brain')) action = '<a class="btn btn-ghost btn-sm" href="/app/closers">Turn on per Closer</a>';
      else action = '<span class="pill" style="background:#E8F6EC;color:#1E6B3A">Included</span>';
      return '<div class="col" style="gap:8px;border:1px solid var(--line);border-radius:18px;padding:16px;' + (soon ? 'background:var(--soft)' : '') + '"><div class="row" style="justify-content:space-between;gap:8px"><strong>' + esc(a.name) + '</strong><span class="pill" style="background:var(--mint);color:var(--jade-dd)">' + esc(a.price_text) + '</span></div><span class="muted small">' + esc(a.description) + '</span><span class="row" style="justify-content:flex-end;margin-top:auto">' + action + '</span></div>';
    }).join('') + '</div>';
  }
  function bindAddons(root) {
    root.querySelectorAll('[data-addon]').forEach(b => b.addEventListener('click', () => RV.checkout({ kind: 'addon', item_id: b.getAttribute('data-addon') })));
    root.querySelectorAll('[data-slot]').forEach(b => b.addEventListener('click', async () => {
      if (!(await RV.confirmBox('Unlock an extra Closer?', 'Uses ' + fmt(S.boot.billing.extra_closer_credits) + ' credits from your Voo Wallet for 30 days.', 'Unlock'))) return;
      try { await POST('/api/app/closers/slot'); toast('Extra Closer unlocked for 30 days'); RV.confetti(30); await RV.refreshBoot(); RV.rerender(); }
      catch (e) { if (e.code === 'no_credits') toast(e.message, 'err'); else fail(e); }
    }));
  }
  const reasonGroup = r => { r = String(r || ''); if (/blast/i.test(r)) return 'Blasts'; if (/closer/i.test(r)) return 'Extra Closers'; if (/pro/i.test(r)) return 'Pro Brain'; if (/voice/i.test(r)) return 'Voice replies'; if (/chat|conversation|reply/i.test(r)) return 'Extra chats'; return r.replace(/\d[\d,]*/g, '').trim() || 'Other'; };
  async function wallet(ctx) {
    const w = await GET('/api/app/wallet');
    if (!ctx.ok()) return;
    RV.setBalance(w.credits);
    const b = S.boot, mgr = RV.isManager(), packs = b.packs || [];
    const groups = {}; w.spend.forEach(s => { const k = reasonGroup(s.reason); groups[k] = (groups[k] || 0) + s.n; });
    const parts = Object.entries(groups).sort((a, c) => c[1] - a[1]);
    const totalSpend = parts.reduce((a, p) => a + p[1], 0);
    const cols = ['#FFC21A', '#121110', '#8FB8FF', '#7EE0B0', '#FFB199', '#C9A7FF'];
    const C = 2 * Math.PI * 52; let acc = 0;
    const donut = totalSpend ? '<svg width="130" height="130" viewBox="0 0 130 130" role="img" aria-label="Credit spending in the last 30 days"><circle cx="65" cy="65" r="52" fill="none" stroke="#F2F0EA" stroke-width="18"/>' + parts.map((p, i) => { const len = C * p[1] / totalSpend; const s = '<circle cx="65" cy="65" r="52" fill="none" stroke="' + cols[i % cols.length] + '" stroke-width="18" stroke-dasharray="' + len.toFixed(1) + ' ' + (C - len).toFixed(1) + '" stroke-dashoffset="' + (-acc).toFixed(1) + '" transform="rotate(-90 65 65)"/>'; acc += len; return s; }).join('') + '<text x="65" y="60" text-anchor="middle" font-size="12" font-weight="700" fill="#948F82" font-family="Plus Jakarta Sans,sans-serif">used</text><text x="65" y="80" text-anchor="middle" font-size="19" font-weight="800" fill="#121110" font-family="Plus Jakarta Sans,sans-serif">' + (totalSpend >= 1000 ? (totalSpend / 1000).toFixed(1) + 'k' : fmt(totalSpend)) + '</text></svg>' : '';
    const sel = RV.store.get('pack', (packs[1] || packs[0] || {}).id);
    const atp = w.auto_topup_pack || (packs[1] || packs[0] || {}).id;
    ctx.el.innerHTML = '<div class="dgrid">' +
      '<section class="c8 a-in shine" style="background:radial-gradient(600px 300px at 90% 0%,rgba(255,194,26,.35),transparent),linear-gradient(135deg,#121110,#2C2925);color:#FFFFFF;border-radius:30px;padding:clamp(22px,3vw,32px);display:flex;flex-wrap:wrap;gap:20px;align-items:center;min-width:0">' +
      '<div class="col" style="flex:1 1 260px;min-width:0;gap:10px;position:relative;z-index:1"><span class="row" style="gap:8px;font-size:13px;font-weight:800;letter-spacing:.12em;text-transform:uppercase;color:var(--jade)"><span style="width:26px;height:26px;border-radius:50%;background:var(--jade);color:var(--ink);display:flex;align-items:center;justify-content:center;letter-spacing:0">V</span>Voo Wallet</span>' +
      '<b class="tnum" id="wBal" data-bal data-v="0" style="font-size:clamp(48px,6vw,72px);letter-spacing:-0.06em;line-height:1">0</b>' +
      '<span style="color:#C4BFB3">credits · about <b style="color:#fff" class="tnum">' + fmt(w.credits) + '</b> extra chats ready</span>' +
      '<div class="row" style="flex-wrap:wrap;gap:8px;margin-top:6px">' + (mgr ? '<button class="btn btn-jade" id="goTop">Top up</button>' : '') + (RV.flag('squad') ? '<a class="btn btn-dark" href="/app/squad">Earn free credits</a>' : '') + '</div>' +
      (mgr ? '<div class="ink-box col" style="gap:10px;margin-top:4px;padding:12px 14px"><div class="row" style="gap:12px"><span class="col grow" style="gap:0;font-size:14px"><strong>Auto Top-up</strong><span style="color:#A8A294;font-size:13px">Refill automatically when you drop below ' + fmt((b.billing && b.billing.low_credit_threshold) || 50) + ' credits' + (w.has_saved_card ? '' : '. Needs a saved card from a card payment.') + '</span></span><button class="toggle ' + (w.auto_topup ? 'on' : 'off') + '" id="autoTop" aria-label="Auto Top-up" aria-pressed="' + w.auto_topup + '"><span></span></button></div>' +
        '<div class="row" style="gap:8px"' + (w.auto_topup ? '' : ' hidden') + ' id="atpRow"><label for="atp" style="font-size:13px;color:#C4BFB3;white-space:nowrap">Refill with</label><select id="atp" class="input" style="padding:8px 36px 8px 12px;font-size:14px;background-color:#2C2925;color:#fff;border-color:#3a3630">' + packs.map(p => '<option value="' + p.id + '"' + (p.id === atp ? ' selected' : '') + '>' + fmt(p.credits + p.bonus) + ' credits · ' + usd(p.price) + '</option>').join('') + '</select></div></div>' : '') +
      '</div><div style="flex:1 1 240px;min-width:0;display:flex;justify-content:center;position:relative;z-index:1">' + RV.moneyGuy(300) + '</div></section>' +
      panel('c4 a-in', '<strong>Where credits go</strong><span class="pill" style="background:var(--soft);border:1px solid var(--line)">30 days</span>', totalSpend ? '<div class="row" style="gap:16px;flex-wrap:wrap">' + donut + '<div class="col grow" style="gap:8px;min-width:120px">' + parts.slice(0, 6).map((p, i) => '<span class="row" style="gap:8px;font-size:13.5px"><span style="width:12px;height:12px;border-radius:4px;background:' + cols[i % cols.length] + '"></span><span class="grow">' + esc(p[0]) + '</span><b class="tnum">' + fmt(p[1]) + '</b></span>').join('') + '</div></div>'
        : RV.empty('No spending yet', 'Credits pay for extra chats beyond your plan, Blasts, Pro Brain and extra Closers.', '', '<svg viewBox="0 0 100 70" width="110" aria-hidden="true"><g class="a-floats"><circle cx="50" cy="35" r="26" fill="#FFC21A" stroke="#121110" stroke-width="4"/><text x="50" y="44" text-anchor="middle" font-family="Plus Jakarta Sans,sans-serif" font-weight="800" font-size="24" fill="#121110">V</text></g></svg>')) +
      (mgr ? '<section class="c12 panel a-in" id="topup"><div class="panel-h"><strong>Top up</strong><span class="muted small">Bigger packs come with bonus credits · 1 credit = 1 extra chat</span></div>' +
        '<div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(170px,1fr));gap:10px" role="radiogroup" aria-label="Credit packs">' + packs.map((p, i) => '<button class="pack' + (p.id === sel ? ' on' : '') + '" data-pack="' + p.id + '" role="radio" aria-checked="' + (p.id === sel) + '">' + (p.label ? '<span class="pill" style="align-self:flex-start;background:' + (i === 2 ? '#121110;color:#FFC21A' : 'var(--soft);color:var(--ink)') + '">' + esc(p.label.toUpperCase()) + '</span>' : '') + '<span class="row" style="align-items:baseline;gap:6px"><b class="tnum" style="font-size:26px;letter-spacing:-0.04em">' + fmt(p.credits) + '</b><span class="muted small">credits</span></span>' + (p.bonus ? '<span class="pill" style="align-self:flex-start;background:var(--jade);color:var(--ink)">+' + fmt(p.bonus) + ' bonus</span>' : '<span style="height:22px"></span>') + '<strong style="font-size:18px">' + usd(p.price) + '</strong></button>').join('') + '</div>' +
        '<button class="btn btn-main" id="payBtn" style="justify-content:space-between;width:100%;max-width:440px"></button><span class="small muted">Have a coupon like VOO10? Add it at checkout.</span></section>' : '') +
      ((b.addons || []).length ? panel('c12 a-in', '<strong>Power-ups</strong><span class="muted small">Boost any plan</span>', addonsHtml(mgr)) : '') +
      panel('c7 a-in', '<strong>Transactions</strong>', w.tx.length ? '<div>' + w.tx.map((t, i) => { const plus = t.amount > 0; return '<div class="row" style="gap:12px;padding:11px 4px;' + (i ? 'border-top:1px solid var(--line)' : '') + '"><span style="flex:0 0 38px;height:38px;border-radius:12px;display:flex;align-items:center;justify-content:center;font-weight:800;background:' + (plus ? '#FFF3CC' : 'var(--soft)') + '">' + (plus ? '↓' : '↑') + '</span><span class="col grow" style="gap:0;line-height:1.3"><strong class="ell" style="font-size:14.5px">' + esc(t.reason) + '</strong><span style="font-size:12.5px;color:var(--mut)">' + RV.date(t.created_at) + ' · ' + RV.time(t.created_at) + ' · balance ' + fmt(t.balance) + '</span></span><b class="tnum" style="color:' + (plus ? '#1E6B3A' : '#121110') + '">' + (plus ? '+' : '−') + fmt(Math.abs(t.amount)) + '</b></div>'; }).join('') + '</div>' : RV.empty('No transactions yet', 'Top-ups, rewards and spending show up here.', '')) +
      panel('c5 a-in', '<strong>Orders</strong>', w.orders.length ? '<div class="col" style="gap:8px">' + w.orders.map(o => { const m = { paid: ['#E8F6EC', '#1E6B3A', 'Paid'], pending: ['#FFF3CC', '#7A5800', 'Pending'], failed: ['#FFE3D6', '#9A3412', 'Failed'], cancelled: ['#F2F0EA', '#5E5A50', 'Cancelled'], refunded: ['#F1E8FF', '#5B21B6', 'Refunded'] }[o.status] || ['#F2F0EA', '#5E5A50', o.status]; return '<div class="row" style="gap:10px;border:1px solid var(--line);border-radius:14px;padding:10px 12px"><span class="col grow" style="gap:0;line-height:1.3"><strong class="ell" style="font-size:14px">' + esc(o.item_name) + '</strong><span style="font-size:12px;color:var(--mut)">' + RV.date(o.created_at) + ' · ' + (o.provider === 'gatevoo' ? RV.gatevooMark(13) + ' ' + esc(o.coin || 'Crypto') : esc(o.provider)) + ' · ' + esc(o.ref) + (o.tx_url ? ' · <a href="' + esc(o.tx_url) + '" target="_blank" rel="noopener">View transaction ↗</a>' : '') + (o.underpaid ? ' · <b style="color:#9A3412">Underpaid, contact support</b>' : '') + '</span></span><span class="col" style="gap:4px;align-items:flex-end"><b class="tnum">' + usd(o.amount_usd) + '</b><span class="pill" style="background:' + m[0] + ';color:' + m[1] + '">' + m[2] + '</span></span>' + (o.status === 'pending' && o.provider === 'demo' && mgr ? '<a class="btn btn-ghost btn-sm" href="/pay/demo/' + encodeURIComponent(o.ref) + '">Pay</a>' : '') + (o.pay_url && mgr ? '<a class="btn btn-ghost btn-sm" href="' + esc(o.pay_url) + '">Pay</a>' : '') + '</div>'; }).join('') + '</div>' : RV.empty('No orders yet', 'Plans, packs and power-ups you buy show up here.', '')) +
      '</div>';
    requestAnimationFrame(() => RV.countTo($('wBal'), w.credits, { dur: 1400 }));
    const paint = () => { const p = packs.find(x => x.id === RV.store.get('pack', sel)) || packs[0]; const pb = $('payBtn'); if (pb && p) pb.innerHTML = 'Buy ' + fmt(p.credits + p.bonus) + ' credits · ' + usd(p.price) + arrow; };
    paint();
    ctx.el.querySelectorAll('[data-pack]').forEach(x => x.addEventListener('click', () => { RV.store.set('pack', +x.getAttribute('data-pack')); ctx.el.querySelectorAll('[data-pack]').forEach(y => { y.classList.toggle('on', y === x); y.setAttribute('aria-checked', y === x); }); paint(); }));
    const pb = $('payBtn'); if (pb) pb.addEventListener('click', () => RV.checkout({ kind: 'pack', item_id: RV.store.get('pack', sel) || (packs[0] || {}).id }));
    const gt = $('goTop'); if (gt) gt.addEventListener('click', () => { const t = $('topup'); if (t) t.scrollIntoView({ behavior: RV.reduced() ? 'auto' : 'smooth', block: 'start' }); });
    const at = $('autoTop');
    if (at) at.addEventListener('click', async () => {
      const on = !at.classList.contains('on'); at.className = 'toggle ' + (on ? 'on' : 'off'); at.setAttribute('aria-pressed', on); $('atpRow').hidden = !on;
      try { await PUT('/api/app/workspace', { auto_topup: on, auto_topup_pack: +$('atp').value }); S.boot.workspace.auto_topup = on; toast('Auto Top-up ' + (on ? 'on' : 'off')); }
      catch (e) { at.className = 'toggle ' + (on ? 'off' : 'on'); $('atpRow').hidden = on; fail(e); }
    });
    const atpSel = $('atp'); if (atpSel) atpSel.addEventListener('change', async () => { try { await PUT('/api/app/workspace', { auto_topup_pack: +atpSel.value }); toast('Auto Top-up pack saved'); } catch (e) { fail(e); } });
    bindAddons(ctx.el);
  }
  RV.route('wallet', { render: wallet, flag: 'wallet' });

  /* ======================= PLAN ======================= */
  let yearly = false, coupon = '';
  function planCard(p, current) {
    const price = yearly ? (p.price_year ? p.price_year / 12 : 0) : p.price_month;
    const offer = p.offer && p.offer.percent > 0 ? p.offer : null;
    const shown = offer ? price * (1 - offer.percent / 100) : price;
    const dark = p.popular || p.elite;
    let dots = ''; for (let i = 0; i < Math.min(p.closers, 10); i++) dots += '<span style="width:10px;height:10px;border-radius:4px;background:' + (dark ? '#FFC21A' : '#121110') + ';opacity:' + (1 - i * 0.06) + '"></span>';
    const agText = p.closers > 999 ? 'Unlimited AI Closers' : p.closers + ' AI Closer' + (p.closers > 1 ? 's' : '');
    const bg = p.elite ? 'background:radial-gradient(400px 200px at 100% 0%,rgba(255,194,26,.28),transparent),linear-gradient(160deg,#1E1C19,#121110);border-color:#5A4A1A' : '';
    const free = p.price_month <= 0;
    let cta;
    // Plans are prepaid: the current paid plan can be renewed early (time is added on) or moved to the other billing period.
    const curIv = (S.boot.usage || {}).interval === 'year' ? 'year' : 'month';
    if (current && !free && !p.contact_sales) cta = '<button class="btn" data-buy="' + esc(p.id) + '" style="padding:14px 18px;font-size:15px;background:' + (dark ? '#2C2925;color:#FFC21A' : 'var(--soft);color:var(--ink)') + '">' + ((yearly ? 'year' : 'month') === curIv ? 'Renew · add ' + (yearly ? '12 months' : '1 month') : 'Switch to ' + (yearly ? 'yearly' : 'monthly')) + '</button>';
    else if (current) cta = '<button class="btn" disabled style="padding:14px 18px;font-size:15px;background:' + (dark ? '#2C2925;color:#FFC21A' : 'var(--soft);color:var(--ink)') + '">Your current plan</button>';
    else if (p.contact_sales) cta = '<a class="btn" href="/contact?plan=' + encodeURIComponent(p.id) + '" style="padding:14px 18px;font-size:15px;background:linear-gradient(180deg,#FFD23F,#FFC21A);color:#121110">' + esc(p.cta || 'Talk to sales') + '</a>';
    else if (free) cta = '<button class="btn" disabled style="padding:14px 18px;font-size:15px;background:var(--soft)">Free forever</button>';
    else cta = '<button class="btn" data-buy="' + esc(p.id) + '" style="padding:14px 18px;font-size:15px;background:' + (dark ? 'linear-gradient(180deg,#FFD23F,#FFC21A)' : '#121110') + ';color:' + (dark ? '#121110' : '#FFFFFF') + '">' + esc(p.cta || 'Choose ' + p.name) + '</button>';
    return '<article class="plan lift' + (dark ? ' pop' : '') + (current ? ' cur' : '') + '" style="' + bg + '">' + (p.popular ? '<div class="mesh a-mesh" style="width:240px;height:240px;right:-90px;top:-90px;background:#FFC21A;opacity:.35"></div>' : '') +
      '<div class="row" style="justify-content:space-between;gap:8px;position:relative;flex-wrap:wrap"><strong style="font-size:21px;letter-spacing:-0.03em' + (p.elite ? ';color:#FFD23F' : '') + '">' + esc(p.name) + '</strong><span class="row" style="gap:6px">' + (current ? '<span class="pill" style="background:var(--mint);color:var(--jade-dd)">CURRENT</span>' : '') + (p.badge ? '<span class="pill" style="background:' + (p.elite ? 'transparent;border:1px solid #FFC21A;color:#FFC21A' : 'var(--jade);color:var(--ink)') + '">' + esc(p.badge) + '</span>' : '') + '</span></div>' +
      '<span class="pdesc" style="font-size:14.5px;position:relative">' + esc(p.description || '') + '</span>' +
      (offer ? '<span class="pill" style="align-self:flex-start;background:#FF7A59;color:#fff;position:relative">' + esc(offer.label || offer.percent + '% off') + '</span>' : '') +
      '<div class="row" style="align-items:baseline;gap:6px;position:relative;flex-wrap:wrap">' + (offer ? '<s class="pper tnum" style="font-size:20px;font-weight:700">' + usd(Math.round(price)) + '</s>' : '') + '<span class="tnum" style="font-size:48px;font-weight:800;letter-spacing:-0.06em;line-height:1">' + usd(Math.round(shown * 100) / 100 % 1 ? +shown.toFixed(2) : Math.round(shown)) + '</span><span class="pper" style="font-size:14px;font-weight:600">' + (free ? 'forever' : yearly ? '/mo, billed ' + usd(offer ? +(p.price_year * (1 - offer.percent / 100)).toFixed(2) : p.price_year) + ' yearly' : '/month') + '</span></div>' +
      '<div class="agents"><div class="row" style="flex-wrap:wrap;gap:3px;max-width:70px">' + dots + '</div><span class="col" style="gap:0;line-height:1.3"><strong style="font-size:15px">' + agText + '</strong><span class="pdesc" style="font-size:12.5px">' + fmt(p.conversations) + ' chats · ' + esc(p.channels_text || '') + '</span></span></div>' + cta +
      '<ul>' + (p.features || []).map(x => '<li>' + RV.CHECK + esc(x) + '</li>').join('') + (p.extra_chat_price ? '<li style="opacity:.8">' + RV.CHECK + 'Extra chats: 1 Voo Credit each</li>' : '') + '</ul></article>';
  }
  async function plan(ctx) {
    await RV.refreshBoot();
    if (!ctx.ok()) return;
    if (ctx.q.interval === 'year') yearly = true;
    const b = S.boot, u = b.usage, cur = u.plan;
    const plans = b.plans || [];
    const main = plans.filter(p => !p.elite), elite = plans.filter(p => p.elite);
    const meter = (label, used, total) => { const p = total > 0 ? Math.min(100, used / total * 100) : 0; return '<div class="col" style="gap:6px;min-width:0"><div class="row" style="justify-content:space-between;font-size:13.5px;font-weight:700"><span>' + label + '</span><span class="tnum">' + fmt(used) + ' / ' + (total > 9000 ? '∞' : fmt(total)) + '</span></div><div class="meter' + (p >= 90 ? ' warn' : '') + '"><span style="width:' + p + '%"></span></div></div>'; };
    const months = b.billing.yearly_months_free || 2;
    ctx.el.innerHTML = '<section class="panel a-in" style="gap:16px"><div class="row" style="justify-content:space-between;gap:14px;flex-wrap:wrap"><span class="col" style="gap:4px"><span class="eyebrow">Current plan</span><strong style="font-size:24px;letter-spacing:-0.035em">' + esc(cur.name) + (cur.price_month > 0 ? ' · ' + usd(u.interval === 'year' ? cur.price_year : cur.price_month) + (u.interval === 'year' ? '/year' : '/month') : ' · Free') + '</strong><span class="muted small">' + (cur.price_month > 0 ? 'Renews or ends on ' : 'Usage resets on ') + RV.date(u.period_end) + '</span></span>' +
      '<div class="seg" role="radiogroup" aria-label="Billing period"><button data-py="m" role="radio" aria-checked="' + !yearly + '" class="' + (yearly ? '' : 'on') + '">Monthly</button><button data-py="y" role="radio" aria-checked="' + yearly + '" class="' + (yearly ? 'on' : '') + '">Yearly · ' + months + ' months free</button></div></div>' +
      '<div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(180px,1fr));gap:14px">' + meter('Conversations', u.conversations.used, u.conversations.included) + meter('AI Closers', u.closers_used, u.closers_limit) + meter('Team seats', u.seats_used, u.seats_limit) + (u.pro.included ? meter('Pro Brain chats', u.pro.used, u.pro.included) : '') + '</div>' +
      '<form id="cpForm" class="row" style="gap:8px;flex-wrap:wrap"><label class="lbl" for="cpIn" style="margin-right:4px">Have a coupon?</label><input id="cpIn" class="input" placeholder="WELCOME20" value="' + esc(coupon) + '" autocomplete="off" style="max-width:220px;padding:10px 14px;text-transform:uppercase"><button class="btn btn-ghost btn-sm" type="submit">' + (coupon ? 'Saved ✓' : 'Use at checkout') + '</button></form></section>' +
      '<div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(250px,1fr));gap:12px" class="a-in">' + main.map(p => planCard(p, p.id === cur.id)).join('') + '</div>' +
      (elite.length ? '<section class="col a-in" style="gap:12px;margin-top:6px"><span class="col" style="gap:4px"><span class="eyebrow">Elite</span><strong style="font-size:clamp(22px,2.6vw,30px);letter-spacing:-0.04em">For high-volume sales machines</strong></span><div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(280px,1fr));gap:12px">' + elite.map(p => planCard(p, p.id === cur.id)).join('') + '</div></section>' : '') +
      ((b.addons || []).length ? panel('a-in', '<strong>Power-ups</strong>', addonsHtml(true)) : '');
    ctx.el.querySelectorAll('[data-py]').forEach(x => x.addEventListener('click', () => { yearly = x.getAttribute('data-py') === 'y'; plan(Object.assign({}, ctx, { q: {} })); }));
    ctx.el.querySelectorAll('[data-buy]').forEach(x => x.addEventListener('click', () => RV.checkout({ kind: 'plan', item_id: x.getAttribute('data-buy'), interval: yearly ? 'year' : 'month', coupon })));
    $('cpForm').addEventListener('submit', e => { e.preventDefault(); coupon = $('cpIn').value.trim().toUpperCase(); toast(coupon ? 'Coupon ' + coupon + ' will be applied at checkout' : 'Coupon cleared'); plan(Object.assign({}, ctx, { q: {} })); });
    bindAddons(ctx.el);
    if (ctx.q.checkout) {
      const id = ctx.q.checkout; history.replaceState({}, '', '/app/plan');
      const p = plans.find(x => x.id === id);
      if (p && !p.contact_sales && p.price_month > 0) RV.checkout({ kind: 'plan', item_id: id, interval: yearly ? 'year' : 'month', coupon });
    }
  }
  RV.route('plan', { render: plan, when: () => RV.isManager() });

  /* ======================= VOO SQUAD ======================= */
  async function squad(ctx) {
    const d = await GET('/api/app/squad');
    if (!ctx.ok()) return;
    const vo = S.boot.voo;
    if (vo && vo.enabled) {
      // VooSquare owns referrals now: one code for every Zedapex tool, one balance, paid out by each tool.
      ctx.el.innerHTML = '<div class="dgrid">' +
        '<section class="c12 hero-ink a-in"><div class="mesh a-mesh" style="width:340px;height:340px;left:-120px;bottom:-160px;background:#00A86B;opacity:.35"></div>' +
        '<div class="col" style="flex:1 1 280px;min-width:0;gap:12px;position:relative"><span class="row" style="gap:10px">' + RV.vooMark(30) + '<span class="eyebrow" style="color:#3FD99A">Voo Squad · now in VooSquare</span></span><strong style="font-size:clamp(26px,3.4vw,40px);letter-spacing:-0.045em;line-height:1.05">One referral code. <span class="it" style="color:var(--jade)">Every Zedapex tool.</span></strong><span style="color:#C4BFB3">Your code, your rate and your earnings live in VooSquare. When someone you invite pays for Replyvoo, Joinvoo or any other Zedapex tool, it counts toward the same balance.</span>' +
        '<div class="row" style="gap:8px;flex-wrap:wrap"><a class="btn btn-voo" href="' + esc(vo.referrals_url) + '" target="_blank" rel="noopener">Open my referral code ↗</a><a class="btn btn-dark" href="/legal/referral">Programme terms</a></div></div>' +
        '<div style="flex:0 1 240px;margin:0 auto;position:relative">' + RV.squadArt(240) + '</div></section>' +
        (d.earned_credits ? panel('c12 a-in', '<strong>Earned in Replyvoo before VooSquare</strong>', '<span class="muted">' + RV.fmt(d.earned_credits) + ' credits from ' + usd(d.earned_usd) + ' in payments. They stay in your Voo Wallet.</span>') : '') + '</div>';
      return;
    }
    const tiers = (d.tiers || []).slice().sort((a, c) => a.min - c.min);
    const names = ['Starter', 'Pro', 'Legend', 'Icon', 'Titan'];
    const curIdx = Math.max(0, tiers.findIndex((t, i) => d.paying >= t.min && (!tiers[i + 1] || d.paying < tiers[i + 1].min)));
    const next = tiers[curIdx + 1];
    const prog = next ? Math.min(100, (d.paying - tiers[curIdx].min) / Math.max(1, next.min - tiers[curIdx].min) * 100) : 100;
    const pct = r => Math.round(r * 100) + '%';
    const text = 'I use Replyvoo: AI Closers that answer my Telegram customers in seconds. Try it here:';
    const share = [['WhatsApp', 'https://wa.me/?text=' + encodeURIComponent(text + ' ' + d.link), 'whatsapp'], ['Telegram', 'https://t.me/share/url?url=' + encodeURIComponent(d.link) + '&text=' + encodeURIComponent(text), 'telegram'], ['X', 'https://x.com/intent/tweet?text=' + encodeURIComponent(text + ' ' + d.link), 'x']];
    ctx.el.innerHTML = '<div class="dgrid">' +
      '<section class="c8 hero-ink a-in"><div class="mesh a-mesh" style="width:340px;height:340px;left:-120px;bottom:-160px;background:#FFC21A;opacity:.3"></div>' +
      '<div class="col" style="flex:1 1 280px;min-width:0;gap:12px;position:relative"><span class="eyebrow" style="color:var(--jade)">Voo Squad</span><strong style="font-size:clamp(26px,3.4vw,40px);letter-spacing:-0.045em;line-height:1.05">Earn ' + pct(d.rate) + ' of every payment. <span class="it" style="color:var(--jade)">Forever.</span></strong><span style="color:#C4BFB3">Share your link. When friends subscribe or top up, you earn Voo Credits every month they stay.</span>' +
      '<div class="row" style="gap:8px;background:var(--ink2);border:1px solid var(--ink3);border-radius:16px;padding:6px 6px 6px 14px"><span class="grow ell" style="font-weight:700" id="refLink">' + esc(d.link.replace(/^https?:\/\//, '')) + '</span><button class="btn btn-jade btn-sm" id="copyRef">' + ic('copy', '#121110', 16) + 'Copy link</button></div>' +
      '<div class="row" style="gap:8px;flex-wrap:wrap">' + share.map(s => '<a class="btn btn-dark btn-sm" href="' + s[1] + '" target="_blank" rel="noopener">' + (s[2] === 'x' ? '<span style="font-weight:800">𝕏</span>' : RV.brandIcon(s[2], 22)) + 'Share on ' + s[0] + '</a>').join('') + '</div></div>' +
      '<div style="flex:0 1 240px;margin:0 auto;position:relative">' + RV.squadArt(240) + '</div></section>' +
      panel('c4 a-in', '<strong>Your tier</strong><span class="pill" style="background:#121110;color:#FFC21A">' + pct(d.rate) + '</span>', '<div class="col" style="gap:6px"><span class="row" style="justify-content:space-between;font-weight:700"><span>' + names[curIdx] + ' · ' + pct(tiers[curIdx] ? tiers[curIdx].rate : d.rate) + '</span><span class="tnum">' + d.paying + (next ? ' / ' + next.min : '') + ' paying</span></span><div class="meter"><span style="width:' + prog + '%"></span></div><span class="muted small">' + (next ? (next.min - d.paying) + ' more paying friend' + (next.min - d.paying === 1 ? '' : 's') + ' to reach <b style="color:var(--ink)">' + names[curIdx + 1] + ' · ' + pct(next.rate) + '</b>' : 'Top tier. You’re a legend.') + '</span></div>' +
        tiers.map((t, i) => '<div class="row" style="justify-content:space-between;border:1px solid var(--line);border-radius:14px;padding:10px 12px;' + (i === curIdx ? 'background:var(--mint);border-color:var(--jade)' : '') + '"><strong>' + names[i] + '</strong><span class="muted small">' + t.min + '+ paying</span><span class="pill" style="background:' + (i === tiers.length - 1 ? '#121110;color:#FFC21A' : 'var(--soft);color:#121110') + '">' + pct(t.rate) + '</span></div>').join('')) +
      '<div class="c12" style="display:grid;grid-template-columns:repeat(auto-fit,minmax(170px,1fr));gap:14px">' + [['Link clicks', d.clicks, '#FFF3CC'], ['Sign-ups', d.signups, '#E3ECFF'], ['Paying friends', d.paying, '#E8F6EC']].map((k, i) => '<div class="kpi a-in" style="animation-delay:' + (i * 0.05) + 's"><span class="k-l">' + k[0] + '</span><b data-count="' + k[1] + '">0</b><span class="pill" style="align-self:flex-start;background:' + k[2] + '">all time</span></div>').join('') +
      '<div class="kpi a-in" style="animation-delay:.15s;background:#121110;color:#fff;border-color:#121110"><span class="k-l" style="color:#A8A294">You’ve earned</span><b style="color:#FFC21A"><span data-count="' + d.earned_credits + '">0</span> <span style="font-size:15px">credits</span></b><span class="pill" style="align-self:flex-start;background:#FFC21A;color:#121110">' + usd(d.earned_usd) + ' in payments</span></div></div>' +
      panel('c6 a-in', '<strong>How it works</strong>', [['Share your link', 'Post it in your groups, status or bio.'], ['Friends join', 'They get bonus credits when they sign up with your link.'], ['You get paid', pct(tiers[0] ? tiers[0].rate : 0.2) + ' to ' + pct(tiers.length ? tiers[tiers.length - 1].rate : 0.3) + ' of what they pay, every month. Take it as Voo Credits, or withdraw cash once you reach ' + usd(d.min_payout || 300) + '.']].map((s, i) => '<div class="row" style="gap:12px;align-items:flex-start"><span class="step-n">' + (i + 1) + '</span><span class="col" style="gap:0"><strong>' + s[0] + '</strong><span class="muted small">' + s[1] + '</span></span></div>').join('')) +
      panel('c6 a-in', '<strong>Squad leaderboard</strong><span class="pill" style="background:var(--soft);border:1px solid var(--line)">Last 30 days</span>', d.leaderboard.length ? d.leaderboard.map(r => '<div class="row" style="gap:12px;padding:10px 12px;border-radius:14px;' + (r.you ? 'background:var(--mint)' : '') + '"><b style="width:28px" class="tnum">#' + r.rank + '</b>' + (r.you ? RV.mojiCircle(S.boot.user.moji, 34) : RV.avatar(r.name, 34)) + '<strong class="grow">' + esc(r.name) + '</strong><b class="tnum">' + usd(r.usd) + '</b></div>').join('') : RV.empty('Be the first on the board', 'Share your link today. The top Squad members show up here.', '')) + '</div>';
    requestAnimationFrame(() => RV.qsa('[data-count]', ctx.el).forEach(el => RV.countTo(el, +el.getAttribute('data-count'))));
    $('copyRef').addEventListener('click', () => RV.copy(d.link, 'Referral link copied'));
  }
  RV.route('squad', { render: squad, flag: 'squad' });

  /* ======================= JOINVOO ======================= */
  function ghost(x, y, delay, real) {
    const c = real ? '#7EE0B0' : '#CFC9BB';
    return '<g style="animation-delay:' + delay + 's" class="' + (real ? '' : 'ghost-fig') + '"><circle cx="' + x + '" cy="' + y + '" r="9" fill="' + c + '"' + (real ? ' stroke="#121110" stroke-width="2"' : '') + '/>' + (real ? '<path d="M' + (x - 3) + ' ' + (y - 1) + 'h.1M' + (x + 3) + ' ' + (y - 1) + 'h.1" stroke="#121110" stroke-width="2.6" stroke-linecap="round"/>' : '<path d="M' + (x - 4) + ' ' + (y - 1) + 'l2 0M' + (x + 2) + ' ' + (y - 1) + 'l2 0" stroke="#948F82" stroke-width="2" stroke-linecap="round"/>') + '<path d="M' + (x - 12) + ' ' + (y + 30) + 'c0-12 5-18 12-18s12 6 12 18' + (real ? 'z' : 'l-4-3-4 3-4-3-4 3-4-3z') + '" fill="' + c + '"' + (real ? ' stroke="#121110" stroke-width="2"' : '') + '/></g>';
  }
  function walkers(n, realEvery, y, span, color) {
    let s = '';
    for (let i = 0; i < n; i++) {
      const real = realEvery && i % realEvery === 0;
      s += '<g class="walker" style="animation-delay:' + (i * (5 / n)).toFixed(2) + 's;animation-duration:5s">' + ghost(0, y, 0, real) + '</g>';
    }
    return '<g transform="translate(' + span[0] + ' 0)">' + s + '</g>';
  }
  function problemSvg() {
    // Ad -> fake traffic walking -> Telegram channel; money burning; algorithm loop
    let coins = ''; [0, 0.7, 1.4].forEach((d, i) => { coins += '<g class="dropcoin" style="animation-delay:' + d + 's"><circle cx="' + (92 + i * 14) + '" cy="40" r="9" fill="#FFC21A" stroke="#121110" stroke-width="2.5"/><text x="' + (92 + i * 14) + '" y="44" text-anchor="middle" font-size="10" font-weight="800" fill="#121110" font-family="Plus Jakarta Sans,sans-serif">$</text></g>'; });
    return '<svg class="jv-funnel" viewBox="0 0 900 410" role="img" aria-label="Animated diagram: money pays for ad clicks, mostly bots and fake joins walk into the Telegram channel and get counted as conversions, money burns, and the ad algorithm loops back to buy more fake traffic.">' +
      '<defs><linearGradient id="jvFire" x1="0" y1="1" x2="0" y2="0"><stop offset="0" stop-color="#FF7A59"/><stop offset=".6" stop-color="#FFC21A"/><stop offset="1" stop-color="#FFF3CC"/></linearGradient></defs>' +
      // wallet + coins
      '<g><rect x="60" y="150" width="110" height="80" rx="18" fill="#FFC21A" stroke="#121110" stroke-width="4"/><rect x="128" y="174" width="42" height="32" rx="10" fill="#121110"/><circle cx="144" cy="190" r="6" fill="#FFC21A"/><text x="115" y="262" text-anchor="middle" font-size="15" font-weight="800" fill="#121110" font-family="Plus Jakarta Sans,sans-serif">Your ad budget</text></g>' +
      '<g transform="translate(0 70)">' + coins + '</g>' +
      // ad card
      '<g><rect x="200" y="120" width="120" height="150" rx="20" fill="#FFFFFF" stroke="#121110" stroke-width="4"/><rect x="214" y="136" width="92" height="60" rx="12" fill="#FFE58A"/><path d="M236 180l16-20 14 14 10-8 18 14" stroke="#121110" stroke-width="3" fill="none" stroke-linejoin="round"/><rect x="214" y="206" width="70" height="9" rx="4" fill="#EEEBE2"/><rect x="214" y="222" width="50" height="9" rx="4" fill="#EEEBE2"/><rect x="214" y="240" width="92" height="20" rx="10" fill="#121110"/><text x="260" y="254" text-anchor="middle" font-size="10" font-weight="800" fill="#FFC21A" font-family="Plus Jakarta Sans,sans-serif">JOIN</text><text x="260" y="292" text-anchor="middle" font-size="15" font-weight="800" fill="#121110" font-family="Plus Jakarta Sans,sans-serif">Your ad</text></g>' +
      '<path d="M330 200 H600" stroke="#E2DDD0" stroke-width="3" class="flow"/>' +
      // walkers
      '<g>' + walkers(8, 4, 168, [330]) + '</g>' +
      // counter bubble
      '<g class="a-floats"><rect x="380" y="62" width="200" height="54" rx="16" fill="#121110"/><path d="M470 116l10 12 10-12" fill="#121110"/><text x="480" y="84" text-anchor="middle" font-size="11" font-weight="800" fill="#A8A294" font-family="Plus Jakarta Sans,sans-serif" letter-spacing="1">AD PLATFORM COUNTS</text><text x="480" y="106" text-anchor="middle" font-size="18" font-weight="800" fill="#FFC21A" font-family="Plus Jakarta Sans,sans-serif">1,000 “conversions”</text></g>' +
      // telegram door
      '<g><rect x="610" y="118" width="120" height="150" rx="22" fill="#2AABEE" stroke="#121110" stroke-width="4"/><path d="M640 186 700 160 690 222 672 206 660 220 662 200z" fill="#FFFFFF"/><text x="670" y="292" text-anchor="middle" font-size="15" font-weight="800" fill="#121110" font-family="Plus Jakarta Sans,sans-serif">Telegram channel</text></g>' +
      // ghosts leaving
      '<g class="ghost-fig">' + ghost(762, 150, 0, false) + ghost(790, 176, 0, false) + '</g><g>' + ghost(770, 214, 0, true) + '</g><text x="800" y="128" font-size="12" font-weight="700" fill="#948F82" font-family="Plus Jakarta Sans,sans-serif">bots, fake joins</text><text x="800" y="246" font-size="12" font-weight="800" fill="#1E6B3A" font-family="Plus Jakarta Sans,sans-serif">1 real buyer</text>' +
      // fire with coins
      '<g transform="translate(770 290)"><ellipse cx="40" cy="58" rx="56" ry="8" fill="#121110" opacity=".12"/><path class="flame" d="M40 0c10 18 30 24 30 44a30 30 0 0 1-60 0c0-14 10-20 12-32 6 8 10 10 14 12 2-8 0-16 4-24z" fill="url(#jvFire)" stroke="#121110" stroke-width="3"/><g class="dropcoin" style="animation-duration:1.6s"><circle cx="40" cy="-14" r="8" fill="#FFC21A" stroke="#121110" stroke-width="2.5"/></g><text x="40" y="90" text-anchor="middle" font-size="15" font-weight="800" fill="#9A2A12" font-family="Plus Jakarta Sans,sans-serif">Money burning</text></g>' +
      // algorithm loop
      '<g transform="translate(400 340)"><g class="loop"><circle cx="0" cy="0" r="26" fill="none" stroke="#FF7A59" stroke-width="4" stroke-dasharray="120 44"/><path d="M22 -14l6 12-13 0z" fill="#FF7A59"/></g><text x="38" y="-4" font-size="14" font-weight="800" fill="#121110" font-family="Plus Jakarta Sans,sans-serif">The algorithm “learns”:</text><text x="38" y="16" font-size="13" font-weight="600" fill="#5E5A50" font-family="Plus Jakarta Sans,sans-serif">find me more people like these. More bots.</text></g>' +
      '<path d="M370 340 C 280 370, 200 340, 220 284" stroke="#FF7A59" stroke-width="3" fill="none" class="flow"/><path d="M214 292l6-12 8 12z" fill="#FF7A59"/>' +
      '</svg>';
  }
  function fixSvg() {
    let bars = ''; [40, 64, 88, 120, 150].forEach((h, i) => { bars += '<rect class="growbar" style="animation-delay:' + (i * 0.25) + 's" x="' + (700 + i * 30) + '" y="' + (300 - h) + '" width="22" height="' + h + '" rx="6" fill="' + (i === 4 ? '#FFC21A' : '#7EE0B0') + '" stroke="#121110" stroke-width="2.5"/>'; });
    return '<svg class="jv-funnel" viewBox="0 0 900 360" role="img" aria-label="Animated diagram: real people join from the ad, Joinvoo tracks real joins, sign-ups, deposits and sales and sends them back to the ad platform server-side, and revenue grows.">' +
      '<g><rect x="40" y="110" width="120" height="150" rx="20" fill="#FFFFFF" stroke="#121110" stroke-width="4"/><rect x="54" y="126" width="92" height="60" rx="12" fill="#FFE58A"/><path d="M76 170l16-20 14 14 10-8 18 14" stroke="#121110" stroke-width="3" fill="none" stroke-linejoin="round"/><rect x="54" y="230" width="92" height="20" rx="10" fill="#121110"/><text x="100" y="244" text-anchor="middle" font-size="10" font-weight="800" fill="#FFC21A" font-family="Plus Jakarta Sans,sans-serif">JOIN</text><text x="100" y="282" text-anchor="middle" font-size="15" font-weight="800" fill="#121110" font-family="Plus Jakarta Sans,sans-serif">Your ad</text></g>' +
      '<path d="M170 190 H420" stroke="#9AD6AE" stroke-width="3" class="flow"/>' +
      '<g>' + walkers(6, 1, 158, [170]) + '</g>' +
      // joinvoo hub
      '<g transform="translate(430 112)"><rect x="0" y="0" width="150" height="150" rx="34" fill="#121110"/><rect x="18" y="18" width="114" height="114" rx="24" fill="#FFC21A" class="a-glow"/><text x="75" y="70" text-anchor="middle" font-size="20" font-weight="800" fill="#121110" font-family="Plus Jakarta Sans,sans-serif">Joinvoo</text><text x="75" y="92" text-anchor="middle" font-size="11" font-weight="700" fill="#3B3000" font-family="Plus Jakarta Sans,sans-serif">tracks what’s real</text><text x="75" y="178" text-anchor="middle" font-size="14" font-weight="800" fill="#121110" font-family="Plus Jakarta Sans,sans-serif">Real joins · sign-ups</text><text x="75" y="196" text-anchor="middle" font-size="14" font-weight="800" fill="#121110" font-family="Plus Jakarta Sans,sans-serif">deposits · sales</text></g>' +
      // server-side feedback arrow
      '<path d="M505 104 C 505 30, 120 30, 100 100" stroke="#2E9E5B" stroke-width="4" fill="none" class="flow"/><path d="M92 96l8 14 8-14z" fill="#2E9E5B"/>' +
      '<g class="a-floats"><rect x="180" y="22" width="310" height="44" rx="14" fill="#E8F6EC" stroke="#9AD6AE" stroke-width="2"/><text x="335" y="49" text-anchor="middle" font-size="13" font-weight="800" fill="#14532D" font-family="Plus Jakarta Sans,sans-serif">Sent back server-side to Meta · TikTok · Snapchat</text></g>' +
      '<path d="M590 190 H680" stroke="#9AD6AE" stroke-width="3" class="flow"/>' +
      // growing money
      '<g>' + bars + '<path d="M690 300 H860" stroke="#121110" stroke-width="3"/><g class="a-coin" style="transform-box:fill-box"><circle cx="830" cy="110" r="12" fill="#FFC21A" stroke="#121110" stroke-width="2.5"/><text x="830" y="114.5" text-anchor="middle" font-size="11" font-weight="800" fill="#121110" font-family="Plus Jakarta Sans,sans-serif">$</text></g><text x="775" y="330" text-anchor="middle" font-size="15" font-weight="800" fill="#1E6B3A" font-family="Plus Jakarta Sans,sans-serif">Revenue grows</text></g>' +
      '<text x="460" y="340" text-anchor="middle" font-size="14" font-weight="700" fill="#5E5A50" font-family="Plus Jakarta Sans,sans-serif">The algorithm now learns from buyers, so it finds more buyers.</text>' +
      '</svg>';
  }
  async function joinvoo(ctx) {
    const j = S.boot.joinvoo || {};
    const visit = (src, label, big) => '<a class="btn ' + (big ? 'btn-jv' : 'btn-jade') + '" href="/go/joinvoo?from=' + src + '" rel="noopener">' + (label || 'Visit JOINVOO') + '<span style="width:30px;height:30px;border-radius:50%;background:#121110;display:inline-flex;align-items:center;justify-content:center">' + ic('right', '#FFC21A', 16, 2.6) + '</span></a>';
    ctx.el.innerHTML =
      '<section class="jv-hero a-in"><div class="mesh a-mesh" style="width:360px;height:360px;left:-140px;bottom:-180px;background:#FFC21A;opacity:.22"></div>' +
      '<div class="col" style="flex:1 1 380px;gap:16px;position:relative;min-width:0"><span class="row" style="gap:8px"><span class="pill" style="background:transparent;border:1px solid #5A4A1A;color:var(--jade)">Sister app</span><span class="pill" style="background:var(--ink3);color:#E5E0D4">by Zedapex</span></span>' +
      '<h1 class="h1" style="font-size:clamp(34px,4.6vw,58px)">' + esc(j.headline || 'Running ads to Telegram? Stop paying for fake traffic.') + '</h1>' +
      '<p style="margin:0;font-size:17px;line-height:1.6;color:#C4BFB3;max-width:620px">' + esc(j.pitch || 'Joinvoo tracks every real Telegram join, sign-up, deposit and sale, then sends them back to Meta, TikTok and Snapchat server-side.') + '</p>' +
      '<div class="row" style="gap:10px;flex-wrap:wrap">' + visit('dashboard_page', null, true) + '<a class="btn btn-dark" href="#jvHow">See how it works</a></div></div>' +
      '<div class="col" style="flex:0 1 300px;gap:10px;margin:0 auto;position:relative">' +
      '<div class="ink-box col a-floats" style="gap:6px"><span style="font-size:12px;font-weight:800;color:#A8A294;letter-spacing:.1em">AD PLATFORM SAYS</span><b class="tnum" style="font-size:34px;color:#fff;letter-spacing:-0.04em" id="jvSays">1,000</b><span style="font-size:13px;color:#A8A294">“conversions” this week</span></div>' +
      '<div class="col" style="gap:6px;background:#FFC21A;color:#121110;border-radius:22px;padding:16px;animation-delay:1s" class="a-float2"><span style="font-size:12px;font-weight:800;letter-spacing:.1em">JOINVOO SEES</span><b class="tnum" style="font-size:34px;letter-spacing:-0.04em" id="jvReal">41</b><span style="font-size:13px;font-weight:700">real buyers</span></div>' +
      '<span style="font-size:11.5px;color:#7a756b;text-align:center">Illustrative example</span></div></section>' +
      // problem
      '<section class="panel a-in" style="gap:18px;padding:clamp(18px,3vw,30px)"><div class="col" style="gap:6px;max-width:760px"><span class="eyebrow" style="color:#9A2A12">The problem</span><strong class="h2">Your ads are optimising for <span class="it">ghosts.</span></strong><p class="muted" style="margin:0;font-size:16.5px">You pay for clicks. Bots and fake joins pour in. The ad platform calls them conversions, so its algorithm goes looking for more of the same. Your budget burns while real buyers never see your ad.</p></div>' +
      '<div style="background:var(--soft);border:1px solid var(--line);border-radius:24px;padding:clamp(8px,2vw,20px);overflow:hidden">' + problemSvg() + '</div>' +
      '<div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(200px,1fr));gap:10px">' + [['👻', 'Fake joins look like wins', 'Bots, bought members and accidental taps all count as “results”.'], ['🔥', 'Money burns quietly', 'Cost per real customer climbs while your dashboard looks fine.'], ['🔁', 'The loop gets worse', 'The algorithm learns from junk and finds you even more junk.']].map(x => '<div class="col" style="gap:4px;border:1px solid var(--line);border-radius:18px;padding:14px;background:#fff"><span style="font-size:24px" aria-hidden="true">' + x[0] + '</span><strong>' + x[1] + '</strong><span class="small muted">' + x[2] + '</span></div>').join('') + '</div></section>' +
      // fix
      '<section class="panel a-in" style="gap:18px;padding:clamp(18px,3vw,30px);background:linear-gradient(180deg,#F0FAF3,#FFFFFF);border-color:#CDEBD6"><div class="col" style="gap:6px;max-width:760px"><span class="eyebrow" style="color:#1E6B3A">The Joinvoo fix</span><strong class="h2">Teach your ads what a <span class="it">real customer</span> looks like.</strong><p class="muted" style="margin:0;font-size:16.5px">Joinvoo tracks the people who actually join, sign up, deposit and buy, then sends those events straight back to your ad platforms, server-side. No guesswork, no pixels that break.</p></div>' +
      '<div style="background:#fff;border:1px solid #CDEBD6;border-radius:24px;padding:clamp(8px,2vw,20px);overflow:hidden">' + fixSvg() + '</div></section>' +
      // before / after
      '<section class="col a-in" style="gap:12px"><div class="row" style="justify-content:space-between;gap:10px;flex-wrap:wrap"><strong class="h3">Before vs after</strong><span class="pill" style="background:var(--soft);border:1px solid var(--line);color:var(--mut)">Illustrative example, not real customer data</span></div>' +
      '<div class="jv-cmp"><div class="h">Same $1,000 ad budget</div><div class="h" style="color:#9A2A12">Without Joinvoo</div><div class="h" style="color:#1E6B3A">With Joinvoo</div>' +
      [['“Conversions” reported', '1,000', '380 (all real)'], ['Real paying customers', '41', '118'], ['Cost per real customer', '$24.39', '$8.47'], ['Return on ad spend', '0.6x', '2.3x'], ['What the algorithm learns', 'Find more clickers', 'Find more buyers']].map(r => '<div>' + r[0] + '</div><div class="bad">' + r[1] + '</div><div class="good">' + r[2] + '</div>').join('') + '</div></section>' +
      // how it works
      '<section class="col a-in" id="jvHow" style="gap:12px;scroll-margin-top:90px"><strong class="h3">How it works</strong><div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(240px,1fr));gap:12px">' +
      [['Connect', 'Link your Telegram channel or bot and your Meta, TikTok or Snapchat ad accounts. Takes minutes.', '<svg viewBox="0 0 120 60" width="120" aria-hidden="true"><rect x="4" y="12" width="40" height="36" rx="12" fill="#2AABEE" stroke="#121110" stroke-width="3"/><rect x="76" y="12" width="40" height="36" rx="12" fill="#FFC21A" stroke="#121110" stroke-width="3"/><path d="M46 30h28" stroke="#121110" stroke-width="3" class="flow"/></svg>'],
        ['Track what’s real', 'Every join, sign-up, deposit and sale is matched to the ad that brought it. Bots and fake joins get filtered out.', '<svg viewBox="0 0 120 60" width="120" aria-hidden="true"><g class="ghost-fig"><circle cx="24" cy="22" r="8" fill="#CFC9BB"/><path d="M12 50c0-12 5-18 12-18s12 6 12 18z" fill="#CFC9BB"/></g><circle cx="70" cy="22" r="8" fill="#7EE0B0" stroke="#121110" stroke-width="2"/><path d="M58 50c0-12 5-18 12-18s12 6 12 18z" fill="#7EE0B0" stroke="#121110" stroke-width="2"/><path d="M92 30l6 6 12-14" stroke="#2E9E5B" stroke-width="4" fill="none" stroke-linecap="round"/></svg>'],
        ['Send it back', 'Joinvoo sends real results to your ad platforms server-side. The algorithm learns from buyers and your cost per customer drops.', '<svg viewBox="0 0 120 60" width="120" aria-hidden="true"><rect class="growbar" x="14" y="30" width="18" height="24" rx="5" fill="#7EE0B0" stroke="#121110" stroke-width="2.5"/><rect class="growbar" style="animation-delay:.3s" x="42" y="20" width="18" height="34" rx="5" fill="#7EE0B0" stroke="#121110" stroke-width="2.5"/><rect class="growbar" style="animation-delay:.6s" x="70" y="8" width="18" height="46" rx="5" fill="#FFC21A" stroke="#121110" stroke-width="2.5"/></svg>']
      ].map((s, i) => '<div class="jv-step lift"><div class="row" style="justify-content:space-between;align-items:flex-start"><span class="jv-num">' + (i + 1) + '</span>' + s[2] + '</div><strong style="font-size:19px;letter-spacing:-0.03em">' + s[0] + '</strong><span class="muted small" style="font-size:14.5px">' + s[1] + '</span></div>').join('') + '</div></section>' +
      // CTA
      '<section class="jv-hero a-in" style="justify-content:center;text-align:center"><div class="col" style="align-items:center;gap:14px;position:relative;max-width:700px;margin:0 auto"><strong class="h2">Stop feeding your ads <span class="it" style="color:var(--jade)">fake traffic.</span></strong><p style="margin:0;color:#C4BFB3;font-size:16.5px">Replyvoo closes the chats. Joinvoo makes sure the right people start them.</p>' + visit('dashboard_page_bottom', null, true) + '<span style="font-size:12.5px;color:#7a756b">Opens joinvoo.com</span></div></section>';
    // count animation for hero demo numbers
    let k = 0; const says = $('jvSays'), real = $('jvReal');
    if (says && !RV.reduced()) { says.setAttribute('data-v', 0); real.setAttribute('data-v', 0); RV.countTo(says, 1000, { dur: 1600 }); RV.countTo(real, 41, { dur: 1600 }); }
    void k;
  }
  RV.route('joinvoo', { render: joinvoo, flag: 'joinvoo', when: () => RV.joinvooOn() });

  /* ======================= TEAM ======================= */
  async function team(ctx) {
    const d = await GET('/api/app/team');
    if (!ctx.ok()) return;
    const mgr = RV.isManager(), u = S.boot.usage, me = S.boot.user;
    const used = d.members.length + d.invites.length;
    const roleP = r => '<span class="pill" style="background:' + (r === 'owner' ? '#121110;color:#FFC21A' : r === 'admin' ? 'var(--mint);color:var(--jade-dd)' : 'var(--soft);color:var(--ink);border:1px solid var(--line)') + ';text-transform:capitalize">' + esc(r) + '</span>';
    ctx.el.innerHTML = '<div class="dgrid">' +
      '<section class="c12 panel a-in" style="flex-direction:row;flex-wrap:wrap;align-items:center;gap:16px"><span class="row" style="gap:0">' + d.members.slice(0, 5).map((m, i) => '<span style="margin-left:' + (i ? -12 : 0) + 'px;border:3px solid #fff;border-radius:50%;display:flex">' + RV.mojiCircle(m.moji, 44) + '</span>').join('') + '</span><span class="col grow" style="gap:2px;min-width:200px"><strong style="font-size:17px">' + d.members.length + ' member' + (d.members.length === 1 ? '' : 's') + (d.invites.length ? ' · ' + d.invites.length + ' invited' : '') + '</strong><span class="muted small">' + used + ' of ' + d.seats + ' seats used on ' + esc(u.plan.name) + '. Everyone shares Pulse Inbox and can take over chats.</span></span><span class="meter" style="flex:1 1 180px"><span style="width:' + Math.min(100, used / Math.max(1, d.seats) * 100) + '%"></span></span></section>' +
      panel('c7 a-in', '<strong>Members</strong><span class="pill" style="background:var(--soft);border:1px solid var(--line)">' + used + ' / ' + d.seats + ' seats</span>', '<div class="col" style="gap:8px">' + d.members.map(m => '<div class="tm-row a-in">' + RV.mojiCircle(m.moji, 42) + '<span class="col grow" style="gap:0;min-width:140px"><strong class="ell">' + esc(m.name || m.email) + (m.id === me.id ? ' <span class="muted" style="font-weight:600">(you)</span>' : '') + '</strong><span class="small muted ell">' + esc(m.email) + '</span><span class="small muted">' + (m.last_login ? 'Active ' + RV.ago(m.last_login) : 'Hasn’t logged in yet') + (m.replies ? ' · ' + fmt(m.replies) + ' replies sent' : '') + '</span></span>' +
        (mgr && m.role !== 'owner' && m.id !== me.id ? '<div class="seg tm-seg" role="radiogroup" aria-label="Role for ' + esc(m.name || m.email) + '"><button type="button" data-mrole="agent" data-uid="' + m.id + '" class="' + (m.role === 'agent' ? 'on' : '') + '" role="radio" aria-checked="' + (m.role === 'agent') + '">Agent</button><button type="button" data-mrole="admin" data-uid="' + m.id + '" class="' + (m.role === 'admin' ? 'on' : '') + '" role="radio" aria-checked="' + (m.role === 'admin') + '">Admin</button></div><button class="btn btn-ghost btn-sm" data-rm="' + m.id + '" aria-label="Remove ' + esc(m.name || m.email) + '">Remove</button>' : roleP(m.role)) + '</div>').join('') + '</div>' +
        '<div class="tm-roles">' + [['Owner', 'Everything, including billing and deleting the workspace.', '#121110'], ['Admin', 'Closers, channels, training, billing and the team.', '#FFC21A'], ['Agent', 'Pulse Inbox and leads: reply, take over chats, add notes.', '#8FB8FF']].map(r => '<div class="tm-role"><i style="background:' + r[2] + '"></i><strong>' + r[0] + '</strong><span>' + r[1] + '</span></div>').join('') + '</div>') +
      '<div class="c5 col" style="gap:14px">' +
      (mgr ? panel('a-in', '<strong>Invite a teammate</strong>', '<form id="invForm" class="col" style="gap:10px"><div class="field"><label class="lbl" for="invEmail">Email</label><input id="invEmail" class="input" type="email" placeholder="teammate@business.com" required autocomplete="off"></div><div class="field"><span class="lbl" id="roleL">Role</span><div class="seg" role="radiogroup" aria-labelledby="roleL"><button type="button" class="on" data-role="agent" role="radio" aria-checked="true">Agent</button><button type="button" data-role="admin" role="radio" aria-checked="false">Admin</button></div><span class="hint">Agents work the inbox. Admins can also change Closers, channels and billing.</span></div><button class="btn btn-ink" type="submit" id="invGo">Send invite</button><div class="tm-how"><strong>How they join</strong><span>1. They get an email with a join link (valid 7 days).</span><span>2. ' + (d.voo ? 'They tap “Continue with VooSquare” and log in or sign up with that same email.' : 'They choose a password, or log in if they already use Replyvoo.') + '</span><span>3. They land straight in your workspace' + (d.voo ? '. One Voo ID works across all Zedapex tools.' : '.') + '</span></div></form>') : '') +
      panel('a-in', '<strong>Pending invites</strong>', d.invites.length ? '<div class="col" style="gap:8px">' + d.invites.map(i => '<div class="row" style="gap:10px;border:1px dashed var(--line2);border-radius:14px;padding:10px 12px"><span class="av" style="background:var(--soft)">✉</span><span class="col grow" style="gap:0;min-width:0"><strong class="ell">' + esc(i.email) + '</strong><span class="small muted">' + esc(i.role) + ' · expires ' + RV.date(i.expires_at) + '</span></span>' + (mgr ? '<button class="btn btn-ghost btn-sm" data-resend="' + i.id + '">Resend</button><button class="btn btn-ghost btn-sm" data-cancel="' + i.id + '">Cancel</button>' : '') + '</div>').join('') + '</div>' : '<p class="small muted" style="margin:0">No pending invites.</p>') + '</div></div>';
    let role = 'agent';
    ctx.el.querySelectorAll('[data-role]').forEach(b => b.addEventListener('click', () => { role = b.getAttribute('data-role'); ctx.el.querySelectorAll('[data-role]').forEach(x => { x.classList.toggle('on', x === b); x.setAttribute('aria-checked', x === b); }); }));
    const f = $('invForm');
    if (f) f.addEventListener('submit', async e => {
      e.preventDefault(); const em = $('invEmail').value.trim();
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(em)) { toast('Enter a valid email address.', 'err'); return; }
      const b = $('invGo'); RV.busy(b, true, 'Sending…');
      try { await POST('/api/app/team/invite', { email: em, role }); toast('Invite sent to ' + em); team(ctx); }
      catch (er) { RV.busy(b, false); if (er.code === 'seat_limit') toast(er.message, 'err', { label: 'Upgrade', fn: () => go('/app/plan') }); else fail(er); }
    });
    ctx.el.querySelectorAll('[data-resend]').forEach(b => b.addEventListener('click', async () => { RV.busy(b, true); try { await POST('/api/app/invites/' + b.getAttribute('data-resend') + '/resend'); toast('Invite sent again'); } catch (e) { fail(e); } RV.busy(b, false); }));
    ctx.el.querySelectorAll('[data-mrole]').forEach(b => b.addEventListener('click', async () => {
      if (b.classList.contains('on')) return;
      const uid = b.getAttribute('data-uid'), r = b.getAttribute('data-mrole');
      try { await PUT('/api/app/team/' + uid, { role: r }); ctx.el.querySelectorAll('[data-uid="' + uid + '"]').forEach(x => { const on = x === b; x.classList.toggle('on', on); x.setAttribute('aria-checked', on); }); toast('Role changed to ' + (r === 'admin' ? 'Admin' : 'Agent')); }
      catch (e) { fail(e); }
    }));
    ctx.el.querySelectorAll('[data-cancel]').forEach(b => b.addEventListener('click', async () => { try { await DEL('/api/app/invites/' + b.getAttribute('data-cancel')); toast('Invite cancelled'); team(ctx); } catch (e) { fail(e); } }));
    ctx.el.querySelectorAll('[data-rm]').forEach(b => b.addEventListener('click', async () => {
      const m = d.members.find(x => x.id === +b.getAttribute('data-rm'));
      if (!(await RV.confirmBox('Remove ' + (m.name || m.email) + '?', 'They lose access to this workspace right away. Their past replies stay in Pulse Inbox.', 'Remove', true))) return;
      try { await DEL('/api/app/team/' + m.id); toast('Removed ' + (m.name || m.email)); await RV.refreshBoot(); team(ctx); } catch (e) { fail(e); }
    }));
  }
  RV.route('team', { render: team });

  /* ======================= SETTINGS ======================= */
  const TZS = ['Africa/Lagos', 'Africa/Accra', 'Africa/Nairobi', 'Africa/Johannesburg', 'Africa/Cairo', 'Africa/Casablanca', 'Africa/Douala', 'Europe/London', 'Europe/Paris', 'Europe/Berlin', 'Asia/Dubai', 'Asia/Kolkata', 'Asia/Singapore', 'America/New_York', 'America/Chicago', 'America/Los_Angeles', 'America/Sao_Paulo', 'Australia/Sydney', 'UTC'];
  async function settings(ctx) {
    const b = S.boot, me = b.user, mgr = RV.isManager(), w = b.workspace, al = w.settings.alerts || {};
    const mj = RV.cleanMoji(me.moji);
    const tzs = TZS.includes(w.settings.timezone) ? TZS : [w.settings.timezone].concat(TZS);
    const alerts = [['handoff', 'Handoff alerts', 'Ping me when a chat needs a human'], ['hot', 'Hot lead alerts', 'Ping me when a lead turns Hot'], RV.flag('night_report') && ['night_report', 'Night Shift Report', 'Your day in one message every evening'], ['low_credits', 'Low credit warning', 'Tell me before my Voo Wallet runs low']].filter(Boolean);
    ctx.el.innerHTML = '<div class="dgrid">' +
      panel('c7 a-in', '<strong>Your profile</strong>', '<div class="row" style="gap:18px;align-items:flex-start;flex-wrap:wrap"><div id="pfMoji" class="moji-c a-floats" style="width:110px;height:110px;background:linear-gradient(160deg,#FFD23F,#FFC21A)">' + RV.moji(mj, 104) + '</div><div class="col grow" style="gap:12px;min-width:240px"><div class="field"><label class="lbl" for="pfName">Name</label><input id="pfName" class="input" maxlength="80" value="' + esc(me.name || '') + '" autocomplete="name"></div><div class="field"><span class="lbl">Email</span><span class="row" style="gap:8px;flex-wrap:wrap;overflow-wrap:anywhere"><span style="min-width:0">' + esc(me.email) + '</span>' + (me.email_verified ? '<span class="pill" style="background:#E8F6EC;color:#1E6B3A">Verified</span>' : '<span class="pill" style="background:#FFE3D6;color:#9A3412">Not verified</span>') + '</span></div></div></div>' +
        '<div id="pfEd">' + RV.mojiEditor(mj) + '</div><button class="btn btn-ink" id="pfSave" style="align-self:flex-start">Save profile</button>') +
      '<div class="c5 col" style="gap:14px">' +
      ((S.boot.voo && S.boot.voo.enabled && me.voo) ? panel('a-in', '<strong>Login</strong><span class="pill voo-pill">' + RV.vooMark(14) + 'Voo ID</span>', '<div class="col" style="gap:10px"><span class="muted">You log in with your Voo ID, the one account for every Zedapex tool. Change your email, password or sign-in methods in VooSquare.</span><a class="btn btn-ghost" href="' + esc(S.boot.voo.home_url) + '/#account" target="_blank" rel="noopener">Manage in VooSquare ↗</a><a class="btn btn-ghost" href="' + esc(S.boot.voo.connected_url) + '" target="_blank" rel="noopener">Connected tools ↗</a></div>') :       panel('a-in', '<strong>Password</strong>', '<form id="pwForm" class="col" style="gap:10px"><input type="text" autocomplete="username" value="' + esc(me.email) + '" hidden><div class="field"><label class="lbl" for="pwCur">Current password</label><input id="pwCur" class="input" type="password" autocomplete="current-password" required></div><div class="field"><label class="lbl" for="pwNew">New password</label><input id="pwNew" class="input" type="password" autocomplete="new-password" minlength="8" placeholder="At least 8 characters" required></div><button class="btn btn-ghost" type="submit" id="pwGo">Update password</button><span class="hint">You’ll stay logged in here. Other devices are logged out.</span></form>')) +
      panel('a-in', '<strong>Account</strong>', '<div class="col" style="gap:8px">' + (mgr ? '<button class="btn btn-ghost" id="stExport">' + ic('download', '#121110', 16) + 'Export my data</button>' : '') + '<button class="btn btn-danger" id="stLogout">' + ic('logout', '#9A2A12', 16) + 'Log out</button></div>') + '</div>' +
      (mgr ? panel('c6 a-in', '<strong>Workspace</strong>', '<form id="wsForm" class="col" style="gap:10px"><div class="field"><label class="lbl" for="wsName">Business name</label><input id="wsName" class="input" maxlength="80" value="' + esc(w.name) + '"></div><div class="field"><label class="lbl" for="wsNiche">What you sell</label><input id="wsNiche" class="input" maxlength="60" list="nicheList" value="' + esc(w.settings.niche || '') + '"><datalist id="nicheList">' + (RV.NICHES || []).map(n => '<option value="' + esc(n[0]) + '">').join('') + '</datalist></div><div class="field"><label class="lbl" for="wsTz">Time zone</label><select id="wsTz" class="input">' + tzs.map(t => '<option' + (t === w.settings.timezone ? ' selected' : '') + '>' + esc(t) + '</option>').join('') + '</select><span class="hint">Used for your Night Shift Report and Blast scheduling.</span></div><button class="btn btn-ink" type="submit" id="wsGo" style="align-self:flex-start">Save workspace</button></form>') +
        panel('c6 a-in', '<strong>Alerts</strong>', '<div class="col" style="gap:12px">' + alerts.map(a => '<div class="row" style="gap:12px"><span class="col grow" style="gap:0"><strong style="font-size:15px">' + a[1] + '</strong><span class="small muted">' + a[2] + '</span></span><button class="toggle ' + (al[a[0]] !== false ? 'on' : 'off') + '" data-alert="' + a[0] + '" aria-label="' + a[1] + '" aria-pressed="' + (al[a[0]] !== false) + '"><span></span></button></div>').join('') + '</div><span class="hint">Alerts go to your email' + (me.email_verified ? '' : ' once it’s verified') + '.</span>') : '') +
      '</div>';
    $('pfEd').addEventListener('click', e => {
      const btn = e.target.closest('[data-mj]'); if (!btn) return;
      RV.mojiApply(mj, btn); $('pfMoji').innerHTML = RV.moji(mj, 104); $('pfEd').innerHTML = RV.mojiEditor(mj);
    });
    $('pfSave').addEventListener('click', async () => {
      const bt = $('pfSave'); RV.busy(bt, true, 'Saving…');
      try { await PUT('/api/app/profile', { name: $('pfName').value.trim(), moji: mj }); await RV.refreshBoot(); RV.busy(bt, false); toast('Profile saved'); }
      catch (e) { RV.busy(bt, false); fail(e); }
    });
    if ($('pwForm')) $('pwForm').addEventListener('submit', async e => {
      e.preventDefault(); const bt = $('pwGo');
      if ($('pwNew').value.length < 8) { toast('Your new password needs at least 8 characters.', 'err'); return; }
      RV.busy(bt, true, 'Updating…');
      try { await PUT('/api/app/password', { current: $('pwCur').value, password: $('pwNew').value }); RV.busy(bt, false); $('pwCur').value = ''; $('pwNew').value = ''; toast('Password updated'); }
      catch (er) { RV.busy(bt, false); fail(er); }
    });
    $('stLogout').addEventListener('click', RV.logout);
    const ex = $('stExport'); if (ex) ex.addEventListener('click', () => {
      RV.modal('<div class="col" style="gap:14px"><strong class="h3">Export your data</strong><p class="muted" style="margin:0">Download every lead plus your Closers’ setup.</p><div class="row" style="gap:8px;flex-wrap:wrap"><button class="btn btn-ink grow" data-exp="csv">Leads as CSV</button><button class="btn btn-ghost grow" data-exp="json">Everything as JSON</button></div></div>', { label: 'Export' });
      RV.qsa('[data-exp]').forEach(x => x.addEventListener('click', () => RV.exportData(x.getAttribute('data-exp'), x)));
    });
    const wf = $('wsForm');
    if (wf) wf.addEventListener('submit', async e => {
      e.preventDefault(); const bt = $('wsGo'); RV.busy(bt, true, 'Saving…');
      try { await PUT('/api/app/workspace', { name: $('wsName').value.trim(), niche: $('wsNiche').value.trim(), timezone: $('wsTz').value }); await RV.refreshBoot(); RV.busy(bt, false); toast('Workspace saved'); }
      catch (er) { RV.busy(bt, false); fail(er); }
    });
    ctx.el.querySelectorAll('[data-alert]').forEach(bt => bt.addEventListener('click', async () => {
      const k = bt.getAttribute('data-alert'); const cur = Object.assign({ handoff: true, night_report: true, hot: true, low_credits: true }, S.boot.workspace.settings.alerts || {});
      cur[k] = !(cur[k] !== false); bt.className = 'toggle ' + (cur[k] ? 'on' : 'off'); bt.setAttribute('aria-pressed', cur[k]);
      try { await PUT('/api/app/workspace', { alerts: cur }); S.boot.workspace.settings.alerts = cur; toast(bt.getAttribute('aria-label') + (cur[k] ? ' on' : ' off')); }
      catch (e) { cur[k] = !cur[k]; bt.className = 'toggle ' + (cur[k] ? 'on' : 'off'); fail(e); }
    }));
  }
  RV.route('settings', { render: settings });
})();
