import React, { useCallback, useEffect, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { AlertTriangle, CheckCircle2, CloudUpload, Hand, RotateCcw, Send, ShieldQuestion, ShoppingBag, XCircle } from "lucide-react";
import { api, type OrderView } from "../../lib/api";
import { useStore } from "../../state/store";
import { Button, Card, Field, Input, Modal, Select, StatusChip, TextArea, cx } from "../../components/ui";
import { Loading, Pager, SearchBox, Table, Td, useLoad } from "../../components/adminKit";

const STATUSES = ["PENDING_PAYMENT", "PAID", "PROCESSING", "COMPLETED", "FAILED", "CANCELLED", "REFUNDED"];

interface AdminOrderRow {
  id: number; code: string; status: string; totalMinor: number; createdAt: string;
  userName: string | null; telegramId: number | null;
}

export default function AdminOrders() {
  const { money, lang } = useStore();
  const [tab, setTab] = useState<"orders" | "queue">("orders");
  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="font-display text-2xl font-bold text-ink">{lang === "km" ? "ការបញ្ជាទិញ" : "Orders & Delivery"}</h1>
        <div className="flex rounded-pill bg-primary-light p-1">
          <button onClick={() => setTab("orders")} className={cx("flex items-center gap-1.5 rounded-pill px-4 py-1.5 text-xs font-bold", tab === "orders" ? "bg-white text-primary-dark shadow-card" : "text-ink-soft")}><ShoppingBag size={13} /> Orders</button>
          <button onClick={() => setTab("queue")} className={cx("flex items-center gap-1.5 rounded-pill px-4 py-1.5 text-xs font-bold", tab === "queue" ? "bg-white text-primary-dark shadow-card" : "text-ink-soft")}><Hand size={13} /> Delivery queue</button>
        </div>
      </div>
      {tab === "orders" ? <OrdersTab money={money} /> : <QueueTab money={money} />}
    </div>
  );
}

function OrdersTab({ money }: { money: (n: number, c?: string) => string }) {
  const { toast } = useStore();
  const [params] = useSearchParams();
  const [q, setQ] = useState(params.get("code") || "");
  const [status, setStatus] = useState("");
  const [page, setPage] = useState(1);
  const [tick, setTick] = useState(0);
  const [open, setOpen] = useState<string | null>(params.get("code"));
  const sp = new URLSearchParams({ limit: "15", page: String(page) });
  if (q) sp.set("q", q);
  if (status) sp.set("status", status);
  const { data, loading, reload } = useLoad<{ total: number; items: AdminOrderRow[] }>(`/api/admin/orders?${sp.toString()}`, [tick]);
  const pages = Math.max(1, Math.ceil((data?.total || 0) / 15));

  return (
    <>
      <div className="flex flex-wrap items-center gap-2">
        <SearchBox value={q} onChange={setQ} placeholder="Order code / id…" />
        <Select value={status} onChange={e => { setStatus(e.target.value); setPage(1); }} className="py-2.5 text-sm">
          <option value="">All statuses</option>
          {STATUSES.map(s => <option key={s}>{s.replace(/_/g, " ")}</option>)}
        </Select>
        <button onClick={() => setTick(t => t + 1)} className="rounded-lg border border-ink/10 bg-white px-3 py-2 text-xs font-bold text-ink-soft">↻</button>
      </div>

      {loading && !data ? <Loading /> : (
        <Table head={["Order", "Customer", "Total", "Status", "Date", ""]}>
          {data?.items.map(o => (
            <tr key={o.id} className="cursor-pointer transition hover:bg-canvas/60" onClick={() => setOpen(o.code)}>
              <Td><span className="font-mono text-xs font-bold">{o.code}</span></Td>
              <Td>
                <p className="text-xs font-bold">{o.userName || "—"}</p>
                <p className="text-[10px] text-ink-faint">{o.telegramId != null ? `TG ${o.telegramId}` : ""}</p>
              </Td>
              <Td><span className="font-bold">{money(Number(o.totalMinor))}</span></Td>
              <Td><StatusChip status={o.status} /></Td>
              <Td><span className="text-[11px] text-ink-faint">{new Date(String(o.createdAt).replace(" ", "T") + "Z").toLocaleDateString()}</span></Td>
              <Td className="text-right"><span className="text-xs font-bold text-primary">View →</span></Td>
            </tr>
          ))}
        </Table>
      )}
      <Pager page={page} pages={pages} onPage={setPage} />
      {open ? <OrderAdminModal code={open} onClose={() => setOpen(null)} onChanged={() => setTick(t => t + 1)} money={money} /> : null}
    </>
  );
}

