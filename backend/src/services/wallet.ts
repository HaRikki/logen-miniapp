import { Knex, db, toDbTime, asNum } from "../db";
import { AppError, badRequest, conflict } from "../common/errors";
import { bizId } from "../common/id";
import type { SessionUser } from "../domain/auth";

export type TxnType = "DEPOSIT" | "PURCHASE" | "REFUND" | "ADMIN_CREDIT" | "ADMIN_DEBIT";

/**
 * Atomic wallet mutation. MUST be called inside a trx that also performs the
 * business change. Balance can never go below zero: we use a conditional
 * UPDATE ... WHERE balance >= amount and check affected rows.
 */
export async function walletChange(opts: {
  trx: Knex.Transaction;
  userId: number;
  type: TxnType;
  amountSignedMinor: number;      // + credit, - debit
  orderId?: number | null;
  depositId?: number | null;
  createdById?: number | null;
  reason?: string | null;
  idempotencyKey?: string | null;
}): Promise<{ txnId: number; ref: string; balanceAfter: number }> {
  const { trx, userId, type, amountSignedMinor } = opts;
  if (!Number.isInteger(amountSignedMinor) || amountSignedMinor === 0) {
    throw badRequest("Amount must be a non-zero integer in minor units", "BAD_AMOUNT");
  }

  if (opts.idempotencyKey) {
    const dup = await trx("wallet_transactions").where({ idempotency_key: opts.idempotencyKey }).first();
    if (dup) {
      return { txnId: dup.id, ref: dup.ref, balanceAfter: asNum(dup.balance_after_minor) };
    }
  }

  const wallet = await trx("wallets").where({ user_id: userId }).forUpdate().first();
  if (!wallet) throw badRequest("Wallet not found", "NO_WALLET");
  const before = asNum(wallet.balance_minor);
  const after = before + amountSignedMinor;
  if (after < 0) {
    throw new AppError(409, "INSUFFICIENT_BALANCE", "Wallet balance is not enough for this purchase");
  }

  const guarded = amountSignedMinor < 0
    ? await trx("wallets").where({ user_id: userId }).andWhere("balance_minor", ">=", -amountSignedMinor)
        .update({ balance_minor: after, updated_at: toDbTime() })
    : await trx("wallets").where({ user_id: userId }).update({ balance_minor: after, updated_at: toDbTime() });
  if (guarded !== 1) throw conflict("Concurrent balance change detected, please retry", "CONFLICT_BALANCE");

  if (amountSignedMinor > 0 && (type === "DEPOSIT" || type === "ADMIN_CREDIT")) {
    await trx("wallets").where({ user_id: userId }).increment("lifetime_topup_minor", amountSignedMinor);
  }
  if (amountSignedMinor < 0) {
    await trx("wallets").where({ user_id: userId }).increment("lifetime_spend_minor", -amountSignedMinor);
  }

  const ref = bizId("WLT");
  const txnId = await insertGetId(trx, "wallet_transactions", {
    ref, user_id: userId, type, amount_minor: amountSignedMinor,
    balance_before_minor: before, balance_after_minor: after,
    order_id: opts.orderId ?? null, deposit_id: opts.depositId ?? null,
    created_by: opts.createdById ?? null, reason: opts.reason ?? null,
    idempotency_key: opts.idempotencyKey ?? null, created_at: toDbTime()
  }, { ref });
  return { txnId, ref, balanceAfter: after };
}

/** Insert a row and return its autoincrement id on both sqlite and pg. */
export async function insertGetId(
  k: Knex | Knex.Transaction, table: string, row: Record<string, unknown>, lookup: Record<string, unknown>
): Promise<number> {
  const res = await k(table).insert(row);
  const direct = Array.isArray(res) ? Number(res[0]) : Number(res);
  if (Number.isFinite(direct) && direct > 0) return direct;
  const saved = await k(table).where(lookup).first();
  if (!saved) throw new Error(`insertGetId: row not found after insert into ${table}`);
  return Number(saved.id);
}

/** Claim idempotency key for a request scope; returns stored response on replay. */
export async function claimIdempotency(k: Knex | Knex.Transaction, key: string, userId: number, scope: string): Promise<{ replay?: string }> {
  const existing = await k("idempotency_keys").where({ key, user_id: userId, scope }).first();
  if (existing) return { replay: existing.response ? String(existing.response) : "{}" };
  await k("idempotency_keys").insert({ key, user_id: userId, scope, resource_id: null, response: null, created_at: toDbTime() });
  return {};
}

export async function saveIdempotencyResponse(k: Knex | Knex.Transaction, key: string, resourceId: number | null, response: string) {
  await k("idempotency_keys").where({ key }).update({ resource_id: resourceId, response });
}

export async function getBalance(userId: number): Promise<number> {
  const w = await db()("wallets").where({ user_id: userId }).first();
  return w ? asNum(w.balance_minor) : 0;
}
