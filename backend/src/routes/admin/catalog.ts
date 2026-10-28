import { Router } from "express";
import path from "path";
import fs from "fs";
import multer from "multer";
import crypto from "crypto";
import { db, toDbTime, asNum, camel, camelAll } from "../../db";
import { config } from "../../config";
import { asyncHandler, badRequest, notFound, conflict } from "../../common/errors";
import { requireAdmin, sanitizeText } from "../../domain/auth";
import { slugify, token } from "../../common/id";
import { audit } from "../../services/audit";
import { insertGetId } from "../../services/wallet";

export const adminCatalogRouter = Router();

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: config.uploads.maxBytes },
  fileFilter: (_req, file, cb) => {
    const ok = /image\/(png|jpe?g|webp|gif)|application\/pdf|text\/plain|application\/zip/i.test(file.mimetype);
    if (ok) cb(null, true); else cb(badRequest("File type not allowed", "BAD_FILE"));
  }
});

function isAdminImageMime(m: string) { return /^image\/(png|jpe?g|webp|gif)$/.test(m); }
function isAdminFileMime(m: string) { return /application\/(pdf|zip)|text\/plain/.test(m); }

async function saveFile(file: Express.Multer.File, kind: string): Promise<string> {
  const ext = path.extname(file.originalname || "").toLowerCase().slice(0, 8).replace(/[^.a-z0-9]/g, "");
  const name = `${kind}-${Date.now()}-${crypto.randomBytes(6).toString("hex")}${ext}`;
  const dir = path.join(config.uploads.dir, kind);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, name), file.buffer);
  return `${kind}/${name}`;
}

function imageUrlOnly(rel: string): string {
  return `/uploads/${rel}`;
}

// ---------------- categories ----------------
adminCatalogRouter.get("/categories", requireAdmin("categories"), asyncHandler(async (_req, res) => {
  const rows = await db()("categories").orderBy("sort_order", "asc");
  res.json({ items: camelAll(rows) });
}));

adminCatalogRouter.post("/categories", requireAdmin("categories"), asyncHandler(async (req, res) => {
  const b = req.body || {};
  if (!b.nameKm || !b.nameEn) throw badRequest("nameKm and nameEn are required", "VALIDATION");
  const k = db();
  const slug = slugify(String(b.slug || b.nameEn));
  if (await k("categories").where({ slug }).first()) throw conflict("Slug already exists", "DUP_SLUG");
  const id = await insertGetId(k, "categories", {
    name_km: String(b.nameKm).slice(0, 255), name_en: String(b.nameEn).slice(0, 255), slug,
    icon: b.icon ? String(b.icon).slice(0, 64) : null,
    icon_url: b.iconUrl ? String(b.iconUrl).slice(0, 1024) : null,
    sort_order: Number(b.sortOrder) || 0, is_active: b.isActive === false ? 0 : 1,
    created_at: toDbTime(), updated_at: toDbTime()
  }, { slug });
  await audit({ actorUserId: req.user!.id, action: "CATEGORY_CREATE", entityType: "category", entityId: id, after: b, ip: req.ip });
  res.status(201).json({ id });
}));

adminCatalogRouter.put("/categories/:id", requireAdmin("categories"), asyncHandler(async (req, res) => {
  const id = Number(req.params.id);
  const k = db();
  const before = await k("categories").where({ id }).first();
  if (!before) throw notFound("Category not found");
  const b = req.body || {};
  await k("categories").where({ id }).update({
    name_km: b.nameKm !== undefined ? String(b.nameKm).slice(0, 255) : before.name_km,
    name_en: b.nameEn !== undefined ? String(b.nameEn).slice(0, 255) : before.name_en,
    icon: b.icon !== undefined ? String(b.icon).slice(0, 64) : before.icon,
    icon_url: b.iconUrl !== undefined ? String(b.iconUrl).slice(0, 1024) : before.icon_url,
    sort_order: b.sortOrder !== undefined ? Number(b.sortOrder) || 0 : before.sort_order,
    is_active: b.isActive !== undefined ? (b.isActive ? 1 : 0) : before.is_active,
    updated_at: toDbTime()
  });
  await audit({ actorUserId: req.user!.id, action: "CATEGORY_UPDATE", entityType: "category", entityId: id, before, after: b, ip: req.ip });
  res.json({ ok: true });
}));

