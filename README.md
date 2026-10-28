# Digital Store — Website + Telegram Mini App

A complete, production-shaped digital-goods storefront: users browse and buy
licenses, keys, top-ups, files, subscriptions and vouchers from a **shared
backend + database**, paying from a server-managed **wallet**, with
**auto-delivery** (atomic key claiming) and a **manual-delivery queue**, an
admin panel, promotions, deposits with manual approval (gateway-ready webhooks),
notifications (in-app + Telegram Bot with retry/audit) and a full audit trail.
The same data and logic serve the plain website **and** the Telegram Mini App —
nothing about balance or orders lives in the browser.

**UI**: Premium mobile-first Mini App style · Ocean Blue `#087FA5` ·
Tailwind + Lucide icons · skeletons, empty/error states, confirm dialogs ·
responsive iPhone/Android/tablet/desktop · Khmer + English · Telegram safe-area &
theme integration without losing the brand palette.

---

## 1 · Stack

| Layer | Choice | Why |
| --- | --- | --- |
| Frontend | React 18 + TypeScript + Vite + Tailwind CSS + lucide-react | typed, fast build, exact design control |
| Backend | Node.js 20+/22 + Express 4 + TypeScript (strict) | battle-tested, tiny surface area |
| DB / ORM | **PostgreSQL in production, SQLite (better-sqlite3) for dev/tests**, one Knex migration set | real migrations, transactions, works identically on both engines |
| Money | integers (minor units / cents) everywhere — **never** floats | exact accounting |
| Auth | Telegram Mini App `initData` HMAC-verified on the server; Login-Widget verification for the website; DB-backed sessions (httpOnly cookie + optional Bearer) | impersonation-proof; bot token never exposed |
| Files | disk or mounted object-storage volume; image uploads type/size-validated; digital files served only through ownership-checked download tokens | secure delivery |
| Background | same process: notification Telegram retries w/ backoff, deposit expiry sweep — failures never affect orders | reliability |

## 2 · Quick start (development)

```bash
npm install                       # one install for both workspaces
cp .env.example .env              # defaults work out of the box (SQLite + demo login)
npm run migrate && npm run seed   # dev data: categories, products, keys, orders, deposits…
npm run build                     # frontend + backend production build
npm start                         # → http://localhost:3000 (API + app together)
npm test                          # 28 integration tests (vitest + supertest)
```

Dev hot-reload: `npm run dev:backend` (API :3100) + `npm run dev:frontend`
(Vite :5173 proxying `/api`). Without `TELEGRAM_BOT_TOKEN` the login page offers
**Demo User / Demo Admin** buttons — that path is hard-disabled when
`NODE_ENV=production` or `ALLOW_DEMO_LOGIN_IN_DEV=false`.

## 3 · Project layout

```
digital-store/
├─ frontend/          React app: storefront + admin panel (one codebase, /admin)
├─ backend/
│  ├─ src/
│  │  ├─ common/      errors, ids, money helpers
│  │  ├─ config.ts    env loading (never exposes secrets to clients)
│  │  ├─ db/          Knex factory + migrations (identity, catalog, orders, finance, activity) + seeds
│  │  ├─ domain/      Telegram verification (initData + login widget), auth/sessions, demo login
│  │  ├─ middleware/  auth, CSRF double-submit + origin check, uploads policy
│  │  ├─ services/    catalog, promos, orders engine, deliveries, wallet, deposits, notify, audit, settings
│  │  ├─ routes/      auth, shop (public), user (orders/wallet/deposits/files), webhooks, admin/*
│  │  └─ app.ts index.ts  wiring + maintenance + background retry loop
│  └─ tests/          vitest integration suites (see tests/README.md)
├─ database/          schema reference + rules (canonical = backend migrations)
├─ docs/              API.md · QA-REPORT.md
├─ tests/             suite index & how to run
├─ scripts/           set-bot-menu.mjs — attach Mini App menu button to your bot
├─ Dockerfile · docker-compose.yml · .env.example · .gitignore · LICENSE
```

## 4 · Telegram setup (Website ⇄ Mini App parity)

