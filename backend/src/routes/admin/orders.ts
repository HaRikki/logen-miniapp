import { Router } from "express";
import { db, toDbTime, asNum, camelAll, camel } from "../../db";
import { asyncHandler, badRequest, notFound } from "../../common/errors";
import { requireAdmin, sanitizeText } from "../../domain/auth";
import { audit } from "../../services/audit";
import { getOrderView, orderTransition, refundOrder, retryAutoDelivery, cancelOrder, finalizeOrderState } from "../../services/orders";
import { manualDeliverItem } from "../../services/deliveries";
import { notify } from "../../services/notify";
import { saveUpload } from "../user";

export const adminOrdersRouter = Router();

const ADMIN_STATUSES = ["PENDING_PAYMENT", "PAID", "PROCESSING", "COMPLETED", "FAILED", "CANCELLED", "REFUNDED"];

adminOrdersRouter.get("/orders", requireAdmin("orders"), asyncHandler(async (req, res) => {
  const page = Math.max(1, Number(req.query.page) || 1);
  const limit = Math.min(100, Math.max(1, Number(req.query.limit) || 20));
  const q = db()("orders as o");
  if (req.query.status) q.andWhere("o.status", String(req.query.status).slice(0, 24));
  if (req.query.userId) q.andWhere("o.user_id", Number(req.query.userId));
  if (req.query.q) {
    const raw = String(req.query.q).trim();
    q.where((b: any) => {
      b.whereRaw("lower(o.code) like ?", [`%${raw.toLowerCase()}%`]);
      if (/^-?\d+$/.test(raw)) b.orWhere("o.id", Number(raw));
    });
  }
  const totalRow = await q.clone().clearSelect().count({ n: "*" } as any).first();
  const rows = await q
    .select("o.*", "u.display_name as user_name", "u.telegram_id")
    .leftJoin("users as u", "u.id", "o.user_id")
    .orderBy("o.id", "desc").limit(limit).offset((page - 1) * limit);
  res.json({ total: asNum(totalRow?.n), page, items: camelAll(rows) });
}));

adminOrdersRouter.get("/orders/:code", requireAdmin("orders"), asyncHandler(async (req, res) => {
  const order = await db()("orders").where({ code: String(req.params.code).slice(0, 64) }).first();
  if (!order) throw notFound("Order not found");
  res.json({ order: await getOrderView(Number(order.id), { includeSecrets: true }) });
}));

/** Status update with strict rules (services/orders.assertTransitionAllowed). */
adminOrdersRouter.post("/orders/:id/status", requireAdmin("orders"), asyncHandler(async (req, res) => {
  const id = Number(req.params.id);
  const to = String(req.body?.status || "").toUpperCase();
  const reason = req.body?.reason ? sanitizeText(req.body.reason, 500) : undefined;
  if (!ADMIN_STATUSES.includes(to)) throw badRequest("Unknown status", "VALIDATION");
  if (to === "REFUNDED") {
    const v = await refundOrder(id, req.user!.id, reason || "Refunded by admin");
    await audit({ actorUserId: req.user!.id, action: "ORDER_REFUND", entityType: "order", entityId: id, reason, ip: req.ip });
    res.json({ order: v }); return;
  }
  if (to === "CANCELLED") {
    const v = await cancelOrder(id, null, reason || "Cancelled by admin", true);
    await audit({ actorUserId: req.user!.id, action: "ORDER_CANCEL", entityType: "order", entityId: id, reason, ip: req.ip });
    res.json({ order: v }); return;
  }
  await orderTransition(id, to, { reason, actorRole: "ADMIN", actorUserId: req.user!.id });
  await audit({ actorUserId: req.user!.id, action: "ORDER_STATUS", entityType: "order", entityId: id, after: { to }, reason, ip: req.ip });
  const order = await db()("orders").where({ id }).first();
  await notify({
    userId: Number(order.user_id), kind: `ORDER_${to}`,
    title: `Order ${order.code} → ${to}`, body: reason || "", link: `/orders/${order.code}`,
    telegramText: `Digital Store: order ${order.code} is now ${to}. ${reason || ""}`
  });
  res.json({ order: await getOrderView(id) });
}));

