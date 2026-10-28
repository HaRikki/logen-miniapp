import { Router } from "express";
import { db, toDbTime, asNum, camel, camelAll } from "../../db";
import { asyncHandler, badRequest, notFound, conflict } from "../../common/errors";
import { requireAdmin } from "../../domain/auth";
import { walletChange } from "../../services/wallet";
import { audit } from "../../services/audit";
import { notify } from "../../services/notify";

export const adminUsersRouter = Router();

adminUsersRouter.get("/users", requireAdmin("users"), asyncHandler(async (req, res) => {
  const page = Math.max(1, Number(req.query.page) || 1);
  const limit = Math.min(100, Math.max(1, Number(req.query.limit) || 20));
  const q = db()("users as u");
  if (req.query.q) {
    const raw = String(req.query.q).trim();
    const like = `%${raw.toLowerCase()}%`;
    q.where((b: any) => {
      b.whereRaw("lower(u.username) like ?", [like])
        .orWhereRaw("lower(u.display_name) like ?", [like]);
      if (/^-?\d+$/.test(raw)) b.orWhere("u.telegram_id", Number(raw));
    });
  }
  const totalRow = await q.clone().clearSelect().count({ n: "*" } as any).first();
  const rows = await q
    .select("u.id", "u.telegram_id", "u.username", "u.display_name", "u.photo_url", "u.is_active",
      "u.is_admin", "u.created_at", "w.balance_minor", "w.currency",
      db().raw("(select count(*) from orders o where o.user_id = u.id) as orders_count"))
    .leftJoin("wallets as w", "w.user_id", "u.id")
    .orderBy("u.id", "desc").limit(limit).offset((page - 1) * limit);
  res.json({ total: asNum(totalRow?.n), page, items: camelAll(rows) });
}));

adminUsersRouter.get("/users/:id", requireAdmin("users"), asyncHandler(async (req, res) => {
  const k = db();
  const id = Number(req.params.id);
  const user = camel(await k("users").where({ id }).first());
  if (!user) throw notFound("User not found");
  const wallet = camel(await k("wallets").where({ user_id: id }).first());
  const orders = camelAll(await k("orders").where({ user_id: id }).orderBy("id", "desc").limit(20));
  const txns = camelAll(await k("wallet_transactions").where({ user_id: id }).orderBy("id", "desc").limit(20));
  res.json({ user: { ...user, photoUrl: user.photoUrl, telegramPass: undefined }, wallet, orders, txns });
}));

/** Admin credit/debit with mandatory reason + audit + wallet transaction (single trx). */
adminUsersRouter.post("/users/:id/balance", requireAdmin("users"), asyncHandler(async (req, res) => {
  const id = Number(req.params.id);
  const b = req.body || {};
  const deltaMinor = Math.round(Number(b.amountMinor ?? (b.amount ? Number(b.amount) * 100 : NaN)));
  const kind = String(b.kind || "").toUpperCase();
  const reason = String(b.reason || "").trim();
  if (!["CREDIT", "DEBIT"].includes(kind)) throw badRequest("kind must be CREDIT or DEBIT", "VALIDATION");
  if (!Number.isFinite(deltaMinor) || deltaMinor <= 0) throw badRequest("amountMinor must be a positive integer", "VALIDATION");
  if (reason.length < 3) throw badRequest("A reason (min 3 chars) is mandatory for balance changes", "REASON_REQUIRED");
  const k = db();
  const user = await k("wallets").where({ user_id: id }).first();
  if (!user) throw notFound("User/wallet not found");
  const beforeBalance = asNum(user.balance_minor);
  if (kind === "DEBIT" && beforeBalance < deltaMinor) {
    throw conflict(`Balance too low (${beforeBalance} minor). Cannot debit ${deltaMinor}.`, "DEBIT_TOO_HIGH");
  }
  const out = await k.transaction(async (trx) => {
    return await walletChange({
      trx, userId: id, type: kind === "CREDIT" ? "ADMIN_CREDIT" : "ADMIN_DEBIT",
      amountSignedMinor: kind === "CREDIT" ? deltaMinor : -deltaMinor,
      createdById: req.user!.id, reason, idempotencyKey: b.idempotencyKey ? String(b.idempotencyKey) : `adm:${Date.now()}:${Math.random()}`
    });
  });
  await audit({
    actorUserId: req.user!.id, action: `BALANCE_${kind}`, entityType: "user", entityId: id,
    before: { balanceMinor: beforeBalance }, after: { balanceMinor: out.balanceAfter, deltaMinor }, reason, ip: req.ip
  });
  await notify({
    userId: id, kind: kind === "CREDIT" ? "ADMIN_CREDIT" : "ADMIN_DEBIT",
    title: kind === "CREDIT" ? `+${(deltaMinor / 100).toFixed(2)} credited by support` : `-${(deltaMinor / 100).toFixed(2)} adjusted by support`,
    body: reason, link: "/wallet"
  });
  res.json({ ok: true, balanceMinor: out.balanceAfter, txnRef: out.ref });
}));

