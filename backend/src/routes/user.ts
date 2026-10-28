import { Router } from "express";
import path from "path";
import fs from "fs";
import multer from "multer";
import crypto from "crypto";
import { db, toDbTime, asNum, camel, camelAll } from "../db";
import { config } from "../config";
import { asyncHandler, badRequest, forbidden, notFound } from "../common/errors";
import { requireAuth } from "../domain/auth";
import { createOrder, payOrderFromWallet, cancelOrder, getOrderView } from "../services/orders";
import { listProviders, createDeposit } from "../services/deposits";
import { getBalance } from "../services/wallet";
import { fmtMoney } from "../common/money";

export const userRouter = Router();

// ---------------- orders ----------------
userRouter.post("/orders", asyncHandler(async (req, res) => {
  const user = requireAuth(req);
  const items = Array.isArray(req.body?.items) ? req.body.items : [];
  const order = await createOrder(user.id, {
    items: items.slice(0, 10).map((i: any) => ({
      productId: Number(i.productId), variantId: i.variantId ? Number(i.variantId) : null, quantity: Number(i.quantity ?? 1)
    })),
    promoCode: req.body?.promoCode ? String(req.body.promoCode).slice(0, 64) : undefined,
    deliveryAccount: req.body?.deliveryAccount ? String(req.body.deliveryAccount) : undefined,
    customerNote: req.body?.customerNote ? String(req.body.customerNote) : undefined
  });
  res.status(201).json({ order });
}));

userRouter.get("/orders", asyncHandler(async (req, res) => {
  const user = requireAuth(req);
  const page = Math.max(1, Number(req.query.page) || 1);
  const limit = Math.min(50, Math.max(1, Number(req.query.limit) || 15));
  const q = db()("orders").where({ user_id: user.id });
  if (req.query.status) q.andWhere("status", String(req.query.status).slice(0, 24));
  if (req.query.q) {
    const s = `%${String(req.query.q).toLowerCase()}%`;
    q.whereRaw("lower(code) like ?", [s]);
  }
  const totalRow = await q.clone().clearSelect().count({ n: "*" } as any).first();
  const rows = await q.orderBy("id", "desc").limit(limit).offset((page - 1) * limit);
  const out = [];
  for (const r of rows) out.push(await summarizeOrder(r));
  res.json({ total: asNum(totalRow?.n), page, items: out });
}));

async function summarizeOrder(order: any) {
  const items = await db()("order_items").where({ order_id: order.id });
  return {
    id: Number(order.id), code: order.code, status: order.status,
    totalMinor: asNum(order.total_minor), currency: order.currency,
    itemCount: items.length,
    firstProduct: items[0]?.product_name || "",
    createdAt: String(order.created_at)
  };
}

userRouter.get("/orders/:code", asyncHandler(async (req, res) => {
  const user = requireAuth(req);
  const order = await db()("orders").where({ code: String(req.params.code).slice(0, 64) }).first();
  if (!order) throw notFound("Order not found");
  if (Number(order.user_id) !== user.id) throw forbidden("This is not your order");
  res.json({ order: await getOrderView(Number(order.id), { includeSecrets: true }) });
}));

const payLimiter = new Map<string, number>(); // simple double-click guard; DB transaction is the real lock
userRouter.post("/orders/:code/pay", asyncHandler(async (req, res) => {
  const user = requireAuth(req);
  const k = db();
  const order = await k("orders").where({ code: String(req.params.code).slice(0, 64) }).first();
  if (!order) throw notFound("Order not found");
  if (Number(order.user_id) !== user.id) throw forbidden("This is not your order");
  const lockKey = `${user.id}:${order.id}`;
  const last = payLimiter.get(lockKey) || 0;
  if (Date.now() - last < 1500) { res.status(429).json({ error: { code: "DOUBLE_CLICK", message: "Please wait…" } }); return; }
  payLimiter.set(lockKey, Date.now());
  if (payLimiter.size > 500) for (const [kk, t] of payLimiter) if (Date.now() - t > 60_000) payLimiter.delete(kk);

  const balance = await getBalance(user.id);
  if (balance < asNum(order.total_minor)) {
    res.status(409).json({
      error: {
        code: "INSUFFICIENT_BALANCE",
        message: `Not enough balance. You have ${fmtMoney(balance)} but need ${fmtMoney(asNum(order.total_minor))}. Please top up your wallet.`,
        details: { balanceMinor: balance, requiredMinor: asNum(order.total_minor) }
      }
    });
    return;
  }
  const updated = await payOrderFromWallet({ orderId: Number(order.id), userId: user.id });
  res.json({ order: updated });
}));

userRouter.post("/orders/:code/cancel", asyncHandler(async (req, res) => {
  const user = requireAuth(req);
  const k = db();
  const order = await k("orders").where({ code: String(req.params.code).slice(0, 64) }).first();
  if (!order) throw notFound("Order not found");
  if (Number(order.user_id) !== user.id) throw forbidden("This is not your order");
  const view = await cancelOrder(Number(order.id), user.id, "Cancelled by user");
  res.json({ order: view });
}));

