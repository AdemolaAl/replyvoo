/* Replyvoo marketing site: animations, language switcher, pricing toggle, calculator, FAQ,
   blog filters and forms. The support chat bubble is /widget.js (house mode). Vanilla ES2020, no dependencies. */
(function () {
  'use strict';
  var $ = function (id) { return document.getElementById(id); };
  var $$ = function (sel, root) { return Array.prototype.slice.call((root || document).querySelectorAll(sel)); };
  var esc = function (s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); };
  var fmt = function (n) { return Math.round(n).toLocaleString('en-US'); };
  var reduced = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  var DATA = {};
  try { DATA = JSON.parse(($('rv-data') || {}).textContent || '{}'); } catch (e) { DATA = {}; }
  var store = {
    get: function (k) { try { return window.localStorage.getItem(k); } catch (e) { return null; } },
    set: function (k, v) { try { window.localStorage.setItem(k, v); } catch (e) { /* storage blocked */ } }
  };
  var CHECK_INK = function (s) { return '<svg width="' + s + '" height="' + s + '" viewBox="0 0 24 24" fill="none" stroke="#121110" stroke-width="2.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 12l5 5 9-10"/></svg>'; };
  var visible = function () { return !document.hidden; };
  function every(ms, fn) { return setInterval(function () { if (visible()) fn(); }, ms); }
  function retrigger(el, cls) { cls = cls || 'a-in'; el.classList.remove(cls); void el.offsetWidth; el.classList.add(cls); }
  function countTo(el, to, opts) {
    if (!el) return; opts = opts || {};
    var from = +(el.getAttribute('data-v') || 0), start = performance.now(), dur = reduced ? 1 : (opts.dur || 900), pre = opts.pre || '', suf = opts.suf || '';
    el.setAttribute('data-v', to);
    function step(t) { var k = Math.min(1, (t - start) / dur); var e = 1 - Math.pow(1 - k, 3); el.textContent = pre + fmt(from + (to - from) * e) + suf; if (k < 1) requestAnimationFrame(step); }
    requestAnimationFrame(step);
  }

  /* ---------- toast + API ---------- */
  function toast(msg, isErr) {
    var r = $('toastRoot'); if (!r) return;
    r.innerHTML = '<div class="toast a-pop' + (isErr ? ' err' : '') + '" role="status"><span class="toast-ic">' + (isErr ? '!' : CHECK_INK(13)) + '</span>' + esc(msg) + '</div>';
    clearTimeout(toast.t); toast.t = setTimeout(function () { r.innerHTML = ''; }, 3200);
  }
  function post(url, body) {
    return fetch(url, { method: 'POST', credentials: 'same-origin', headers: { 'content-type': 'application/json', 'x-rv': '1' }, body: JSON.stringify(body || {}) })
      .then(function (r) {
        return r.json().catch(function () { return {}; }).then(function (j) {
          if (!r.ok) { var e = new Error(j.error || 'Something went wrong. Please try again.'); e.status = r.status; throw e; }
          return j;
        });
      }, function () { throw new Error('You seem to be offline. Check your connection and try again.'); });
  }

  /* ---------- header ---------- */
  var hdr = $('hdr');
  function onScroll() { if (hdr && !hdr.dataset.solid) hdr.classList.toggle('scrolled', window.scrollY > 10); }
  if (hdr && hdr.classList.contains('scrolled')) hdr.dataset.solid = '1';
  window.addEventListener('scroll', onScroll, { passive: true }); onScroll();
  var menuBtn = $('menuBtn'), mMenu = $('mMenu');
  function setMenu(open) {
    if (!menuBtn || !mMenu) return;
    mMenu.hidden = !open; menuBtn.setAttribute('aria-expanded', String(open)); menuBtn.setAttribute('aria-label', open ? 'Close menu' : 'Open menu');
    if (hdr) hdr.classList.toggle('menu-open', open);
  }
  if (menuBtn) menuBtn.addEventListener('click', function () { setMenu(mMenu.hidden); });
  if (mMenu) mMenu.addEventListener('click', function (e) { if (e.target.closest('a')) setMenu(false); });
  document.addEventListener('keydown', function (e) { if (e.key === 'Escape') { setMenu(false); closeLang(); } });

  /* ---------- reveal on scroll ---------- */
  if ('IntersectionObserver' in window && !reduced) {
    var io = new IntersectionObserver(function (es) { es.forEach(function (en) { if (en.isIntersecting) { en.target.classList.remove('pre'); io.unobserve(en.target); } }); }, { rootMargin: '0px 0px -8% 0px' });
    $$('.reveal').forEach(function (el) { if (el.getBoundingClientRect().top > window.innerHeight) { el.classList.add('pre'); io.observe(el); } });
  }

  /* ---------- language (homepage hero) ---------- */
  var NAV = {
    en: { nav0: 'Product', nav1: 'Compare', nav2: 'Pricing', nav3: 'Blog', login: 'Log in', ctaShort: 'Start free' },
    fr: { nav0: 'Produit', nav1: 'Comparer', nav2: 'Tarifs', nav3: 'Blog', login: 'Connexion', ctaShort: 'Essai gratuit' },
    pt: { nav0: 'Produto', nav1: 'Comparar', nav2: 'Preços', nav3: 'Blog', login: 'Entrar', ctaShort: 'Começar grátis' },
    es: { nav0: 'Producto', nav1: 'Comparar', nav2: 'Precios', nav3: 'Blog', login: 'Entrar', ctaShort: 'Empezar gratis' },
    sw: { nav0: 'Bidhaa', nav1: 'Linganisha', nav2: 'Bei', nav3: 'Blogu', login: 'Ingia', ctaShort: 'Anza bure' },
    ar: { nav0: 'المنتج', nav1: 'مقارنة', nav2: 'الأسعار', nav3: 'المدونة', login: 'دخول', ctaShort: 'ابدأ مجاناً' }
  };
  var langBtn = $('langBtn'), langMenu = $('langMenu');
  function closeLang() { if (langMenu && !langMenu.hidden) { langMenu.hidden = true; langBtn.setAttribute('aria-expanded', 'false'); } }
  function applyLang(lang) {
    if (!NAV[lang]) lang = 'en';
    var hero = DATA.hero || {};
    var L = Object.assign({}, NAV[lang], hero.en || {}, hero[lang] || {});
    $$('[data-i]').forEach(function (el) { var k = el.getAttribute('data-i'); if (L[k]) el.textContent = L[k]; });
    if ($('langCode')) $('langCode').textContent = lang.toUpperCase();
    document.documentElement.lang = lang;
    var hi = $('heroIn'); if (hi) hi.dir = lang === 'ar' ? 'rtl' : 'ltr';
    $$('.lang-item').forEach(function (b) { var on = b.getAttribute('data-lang') === lang; b.classList.toggle('on', on); b.setAttribute('aria-checked', String(on)); });
  }
  if (langBtn && langMenu) {
    langBtn.addEventListener('click', function (e) { e.stopPropagation(); langMenu.hidden = !langMenu.hidden; langBtn.setAttribute('aria-expanded', String(!langMenu.hidden)); if (!langMenu.hidden) { var on = langMenu.querySelector('.on') || langMenu.querySelector('button'); if (on) on.focus(); } });
    langMenu.addEventListener('click', function (e) {
      var b = e.target.closest('[data-lang]'); if (!b) return;
      var l = b.getAttribute('data-lang'); store.set('rv_lang', l); applyLang(l); closeLang(); langBtn.focus();
      try { var u = new URL(location.href); if (u.searchParams.has('lang')) { if (l === 'en') u.searchParams.delete('lang'); else u.searchParams.set('lang', l); history.replaceState(null, '', u.pathname + u.search + u.hash); } } catch (err) { /* old browser */ }
    });
    document.addEventListener('click', function (e) { if (!e.target.closest('#langMenu') && !e.target.closest('#langBtn')) closeLang(); });
    var saved = store.get('rv_lang');
    if (DATA.langFromQuery) store.set('rv_lang', DATA.lang);
    else if (saved && saved !== (DATA.lang || 'en') && NAV[saved]) applyLang(saved);
    else if (DATA.lang && DATA.lang !== 'en') applyLang(DATA.lang);
  }

  /* ---------- channel pages: chat mock plays bubble by bubble, then loops ---------- */
  $$('[data-chatmock]').forEach(function (cm) {
    if (reduced) return; // static, fully visible conversation
    var items = $$('.cm-b', cm), typing = cm.querySelector('.cm-typing'), i = 0, onScreen = true;
    cm.classList.add('playing');
    if ('IntersectionObserver' in window) new IntersectionObserver(function (es) { onScreen = es[0].isIntersecting; }).observe(cm);
    function reset() { items.forEach(function (b) { b.classList.remove('show'); }); i = 0; }
    function step() {
      if (!onScreen || !visible()) return setTimeout(step, 800);
      if (i >= items.length) { setTimeout(function () { reset(); step(); }, 3200); return; }
      var b = items[i], ai = !b.classList.contains('bub-in') && !b.classList.contains('cm-story');
      if (ai && typing) {
        cm.appendChild(typing); typing.classList.add('show');
        setTimeout(function () { typing.classList.remove('show'); b.classList.add('show'); i++; setTimeout(step, 1100); }, 900);
      } else { b.classList.add('show'); i++; setTimeout(step, 1300); }
    }
    step();
  });

  /* ---------- homepage: live counter + hero notes ---------- */
  var liveEl = $('liveReplies');
  if (liveEl) {
    var live = +DATA.liveStart || 0;
    liveEl.setAttribute('data-v', Math.max(0, live - 400));
    countTo(liveEl, live, { dur: 1600 });
    every(1400, function () { live += 1 + Math.floor(Math.random() * 4); liveEl.innerHTML = '<span class="counter-roll"><span>' + fmt(live) + '</span></span>'; });
  }
  var noteA = $('noteA'), noteB = $('noteB');
  if (noteA && noteB && !reduced) {
    var notesA = [['MS', 'Mia got a reply in 2s', 'Asked for the price · Accra', '#FFF3CC'], ['KA', 'Kojo’s voice note answered', 'Replied in English · 3s', '#E3ECFF'], ['WN', 'Wanjiru marked Hot', 'Asked for the link twice', '#FFE3D6'], ['FD', 'Fatou got her answer', 'Replied in French · 2s', '#E8F6EC']];
    var notesB = [['$', 'New order $64', 'Paid by card · Glow Lab'], ['✓', 'Receipt checked', 'Bank transfer · $120'], ['→', 'Handed to Sarah', 'Asked about a refund'], ['★', '12 hot leads today', 'Juno sorted your inbox']];
    var noteI = 1;
    every(3600, function () {
      var a = notesA[noteI % 4], b = notesB[noteI % 4];
      noteA.innerHTML = '<span class="av" style="background:' + a[3] + '">' + a[0] + '</span><span class="note-t"><strong>' + a[1] + '</strong><span>' + a[2] + '</span></span>';
      noteB.innerHTML = '<span class="note-ic">' + b[0] + '</span><span class="note-t"><strong>' + b[1] + '</strong><span>' + b[2] + '</span></span>';
      retrigger(noteA); setTimeout(function () { retrigger(noteB); }, 450); noteI++;
    });
  }

  /* ---------- leak timer + manual vs automatic ---------- */
  var leakEl = $('leakTimer');
  if (leakEl) {
    var leak = 3 * 3600 + 12 * 60 + 8;
    every(1000, function () { leak++; var h = Math.floor(leak / 3600), m = Math.floor(leak % 3600 / 60), s = leak % 60; leakEl.textContent = String(h).padStart(2, '0') + ':' + String(m).padStart(2, '0') + ':' + String(s).padStart(2, '0'); });
  }
  if ($('manualUnread')) {
    var mUnread = 47, mWait = 2 * 60 + 41;
    every(1600, function () { mUnread += Math.random() > 0.4 ? 1 : 0; mWait++; $('manualUnread').textContent = mUnread; $('manualWait').textContent = Math.floor(mWait / 60) + 'h ' + (mWait % 60) + 'm'; });
  }
  var vsFeed = $('vsFeed');
  if (vsFeed) {
    var vsMsgs = ['Order #GL-2291 confirmed', 'Price sent in 2s', 'Voice note answered', 'Receipt checked · $64', 'Replied in French', 'Hot lead → Sarah', 'Delivery date sent', 'Bundle upsell accepted'];
    var vsI = 0;
    var vsTick = function () {
      vsFeed.insertAdjacentHTML('afterbegin', '<div class="a-slide"><span class="ok">' + CHECK_INK(12) + '</span>' + vsMsgs[vsI % vsMsgs.length] + '</div>');
      while (vsFeed.children.length > 5) vsFeed.removeChild(vsFeed.lastChild); vsI++;
    };
    vsTick(); vsTick(); vsTick(); if (!reduced) every(1800, vsTick);
  }

  /* ---------- savings calculator ---------- */
  if ($('cStaff')) {
    var plans = (DATA.plans || []).slice().sort(function (a, b) { return a.m - b.m; });
    var calc = function () {
      var st = +$('cStaff').value, sal = +$('cSal').value, ch = +$('cChats').value;
      [['cStaff', 1, 20], ['cSal', 100, 2500], ['cChats', 20, 3000]].forEach(function (x) { var el = $(x[0]); el.style.setProperty('--p', ((el.value - x[1]) / (x[2] - x[1]) * 100) + '%'); });
      $('cStaffV').textContent = st; $('cSalV').textContent = '$' + fmt(sal); $('cChatsV').textContent = fmt(ch);
      var now = st * sal, conv = ch * 30;
      if (!plans.length) return;
      var best = null;
      plans.forEach(function (p) {
        var extra = Math.max(0, conv - p.conv);
        if (extra > 0 && !(p.extra > 0)) return;
        var cost = p.m + extra * (p.extra || 0);
        if (!best || cost < best.cost) best = { p: p, cost: cost, extra: extra };
      });
      if (!best) { var top = plans[plans.length - 1]; best = { p: top, cost: top.m + Math.max(0, conv - top.conv) * (top.extra || 0), extra: Math.max(0, conv - top.conv) }; }
      var keep = st > 1 ? sal : 0, newCost = best.cost + keep, save = Math.max(0, now - newCost);
      countTo($('cSave'), save, { pre: '$', dur: 500 }); $('cNow').textContent = '$' + fmt(now); $('cNew').textContent = '$' + fmt(newCost);
      $('cPlan').textContent = best.p.name + ' · $' + fmt(best.p.m) + '/mo' + (best.extra > 0 ? ' + extra chats' : '');
    };
    ['cStaff', 'cSal', 'cChats'].forEach(function (id) { $(id).addEventListener('input', calc); });
    calc();
  }

  /* ---------- how it works: plays like a video while on screen ---------- */
  var demo = $('demoChat');
  if (demo) {
    var wave = [10, 18, 13, 20, 9, 16, 12].map(function (h) { return '<span style="width:4px;height:' + h + 'px;background:#121110;border-radius:3px"></span>'; }).join('');
    var chatSteps = [
      [1, '<div class="a-in" style="align-self:flex-start;display:flex;align-items:center;gap:8px;background:#FFFFFF;padding:9px 12px;border-radius:18px 18px 18px 5px;box-shadow:0 1px 2px rgba(0,0,0,.06)"><span style="width:28px;height:28px;border-radius:50%;background:#121110;display:flex;align-items:center;justify-content:center"><svg width="11" height="11" viewBox="0 0 24 24" fill="#FFC21A"><path d="M7 4v16l13-8z"/></svg></span><span style="display:flex;align-items:center;gap:3px;height:22px">' + wave + '</span><span style="font-size:11px;color:var(--mut2)">0:07</span></div>'],
      [3, '<div class="bub-out a-in">Yes! The Vitamin C Glow Serum is $48 and in stock. Want it delivered today?</div>'],
      [4, '<div class="bub-in a-in">Yes please</div>'],
      [5, '<div class="bub-out a-in">Add the Gentle Cleanser and get both for $64 (save $12). Bundle it?</div>'],
      [6, '<div class="bub-in a-in">Bundle it 🙌</div>'],
      [7, '<div class="a-in" style="align-self:flex-end;max-width:86%;display:flex;flex-direction:column;gap:6px"><div class="bub-out" style="max-width:none">Here’s your link. Send the receipt when you’re done.</div><div style="background:#121110;color:#FFC21A;padding:9px 13px;border-radius:12px;font-size:13px;font-weight:800;text-align:center">Pay $64 →</div></div>'],
      [9, '<div class="a-in" style="align-self:flex-start;width:62%;background:#FFFFFF;border-radius:14px;padding:7px;box-shadow:0 1px 2px rgba(0,0,0,.06)"><div style="height:60px;border-radius:9px;background:repeating-linear-gradient(135deg,#F2F0EA 0 8px,#E7E3D8 8px 16px);display:flex;align-items:center;justify-content:center;font-size:11.5px;font-weight:800;color:var(--mut)">Receipt · $64.00</div></div>'],
      [10, '<div class="bub-out a-in">Paid ✓ Order #GL-2291 ships today. Thank you, Daniel!</div>']
    ];
    var fieldData = [['Wants', 'Vitamin C serum', 2], ['Budget', '~$50', 3], ['Order', 'Bundle · $64', 6], ['Paid', '$64.00', 10]];
    var beats = $$('#beats .beat');
    var howT = 0, shown = -1, howOn = false;
    var renderHow = function () {
      var d = howT % 17;
      if (d === 0) { demo.innerHTML = ''; shown = -1; if ($('leadMeta')) $('leadMeta').innerHTML = ''; }
      chatSteps.forEach(function (c, i) { if (d >= c[0] && i > shown) { demo.insertAdjacentHTML('beforeend', c[1]); shown = i; } });
      while (demo.children.length > 6) demo.removeChild(demo.firstChild);
      var typ = $('demoTyping');
      if ((d === 2 || d === 8) && !typ) demo.insertAdjacentHTML('beforeend', '<div id="demoTyping" class="a-in" style="align-self:flex-end;background:#FFFFFF;padding:11px 14px;border-radius:18px 18px 5px 18px;display:flex;gap:5px"><span class="dot"></span><span class="dot"></span><span class="dot"></span></div>');
      if (d !== 2 && d !== 8 && typ) typ.remove();
      var active = 0; beats.forEach(function (b, i) { if (d >= +b.getAttribute('data-t')) active = i; });
      beats.forEach(function (b, i) { var t = +b.getAttribute('data-t'); b.className = 'beat' + (i === active ? ' on' : (d >= t ? ' done' : '')); });
      if ($('leadFields')) $('leadFields').innerHTML = fieldData.map(function (f) { var on = d >= f[2]; return '<div><span>' + f[0] + '</span><strong style="color:' + (on ? '#121110' : '#CFC9BB') + '">' + (on ? f[1] : '…') + '</strong></div>'; }).join('');
      var heat = d >= 10 ? ['Won', '#121110', '#FFC21A'] : d >= 5 ? ['Hot 🔥', '#FFE3D6', '#9A3412'] : d >= 3 ? ['Warm', '#FFF3CC', '#7A5800'] : ['Cold', '#F2F0EA', '#5E5A50'];
      var he = $('heat'); if (he) { he.textContent = heat[0]; he.style.background = heat[1]; he.style.color = heat[2]; }
      var st = $('leadStage'); if (st) { st.textContent = d >= 10 ? 'Stage: Won' : d >= 7 ? 'Stage: Checkout' : d >= 3 ? 'Stage: Qualified' : 'Stage: New'; st.style.background = d >= 10 ? '#FFC21A' : '#F2F0EA'; }
      if (d === 11 && $('leadMeta')) $('leadMeta').innerHTML = '<div class="a-in" style="background:#121110;color:#FFFFFF;border-radius:16px;padding:12px 14px;font-size:13px;font-weight:700;display:flex;align-items:center;gap:10px"><span style="width:10px;height:10px;border-radius:50%;background:#6D5BFF;flex:0 0 10px"></span>Purchase sent to your ad platform via Joinvoo Sync</div>';
      howT++;
    };
    if (reduced) { howT = 11; renderHow(); }
    else {
      renderHow();
      if ('IntersectionObserver' in window) new IntersectionObserver(function (es) { howOn = es[0].isIntersecting; }, { threshold: 0.15 }).observe($('how'));
      else howOn = true;
      every(1250, function () { if (howOn) renderHow(); });
    }
  }

  /* ---------- Juno chips ---------- */
  var junoAns = $('junoAns');
  if (junoAns) {
    $$('[data-juno]').forEach(function (b) {
      b.addEventListener('click', function () {
        $$('[data-juno]').forEach(function (x) { x.classList.toggle('on', x === b); x.setAttribute('aria-pressed', String(x === b)); });
        junoAns.textContent = b.getAttribute('data-juno'); retrigger(junoAns);
      });
    });
  }

  /* ---------- wallet promo ---------- */
  var promo = $('promoBal');
  if (promo && !reduced) { var bal = 2400; promo.setAttribute('data-v', bal); every(4200, function () { bal += 2200; if (bal > 12000) bal = 2400; countTo(promo, bal, { dur: 1200 }); }); }

  /* ---------- pricing toggle ---------- */
  $$('.seg [data-bill]').forEach(function (btn) {
    btn.addEventListener('click', function () {
      var y = btn.getAttribute('data-bill') === 'y';
      $$('.seg [data-bill]').forEach(function (b) { var on = (b.getAttribute('data-bill') === 'y') === y; b.classList.toggle('on', on); b.setAttribute('aria-pressed', String(on)); });
      $$('.pnum,.pold,.pper').forEach(function (el) { var v = el.getAttribute(y ? 'data-y' : 'data-m'); if (v != null) { el.textContent = v; if (el.classList.contains('pnum') && !reduced) retrigger(el, 'a-pop'); } });
      $$('a[data-signup]').forEach(function (a) { var base = a.getAttribute('data-base'); a.href = y ? base + '&interval=year' : base; });
    });
  });

  /* ---------- FAQ accordions ---------- */
  document.addEventListener('click', function (e) {
    var q = e.target.closest('.faq-q'); if (!q) return;
    var item = q.closest('.faq'), list = q.closest('.faq-list');
    var open = q.getAttribute('aria-expanded') !== 'true';
    if (list) $$('.faq', list).forEach(function (f) { if (f !== item) { f.classList.remove('open'); var b = f.querySelector('.faq-q'); b.setAttribute('aria-expanded', 'false'); f.querySelector('.faq-a').hidden = true; } });
    item.classList.toggle('open', open); q.setAttribute('aria-expanded', String(open)); item.querySelector('.faq-a').hidden = !open;
  });

  /* ---------- channel waitlist ---------- */
  document.addEventListener('click', function (e) {
    var b = e.target.closest('.wl-btn'); if (!b) return;
    var name = b.getAttribute('data-wl');
    var id = 'wl' + name.replace(/\W/g, '');
    b.outerHTML = '<form class="wl-form" data-wl-name="' + esc(name) + '"><label class="sr" for="' + id + '">Email for the ' + esc(name) + ' waitlist</label><input id="' + id + '" class="input" type="email" required placeholder="you@business.com" autocomplete="email"><button class="btn btn-ink btn-sm" type="submit">Notify me</button></form>';
    var inp = $(id); if (inp) inp.focus();
  });
  document.addEventListener('submit', function (e) {
    var f = e.target;
    if (f.classList && f.classList.contains('wl-form')) {
      e.preventDefault();
      var name = f.getAttribute('data-wl-name'), email = f.querySelector('input').value.trim(), btn = f.querySelector('button');
      btn.disabled = true;
      post('/api/public/waitlist', { email: email, item: f.getAttribute('data-wl-item') || name.toLowerCase().replace(/[^a-z0-9_-]/g, '') })
        .then(function () { f.outerHTML = '<p class="wl-ok">' + CHECK_INK(16) + 'You’re on the ' + esc(name) + ' list.</p>'; })
        .catch(function (err) { btn.disabled = false; toast(err.message, true); });
      return;
    }
    if (f.id === 'nlForm') {
      e.preventDefault();
      var nb = f.querySelector('button'); nb.disabled = true;
      post('/api/public/newsletter', { email: $('nlIn').value.trim() })
        .then(function () { f.outerHTML = '<p class="nl-ok">You’re in. The first playbook lands this week.</p>'; })
        .catch(function (err) { nb.disabled = false; toast(err.message, true); });
    }
  });

  /* ---------- blog filters ---------- */
  var cats = $('blogCats');
  if (cats) {
    cats.addEventListener('click', function (e) {
      var b = e.target.closest('[data-cat-btn]'); if (!b) return;
      var c = b.getAttribute('data-cat-btn'), n = 0;
      $$('[data-cat-btn]', cats).forEach(function (x) { x.classList.toggle('on', x === b); x.setAttribute('aria-pressed', String(x === b)); });
      $$('#postGrid .post-card').forEach(function (p) { var show = c === 'All' || p.getAttribute('data-cat') === c; p.hidden = !show; if (show) n++; });
      $('noPosts').hidden = n > 0;
    });
  }

  /* ---------- copy link + TOC highlight ---------- */
  document.addEventListener('click', function (e) {
    var c = e.target.closest('[data-copy]'); if (!c) return;
    var url = c.getAttribute('data-copy');
    var done = function () { toast('Link copied'); };
    if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(url).then(done, function () { window.prompt('Copy this link', url); });
    else window.prompt('Copy this link', url);
  });
  var tocLinks = $$('.toc a');
  if (tocLinks.length && 'IntersectionObserver' in window) {
    var map = {};
    tocLinks.forEach(function (a) { map[decodeURIComponent(a.getAttribute('href').slice(1))] = a; });
    var tio = new IntersectionObserver(function (es) {
      es.forEach(function (en) { if (en.isIntersecting && map[en.target.id]) { tocLinks.forEach(function (a) { a.classList.remove('on'); }); map[en.target.id].classList.add('on'); } });
    }, { rootMargin: '-80px 0px -70% 0px' });
    Object.keys(map).forEach(function (id) { var h = document.getElementById(id); if (h) tio.observe(h); });
  }

  /* ---------- contact form ---------- */
  var cf = $('contactForm');
  if (cf) {
    var src = cf.querySelector('input[name=source]');
    $$('[data-topic]', cf).forEach(function (b) {
      b.addEventListener('click', function () {
        $$('[data-topic]', cf).forEach(function (x) { x.classList.toggle('on', x === b); x.setAttribute('aria-pressed', String(x === b)); });
        src.value = b.getAttribute('data-topic') === 'sales' ? 'sales' : 'contact';
      });
    });
    cf.addEventListener('submit', function (e) {
      e.preventDefault();
      var err = $('cErr'), btn = cf.querySelector('button[type=submit]');
      var email = $('cEmail').value.trim(), msg = $('cMsg').value.trim(), plan = $('cPlan') ? $('cPlan').value : '';
      err.hidden = true;
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) { err.textContent = 'Please enter a valid email so we can reply.'; err.hidden = false; $('cEmail').focus(); return; }
      if (msg.length < 2) { err.textContent = 'Please write a short message.'; err.hidden = false; $('cMsg').focus(); return; }
      btn.disabled = true;
      post('/api/public/contact', { name: $('cName').value.trim(), email: email, source: src.value, message: (plan ? '[Plan: ' + plan + '] ' : '') + msg })
        .then(function () {
          cf.innerHTML = '<div class="sent a-in"><span class="sent-ic">' + CHECK_INK(30) + '</span><h2 class="h3">Message sent.</h2><p class="muted" style="margin:0">Thanks! We’ll reply to <strong>' + esc(email) + '</strong> soon, usually within a few hours.</p><a class="btn btn-ink" href="/">Back to home</a></div>';
        })
        .catch(function (x) { btn.disabled = false; err.textContent = x.message; err.hidden = false; });
    });
  }

  /* ---------- website chat demo scenes (/js/scene.js) ---------- */
  function scenes() { if (!window.RVScene) return false; $$('[data-scene]').forEach(function (el) { window.RVScene.mount(el); }); return true; }
  if (!scenes()) window.addEventListener('load', scenes);
  /* ---------- Agent Studio training demo (/js/train-scene.js), loops while visible ---------- */
  function trains() { if (!window.RVTrain) return false; $$('[data-train]').forEach(function (el) { window.RVTrain.demo(el, { loop: true, controls: false, focusEnd: false }); }); return true; }
  if (!trains()) window.addEventListener('load', trains);

  /* ---------- live support chat: the same /widget.js customers install, in "house" mode ---------- */
  // "Chat with Juno" buttons open it; without the widget (switched off or blocked) they go to /contact.
  document.addEventListener('click', function (e) {
    var b = e.target.closest('[data-open-chat]'); if (!b) return;
    e.preventDefault();
    if (DATA.chat && window.Replyvoo && window.Replyvoo.open) window.Replyvoo.open(); else location.href = '/contact';
  });
})();

