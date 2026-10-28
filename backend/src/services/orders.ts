import { Knex, db, toDbTime, asNum } from "../db";
import { conflict, notFound, forbidden, badRequest } from "../common/errors";
import { bizId } from "../common/id";
import { checkPromo, consumePromo } from "./promotions";
import { fulfillAutoItem, failAutoItem } from "./deliveries";
import { walletChange } from "./wallet";
import { notify } from "./notify";

export interface OrderLineInput { productId: number; variantId?: number | null; quantity: number }

export async function quoteLines(lines: OrderLineInput[]) {
  const k = db();
  const resolved: Array<{
    productId: number; product: any; variant: any | null; quantity: number;
    unitPrice: number; unitCost: number; lineTotal: number; deliveryType: string; available: number;
  }> = [];
  for (const l of lines) {
    const qty = Math.floor(Number(l.quantity));
    if (!Number.isFinite(qty) || qty < 1 || qty > 50) throw badRequest("Quantity must be between 1 and 50", "QTY");
    const product = await k("products").where({ id: l.productId }).first();
    if (!product) throw notFound("Product not found", "PRODUCT_MISSING");
    if (product.status !== "ACTIVE") throw conflict(`${product.name} is not available for sale`, "PRODUCT_INACTIVE");
    let variant: any = null;
    if (l.variantId) {
      variant = await k("product_variants").where({ id: l.variantId, product_id: product.id, is_active: 1 }).first();
      if (!variant) throw badRequest("Variant not found", "VARIANT_MISSING");
    }
    const unitPrice = asNum(variant ? variant.price_minor : product.price_minor);
    const unitCost = asNum(variant ? variant.cost_minor : product.cost_minor);
    const available = await computeAvailable(k, product, variant);
    if (available < qty) {
      throw conflict(`Not enough stock for ${product.name} (available: ${available >= 1e9 ? "unlimited" : available})`, "OUT_OF_STOCK", { available });
    }
    resolved.push({
      productId: product.id, product, variant, quantity: qty,
      unitPrice, unitCost, lineTotal: unitPrice * qty, deliveryType: product.delivery_type, available
    });
  }
  return resolved;
}

async function computeAvailable(k: Knex | Knex.Transaction, product: any, variant: any | null): Promise<number> {
  if (product.stock_mode === "UNLIMITED") return 1e9;
  if (product.stock_mode === "OUT_OF_STOCK") return 0;
  if (product.delivery_type === "MANUAL") return 1e9; // manual queue is not key-limited
  // Pool semantics: product-level keys (variant_id NULL) are always claimable;
  // per-variant keys count only for their own variant.
  const rows = await k("digital_inventory").where({ product_id: product.id, status: "AVAILABLE" }).select("variant_id");
  const vids = rows.map((r: any) => (r.variant_id == null ? null : Number(r.variant_id)));
  const wantVariant = product.stock_mode === "KEY_POOL" && variant?.id ? Number(variant.id) : null;
  let n = 0;
  for (const v of vids) {
    if (v === null) n++;
    else if (wantVariant && v === wantVariant) n++;
  }
  return n;
}

