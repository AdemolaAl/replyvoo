'use strict';
// Loads settings from .env (if present) and the process environment.
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..');

function loadEnvFile(file) {
  if (!fs.existsSync(file)) return;
  const lines = fs.readFileSync(file, 'utf8').split(/\r?\n/);
  for (const line of lines) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (!m || line.trim().startsWith('#')) continue;
    let v = m[2];
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1);
    if (process.env[m[1]] === undefined) process.env[m[1]] = v;
  }
}
loadEnvFile(path.join(ROOT, '.env'));

const env = (k, d = '') => (process.env[k] !== undefined && process.env[k] !== '' ? process.env[k] : d);
const bool = (k, d = false) => { const v = env(k, ''); return v === '' ? d : /^(1|true|yes|on)$/i.test(v); };

const config = {
  root: ROOT,
  env: env('NODE_ENV', 'development'),
  isProd: env('NODE_ENV', 'development') === 'production',
  port: Number(env('PORT', '3000')),
  appUrl: env('APP_URL', 'http://localhost:3000').replace(/\/+$/, ''),
  secret: env('APP_SECRET', ''),
  dbPath: path.resolve(ROOT, env('DATABASE_PATH', './data/replyvoo.db')),
  adminEmail: env('ADMIN_EMAIL', ''),
  adminPassword: env('ADMIN_PASSWORD', ''),
  ai: {
    key: env('ANTHROPIC_API_KEY'),
    model: env('AI_MODEL', 'claude-haiku-4-5-20251001'),
    proModel: env('AI_PRO_MODEL', 'claude-sonnet-5-5'),
    maxTokens: Number(env('AI_MAX_TOKENS', '400')),
    transcribeUrl: env('TRANSCRIBE_API_URL', 'https://api.openai.com/v1/audio/transcriptions'),
    transcribeKey: env('TRANSCRIBE_API_KEY'),
    transcribeModel: env('TRANSCRIBE_MODEL', 'whisper-1'),
    // Careful mode: the model thinks before answering money, refund and angry-customer messages (and Pro Brain chats).
    thinking: bool('AI_THINKING', true),
    // Optional backup AI (any OpenAI-compatible chat API): used if Claude is down, or as the main AI when it's the only key.
    openaiKey: env('OPENAI_API_KEY'),
    openaiModel: env('OPENAI_MODEL', 'gpt-4o-mini'),
    openaiUrl: env('OPENAI_API_URL', 'https://api.openai.com/v1/chat/completions')
  },
  mail: {
    provider: env('MAIL_PROVIDER', 'log'),
    key: env('MAIL_API_KEY'),
    from: env('MAIL_FROM', 'Replyvoo <hello@replyvoo.com>'),
    replyTo: env('MAIL_REPLY_TO', 'support@replyvoo.com')
  },
  pay: {
    paystackSecret: env('PAYSTACK_SECRET_KEY'),
    paystackPublic: env('PAYSTACK_PUBLIC_KEY'),
    flwSecret: env('FLUTTERWAVE_SECRET_KEY'),
    flwHash: env('FLUTTERWAVE_WEBHOOK_HASH'),
    demo: bool('PAYMENTS_DEMO', env('NODE_ENV', 'development') !== 'production')
  },
  // Gatevoo: Zedapex's own crypto checkout (USDT on TRON and Bitcoin, straight to our wallets).
  // Without keys, and with PAYMENTS_DEMO on, a local sandbox checkout is used instead so the flow can be tested.
  gatevoo: {
    apiUrl: env('GATEVOO_API_URL', 'https://api.gatevoo.com/v1').replace(/\/+$/, ''),
    apiKey: env('GATEVOO_API_KEY'),
    webhookSecret: env('GATEVOO_WEBHOOK_SECRET')
  },
  // VooSquare: the shared Zedapex account (Voo ID login, dashboard summary, events, referrals).
  // Login switches to VooSquare as soon as VOO_ISSUER and VOO_CLIENT_ID are set.
  voo: {
    issuer: env('VOO_ISSUER').replace(/\/+$/, ''),
    clientId: env('VOO_CLIENT_ID'),
    clientSecret: env('VOO_CLIENT_SECRET'),
    redirectUri: env('VOO_REDIRECT_URI', env('APP_URL', 'http://localhost:3000').replace(/\/+$/, '') + '/auth/voosquare/callback'),
    serviceKey: env('VOO_SERVICE_KEY'),
    webhookSecret: env('VOO_WEBHOOK_SECRET'),
    eventsUrl: env('VOO_EVENTS_URL', 'https://api.voosquare.com/v1/events'),
    homeUrl: env('VOO_HOME_URL', 'https://voosquare.com').replace(/\/+$/, ''),
    supportEventsUrl: env('VOO_SUPPORT_EVENTS_URL', 'https://api.voosquare.com/v1/support/events')
  },
  // Replyvoo's own support desk: Telegram support bot, reply-to address for support emails, inbound email webhook key.
  support: {
    tgToken: env('SUPPORT_TG_BOT_TOKEN'),
    replyTo: env('SUPPORT_EMAIL_REPLY_TO'),
    inboundKey: env('SUPPORT_INBOUND_KEY')
  },
  // Staff must enter an emailed 6-digit code once per session before using the admin (on by default in production).
  staffMfa: bool('STAFF_2FA', env('NODE_ENV', 'development') === 'production'),
  demoSimulator: bool('DEMO_SIMULATOR', false),
  trustProxy: bool('TRUST_PROXY', true)
};

if (!config.secret) {
  if (config.isProd) {
    console.error('APP_SECRET is missing. Set a long random APP_SECRET in .env before starting in production.');
    process.exit(1);
  }
  config.secret = 'dev-only-secret-do-not-use-in-production-0123456789';
}
if (config.isProd && config.pay.demo) {
  console.warn('WARNING: PAYMENTS_DEMO=true in production. Anyone can get free plans and credits. Turn it off.');
}

module.exports = config;