1. Create the bot: **@BotFather → /newbot**. Keep the token as `TELEGRAM_BOT_TOKEN` (server env only).
2. Deploy the app at an **HTTPS** origin (Telegram requirement) and set `APP_BASE_URL` to it.
3. Attach the Mini App:
   * automatic: `npm run telegram:menu` → `scripts/set-bot-menu.mjs` sets the bot menu
     button (“Open Digital Store”) via Bot API; or manually in @BotFather:
     *Bot Settings → Menu Button → Connect Web App → your URL*.
4. Open the bot → menu button → the Mini App loads; `initData` is verified by
   `POST /api/auth/telegram` (HMAC + `auth_date` freshness) and an account with
   wallet is created automatically — no username/password anywhere.
5. Website login outside Telegram is official **Login Widget** (`/login`),
   also verified server-side; shareable product URLs work in both surfaces
   (`/product/:id`) and delivery/Bot notifications share the same data.
6. **First admin, safely**: put your numeric Telegram ID in
   `ADMIN_TELEGRAM_USER_IDS`, sign in once from the Mini App or website —
   the server grants `SUPER_ADMIN` (idempotent bootstrap). Staff admins are then
   granted from **Admin → Settings → Admins** with granular permissions.

## 5 · Payments (current behavior — honest by design)

* **Top-ups**: users pick an admin-configured method (e.g. *ABA Pay / KHQR*, bank,
  Wing…), see the **display-only QR / account details** the admin uploaded, pay,
  and attach a reference/proof. A **Deposit request** is created (PENDING).
* An admin reviews and **Approves** — inside one transaction, with the idempotency
  key `deposit:<id>` — so the wallet is credited **exactly once** even if approve
  is clicked twice. Rejection/Expiry credit nothing. All actions are audit-logged.
* `GET /api/payment-methods` publishes `autoVerification: false` until you connect
  a real PSP. The webhook endpoint (`/api/payments/webhook/:provider`) is already
  hardened (raw-body HMAC-SHA256 signature, dedup on provider event id) and will
  auto-settle matching deposits **only** when `settings.payments.autoWebhookEnabled`
  is deliberately enabled with contracted provider credentials
  (`PAYMENT_WEBHOOK_SECRET`). QR display is never treated as proof of payment —
  balances change only after real verification.
* Orders are paid from the wallet with DB-enforced guards: balance never goes
  negative, double-clicks can't double-charge (row lock + `WHERE balance >= x` +
  idempotency key), and each order has exactly one `pay:<order>` transaction.
* **Checkout note**: with only the wallet method enabled a user must deposit
  before their first purchase (the UI guides them with a Top Up CTA). Adding a
  direct-pay PSP (ABA/Stripe…) = implement the gateway `createPaymentIntent +
  webhook settle` into `services/deposits.ts` / orders pay route; schema and API
  shape (`payments`, `payment_webhook_events`) are in place.

## 6a · Render.com deploy (tested config — fixes the Node-26 build failure)

> If your build log shows `Running build command 'npm install && npm run build'` with
> **Node.js 26** pulled in via `engines >=20`, that was the failure cause: native build
> tooling for Node 26. The project now pins Node 22 (`engines: ">=20 <23"`, `.nvmrc`, and a
> `NODE_VERSION=22` env in `render.yaml`) and `better-sqlite3` is an **optional** dependency
> upgraded to v13, so a PostgreSQL production build never depends on it.

**Steps (dashboard, or use the bundled `render.yaml` blueprint):**

1. New → Web Service → connect `HaRikki/logen-miniapp`.
2. Runtime **Node**, Build command `npm install && npm run build`,
   Start command `node backend/dist/index.js`.
3. Environment (Advanced → Environment Variables) — see `render.yaml` for the full list:
   | Key | Value |
   | --- | --- |
   | `NODE_VERSION` | `22` |
   | `NODE_ENV` | `production` |
   | `APP_BASE_URL` | `https://<your-service>.onrender.com` (or custom domain) |
   | `SESSION_SECRET` | secret — e.g. Render's generated value |
   | `DB_CLIENT` | `postgres` |
   | `DATABASE_URL` | your Postgres connection string (see DB rules below!) |
   | `TELEGRAM_BOT_TOKEN` / `ADMIN_TELEGRAM_USER_IDS` | your bot + admin Telegram IDs |