export async function createOrder(userId: number, input: {
  items: OrderLineInput[]; promoCode?: string; deliveryAccount?: string; customerNote?: string;
}) {
  if (!input.items?.length) throw badRequest("Order needs at least one item", "EMPTY_ORDER");
  const lines = await quoteLines(input.items);
  const subtotal = lines.reduce((a, l) => a + l.lineTotal, 0);
  let promo: Awaited<ReturnType<typeof checkPromo>> | null = null;
  if (input.promoCode) promo = await checkPromo(input.promoCode, userId, subtotal, lines.map(l => l.productId));
  const total = Math.max(0, subtotal - (promo?.discountMinor || 0));
  const k = db();
  const code = bizId("ORD");
  const oid = await k.transaction(async (trx: Knex.Transaction) => {
    const res = await trx("orders").insert({
      code, user_id: userId, status: "PENDING_PAYMENT", currency: process.env.DEFAULT_CURRENCY || "USD",
      items_total_minor: subtotal, discount_minor: promo?.discountMinor || 0, total_minor: total,
      promotion_id: promo?.promoId || null, payment_method: "WALLET",
      delivery_account: input.deliveryAccount?.slice(0, 250) || null,
      customer_note: input.customerNote?.slice(0, 2000) || null,
      created_at: toDbTime(), updated_at: toDbTime()
    });
    const orderId = Number(Array.isArray(res) ? res[0] : res) || (await trx("orders").where({ code }).first()).id;
    for (const l of lines) {
      await trx("order_items").insert({
        order_id: orderId, product_id: l.productId, variant_id: l.variant?.id || null,
        product_name: l.product.name, variant_name: l.variant?.name || null,
        quantity: l.quantity, unit_price_minor: l.unitPrice, unit_cost_minor: l.unitCost,
        delivery_type: l.deliveryType, delivery_status: "PENDING",
        created_at: toDbTime(), updated_at: toDbTime()
      });
    }
    await trx("order_status_history").insert({
      order_id: orderId, from_status: null, to_status: "PENDING_PAYMENT",
      actor_role: "USER", reason: null, created_at: toDbTime()
    });
    return Number(orderId);
  });
  await notify({
    userId, kind: "ORDER_CREATED", title: `Order ${code} created`,
    body: "Complete the payment from your wallet to receive delivery.",
    link: `/orders/${code}`
  });
  return getOrderView(oid);
}

/**
 * Pay an order from wallet. One DB transaction containing:
 *  - FOR UPDATE lock on the order row (blocks concurrent double-click payments)
 *  - guarded wallet debit (conditional UPDATE, never below zero)
 *  - stock re-verification + atomic key claiming for AUTO items
 */
export async function payOrderFromWallet(opts: { orderId: number; userId: number }): Promise<any> {
  const k = db();
  const outcome = await k.transaction(async (trx: Knex.Transaction) => {
    const order = await trx("orders").where({ id: opts.orderId }).forUpdate().first();
    if (!order) throw notFound("Order not found", "ORDER_MISSING");
    if (Number(order.user_id) !== opts.userId) throw forbidden("This is not your order");
    if (order.status !== "PENDING_PAYMENT") {
      return { already: true as const, code: order.code, userId: Number(order.user_id) };
    }
    const items = await trx("order_items").where({ order_id: order.id });
    const total = asNum(order.total_minor);

    await walletChange({
      trx, userId: opts.userId, type: "PURCHASE", amountSignedMinor: -total,
      orderId: Number(order.id), idempotencyKey: `pay:${order.id}`,
      reason: `Purchase ${order.code}`
    });

    for (const item of items) {
      const product = await trx("products").where({ id: item.product_id }).first();
      if (!product || product.status !== "ACTIVE") {
        throw conflict(`Product "${item.product_name}" is no longer on sale`, "PRODUCT_INACTIVE");
      }
      const variant = item.variant_id ? { id: Number(item.variant_id) } : null;
      const avail = await computeAvailable(trx, product, variant);
      if (avail < asNum(item.quantity)) {
        throw conflict(`Not enough stock for ${item.product_name}`, "OUT_OF_STOCK");
      }
      await trx("products").where({ id: product.id }).increment("sales_count", asNum(item.quantity));
    }

    await trx("orders").where({ id: order.id }).update({ status: "PAID", updated_at: toDbTime() });
    await trx("order_status_history").insert({
      order_id: order.id, from_status: "PENDING_PAYMENT", to_status: "PAID",
      actor_role: "USER", reason: "Wallet payment", created_at: toDbTime()
    });
    if (order.promotion_id) {
      await consumePromo(trx, Number(order.promotion_id), Number(order.id), opts.userId, asNum(order.discount_minor));
    }
    let anyFailure = false;
    for (const item of items) {
      if (item.delivery_type !== "AUTO") continue;
      const r = await fulfillAutoItem({ trx, orderId: Number(order.id), orderItemId: Number(item.id), userId: opts.userId });
      if (!r.ok) {
        await failAutoItem(trx, Number(item.id), r.error || "delivery failed");
        anyFailure = true;
      }
    }
    return { already: false as const, orderId: Number(order.id), code: order.code, userId: opts.userId, anyFailure };
  });

  if (!outcome.already) {
    await finalizeOrderState(outcome.orderId);
    await notify({
      userId: outcome.userId, kind: "PAYMENT_OK",
      title: `Payment received for ${outcome.code}`,
      body: "Open the order to see your delivered items.",
      link: `/orders/${outcome.code}`,
      telegramText: `Digital Store: payment received for order ${outcome.code}.`
    });
  } else {
    await finalizeOrderState(opts.orderId);
  }
  return getOrderView(opts.orderId, { includeSecrets: true });
}

