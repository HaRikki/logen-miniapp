# tests/

Backend integration + unit coverage runs with **vitest + supertest** against a real,
freshly-migrated SQLite database (`backend/tests/`):

```bash
npm test            # from repo root (runs backend workspace tests)
# or: cd backend && npm test
```

## Suites

| File | Covers |
| --- | --- |
| `backend/tests/globalSetup.ts` | wipes + migrates `data/test.sqlite3`, runs dev seed |
| `backend/tests/auth.test.ts` | Telegram initData HMAC accept / reject tampered / reject expired, wallet bootstrap, suspended-account enforcement, cookie CSRF guard (403 without header, business 400 with it), logout revocation, catalog visibility rules (ACTIVE only, 404 inactive), home payload completeness, recently-viewed |
| `backend/tests/orders-finance.test.ts` | purchase w/ auto delivery (unique key per buyer, stock counts, sales_count), insufficient balance refusal (wallet untouched, order stays PENDING), concurrent double-click payment = exactly one debit, refund (single credit, keys VOID never resold), manual delivery queue + admin deliver + buyer visibility, Completed-without-delivery rejection, server-side price enforcement, deposit lifecycle (request→approve credits once, double approve is no-op), reject without credit, duplicate txn reference refused, admin over-debit refused, audit rows recorded, webhook bad-signature reject (nothing stored), valid event processed once then deduped, promo percentage + per-user limit enforced at payment |
| `backend/tests/admin.test.ts` | unauthenticated/anonymous admin blocked, STAFF permission matrix, product CRUD + validation + audit trail + soft-delete-after-sale, category delete blocked while referenced (then allowed), maintenance mode blocks user writes but not admins |

## Result of the last full run (see docs/QA-REPORT.md for browser QA too)

```
Test Files  3 passed (3)
     Tests  28 passed (28)
```
