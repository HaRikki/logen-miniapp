import request from "supertest";
import { createApp } from "../src/app";
import { db, toDbTime } from "../src/db";
import { upsertTelegramUser, createSession, bootstrapAdminIfNeeded } from "../src/domain/auth";
import crypto from "crypto";

export const app = createApp();

export interface Authed {
  token: string;
  csrf: string;
  cookie: string;
  userId: number;
  telegramId: number;
}

/** Login through the REAL service layer (same code the verified telegram route calls). */
export async function loginAs(telegramId = nextTg()): Promise<Authed> {
  const existing = await db()("users").where({ telegram_id: telegramId }).first();
  const userId = existing ? Number(existing.id) : await upsertTelegramUser(
    { id: telegramId, firstName: `Tester${telegramId}`, username: `tester_${telegramId}` }, "MINI_APP"
  );
  const sess = await createSession(userId, "TELEGRAM_MINI_APP", "vitest");
  return { token: sess.token, csrf: sess.csrf, cookie: `ds_session=${sess.token}; ds_csrf=${sess.csrf}`, userId: Number(userId), telegramId };
}

let tgCounter = 100000;
let tgBase = Math.floor(Math.random() * 400) * 1_000_000 + 200_000_000;
export function nextTg(): number { return tgBase + ++tgCounter + (Date.now() % 977) * 1_000_000_000; }

export async function makeAdmin(a: Authed): Promise<void> {
  const k = db();
  const existing = await k("admin_users").where({ user_id: a.userId }).first();
  if (!existing) {
    await k("admin_users").insert({ user_id: a.userId, role: "SUPER_ADMIN", permissions: null, is_active: 1, created_at: toDbTime(), updated_at: toDbTime() });
    await k("users").where({ id: a.userId }).update({ is_admin: 1 });
  }
  await bootstrapAdminIfNeeded(a.userId);
}

export const bearer = (a: Authed) => ({ Authorization: `Bearer ${a.token}` });
export const json = { "content-type": "application/json" };

export async function credit(userId: number, minor: number, key?: string): Promise<void> {
  const { walletChange } = await import("../src/services/wallet");
  await db().transaction(async (trx) => {
    await walletChange({ trx, userId, type: "ADMIN_CREDIT", amountSignedMinor: minor, idempotencyKey: key || `tcredit:${userId}:${Date.now()}:${Math.random()}` });
  });
}

export async function seedProduct(opts: {
  name?: string; price?: number; cost?: number; deliveryType?: "AUTO" | "MANUAL"; stockMode?: string;
  keys?: number; active?: boolean;
}) {
  const k = db();
  const code = "PRD-" + crypto.randomBytes(4).toString("hex").toUpperCase();
  await k("products").insert({
    code, category_id: null, name: opts.name || "Test Key 10USD", description: "test", cover_url: null,
    price_minor: opts.price ?? 1000, cost_minor: opts.cost ?? 400, duration_label: "lifetime",
    delivery_type: opts.deliveryType || "AUTO", status: opts.active === false ? "INACTIVE" : "ACTIVE",
    stock_mode: opts.stockMode || "INVENTORY", is_featured: 0, is_offer: 0, sales_count: 0, view_count: 0,
    sort_order: 0, created_at: toDbTime(), updated_at: toDbTime()
  });
  const p = await k("products").where({ code }).first();
  for (let i = 0; i < (opts.keys ?? 3); i++) {
    await k("digital_inventory").insert({
      product_id: p.id, variant_id: null, item_type: "KEY", value: `KEY-${crypto.randomBytes(5).toString("hex").toUpperCase()}`,
      status: "AVAILABLE", created_at: toDbTime()
    });
  }
  return { id: Number(p.id), code };
}

/** Build valid Telegram initData with a real HMAC (same algorithm Telegram uses). */
export function buildInitData(botToken: string, user: { id: number; first_name?: string; username?: string }, authDate = Math.floor(Date.now() / 1000)): string {
  const params: Record<string, string> = {
    auth_date: String(authDate),
    user: JSON.stringify(user),
    query_id: "AAH7b9l0",
    chat_type: "sender"
  };
  const checkString = Object.keys(params).sort().map(k => `${k}=${params[k]}`).join("\n");
  const secret = crypto.createHmac("sha256", Buffer.from("WebAppData", "utf-8")).update(botToken, "utf8").digest();
  const hash = crypto.createHmac("sha256", secret).update(checkString, "utf8").digest("hex");
  return Object.entries({ ...params, hash }).map(([k, v]) => `${k}=${encodeURIComponent(v)}`).join("&");
}

export { request };
