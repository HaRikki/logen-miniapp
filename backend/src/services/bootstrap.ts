import { db } from "../db";
import { bootstrapAdminIfNeeded } from "../domain/auth";

/** Ensure all ADMIN_TELEGRAM_USER_IDS exist as admins once they have signed in. */
export async function bootstrapAdminAll(): Promise<void> {
  try {
    const { config } = await import("../config");
    if (!config.telegram.adminUserIds.length) return;
    const k = db();
    const users = await k("users").whereIn("telegram_id", config.telegram.adminUserIds);
    for (const u of users) await bootstrapAdminIfNeeded(Number(u.id));
  } catch (e) {
    console.error("admin bootstrap failed (non-fatal)", e);
  }
}
