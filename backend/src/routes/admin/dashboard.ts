import { Router } from "express";
import { db, asNum, camelAll } from "../../db";
import { asyncHandler } from "../../common/errors";
import { requireAdmin } from "../../domain/auth";

export const adminDashboardRouter = Router();

adminDashboardRouter.get("/dashboard", requireAdmin("dashboard"), asyncHandler(async (_req, res) => {
  const k = db();
  const one = async (sql: string, bind: any[] = []) => {
    const r = await k.raw({ sql: toNative(sql, k), bind });
    return r;
  };
  // helpers -------------------------------------------------------------
  const count = async (table: string, where: Record<string, unknown> | undefined) => {
    const q = k(table);
    if (where) for (const [cndKey, v] of Object.entries(where)) q.where(cndKey, v as any);
    const r = await q.count({ n: "*" } as any).first();
    return asNum((r as any)?.n);
  };
  const sum = async (table: string, col: string, where: Record<string, unknown>) => {
    const q = k(table);
    for (const [cndKey, v] of Object.entries(where)) q.where(cndKey, v as any);
    const r = await q.sum({ v: col } as any).first();
    return asNum((r as any)?.v);
  };
  void one;

  const [totalUsers, totalProducts, totalOrders, pendingOrders] = await Promise.all([
    count("users", { is_active: 1 }),
    count("products", { status: "ACTIVE" }),
    count("orders", undefined),
    count("orders", { status: "PENDING_PAYMENT" })
  ]);
  const [completedOrders, failedOrders] = await Promise.all([
    count("orders", { status: "COMPLETED" }),
    count("orders", { status: "FAILED" })
  ]);

  const [salesMinor, depositsMinor] = await Promise.all([
    sum("orders", "total_minor", { status: "COMPLETED" }),
    sum("deposits", "amount_minor", { status: "APPROVED" })
  ]);

  // profit estimate: completed order items (unit_price - unit_cost) * qty
  const profitRow = await k.raw(
    "select coalesce(sum((oi.unit_price_minor - oi.unit_cost_minor) * oi.quantity), 0) as v " +
    "from order_items oi join orders o on o.id = oi.order_id where o.status in ('COMPLETED','PROCESSING','PAID')"
  );
  const profitMinor = asNum(profitRow?.rows?.[0]?.v ?? profitRow?.[0]?.v ?? 0);

  const walletBalances = await k.raw("select coalesce(sum(balance_minor),0) as v from wallets");
  const outstandingMinor = asNum(walletBalances?.rows?.[0]?.v ?? walletBalances?.[0]?.v ?? 0);

  // 14-day daily revenue series
  const dailyRows = await k("orders").where({ status: "COMPLETED" })
    .select("created_at", "total_minor").limit(2000);
  const map = new Map<string, number>();
  for (const r of dailyRows) {
    const d = new Date(normalizeDate(r.created_at));
    if (!Number.isNaN(d.getTime())) {
      const key = d.toISOString().slice(0, 10);
      map.set(key, (map.get(key) || 0) + asNum(r.total_minor));
    }
  }
  const salesSeries: Array<{ date: string; totalMinor: number }> = [];
  for (let i = 13; i >= 0; i--) {
    const d = new Date(Date.now() - i * 86400_000).toISOString().slice(0, 10);
    salesSeries.push({ date: d, totalMinor: map.get(d) || 0 });
  }

  const recentOrders = camelAll(await k("orders as o")
    .leftJoin("users as u", "u.id", "o.user_id")
    .select("o.id", "o.code", "o.status", "o.total_minor", "o.created_at", "u.display_name as user_name")
    .orderBy("o.id", "desc").limit(8));
  const recentTxns = camelAll(await k("wallet_transactions as w")
    .leftJoin("users as u", "u.id", "w.user_id")
    .select("w.id", "w.ref", "w.type", "w.amount_minor", "w.created_at", "u.display_name as user_name")
    .orderBy("w.id", "desc").limit(8));
  const manualQueue = await count("order_items", { delivery_type: "MANUAL", delivery_status: "PENDING" });
  const pendingDeposits = await count("deposits", { status: "PENDING" });

  res.json({
    totals: { totalUsers, totalProducts, totalOrders, pendingOrders, completedOrders, failedOrders },
    finance: { salesMinor, depositsMinor, profitMinor, outstandingMinor },
    salesSeries,
    recentOrders,
    recentTxns,
    queues: { manualQueue, pendingDeposits }
  });
}));

function normalizeDate(v: unknown): string {
  if (v instanceof Date) return v.toISOString();
  const s = String(v).replace(" ", "T");
  return s.endsWith("Z") || /\+\d\d:\d\d$/.test(s) ? s : s + "Z";
}

function toNative(sql: string, k: any): string {
  return k.client?.dialect === "postgres" ? sql.replace(/\?/g, (_, i: number) => `$${++i}`) : sql;
}
