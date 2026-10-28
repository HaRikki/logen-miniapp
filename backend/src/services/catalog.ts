import { Knex, db, camel, camelAll, asNum, asBool, fromDbTime, toDbTime } from "../db";

export const PUBLIC_FIELDS = `p.id, p.code, p.category_id, p.name, p.description, p.cover_url,
  p.price_minor, p.cost_minor, p.duration_label, p.delivery_type, p.status, p.stock_mode,
  p.is_featured, p.is_offer, p.sales_count, p.view_count, p.created_at, c.name_km as category_name_km, c.name_en as category_name_en`;

function expr(k: Knex, sql: string) { return k.raw(sql); }

export async function listProducts(opts: {
  search?: string; categoryId?: number; min?: number; max?: number;
  sort?: "new" | "popular" | "price_asc" | "price_desc" | "featured";
  featured?: boolean; offer?: boolean; activeOnly?: boolean; limit?: number; offset?: number; locale?: string;
}) {
  const k = db();
  const q = k("products as p").leftJoin("categories as c", "c.id", "p.category_id");
  if (opts.activeOnly !== false) q.where("p.status", "ACTIVE");
  if (opts.search) {
    const s = `%${opts.search.toLowerCase()}%`;
    q.where((b: any) => b.whereRaw("lower(p.name) like ?", [s]).orWhereRaw("lower(c.name_km) like ?", [s]).orWhereRaw("lower(c.name_en) like ?", [s]));
  }
  if (opts.categoryId) q.where("p.category_id", opts.categoryId);
  if (opts.min != null) q.where("p.price_minor", ">=", opts.min);
  if (opts.max != null) q.where("p.price_minor", "<=", opts.max);
  if (opts.featured) q.where("p.is_featured", 1);
  if (opts.offer) q.where("p.is_offer", 1);

  const sortMap: Record<string, [string, string]> = {
    new: ["p.created_at", "desc"], popular: ["p.sales_count", "desc"],
    price_asc: ["p.price_minor", "asc"], price_desc: ["p.price_minor", "desc"],
    featured: ["p.is_featured", "desc"]
  };
  const [col, dir] = sortMap[opts.sort || "new"] || sortMap.new;
  q.orderByRaw(`${col} ${dir}, p.sort_order asc, p.id asc`);
  q.select(expr(k, PUBLIC_FIELDS));

  const totalRow = await q.clone().clearSelect().count<{ n: number }[]>({ n: "*" } as any).first();
  const rows = await q.limit(opts.limit ?? 20).offset(opts.offset ?? 0);
  const withStock = await Promise.all(camelAll(rows as any).map(async (row: any) => ({ ...row, stockAvailable: await productStockAvailable(row) })));
  return { total: asNum(totalRow?.n), items: withStock.map((r) => shapePublic(r, opts.locale || "km")) };
}

export async function productStockAvailable(p: { id: number; stockMode: string; deliveryType?: string }): Promise<number> {
  if (p.stockMode === "UNLIMITED") return 9999;
  const k = db();
  if (p.stockMode === "OUT_OF_STOCK") return 0;
  const row = await k("digital_inventory").where({ product_id: p.id, status: "AVAILABLE" }).count<{ n: number }[]>({ n: "*" } as any).first();
  const variantRows = await k("product_variants").where({ product_id: p.id, is_active: 1 });
  let total = asNum(row?.n);
  // variants without own reserved keys fall back to product pool; already covered by product count
  if (total === 0 && variantRows.length) {
    // pool might be empty but variants may carry explicit stock numbers (MANUAL unlimited style)
    if (p.deliveryType === "MANUAL" && variantRows.some(v => asNum(v.stock) !== 0)) total = variantRows.reduce((a, v) => a + Math.max(0, asNum(v.stock)), 0);
  }
  if (p.deliveryType === "MANUAL" && total === 0) return 9999; // manual products don't require key stock
  return total;
}

