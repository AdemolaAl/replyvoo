'use strict';
// Homepage. Every section reads live settings / DB data passed in `d`; JS in /js/site.js only animates.
const A = require('./art');
const P = require('./parts');
const { esc } = A;

const it = t => '<span class="it hl">' + t + '</span>';
const andList = l => l.length > 1 ? l.slice(0, -1).join(', ') + ' and ' + l[l.length - 1] : l.join('');

function heroSec(ctx, d) {
  const all = ctx.s.site.hero || {};
  const en = all.en || {};
  const h = Object.assign({}, en, all[ctx.lang] || {});
  const checks = [d.freeConv ? d.freeConv + ' free chats a month' : 'Start free', 'Live in 5 minutes', 'No code, no contracts'];
  return '<section class="hero" id="top">' +
    '<div class="mesh a-mesh" style="width:620px;height:620px;right:-140px;top:-120px;background:#FFE58A"></div>' +
    '<div class="mesh a-mesh2" style="width:460px;height:460px;left:-160px;top:220px;background:#FFF1C2"></div><div class="grid-bg"></div>' +
    '<div class="wrap hero-in" id="heroIn"' + (ctx.lang === 'ar' ? ' dir="rtl"' : '') + '>' +
    '<div class="hero-copy">' +
    (ctx.ref ? '<a class="ref-pill a-pop" href="' + ctx.signupUrl + '">' + A.ic('star', '#121110', 16) + '<span>You were invited — get ' + (d.bonus ? P.fmt(d.bonus) + ' ' : '') + 'bonus credits</span></a>' : '') +
    '<div class="glass live-badge"><span class="live-n"><span class="a-pulse live-dot"></span><span class="tnum" id="liveReplies">' + P.fmt(ctx.s.site.live_counter_start) + '</span></span><span data-i="badge">' + esc(h.badge) + '</span></div>' +
    '<h1 class="h1"><span data-i="h1a">' + esc(h.h1a) + '</span><br><span class="it hl hero-it" data-i="h1b">' + esc(h.h1b) + '</span></h1>' +
    '<p class="lead hero-sub" data-i="sub">' + esc(h.sub) + '</p>' +
    '<div class="hero-ctas"><a class="btn btn-main" href="' + ctx.signupUrl + '"><span data-i="cta">' + esc(h.cta) + '</span><span class="arr">' + A.ARROW + '</span></a>' +
    '<a class="btn btn-ghost btn-play" href="#how"><span class="play">' + '<svg width="12" height="12" viewBox="0 0 24 24" fill="#121110" aria-hidden="true"><path d="M7 4v16l13-8z"/></svg></span><span data-i="cta2">' + esc(h.cta2) + '</span></a></div>' +
    '<div class="hero-checks">' + checks.map(t => '<span>' + A.CHECK + esc(t) + '</span>').join('') + '</div>' + heroChannels(d) + '</div>' +
    '<div class="hero-art"><div class="scene">' +
    '<div class="orbit a-orbit" aria-hidden="true">' +
    '<span class="orb a-orbitb" style="left:50%;top:-22px;margin-left:-22px;background:var(--sky)"><svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#FFFFFF" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="' + A.I.send + '"/></svg></span>' +
    '<span class="orb a-orbitb" style="right:-22px;top:50%;margin-top:-22px;background:#FFFFFF">' + A.ic('mic', '#121110', 20) + '</span>' +
    '<span class="orb a-orbitb" style="left:-22px;top:50%;margin-top:-22px;background:#FFFFFF"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#121110" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="5" width="18" height="14" rx="2"/><path d="M3 15l5-5 4 4 3-3 6 6"/></svg></span>' +
    '<span class="orb a-orbitb" style="left:50%;bottom:-22px;margin-left:-22px;background:var(--ink);color:var(--jade);font-weight:800">$</span></div>' +
    A.heroScene() +
    '<div class="note note-a hide-sm"><div class="a-float"><div id="noteA" class="note-card glass"><span class="av" style="background:#FFF3CC">MS</span><span class="note-t"><strong>Mia got a reply in 2s</strong><span>Asked for the price · Accra</span></span></div></div></div>' +
    '<div class="note note-b hide-sm"><div class="a-float2"><div id="noteB" class="note-card note-dark"><span class="note-ic">$</span><span class="note-t"><strong>New order $64</strong><span>Paid by card · Glow Lab</span></span></div></div></div>' +
    '</div></div></div></section>';
}

