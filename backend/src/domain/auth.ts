import crypto from "crypto";
import { Knex, db, asBool, asNum, toDbTime, fromDbTime } from "../db";
import { config } from "../config";
import { token, sha256, bizId } from "../common/id";
import { forbidden, unauthorized } from "../common/errors";
import type { TelegramUser } from "./telegram";

export interface SessionUser {
  id: number;
  telegramId: number;
  displayName: string;
  username: string | null;
  photoUrl: string | null;
  language: string;
  isActive: boolean;
  notificationsEnabled: boolean;
  isAdmin: boolean;
  adminRole: string | null;      // SUPER_ADMIN | STAFF
  adminPermissions: string[] | null; // null = full access for role
  balanceMinor: number;
  createdAt: string | null;
}

export const ADMIN_PERMS = [
  "dashboard", "users", "categories", "products", "orders", "inventory",
  "payments", "promotions", "delivery", "settings", "audit"
] as const;

export async function upsertTelegramUser(u: TelegramUser, source: "MINI_APP" | "WEB_WIDGET"): Promise<number> {
  const k = db();
  const displayName = [u.firstName, u.lastName].filter(Boolean).join(" ").trim() || u.username || `User ${u.id}`;
  const existing = await k("users").where({ telegram_id: u.id }).first();
  if (existing) {
    await k("users").where({ id: existing.id }).update({
      username: u.username ?? existing.username,
      display_name: displayName,
      first_name: u.firstName ?? existing.first_name,
      last_name: u.lastName ?? existing.last_name,
      language: u.languageCode?.startsWith("km") ? "km" : (u.languageCode ? "en" : existing.language),
      photo_url: u.photoUrl || existing.photo_url,
      updated_at: toDbTime()
    });
    return existing.id;
  }
  const idRow = await k("users").insert({
    telegram_id: u.id, username: u.username || null, display_name: displayName,
    first_name: u.firstName || null, last_name: u.lastName || null, photo_url: u.photoUrl || null,
    language: u.languageCode?.startsWith("km") ? "km" : (u.languageCode ? "en" : "km"),
    is_active: 1, notifications_enabled: 1, is_admin: 0,
    created_at: toDbTime(), updated_at: toDbTime()
  });
  // insert() returns different shapes across dialects/drivers
  const newId = typeof idRow === "object" && idRow !== null ? Number(Array.isArray(idRow) ? idRow[0] : idRow[0] ?? 0) : Number(idRow);
  const uid = Number.isFinite(newId) && newId > 0 ? newId : (await k("users").where({ telegram_id: u.id }).first()).id;
  await k("wallets").insert({
    user_id: uid, currency: config.store.currency, balance_minor: 0,
    lifetime_topup_minor: 0, lifetime_spend_minor: 0, created_at: toDbTime(), updated_at: toDbTime()
  });
  await bootstrapAdminIfNeeded(uid);
  return uid;
}

/** Env allowlist -> auto grant SUPER_ADMIN (idempotent). */
export async function bootstrapAdminIfNeeded(userId: number): Promise<void> {
  const k = db();
  const user = await k("users").where({ id: userId }).first();
  if (!user) return;
  const allowed = config.telegram.adminUserIds.includes(Number(user.telegram_id));
  if (!allowed) return;
  const existing = await k("admin_users").where({ user_id: userId }).first();
  if (!existing) {
    await k("admin_users").insert({
      user_id: userId, role: "SUPER_ADMIN", permissions: null, is_active: 1,
      created_at: toDbTime(), updated_at: toDbTime()
    });
  } else if (!asBool(existing.is_active) || existing.role !== "SUPER_ADMIN") {
    await k("admin_users").where({ id: existing.id }).update({ role: "SUPER_ADMIN", is_active: 1, updated_at: toDbTime() });
  }
  await k("users").where({ id: userId }).update({ is_admin: 1 });
}

