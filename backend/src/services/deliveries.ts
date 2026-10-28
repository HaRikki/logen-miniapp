import { Knex, db, toDbTime, asNum, asJson } from "../db";
import { token } from "../common/id";
import { sanitizeText } from "../domain/auth";
import { notify } from "./notify";
import { insertGetId } from "./wallet";

/**
 * Fulfill one order item automatically, inside the purchase transaction.
 * Stock semantics:
 *  - stock_mode UNLIMITED      -> no inventory needed; content = variant/product instructions.
 *  - stock_mode INVENTORY/KEY_POOL -> claim N digital_inventory rows atomically.
 * Key claiming uses a conditional UPDATE (status AVAILABLE -> ASSIGNED) so a
 * single key can never be delivered to two different users/line items.
 */
export async function fulfillAutoItem(opts: {
  trx: Knex.Transaction;
  orderId: number;
  orderItemId: number;
  userId: number;
}): Promise<{ ok: boolean; error?: string }> {
  const { trx, orderId, orderItemId, userId } = opts;
  const item = await trx("order_items").where({ id: orderItemId }).forUpdate().first();
  if (!item) return { ok: false, error: "item missing" };
  if (item.delivery_status === "DELIVERED") return { ok: true };

  const product = await trx("products").where({ id: item.product_id }).first();
  if (!product) return { ok: false, error: "product missing" };

  let secretPayload: string | null = null;
  let contentText: string | null = null;
  let filePath: string | null = null;
  let fileName: string | null = null;

  if (product.stock_mode === "UNLIMITED") {
    const variant = item.variant_id ? await trx("product_variants").where({ id: item.variant_id }).first() : null;
    contentText = sanitizeText(variant?.name ? `${product.instructions || product.description || ""}\n\nPackage: ${variant.name}` : (product.instructions || product.description || ""));
  } else {
    const need = asNum(item.quantity);
    const claimed: any[] = [];
    // Only rows belonging to THIS product (product-level pool, or this variant's own keys).
    let q: any = trx("digital_inventory")
      .where({ status: "AVAILABLE", product_id: item.product_id })
      .orderBy("id", "asc");
    if (item.variant_id) q.andWhere((b: any) => b.whereNull("variant_id").orWhere("variant_id", item.variant_id));
    else q.whereNull("variant_id");
    const candidates = await q.limit(Math.max(need * 4, 8));
    for (const candidate of candidates) {
      if (claimed.length >= need) break;
      const updated = await trx("digital_inventory")
        .where({ id: candidate.id, status: "AVAILABLE" })
        .update({ status: "ASSIGNED", order_item_id: orderItemId, assigned_at: toDbTime() });
      if (updated === 1) claimed.push(candidate);
    }
    if (claimed.length < need) {
      // roll back claims made in this item scope
      for (const c of claimed) {
        await trx("digital_inventory").where({ id: c.id }).update({ status: "AVAILABLE", order_item_id: null, assigned_at: null });
      }
      return { ok: false, error: "Out of stock: no digital inventory left to deliver" };
    }
    const parts: string[] = [];
    for (const c of claimed) {
      if (c.item_type === "FILE" && c.value) {
        filePath = String(c.value); fileName = c.file_name || "download";
        parts.push("[A file was attached to this order — use the download button]");
      } else if (c.item_type === "ACCOUNT" && c.value) {
        const acc = asJson<any>(c.value, {});
        parts.push(`Account: ${acc.login || ""}\nPassword: ${acc.password || ""}${acc.note ? `\nNote: ${acc.note}` : ""}`);
      } else {
        parts.push(String(c.value ?? ""));
      }
    }
    secretPayload = parts.join("\n---\n");
    contentText = sanitizeText(product.instructions || "Your digital item is ready. Use the key/file below.");
  }

  const downloadToken = token(24);
  await insertGetId(trx, "deliveries", {
    order_id: orderId, order_item_id: orderItemId, kind: "AUTO", status: "DELIVERED",
    content_text: contentText, secret_payload: secretPayload,
    file_path: filePath, file_name: fileName, download_token: downloadToken,
    delivered_by: null, attempt_count: 1,
    logs: JSON.stringify([{ at: toDbTime(), action: "AUTO_DELIVERED" }]),
    created_at: toDbTime(), updated_at: toDbTime()
  }, { download_token: downloadToken });

  await trx("order_items").where({ id: orderItemId }).update({ delivery_status: "DELIVERED", delivery_error: null });
  return { ok: true };
}

/** Admin manual delivery for an item; content is sanitized, secret stored separately. */
export async function manualDeliverItem(opts: {
  orderId: number;
  orderItemId: number;
  adminId: number;
  text?: string;
  secret?: string;
  filePath?: string | null;
  fileName?: string | null;
}): Promise<{ ok: boolean; error?: string }> {
  const k = db();
  const item = await k("order_items").where({ id: opts.orderItemId, order_id: opts.orderId }).first();
  if (!item) return { ok: false, error: "Order item not found" };
  const downloadToken = token(24);
  const payload = {
    order_id: opts.orderId, order_item_id: opts.orderItemId, kind: "MANUAL", status: "DELIVERED",
    content_text: sanitizeText(opts.text || ""), secret_payload: opts.secret ? String(opts.secret).slice(0, 8000) : null,
    file_path: opts.filePath || null, file_name: opts.fileName || null, download_token: downloadToken,
    delivered_by: opts.adminId, attempt_count: 1,
    logs: JSON.stringify([{ at: toDbTime(), action: "MANUAL_DELIVERED", by_admin: opts.adminId }]),
    created_at: toDbTime(), updated_at: toDbTime()
  };
  const existing = await k("deliveries").where({ order_item_id: opts.orderItemId }).first();
  if (existing) {
    await k("deliveries").where({ id: existing.id }).update({
      ...payload, logs: String(existing.logs || "[]").replace(/]$/, `, ${JSON.stringify({ at: toDbTime(), action: "MANUAL_REDISTRIBUTED", by_admin: opts.adminId })}]`)
    });
  } else {
    await k("deliveries").insert(payload);
  }
  await k("order_items").where({ id: opts.orderItemId }).update({ delivery_status: "DELIVERED", delivery_error: null });
  await k("orders").where({ id: opts.orderId, status: "PROCESSING" }).update({ status: "COMPLETED", updated_at: toDbTime() });
  const order = await k("orders").where({ id: opts.orderId }).first();
  if (order) {
    await notify({
      userId: order.user_id, kind: "DELIVERED",
      title: `Order ${order.code} delivered`,
      body: "Your purchase has been delivered. Open the order to view details.",
      link: `/orders/${order.code}`
    });
  }
  return { ok: true };
}

/** Mark auto delivery failed on an item (also used by retry logic). */
export async function failAutoItem(trx: Knex.Transaction, orderItemId: number, reason: string): Promise<void> {
  await trx("order_items").where({ id: orderItemId }).update({ delivery_status: "FAILED", delivery_error: reason.slice(0, 2000) });
}
