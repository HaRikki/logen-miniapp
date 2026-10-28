# database/

Canonical schema management lives in **`backend/src/db/migrations/*.ts`** (Knex migration
files, compatible with both PostgreSQL and SQLite). This folder holds human reference
material only.

| File | Purpose |
| --- | --- |
| `schema.reference.sql` | Readable dump of the generated SQLite structure (26 tables incl. the 20 required domains). Reference for review — apply real changes through migrations. |

## Tables

Identity: `users`, `admin_users`, `sessions`
Catalog: `categories`, `banners`, `products`, `product_variants`, `digital_inventory`
Orders: `orders`, `order_items`, `deliveries`, `order_status_history`
Finance: `wallets`, `wallet_transactions`, `deposits`, `payments`, `payment_providers`, `payment_webhook_events`
Marketing & misc: `promotions`, `promotion_usages`, `notifications`, `audit_logs`,
`store_settings`, `supplier_integrations`, `recently_viewed`, `idempotency_keys`

## Design rules implemented

- PK / FK constraints + indexes on `user_id`, `telegram_id`, order `code`,
  `download_token`, wallet txn `ref`, webhook event id, promo `code`.
- **Unique constraints** on: `users.telegram_id`, `sessions.token_hash`,
  `wallet_transactions.ref` + `idempotency_key`, `deposits.code` + `txn_ref`,
  `payment_webhook_events (provider_code, external_id)`, `promotions.code`,
  `payment_providers.code`, `products.code`, `categories.slug`.
- All money is an **integer in minor units** (cents) — no floats are stored.
- Every balance mutation runs inside a DB transaction with
  `SELECT … FOR UPDATE` where supported plus a conditional
  `UPDATE … WHERE balance >= amount` guard (works identically on SQLite) —
  the balance can never go negative.
- Order/refund/deposit-approval flows are wrapped in single transactions and
  protected by idempotency keys, so replayed requests cannot double-post.
- Audit trail (`audit_logs`) records balance changes, payment approvals, product
  edits and order status changes with actor + before/after snapshots.

## Commands (run from `backend/`)

```bash
# SQLite (dev/test/demo)
npm run migrate
npm run seed          # development seed data only (guarded: skips when data exists)

# PostgreSQL (production) — set DATABASE_URL first
npm run migrate:pg
```

Production backup: `pg_dump "$DATABASE_URL" -Fc -f backup.dump`. Restore:
`pg_restore --clean -d "$DATABASE_URL" backup.dump`.