export async function createSession(userId: number, method: string, userAgent?: string): Promise<{ token: string; csrf: string; expiresAt: string }> {
  const k = db();
  const t = token(32);
  const expires = new Date(Date.now() + config.sessionDays * 86400_000);
  await k("sessions").insert({
    user_id: userId, token_hash: sha256(t), auth_method: method,
    expires_at: toDbTime(expires), last_seen_at: toDbTime(), user_agent: (userAgent || "").slice(0, 500),
    created_at: toDbTime(), updated_at: toDbTime()
  });
  return { token: t, csrf: token(16), expiresAt: expires.toISOString() };
}

export async function revokeSession(rawToken: string): Promise<void> {
  await db()("sessions").where({ token_hash: sha256(rawToken) }).del();
}

export async function getSessionUser(rawToken: string | undefined): Promise<SessionUser | null> {
  if (!rawToken) return null;
  const k = db();
  const sess = await k("sessions").where({ token_hash: sha256(rawToken) }).first();
  if (!sess) return null;
  const exp = sess.expires_at instanceof Date ? sess.expires_at : new Date(String(sess.expires_at).replace(" ", "T") + "Z");
  if (exp.getTime() < Date.now()) {
    await k("sessions").where({ id: sess.id }).del();
    return null;
  }
  const user = await k("users").where({ id: sess.user_id }).first();
  if (!user) return null;
  // sliding last_seen (cheap, no await needed for correctness)
  k("sessions").where({ id: sess.id }).update({ last_seen_at: toDbTime() }).catch(() => {});
  return buildSessionUser(k, user);
}

async function buildSessionUser(k: Knex, user: any): Promise<SessionUser> {
  const wallet = await k("wallets").where({ user_id: user.id }).first();
  const admin = await k("admin_users").where({ user_id: user.id, is_active: 1 }).first();
  return {
    id: user.id,
    telegramId: asNum(user.telegram_id),
    displayName: user.display_name,
    username: user.username || null,
    photoUrl: user.photo_url || null,
    language: user.language || "km",
    isActive: asBool(user.is_active),
    notificationsEnabled: asBool(user.notifications_enabled),
    isAdmin: !!admin,
    adminRole: admin ? admin.role : null,
    adminPermissions: admin?.permissions ? safeJson(admin.permissions) : null,
    balanceMinor: asNum(wallet?.balance_minor),
    createdAt: fromDbTime(user.created_at)
  };
}

function safeJson(v: unknown): string[] {
  try { const a = typeof v === "string" ? JSON.parse(v) : v; return Array.isArray(a) ? a.map(String) : []; } catch { return []; }
}

export function hasPermission(u: SessionUser, perm: string): boolean {
  if (!u.isAdmin) return false;
  if (u.adminRole === "SUPER_ADMIN") return true;
  const perms = u.adminPermissions;
  return !!perms && perms.includes(perm);
}

export function requireAuth(req: any): SessionUser {
  const u = req.user as SessionUser | undefined;
  if (!u) throw unauthorized();
  if (!u.isActive) throw forbidden("Your account has been suspended", "ACCOUNT_DISABLED");
  return u;
}

export function requireAdmin(perm: (typeof ADMIN_PERMS)[number] | string) {
  return (req: any, _res: any, next: any) => {
    const u = req.user as SessionUser | undefined;
    if (!u) return next(unauthorized());
    if (!u.isActive) return next(forbidden("Your account has been suspended", "ACCOUNT_DISABLED"));
    if (!hasPermission(u, perm)) return next(forbidden("Admin permission required: " + perm, "ADMIN_FORBIDDEN"));
    next();
  };
}

/** simple HTML/text sanitizer for admin-delivered content rendered as text */
export function sanitizeText(s: unknown, max = 8000): string {
  return String(s ?? "").replace(/<script[\s\S]*?<\/script>/gi, "").replace(/<[^>]+>/g, "").slice(0, max);
}

export function newRef(prefix: string): string { return bizId(prefix); }
export const tokenHash = sha256;
export const randomKey = () => crypto.randomBytes(16).toString("hex");

/** safe wrapper (never throws) around the Bot API photo lookup */
export async function getUserPhotoUrlSafe(userId: number): Promise<string | undefined> {
  try {
    const { getUserPhotoUrl } = await import("./telegram");
    return await getUserPhotoUrl(userId);
  } catch { return undefined; }
}