4. **Database — mandatory for a real store:** Render instance disks are *ephemeral*.
   With SQLite your orders/balances would be lost on every redeploy. Create a
   **PostgreSQL** (Render Internal DB, or external providers like Neon/Supabase —
   for external, use the pooled/direct URL with `sslmode=require`) and set
   `DB_CLIENT=postgres` + `DATABASE_URL`. Migrations run automatically on boot
   (`backend/dist/index.js`), and production is never auto-seeded.
5. **Uploads persistence:** payment proofs, product images and digital files are written
   under `UPLOAD_DIR` (default `./data/uploads`). On Render attach a **Disk** (paid plans)
   mounted e.g. at `/var/data` and set `UPLOAD_DIR=/var/data/uploads`; without one, files
   reset on redeploy. (An S3-compatible adapter slot is prepared in
   `backend/src/routes/admin/catalog.ts → saveFile`.)
6. Free-tier `logen-miniapp` URL must be **https** — Telegram Mini Apps require HTTPS.
7. After deploy: open `https://<url>/api/health` (should return `{"ok":true}`),
   put your Telegram ID in `ADMIN_TELEGRAM_USER_IDS`, sign in once via the bot →
   you're SUPER_ADMIN. `DEMO login` is automatically OFF in production.

**Still failing?** Copy the *whole* build log (bottom-most red error lines matter) and set
`NODE_VERSION=22` first — the vast majority of render build failures are Node-version/native-module issues.

## 6b · Other hosting

```bash
# Docker (Postgres + app, migrations run on boot)
SESSION_SECRET=$(openssl rand -hex 32) docker compose up -d --build       # http://localhost:3000

# Bare metal / PaaS
cp .env.example .env     # NODE_ENV=production, DB_CLIENT=postgres, DATABASE_URL=…
npm ci && npm run build
node backend/dist/db/cli.js migrate postgres
node backend/dist/index.js
```

* HTTPS + a reverse proxy (nginx/Caddy) with the **real client IP** forwarded
  (rate limiting trusts `X-Forwarded-For`).
* `SESSION_SECRET` must differ per environment; cookies are `__Host-` prefixed &
  Secure in production. `uploads/` should be a persistent volume or S3-compatible
  store (`UPLOAD_DIR`), images are public, digital files are always authorization-
  gated download tokens.
* Backups: nightly `pg_dump`; restore drill documented in `database/README.md`.
* Maintenance Mode (Admin → Settings) freezes customer writes while staff works.
* Rate limits per route class (logins stricter), security headers/CSP, CORS by
  allowlist (`ALLOWED_ORIGINS`).

## 7 · Security model summary (see docs/API.md for per-route rules)

Server-side verification of every identity claim · sessions hashed at rest ·
double-submit CSRF + origin checks on cookie mutations · role/permission checks
per admin request (never UI-only) · SQL always parameterized (Knex) · input +
upload validation & size caps · idempotency keys for purchase/refund/deposit ·
non-negative balance invariant enforced in SQL · audit trail for money and
catalog changes with sensitive fields redacted · digital files keyed per
delivery + ownership check · secrets only via environment (`.env` git-ignored;
`.env.example` documents names).

## 8 · Testing

```bash
npm test          # 28 integration tests — auth, catalog, purchase, refunds,
                  # manual/auto delivery, deposits, webhook dedup, RBAC, CSRF,
                  # concurrency & state-machine rules
npm run typecheck # strict TS across workspaces
```

Full results + browser walkthrough: **docs/QA-REPORT.md**.

## 9 · Localization & performance

Khmer + English dictionaries (user-profile or toggle, remembered server-side);
Khmer text gets a Khmer-optimized font stack. Pagination everywhere, lazy image
loading, route-level code splitting (admin loads its own chunk), skeleton
loading, optimistic double-click guards, no full page reloads (SPA).

## 10 · License

MIT — see `LICENSE`.