/**
 * Legal state machine. Notably Completed requires real delivery results and
 * Failed cannot jump to Completed without items being delivered (retry path).
 */
export async function assertTransitionAllowed(k: Knex | Knex.Transaction, from: string, to: string, orderId: number) {
  const legal: Record<string, string[]> = {
    PENDING_PAYMENT: ["CANCELLED", "FAILED"],
    PAID: ["PROCESSING", "COMPLETED", "FAILED", "REFUNDED"],
    PROCESSING: ["COMPLETED", "FAILED", "REFUNDED"],
    FAILED: ["PROCESSING", "REFUNDED"],
    COMPLETED: ["REFUNDED"],
    CANCELLED: [],
    REFUNDED: []
  };
  if (!(legal[from] || []).includes(to)) {
    throw conflict(`Illegal order transition ${from} -> ${to}`, "BAD_TRANSITION");
  }
  if (to === "COMPLETED") {
    const items = await k("order_items").where({ order_id: orderId });
    const undelivered = items.filter((i: any) => i.delivery_status !== "DELIVERED");
    if (undelivered.length) {
      throw conflict("Cannot mark Completed: items without real delivery result: " + undelivered.map((i: any) => i.product_name).join(", "), "DELIVERY_REQUIRED");
    }
    const delivered = await k("deliveries").where({ order_id: orderId, status: "DELIVERED" }).count({ n: "*" } as any).first();
    if (!asNum(delivered?.n)) throw conflict("Cannot mark Completed without delivery records", "DELIVERY_REQUIRED");
  }
}

/** Status change with validation + history. Used by admin endpoints and internal flows. */
export async function orderTransition(orderId: number, to: string, opts: {
  reason?: string; actorRole?: "USER" | "ADMIN" | "SYSTEM"; actorUserId?: number | null; skipGuard?: boolean;
}) {
  const k = db();
  return k.transaction(async (trx: Knex.Transaction) => {
    const order = await trx("orders").where({ id: orderId }).forUpdate().first();
    if (!order) throw notFound("Order not found");
    if (order.status === to) return getOrderView(orderId);
    await assertTransitionAllowed(trx, String(order.status), to, orderId);
    await trx("orders").where({ id: orderId }).update({
      status: to, updated_at: toDbTime(),
      failure_reason: ["FAILED", "CANCELLED"].includes(to) ? (opts.reason || to).slice(0, 1000) : order.failure_reason
    });
    await trx("order_status_history").insert({
      order_id: orderId, from_status: order.status, to_status: to,
      actor_role: opts.actorRole || "ADMIN", changed_by: opts.actorUserId ?? null,
      reason: opts.reason || null, created_at: toDbTime()
    });
    return null;
  });
}

/** Idempotent PAID -> next state based on actual delivery outcomes. */
export async function finalizeOrderState(orderId: number) {
  const k = db();
  const order = await k("orders").where({ id: orderId }).first();
  if (!order || order.status !== "PAID") return;
  const items = await k("order_items").where({ order_id: orderId });
  const failed = items.filter((i: any) => i.delivery_status === "FAILED");
  if (failed.length) {
    await orderTransition(orderId, "FAILED", { reason: String(failed[0].delivery_error || "Auto delivery failed"), actorRole: "SYSTEM" });
    await refundOrder(orderId, null, "Auto delivery failed — automatic refund");
    return;
  }
  const pendingManual = items.some((i: any) => i.delivery_type === "MANUAL" && i.delivery_status !== "DELIVERED");
  await orderTransition(orderId, pendingManual ? "PROCESSING" : "COMPLETED", {
    reason: pendingManual ? "Waiting for manual delivery" : "All items delivered", actorRole: "SYSTEM"
  });
}

