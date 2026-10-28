import { Router } from "express";
import { db, toDbTime, asNum, camel, camelAll } from "../../db";
import { asyncHandler, badRequest, notFound } from "../../common/errors";
import { requireAdmin, sanitizeText } from "../../domain/auth";
import { listProviders, approveDeposit, rejectDeposit } from "../../services/deposits";
import { audit } from "../../services/audit";
import { getSetting, putSetting, SETTING_DEFAULTS } from "../../services/settings";

export const adminPaymentsRouter = Router();

const STATUSES = ["PENDING", "APPROVED", "REJECTED", "EXPIRED"];

adminPaymentsRouter.get("/deposits", requireAdmin("payments"), asyncHandler(async (req, res) => {
  const page = Math.max(1, Number(req.query.page) || 1);
  const limit = Math.min(100, Math.max(1, Number(req.query.limit) || 20));
  const status = req.query.status ? String(req.query.status).toUpperCase() : null;
  if (status && !STATUSES.includes(status)) throw badRequest("Unknown status", "VALIDATION");
  const k = db();
  const q = k("deposits as d");
  if (status) q.where("d.status", status);
  if (req.query.q) {
    const raw = String(req.query.q).trim().toLowerCase();
    q.where((b: any) => b.whereRaw("lower(d.code) like ?", [`%${raw}%`]).orWhereRaw("lower(d.txn_ref) like ?", [`%${raw}%`]));
  }
  const totalRow = await q.clone().clearSelect().count({ n: "*" } as any).first();
  const rows = await q
    .select("d.*", "u.display_name as user_name", "u.telegram_id")
    .leftJoin("users as u", "u.id", "d.user_id")
    .orderBy("d.id", "desc").limit(limit).offset((page - 1) * limit);
  res.json({ total: asNum(totalRow?.n), items: camelAll(rows) });
}));

adminPaymentsRouter.post("/deposits/:id/approve", requireAdmin("payments"), asyncHandler(async (req, res) => {
  const id = Number(req.params.id);
  if (!(await db()("deposits").where({ id }).first())) throw notFound("Deposit not found");
  const note = req.body?.note ? sanitizeText(req.body.note, 500) : undefined;
  const r = await approveDeposit(id, req.user!.id, note);
  await audit({ actorUserId: req.user!.id, action: "DEPOSIT_APPROVE", entityType: "deposit", entityId: id, after: { skipped: r.skipped }, reason: note, ip: req.ip });
  res.json(r);
}));

adminPaymentsRouter.post("/deposits/:id/reject", requireAdmin("payments"), asyncHandler(async (req, res) => {
  const id = Number(req.params.id);
  const reason = sanitizeText(req.body?.reason || "", 500);
  const r = await rejectDeposit(id, req.user!.id, reason);
  await audit({ actorUserId: req.user!.id, action: "DEPOSIT_REJECT", entityType: "deposit", entityId: id, reason, ip: req.ip });
  res.json(r);
}));

adminPaymentsRouter.get("/deposit-proof/:depositId", requireAdmin("payments"), asyncHandler(async (req, res) => {
  const fs = require("fs");
  const path = require("path");
  const { config } = await import("../../config");
  const dep = await db()("deposits").where({ id: Number(req.params.depositId) }).first();
  if (!dep || !dep.proof_path) throw notFound("No proof uploaded");
  const rel = require("path").normalize(String(dep.proof_path));
  if (rel.startsWith("..") || rel.startsWith("/")) throw badRequest("Bad path", "PATH");
  const abs = path.join(config.uploads.dir, rel);
  if (!fs.existsSync(abs)) throw notFound("File missing");
  res.setHeader("X-Content-Type-Options", "nosniff");
  fs.createReadStream(abs).pipe(res);
}));

adminPaymentsRouter.get("/payment-methods", requireAdmin("payments"), asyncHandler(async (_req, res) => {
  res.json({ items: await listProviders(false) });
}));

