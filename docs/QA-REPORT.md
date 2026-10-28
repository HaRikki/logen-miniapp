# QA Report — Digital Store

Two layers were exercised: the automated API/integration suite and a manual
end-to-end pass driving the real web UI in a headless Chromium (Playwright),
mobile (390×844) and desktop (1440×900) viewports.

## 1 · Automated suite

`npm test` (backend workspace, vitest + supertest against a freshly migrated SQLite DB):

```
Test Files  3 passed (3)
     Tests  28 passed (28)
```

Covered scenarios (all passing at delivery time):

- Telegram `initData` **login success** with valid HMAC; **failure** for tampered signature
  (`BAD_SIGN`) and for stale `auth_date` (`AUTH_DATE_EXPIRED`).
- First-sight user auto-provisioned with a wallet; suspended account returns 403.
- Cookie-session CSRF protection active; Bearer tokens accepted by the same rules.
- Catalog: only ACTIVE products listed, inactive detail 404, home rails + recently-viewed work.
- Purchase with sufficient balance → order PAID → AUTO delivered → COMPLETED, unique key per buyer,
  stock decremented (`sales_count`, available-key count), second buyer receives a **different** key,
  third purchase refused with `OUT_OF_STOCK`.
- Purchase with insufficient balance → clean `409 INSUFFICIENT_BALANCE` (wallet + order untouched).
- Concurrent double-click pay → exactly one `PURCHASE` transaction ever.
- Refund → wallet credited once (replay idempotent), claimed keys marked VOID (never resold).
- Manual flow: order waits in PROCESSING → admin delivers text+secret+file → COMPLETED,
  buyer sees delivery (secret visible in order detail without file content disclosure).
- Illegal transitions blocked (`COMPLETED` requires real delivery records — `DELIVERY_REQUIRED`).
- Deposit: duplicate transaction reference refused; approve credits once — second approve is a no-op
  (`skipped:true`, balance unchanged); reject credits nothing and is audit-logged;
  admin debit beyond balance refused.
- Webhook: bad signature rejected without storing; valid signature processed once,
  replays flagged `duplicate` (unique `(provider,event)`).
- Admin RBAC: regular users and anonymous get 401/403 on every admin route;
  STAFF without `payments` permission cannot approve deposits but keeps products access;
  product delete archives (INACTIVE) when history exists; category delete guarded;
  maintenance mode blocks non-admin writes only; audit log rows verified.

## 2 · Browser / UI end-to-end (real app served by the backend on :3000)

| Step | Expected | Result |
| --- | --- | --- |
| Open home (mobile) | banner slider, balance card, categories with Khmer names, product rails | ✅ renders, skeletons replaced |
| Login page without bot configured | official-widget hint + demo buttons, Khmer UI | ✅ |
| Demo user login | session issued, home shows $25.00 | ✅ |
| Product → variant → Buy → summary sheet → confirm | key delivered, redirect to order, key card masked w/ reveal + copy | ✅ `ORD-261028-E1D4FD` COMPLETED key `0B98-…` |
| Wallet/Profile/Order screens | Khmer labels, history, transactions | ✅ |
| Logout → confirm → session revoked | redirects to /login | ✅ |
| Admin login → Dashboard | live DB numbers (users/products/orders/finance), chart, queues | ✅ |
| Admin approve pending deposit (confirm dialog) | "Approved & wallet credited", row flips APPROVED | ✅ `DEP-261028-7E809B` |
| Admin manual delivery on PROCESSING seed order | text+secret form, status → COMPLETED live in modal | ✅ |
| Desktop admin layout 1440×900 | sidebar + tables readable, no broken controls | ✅ (minor: sidebar footer label truncates at very small widths — cosmetic) |
| Telegram Mini App behavior | SDK script included; theme header color; safe-area padding respected; auto-login path when `initData` present | ✅ structurally ready (needs a real bot token to fully exercise) |
| Website ↔ Mini App data parity | same backend/DB endpoints for both | ✅ |

## 3 · Verified invariants & honesty notes

* No payment is ever auto-confirmed by fake verification: QR display is decorative,
  deposits credit only on admin approval, webhook auto-verify stays off
  unless explicitly enabled with a real PSP (`autoWebhookEnabled:false`).
* Prices/balances are computed by the backend; client values are ignored
  (test: buying with a tampered `unitPriceMinor` still charged the real price).
* Demo login is disabled when `NODE_ENV=production` or `ALLOW_DEMO_LOGIN_IN_DEV=false`.

## 4 · To run yourself

```bash
npm install
npm run migrate && npm run seed         # dev sqlite
npm run build                           # frontend + backend
node backend/dist/index.js               # serves everything on :3000
npm test                                 # 28 integration tests
```