adminCatalogRouter.delete("/categories/:id", requireAdmin("categories"), asyncHandler(async (req, res) => {
  const id = Number(req.params.id);
  const k = db();
  const inUse = await k("products").where({ category_id: id }).count({ n: "*" } as any).first();
  if (asNum(inUse?.n) > 0) throw conflict(`Category has ${asNum(inUse?.n)} products — move or delete them first`, "CATEGORY_IN_USE");
  const before = await k("categories").where({ id }).first();
  if (!before) throw notFound("Category not found");
  await k("categories").where({ id }).del();
  await audit({ actorUserId: req.user!.id, action: "CATEGORY_DELETE", entityType: "category", entityId: id, before, ip: req.ip });
  res.json({ ok: true });
}));

// ---------------- banners ----------------
adminCatalogRouter.get("/banners", requireAdmin("products"), asyncHandler(async (_req, res) => {
  res.json({ items: camelAll(await db()("banners").orderBy("sort_order", "asc")) });
}));
adminCatalogRouter.post("/banners", requireAdmin("products"), asyncHandler(async (req, res) => {
  const b = req.body || {};
  if (!b.title || !b.imageUrl) throw badRequest("title and imageUrl are required", "VALIDATION");
  const row = {
    title: String(b.title).slice(0, 255), subtitle: b.subtitle ? String(b.subtitle).slice(0, 255) : null,
    image_url: String(b.imageUrl).slice(0, 1024), link_url: b.linkUrl ? String(b.linkUrl).slice(0, 1024) : null,
    sort_order: Number(b.sortOrder) || 0, is_active: b.isActive === false ? 0 : 1,
    created_at: toDbTime(), updated_at: toDbTime()
  };
  await db()("banners").insert(row);
  const saved = await db()("banners").where({ title: row.title, image_url: row.image_url }).orderBy("id", "desc").first();
  await audit({ actorUserId: req.user!.id, action: "BANNER_CREATE", entityType: "banner", entityId: saved?.id ?? "?", after: b, ip: req.ip });
  res.status(201).json({ id: saved?.id });
}));
adminCatalogRouter.put("/banners/:id", requireAdmin("products"), asyncHandler(async (req, res) => {
  const id = Number(req.params.id);
  const k = db();
  const before = await k("banners").where({ id }).first();
  if (!before) throw notFound("Banner not found");
  const b = req.body || {};
  await k("banners").where({ id }).update({
    title: b.title !== undefined ? String(b.title).slice(0, 255) : before.title,
    subtitle: b.subtitle !== undefined ? String(b.subtitle).slice(0, 255) : before.subtitle,
    image_url: b.imageUrl !== undefined ? String(b.imageUrl).slice(0, 1024) : before.image_url,
    link_url: b.linkUrl !== undefined ? String(b.linkUrl).slice(0, 1024) : before.link_url,
    sort_order: b.sortOrder !== undefined ? Number(b.sortOrder) || 0 : before.sort_order,
    is_active: b.isActive !== undefined ? (b.isActive ? 1 : 0) : before.is_active,
    updated_at: toDbTime()
  });
  await audit({ actorUserId: req.user!.id, action: "BANNER_UPDATE", entityType: "banner", entityId: id, before, after: b, ip: req.ip });
  res.json({ ok: true });
}));
adminCatalogRouter.delete("/banners/:id", requireAdmin("products"), asyncHandler(async (req, res) => {
  const id = Number(req.params.id);
  const before = await db()("banners").where({ id }).first();
  if (!before) throw notFound("Banner not found");
  await db()("banners").where({ id }).del();
  await audit({ actorUserId: req.user!.id, action: "BANNER_DELETE", entityType: "banner", entityId: id, before, ip: req.ip });
  res.json({ ok: true });
}));

