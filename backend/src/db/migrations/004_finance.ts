import { Knex } from "knex";

export async function up(knex: Knex): Promise<void> {
  await knex.schema.createTable("payment_providers", (t) => {
    t.increments("id").primary();
    t.string("code", 32).unique().notNullable();              // ABA_KHQR, ACH, BANK_TRANSFER...
    t.string("name", 128).notNullable();
    t.string("mode", 16).notNullable().defaultTo("MANUAL");   // MANUAL (admin verifies) | GATEWAY (API/webhook)
    t.string("account_name", 255);
    t.string("account_number", 128);
    t.string("qr_url", 1024);                                 // uploaded QR image or EMVCo payload link (display only)
    t.text("instructions");                                   // shown to user when depositing
    t.integer("min_minor").notNullable().defaultTo(100);
    t.integer("max_minor").notNullable().defaultTo(0);        // 0 = no cap
    t.string("currency", 8).notNullable().defaultTo("USD");
    t.integer("sort_order").notNullable().defaultTo(0);
    t.boolean("is_active").notNullable().defaultTo(true);
    t.timestamps(true, true);
    t.index(["is_active"]);
  });

  await knex.schema.createTable("wallets", (t) => {
    t.increments("id").primary();
    t.integer("user_id").unique().notNullable().references("id").inTable("users").onDelete("CASCADE");
    t.string("currency", 8).notNullable().defaultTo("USD");
    t.integer("balance_minor").notNullable().defaultTo(0);    // NEVER >= 0 guaranteed by CHECK + guarded updates
    t.integer("lifetime_topup_minor").notNullable().defaultTo(0);
    t.integer("lifetime_spend_minor").notNullable().defaultTo(0);
    t.timestamps(true, true);
  });

  await knex.schema.createTable("wallet_transactions", (t) => {
    t.increments("id").primary();
    t.string("ref", 64).unique().notNullable();               // txn reference returned to UI
    t.integer("user_id").notNullable().references("id").inTable("users").onDelete("RESTRICT");
    t.string("type", 24).notNullable();                       // DEPOSIT | PURCHASE | REFUND | ADMIN_CREDIT | ADMIN_DEBIT
    t.integer("amount_minor").notNullable();                  // signed (+credit / -debit)
    t.integer("balance_before_minor").notNullable();
    t.integer("balance_after_minor").notNullable();
    t.integer("order_id").references("id").inTable("orders").onDelete("SET NULL");
    t.integer("deposit_id");
    t.integer("created_by").references("id").inTable("users"); // admin for manual ops
    t.text("reason");
    t.string("idempotency_key", 128).unique();                // prevents double-posting
    t.datetime("created_at").notNullable();
    t.index(["user_id", "created_at"]);
    t.index(["type"]);
  });

  await knex.schema.createTable("deposits", (t) => {
    t.increments("id").primary();
    t.string("code", 64).unique().notNullable();              // DEP-xxxx reference the user quotes
    t.integer("user_id").notNullable().references("id").inTable("users").onDelete("CASCADE");
    t.integer("provider_id").references("id").inTable("payment_providers").onDelete("SET NULL");
    t.string("provider_code", 32);                            // snapshot
    t.integer("amount_minor").notNullable();
    t.string("currency", 8).notNullable().defaultTo("USD");
    t.string("status", 16).notNullable().defaultTo("PENDING"); // PENDING | APPROVED | REJECTED | EXPIRED
    t.string("txn_ref", 128).unique();                        // user transaction ref from payment app
    t.text("proof_path");                                     // uploaded screenshot path
    t.text("admin_note");
    t.integer("reviewed_by").references("id").inTable("users");
    t.datetime("reviewed_at");
    t.datetime("expires_at").notNullable();
    t.integer("wallet_txn_id").references("id").inTable("wallet_transactions"); // set on approval (double-credit guard)
    t.datetime("created_at").notNullable();
    t.index(["user_id", "status"]);
    t.index(["status"]);
  });

  await knex.schema.createTable("payments", (t) => {
    t.increments("id").primary();                             // gateway payment records (reserved structure for real PSP)
    t.string("code", 64).unique().notNullable();
    t.integer("user_id").references("id").inTable("users");
    t.integer("order_id").references("id").inTable("orders").onDelete("SET NULL");
    t.integer("deposit_id").references("id").inTable("deposits").onDelete("SET NULL");
    t.string("provider_code", 32).notNullable();
    t.string("provider_payment_id", 255);
    t.string("status", 24).notNullable().defaultTo("CREATED"); // CREATED | AUTHORIZED | SETTLED | FAILED | REFUNDED
    t.integer("amount_minor").notNullable();
    t.string("currency", 8).notNullable().defaultTo("USD");
    t.text("provider_payload");                               // masked provider metadata (JSON)
    t.datetime("created_at").notNullable();
    t.index(["deposit_id"]);
    t.index(["order_id"]);
  });

  await knex.schema.createTable("payment_webhook_events", (t) => {
    t.increments("id").primary();
    t.string("provider_code", 32).notNullable();
    t.string("external_id", 255).notNullable();               // provider event id
    t.text("payload");                                        // raw payload (JSON)
    t.boolean("signature_valid").notNullable().defaultTo(false);
    t.string("status", 16).notNullable().defaultTo("RECEIVED"); // RECEIVED | PROCESSED | IGNORED | FAILED
    t.text("process_note");
    t.datetime("received_at").notNullable();
    t.unique(["provider_code", "external_id"]);               // dedupe: same webhook processed once
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists("payment_webhook_events");
  await knex.schema.dropTableIfExists("payments");
  await knex.schema.dropTableIfExists("deposits");
  await knex.schema.dropTableIfExists("wallet_transactions");
  await knex.schema.dropTableIfExists("wallets");
  await knex.schema.dropTableIfExists("payment_providers");
}