adminPaymentsRouter.post("/payment-methods", requireAdmin("payments"), asyncHandler(async (req, res) => {
  const b = req.body || {};
  if (!b.code || !b.name) throw badRequest("code and name are required", "VALIDATION");
  const code = String(b.code).toUpperCase().replace(/[^A-Z0-9_-]/g, "").slice(0, 32);
  const k = db();
  if (await k("payment_providers").where({ code }).first()) throw badRequest("Code already exists", "DUP");
  await k("payment_providers").insert({
    code, name: String(b.name).slice(0, 128), mode: b.mode === "GATEWAY" ? "GATEWAY" : "MANUAL",
    account_name: b.accountName ? String(b.accountName).slice(0, 255) : null,
    account_number: b.accountNumber ? String(b.accountNumber).slice(0, 128) : null,
    qr_url: b.qrUrl ? String(b.qrUrl).slice(0, 1024) : null,
    instructions: sanitizeText(b.instructions || "", 4000) || null,
    min_minor: Math.round(Number(b.minMinor || 100)), max_minor: Math.round(Number(b.maxMinor || 0)),
    currency: b.currency ? String(b.currency).slice(0, 8) : "USD",
    sort_order: Number(b.sortOrder) || 0, is_active: b.isActive === false ? 0 : 1,
    created_at: toDbTime(), updated_at: toDbTime()
  });
  const saved = await k("payment_providers").where({ code }).first();
  await audit({ actorUserId: req.user!.id, action: "PROVIDER_CREATE", entityType: "payment_provider", entityId: saved?.id ?? code, after: b, ip: req.ip });
  res.status(201).json({ id: saved?.id, code });
}));

adminPaymentsRouter.put("/payment-methods/:id", requireAdmin("payments"), asyncHandler(async (req, res) => {
  const id = Number(req.params.id);
  const k = db();
  const before = await k("payment_providers").where({ id }).first();
  if (!before) throw notFound("Payment method not found");
  const b = req.body || {};
  await k("payment_providers").where({ id }).update({
    name: b.name !== undefined ? String(b.name).slice(0, 128) : before.name,
    mode: b.mode !== undefined ? (b.mode === "GATEWAY" ? "GATEWAY" : "MANUAL") : before.mode,
    account_name: b.accountName !== undefined ? String(b.accountName).slice(0, 255) : before.account_name,
    account_number: b.accountNumber !== undefined ? String(b.accountNumber).slice(0, 128) : before.account_number,
    qr_url: b.qrUrl !== undefined ? (b.qrUrl ? String(b.qrUrl).slice(0, 1024) : null) : before.qr_url,
    instructions: b.instructions !== undefined ? sanitizeText(b.instructions, 4000) || null : before.instructions,
    min_minor: b.minMinor !== undefined ? Math.round(Number(b.minMinor)) : before.min_minor,
    max_minor: b.maxMinor !== undefined ? Math.round(Number(b.maxMinor)) : before.max_minor,
    currency: b.currency !== undefined ? String(b.currency).slice(0, 8) : before.currency,
    sort_order: b.sortOrder !== undefined ? Number(b.sortOrder) : before.sort_order,
    is_active: b.isActive !== undefined ? (b.isActive ? 1 : 0) : before.is_active,
    updated_at: toDbTime()
  });
  await audit({ actorUserId: req.user!.id, action: "PROVIDER_UPDATE", entityType: "payment_provider", entityId: id, before, after: b, ip: req.ip });
  res.json({ ok: true });
}));

adminPaymentsRouter.delete("/payment-methods/:id", requireAdmin("payments"), asyncHandler(async (req, res) => {
  const id = Number(req.params.id);
  const before = await db()("payment_providers").where({ id }).first();
  if (!before) throw notFound("Payment method not found");
  await db()("payment_providers").where({ id }).update({ is_active: 0 });
  await audit({ actorUserId: req.user!.id, action: "PROVIDER_DISABLE", entityType: "payment_provider", entityId: id, before, ip: req.ip });
  res.json({ ok: true });
}));