export async function cancelOrder(orderId: number, userId: number | null, reason: string, isAdmin = false) {
  const k = db();
  const order = await k("orders").where({ id: orderId }).first();
  if (!order) throw notFound("Order not found");
  if (!isAdmin && Number(order.user_id) !== Number(userId)) throw forbidden("This is not your order");
  if (!["PENDING_PAYMENT"].includes(order.status)) {
    throw conflict(`Only unpaid orders can be cancelled (current: ${order.status}). Ask for a refund instead.`, "BAD_CANCEL");
  }
  await orderTransition(orderId, "CANCELLED", { reason, actorRole: isAdmin ? "ADMIN" : "USER", actorUserId: userId });
  return getOrderView(orderId);
}

/** Refund = credit wallet + void claimed keys (a delivered key is never resold). */
export async function refundOrder(orderId: number, adminId: number | null, reason: string) {
  const k = db();
  const info = await k.transaction(async (trx: Knex.Transaction) => {
    const order = await trx("orders").where({ id: orderId }).forUpdate().first();
    if (!order) throw notFound("Order not found");
    if (order.status === "REFUNDED") return { done: true, userId: Number(order.user_id), code: order.code, amount: 0 };
    if (!["PAID", "PROCESSING", "COMPLETED", "FAILED"].includes(order.status)) {
      throw conflict(`Cannot refund a ${order.status} order`, "BAD_REFUND");
    }
    const amount = asNum(order.total_minor);
    if (amount > 0) {
      await walletChange({
        trx, userId: Number(order.user_id), type: "REFUND", amountSignedMinor: amount,
        orderId: Number(order.id), createdById: adminId || undefined,
        reason: `Refund ${order.code}: ${reason}`.slice(0, 500),
        idempotencyKey: `refund:${order.id}`
      });
    }
    const items = await trx("order_items").where({ order_id: order.id });
    for (const it of items) {
      await trx("digital_inventory").where({ order_item_id: it.id, status: "ASSIGNED" })
        .update({ status: "VOID", value: "[VOIDED]", assigned_at: toDbTime() });
    }
    await trx("orders").where({ id: order.id }).update({ status: "REFUNDED", updated_at: toDbTime() });
    await trx("order_status_history").insert({
      order_id: order.id, from_status: order.status, to_status: "REFUNDED",
      actor_role: adminId ? "ADMIN" : "SYSTEM", changed_by: adminId, reason, created_at: toDbTime()
    });
    return { done: false, userId: Number(order.user_id), code: order.code, amount };
  });
  if (!info.done) {
    await notify({
      userId: info.userId, kind: "ORDER_REFUNDED",
      title: `Order ${info.code} refunded`, body: reason, link: `/orders/${info.code}`,
      telegramText: `Digital Store: order ${info.code} was refunded (${(info.amount / 100).toFixed(2)} USD). Reason: ${reason}`
    });
  }
  return getOrderView(orderId);
}