// Small strip under the hero CTAs: which chat apps are live / coming, straight from the flags.
function heroChannels(d) {
  const ch = (d.channels || []).filter(c => c.id !== 'messenger');
  if (!ch.length) return '';
  const live = ch.filter(c => c.status === 'live'), soon = ch.filter(c => c.status === 'soon');
  const names = l => l.map(c => c.name).join(l.length > 2 ? ', ' : ' and ').replace(/, ([^,]+)$/, ' and $1');
  return '<div class="hero-ch"><span class="hero-ch-ics">' + ch.map(c => '<a href="/' + esc(c.slug) + '" class="hero-ch-i' + (c.status === 'live' ? ' on' : '') + '" title="' + esc(c.name) + (c.status === 'live' ? ' (live)' : ' (coming soon)') + '">' + A.brandIcon(c.id, 30) + '<span class="sr">' + esc(c.name) + ' AI agent</span></a>').join('') + '</span>' +
    '<span class="hero-ch-t">' + (live.length ? '<strong>Live on ' + esc(names(live)) + '</strong>' : '') + (soon.length ? (live.length ? ' · ' : '') + esc(names(soon)) + ' coming soon' : '') + '</span></div>';
}

function marquee() {
  const strip = ['e-commerce stores', 'coaching and courses', 'trading academies', 'real estate', 'iGaming', 'crypto communities', 'beauty and fashion', 'agencies', 'events and tickets', 'local services'];
  const star = '<svg width="18" height="18" viewBox="0 0 24 24" fill="#FFC21A" stroke="#121110" stroke-width="1.6" aria-hidden="true"><path d="' + A.I.star + '"/></svg>';
  const row = (hidden) => strip.map(s => '<span class="marq-i"' + (hidden ? ' aria-hidden="true"' : '') + '>' + star + 'Built for ' + s + '</span>').join('');
  return '<section class="marq-wrap" id="product" aria-label="Who Replyvoo is for"><div class="a-marq marq">' + row(false) + row(true) + '</div></section>';
}

function leak() {
  return '<section class="wrap sec" id="leak"><div class="sec-head">' +
    '<div class="sec-head-l reveal"><span class="eyebrow">The leak</span><h2 class="h2">You\'re killing conversions with ' + it('delayed replies.') + '</h2></div>' +
    '<p class="lead reveal" style="max-width:420px">Every lead you pay for has a short attention span. Answer in hours and they\'re gone. Answer in seconds and they buy.</p></div>' +
    '<div class="leak-grid">' +
    '<div class="card lift reveal leak-c"><span class="pill pill-bad">Reply after 3 hours</span><b class="tnum big" id="leakTimer">03:12:08</b><span class="muted">The lead already bought from someone who answered first.</span></div>' +
    '<div class="card lift reveal leak-c"><span class="pill pill-warn">Reply after 30 minutes</span><b class="tnum big">00:30:00</b><span class="muted">They\'re comparing you with three other tabs. Maybe.</span></div>' +
    '<div class="reveal leak-c leak-dark"><div class="mesh a-mesh" style="width:260px;height:260px;right:-80px;top:-80px;background:#FFC21A;opacity:.4"></div><span class="pill pill-jade rel">Replyvoo Closer</span><b class="tnum big rel" style="color:var(--jade)">00:00:02</b><span class="rel" style="color:#C4BFB3">Answered, qualified and sent the payment link. While you slept.</span></div>' +
    '</div></section>';
}

function compare(ctx, d) {
  return '<section id="compare" class="band"><div class="wrap sec">' +
    '<div class="center reveal"><span class="eyebrow">Manual vs automatic</span><h2 class="h2" style="max-width:900px">Stop spending heavy money on staff when ' + it('an agent can do it.') + '</h2><p class="lead" style="max-width:620px">Your team types the same 20 replies all day. A Closer does it instantly, in your customer\'s language, for a fraction of the cost.</p></div>' +
    '<div class="vs">' +
    '<div class="vs-card reveal" style="background:#FFFFFF;border:1.5px solid var(--line)"><div class="vs-top"><strong>Chatting manually</strong><span class="pill pill-bad"><span id="manualUnread" class="tnum">47</span>&nbsp;unread</span></div>' + A.stressedStaff() +
    '<div class="two"><div class="stat-s"><span>Oldest waiting</span><b class="tnum" id="manualWait">2h 41m</b></div><div class="stat-s"><span>Monthly staff cost</span><b>$1,800+</b></div></div></div>' +
    '<div class="vs-card reveal" style="background:var(--ink);color:#FFFFFF"><div class="mesh a-mesh2" style="width:340px;height:340px;right:-100px;top:-120px;background:#FFC21A;opacity:.35"></div>' +
    '<div class="vs-top rel"><strong>With a Replyvoo Closer</strong><span class="pill pill-jade">0 unread</span></div>' +
    '<div class="vs-live rel"><div class="vs-bot">' + A.closerBot('#FFC21A', 120, 'A') + '</div><div id="vsFeed" class="vs-feed" aria-hidden="true"></div></div>' +
    '<div class="two rel"><div class="stat-d"><span>Oldest waiting</span><b>2 seconds</b></div><div class="stat-d"><span>Monthly cost</span><b>from ' + (d.minPrice > 0 ? P.money(d.minPrice) : '$0') + '</b></div></div></div>' +
    '</div>' +
    '<div class="card reveal vs-table" role="table" aria-label="Manual team vs Replyvoo Closers"><div class="vs-row vs-head" role="row"><div role="columnheader">What you get</div><div role="columnheader">Manual team</div><div role="columnheader" class="good-h">Replyvoo Closers</div></div>' +
    d.vsRows.map(r => '<div class="vs-row" role="row"><div role="cell" style="font-weight:700">' + esc(r[0]) + '</div><div role="cell" class="bad">✕ ' + esc(r[1]) + '</div><div role="cell" class="good">✓ ' + esc(r[2]) + '</div></div>').join('') +
    '</div></div></section>';
}

