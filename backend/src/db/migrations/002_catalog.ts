import { Knex } from "knex";

export async function up(knex: Knex): Promise<void> {
  await knex.schema.createTable("categories", (t) => {
    t.increments("id").primary();
    t.string("name_km", 255).notNullable();
    t.string("name_en", 255).notNullable();
    t.string("slug", 128).unique().notNullable();
    t.string("icon", 64);                                    // lucide icon name
    t.string("icon_url", 1024);                              // uploaded icon (takes precedence)
    t.integer("sort_order").notNullable().defaultTo(0);
    t.boolean("is_active").notNullable().defaultTo(true);
    t.timestamps(true, true);
  });

  await knex.schema.createTable("banners", (t) => {
    t.increments("id").primary();
    t.string("title", 255).notNullable();
    t.string("subtitle", 255);
    t.string("image_url", 1024).notNullable();
    t.string("link_url", 1024);
    t.integer("sort_order").notNullable().defaultTo(0);
    t.boolean("is_active").notNullable().defaultTo(true);
    t.timestamps(true, true);
  });

  await knex.schema.createTable("products", (t) => {
    t.increments("id").primary();
    t.string("code", 64).unique().notNullable();             // shareable product code
    t.integer("category_id").references("id").inTable("categories").onDelete("SET NULL");
    t.string("name", 255).notNullable();
    t.text("description");
    t.text("instructions");                                   // usage terms / guide shown to buyer
    t.string("cover_url", 1024);
    t.integer("price_minor").notNullable().defaultTo(0);      // default/min display price (minor units)
    t.integer("cost_minor").notNullable().defaultTo(0);       // cost for profit estimate
    t.string("duration_label", 64);                           // e.g. "30 days", "lifetime"
    t.string("delivery_type", 16).notNullable().defaultTo("AUTO");   // AUTO | MANUAL
    t.string("status", 16).notNullable().defaultTo("ACTIVE");        // ACTIVE | INACTIVE
    t.string("stock_mode", 16).notNullable().defaultTo("INVENTORY"); // INVENTORY | KEY_POOL | UNLIMITED | OUT_OF_STOCK
    t.boolean("is_featured").notNullable().defaultTo(false);
    t.boolean("is_offer").notNullable().defaultTo(false);            // special offer flag
    t.integer("sales_count").notNullable().defaultTo(0);
    t.integer("view_count").notNullable().defaultTo(0);
    t.integer("sort_order").notNullable().defaultTo(0);
    t.timestamps(true, true);
    t.index(["category_id"]);
    t.index(["status"]);
    t.index(["is_featured"]);
    t.index(["created_at"]);
  });

  await knex.schema.createTable("product_variants", (t) => {
    t.increments("id").primary();
    t.integer("product_id").notNullable().references("id").inTable("products").onDelete("CASCADE");
    t.string("name", 255).notNullable();                     // package name
    t.string("duration_label", 64);
    t.integer("price_minor").notNullable();
    t.integer("cost_minor").notNullable().defaultTo(0);
    t.integer("compare_at_minor").notNullable().defaultTo(0); // original price for strike-through
    t.integer("stock").notNullable().defaultTo(0);            // -1 => unlimited (with key pool, capped by keys)
    t.integer("sort_order").notNullable().defaultTo(0);
    t.boolean("is_active").notNullable().defaultTo(true);
    t.timestamps(true, true);
    t.index(["product_id"]);
  });

  await knex.schema.createTable("digital_inventory", (t) => {
    t.increments("id").primary();
    t.integer("product_id").notNullable().references("id").inTable("products").onDelete("CASCADE");
    t.integer("variant_id").references("id").inTable("product_variants").onDelete("SET NULL");
    t.string("item_type", 16).notNullable().defaultTo("KEY"); // KEY | TEXT | FILE | ACCOUNT
    t.text("value");                                          // secret payload: key/code/text/file path/account json
    t.string("file_name", 255);
    t.string("status", 16).notNullable().defaultTo("AVAILABLE"); // AVAILABLE | ASSIGNED | VOID
    t.integer("order_item_id");                               // -> order_items.id (FK added in 003 after table exists)
    t.integer("added_by").references("id").inTable("users");
    t.datetime("assigned_at");
    t.timestamps(false, true);                                 // created_at
    t.index(["product_id", "status"]);
    t.index(["variant_id", "status"]);
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists("digital_inventory");
  await knex.schema.dropTableIfExists("product_variants");
  await knex.schema.dropTableIfExists("products");
  await knex.schema.dropTableIfExists("banners");
  await knex.schema.dropTableIfExists("categories");
}