/** Manual delivery: admin supplies content, secret and/or file. */
adminOrdersRouter.post("/orders/:id/deliver", requireAdmin("delivery"), asyncHandler(async (req, res) => {
  const orderId = Number(req.params.id);
  const orderItemId = Number(req.body?.orderItemId);
  if (!orderItemId) throw badRequest("orderItemId is required", "VALIDATION");
  const k = db();
  const item = await k("order_items").where({ id: orderItemId, order_id: orderId }).first();
  if (!item) throw notFound("Order item not found");

  let filePath: string | null = null;
  let fileName: string | null = null;
  if (String(req.body?.contentKind || "") === "FILE") {
    throw badRequest("Upload the file first via /api/admin/orders/file then pass filePath/fileName", "USE_UPLOAD");
  }
  if (req.body?.filePath) { filePath = sanitizeText(req.body.filePath, 500) || null; fileName = sanitizeText(req.body.fileName || "delivery-file", 200); }

  const r = await manualDeliverItem({
    orderId, orderItemId, adminId: req.user!.id,
    text: req.body?.text ? String(req.body.text) : undefined,
    secret: req.body?.secret ? String(req.body.secret).slice(0, 8000) : undefined,
    filePath, fileName
  });
  if (!r.ok) throw badRequest(r.error || "delivery failed", "DELIVERY_FAILED");
  await finalizeOrderState(orderId);
  await audit({ actorUserId: req.user!.id, action: "MANUAL_DELIVERY", entityType: "order_item", entityId: orderItemId, after: { text: req.body?.text, hasSecret: !!req.body?.secret, file: fileName }, ip: req.ip });
  res.json({ ok: true, order: await getOrderView(orderId, { includeSecrets: true }) });
}));

adminOrdersRouter.post("/orders/deliver-file", requireAdmin("delivery"), async (req, res, next) => {
  saveUploadMiddleware(req, res, (err: any) => {
    if (err) return next(err);
    next();
  });
}, asyncHandler(async (req, res) => {
  if (!(req as any).file) throw badRequest("file is required", "NO_FILE");
  const saved = saveUpload((req as any).file, "files");
  await audit({ actorUserId: req.user!.id, action: "DELIVERY_FILE_UPLOAD", entityType: "upload", entityId: saved, ip: req.ip });
  res.status(201).json({ filePath: saved, fileName: (req as any).file.originalname });
}));

import multer from "multer";
const saveUploadMiddleware = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 15 * 1024 * 1024 },
  fileFilter: (_rq: any, file: any, cb: any) => {
    const ok = /application\/(pdf|zip)|text\/plain|image\/(png|jpe?g|webp)/i.test(file.mimetype);
    if (ok) cb(null, true); else cb(badRequest("Allowed: PDF/ZIP/TXT/images", "BAD_FILE"));
  }
}).single("file");

adminOrdersRouter.post("/orders/:id/retry", requireAdmin("delivery"), asyncHandler(async (req, res) => {
  const orderId = Number(req.params.id);
  const k = db();
  const items = await k("order_items").where({ order_id: orderId, delivery_type: "AUTO", delivery_status: ["PENDING", "FAILED"] });
  const ids = items.map((i: any) => Number(i.id));
  if (!ids.length) { res.json({ ok: false, error: "No failed/pending auto items" }); return; }
  const r = await retryAutoDelivery(ids, req.user!.id);
  await audit({ actorUserId: req.user!.id, action: "ORDER_RETRY_DELIVERY", entityType: "order", entityId: orderId, after: r, ip: req.ip });
  res.json({ ...r, order: await getOrderView(orderId, { includeSecrets: true }) });
}));

/** Queues for the delivery workspace. */
adminOrdersRouter.get("/delivery/queue", requireAdmin("delivery"), asyncHandler(async (_req, res) => {
  const k = db();
  const manual = await k("order_items as oi")
    .join("orders as o", "o.id", "oi.order_id")
    .where({ "oi.delivery_type": "MANUAL" })
    .whereIn("o.status", ["PAID", "PROCESSING"])
    .andWhereNot("oi.delivery_status", "DELIVERED")
    .select("oi.*", "o.code as order_code", "o.status as order_status", "o.user_id", "o.created_at as ordered_at", "u.display_name as user_name")
    .leftJoin("users as u", "u.id", "o.user_id")
    .orderBy("oi.id", "asc").limit(100);
  const autoFailed = await k("order_items as oi")
    .join("orders as o", "o.id", "oi.order_id")
    .where({ "oi.delivery_type": "AUTO", "oi.delivery_status": "FAILED" })
    .select("oi.*", "o.code as order_code", "o.status as order_status", "u.display_name as user_name")
    .leftJoin("users as u", "u.id", "o.user_id")
    .orderBy("oi.id", "desc").limit(100);
  const recent = camelAll(await k("deliveries as d").leftJoin("orders as o", "o.id", "d.order_id")
    .leftJoin("users as u", "u.id", "o.user_id")
    .select("d.id", "d.kind", "d.status", "d.order_id", "o.code as order_code", "u.display_name as user_name", "d.created_at", "d.attempt_count")
    .orderBy("d.id", "desc").limit(50));
  res.json({
    manual: camelAll(manual).map((x: any) => ({ ...x, contentText: undefined, secretPayload: undefined })),
    autoFailed: camelAll(autoFailed).map((x: any) => ({ ...x, deliveryError: x.deliveryError })),
    recent
  });
}));

adminOrdersRouter.get("/orders-meta", requireAdmin("orders"), asyncHandler(async (_req, res) => {
  res.json({ statuses: ADMIN_STATUSES });
}));