// ---------------- products ----------------
adminCatalogRouter.get("/products", requireAdmin("products"), asyncHandler(async (req, res) => {
  const page = Math.max(1, Number(req.query.page) || 1);
  const limit = Math.min(100, Math.max(1, Number(req.query.limit) || 20));
  const q = db()("products as p");
  if (req.query.q) q.whereRaw("lower(p.name) like ?", [`%${String(req.query.q).toLowerCase()}%`]);
  if (req.query.categoryId) q.where("p.category_id", Number(req.query.categoryId));
  if (req.query.status) q.where("p.status", String(req.query.status));
  const totalRow = await q.clone().clearSelect().count({ n: "*" } as any).first();
  const rows = await q.orderBy("p.id", "desc").limit(limit).offset((page - 1) * limit);
  res.json({ total: asNum(totalRow?.n), items: camelAll(rows).map(shapeAdminProduct) });
}));

function shapeAdminProduct(p: any) {
  return p; // admin sees all fields incl. cost & status
}

adminCatalogRouter.get("/products/:id", requireAdmin("products"), asyncHandler(async (req, res) => {
  const k = db();
  const product = camel(await k("products").where({ id: Number(req.params.id) }).first());
  if (!product) throw notFound("Product not found");
  const variants = camelAll(await k("product_variants").where({ product_id: product.id }).orderBy("sort_order", "asc"));
  res.json({ product, variants });
}));

adminCatalogRouter.post("/products", requireAdmin("products"), asyncHandler(async (req, res) => {
  const b = req.body || {};
  if (!b.name) throw badRequest("name is required", "VALIDATION");
  const priceMinor = Math.round(Number(b.priceMinor ?? (b.price ? Number(b.price) * 100 : NaN)));
  if (!Number.isFinite(priceMinor) || priceMinor < 0) throw badRequest("A valid price is required", "PRICE");
  const k = db();
  const code = `PRD-${crypto.randomBytes(4).toString("hex").toUpperCase()}`;
  const id = await insertGetId(k, "products", {
    code, category_id: b.categoryId ? Number(b.categoryId) : null,
    name: String(b.name).slice(0, 255), description: sanitizeText(b.description || "", 8000) || null,
    instructions: sanitizeText(b.instructions || "", 4000) || null, cover_url: b.coverUrl ? String(b.coverUrl).slice(0, 1024) : null,
    price_minor: priceMinor, cost_minor: Math.round(Number(b.costMinor ?? (b.cost ? Number(b.cost) * 100 : 0)) || 0),
    duration_label: b.durationLabel ? String(b.durationLabel).slice(0, 64) : null,
    delivery_type: b.deliveryType === "MANUAL" ? "MANUAL" : "AUTO",
    status: ["ACTIVE", "INACTIVE"].includes(b.status) ? b.status : "ACTIVE",
    stock_mode: ["INVENTORY", "KEY_POOL", "UNLIMITED", "OUT_OF_STOCK"].includes(b.stockMode) ? b.stockMode : "INVENTORY",
    is_featured: b.isFeatured ? 1 : 0, is_offer: b.isOffer ? 1 : 0,
    sales_count: 0, view_count: 0, sort_order: Number(b.sortOrder) || 0,
    created_at: toDbTime(), updated_at: toDbTime()
  }, { code });
  await audit({ actorUserId: req.user!.id, action: "PRODUCT_CREATE", entityType: "product", entityId: id, after: b, ip: req.ip });
  res.status(201).json({ id, code });
}));

