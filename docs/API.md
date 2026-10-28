# API Documentation — Digital Store

Base URL: `/api`. All error responses use the shape
`{ "error": { "code": string, "message": string, "details?": object } }`
with an appropriate HTTP status (400 validation, 401 auth, 403 permission/CSRF,
404 missing, 409 business-rule conflict, 429 rate-limit/double-click, 503 maintenance).

**Authentication** — two equivalent transports, always verified server-side:

1. `POST /api/auth/telegram` with Mini-App `initData` →
   server verifies the bot HMAC signature and freshness (`auth_date`), creates the
   account on first sight, and issues an `httpOnly` session cookie + CSRF cookie.
2. `POST /api/auth/telegram-web` with the official Login Widget payload — same HMAC check.
3. `Authorization: Bearer <session token>` is accepted for API/native clients.
   The bot token never reaches the frontend. Sessions expire (30 days) and are
   revoked on logout or account disable.

**Admin endpoints** require a role row in `admin_users`
(`SUPER_ADMIN` auto-granted for `ADMIN_TELEGRAM_USER_IDS`; `STAFF` with a
permission list). Permission keys: `dashboard, users, categories, products,
orders, inventory, payments, promotions, delivery, settings, audit`. Each admin
request re-checks role + permission on the server; hiding buttons in the UI is
never the protection.

**State-changing requests** from cookie sessions need header `x-csrf-token`
matching the readable `ds_csrf` cookie (double-submit) and pass an origin check.

---

## Storefront / user

| Method & path | Notes |
| --- | --- |
| `GET /api/health` | liveness probe |
| `GET /api/config` | public store info (name, currency, bot username, legal texts, maintenance) |
| `GET /api/home` | banners, categories, featured/new/popular/offer rails, recently viewed |
| `GET /api/categories` | active categories + product counts |
| `GET /api/products` | `?q &category &min &max (display$) &sort=new\|popular\|price_asc\|price_desc\|featured &featured=1 &offer=1 &page &limit` (ACTIVE only) |
| `GET /api/products/:idOrCode` | product + server-computed variant stock; logs view; shareable URL `/product/:id` |
| `POST /api/auth/logout` | revoke session |
| `GET /api/auth/me` | `{ user: User\|null }` |
| `POST /api/auth/demo` | dev-only fallback login (hard-disabled in production) |
| `GET /api/auth/capabilities` | login features available to the frontend |
| `PATCH /api/users/me` | notifications toggle, language |
| `GET /api/notifications` · `POST /api/notifications/read` | in-app inbox |
| `POST /api/promotions/validate` | preview a discount code for a draft total |
| `POST /api/orders` | `{ items:[{productId,variantId?,quantity}], promoCode?, deliveryAccount?, customerNote? }` — server prices everything; returns `PENDING_PAYMENT` order |
| `GET /api/orders` | `?status &q &page` own orders |
| `GET /api/orders/:code` | order view incl. delivery secrets for the **owner only** |
| `POST /api/orders/:code/pay` | wallet debit + auto delivery in ONE transaction; idempotent; 409 `INSUFFICIENT_BALANCE` |
| `POST /api/orders/:code/cancel` | only while `PENDING_PAYMENT` |
| `GET /api/files/:downloadToken` | protected digital-file download (auth, ownership) |
| `GET /api/wallet` | balance + lifetime totals |
| `GET /api/wallet/transactions` | `?page &limit` |
| `GET /api/payment-methods` | active providers + `autoVerification:false` honesty flag |
| `POST /api/deposits` | `{ providerCode, amountMinor\|amount, txnRef?, proofPath? }` → PENDING request (no credit yet) |
| `GET /api/deposits` | own requests |
| `POST /api/uploads/proof` | multipart `file` (png/jpg/webp ≤15MB, private storage) |

## Admin (prefix `/api/admin`, per-permission)

| Area | Endpoints |
| --- | --- |
| Dashboard | `GET /api/admin/dashboard` — real DB aggregates (users, products, orders, sales, deposits, profit estimate, wallet float, 14-day series, queues) |
| Users | `GET /api/admin/users` (`?q` ID/@name, `?page`), `GET /users/:id`, `POST /users/:id/balance` `{kind:CREDIT\|DEBIT, amountMinor, reason*}` (debit guarded ≥0, audited, notified), `POST /users/:id/status` block/unblock (revokes sessions) |
| Roles | `GET /admins`, `PUT /admins/:telegramId` grant staff `{role, permissions[]}`, `DELETE /admins/:userId` |
| Categories | `GET/POST /categories`, `PUT/DELETE /categories/:id` (delete blocked while products exist) |
| Banners | `GET/POST /banners`, `PUT/DELETE /banners/:id` |
| Products | `GET /products` (`?q &page &status`), `GET/POST /products`, `PUT/DELETE /products/:id` (delete = archive if sold), `POST /products/:id/variants`, `PUT/DELETE /variants/:id` |
| Inventory | `GET /inventory?productId &status`, `POST /inventory/bulk` `{productId,variantId?,itemType,values[]}`, `POST /inventory/file` (multipart), `POST /inventory/:id/void` |
| Orders | `GET /orders` (`?q &status &page`), `GET /orders/:code`, `POST /orders/:id/status` (state-machine validated — `Completed` requires real delivery rows), `POST /orders/:id/deliver` (manual delivery text/secret/file), `POST /orders/deliver-file` (temp upload), `POST /orders/:id/retry`, `GET /delivery/queue` (manual queue / failed autos / recent) |
| Payments | `GET /deposits` (`?status &q`), `POST /deposits/:id/approve` (idempotent single credit), `POST /deposits/:id/reject`, `GET /deposit-proof/:id`, `GET/POST/PUT /payment-methods(…)`, `GET /logs` |
| Promotions | `GET/POST /promotions`, `PUT/DELETE /promotions/:id` (disable soft) |
| Settings | `GET/PUT /settings/store\|payments\|delivery` (maintenance mode, bot username, legal texts, webhook gate) |
| Audit | `GET /audit-logs?entityType &page` |

## Payment gateway webhook (reserved structure)

`POST /api/payments/webhook/:provider` — parsed with the RAW body; requires header
`x-webhook-signature` = HMAC-SHA256(rawBody, `PAYMENT_WEBHOOK_SECRET`).
Events are deduplicated by `(provider_code, external_id)` (unique constraint).
Auto-crediting stays **off** unless `settings.payments.autoWebhookEnabled` is
explicitly true, which must only be done with a contracted PSP. Until then every
deposit is credited exclusively by `POST /api/admin/deposits/:id/approve`.

## Order state machine

`PENDING_PAYMENT → PAID → (PROCESSING ⇄ COMPLETED) / FAILED / REFUNDED`;
`FAILED → PROCESSING` is only legal through the guarded retry path and
`COMPLETED` can never be reached without every item carrying a real, delivered
`deliveries` row. Illegal jumps return `409 BAD_TRANSITION`.

## Money & safety invariants

* all amounts integer **minor units** end-to-end, prices computed server-side only;
* debits use guarded updates (`WHERE balance >= x`) + `FOR UPDATE` row locks —
  balance cannot go negative nor be spent twice (verified by test suite);
* every purchase/refund/deposit approval writes a `wallet_transactions` row with
  before/after balance and idempotency key (`pay:<order>`, `refund:<order>`, `deposit:<id>`);
* claimed keys are marked `ASSIGNED` atomically — one key can never reach two buyers;
  refunds void the keys instead of reselling them.