function OrderAdminModal({ code, onClose, onChanged, money }: { code: string; onClose: () => void; onChanged: () => void; money: (n: number) => string }) {
  const { toast, confirm } = useStore();
  const [order, setOrder] = useState<OrderView | null>(null);
  const [busy, setBusy] = useState(false);
  const [selItem, setSelItem] = useState<number | null>(null);
  const [deliver, setDeliver] = useState(false);
  const [text, setText] = useState(""); const [secret, setSecret] = useState("");
  const fileRef = useRef<HTMLInputElement>(null);
  const [pendingFile, setPendingFile] = useState<{ filePath?: string; name: string } | null>(null);
  const [statusTarget, setStatusTarget] = useState("");

  const load = useCallback(() => {
    api.get<{ order: OrderView }>(`/api/admin/orders/${code}`).then(r => setOrder(r.order)).catch(() => toast("error", "order not found"));
  }, [code]);
  useEffect(load, [load]);

  if (!order) return <Modal open onClose={onClose} title={`Order ${code}`}><Loading inline /></Modal>;

  async function transact(to: string, reason?: string) {
    setBusy(true);
    try {
      const r = await api.post<{ order: OrderView }>(`/api/admin/orders/${order.id}/status`, { status: to, reason });
      setOrder(r.order); toast("success", `Order → ${to}`); onChanged();
    } catch (e: any) { toast("error", e?.message || "failed"); }
    finally { setBusy(false); }
  }

  async function doDeliver(itemId: number) {
    setBusy(true);
    try {
      const r = await api.post<{ ok: boolean; order: OrderView }>(`/api/admin/orders/${order.id}/deliver`, { orderItemId: itemId, text, secret, filePath: pendingFile?.filePath || undefined, fileName: pendingFile?.name || undefined });
      setOrder(r.order); toast("success", "Delivered"); onChanged(); setDeliver(false); setText(""); setSecret(""); setPendingFile(null);
    } catch (e: any) { toast("error", e?.message || "failed"); }
    finally { setBusy(false); }
  }

  const undelivered = order.items.filter(i => i.deliveryStatus !== "DELIVERED");
  const canRetry = order.status === "FAILED";

  return (
    <Modal open onClose={onClose} title={`Order ${order.code}`} wide>
      <div className="grid gap-4 lg:grid-cols-[1fr_260px]">
        <div className="min-w-0 space-y-4">
          <Card className="p-4">
            <div className="mb-2 flex flex-wrap items-center gap-2 text-[11px] font-bold text-ink-soft">
              <StatusChip status={order.status} />
              <span>{order.userName || `user #${order.userId}`} {order.userTelegramId ? `· TG ${order.userTelegramId}` : ""}</span>
              <span className="ml-auto font-display text-base font-bold text-primary-dark">{money(order.totalMinor)}</span>
            </div>
            <div className="mt-3 space-y-2">
              {order.items.map(it => (
                <div key={it.id} className="rounded-xl border border-ink/5 bg-canvas/70 p-3">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="min-w-0 flex-1 truncate text-sm font-bold">{it.productName}{it.variantName ? ` (${it.variantName})` : ""} ×{it.quantity}</p>
                    <StatusChip status={it.deliveryStatus} label={`${it.deliveryType} ${it.deliveryStatus}`} />
                  </div>
                  {it.deliveryError ? <p className="mt-1 text-xs text-danger">{it.deliveryError}</p> : null}
                  {it.deliveryStatus !== "DELIVERED" ? (
                    <div className="mt-2 flex flex-wrap gap-1.5">
                      <Button size="sm" variant="soft" icon={Hand} onClick={() => { setSelItem(it.id); setDeliver(true); }}>Manual deliver</Button>
                    </div>
                  ) : null}
                  {selItem === it.id && deliver ? (
                    <div className="mt-3 space-y-2 rounded-xl border border-primary/20 bg-primary-soft p-3">
                      <Field label="Message to buyer"><TextArea rows={2} value={text} onChange={e => setText(e.target.value)} placeholder="Thanks! Your account is ready…" /></Field>
                      <Field label="Secret / credentials (keys, login — shown once-style)"><TextArea rows={2} value={secret} onChange={e => setSecret(e.target.value)} className="font-mono text-xs" /></Field>
                      <div className="flex items-center gap-2">
                        <input ref={fileRef} type="file" className="hidden" accept=".pdf,.zip,.txt,image/*" onChange={e => { const f0 = e.target.files?.[0]; if (f0) e.target.dataset.ok = "1"; }} />
                        <Button size="sm" variant="outline" icon={CloudUpload} disabled={busy} onClick={() => fileRef.current?.click()}>Attach file</Button>
                        {pendingFile ? <span className="truncate text-xs font-bold text-primary-dark">📎 {pendingFile.name}</span> : null}
                        <span className="flex-1" />
                        <Button size="sm" variant="ghost" onClick={() => { setSelItem(null); setPendingFile(null); }}>Cancel</Button>
                        <Button size="sm" loading={busy} onClick={() => selItem && doDeliver(selItem)}>Send delivery</Button>
                      </div>
                    </div>
                  ) : null}
                </div>
              ))}
            </div>
            {order.deliveries.length ? (
              <details className="mt-3 rounded-xl border border-ink/5 p-3 text-xs">
                <summary className="cursor-pointer select-none font-bold text-primary-dark">Delivery records ({order.deliveries.length})</summary>
                <div className="mt-2 space-y-2">
                  {order.deliveries.map(d => (
                    <div key={d.id} className="rounded-lg bg-canvas p-2.5">
                      <p className="font-bold">{d.kind} · {d.status} · {d.attemptCount} attempt(s)</p>
                      {d.contentText ? <p className="mt-0.5 whitespace-pre-wrap text-ink-soft">{d.contentText}</p> : null}
                      {d.secret ? <p className="mt-1 break-all font-mono text-[10px] text-ink">{"•".repeat(6)} (stored)</p> : null}
                      {d.fileName ? <p className="mt-1 text-ink-faint">file: {d.fileName}</p> : null}
                    </div>
                  ))}
                </div>
              </details>
            ) : null}
          </Card>

          <Card className="p-4 text-sm">
            <p className="mb-2 font-display text-sm font-bold">Status history</p>
            <ol className="relative space-y-2 border-l border-primary/20 pl-4 text-xs">
              {order.history.map((h, i) => (
                <li key={i}><b>{h.to}</b> <span className="text-ink-faint">{h.actorRole}{h.changedBy ? ` #${h.changedBy}` : ""} · {h.at ? new Date(h.at).toLocaleString() : ""}</span>{h.reason ? <p className="text-ink-faint">{h.reason}</p> : null}</li>
              ))}
            </ol>
          </Card>
        </div>

        {/* actions rail */}
        <div className="space-y-2">
          <p className="text-[11px] font-black uppercase tracking-widest text-ink-faint">Actions</p>
          {canRetry ? <Button className="w-full" variant="outline" icon={RotateCcw} loading={busy} onClick={() => transact("PROCESSING", "retry requested")}>Retry auto delivery</Button> : null}
          {undelivered.length === 0 && order.status !== "COMPLETED" && order.status !== "FAILED" && order.status !== "REFUNDED" ? (
            <Button className="w-full" icon={CheckCircle2} loading={busy} onClick={() => transact("COMPLETED", "manually completed")}>Mark completed</Button>
          ) : null}
          {["PAID", "PROCESSING", "COMPLETED", "FAILED"].includes(order.status) ? (
            <Button className="w-full" variant="danger" icon={ShieldQuestion} loading={busy} onClick={async () => {
              const reason = window.prompt("Refund reason?") || "Refunded by admin";
              await transact("REFUNDED", reason);
            }}>Refund order</Button>
          ) : null}
          {order.status === "PENDING_PAYMENT" ? (
            <Button className="w-full" variant="outline" icon={XCircle} loading={busy} onClick={() => transact("CANCELLED", "cancelled by store")}>Cancel order</Button>
          ) : null}
          <Card className="space-y-2 p-3 text-xs">
            {order.deliveryAccount ? <p><b>Account:</b> <span className="font-mono">{order.deliveryAccount}</span></p> : null}
            {order.customerNote ? <p><b>Note:</b> {order.customerNote}</p> : null}
            {order.failureReason ? <p className="text-danger"><b>Failure:</b> {order.failureReason}</p> : null}
            <p className="text-ink-faint">Placed {new Date(order.createdAt).toLocaleString()}</p>
            <p className={cx("font-bold", undelivered.length ? "text-warning" : "text-success")}>
              {undelivered.length ? `${undelivered.length} item(s) undelivered — pending manual delivery` : "All delivered"}
            </p>
          </Card>
        </div>
      </div>
    </Modal>
  );
}