adminCatalogRouter.put("/products/:id", requireAdmin("products"), asyncHandler(async (req, res) => {
  const id = Number(req.params.id);
  const k = db();
  const before = await k("products").where({ id }).first();
  if (!before) throw notFound("Product not found");
  const b = req.body || {};
  const upd: Record<string, unknown> = { updated_at: toDbTime() };
  const setIf = (key: string, col: string, cast: (v: any) => unknown = (x) => x) => {
    if (b[key] !== undefined) upd[col] = cast(b[key]);
  };
  setIf("name", "name", (v) => String(v).slice(0, 255));
  setIf("categoryId", "category_id", (v) => (v ? Number(v) : null));
  setIf("description", "description", (v) => sanitizeText(v, 8000) || null);
  setIf("instructions", "instructions", (v) => sanitizeText(v, 4000) || null);
  setIf("coverUrl", "cover_url", (v) => (v ? String(v).slice(0, 1024) : null));
  setIf("priceMinor", "price_minor", (v) => Math.round(Number(v) || 0));
  setIf("costMinor", "cost_minor", (v) => Math.round(Number(v) || 0));
  setIf("durationLabel", "duration_label", (v) => (v ? String(v).slice(0, 64) : null));
  setIf("deliveryType", "delivery_type", (v) => (v === "MANUAL" ? "MANUAL" : "AUTO"));
  setIf("status", "status", (v) => (["ACTIVE", "INACTIVE"].includes(v) ? v : "ACTIVE"));
  setIf("stockMode", "stock_mode", (v) => (["INVENTORY", "KEY_POOL", "UNLIMITED", "OUT_OF_STOCK"].includes(v) ? v : "INVENTORY"));
  if (b.isFeatured !== undefined) upd.is_featured = b.isFeatured ? 1 : 0;
  if (b.isOffer !== undefined) upd.is_offer = b.isOffer ? 1 : 0;
  setIf("sortOrder", "sort_order", (v) => Number(v) || 0);
  await k("products").where({ id }).update(upd);
  await audit({ actorUserId: req.user!.id, action: "PRODUCT_UPDATE", entityType: "product", entityId: id, before, after: upd, ip: req.ip });
  res.json({ ok: true });
}));

adminCatalogRouter.delete("/products/:id", requireAdmin("products"), asyncHandler(async (req, res) => {
  const id = Number(req.params.id);
  const k = db();
  const before = await k("products").where({ id }).first();
  if (!before) throw notFound("Product not found");
  const sold = await k("order_items").where({ product_id: id }).count({ n: "*" } as any).first();
  if (asNum(sold?.n) > 0) {
    // keep order history intact: soft-disable instead of hard delete
    await k("products").where({ id }).update({ status: "INACTIVE", updated_at: toDbTime() });
    await audit({ actorUserId: req.user!.id, action: "PRODUCT_SOFT_DELETE", entityType: "product", entityId: id, before, reason: "had order history", ip: req.ip });
    res.json({ ok: true, softDeleted: true });
    return;
  }
  await k.transaction(async (trx) => {
    await trx("digital_inventory").where({ product_id: id }).del();
    await trx("product_variants").where({ product_id: id }).del();
    await trx("products").where({ id }).del();
  });
  await audit({ actorUserId: req.user!.id, action: "PRODUCT_DELETE", entityType: "product", entityId: id, before, ip: req.ip });
  res.json({ ok: true, softDeleted: false });
}));

// ---------------- variants ----------------
adminCatalogRouter.post("/products/:id/variants", requireAdmin("products"), asyncHandler(async (req, res) => {
  const productId = Number(req.params.id);
  const b = req.body || {};
  const price = Math.round(Number(b.priceMinor ?? (b.price ? Number(b.price) * 100 : NaN)));
  if (!b.name || !Number.isFinite(price) || price <= 0) throw badRequest("name and a valid price are required", "VALIDATION");
  const k = db();
  if (!(await k("products").where({ id: productId }).first())) throw notFound("Product not found");
  await k("product_variants").insert({
    product_id: productId, name: String(b.name).slice(0, 255),
    duration_label: b.durationLabel ? String(b.durationLabel).slice(0, 64) : null,
    price_minor: price, cost_minor: Math.round(Number(b.costMinor || 0)),
    compare_at_minor: Math.round(Number(b.compareAtMinor || 0)),
    stock: b.stock === undefined ? 0 : Math.round(Number(b.stock)),
    sort_order: Number(b.sortOrder) || 0, is_active: b.isActive === false ? 0 : 1,
    created_at: toDbTime(), updated_at: toDbTime()
  });
  const varRow = await k("product_variants").where({ product_id: productId }).orderBy("id", "desc").first();
  await audit({ actorUserId: req.user!.id, action: "VARIANT_CREATE", entityType: "variant", entityId: varRow?.id ?? "?", after: b, ip: req.ip });
  res.status(201).json({ id: varRow?.id });
}));

