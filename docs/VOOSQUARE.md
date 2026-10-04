# VooSquare integration

VooSquare is the one account for every Zedapex tool. Replyvoo connects to it in four ways, as set out in the
*VooSquare Integration Spec*. VooSquare never takes or moves money: plans, credits and the Voo Wallet stay in Replyvoo.

| Part | What Replyvoo does | Code |
| --- | --- | --- |
| 1. Login (Voo ID) | OpenID Connect, Authorization Code + PKCE. Users are keyed by `users.voo_id`, never by email. | `src/services/voosquare.js`, `src/routes/voosquare.js` |
| 2. Summary API | `GET /api/voosquare/summary` returns the dashboard card numbers. | `voosquare.summary()` |
| 3. Events | Key moments go into `voo_outbox` and a background job posts them, signed and retried for 24 hours. | `voosquare.emit()`, `voosquare.flush()`, scheduler job `voo` |
| 4. Referrals and links | `voo_ref` is saved once on the user. Tool links work only while the user keeps them on. | `voosquare.saveLink()`, `/api/voosquare/inbound/castvoo` |

## Switching it on

Login moves to VooSquare as soon as **both** `VOO_ISSUER` and `VOO_CLIENT_ID` are set. Until then, Replyvoo keeps
its own email and password login, so it can run before VooSquare is live.

```
VOO_ISSUER=https://auth.voosquare.com
VOO_CLIENT_ID=<Replyvoo's client id>
VOO_CLIENT_SECRET=<Replyvoo's client secret>
VOO_REDIRECT_URI=https://replyvoo.com/auth/voosquare/callback
VOO_SERVICE_KEY=<bearer key VooSquare uses to call Replyvoo>
VOO_WEBHOOK_SECRET=<HMAC secret for events>
VOO_EVENTS_URL=https://api.voosquare.com/v1/events     (default)
VOO_HOME_URL=https://voosquare.com                      (default)
```

In the login provider (Clerk, Auth0 or Logto), register Replyvoo as its own OIDC client:

- Redirect URI: `https://replyvoo.com/auth/voosquare/callback`
- Post-logout redirect URI: `https://replyvoo.com/`
- Scopes: `openid email profile`. Add the custom claims `country` (ISO code chosen at sign-up) and `voo_ref`.
- Branding: Replyvoo's name, logo and yellow `#FFC21A`, with "Secured by VooSquare · one login for all Zedapex tools" underneath.
- Token endpoint auth: `client_secret_basic` or `client_secret_post` (Replyvoo picks whichever the discovery document lists).
- Signing: RS256, PS256 or ES256 with a published JWKS.

Run `npm run check` to see which VooSquare settings are still missing.

## 1. Login

| Route | What it does |
| --- | --- |
| `GET /auth/voosquare?return_to=/app/...&signup=1` | Starts login and sends the user to VooSquare. `signup=1` asks the provider to open its sign-up screen. |
| `GET /auth/voosquare/callback` | Checks state and PKCE, swaps the code, verifies the ID token (signature, issuer, audience, expiry, nonce) and starts a Replyvoo session. |
| `GET /auth/voosquare/logout` | Ends the Replyvoo session, then redirects to VooSquare's end-session URL, so one sign-out signs out everywhere. |

- Every "Start free" and "Log in" button keeps its link (`/app/signup`, `/app/login`). Those pages now redirect to
  `/auth/voosquare`. Pricing buttons keep the chosen plan: the user comes back to checkout after login.
- **First login:** Replyvoo creates the user (`voo_id`, `email`, `name`, `country`, `referred_by` = `voo_ref`) and a
  workspace. It then opens `/app/welcome`, the same business, niche, team and Moji steps the old sign-up form had (`POST /api/auth/onboard`).
- **Later logins:** the user is found by `voo_id`. Email, name and country follow VooSquare. `referred_by` is never changed.
- **Accounts from before VooSquare** (for example the seeded admin) are linked once. This needs VooSquare to say the email is
  verified and the account to have no Voo ID yet. After that, `voo_id` is the only key, and a second Voo ID with the same
  email is refused (409).
- **Passwords:** customers can no longer sign up, log in or reset a password in Replyvoo (403 with `login_url`).
  Platform admins keep their password login at `/admin` as a break-glass route if VooSquare is down.
