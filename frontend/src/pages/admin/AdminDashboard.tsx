import React from "react";
import { Link } from "react-router-dom";
import {
  AlertTriangle, BadgeDollarSign, CheckCircle2, Clock3, PiggyBank, ShoppingBag,
  Sparkles, Users, Wallet
} from "lucide-react";
import { useStore } from "../../state/store";
import { Card, cx, StatusChip } from "../../components/ui";
import { Loading, useLoad } from "../../components/adminKit";

interface Dash {
  totals: { totalUsers: number; totalProducts: number; totalOrders: number; pendingOrders: number; completedOrders: number; failedOrders: number };
  finance: { salesMinor: number; depositsMinor: number; profitMinor: number; outstandingMinor: number };
  salesSeries: Array<{ date: string; totalMinor: number }>;
  recentOrders: Array<{ id: number; code: string; status: string; totalMinor: number; createdAt: string; userName: string | null }>;
  recentTxns: Array<{ id: number; ref: string; type: string; amountMinor: number; createdAt?: string; userName: string | null }>;
  queues: { manualQueue: number; pendingDeposits: number };
}

export default function AdminDashboard() {
  const { money, lang } = useStore();
  const { data, loading, error, reload } = useLoad<Dash>("/api/admin/dashboard");

  if (loading && !data) return <Loading />;
  if (!data) return <div className="p-8 text-center"><p className="text-sm text-danger">{error || "failed"}</p><button onClick={reload} className="mt-2 text-sm font-bold text-primary">Retry</button></div>;

  const d = data;
  const maxDay = Math.max(...d.salesSeries.map(x => x.totalMinor), 100);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="font-display text-2xl font-bold text-ink">{lang === "km" ? "ផ្ទាំងសង្ខេប" : "Dashboard"}</h1>
          <p className="text-sm text-ink-soft">{lang === "km" ? "ទិន្នន័យពិតប្រាកដពីមូលដ្ឋានទិន្នន័យ" : "Live numbers from the database"}</p>
        </div>
        <button onClick={reload} className="rounded-pill border border-ink/10 bg-white px-4 py-2 text-xs font-bold text-ink-soft shadow-card active:scale-95">↻ Refresh</button>
      </div>

      {/* KPI grid */}
      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
        <Kpi label={lang === "km" ? "អ្នកប្រើ" : "Users"} value={d.totals.totalUsers} icon={Users} tone="from-primary/15 to-primary/5" />
        <Kpi label={lang === "km" ? "ផលិតផល" : "Products"} value={d.totals.totalProducts} icon={Sparkles} tone="from-sky-400/15 to-sky-400/5" />
        <Kpi label={lang === "km" ? "ការបញ្ជាទិញ" : "Orders"} value={d.totals.totalOrders} icon={ShoppingBag} tone="from-emerald-500/15 to-emerald-500/5" />
        <Kpi label={lang === "km" ? "រង់ចាំបង់ប្រាក់" : "Pending"} value={d.totals.pendingOrders} icon={Clock3} tone="from-amber-500/15 to-amber-500/5" sub={d.queues.manualQueue ? (lang === "km" ? `Deliver queue: ${d.queues.manualQueue}` : `Manual queue: ${d.queues.manualQueue}`) : undefined} />
        <Kpi label={lang === "km" ? "បញ្ចប់" : "Completed"} value={d.totals.completedOrders} icon={CheckCircle2} tone="from-teal-500/15 to-teal-500/5" />
        <Kpi label={lang === "km" ? "បរាជ័យ" : "Failed"} value={d.totals.failedOrders} icon={AlertTriangle} tone="from-red-500/15 to-red-500/5" />
      </div>

      {/* finance row */}
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <FinanceCard label={lang === "km" ? "ការលក់ (Completed)" : "Sales (completed)"} value={money(d.finance.salesMinor)} icon={BadgeDollarSign} tone="text-success" />
        <FinanceCard label={lang === "km" ? "ប្រាក់បញ្ចូលរបស់អតិថិជន" : "Customer deposits"} value={money(d.finance.depositsMinor)} icon={Wallet} tone="text-primary-dark" />
        <FinanceCard label={lang === "km" ? "ចំណេញប៉ាន់ស្មាន" : "Estimated profit"} value={money(d.finance.profitMinor)} icon={PiggyBank} tone="text-[#B58900]" hint={lang === "km" ? "តម្លៃលក់ − តម្លៃដើម (order items)" : "sale − cost across sold items"} />
        <FinanceCard label={lang === "km" ? "សមតុល្យជាប់កាបូប" : "Wallet float"} value={money(d.finance.outstandingMinor)} icon={Users} tone="text-violet-700" hint={lang === "km" ? "ប្រាក់ដែលអតិថិជននៅមិនទាន់ចាយ" : "Customer balances not yet spent"} />
      </div>

      <div className="grid gap-4 xl:grid-cols-3">
        {/* sales chart */}
        <Card className="p-5 xl:col-span-2">
          <h2 className="mb-4 font-display text-sm font-bold text-ink">{lang === "km" ? "ការលក់ ១៤ ថ្ងៃចុងក្រោយ" : "Completed sales — last 14 days"}</h2>
          <div className="flex h-44 items-end gap-2">
            {d.salesSeries.map(s => (
              <div key={s.date} className="group flex min-w-0 flex-1 flex-col items-center justify-end gap-1" style={{ height: "100%" }}>
                <span className="pointer-events-none rounded-lg bg-ink px-1.5 py-0.5 text-[9px] font-bold text-white opacity-0 shadow transition group-hover:opacity-100">{money(s.totalMinor)}</span>
                <div className={cx("w-full rounded-t-lg bg-gradient-to-t transition-all", s.totalMinor > 0 ? "from-primary/80 to-[#2BB3D9]" : "from-canvas to-primary-light/60")}
                  style={{ height: `${s.totalMinor === 0 ? 3 : Math.max(8, (s.totalMinor / maxDay) * 100)}%` }} />
                <span className="w-full truncate text-center text-[8.5px] font-bold text-ink-faint">{s.date.slice(5).replace("-", "/")}</span>
              </div>
            ))}
          </div>
        </Card>

        {/* queues */}
        <Card className="flex flex-col p-5">
          <h2 className="mb-3 font-display text-sm font-bold text-ink">{lang === "km" ? "ការរង់ចាំសម្រាប់ Admin" : "Needs attention"}</h2>
          <QueueLink to="/admin/orders" count={d.queues.manualQueue} title={lang === "km" ? "Manual delivery queue" : "Manual delivery queue"} icon={ShoppingBag} />
          <QueueLink to="/admin/finance/deposits" count={d.queues.pendingDeposits} title={lang === "km" ? "Deposit approvals" : "Deposit approvals"} icon={Wallet} />
          <QueueLink to="/admin/orders" count={d.totals.failedOrders} title={lang === "km" ? "Failed deliveries" : "Failed deliveries"} icon={AlertTriangle} danger />
        </Card>
      </div>

      <div className="grid gap-4 xl:grid-cols-2">
        <Card className="p-5">
          <h2 className="mb-2 font-display text-sm font-bold text-ink">{lang === "km" ? "ការបញ្ជាទិញថ្មីៗ" : "Recent orders"}</h2>
          <div className="divide-y divide-ink/5">
            {d.recentOrders.map(o => (
              <Link key={o.code} to={`/admin/orders?code=${encodeURIComponent(o.code)}`} className="flex items-center gap-3 py-2.5 transition hover:bg-canvas/60">
                <div className="min-w-0 flex-1">
                  <p className="truncate font-mono text-xs font-bold">{o.code}</p>
                  <p className="truncate text-[11px] text-ink-faint">{o.userName || "—"} · {new Date(String(o.createdAt).replace(" ", "T") + "Z").toLocaleString(lang === "km" ? "km-KH" : "en-US", { dateStyle: "medium", timeStyle: "short" })}</p>
                </div>
                <span className="text-sm font-bold">{money(Number(o.totalMinor))}</span>
                <StatusChip status={o.status} />
              </Link>
            ))}
            {d.recentOrders.length === 0 ? <p className="py-6 text-center text-xs text-ink-faint">{lang === "km" ? "មិនទាន់មាន" : "No orders yet"}</p> : null}
          </div>
        </Card>
        <Card className="p-5">
          <h2 className="mb-2 font-display text-sm font-bold text-ink">{lang === "km" ? "ប្រតិបត្តិការកាបូបថ្មីៗ" : "Recent wallet activity"}</h2>
          <div className="divide-y divide-ink/5">
            {d.recentTxns.map(x => (
              <div key={x.id} className="flex items-center gap-3 py-2.5">
                <StatusChip status={x.type} label={x.type.replace(/_/g, " ")} />
                <p className="min-w-0 flex-1 truncate font-mono text-[11px] text-ink-faint">{x.ref}</p>
                <p className="truncate text-[11px]">{x.userName}</p>
                <p className={cx("text-sm font-bold", Number(x.amountMinor) > 0 ? "text-success" : "text-ink")}>{Number(x.amountMinor) > 0 ? "+" : "−"}{money(Math.abs(Number(x.amountMinor)))}</p>
              </div>
            ))}
            {d.recentTxns.length === 0 ? <p className="py-6 text-center text-xs text-ink-faint">—</p> : null}
          </div>
        </Card>
      </div>
    </div>
  );
}

