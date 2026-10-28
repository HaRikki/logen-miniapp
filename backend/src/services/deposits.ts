import { Knex, db, toDbTime, asNum, camel } from "../db";
import { bizId } from "../common/id";
import { badRequest, conflict, notFound } from "../common/errors";
import { config } from "../config";
import { walletChange } from "./wallet";
import { notify } from "./notify";

export async function listProviders(activeOnly = false) {
  const k = db();
  const q = k("payment_providers").orderBy("sort_order", "asc");
  if (activeOnly) q.where({ is_active: 1 });
  return camelAll(await q);
}
function camelAll(rows: any[]) { return (rows || []).map(camel); }

/** User creates a deposit request. Balance is NOT credited here — only on approval. */
export async function createDeposit(userId: number, input: {
  providerCode: string; amountMinor: number; txnRef?: string; proofPath?: string | null;
}) {
  const k = db();
  const provider = await k("payment_providers").where({ code: input.providerCode, is_active: 1 }).first();
  if (!provider) throw badRequest("Payment method not available", "PROVIDER_MISSING");
  const amount = Math.floor(Number(input.amountMinor));
  if (!Number.isFinite(amount) || amount < asNum(provider.min_minor)) {
    throw badRequest(`Minimum top-up is ${(asNum(provider.min_minor) / 100).toFixed(2)} ${provider.currency}`, "DEPOSIT_MIN");
  }
  if (asNum(provider.max_minor) > 0 && amount > asNum(provider.max_minor)) {
    throw badRequest(`Maximum top-up is ${(asNum(provider.max_minor) / 100).toFixed(2)} ${provider.currency}`, "DEPOSIT_MAX");
  }
  const code = bizId("DEP");
  const txnRef = String(input.txnRef || "").trim().slice(0, 120);
  if (txnRef) {
    const dup = await k("deposits").where({ txn_ref: txnRef }).first();
    if (dup) throw conflict("That transaction reference was already submitted", "DUP_TXN_REF");
  }
  const expires = new Date(Date.now() + config.deposits.expiryHours * 3600_000);
  await k("deposits").insert({
    code, user_id: userId, provider_id: provider.id, provider_code: provider.code,
    amount_minor: amount, currency: provider.currency, status: "PENDING",
    txn_ref: txnRef || code, proof_path: input.proofPath || null,
    expires_at: toDbTime(expires), created_at: toDbTime()
  });
  const row = await k("deposits").where({ code }).first();
  return camel(row);
}

/**
 * Admin approves a deposit. Double-credit protection:
 * conditional UPDATE PENDING -> APPROVED must affect exactly one row, and the
 * wallet credit uses the idempotency key `deposit:${id}` so even a replay of
 * this call posts at most ONE top-up transaction.
 */
export async function approveDeposit(depositId: number, adminId: number, note?: string) {
  const k = db();
  const result = await k.transaction(async (trx: Knex.Transaction) => {
    const dep = await trx("deposits").where({ id: depositId }).forUpdate().first();
    if (!dep) throw notFound("Deposit not found");
    if (dep.status !== "PENDING") return { skipped: true as const, dep, creditedAmount: 0 };
    const moved = await trx("deposits").where({ id: depositId, status: "PENDING" })
      .update({ status: "APPROVED", reviewed_by: adminId, reviewed_at: toDbTime(), admin_note: note || dep.admin_note });
    if (moved !== 1) return { skipped: true as const, dep, creditedAmount: 0 };
    const w = await walletChange({
      trx, userId: Number(dep.user_id), type: "DEPOSIT", amountSignedMinor: asNum(dep.amount_minor),
      depositId: Number(dep.id), createdById: adminId,
      reason: `Top-up ${dep.code} via ${dep.provider_code}`, idempotencyKey: `deposit:${dep.id}`
    });
    await trx("deposits").where({ id: depositId }).update({ wallet_txn_id: w.txnId });
    await trx("payments").insert({
      code: bizId("PAY"), user_id: dep.user_id, deposit_id: depositId, provider_code: dep.provider_code,
      provider_payment_id: null, status: "SETTLED", amount_minor: dep.amount_minor,
      currency: dep.currency, provider_payload: JSON.stringify({ mode: "MANUAL_APPROVAL", ref: dep.txn_ref, by_admin: adminId }),
      created_at: toDbTime()
    });
    return { skipped: false as const, dep, creditedAmount: asNum(dep.amount_minor), balanceAfter: w.balanceAfter };
  });
  if (!result.skipped) {
    await notify({
      userId: Number(result.dep.user_id), kind: "DEPOSIT_APPROVED",
      title: `Top-up approved: ${(result.creditedAmount / 100).toFixed(2)} ${result.dep.currency}`,
      body: `Deposit ${result.dep.code} was credited to your wallet.`, link: "/wallet",
      telegramText: `Digital Store: your top-up ${result.dep.code} of ${(result.creditedAmount / 100).toFixed(2)} ${result.dep.currency} was approved.`
    });
  }
  return { ok: true, skipped: result.skipped };
}

export async function rejectDeposit(depositId: number, adminId: number, reason: string) {
  const k = db();
  const dep = await k("deposits").where({ id: depositId }).first();
  if (!dep) throw notFound("Deposit not found");
  if (dep.status !== "PENDING") throw conflict(`Deposit already ${dep.status}`, "BAD_STATE");
  const moved = await k("deposits").where({ id: depositId, status: "PENDING" }).update({
    status: "REJECTED", reviewed_by: adminId, reviewed_at: toDbTime(), admin_note: (reason || "").slice(0, 1000)
  });
  if (moved !== 1) throw conflict("Deposit was already reviewed", "BAD_STATE");
  await notify({
    userId: Number(dep.user_id), kind: "DEPOSIT_REJECTED",
    title: `Top-up ${dep.code} rejected`, body: reason || "Payment proof could not be verified",
    link: "/wallet",
    telegramText: `Digital Store: your top-up ${dep.code} was rejected. ${reason || ""}`
  });
  return { ok: true };
}

/** Background: expire stale PENDING deposits. */
export async function expireDeposits(): Promise<number> {
  const rows = await db()("deposits").where({ status: "PENDING" }).andWhere("expires_at", "<", toDbTime()).select("id", "user_id", "code");
  for (const r of rows) {
    await db()("deposits").where({ id: r.id, status: "PENDING" }).update({ status: "EXPIRED" });
  }
  return rows.length;
}