function calc(ctx) {
  const slider = (id, label, min, max, step, val, shown) => '<div class="range-row"><div class="top"><label for="' + id + '">' + label + '</label><span class="tnum" id="' + id + 'V">' + shown + '</span></div><input class="slider" id="' + id + '" type="range" min="' + min + '" max="' + max + '" step="' + step + '" value="' + val + '"></div>';
  return '<section class="wrap sec" id="calc"><div class="calc">' +
    '<div class="calc-l reveal"><span class="eyebrow">Savings calculator</span><h2 class="h2">See what ' + it('automation') + ' puts back in your pocket.</h2>' +
    '<p class="lead">Move the sliders. We keep one person on your team for the chats that need a human, and let Closers handle the rest.</p>' +
    '<div class="card calc-card">' + slider('cStaff', 'Support staff', 1, 20, 1, 4, '4') + slider('cSal', 'Monthly pay per person (USD)', 100, 2500, 50, 450, '$450') + slider('cChats', 'New chats per day', 20, 3000, 10, 150, '150') + '</div></div>' +
    '<div class="calc-r reveal" aria-live="polite"><div class="mesh a-mesh" style="width:360px;height:360px;right:-120px;bottom:-140px;background:#FFC21A;opacity:.35"></div>' +
    '<span class="rel calc-k">You could save every month</span><b class="tnum rel calc-big" id="cSave">$0</b>' +
    '<div class="two rel"><div class="stat-d"><span>Today you spend</span><b class="tnum" id="cNow">$1,800</b></div><div class="stat-d"><span>With Replyvoo</span><b class="tnum" id="cNew">–</b></div></div>' +
    '<div class="stat-d rel calc-plan"><span>Recommended plan</span><b id="cPlan" style="color:var(--jade)">–</b></div>' +
    '<span class="rel calc-note">Estimate. Counts one conversation per new chat and keeps one team member for handoffs.</span>' +
    '<a class="btn btn-jade rel" href="' + ctx.signupUrl + '" style="align-self:flex-start">Start saving today</a></div></div></section>';
}

const BEATS = [
  ['Hears the voice note', 'Daniel asks about the Vitamin C serum in a voice note. The Closer turns it into text and gets what he wants.', 1],
  ['Answers from your catalog', 'Price, stock and delivery come straight from your product list. No guessing.', 3],
  ['Upsells like a pro', 'It offers the matching cleanser as a bundle. He says yes.', 5],
  ['Sends the payment link', 'One tap to pay. The Closer tells him exactly what happens next.', 7],
  ['Reads the receipt', 'He sends a screenshot. The Closer reads the amount and flags the order as paid.', 9],
  ['Scores and syncs', 'HeatScore marks him Won, and Joinvoo Sync tells your ads who actually paid.', 11]
];
function how() {
  return '<section id="how" class="band"><div class="wrap sec">' +
    '<div class="center reveal"><span class="eyebrow">How it works</span><h2 class="h2" style="max-width:860px">Watch a Closer turn a ' + it('"how much?"') + ' into a paid order</h2><p class="lead" style="max-width:600px">It plays like a video. Each step lights up as the Closer does it on the phone.</p></div>' +
    '<div class="how">' +
    '<ol id="beats" class="beats">' + BEATS.map((b, i) => '<li class="beat' + (i === 0 ? ' on' : '') + '" data-t="' + b[2] + '"><span class="beat-n">' + (i + 1) + '</span><span class="beat-t"><strong>' + b[0] + '</strong><span>' + b[1] + '</span></span></li>').join('') + '</ol>' +
    '<div class="how-r"><div class="phone" role="img" aria-label="A Telegram chat where a Closer sells a skincare bundle"><div class="phone-screen">' +
    '<div class="phone-top"><span class="av" style="background:var(--jade);width:38px;height:38px;flex-basis:38px">GL</span><span class="phone-who"><strong>Glow Lab Store</strong><span>Closer · replies instantly</span></span></div>' +
    '<div id="demoChat" class="demo-chat"></div></div></div>' +
    '<div class="hide-sm heat-col"><div class="card heat-card"><span class="tiny-k">HeatScore card</span>' +
    '<div class="heat-who"><span class="av" style="background:var(--mint)">DM</span><strong>Daniel M.</strong><span id="heat" class="pill" style="margin-left:auto;background:var(--soft)">Cold</span></div>' +
    '<div id="leadFields" class="lead-fields"></div><span id="leadStage" class="lead-stage">Stage: New</span></div><div id="leadMeta"></div></div>' +
    '</div></div></div></section>';
}