adminCatalogRouter.put("/variants/:id", requireAdmin("products"), asyncHandler(async (req, res) => {
  const id = Number(req.params.id);
  const k = db();
  const before = await k("product_variants").where({ id }).first();
  if (!before) throw notFound("Variant not found");
  const b = req.body || {};
  await k("product_variants").where({ id }).update({
    name: b.name !== undefined ? String(b.name).slice(0, 255) : before.name,
    duration_label: b.durationLabel !== undefined ? (b.durationLabel ? String(b.durationLabel).slice(0, 64) : null) : before.duration_label,
    price_minor: b.priceMinor !== undefined ? Math.round(Number(b.priceMinor)) : before.price_minor,
    cost_minor: b.costMinor !== undefined ? Math.round(Number(b.costMinor)) : before.cost_minor,
    compare_at_minor: b.compareAtMinor !== undefined ? Math.round(Number(b.compareAtMinor)) : before.compare_at_minor,
    stock: b.stock !== undefined ? Math.round(Number(b.stock)) : before.stock,
    sort_order: b.sortOrder !== undefined ? Number(b.sortOrder) : before.sort_order,
    is_active: b.isActive !== undefined ? (b.isActive ? 1 : 0) : before.is_active,
    updated_at: toDbTime()
  });
  await audit({ actorUserId: req.user!.id, action: "VARIANT_UPDATE", entityType: "variant", entityId: id, before, after: b, ip: req.ip });
  res.json({ ok: true });
}));

adminCatalogRouter.delete("/variants/:id", requireAdmin("products"), asyncHandler(async (req, res) => {
  const id = Number(req.params.id);
  const k = db();
  const before = await k("product_variants").where({ id }).first();
  if (!before) throw notFound("Variant not found");
  await k("digital_inventory").where({ variant_id: id }).update({ variant_id: null });
  await k("product_variants").where({ id }).del();
  await audit({ actorUserId: req.user!.id, action: "VARIANT_DELETE", entityType: "variant", entityId: id, before, ip: req.ip });
  res.json({ ok: true });
}));

// ---------------- digital inventory ----------------
adminCatalogRouter.get("/inventory", requireAdmin("inventory"), asyncHandler(async (req, res) => {
  const productId = Number(req.query.productId);
  if (!productId) throw badRequest("productId is required", "VALIDATION");
  const page = Math.max(1, Number(req.query.page) || 1);
  const limit = Math.min(200, Math.max(1, Number(req.query.limit) || 50));
  const k = db();
  const q = k("digital_inventory").where({ product_id: productId });
  if (req.query.status) q.andWhere("status", String(req.query.status));
  const totalRow = await q.clone().clearSelect().count({ n: "*" } as any).first();
  const rows = await q.orderBy("id", "desc").limit(limit).offset((page - 1) * limit);
  // values/keys are secrets: admins see type+status+masked value; full value only via single-row endpoint
  res.json({
    total: asNum(totalRow?.n),
    items: camelAll(rows).map((r: any) => ({ ...r, value: maskSecret(r.value, r.itemType), file: undefined }))
  });
}));

function maskSecret(v: unknown, type: unknown): string {
  const s = String(v ?? "");
  if (String(type) === "FILE") return s.split("/").pop() || s;
  if (s.length <= 8) return "••••";
  return s.slice(0, 4) + "•".repeat(6) + s.slice(-4);
}