adminPaymentsRouter.get("/logs", requireAdmin("payments"), asyncHandler(async (req, res) => {
  const rows = await db()("payments as p")
    .leftJoin("users as u", "u.id", "p.user_id")
    .select("p.*", "u.display_name as user_name", "u.telegram_id")
    .orderBy("p.id", "desc").limit(100);
  res.json({ items: camelAll(rows) });
}));

// ---------------- promotions ----------------
const promoRouter = Router();
promoRouter.get("/", requireAdmin("promotions"), asyncHandler(async (_req, res) => {
  const rows = await db()("promotions").orderBy("id", "desc");
  res.json({ items: camelAll(rows).map((r: any) => ({ ...r, productIds: safeParse(r.productIds) })) });
}));
function safeParse(v: unknown) { try { return v ? JSON.parse(String(v)) : null; } catch { return null; } }

promoRouter.post("/", requireAdmin("promotions"), asyncHandler(async (req, res) => {
  const b = req.body || {};
  const code = String(b.code || "").trim().toUpperCase().replace(/\s+/g, "").slice(0, 64);
  if (!code || !b.name) throw badRequest("code and name are required", "VALIDATION");
  const k = db();
  if (await k("promotions").where({ code }).first()) throw badRequest("Code already exists", "DUP");
  const value = Math.round(Number(b.valueMinor ?? (b.kind === "PERCENT" ? Number(b.percentValue ?? 0) * 100 : Number(b.amount ?? 0) * 100)));
  await k("promotions").insert({
    code, name: String(b.name).slice(0, 255),
    kind: b.kind === "FIXED" ? "FIXED" : "PERCENT",
    value_minor: Number.isFinite(value) && value > 0 ? value : 0,
    max_discount_minor: Math.round(Number(b.maxDiscountMinor ?? (b.maxDiscount ? Number(b.maxDiscount) * 100 : 0)) || 0),
    min_order_minor: Math.round(Number(b.minOrderMinor ?? (b.minOrder ? Number(b.minOrder) * 100 : 0)) || 0),
    usage_limit: Math.round(Number(b.usageLimit || 0)), per_user_limit: Math.max(1, Math.round(Number(b.perUserLimit || 1))),
    product_ids: Array.isArray(b.productIds) && b.productIds.length ? JSON.stringify(b.productIds.map(Number)) : null,
    starts_at: b.startsAt ? toDbTime(new Date(b.startsAt)) : toDbTime(),
    ends_at: b.endsAt ? toDbTime(new Date(b.endsAt)) : toDbTime(new Date(Date.now() + 30 * 86400_000)),
    is_active: b.isActive === false ? 0 : 1, created_by: req.user!.id,
    created_at: toDbTime(), updated_at: toDbTime()
  });
  const saved = await k("promotions").where({ code }).first();
  await audit({ actorUserId: req.user!.id, action: "PROMO_CREATE", entityType: "promotion", entityId: saved?.id ?? code, after: b, ip: req.ip });
  res.status(201).json({ id: saved?.id });
}));

