'use strict';
// Pre-launch check: npm run check. Prints what is configured and what is missing.
const fs = require('node:fs');
const path = require('node:path');
const config = require('../src/config');
const [maj, min] = process.versions.node.split('.').map(Number);
const rows = [];
const ok = (cond, label, fix) => rows.push([cond ? 'OK  ' : (fix && fix.startsWith('!') ? 'FAIL' : 'WARN'), label, cond ? '' : (fix || '').replace(/^!/, '')]);
ok(maj > 22 || (maj === 22 && min >= 13), 'Node.js ' + process.versions.node, '!Install Node.js 22.13 or newer');
ok(config.secret && !config.secret.startsWith('dev-only') && config.secret.length >= 32, 'APP_SECRET', '!Set a long random APP_SECRET (openssl rand -hex 32)');
ok(/^https:\/\//.test(config.appUrl), 'APP_URL ' + config.appUrl, '!Use your public https:// address (Telegram webhooks need HTTPS)');
ok(!!config.ai.key, 'ANTHROPIC_API_KEY', 'Closers use demo replies until you add an Anthropic API key');
ok(config.mail.provider !== 'log' && !!config.mail.key, 'Email provider (' + config.mail.provider + ')', 'Emails are only printed to the console. Set MAIL_PROVIDER and MAIL_API_KEY');
ok(!!config.pay.paystackSecret || !!config.pay.flwSecret || !!config.gatevoo.apiKey, 'Payment provider', 'Add Paystack, Flutterwave or Gatevoo keys to take payments');
ok(!!(config.gatevoo.apiKey && config.gatevoo.webhookSecret), 'Gatevoo crypto checkout (GATEVOO_API_KEY, GATEVOO_WEBHOOK_SECRET)', 'USDT and Bitcoin payments start once Gatevoo keys are set (docs/GATEVOO.md)');
ok(!config.gatevoo.apiKey || !!config.gatevoo.webhookSecret, 'GATEVOO_WEBHOOK_SECRET', '!GATEVOO_API_KEY is set but GATEVOO_WEBHOOK_SECRET is missing, so crypto payments can never confirm');
ok(!config.pay.flwSecret || !!config.pay.flwHash, 'FLUTTERWAVE_WEBHOOK_HASH', 'Set the secret hash you entered in the Flutterwave dashboard');
ok(!config.pay.demo || !config.isProd, 'PAYMENTS_DEMO off in production', '!Set PAYMENTS_DEMO=false');
ok(!config.demoSimulator || !config.isProd, 'DEMO_SIMULATOR off in production', '!Set DEMO_SIMULATOR=false');
ok(!!(config.voo.issuer && config.voo.clientId && config.voo.clientSecret), 'VooSquare login (VOO_ISSUER, VOO_CLIENT_ID, VOO_CLIENT_SECRET)', 'Customers use Replyvoo passwords until VooSquare login is set (docs/VOOSQUARE.md)');
ok(!config.voo.issuer || !!config.voo.serviceKey, 'VOO_SERVICE_KEY', 'VooSquare cannot read the dashboard summary until VOO_SERVICE_KEY is set');
ok(!config.voo.issuer || !!config.voo.webhookSecret, 'VOO_WEBHOOK_SECRET', 'Events are not sent to the VooSquare live feed until VOO_WEBHOOK_SECRET is set');
ok(config.staffMfa, 'Staff 2-step login codes', 'STAFF_2FA is off: staff log in with just a password or Voo ID');
ok(!config.staffMfa || (config.mail.provider !== 'log' && !!config.mail.key), 'Staff codes can be emailed', 'Staff 2-step codes need a real email provider (with MAIL_PROVIDER=log they only show in the server logs)');
ok(!!config.ai.openaiKey, 'Backup AI (OPENAI_API_KEY)', 'Optional: a backup AI keeps Closers answering if Claude has an outage');
ok(!!config.support.tgToken, 'Support Telegram bot', 'Optional: set SUPPORT_TG_BOT_TOKEN so customers can reach your team on Telegram');
ok(!!config.support.inboundKey, 'Support email inbox', 'Optional: set SUPPORT_INBOUND_KEY to turn support emails into tickets');
ok(!!config.ai.transcribeKey, 'Voice note transcription', 'Optional: set TRANSCRIBE_API_KEY to understand voice notes');
try { fs.mkdirSync(path.dirname(config.dbPath), { recursive: true }); fs.accessSync(path.dirname(config.dbPath), fs.constants.W_OK); ok(true, 'Database folder writable: ' + path.dirname(config.dbPath)); } catch { ok(false, 'Database folder writable', '!Check permissions for ' + path.dirname(config.dbPath)); }
let fail = 0;
for (const [s, l, f] of rows) { if (s === 'FAIL') fail++; console.log(s + '  ' + l + (f ? '\n      → ' + f : '')); }
console.log(fail ? '\n' + fail + ' problem(s) must be fixed before launch.' : '\nNo blocking problems.');
process.exit(fail ? 1 : 0);