export async function getProductByIdOrCode(idOrCode: string | number, activeOnly = false) {
  const k = db();
  const q = k("products as p").leftJoin("categories as c", "c.id", "p.category_id").select(expr(k, PUBLIC_FIELDS + ", p.instructions"));
  const isNum = /^\d+$/.test(String(idOrCode));
  if (isNum) q.where("p.id", Number(idOrCode)); else q.where("p.code", String(idOrCode));
  const row = await q.first();
  if (!row) return null;
  const shaped = shapePublic(camel(row), "km");
  if (activeOnly && shaped.status !== "ACTIVE") return null;
  shaped.stockAvailable = await productStockAvailable(shaped);
  const variants = await k("product_variants").where({ product_id: shaped.id, is_active: 1 }).orderBy("sort_order", "asc");
  const poolByVariant = shaped.stockMode === "KEY_POOL" ? await stockKeyPoolPerVariant(k, shaped.id) : null;
  shaped.variants = variants.map((v: any) => {
    const vc = camel(v);
    let stock: number;
    if (shaped.stockMode === "UNLIMITED") stock = 9999;
    else if (shaped.stockMode === "OUT_OF_STOCK") stock = 0;
    else if (shaped.deliveryType === "MANUAL") stock = asNum(vc.stock) === 0 ? 9999 : Math.max(asNum(vc.stock), 0);
    else if (shaped.stockMode === "KEY_POOL") stock = poolByVariant ? (poolByVariant[Number(vc.id)] ?? poolByVariant[0] ?? 0) : shaped.stockAvailable;
    else stock = shaped.stockAvailable;
    return { ...vc, stock, priceMinor: asNum(vc.priceMinor), compareAtMinor: asNum(vc.compareAtMinor) };
  });
  shaped.priceMinor = Math.min(shaped.priceMinor, ...shaped.variants.filter((v: any) => v.stock > 0).map((v: any) => asNum(v.priceMinor)));
  return shaped;
}

async function stockKeyPoolPerVariant(k: Knex, productId: number): Promise<Record<number, number>> {
  const rows = await k("digital_inventory").where({ product_id: productId, status: "AVAILABLE" }).select("variant_id");
  const out: Record<number, number> = {};
  for (const r of rows) {
    const key = Number(r.variant_id || 0);
    out[key] = (out[key] || 0) + 1;
  }
  return out;
}

function shapePublic(p: any, locale: string): any {
  return {
    id: p.id, code: p.code,
    categoryId: p.categoryId,
    categoryName: (locale === "en" ? p.categoryNameEn : p.categoryNameKm) || p.categoryNameEn || p.categoryNameKm || null,
    name: p.name, description: p.description, coverUrl: p.coverUrl,
    priceMinor: asNum(p.priceMinor), costMinor: asNum(p.costMinor), durationLabel: p.durationLabel,
    deliveryType: p.deliveryType, status: p.status, stockMode: p.stockMode,
    isFeatured: asBool(p.isFeatured), isOffer: asBool(p.isOffer),
    salesCount: asNum(p.salesCount), viewCount: asNum(p.viewCount),
    stockAvailable: asNum(p.stockAvailable),
    instructions: p.instructions ?? undefined,
    variants: p.variants ?? [],
    createdAt: fromDbTime(p.createdAt)
  };
}

export async function listCategories(activeOnly = true) {
  const k = db();
  const q = k("categories").orderBy("sort_order", "asc");
  if (activeOnly) q.where({ is_active: 1 });
  const rows = await q;
  const counts = await k("products").where({ status: "ACTIVE" }).groupBy("category_id").count<{ category_id: number; n: number }[]>({ n: "*" } as any);
  const cmap = new Map(counts.map((c: any) => [Number(c.category_id), asNum(c.n)]));
  return camelAll(rows).map((c: any) => ({ ...c, productCount: cmap.get(Number(c.id)) || 0 }));
}

export async function logProductView(userId: number | null | undefined, productId: number) {
  try {
    const k = db();
    await k("products").where({ id: productId }).increment("view_count", 1);
    if (userId) {
      const now = toDbTime();
      const existing = await k("recently_viewed").where({ user_id: userId, product_id: productId }).first();
      if (existing) await k("recently_viewed").where({ id: existing.id }).update({ viewed_at: now });
      else await k("recently_viewed").insert({ user_id: userId, product_id: productId, viewed_at: now });
    }
  } catch { /* non-critical */ }
}