const MORE = { website: 'AI chatbot for website', whatsapp: 'WhatsApp AI chatbot', instagram: 'Instagram DM automation', tiktok: 'TikTok DM automation', messenger: 'Messenger AI chatbot' };
function channels(ctx, d) {
  if (!d.channels.length) return '';
  const tg = d.channels.find(c => c.id === 'telegram');
  const others = d.channels.filter(c => c.id !== 'telegram');
  const fl = ctx.s.flags.channels;
  const tgModes = [['telegram_bot', 'Bots'], ['telegram_group', 'Groups'], ['telegram_business', 'Personal account']].filter(m => fl[m[0]] === 'live');
  const hNames = d.channels.filter(c => c.id !== 'messenger' && c.id !== 'website').map(c => c.name);
  const hList = hNames.length > 1 ? hNames.slice(0, -1).join(', ') + ' and ' + hNames[hNames.length - 1] : hNames.join('');
  const liveN = d.channels.filter(c => c.status === 'live').map(c => c.name);
  const soonN = d.channels.filter(c => c.status === 'soon').map(c => c.name);
  let html = '<section id="channels" class="wrap sec"><div class="sec-head"><div class="sec-head-l reveal"><span class="eyebrow">Channels</span><h2 class="h2">One AI team for ' + esc(hList) + '. ' + it('Every inbox, one brain.') + '</h2></div>' +
    '<p class="lead reveal" style="max-width:440px">Your Closers live where your customers already chat.' + (liveN.length ? ' ' + esc(andList(liveN)) + (liveN.length > 1 ? ' are' : ' is') + ' fully live.' : '') + (soonN.length ? ' ' + esc(andList(soonN)) + ' ' + (soonN.length > 1 ? 'are' : 'is') + ' coming through each platform\'s official business tools.' : '') + ' <a href="/channels">Compare every channel</a>.</p></div><div class="ch-grid">';
  if (tg) {
    html += '<div class="ch-tile ch-live reveal"><div class="mesh a-mesh" style="width:300px;height:300px;right:-100px;top:-120px;background:#2AABEE;opacity:.35"></div>' +
      '<div class="ch-top rel">' + A.brandIcon('telegram', 56) + '<span class="ch-name"><strong>' + esc(tg.name) + '</strong><span class="pill pill-live"><span class="a-pulse live-dot"></span>Live now</span></span></div>' +
      '<p class="rel">' + esc(tg.desc) + '</p>' +
      (tgModes.length ? '<div class="ch-modes rel">' + tgModes.map(m => '<span>' + A.CHECK + m[1] + '</span>').join('') + '</div>' : '') +
      '<div class="ch-acts rel"><a class="btn btn-jade" href="' + ctx.signupUrl + '">Connect Telegram free</a><a class="ch-more" href="/' + esc(tg.slug) + '">How the Telegram AI chatbot works →</a></div></div>';
  }
  html += others.map(c => {
    const soon = c.status === 'soon';
    return '<div class="ch-tile reveal' + (soon ? ' ch-soon' : '') + '" data-ch="' + esc(c.id) + '"><div class="ch-top">' + A.brandIcon(c.id, 48) + '<span class="ch-name"><strong>' + esc(c.name) + '</strong>' +
      (soon ? '<span class="pill pill-soon">Coming soon</span>' : '<span class="pill pill-live"><span class="a-pulse live-dot"></span>Live</span>') + '</span></div>' +
      '<p>' + esc(c.desc) + '</p>' + (c.slug ? '<a class="ch-more" href="/' + esc(c.slug) + '">' + esc(MORE[c.id] || c.name) + ' →</a>' : '') +
      (soon ? '<button type="button" class="btn btn-ghost btn-sm wl-btn" data-wl="' + esc(c.name) + '">Join the waitlist</button>' : '<a class="btn btn-ink btn-sm" href="' + ctx.signupUrl + '">Connect ' + esc(c.name) + '</a>') + '</div>';
  }).join('');
  return html + '</div><p class="ch-note">Channel names are trademarks of their owners. <a href="/legal/disclaimer">Not affiliated or endorsed</a>.</p></section>';
}