/* ---------- video lightbox ([data-video]) ---------- */
(function () {
  document.addEventListener('click', function (e) {
    var b = e.target.closest && e.target.closest('[data-video]'); if (!b) return;
    e.preventDefault();
    var ov = document.createElement('div');
    ov.setAttribute('role', 'dialog'); ov.setAttribute('aria-modal', 'true'); ov.setAttribute('aria-label', 'Video');
    ov.style.cssText = 'position:fixed;inset:0;z-index:9999;background:rgba(18,17,16,.82);display:flex;align-items:center;justify-content:center;padding:16px';
    var box = document.createElement('div'); box.style.cssText = 'position:relative;width:100%;max-width:1100px';
    var v = document.createElement('video');
    var src = b.getAttribute('data-video'); [['webm', 'video/webm'], ['mp4', 'video/mp4']].forEach(function (f) { var so = document.createElement('source'); so.src = src.replace(/\.mp4$/, '.' + f[0]); so.type = f[1]; v.appendChild(so); }); v.poster = b.getAttribute('data-poster') || ''; v.controls = true; v.autoplay = true; v.playsInline = true;
    v.style.cssText = 'width:100%;border-radius:18px;background:#121110;box-shadow:0 40px 80px -30px rgba(0,0,0,.6)';
    var x = document.createElement('button'); x.type = 'button'; x.setAttribute('aria-label', 'Close video'); x.textContent = '✕';
    x.style.cssText = 'position:absolute;top:-46px;right:0;width:38px;height:38px;border-radius:50%;border:0;background:#FFC21A;color:#121110;font:800 16px system-ui;cursor:pointer';
    box.appendChild(x); box.appendChild(v); ov.appendChild(box); document.body.appendChild(ov);
    var close = function () { v.pause(); ov.remove(); document.removeEventListener('keydown', key); b.focus(); };
    var key = function (ev) { if (ev.key === 'Escape') close(); };
    x.addEventListener('click', close); ov.addEventListener('click', function (ev) { if (ev.target === ov) close(); });
    document.addEventListener('keydown', key); x.focus();
  });
})();
