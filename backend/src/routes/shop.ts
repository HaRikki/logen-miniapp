import { Router } from "express";
import { db, toDbTime, asNum, camelAll } from "../db";
import { config } from "../config";
import { asyncHandler, notFound } from "../common/errors";
import { requireAuth } from "../domain/auth";
import { listProducts, getProductByIdOrCode, listCategories, logProductView } from "../services/catalog";
import { checkPromo } from "../services/promotions";
import { getSetting } from "../services/settings";

export const shopRouter = Router();

shopRouter.get("/config", asyncHandler(async (_req, res) => {
  const settings = await getPublicSettings();
  res.json({
    storeName: settings.storeName || config.store.name,
    currency: settings.currency || config.store.currency,
    telegramBotUsername: settings.telegramBotUsername || null,
    supportUrl: settings.supportUrl || null,
    websiteTitle: settings.websiteTitle || null,
    maintenance: !!settings.maintenanceMode,
    legal: {
      termsKm: settings.termsKm || null,
      termsEn: settings.termsEn || null,
      privacyKm: settings.privacyKm || null,
      privacyEn: settings.privacyEn || null
    }
  });
}));

async function getPublicSettings() {
  const s = await getSetting("store");
  return s || {};
}

shopRouter.get("/home", asyncHandler(async (req, res) => {
  const locale = String(req.query.locale || "km");
  const q = async (sort: string, extra: any = {}) =>
    (await listProducts({ sort: sort as any, activeOnly: true, limit: 10, offset: 0, locale, ...extra })).items;
  const [featured, newest, popular, offers, categories] = await Promise.all([
    q("featured", { featured: true }), q("new"), q("popular"), q("new", { offer: true }), listCategories(true)
  ]);
  const banners = camelAll(await db()("banners").where({ is_active: 1 }).orderBy("sort_order", "asc"));
  let recentlyViewed: any[] = [];
  if (req.user) {
    const rows = await db()("recently_viewed as rv")
      .join("products as p", "p.id", "rv.product_id")
      .where({ "rv.user_id": req.user.id, "p.status": "ACTIVE" })
      .orderBy("rv.viewed_at", "desc").limit(10).select("p.id");
    const ids = rows.map((r: any) => Number(r.id));
    recentlyViewed = (await listProducts({ activeOnly: true, limit: 50, locale })).items.filter(p => ids.includes(Number(p.id)));
  }
  res.json({ featured, newest, popular, offers, categories, banners, recentlyViewed });
}));

shopRouter.get("/categories", asyncHandler(async (_req, res) => {
  res.json({ items: await listCategories(true) });
}));

shopRouter.get("/products", asyncHandler(async (req, res) => {
  const nQ = (v: any) => (v === undefined || v === "" || Number.isNaN(Number(v)) ? undefined : Math.round(Number(v) * 100));
  const page = Math.max(1, Number(req.query.page) || 1);
  const limit = Math.min(50, Math.max(1, Number(req.query.limit) || 12));
  const result = await listProducts({
    search: req.query.q ? String(req.query.q).slice(0, 100) : undefined,
    categoryId: req.query.category ? Number(req.query.category) : undefined,
    min: nQ(req.query.min), max: nQ(req.query.max),
    sort: (req.query.sort as any) || "new",
    featured: req.query.featured === "1" ? true : undefined,
    offer: req.query.offer === "1" ? true : undefined,
    limit, offset: (page - 1) * limit,
    locale: String(req.query.locale || "km")
  });
  res.json({ ...result, page, pages: Math.max(1, Math.ceil(result.total / limit)) });
}));

shopRouter.get("/products/:idOrCode", asyncHandler(async (req, res) => {
  const product = await getProductByIdOrCode(req.params.idOrCode, true);
  if (!product) throw notFound("Product not found or inactive", "PRODUCT_MISSING");
  await logProductView(req.user?.id, Number(product.id));
  res.json({ product });
}));

shopRouter.get("/products/:id/buyers-recent", asyncHandler(async (_req, res) => {
  // social proof without exposing identities: count of recent completed purchases
  const since = toDbTime(new Date(Date.now() - 30 * 86400_000));
  const row = await db()("order_items as oi")
    .join("orders as o", "o.id", "oi.order_id")
    .where({ "o.status": "COMPLETED" })
    .andWhere("o.created_at", ">=", since)
    .whereRaw("1=1")
    .count({ n: "*" } as any).first();
  res.json({ last30d: asNum(row?.n) });
}));

/** Preview a discount code against a cart draft (no state change). */
shopRouter.post("/promotions/validate", asyncHandler(async (req, res) => {
  const user = requireAuth(req);
  const code = String(req.body?.code || "");
  const subtotalMinor = Math.round(Number(req.body?.subtotalMinor || 0));
  const productIds = Array.isArray(req.body?.productIds) ? req.body.productIds.map(Number).filter(Boolean) : [];
  if (!Number.isFinite(subtotalMinor) || subtotalMinor < 0) throw notFound("bad subtotal");
  const promo = await checkPromo(code, user.id, subtotalMinor, productIds);
  res.json({ ok: true, ...promo });
}));

/** Notification list for logged user. */
shopRouter.get("/notifications", asyncHandler(async (req, res) => {
  const user = requireAuth(req);
  const rows = await db()("notifications").where({ user_id: user.id }).orderBy("id", "desc").limit(50);
  res.json({ items: camelAll(rows).map((r: any) => ({ ...r, isRead: !!r.isRead })) });
}));

shopRouter.post("/notifications/read", asyncHandler(async (req, res) => {
  const user = requireAuth(req);
  const ids = Array.isArray(req.body?.ids) ? req.body.ids.map(Number).filter(Number.isFinite) : null;
  await db()("notifications").where({ user_id: user.id }).andWhere((qb: any) => ids ? qbwhereIn(qb, ids) : qb.where("is_read", 0)).update({ is_read: 1 });
  res.json({ ok: true });
}));
function qbwhereIn(qb: any, ids: number[]) { qb.whereIn("id", ids); }

shopRouter.patch("/users/me", asyncHandler(async (req, res) => {
  const user = requireAuth(req);
  const patch: Record<string, unknown> = {};
  if (typeof req.body?.notificationsEnabled === "boolean") patch.notifications_enabled = req.body.notificationsEnabled ? 1 : 0;
  if (typeof req.body?.language === "string" && ["km", "en"].includes(req.body.language)) patch.language = req.body.language;
  if (Object.keys(patch).length) {
    patch.updated_at = toDbTime();
    await db()("users").where({ id: user.id }).update(patch);
  }
  res.json({ ok: true });
}));
