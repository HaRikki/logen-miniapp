import { db, toDbTime } from "../db";
import { bootstrapAdminIfNeeded } from "./auth";

/**
 * DEVELOPMENT ONLY login. Creates/returns local demo accounts (negativepseudo
 * telegram ids) so the full stack can be exercised in a browser before a real
 * bot is attached. Hard-disabled when ALLOW_DEMO_LOGIN_IN_DEV=false or NODE_ENV=production.
 */
export async function demoLogin(name: string, asAdmin: boolean): Promise<number | null> {
  const k = db();
  const anyUser = await k("users").first();
  if (!anyUser) return null; // require seeded data
  const clean = name.trim() || (asAdmin ? "Demo Admin" : "Demo User");
  const pseudoId = asAdmin ? -900000001 : -900000002;
  const existing = await k("users").where({ telegram_id: pseudoId }).first();
  if (existing) {
    await k("users").where({ id: existing.id }).update({ display_name: clean, updated_at: toDbTime() });
    await bootstrapAdminIfNeeded(existing.id);
    return Number(existing.id);
  }
  const res = await k("users").insert({
    telegram_id: pseudoId, display_name: clean, username: asAdmin ? "demo_admin" : "demo_user",
    first_name: clean, language: "km", is_active: 1, notifications_enabled: 1, is_admin: asAdmin ? 1 : 0,
    created_at: toDbTime(), updated_at: toDbTime()
  });
  const id = Number(Array.isArray(res) ? res[0] : res) || (await k("users").where({ telegram_id: pseudoId }).first()).id;
  const wallet = await k("wallets").where({ user_id: id }).first();
  if (!wallet) {
    await k("wallets").insert({
      user_id: id, currency: process.env.DEFAULT_CURRENCY || "USD",
      balance_minor: asAdmin ? 0 : 2500, lifetime_topup_minor: asAdmin ? 0 : 2500,
      lifetime_spend_minor: 0, created_at: toDbTime(), updated_at: toDbTime()
    });
  }
  if (asAdmin) {
    const now = toDbTime();
    const adm = await k("admin_users").where({ user_id: id }).first();
    if (!adm) await k("admin_users").insert({ user_id: id, role: "SUPER_ADMIN", permissions: null, is_active: 1, created_at: now, updated_at: now });
    await k("users").where({ id }).update({ is_admin: 1 });
  }
  return Number(id);
}
