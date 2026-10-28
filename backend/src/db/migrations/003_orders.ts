import { Knex } from "knex";

export async function up(knex: Knex): Promise<void> {
  await knex.schema.createTable("orders", (t) => {
    t.increments("id").primary();
    t.string("code", 64).unique().notNullable();              // ORD-xxxx shareable id
    t.integer("user_id").notNullable().references("id").inTable("users").onDelete("RESTRICT");
    t.string("status", 24).notNullable().defaultTo("PENDING_PAYMENT");
    // PENDING_PAYMENT | PAID | PROCESSING | COMPLETED | FAILED | CANCELLED | REFUNDED
    t.string("currency", 8).notNullable().defaultTo("USD");
    t.integer("items_total_minor").notNullable().defaultTo(0);
    t.integer("discount_minor").notNullable().defaultTo(0);
    t.integer("total_minor").notNullable().defaultTo(0);
    t.integer("promotion_id");                                // -> promotions.id (no cross-file FK to keep migration order safe)
    t.string("payment_method", 32).notNullable().defaultTo("WALLET"); // WALLET (gateway reserved)
    t.string("delivery_account", 255);                        // target account / contact for top-ups etc.
    t.text("customer_note");
    t.text("failure_reason");
    t.integer("placed_by_admin").references("id").inTable("users");
    t.timestamps(true, true);
    t.index(["user_id", "status"]);
    t.index(["created_at"]);
  });

  await knex.schema.createTable("order_items", (t) => {
    t.increments("id").primary();
    t.integer("order_id").notNullable().references("id").inTable("orders").onDelete("CASCADE");
    t.integer("product_id").references("id").inTable("products").onDelete("SET NULL");
    t.integer("variant_id").references("id").inTable("product_variants").onDelete("SET NULL");
    t.string("product_name", 255).notNullable();              // snapshot
    t.string("variant_name", 255);                            // snapshot
    t.integer("quantity").notNullable().defaultTo(1);
    t.integer("unit_price_minor").notNullable().defaultTo(0); // snapshot at purchase
    t.integer("unit_cost_minor").notNullable().defaultTo(0);
    t.string("delivery_type", 16).notNullable().defaultTo("AUTO");
    t.string("delivery_status", 16).notNullable().defaultTo("PENDING"); // PENDING | DELIVERED | FAILED
    t.text("delivery_error");
    t.timestamps(true, true);
    t.index(["order_id"]);
    t.index(["product_id"]);
  });

  await knex.schema.createTable("deliveries", (t) => {
    t.increments("id").primary();
    t.integer("order_id").notNullable().references("id").inTable("orders").onDelete("CASCADE");
    t.integer("order_item_id").notNullable().references("id").inTable("order_items").onDelete("CASCADE");
    t.string("kind", 16).notNullable();                       // AUTO | MANUAL
    t.string("status", 16).notNullable().defaultTo("DELIVERED"); // DELIVERED | FAILED
    t.text("content_text");                                   // delivered message/instructions (sanitized, user-facing)
    t.text("secret_payload");                                 // keys/credentials (never listed in admin tables, download only)
    t.string("file_path", 1024);                              // protected digital file path
    t.string("file_name", 255);
    t.string("download_token", 64).unique();                  // per-delivery protected download
    t.integer("delivered_by").references("id").inTable("users"); // admin who delivered (manual)
    t.integer("attempt_count").notNullable().defaultTo(1);
    t.text("logs");                                           // JSON array of status history
    t.timestamps(true, true);
    t.index(["order_id"]);
    t.index(["status"]);
  });

  // history of order status transitions
  await knex.schema.createTable("order_status_history", (t) => {
    t.increments("id").primary();
    t.integer("order_id").notNullable().references("id").inTable("orders").onDelete("CASCADE");
    t.string("from_status", 24);
    t.string("to_status", 24).notNullable();
    t.integer("changed_by").references("id").inTable("users");
    t.string("actor_role", 16).notNullable().defaultTo("USER"); // USER | ADMIN | SYSTEM
    t.text("reason");
    t.datetime("created_at").notNullable();
    t.index(["order_id"]);
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists("order_status_history");
  await knex.schema.dropTableIfExists("deliveries");
  await knex.schema.dropTableIfExists("order_items");
  await knex.schema.dropTableIfExists("orders");
}
