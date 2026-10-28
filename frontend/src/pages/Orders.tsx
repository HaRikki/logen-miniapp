import React, { useEffect, useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { Receipt, Search } from "lucide-react";
import { api } from "../lib/api";
import { useStore } from "../state/store";
import { Shell } from "../components/Layout";
import { Button, Card, EmptyState, ErrorState, Skeleton, StatusChip, cx } from "../components/ui";
import { Tabs } from "../components/ui";

interface Summary { id: number; code: string; status: string; totalMinor: number; currency: string; itemCount: number; firstProduct: string; createdAt: string }

const FILTERS = [
  { id: "", labelKey: "home", statusFilter: "" },
];

export default function Orders() {
  const { t, lang } = useStore();
  const [params, setParams] = useSearchParams();
  const status = params.get("status") || "";
  const q = params.get("q") || "";
  const [rows, setRows] = useState<Summary[] | null>(null);
  const [err, setErr] = useState<any>(null);
  const [reload, setReload] = useState(0);

  useEffect(() => {
    let alive = true;
    setRows(null); setErr(null);
    const sp = new URLSearchParams();
    if (status) sp.set("status", status);
    if (q) sp.set("q", q);
    sp.set("limit", "30");
    api.get<{ items: Summary[] }>("/api/orders?" + sp.toString()).then(r => { if (alive) setRows(r.items); })
      .catch(e => { if (alive) setErr(e); });
    return () => { alive = false; };
  }, [status, q, reload]);

  const chips = [
    { id: "", label: lang === "km" ? "ទាំងអស់" : "All" },
    { id: "PENDING_PAYMENT", label: t("pending") },
    { id: "PROCESSING", label: lang === "km" ? "កំពុងដំណើរ" : "Processing" },
    { id: "COMPLETED", label: lang === "km" ? "បានបញ្ចប់" : "Completed" },
    { id: "FAILED", label: lang === "km" ? "បរាជ័យ" : "Failed" },
    { id: "REFUNDED", label: t("refund") }
  ];

  return (
    <Shell title={t("orders")}>
      <div className="mb-3 flex items-center gap-2 rounded-pill border border-ink/10 bg-white px-4 py-2.5 shadow-card">
        <Search size={16} className="text-ink-faint" />
        <input value={q} onChange={e => setParam("q", e.target.value)} placeholder={t("searchOrders")} className="w-full bg-transparent text-sm outline-none" />
      </div>
      <div className="no-scrollbar mb-4 -mx-4 flex gap-1.5 overflow-x-auto px-4">
        {chips.map(c => (
          <button key={c.id} onClick={() => setParam("status", c.id)}
            className={cx("shrink-0 rounded-pill px-3.5 py-1.5 text-xs font-bold transition",
              status === c.id ? "bg-primary text-white shadow-pop" : "bg-white text-ink-soft border border-ink/10")}>
            {c.label}
          </button>
        ))}
      </div>

      {err ? <ErrorState error={err} onRetry={() => setReload(v => v + 1)} /> :
        rows === null ? (
          <div className="space-y-3">{[...Array(4)].map((_, i) => <Skeleton key={i} className="h-24 rounded-card" />)}</div>
        ) : rows.length === 0 ? (
          <EmptyState title={t("noOrders")} hint={t("noOrdersHint")} icon={Receipt}
            action={<Link to="/products"><Button>{t("products")}</Button></Link>} />
        ) : (
          <div className="space-y-3">
            {rows.map(o => (
              <Link key={o.code} to={`/orders/${o.code}`}>
                <Card className="animate-fadeUp p-4 transition hover:shadow-pop">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="font-mono text-[13px] font-bold text-ink">{o.code}</p>
                      <p className="mt-0.5 truncate text-xs text-ink-faint">{o.itemCount} × {o.firstProduct}</p>
                      <p className="mt-1 text-[11px] text-ink-faint">{new Date(String(o.createdAt).replace(" ", "T") + "Z").toLocaleString(lang === "km" ? "km-KH" : "en-US", { dateStyle: "medium", timeStyle: "short" })}</p>
                    </div>
                    <div className="flex shrink-0 flex-col items-end gap-2">
                      <span className="font-display text-[15px] font-bold text-primary-dark">${(o.totalMinor / 100).toFixed(2)}</span>
                      <StatusChip status={o.status} label={statusLabel(o.status)} />
                    </div>
                  </div>
                </Card>
              </Link>
            ))}
          </div>
        )}
    </Shell>
  );

  function setParam(k: string, v: string) {
    const next = new URLSearchParams(params);
    if (v) next.set(k, v); else next.delete(k);
    setParams(next, { replace: true });
  }
  function statusLabel(s: string) {
    const map: Record<string, string> = {
      PENDING_PAYMENT: t("pending"), PAID: lang === "km" ? "បានបង់" : "Paid", PROCESSING: lang === "km" ? "កំពុងដំណើរ" : "Processing",
      COMPLETED: lang === "km" ? "បានបញ្ចប់" : "Completed", FAILED: lang === "km" ? "បរាជ័យ" : "Failed",
      CANCELLED: lang === "km" ? "បានបោះបង់" : "Cancelled", REFUNDED: t("refund")
    };
    return map[s] || s;
  }
}

void FILTERS; void useMemo;