function Kpi({ label, value, icon: Icon, tone, sub }: { label: string; value: number; icon: any; tone: string; sub?: string }) {
  return (
    <Card className="p-4">
      <div className={cx("mb-3 flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br", tone)}>
        <Icon size={17} className="text-primary-dark" />
      </div>
      <p className="font-display text-2xl font-bold leading-tight text-ink">{value}</p>
      <p className="mt-0.5 text-[11px] font-bold uppercase tracking-wide text-ink-faint">{label}</p>
      {sub ? <p className="mt-1 text-[10px] font-bold text-warning">{sub}</p> : null}
    </Card>
  );
}

function FinanceCard({ label, value, icon: Icon, tone, hint }: { label: string; value: string; icon: any; tone: string; hint?: string }) {
  return (
    <Card className="p-5">
      <p className="text-[11px] font-bold uppercase tracking-wide text-ink-faint">{label}</p>
      <p className={cx("mt-1.5 flex items-center gap-2 font-display text-[22px] font-bold", tone)}>
        <Icon size={18} /> {value}
      </p>
      {hint ? <p className="mt-1 text-[11px] text-ink-faint">{hint}</p> : null}
    </Card>
  );
}

function QueueLink({ to, count, title, icon: Icon, danger }: { to: string; count: number; title: string; icon: any; danger?: boolean }) {
  return (
    <Link to={to} className="mb-2 flex items-center gap-3 rounded-2xl border border-ink/5 bg-canvas px-4 py-3 transition hover:border-primary/30 hover:bg-primary-soft">
      <div className={cx("flex h-9 w-9 items-center justify-center rounded-xl", danger ? "bg-red-50 text-danger" : "bg-primary-light text-primary")}>
        <Icon size={17} />
      </div>
      <span className="flex-1 text-[13px] font-bold text-ink">{title}</span>
      <span className={cx("rounded-pill px-2.5 py-1 text-xs font-black", danger ? "bg-danger text-white" : "bg-white text-primary-dark shadow-card")}>{count}</span>
    </Link>
  );
}
