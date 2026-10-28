import { Knex } from "knex";

export async function up(knex: Knex): Promise<void> {
  await knex.schema.createTable("promotions", (t) => {
    t.increments("id").primary();
    t.string("code", 64).unique().notNullable();
    t.string("name", 255).notNullable();
    t.string("kind", 16).notNullable().defaultTo("PERCENT");  // PERCENT | FIXED
    t.integer("value_minor").notNullable().defaultTo(0);      // percent (x100) or fixed minor units
    t.integer("max_discount_minor").notNullable().defaultTo(0); // 0 = uncapped (for PERCENT)
    t.integer("min_order_minor").notNullable().defaultTo(0);
    t.integer("usage_limit").notNullable().defaultTo(0);      // 0 = unlimited
    t.integer("per_user_limit").notNullable().defaultTo(1);
    t.integer("used_count").notNullable().defaultTo(0);
    t.text("product_ids");                                    // JSON array; null = all products
    t.datetime("starts_at").notNullable();
    t.datetime("ends_at").notNullable();
    t.boolean("is_active").notNullable().defaultTo(true);
    t.integer("created_by").references("id").inTable("users");
    t.timestamps(true, true);
    t.index(["is_active", "starts_at", "ends_at"]);
  });

  await knex.schema.createTable("promotion_usages", (t) => {
    t.increments("id").primary();
    t.integer("promotion_id").notNullable().references("id").inTable("promotions").onDelete("CASCADE");
    t.integer("order_id").notNullable().references("id").inTable("orders").onDelete("CASCADE");
    t.integer("user_id").notNullable().references("id").inTable("users").onDelete("CASCADE");
    t.integer("discount_minor").notNullable().defaultTo(0);
    t.datetime("created_at").notNullable();
    t.index(["promotion_id"]);
    t.index(["promotion_id", "user_id"]);
  });

  await knex.schema.createTable("notifications", (t) => {
    t.increments("id").primary();
    t.integer("user_id").notNullable().references("id").inTable("users").onDelete("CASCADE");
    t.string("kind", 32).notNullable();                       // ORDER_CREATED | PAYMENT_OK | DEPOSIT_APPROVED | DELIVERED | ORDER_CANCELLED | PROMO ...
    t.string("title", 255).notNullable();
    t.text("body");
    t.string("link", 512);
    t.boolean("is_read").notNullable().defaultTo(false);
    t.string("telegram_state", 16).notNullable().defaultTo("NONE"); // NONE | SENT | FAILED | SKIPPED
    t.integer("telegram_attempts").notNullable().defaultTo(0);
    t.datetime("next_retry_at");
    t.datetime("created_at").notNullable();
    t.index(["user_id", "is_read"]);
    t.index(["telegram_state", "next_retry_at"]);
  });

  await knex.schema.createTable("audit_logs", (t) => {
    t.increments("id").primary();
    t.integer("actor_user_id").references("id").inTable("users");
    t.string("actor_role", 16).notNullable().defaultTo("ADMIN");
    t.string("action", 64).notNullable();                     // BALANCE_ADJUST | PRODUCT_UPDATE | DEPOSIT_APPROVE ...
    t.string("entity_type", 32).notNullable();
    t.string("entity_id", 64).notNullable();
    t.text("before_data");                                    // JSON
    t.text("after_data");                                     // JSON
    t.text("reason");
    t.string("ip", 64);
    t.datetime("created_at").notNullable();
    t.index(["entity_type", "entity_id"]);
    t.index(["created_at"]);
  });

  await knex.schema.createTable("store_settings", (t) => {
    t.string("key", 64).primary();
    t.text("value");                                          // JSON
    t.integer("updated_by").references("id").inTable("users");
    t.datetime("updated_at").notNullable();
  });

  await knex.schema.createTable("supplier_integrations", (t) => {
    t.increments("id").primary();
    t.string("name", 128).notNullable();
    t.string("base_url", 1024).notNullable();
    t.text("auth_config");                                    // server-side only; env var name or encrypted blob reference
    t.boolean("is_active").notNullable().defaultTo(false);
    t.integer("product_id").references("id").inTable("products").onDelete("SET NULL");
    t.timestamps(true, true);
  });

  await knex.schema.createTable("recently_viewed", (t) => {
    t.increments("id").primary();
    t.integer("user_id").notNullable().references("id").inTable("users").onDelete("CASCADE");
    t.integer("product_id").notNullable().references("id").inTable("products").onDelete("CASCADE");
    t.datetime("viewed_at").notNullable();
    t.unique(["user_id", "product_id"]);
  });

  await knex.schema.createTable("idempotency_keys", (t) => {
    t.string("key", 128).primary();
    t.integer("user_id").notNullable();
    t.string("scope", 64).notNullable();                      // order_pay | deposit_create ...
    t.integer("resource_id");
    t.text("response");                                       // stored JSON response to replay
    t.datetime("created_at").notNullable();
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists("idempotency_keys");
  await knex.schema.dropTableIfExists("recently_viewed");
  await knex.schema.dropTableIfExists("supplier_integrations");
  await knex.schema.dropTableIfExists("store_settings");
  await knex.schema.dropTableIfExists("audit_logs");
  await knex.schema.dropTableIfExists("notifications");
  await knex.schema.dropTableIfExists("promotion_usages");
  await knex.schema.dropTableIfExists("promotions");
}