adminUsersRouter.post("/users/:id/status", requireAdmin("users"), asyncHandler(async (req, res) => {
  const id = Number(req.params.id);
  const active = req.body?.isActive !== false;
  const k = db();
  const before = await k("users").where({ id }).first();
  if (!before) throw notFound("User not found");
  await k("users").where({ id }).update({ is_active: active ? 1 : 0, updated_at: toDbTime() });
  if (!active) await k("sessions").where({ user_id: id }).del(); // force sign-out on disable
  await audit({ actorUserId: req.user!.id, action: active ? "USER_ENABLE" : "USER_DISABLE", entityType: "user", entityId: id, before, ip: req.ip });
  res.json({ ok: true });
}));

// -------- admin staff management --------
adminUsersRouter.get("/admins", requireAdmin("settings"), asyncHandler(async (_req, res) => {
  const k = db();
  const rows = await k("admin_users as a").join("users as u", "u.id", "a.user_id")
    .select("a.*", "u.telegram_id", "u.display_name", "u.username");
  res.json({ items: camelAll(rows).map((r: any) => ({ ...r, userId: r.user ? r.user : r.userId })) });
}));

adminUsersRouter.put("/admins/:telegramId", requireAdmin("settings"), asyncHandler(async (req, res) => {
  const tgid = Number(req.params.telegramId);
  if (!Number.isFinite(tgid) || tgid <= 0) throw badRequest("Invalid Telegram user id", "VALIDATION");
  const b = req.body || {};
  const role = ["SUPER_ADMIN", "STAFF"].includes(b.role) ? b.role : null;
  if (!role) throw badRequest("role must be SUPER_ADMIN or STAFF", "VALIDATION");
  const perms = Array.isArray(b.permissions) ? b.permissions.map(String).slice(0, 20) : null;
  const k = db();
  const user = await k("users").where({ telegram_id: tgid }).first();
  if (!user) throw notFound("That Telegram user must sign in at least once before being granted admin", "USER_NOT_SEEN");
  const now = toDbTime();
  const existing = await k("admin_users").where({ user_id: user.id }).first();
  if (existing) {
    await k("admin_users").where({ id: existing.id }).update({ role, permissions: perms ? JSON.stringify(perms) : null, is_active: b.isActive === false ? 0 : 1, updated_at: now });
  } else {
    await k("admin_users").insert({ user_id: user.id, role, permissions: perms ? JSON.stringify(perms) : null, is_active: 1, created_by: req.user!.id, created_at: now, updated_at: now });
  }
  await k("users").where({ id: user.id }).update({ is_admin: 1 });
  await audit({ actorUserId: req.user!.id, action: "ADMIN_SET", entityType: "admin_user", entityId: tgid, after: { role, perms }, ip: req.ip });
  res.json({ ok: true });
}));

adminUsersRouter.delete("/admins/:userId", requireAdmin("settings"), asyncHandler(async (req, res) => {
  const userId = Number(req.params.userId);
  if (userId === req.user!.id) throw conflict("You cannot remove your own admin access", "SELF");
  await db()("admin_users").where({ user_id: userId }).del();
  await db()("users").where({ id: userId }).update({ is_admin: 0 });
  await audit({ actorUserId: req.user!.id, action: "ADMIN_REMOVE", entityType: "admin_user", entityId: userId, ip: req.ip });
  res.json({ ok: true });
}));