// Website chat: animated demo of the widget answering on a mock store, punchy copy, CTA.
function website(ctx, d) {
  const pts = [['star', 'Your colours and logo', 'Six looks or your own brand. It feels like part of your site.'], ['chat', 'Human-like timing', 'A natural pause and typing dots. Never a robotic wall of text.'], ['fire', 'Lead capture built in', 'Name, email or phone, saved with a HeatScore.'], ['bolt', 'One line of code', 'WordPress, Shopify, Wix, Webflow or plain HTML.']];
  return '<section class="wrap sec" id="website"><div class="web-sec"><div class="web-sec-copy reveal"><span class="eyebrow">New · Website chat</span>' +
    '<h2 class="h2">Your <span class="hl-web">website</span>, answering like your best salesperson. ' + it('In seconds.') + '</h2>' +
    '<p class="lead">The same Closer that sells on Telegram now sits on your website. It greets visitors, answers in seconds with a human pace, captures the lead and lets your team jump in from Pulse Inbox.</p>' +
    '<ul class="web-pts">' + pts.map(p => '<li><span class="bx-ic">' + A.ic(p[0], '#121110', 20) + '</span><span><strong>' + esc(p[1]) + '</strong><span>' + esc(p[2]) + '</span></span></li>').join('') + '</ul>' +
    '<div class="hero-ctas"><a class="btn btn-main" href="' + ctx.signupUrl + '"><span>Start free</span><span class="arr">' + A.ARROW + '</span></a><a class="btn btn-ghost" href="/website-ai-chatbot">How website chat works</a></div>' +
    (d.webPrice ? '<p class="muted small" style="margin:12px 0 0">' + esc(d.webPrice) + '</p>' : '') + '</div>' +
    '<div class="web-sec-art reveal"><div class="chp-scene" data-scene><p class="muted">A visitor asks “Do you ship to Spain?” and the AI answers in seconds, then captures their email.</p></div></div></div></section>';
}

// Agent Studio: looping animated training demo (/js/train-scene.js) and the five coach steps.
function studioSec(ctx) {
  const steps = [['Pick a role', 'Sales, support, bookings, VIP or win-backs.'], ['Give it a personality', 'Name, look and tone, with a live sample reply.'], ['Teach it', 'Q&As, products with exact prices, policies, or import your FAQ page.'], ['Set the rules', 'Never promise dates, cap discounts, hand angry chats to you.'], ['Test & go live', 'One-tap tests, a training score, then flip it live.']];
  return '<section class="wrap sec" id="studio"><div class="web-sec st-sec"><div class="web-sec-copy reveal"><span class="eyebrow">Agent Studio</span>' +
    '<h2 class="h2">Train your Closer like a new hire. ' + it('In 10 minutes.') + '</h2>' +
    '<p class="lead">A step-by-step coach shows you what to do and why. Teach it your answers once. If a reply is ever off, tap “Fix this answer” and it’s right from then on.</p>' +
    '<ol class="st-steps">' + steps.map((x, i) => '<li><span class="n">' + (i + 1) + '</span><span><strong>' + esc(x[0]) + '</strong><span>' + esc(x[1]) + '</span></span></li>').join('') + '</ol>' +
    '<div class="hero-ctas"><a class="btn btn-main" href="' + ctx.signupUrl + '"><span>Build your Closer free</span><span class="arr">' + A.ARROW + '</span></a><button type="button" class="btn btn-ghost" data-video="/video/replyvoo-studio-demo.mp4" data-poster="/video/replyvoo-studio-demo.jpg"><span aria-hidden="true">▶</span> Watch the video</button><a class="btn btn-ghost" href="/blog/build-your-first-closer-agent-studio">How training works</a></div></div>' +
    '<div class="web-sec-art reveal"><div class="chp-scene" data-train><p class="muted">A shop owner names their Closer, teaches it “Do you deliver on Sundays?”, the Closer answers a customer with exactly that line, a wrong answer gets fixed in one tap, and it goes live with a training score of 92.</p></div></div></div></section>';
}