/** Retry auto delivery for a FAILED item. Legal transitions enforced. */
export async function retryAutoDelivery(orderItemIds: number[], adminId: number): Promise<{ ok: boolean; error?: string }> {
  const k = db();
  const failed: number[] = Array.isArray(orderItemIds) ? orderItemIds : [orderItemIds];
  if (!failed.length) return { ok: false, error: "No failed items requested" };
  const first = await k("order_items").where({ id: failed[0] }).first();
  if (!first) return { ok: false, error: "Order item missing" };
  const order = await k("orders").where({ id: first.order_id }).first();
  if (!order || !["FAILED"].includes(order.status)) {
    return { ok: false, error: `Retry only allowed from FAILED (order is ${order?.status})` };
  }
  await orderTransition(Number(order.id), "PROCESSING", { reason: "Retry auto delivery", actorRole: "ADMIN", actorUserId: adminId });
  const res = await k.transaction(async (trx: Knex.Transaction) => {
    let ok = true;
    let error: string | undefined;
    for (const itemId of failed) {
      const item = await trx("order_items").where({ id: itemId }).forUpdate().first();
      if (!item || String(item.delivery_status) === "DELIVERED") continue;
      const before = await trx("deliveries").where({ order_item_id: itemId, status: "DELIVERED" }).first();
      if (before) { await trx("order_items").where({ id: itemId }).update({ delivery_status: "DELIVERED", delivery_error: null }); continue; }
      const r = await fulfillAutoItem({ trx, orderId: Number(order.id), orderItemId: itemId, userId: Number(order.user_id) });
      if (!r.ok) { await failAutoItem(trx, itemId, r.error || "still out of stock"); ok = false; error = r.error; }
      else {
        await trx("deliveries").where({ order_item_id: itemId }).increment("attempt_count", 1).catch(() => {});
      }
    }
    return { ok, error };
  });
  const itemsLeft = await k("order_items").where({ order_id: order.id });
  if (itemsLeft.every(i => String(i.delivery_status) === "DELIVERED")) {
    await orderTransition(Number(order.id), "COMPLETED", { reason: "Retry delivery succeeded", actorRole: "SYSTEM" });
  } else if (!res.ok) {
    await orderTransition(Number(order.id), "FAILED", { reason: res.error || "retry failed", actorRole: "SYSTEM" });
    await refundOrder(Number(order.id), adminId, "Retry failed — refunded");
  }
  return res;
}

/** Public order view. Secrets included only when explicitly allowed (owner payment result / admin). */
export async function getOrderView(orderId: number, opts?: { actorUserId?: number; includeSecrets?: boolean }) {
  const k = db();
  const order = await k("orders").where({ id: orderId }).first();
  if (!order) throw notFound("Order not found");
  const items = await k("order_items").where({ order_id: orderId });
  const deliveries = await k("deliveries").where({ order_id: orderId }).orderBy("id", "asc");
  const history = await k("order_status_history").where({ order_id: orderId }).orderBy("id", "asc");
  const user = await k("users").where({ id: order.user_id }).first();
  const secretCapable = !!opts?.includeSecrets;
  return {
    id: Number(order.id), code: order.code, status: order.status, currency: order.currency,
    userId: Number(order.user_id), userTelegramId: user ? asNum(user.telegram_id) : null,
    userName: user ? user.display_name : null,
    itemsTotalMinor: asNum(order.items_total_minor), discountMinor: asNum(order.discount_minor), totalMinor: asNum(order.total_minor),
    deliveryAccount: order.delivery_account, customerNote: order.customer_note, failureReason: order.failure_reason,
    createdAt: toIso(order.created_at), updatedAt: toIso(order.updated_at),
    items: items.map((i: any) => ({
      id: Number(i.id), productId: i.product_id ? Number(i.product_id) : null, variantId: i.variant_id ? Number(i.variant_id) : null,
      productName: i.product_name, variantName: i.variant_name, quantity: asNum(i.quantity),
      unitPriceMinor: asNum(i.unit_price_minor), deliveryType: i.delivery_type, deliveryStatus: i.delivery_status,
      deliveryError: i.delivery_error || null
    })),
    deliveries: deliveries.map((d: any) => ({
      id: Number(d.id), orderItemId: Number(d.order_item_id), kind: d.kind, status: d.status,
      contentText: d.content_text || null,
      secret: secretCapable ? (d.secret_payload || null) : null,
      hasFile: !!d.file_path,
      fileName: d.file_name || null,
      downloadUrl: d.download_token ? `/api/files/${d.download_token}` : null,
      deliveredBy: d.delivered_by ? Number(d.delivered_by) : null,
      deliveredByBot: !d.delivered_by,
      attemptedAt: toIso(d.created_at),
      attemptCount: asNum(d.attempt_count)
    })),
    history: history.map((h: any) => ({
      from: h.from_status, to: h.to_status, actorRole: h.actor_role, changedBy: h.changed_by ? Number(h.changed_by) : null,
      reason: h.reason || null, at: toIso(h.created_at)
    }))
  };
}

function toIso(v: any): string | null {
  if (!v) return null;
  if (v instanceof Date) return v.toISOString();
  const s = String(v).replace(" ", "T");
  const iso = s.endsWith("Z") || /\+\d\d:\d\d$/.test(s) ? s : s + "Z";
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? String(v) : d.toISOString();
}