promoRouter.put("/:id", requireAdmin("promotions"), asyncHandler(async (req, res) => {
  const id = Number(req.params.id);
  const k = db();
  const before = await k("promotions").where({ id }).first();
  if (!before) throw notFound("Promotion not found");
  const b = req.body || {};
  await k("promotions").where({ id }).update({
    name: b.name !== undefined ? String(b.name).slice(0, 255) : before.name,
    value_minor: b.valueMinor !== undefined ? Math.round(Number(b.valueMinor)) : before.value_minor,
    max_discount_minor: b.maxDiscountMinor !== undefined ? Math.round(Number(b.maxDiscountMinor)) : before.max_discount_minor,
    min_order_minor: b.minOrderMinor !== undefined ? Math.round(Number(b.minOrderMinor)) : before.min_order_minor,
    usage_limit: b.usageLimit !== undefined ? Math.round(Number(b.usageLimit)) : before.usage_limit,
    per_user_limit: b.perUserLimit !== undefined ? Math.max(1, Math.round(Number(b.perUserLimit))) : before.per_user_limit,
    product_ids: b.productIds !== undefined ? (Array.isArray(b.productIds) && b.productIds.length ? JSON.stringify(b.productIds.map(Number)) : null) : before.product_ids,
    starts_at: b.startsAt !== undefined ? toDbTime(new Date(b.startsAt)) : before.starts_at,
    ends_at: b.endsAt !== undefined ? toDbTime(new Date(b.endsAt)) : before.ends_at,
    is_active: b.isActive !== undefined ? (b.isActive ? 1 : 0) : before.is_active,
    updated_at: toDbTime()
  });
  await audit({ actorUserId: req.user!.id, action: "PROMO_UPDATE", entityType: "promotion", entityId: id, before, after: b, ip: req.ip });
  res.json({ ok: true });
}));

promoRouter.delete("/:id", requireAdmin("promotions"), asyncHandler(async (req, res) => {
  const id = Number(req.params.id);
  const before = await db()("promotions").where({ id }).first();
  if (!before) throw notFound("Promotion not found");
  await db()("promotions").where({ id }).update({ is_active: 0 });
  await audit({ actorUserId: req.user!.id, action: "PROMO_DISABLE", entityType: "promotion", entityId: id, before, ip: req.ip });
  res.json({ ok: true });
}));

export const adminPromotionsRouter = promoRouter;

// ---------------- settings ----------------
export const adminSettingsRouter = Router();

adminSettingsRouter.get("/settings/:group", requireAdmin("settings"), asyncHandler(async (req, res) => {
  const group = String(req.params.group);
  if (!(group in SETTING_DEFAULTS)) throw badRequest("Unknown settings group", "VALIDATION");
  const saved = await getSetting(group);
  const defaults = (SETTING_DEFAULTS as any)[group];
  const out = { ...defaults, ...(saved || {}) };
  res.json({ group, settings: out });
}));

adminSettingsRouter.put("/settings/:group", requireAdmin("settings"), asyncHandler(async (req, res) => {
  const group = String(req.params.group);
  if (!(group in SETTING_DEFAULTS)) throw badRequest("Unknown settings group", "VALIDATION");
  const before = await getSetting(group);
  const patch = req.body?.settings;
  if (!patch || typeof patch !== "object") throw badRequest("settings object required", "VALIDATION");
  const merged = { ...(SETTING_DEFAULTS as any)[group], ...(before || {}), ...clean(patch) };
  await putSetting(group, merged, req.user!.id);
  await audit({ actorUserId: req.user!.id, action: "SETTINGS_UPDATE", entityType: group, entityId: group, before, after: merged, ip: req.ip });
  res.json({ ok: true, settings: merged });
}));

function clean(obj: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(obj)) out[k] = typeof v === "string" ? sanitizeText(v, 4000) : (typeof v === "number" || typeof v === "boolean") ? v : v;
  return out;
}

// ---------------- audit logs ----------------
adminSettingsRouter.get("/audit-logs", requireAdmin("audit"), asyncHandler(async (req, res) => {
  const page = Math.max(1, Number(req.query.page) || 1);
  const limit = Math.min(100, Number(req.query.limit) || 30);
  const q = db()("audit_logs as a");
  if (req.query.entityType) q.where("a.entity_type", String(req.query.entityType).slice(0, 32));
  const totalRow = await q.clone().clearSelect().count({ n: "*" } as any).first();
  const rows = await q
    .select("a.*", "u.display_name as actor_name", "u.telegram_id as actor_telegram_id")
    .leftJoin("users as u", "u.id", "a.actor_user_id")
    .orderBy("a.id", "desc").limit(limit).offset((page - 1) * limit);
  res.json({ total: asNum(totalRow?.n), items: camelAll(rows) });
}));