function closers(ctx, d) {
  return '<section class="wrap sec" id="closers"><div class="sec-head">' +
    '<div class="sec-head-l reveal"><span class="eyebrow">Agent Studio</span><h2 class="h2">Build a whole team of ' + it('AI Closers.') + '</h2></div>' +
    '<p class="lead reveal" style="max-width:420px">One for sales, one for support, one guarding your group. Start from a template, give it a name and a personality, and launch it in minutes.</p></div>' +
    '<div class="closer-grid">' + d.templates.map(t => '<article class="card lift reveal closer-c"><div class="closer-blob" style="background:' + esc(t.color) + '"></div>' +
      '<div class="closer-top">' + A.closerBot(t.color, 74, t.letter) + '<span><h3>' + esc(t.name) + '</h3><span>' + esc(t.role) + '</span></span></div>' +
      '<p>' + esc(t.desc) + '</p><div class="tags">' + t.skills.map(s => '<span class="pill pill-soft">' + esc(s) + '</span>').join('') + '</div></article>').join('') +
    '</div><div class="center" style="margin-top:28px"><a class="btn btn-main" href="' + ctx.signupUrl + '">Build your first Closer<span class="arr">' + A.ARROW + '</span></a></div></section>';
}

function features(ctx, d) {
  const f = ctx.features;
  const j = ctx.s.joinvoo;
  const bx = d.features.map(b => {
    const dark = b[5] === 'dark';
    let extra = '';
    if (dark) extra = '<div class="inbox-rows">' + [['MS', 'Mia S.', 'Asked for the price', 'Ace', '#FFF3CC'], ['KO', 'Kojo A.', 'Voice note · 0:07', 'Mira', '#E3ECFF'], ['LB', 'Lucas B.', 'Sent a receipt', 'Ace', '#E8F6EC']].map((r, i) => '<div class="inbox-row a-in" style="animation-delay:' + (i * 0.2) + 's"><span class="av" style="width:34px;height:34px;flex-basis:34px;background:' + r[4] + '">' + r[0] + '</span><span class="inbox-t"><strong>' + r[1] + '</strong><span>' + r[2] + '</span></span><span class="pill pill-jade">' + r[3] + ' replying</span></div>').join('') + '</div>';
    if (b[5] === 'heat') extra = '<div class="tags" style="margin-top:auto"><span class="pill" style="background:#FFE3D6;color:#9A3412">Hot 12</span><span class="pill" style="background:#FFF3CC;color:#7A5800">Warm 31</span><span class="pill" style="background:#E3ECFF;color:#1E3A8A">Cold 58</span></div>';
    if (b[5] === 'wave') extra = '<div class="wavebars" aria-hidden="true">' + [14, 28, 20, 36, 16, 30, 22, 38, 18, 26, 12, 24].map((h, i) => '<span style="height:' + h + 'px;animation:aFloat ' + (1 + (i % 3) * 0.3) + 's ease-in-out infinite"></span>').join('') + '</div>';
    return '<div class="bx lift reveal ' + b[0] + (dark ? ' bx-dark' : '') + '"><span class="bx-ic">' + A.ic(b[4]) + '</span><span class="bx-name">' + esc(b[1]) + '</span><h3 class="bx-h">' + esc(b[2]) + '</h3>' + (b[3] ? '<span class="bx-p">' + esc(b[3]) + '</span>' : '') + extra + '</div>';
  }).join('');
  const jv = (j.enabled && f.joinvoo) ? '<div class="jv reveal"><div class="jv-l"><span class="pill pill-violet">Sister app · Joinvoo</span><h3 class="h3">' + esc(j.headline) + '</h3><p>' + esc(j.pitch) + '</p></div><a class="btn btn-ink" href="/go/joinvoo?from=site_features" rel="noopener">See Joinvoo →</a></div>' : '';
  return '<section class="band" id="features"><div class="wrap sec"><div class="center reveal"><span class="eyebrow">Everything included</span><h2 class="h2" style="max-width:860px">Tools with names your team will ' + it('actually use.') + '</h2></div>' +
    '<div class="bento">' + bx + '</div>' + jv + '</div></section>';
}