// ---------------- wallet & deposits ----------------
userRouter.get("/wallet", asyncHandler(async (req, res) => {
  const user = requireAuth(req);
  const w = await db()("wallets").where({ user_id: user.id }).first();
  res.json({
    balanceMinor: asNum(w?.balance_minor),
    currency: w?.currency || config.store.currency,
    lifetimeTopupMinor: asNum(w?.lifetime_topup_minor),
    lifetimeSpendMinor: asNum(w?.lifetime_spend_minor)
  });
}));

userRouter.get("/wallet/transactions", asyncHandler(async (req, res) => {
  const user = requireAuth(req);
  const page = Math.max(1, Number(req.query.page) || 1);
  const limit = Math.min(100, Math.max(1, Number(req.query.limit) || 20));
  const totalRow = await db()("wallet_transactions").where({ user_id: user.id }).count({ n: "*" } as any).first();
  const rows = await db()("wallet_transactions").where({ user_id: user.id }).orderBy("id", "desc").limit(limit).offset((page - 1) * limit);
  res.json({ total: asNum(totalRow?.n), items: camelAll(rows) });
}));

userRouter.get("/payment-methods", asyncHandler(async (_req, res) => {
  const providers = await listProviders(true);
  // QR image/instructions are safe for public display; account numbers partially masked
  res.json({
    autoVerification: false, // honest flag: manual approval until a real gateway is connected
    items: providers.map(p => ({ ...p, accountNumber: maskAcct(p.accountNumber) }))
  });
}));
function maskAcct(v: any) { const s = String(v || ""); return s.length <= 4 ? s : s.slice(0, 2) + "•".repeat(Math.max(0, s.length - 6)) + s.slice(-4); }

userRouter.post("/deposits", asyncHandler(async (req, res) => {
  const user = requireAuth(req);
  const amountMinor = Math.round(Number(req.body?.amountMinor ?? (req.body?.amount ? Number(req.body.amount) * 100 : NaN)));
  if (!Number.isFinite(amountMinor) || amountMinor <= 0) throw badRequest("Enter a valid amount", "AMOUNT");
  const proofPath = req.body?.proofPath ? safeUploadPath(String(req.body.proofPath)) : null;
  const dep = await createDeposit(user.id, {
    providerCode: String(req.body?.providerCode || ""),
    amountMinor,
    txnRef: req.body?.txnRef ? String(req.body.txnRef) : undefined,
    proofPath
  });
  res.status(201).json({ deposit: dep });
}));

userRouter.get("/deposits", asyncHandler(async (req, res) => {
  const user = requireAuth(req);
  const rows = await db()("deposits").where({ user_id: user.id }).orderBy("id", "desc").limit(50);
  res.json({ items: camelAll(rows).map(d => ({ ...d, proofPath: undefined })) });
}));

/**
 * Upload payment proof — image only, size capped, stored out of web root and
 * only readable by owner/admin through signed paths (never listed publicly).
 */
const proofUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: config.uploads.maxBytes },
  fileFilter: (_req, file, cb) => {
    const ok = /^image\/(png|jpe?g|webp)$/i.test(file.mimetype);
    if (ok) cb(null, true); else cb(badRequest("Only PNG/JPG/WEBP images are accepted", "BAD_FILE"));
  }
});

userRouter.post("/uploads/proof", proofUpload.single("file"), asyncHandler(async (req, res) => {
  requireAuth(req);
  if (!req.file) throw badRequest("file is required", "NO_FILE");
  const p = saveUpload(req.file, "proofs");
  res.status(201).json({ path: p, name: req.file.originalname });
}));

function saveUpload(file: Express.Multer.File, kind: string): string {
  const ext = path.extname(file.originalname || "").toLowerCase().slice(0, 8).replace(/[^.a-z0-9]/g, "");
  const name = `${kind}-${Date.now()}-${crypto.randomBytes(6).toString("hex")}${ext}`;
  const dir = path.join(config.uploads.dir, kind);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, name), file.buffer);
  return `${kind}/${name}`;
}

function safeUploadPath(rel: string): string | null {
  const cleaned = path.normalize(rel).replace(/^(\.\.[/\\])+/, "");
  if (cleaned.startsWith("/") || cleaned.includes("..")) return null;
  const abs = path.join(config.uploads.dir, cleaned);
  if (!abs.startsWith(config.uploads.dir)) return null;
  return fs.existsSync(abs) ? cleaned : null;
}

/** Protected digital-file download by per-delivery token (ownership enforced). */
userRouter.get("/files/:token", asyncHandler(async (req, res) => {
  const user = requireAuth(req);
  const t = String(req.params.token).slice(0, 64);
  const d = await db()("deliveries").where({ download_token: t, status: "DELIVERED" }).first();
  if (!d || !d.file_path) throw notFound("File not found");
  const order = await db()("orders").where({ id: d.order_id }).first();
  const isAdmin = user.isAdmin;
  if (!isAdmin && Number(order.user_id) !== user.id) throw forbidden("You do not have access to this file");
  const abs = safeUploadPath(String(d.file_path)) ? path.join(config.uploads.dir, String(d.file_path)) : null;
  if (!abs || !fs.existsSync(abs)) throw notFound("Stored file missing, contact support");
  res.setHeader("Content-Disposition", `attachment; filename="${(d.file_name || "download").replace(/"/g, "")}"`);
  res.setHeader("X-Content-Type-Options", "nosniff");
  fs.createReadStream(abs).pipe(res);
}));

export { saveUpload };
