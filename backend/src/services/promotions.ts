import { Knex, db, asNum, asBool, toDbTime } from "../db";
import { badRequest } from "../common/errors";

export interface PromoCheck { code: string; name: string; discountMinor: number; promoId: number }

/** Validate a discount code server-side against an order draft. */
export async function checkPromo(codeInput: string, userId: number, subtotalMinor: number, productIds: number[]): Promise<PromoCheck> {
  const code = String(codeInput || "").trim().toUpperCase();
  if (!code) throw badRequest("Discount code is required", "PROMO_MISSING");
  const now = toDbTime();
  const p = await db()("promotions").where(k => {
    k.where({ code }).orWhereRaw("upper(code) = ?", [code]);
  }).first();
  if (!p || !asBool(p.is_active)) throw badRequest("Discount code not found or inactive", "PROMO_NOT_FOUND");
  if (String(p.starts_at) > now || String(p.ends_at) < now) throw badRequest("Discount code expired or not started yet", "PROMO_WINDOW");
  if (asNum(p.usage_limit) > 0 && asNum(p.used_count) >= asNum(p.usage_limit)) throw badRequest("Discount code fully used", "PROMO_EXHAUSTED");
  if (subtotalMinor < asNum(p.min_order_minor)) throw badRequest("Order is below the minimum for this code", "PROMO_MIN_ORDER");

  let eligible: number[] | null = null;
  try { eligible = p.product_ids ? JSON.parse(String(p.product_ids)) : null; } catch { eligible = null; }
  if (eligible && eligible.length && !productIds.every((id) => eligible!.includes(Number(id)))) {
    throw badRequest("Discount code does not apply to these products", "PROMO_PRODUCTS");
  }

  const userUses = await db()("promotion_usages").where({ promotion_id: p.id, user_id: userId }).count({ n: "*" }).first();
  if (asNum(userUses?.n) >= asNum(p.per_user_limit || 1)) throw badRequest("You already used this discount code", "PROMO_USER_LIMIT");

  let discount = 0;
  if (p.kind === "PERCENT") {
    discount = Math.floor((subtotalMinor * asNum(p.value_minor)) / 10000); // value stored x100 (1250 = 12.5%)
    if (asNum(p.max_discount_minor) > 0) discount = Math.min(discount, asNum(p.max_discount_minor));
  } else {
    discount = Math.min(asNum(p.value_minor), subtotalMinor);
  }
  discount = Math.max(0, Math.min(discount, subtotalMinor));
  return { code: String(p.code), name: String(p.name), discountMinor: discount, promoId: Number(p.id) };
}

/** Record usage — inside the payment transaction. */
export async function consumePromo(trx: Knex.Transaction, promoId: number, orderId: number, userId: number, discountMinor: number): Promise<void> {
  const p = await trx("promotions").where({ id: promoId }).first();
  if (!p) return;
  if (asNum(p.usage_limit) > 0) {
    const moved = await trx("promotions").where({ id: promoId }).andWhere("used_count", "<", asNum(p.usage_limit)).increment("used_count", 1);
    if (moved !== 1) throw badRequest("Discount code was fully used while processing", "PROMO_RACE");
  } else {
    await trx("promotions").where({ id: promoId }).increment("used_count", 1);
  }
  await trx("promotion_usages").insert({ promotion_id: promoId, order_id: orderId, user_id: userId, discount_minor: discountMinor, created_at: toDbTime() });
}