- **Team invites:** the invitee continues with VooSquare and comes back to the invite. The Voo ID's email must match the invite.
  Invitees don't get an extra workspace of their own.
- The session cookie (`rv_s`, 30 days) is kept after login. Replyvoo goes back to VooSquare only when it expires.
- Settings → Login shows "Voo ID" with links to manage the account and connected tools in VooSquare.

## 2. Summary API

```
GET /api/voosquare/summary?voo_id=<id>&period=1d|7d|30d
Authorization: Bearer <VOO_SERVICE_KEY>
```

```json
{
  "tool": "replyvoo", "linked": true, "status": "active", "period": "7d",
  "metrics": [
    { "key": "chats_answered", "label": "Chats answered", "value": 412, "unit": "count", "change_pct": 18.2 },
    { "key": "leads_qualified", "label": "Leads qualified", "value": 57, "unit": "count", "change_pct": 9.6 },
    { "key": "sales_closed", "label": "Sales closed", "value": 18, "unit": "count", "change_pct": 12.0 },
    { "key": "sales_usd", "label": "Sales value", "value": 2160, "unit": "usd", "change_pct": 4.1 }
  ],
  "open_url": "https://replyvoo.com/app"
}
```

- Numbers cover every workspace the user owns. `change_pct` compares the period with the one before it.
- `chats_answered` counts conversations the Closer replied in. `leads_qualified` counts leads that turned Hot.
  `sales_closed` counts payment screenshots and leads the team marked as won. `sales_usd` adds up those leads' value.
- `status`: `active` (paid plan), `trial` (free Spark plan), `paused` (workspace suspended), `none` (no workspace).
- Unknown `voo_id` returns `{"tool":"replyvoo","linked":false}`. A missing or wrong key returns 401.

## 3. Events

| Type | When | `value_usd` |
| --- | --- | --- |
| `chat_answered` | The Closer answers a new conversation (once per billed conversation, not per message) | none |
| `lead_qualified` | A lead turns Hot | none |
| `payment_link_sent` | The Closer's reply contains its payment link | none |
| `sale_closed` | A payment screenshot arrives, or the team marks a lead as won | the lead's value, if set |
| `plan_started` | A plan payment goes through | none |
| `plan_cancelled` | A paid plan ends without renewal | none |
| `spend` | Any payment inside Replyvoo (plan, credits, power-up) | amount paid |

- Body: `event_id` (unique, `rv_…`), `tool`, `voo_id` (workspace owner), `type`, `occurred_at`, `label`, optional `value_usd`.
- Labels name the channel, never the person: "New hot lead on Telegram", "Closer answered a website chat".
- A job runs every minute and posts up to 100 due events. It sends a single event as-is and several as `{"events":[…]}`.
  The raw body is signed with HMAC-SHA256 (`VOO_WEBHOOK_SECRET`) in `X-Voo-Signature`.
- Failures retry with backoff (30 s, doubling, capped at 1 hour) for up to 24 hours, then stop. Retries reuse the same
  `event_id`, so VooSquare can safely ignore repeats.
- Events are only queued for users with a Voo ID, and only when `VOO_WEBHOOK_SECRET` is set.

## 4. Referrals, links and payments

- **Referrals:** VooSquare owns the code (`voo_ref`) and the shared rate table, fed by the `spend` event. With VooSquare on,
  Replyvoo stops paying its own Voo Squad credits, so nobody is paid twice. The Voo Squad page becomes display only: it links
  to the user's VooSquare referral code and shows credits earned before the switch.
- **Withdrawals:** referral earnings are paid out by VooSquare. Cash withdrawals (bank transfer, mobile money or USDT) need a
  balance of at least **$300**; below that the balance carries over to the next month. Taking earnings as Voo Credits has no
  minimum. Replyvoo's own setting (Admin → Billing rules → "Voo Squad: minimum cash withdrawal") and legal terms say $300 too.
- **Country:** the `country` claim picks the payment methods shown at checkout:

  | Country | Methods, in order |
  | --- | --- |
  | Paystack countries (NG, GH, KE, ZA, CI) | Paystack, then Flutterwave, then USDT |
  | Rest of Africa | Flutterwave, then USDT |
  | Everywhere else | USDT, then Flutterwave (card, Apple Pay, Google Pay) |