const JUNO_QA = [
  ['Who should I follow up first?', 'Daniel, Mia and Kojo asked for payment links in the last hour. Daniel already paid. Want me to nudge the other two?'],
  ['What did my Closers miss?', 'Nine people asked about delivery times this week and Ace had no answer. Add one line to your FAQ and I’ll cover it from now on.'],
  ['Write a Blast for no-buyers', '"Your cart is still waiting. Order today and delivery is on us." Send it to 58 people who chatted but didn’t pay?'],
  ['How was today?', 'Today: 340 chats, 42 orders, $3,420 in sales and 3 complaints. Two chats are waiting for a human.']
];
function juno() {
  return '<section class="wrap sec" id="juno"><div class="juno">' +
    '<div class="juno-dots"></div><div class="juno-art">' + A.junoArt(250) + '</div>' +
    '<div class="juno-r"><span class="juno-tag">Meet Juno</span><h2 class="h2" style="font-size:clamp(30px,4vw,52px)">Your Closers talk to customers. <span class="it">Juno talks to you.</span></h2>' +
    '<p class="juno-p">Ask your business anything in plain words. Juno reads every chat, finds hot leads, spots what your Closers missed and writes your next Blast.</p>' +
    '<div class="juno-chips" role="group" aria-label="Example questions for Juno">' + JUNO_QA.map((q, i) => '<button type="button" class="chip' + (i === 0 ? ' on' : '') + '" aria-pressed="' + (i === 0) + '" data-juno="' + esc(q[1]) + '">' + esc(q[0]) + '</button>').join('') + '</div>' +
    '<div id="junoAns" class="juno-ans a-in" aria-live="polite">' + esc(JUNO_QA[0][1]) + '</div></div></div></section>';
}

function wallet(ctx) {
  const b = ctx.s.billing;
  const rows = [
    ['1 extra conversation (up to ' + b.conversation_reply_limit + ' replies)', '1 credit'],
    ['Voice notes and screenshots', 'Included'],
    ['Pro Brain conversation', '+' + b.pro_brain_extra_credits + ' credit' + (b.pro_brain_extra_credits > 1 ? 's' : '')],
    ['Blast, per ' + b.blast_people_per_credit + ' people', '1 credit'],
    ['Extra Closer for a month', P.fmt(b.extra_closer_credits) + ' credits']
  ];
  return '<section class="band" id="credits"><div class="wrap sec"><div class="split">' +
    '<div class="split-l reveal"><span class="eyebrow">Voo Wallet</span><h2 class="h2">Pay for what you use with ' + it('Voo Credits.') + '</h2>' +
    '<p class="lead">Your plan covers your monthly chats. Voo Credits buy extra chats and power-ups whenever you need them. Top up in seconds with card, Paystack or Flutterwave' + (b.crypto_enabled ? ' or USDT' : '') + ', or turn on Auto Top-up and never go quiet.</p>' +
    '<div class="card costs">' + rows.map(r => '<div class="cost-row"><span>' + esc(r[0]) + '</span><strong class="tnum">' + esc(r[1]) + '</strong></div>').join('') + '</div></div>' +
    '<div class="split-r reveal"><div class="wallet-hero">' + A.moneyGuy(460) +
    '<div class="glass a-float2 wallet-card"><span class="tiny-k">Voo Wallet</span><strong class="tnum" id="promoBal">2,400</strong><span class="wallet-add">+2,200 credits just added</span></div></div></div>' +
    '</div></div></section>';
}

function pricing(ctx, d) {
  const b = ctx.s.billing;
  return '<section id="pricing" class="wrap sec">' +
    '<div class="center reveal" style="gap:18px"><span class="eyebrow">Pricing</span><h2 class="h2" style="max-width:880px">More Closers. More sales. ' + it('Less payroll.') + '</h2>' +
    '<p class="lead" style="max-width:620px">Pay per conversation, not per message. One conversation is a customer chat of up to ' + b.conversation_reply_limit + ' AI replies within ' + b.conversation_window_hours + ' hours, and most sales fit in one.</p>' + P.billingToggle(ctx) + '</div>' +
    '<div class="pricing" data-pricing>' + P.planGrids(ctx, d.plans) + '</div>' +
    '<div class="pp-extra"><div class="card reveal box"><h3 class="box-h">Power-ups</h3><div class="addons">' + P.addonsList(d.addons) + '</div></div>' +
    '<div class="card reveal box"><h3 class="box-h">Credit packs</h3><div class="packs">' + P.packsList(d.packs) + '</div></div></div>' +
    '<div class="center" style="margin-top:28px"><a class="btn btn-ghost" href="/pricing">Compare every plan in detail →</a></div></section>';
}

