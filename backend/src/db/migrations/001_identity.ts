import { Knex } from "knex";

export async function up(knex: Knex): Promise<void> {
  await knex.schema.createTable("users", (t) => {
    t.increments("id").primary();
    t.bigint("telegram_id").unique().notNullable();          // primary identity key
    t.string("username", 128);
    t.string("display_name", 255).notNullable();
    t.string("first_name", 255);
    t.string("last_name", 255);
    t.string("photo_url", 1024);
    t.string("language", 8).notNullable().defaultTo("km");
    t.boolean("is_active").notNullable().defaultTo(true);    // account enabled/blocked
    t.boolean("notifications_enabled").notNullable().defaultTo(true);
    t.boolean("is_admin").notNullable().defaultTo(false);    // cached flag, source of truth = admin_users
    t.timestamps(true, true); // created_at / updated_at (default now)
    t.index(["username"]);
  });

  await knex.schema.createTable("admin_users", (t) => {
    t.increments("id").primary();
    t.integer("user_id").notNullable().references("id").inTable("users").onDelete("CASCADE");
    t.string("role", 32).notNullable().defaultTo("STAFF");   // SUPER_ADMIN | STAFF
    t.text("permissions");                                   // JSON array of permission keys; null = all for role
    t.boolean("is_active").notNullable().defaultTo(true);
    t.integer("created_by").references("id").inTable("users");
    t.timestamps(true, true);
    t.unique(["user_id"]);
  });

  await knex.schema.createTable("sessions", (t) => {
    t.increments("id").primary();
    t.integer("user_id").notNullable().references("id").inTable("users").onDelete("CASCADE");
    t.string("token_hash", 64).unique().notNullable();       // sha256 of session token
    t.string("auth_method", 32).notNullable();               // TELEGRAM_MINI_APP | TELEGRAM_WEB | DEMO | ADMIN_BOOTSTRAP
    t.datetime("expires_at").notNullable();
    t.datetime("last_seen_at");
    t.string("user_agent", 512);
    t.timestamps(false, true);
    t.index(["user_id"]);
    t.index(["expires_at"]);
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists("sessions");
  await knex.schema.dropTableIfExists("admin_users");
  await knex.schema.dropTableIfExists("users");
}