function QueueTab({ money }: { money: (n: number) => string }) {
  const { toast } = useStore();
  const [tick, setTick] = useState(0);
  const { data, loading } = useLoad<{ manual: any[]; autoFailed: any[]; recent: any[] }>(`/api/admin/delivery/queue`, [tick]);

  async function retry(orderId: number) {
    try {
      await api.post(`/api/admin/orders/${orderId}/retry`, {});
      toast("success", "Retry ran"); setTick(t => t + 1);
    } catch (e: any) { toast("error", e?.message || "failed"); }
  }

  if (loading && !data) return <Loading />;
  return (
    <div className="grid gap-4 xl:grid-cols-2">
      <Card className="p-4">
        <p className="mb-2 flex items-center gap-2 font-display text-sm font-bold text-ink"><Hand size={15} className="text-primary" /> Manual delivery queue</p>
        {(data?.manual || []).length === 0 ? <EmptyRow text="Queue empty — nothing to deliver" /> : (data!.manual as any[]).map(m => (
          <QueueRow key={m.id}
            code={m.orderCode} name={m.productName} qty={Number(m.quantity)} total={money(Number(m.unitPriceMinor) * Number(m.quantity))}
            extra={<span className="text-[11px] text-warning">{toast0(m.orderStatus)}</span>}
          />
        ))}
        <p className="mt-2 text-[11px] text-ink-faint">Open the order from Orders tab to deliver content.</p>
      </Card>

      <Card className="p-4">
        <p className="mb-2 flex items-center gap-2 font-display text-sm font-bold text-ink"><AlertTriangle size={15} className="text-danger" /> Failed auto deliveries (retryable)</p>
        {(data?.autoFailed || []).length === 0 ? <EmptyRow text="No failures 🎯" /> : (data!.autoFailed as any[]).map(m => (
          <div key={m.id} className="mb-2 flex items-center gap-3 rounded-xl border border-ink/5 bg-canvas/60 p-3">
            <div className="min-w-0 flex-1">
              <p className="truncate text-xs font-bold">{m.orderCode} · {m.productName} ×{Number(m.quantity)}</p>
              <p className="text-[11px] text-danger">{m.deliveryError || "failed"}</p>
            </div>
            {m.orderStatus === "FAILED" ? (
              <Button size="sm" variant="soft" icon={RotateCcw} onClick={() => retry(Number(m.orderId))}>Retry</Button>
            ) : <span className="text-[10px] font-bold text-ink-faint">{m.orderStatus}</span>}
          </div>
        ))}
      </Card>

      <Card className="p-4 xl:col-span-2">
        <p className="mb-2 font-display text-sm font-bold text-ink">Recent deliveries</p>
        <div className="grid gap-2 md:grid-cols-2">
          {(data?.recent || []).slice(0, 20).map((d: any) => (
            <div key={d.id} className="flex items-center gap-3 rounded-xl border border-ink/5 bg-canvas/60 p-2.5 text-xs">
              <span className="font-mono font-bold">{d.orderCode}</span>
              <StatusChip status={d.status} />
              <span className={cx("font-bold", d.kind === "AUTO" ? "text-primary" : "text-violet-700")}>{d.kind}</span>
              <span className="ml-auto text-ink-faint">· {d.userName} · {new Date(String(d.createdAt).replace(" ", "T") + "Z").toLocaleDateString()}</span>
            </div>
          ))}
        </div>
      </Card>
    </div>
  );
}

function toast0(s: any) { return `order ${s}`; }
function QueueRow({ code, name, qty, total, extra }: { code: string; name: string; qty: number; total: string; extra?: React.ReactNode }) {
  return (
    <div className="mb-2 flex items-center gap-3 rounded-xl border border-ink/5 bg-canvas/60 p-3 text-xs">
      <span className="font-mono font-bold">{code}</span>
      <span className="min-w-0 flex-1 truncate">{name} ×{qty}</span>
      <span className="font-bold text-primary-dark">{total}</span>
      {extra}
    </div>
  );
}
function EmptyRow({ text }: { text: string }) { return <p className="rounded-xl bg-canvas p-4 text-center text-xs text-ink-faint">{text}</p>; }

void Send;