function squad(ctx) {
  const b = ctx.s.billing;
  const tiers = (b.referral_tiers || []).slice(0, 3);
  const names = ['Starter', 'Pro', 'Legend'];
  const base = tiers[0] ? Math.round(tiers[0].rate * 100) : 20;
  const top = tiers.length ? Math.round(tiers[tiers.length - 1].rate * 100) : base;
  return '<section class="wrap" id="squad" style="padding-bottom:clamp(72px,9vw,120px)"><div class="squad reveal">' +
    '<div class="mesh a-mesh" style="width:420px;height:420px;left:-140px;bottom:-200px;background:#FFC21A;opacity:.3"></div>' +
    '<div class="squad-l"><span class="eyebrow" style="color:var(--jade)">Voo Squad</span><h2 class="h2" style="font-size:clamp(30px,4vw,52px)">Bring friends. <span class="it" style="color:var(--jade)">Get paid every month.</span></h2>' +
    '<p>Earn ' + base + '% of every payment your referrals make, for as long as they stay. Paid in Voo Credits. ' + (top > base ? 'Climb tiers to unlock ' + top + '%. ' : '') + (b.referee_bonus_credits ? 'Your friends get ' + P.fmt(b.referee_bonus_credits) + ' bonus credits.' : '') + '</p>' +
    '<div class="tags">' + tiers.map((t, i) => '<span class="pill ' + (i === tiers.length - 1 && i > 0 ? 'pill-jade' : 'pill-dk') + '">' + (names[i] || 'Tier ' + (i + 1)) + ' · ' + Math.round(t.rate * 100) + '%' + (t.min ? ' after ' + t.min + ' referrals' : '') + '</span>').join('') + '</div>' +
    '<div class="tags"><a class="btn btn-jade" href="' + ctx.signupUrl + '">Join the Squad</a><a class="btn btn-sq" href="/legal/referral">Programme terms</a></div></div>' +
    '<div class="squad-r">' + A.squadArt(340) + '</div></div></section>';
}

function blog(ctx, d) {
  if (!d.posts.length) return '';
  return '<section class="band" id="blog"><div class="wrap sec"><div class="sec-head"><div class="sec-head-l reveal"><span class="eyebrow">From the blog</span><h2 class="h2">Playbooks for ' + it('faster sales.') + '</h2></div><a class="btn btn-ghost" href="/blog">Read the blog</a></div>' +
    '<div class="post-grid" style="margin-top:40px">' + d.posts.map(p => P.postCard(p, { uid: 'h' })).join('') + '</div></div></section>';
}

function faq(ctx) {
  const items = (ctx.s.site.faq || []).filter(f => Array.isArray(f) && f[0]);
  if (!items.length) return '';
  return '<section id="faq" class="wrap sec" style="max-width:920px"><div class="center reveal"><span class="eyebrow">FAQ</span><h2 class="h2">Questions, answered.</h2></div><div style="margin-top:40px">' + P.faqList(items, 'hf') + '</div>' +
    '<p class="muted tc" style="margin-top:24px">Still curious? <a href="/contact">Send us a message</a>' + (ctx.features.chat_widget ? ' or <button type="button" class="linkish" data-open-chat>chat with Juno</button>' : '') + '.</p></section>';
}

function cta(ctx) {
  const c = ctx.s.site.final_cta || {};
  const all = ctx.s.site.hero || {};
  const h = Object.assign({}, all.en || {}, all[ctx.lang] || {});
  return '<section class="wrap" style="padding-bottom:100px"><div class="final">' +
    '<div class="mesh a-mesh" style="width:600px;height:400px;left:50%;margin-left:-300px;top:-240px;background:#FFC21A;opacity:.35"></div>' +
    '<h2 class="h2 final-h">' + esc(c.a) + ' <span class="it" style="color:var(--jade)">' + esc(c.b) + '</span></h2>' +
    '<p class="final-p">' + esc(c.sub) + '</p>' +
    '<a class="btn btn-main final-btn" href="' + ctx.signupUrl + '"><span data-i="cta">' + esc(h.cta) + '</span><span class="arr">' + A.ARROW + '</span></a>' +
    '<div class="final-people">' + A.people(660) + '</div></div></section>';
}

function render(ctx, d) {
  const S = Object.assign({}, ctx.s.site.sections || {});
  const f = ctx.features;
  const on = k => S[k] !== false;
  return heroSec(ctx, d) + marquee() +
    (on('leak') ? leak() : '') +
    (on('compare') ? compare(ctx, d) : '') +
    (on('calc') ? calc(ctx) : '') +
    (on('how') ? how() : '') +
    (on('studio') && f.studio !== false ? studioSec(ctx) : '') +
    (on('website') && ctx.s.flags.channels.website === 'live' ? website(ctx, d) : '') +
    (on('channels') ? channels(ctx, d) : '') +
    (on('closers') ? closers(ctx, d) : '') +
    (on('features') ? features(ctx, d) : '') +
    (on('juno') && f.juno ? juno() : '') +
    (on('wallet') && f.wallet ? wallet(ctx) : '') +
    (on('pricing') ? pricing(ctx, d) : '') +
    (on('squad') && f.squad ? squad(ctx) : '') +
    (on('blog') && f.blog ? blog(ctx, d) : '') +
    (on('faq') ? faq(ctx) : '') +
    (on('cta') ? cta(ctx) : '');
}

module.exports = { render };