- **Tool links:** VooSquare switches a link on or off with `POST /api/voosquare/links` (service key):
  `{"voo_id","link":"castvoo-replyvoo","key":"<scoped key>"}`, or `"enabled": false` to revoke it.
  Replyvoo stores only a hash of the key (plus an encrypted copy for outbound calls). A revoked key stops working at once.
- **Castvoo → Replyvoo:** `POST /api/voosquare/inbound/castvoo` with `Authorization: Bearer <scoped key>` and
  `{"chat_id","text","bot_id" or "bot_username","from":{"id","name","username"}}`. If the user has that Telegram bot
  connected in Replyvoo, the Closer answers the broadcast reply on it, and the answer is returned in `text`. If not, it returns 409.
- **Part of VooSquare:** a link to `https://voosquare.com/#dashboard` appears in the dashboard sidebar, the mobile menu
  and the website footer while VooSquare login is on.

`/api/voosquare/*` is server-to-server. It is authenticated by bearer keys, not cookies, so it skips the `x-rv` header check.

## 5. Support HQ (staff across all tools)

VooSquare is the HQ for Zedapex support staff. It invites staff once, then pushes each person's access to every tool. Each tool keeps its own desk and exposes it to VooSquare. All calls below use `Authorization: Bearer <VOO_SERVICE_KEY>`.

| Call | Purpose |
| --- | --- |
| `POST /api/voosquare/staff` | Add or update staff by Voo ID: `voo_id, email, name, role (admin, support, finance, content, viewer), perms, all_boxes, boxes, title`. `active: false` removes access and logs them out. Owners can't be set from VooSquare. |
| `GET /api/voosquare/staff` | Staff list with role, boxes, source and last seen |
| `GET /api/voosquare/support/boxes` | Boxes and open counts |
| `GET /api/voosquare/support/tickets` | Tickets (`status`, `box_id`, `view=mine|unassigned`, `q`, `voo_id` to limit to what that person may see); each has a `url` to open it in Replyvoo |
| `GET /api/voosquare/support/tickets/:ref` | One ticket with messages |
| `POST /api/voosquare/support/tickets/:ref/reply` | `voo_id, text, note`. The reply goes to the customer the way they wrote in. |
| `POST /api/voosquare/support/tickets/:ref/update` | `voo_id, status, priority, box_id, assignee_voo_id` |

Support events (`ticket_created`, `ticket_solved`) go to `VOO_SUPPORT_EVENTS_URL` (default `https://api.voosquare.com/v1/support/events`). They're signed like product events and contain the ticket summary only, never customer contact details. The prompt for the VooSquare builder is in the *VooSquare Integration Spec* doc, Part 5. Staff roles and the desk itself are covered in `docs/STAFF_AND_SUPPORT.md`.

## Brand

VooSquare's logo is in `public/img/voosquare-logo.png` (full lockup) and `public/img/voosquare-mark.svg` (the icon).
Colours: green `#00A86B` (gradient `#18C784` → `#067A4A`), lime `#C8F55A` and ink `#0B1612`. The wordmark is "Voo" in ink or white
and "Square" in green. In code, `RV.vooMark(size)` draws the icon and `RV.VOO_WORD` the wordmark. Replyvoo screens keep
Replyvoo's yellow; the VooSquare green appears only on VooSquare touchpoints (Voo ID chip, "Part of VooSquare", Voo Squad).

## Database (migration 006)

- `users.voo_id` (unique when set), `users.referred_by` (the `voo_ref`), `users.country`
- `voo_outbox`: queued events with attempts, next try, sent or failed time
- `voo_links`: one row per user and link, with the key hash and whether it is on

## Launch checklist

- [ ] Login works on a fresh browser and on mobile (`/app/login` → VooSquare → back in the dashboard)
- [ ] A new user gets a local row keyed by `voo_id` and lands on `/app/welcome`
- [ ] Logging out of Replyvoo logs out of VooSquare
- [ ] The summary endpoint rejects calls without the service key
- [ ] A test event appears in the VooSquare live feed
- [ ] Webhook retries don't create duplicates (same `event_id`)
- [ ] No end-customer personal data is sent to VooSquare
- [ ] No payment or top-up screen exists anywhere on VooSquare

Tests: `test/voosquare.test.js` runs the whole login against a fake issuer, including PKCE, bad state, signature, nonce and
audience. It also covers the summary, signed and retried events, links, invites and payment methods by country.
