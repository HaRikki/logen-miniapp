import React, { useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import {
  AlertTriangle, CheckCircle2, ChevronDown, Clock, Copy, Download, Eye, EyeOff,
  Hourglass, Loader2, Package, ShieldQuestion, Wallet, XCircle
} from "lucide-react";
import { api, type OrderView } from "../lib/api";
import { useStore } from "../state/store";
import { Shell } from "../components/Layout";
import { Button, Card, Skeleton, StatusChip, cx } from "../components/ui";

export default function OrderDetail() {
  const { code } = useParams();
  const { t, money, lang, toast, confirm, refreshUser } = useStore();
  const nav = useNavigate();
  const [order, setOrder] = useState<OrderView | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState(false);
  const [showHistory, setShowHistory] = useState(false);

  useEffect(() => {
    setOrder(null); setErr(false);
    api.get<{ order: OrderView }>(`/api/orders/${code}`).then(r => setOrder(r.order)).catch(() => setErr(true));
  }, [code]);

  async function pay() {
    if (!order) return;
    setBusy(true);
    try {
      const r = await api.post<{ order: OrderView }>(`/api/orders/${order.code}/pay`, {});
      setOrder(r.order);
      await refreshUser();
      toast("success", r.order.status === "PROCESSING" ? (lang === "km" ? "បានបង់ — រង់ចាំការបញ្ជូន" : "Paid — waiting for delivery") : t("paymentSuccess"));
    } catch (e: any) {
      if (e?.code === "INSUFFICIENT_BALANCE") {
        const go = await confirm(t("topUp"), t("insufficientBalance"));
        if (go) nav("/wallet?topup=1");
      } else toast("error", e?.message || t("errorTitle"));
    } finally { setBusy(false); }
  }

  async function cancel() {
    if (!order) return;
    const ok = await confirm(t("cancelOrder"), t("cancelOrderConfirm"), true);
    if (!ok) return;
    setBusy(true);
    try {
      const r = await api.post<{ order: OrderView }>(`/api/orders/${order.code}/cancel`, {});
      setOrder(r.order);
      toast("success", t("orderCancelled"));
    } catch (e: any) { toast("error", e?.message || t("errorTitle")); }
    finally { setBusy(false); }
  }

  if (err) {
    return <Shell back title={t("orderDetails")}><Empty label={t("noResults")} /></Shell>;
  }
  if (!order) {
    return (
      <Shell back title={t("orderId")}>
        <Skeleton className="h-28 rounded-card" />
        <Skeleton className="mt-4 h-48 rounded-card" />
      </Shell>
    );
  }

  const hero = heroFor(order.status);

  return (
    <Shell back title={`${t("orderDetails")}`}>
      <Card className={cx("mb-4 overflow-hidden p-0")}>
        <div className={cx("px-5 py-5", hero.tint)}>
          <div className="flex items-start gap-3">
            <div className={cx("mt-0.5 flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-white/20", hero.spin && "animate-pulse")}>
              <hero.icon size={22} className="text-white" />
            </div>
            <div className="min-w-0 flex-1">
              <p className="font-display text-base font-bold text-white">{hero.title}</p>
              <p className="mt-0.5 break-all font-mono text-xs text-white/85">{order.code}</p>
              <p className="mt-1.5 text-[11px] text-white/75">{new Date(order.createdAt).toLocaleString(lang === "km" ? "km-KH" : "en-US")}</p>
            </div>
            <div className="text-right">
              <p className="font-display text-lg font-bold text-white">{money(order.totalMinor, order.currency)}</p>
              <StatusChip status={order.status} />
            </div>
          </div>
          {order.failureReason && ["FAILED", "CANCELLED", "REFUNDED"].includes(order.status) ? (
            <p className="mt-3 flex items-start gap-1.5 rounded-xl bg-black/15 p-2.5 text-xs text-white/95">
              <AlertTriangle size={14} className="mt-0.5 shrink-0" /> {order.failureReason}
            </p>
          ) : null}
        </div>

        {order.status === "PENDING_PAYMENT" ? (
          <div className="flex gap-2 p-4">
            <Button variant="outline" className="flex-1" onClick={cancel} loading={busy}>{t("cancelOrder")}</Button>
            <Button className="flex-1" icon={Wallet} onClick={pay} loading={busy}>{t("topUp")} · {money(order.totalMinor, order.currency)}</Button>
          </div>
        ) : null}
      </Card>

      {/* items */}
      <Card className="mb-4 p-0">
        <p className="border-b border-ink/5 px-4 py-3 font-display text-sm font-bold">{t("items")}</p>
        <div className="divide-y divide-ink/5">
          {order.items.map(it => (
            <div key={it.id} className="flex items-center justify-between gap-3 px-4 py-3">
              <div className="min-w-0">
                <Link to={it.productId ? `/product/${it.productId}` : "#"} className="block truncate text-sm font-semibold hover:text-primary">{it.productName}{it.variantName ? ` — ${it.variantName}` : ""}</Link>
                <p className="mt-0.5 text-xs text-ink-faint">{t("qty")} {it.quantity} × {money(it.unitPriceMinor, order.currency)} · {it.deliveryType === "AUTO" ? t("deliveryInstant") : t("deliveryManual")}</p>
                {it.deliveryStatus === "FAILED" && it.deliveryError ? <p className="mt-1 text-[11px] font-semibold text-danger">{it.deliveryError}</p> : null}
              </div>
              <div className="text-right">
                <p className="text-sm font-bold">{money(it.unitPriceMinor * it.quantity, order.currency)}</p>
                <p className={cx("mt-0.5 text-[11px] font-bold uppercase",
                  it.deliveryStatus === "DELIVERED" ? "text-success" : it.deliveryStatus === "FAILED" ? "text-danger" : "text-warning")}>
                  {it.deliveryStatus === "DELIVERED" ? t("deliveredTo") : it.deliveryStatus === "FAILED" ? t("failedReason") : t("pendingQueue")}
                </p>
              </div>
            </div>
          ))}
        </div>
        <div className="space-y-1 border-t border-ink/5 px-4 py-3 text-sm">
          <div className="flex justify-between text-ink-soft"><span>{t("subtotal")}</span><span>{money(order.itemsTotalMinor, order.currency)}</span></div>
          {order.discountMinor ? <div className="flex justify-between text-success"><span>{t("discount")}</span><span>−{money(order.discountMinor, order.currency)}</span></div> : null}
          <div className="flex justify-between pt-1 font-display font-bold text-ink"><span>{t("total")}</span><span className="text-primary-dark">{money(order.totalMinor, order.currency)}</span></div>
        </div>
      </Card>

      {/* deliveries */}
      {order.deliveries.length ? (
        <div className="mb-4 space-y-3">
          <p className="font-display text-sm font-bold">{t("deliveryResult")}</p>
          {order.deliveries.map(d => <DeliveryBox key={d.id} d={d} order={order} />)}
        </div>
      ) : null}

      {order.deliveryAccount || order.customerNote ? (
        <Card className="mb-4 p-4 text-sm">
          {order.deliveryAccount ? <p className="text-ink-soft">{t("deliveryAccountLabel")}: <b className="text-ink">{order.deliveryAccount}</b></p> : null}
          {order.customerNote ? <p className="mt-1 text-ink-soft">{t("customerNote")}: <b className="text-ink">{order.customerNote}</b></p> : null}
        </Card>
      ) : null}

      {/* history */}
      <button className="mb-2 flex w-full items-center justify-between rounded-card border border-ink/5 bg-white px-4 py-3 text-sm font-bold shadow-card" onClick={() => setShowHistory(v => !v)}>
        <span className="flex items-center gap-2"><Clock size={16} className="text-primary" /> {lang === "km" ? "ប្រវត្តិស្ថានភាព" : "Status history"}</span>
        <ChevronDown size={16} className={cx("transition-transform", showHistory && "rotate-180")} />
      </button>
      {showHistory ? (
        <Card className="mb-6 p-4">
          <ol className="relative ml-2 space-y-3 border-l border-primary/20 pl-4">
            {order.history.map((h, i) => (
              <li key={i} className="text-[13px]">
                <span className="absolute -left-[5px] mt-1.5 h-2.5 w-2.5 rounded-full bg-primary/70" />
                <b>{h.to.replace(/_/g, " ")}</b>
                <span className="ml-2 text-ink-faint">{h.at ? new Date(h.at).toLocaleString() : ""}</span>
                <div className="text-xs text-ink-faint">{h.actorRole}{h.reason ? ` · ${h.reason}` : ""}</div>
              </li>
            ))}
          </ol>
        </Card>
      ) : null}
    </Shell>
  );
}

function DeliveryBox({ d, order }: { d: OrderView["deliveries"][number]; order: OrderView }) {
  const { t, lang, toast } = useStore();
  const [revealed, setRevealed] = useState(false);
  const [copied, setCopied] = useState(false);

  async function copySecret() {
    try {
      await navigator.clipboard.writeText(d.secret || "");
      setCopied(true);
      toast("success", t("copiedSecret"));
      setTimeout(() => setCopied(false), 1800);
    } catch { toast("error", "Copy failed"); }
  }

  const itemName = order.items.find(i => i.id === d.orderItemId)?.productName || "";

  return (
    <Card className="animate-fadeUp overflow-hidden">
      <div className="flex items-center justify-between border-b border-ink/5 px-4 py-2.5">
        <p className="flex items-center gap-2 text-[13px] font-bold"><Package size={15} className="text-primary" /> {itemName}</p>
        <span className="text-[11px] font-bold uppercase tracking-wide text-ink-faint">{d.kind === "AUTO" ? t("deliveryInstant") : t("deliveryManual")}</span>
      </div>
      <div className="space-y-2.5 p-4">
        {d.contentText ? <p className="whitespace-pre-wrap text-[13px] leading-6 text-ink-soft">{d.contentText}</p> : null}
        {d.secret ? (
          <div className="rounded-xl border border-primary/15 bg-primary-soft p-3">
            <div className="flex items-center justify-between">
              <span className="text-[10px] font-black uppercase tracking-widest text-primary">{t("key")}</span>
              <div className="flex gap-1.5">
                <button onClick={() => setRevealed(v => !v)} className="rounded-lg p-1.5 text-primary hover:bg-primary-light" aria-label={revealed ? t("hideSecret") : t("revealSecret")}>
                  {revealed ? <EyeOff size={15} /> : <Eye size={15} />}
                </button>
                <button onClick={copySecret} className="rounded-lg p-1.5 text-primary hover:bg-primary-light" aria-label={t("copy")}>
                  {copied ? <CheckCircle2 size={15} className="text-success" /> : <Copy size={15} />}
                </button>
              </div>
            </div>
            <p className={cx("mt-1 break-all font-mono text-[13px] font-bold text-ink transition-all", !revealed && "select-none blur-[6px]")}>
              {d.secret}
            </p>
          </div>
        ) : null}
        {d.hasFile && d.downloadUrl ? (
          <a href={d.downloadUrl} className="flex items-center gap-2 rounded-pill bg-ink px-4 py-2.5 text-sm font-bold text-white shadow-card transition hover:opacity-90" download>
            <Download size={16} /> {d.fileName || t("download")}
          </a>
        ) : null}
        {d.kind === "MANUAL" && d.deliveredBy ? (
          <p className="text-[11px] text-ink-faint">{lang === "km" ? "បញ្ជូនដោយបុគ្គលិក" : "Delivered by staff"} · {d.attemptedAt ? new Date(d.attemptedAt).toLocaleString() : ""}</p>
        ) : null}
      </div>
    </Card>
  );
}

function heroFor(status: string) {
  switch (status) {
    case "PENDING_PAYMENT": return { icon: Hourglass, title: "Awaiting payment", tint: "bg-gradient-to-br from-[#C77800] to-[#E5A53B]", spin: false };
    case "PAID": return { icon: Loader2, title: "Processing", tint: "bg-gradient-to-br from-primary to-[#2BB3D9]", spin: true };
    case "PROCESSING": return { icon: Loader2, title: "Preparing delivery", tint: "bg-gradient-to-br from-primary to-[#2BB3D9]", spin: true };
    case "COMPLETED": return { icon: CheckCircle2, title: "Completed", tint: "bg-gradient-to-br from-[#0F9D58] to-[#34C77B]", spin: false };
    case "FAILED": return { icon: AlertTriangle, title: "Failed", tint: "bg-gradient-to-br from-[#D64545] to-[#E8706F]", spin: false };
    case "CANCELLED": return { icon: XCircle, title: "Cancelled", tint: "bg-gradient-to-br from-slate-500 to-slate-400", spin: false };
    case "REFUNDED": return { icon: ShieldQuestion, title: "Refunded", tint: "bg-gradient-to-br from-violet-600 to-violet-400", spin: false };
    default: return { icon: Package, title: status, tint: "bg-gradient-to-br from-primary to-[#2BB3D9]", spin: false };
  }
}

function Empty({ label }: { label: string }) {
  return <div className="py-16 text-center text-sm text-ink-faint">{label}</div>;
}