adminCatalogRouter.post("/inventory/bulk", requireAdmin("inventory"), asyncHandler(async (req, res) => {
  const b = req.body || {};
  const productId = Number(b.productId);
  const variantId = b.variantId ? Number(b.variantId) : null;
  const itemType = ["KEY", "TEXT", "FILE", "ACCOUNT"].includes(b.itemType) ? b.itemType : "KEY";
  const lines = Array.isArray(b.values) ? b.values.map((x: any) => String(x).trim()).filter(Boolean) : [];
  if (!productId || !lines.length) throw badRequest("productId and values[] are required", "VALIDATION");
  if (lines.length > 5000) throw badRequest("Max 5000 items per bulk add", "TOO_MANY");
  const k = db();
  if (!(await k("products").where({ id: productId }).first())) throw notFound("Product not found");
  if (itemType === "FILE") throw badRequest("Use the file upload endpoint for FILE items", "FILE_TYPE");
  await k.transaction(async (trx) => {
    for (const line of lines) {
      const value = itemType === "ACCOUNT" ? String(line).slice(0, 4000) : String(line).slice(0, 4000);
      await trx("digital_inventory").insert({
        product_id: productId, variant_id: variantId, item_type: itemType, value,
        status: "AVAILABLE", added_by: req.user!.id, created_at: toDbTime()
      });
    }
  });
  await audit({ actorUserId: req.user!.id, action: "INVENTORY_ADD", entityType: "product", entityId: productId, after: { count: lines.length, itemType }, ip: req.ip });
  res.status(201).json({ added: lines.length });
}));

adminCatalogRouter.post("/inventory/file", requireAdmin("inventory"), upload.single("file"), asyncHandler(async (req, res) => {
  const productId = Number(req.body?.productId);
  const variantId = req.body?.variantId ? Number(req.body.variantId) : null;
  const count = Math.max(1, Math.min(500, Number(req.body?.count || 1)));
  if (!req.file) throw badRequest("file is required", "NO_FILE");
  if (!isAdminFileMime(req.file.mimetype) && !isAdminImageMime(req.file.mimetype)) {
    throw badRequest("Allowed: PDF, ZIP, TXT, PNG/JPG/WEBP", "BAD_FILE");
  }
  if (!productId) throw badRequest("productId is required", "VALIDATION");
  const rel = await saveFile(req.file, "files");
  const k = db();
  for (let i = 0; i < count; i++) {
    await k("digital_inventory").insert({
      product_id: productId, variant_id: variantId, item_type: "FILE", value: rel,
      file_name: String(req.file.originalname).slice(0, 250), status: "AVAILABLE",
      added_by: req.user!.id, created_at: toDbTime()
    });
  }
  await audit({ actorUserId: req.user!.id, action: "INVENTORY_FILE_ADD", entityType: "product", entityId: productId, after: { file: rel, count }, ip: req.ip });
  res.status(201).json({ added: count, path: rel });
}));

adminCatalogRouter.post("/inventory/:id/void", requireAdmin("inventory"), asyncHandler(async (req, res) => {
  const id = Number(req.params.id);
  const k = db();
  const row = await k("digital_inventory").where({ id }).first();
  if (!row) throw notFound("Inventory row not found");
  if (String(row.status) === "ASSIGNED") throw conflict("Assigned items are tied to a delivered order and cannot be voided", "ASSIGNED");
  await k("digital_inventory").where({ id }).update({ status: "VOID", value: "[VOIDED]" });
  await audit({ actorUserId: req.user!.id, action: "INVENTORY_VOID", entityType: "inventory", entityId: id, before: { status: row.status }, ip: req.ip });
  res.json({ ok: true });
}));

// ---------------- upload (image for product/banner, generic) ----------------
adminCatalogRouter.post("/uploads/image", requireAdmin("products"), upload.single("file"), asyncHandler(async (req, res) => {
  if (!req.file) throw badRequest("file is required", "NO_FILE");
  if (!isAdminImageMime(req.file.mimetype)) throw badRequest("Allowed: PNG/JPG/WEBP/GIF images", "BAD_FILE");
  const rel = await saveFile(req.file, "images");
  res.status(201).json({ url: imageUrlOnly(rel), path: rel });
}));
