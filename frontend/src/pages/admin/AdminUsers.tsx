import React, { useState } from "react";
import { Ban, CheckCircle2, Coins, Eye, Minus, Plus, ShieldCheck, Users as UsersIcon } from "lucide-react";
import { api } from "../../lib/api";
import { useStore } from "../../state/store";
import { Button, Card, Field, Input, Modal, Select, StatusChip, TextArea, cx } from "../../components/ui";
import { AmountInput, Loading, Pager, SearchBox, Table, Td, majorToMinor, useLoad } from "../../components/adminKit";

interface U {
  id: number; telegramId: number; username: string | null; displayName: string; photoUrl: string | null;
  isActive: number | boolean; isAdmin: number | boolean; balanceMinor: number | null; currency: string | null; ordersCount: number | null; createdAt?: string;
}

export default function AdminUsers() {
  const { money, lang } = useStore();
  const [q, setQ] = useState("");
  const [page, setPage] = useState(1);
  const [tick, setTick] = useState(0);
  const [balanceFor, setBalanceFor] = useState<U | null>(null);
  const [detail, setDetail] = useState<U | null>(null);
  const { data, loading } = useLoad<{ total: number; items: U[] }>(`/api/admin/users?limit=15&page=${page}${q ? `&q=${encodeURIComponent(q)}` : ""}`, [tick]);
  const pages = Math.max(1, Math.ceil((data?.total || 0) / 15));

  async function toggleActive(u: U) {
    try {
      await api.post(`/api/admin/users/${u.id}/status`, { isActive: !u.isActive });
      setTick(t => t + 1);
    } catch { /* toast inside api? best-effort reload */ }
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="font-display text-2xl font-bold text-ink">{lang === "km" ? "អ្នកប្រើប្រាស់" : "Users"}</h1>
        <SearchBox value={q} onChange={v => { setQ(v); setPage(1); }} placeholder="Telegram ID or username…" />
      </div>

      {loading && !data ? <Loading /> : (
        <Table head={["User", "Telegram", "Wallet", "Orders", "Role", "Actions"]}>
          {data?.items.map(u => (
            <tr key={u.id} className="transition hover:bg-canvas/60">
              <Td>
                <div className="flex items-center gap-2.5">
                  <div className="flex h-8 w-8 shrink-0 items-center justify-center overflow-hidden rounded-xl bg-primary-light text-xs font-black text-primary">
                    {u.photoUrl ? <img src={String(u.photoUrl)} alt="" className="h-full w-full object-cover" /> : String(u.displayName || "?").charAt(0)}
                  </div>
                  <div className="min-w-0">
                    <p className="max-w-[180px] truncate text-xs font-bold">{u.displayName}</p>
                    {u.username ? <p className="text-[10px] text-ink-faint">@{u.username}</p> : null}
                  </div>
                </div>
              </Td>
              <Td><span className="font-mono text-xs">{String(u.telegramId)}</span></Td>
              <Td>
                <p className="text-xs font-bold text-primary-dark">{money(Number(u.balanceMinor || 0))}</p>
              </Td>
              <Td><span className="text-xs">{u.ordersCount ?? 0}</span></Td>
              <Td>
                <div className="flex items-center gap-1">
                  {Number(u.isAdmin) ? <span className="flex items-center gap-1 rounded-pill bg-amber-50 px-2 py-0.5 text-[10px] font-black text-warning"><ShieldCheck size={10} />Admin</span> : null}
                  {!u.isActive ? <span className="flex items-center gap-1 rounded-pill bg-red-50 px-2 py-0.5 text-[10px] font-black text-danger"><Ban size={10} />Blocked</span> : null}
                  {!u.isAdmin && u.isActive ? <span className="text-[10px] font-bold uppercase text-ink-faint">customer</span> : null}
                </div>
              </Td>
              <Td>
                <div className="flex justify-end gap-1.5">
                  <button onClick={() => setBalanceFor(u)} title="Adjust balance" className="rounded-lg border border-ink/10 bg-white p-2 text-primary shadow-card hover:bg-primary-light"><Coins size={14} /></button>
                  <button onClick={() => setDetail(u)} title="Details" className="rounded-lg border border-ink/10 bg-white p-2 text-ink-soft shadow-card hover:bg-primary-light"><Eye size={14} /></button>
                  <button onClick={() => toggleActive(u)} title={u.isActive ? "Block account" : "Unblock account"} className={cx("rounded-lg border border-ink/10 bg-white p-2 shadow-card", u.isActive ? "text-danger hover:bg-red-50" : "text-success hover:bg-emerald-50")}>
                    {u.isActive ? <Ban size={14} /> : <CheckCircle2 size={14} />}
                  </button>
                </div>
              </Td>
            </tr>
          ))}
        </Table>
      )}
      <Pager page={page} pages={pages} onPage={setPage} />

      {balanceFor ? <BalanceModal user={balanceFor} onClose={() => setBalanceFor(null)} onDone={() => setTick(t => t + 1)} /> : null}
      {detail ? <UserDetail user={detail} onClose={() => setDetail(null)} /> : null}
      <p className="text-[11px] text-ink-faint"><UsersIcon size={11} className="mb-0.5 mr-1 inline" />Admin roles are managed in Settings → Admins. Balance changes always require a reason and are audit-logged.</p>
    </div>
  );
}

function BalanceModal({ user, onClose, onDone }: { user: U; onClose: () => void; onDone: () => void }) {
  const { money, toast } = useStore();
  const [kind, setKind] = useState<"CREDIT" | "DEBIT">("CREDIT");
  const [amount, setAmount] = useState("");
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);

  async function go() {
    const minor = majorToMinor(amount);
    if (!minor || minor <= 0) { toast("error", "Enter an amount"); return; }
    if (reason.trim().length < 3) { toast("error", "Reason is mandatory (min 3 chars)"); return; }
    setBusy(true);
    try {
      const r = await api.post<{ balanceMinor: number }>(`/api/admin/users/${user.id}/balance`, { kind, amountMinor: minor, reason: reason.trim() });
      toast("success", `Balance now ${money(r.balanceMinor)}`);
      onDone(); onClose();
    } catch (e: any) { toast("error", e?.message || "failed"); } finally { setBusy(false); }
  }

  return (
    <Modal open onClose={onClose} title={`Balance — ${user.displayName}`}>
      <div className="space-y-4">
        <div className="rounded-2xl bg-primary-soft p-4">
          <p className="text-[11px] font-bold uppercase text-ink-faint">Current balance</p>
          <p className="font-display text-2xl font-bold text-primary-dark">{money(Number(user.balanceMinor || 0))}</p>
        </div>
        <div className="flex rounded-pill bg-primary-light p-1">
          {(["CREDIT", "DEBIT"] as const).map(k => (
            <button key={k} onClick={() => setKind(k)} className={cx("flex flex-1 items-center justify-center gap-1.5 rounded-pill py-2 text-sm font-bold", kind === k ? (k === "CREDIT" ? "bg-success text-white shadow" : "bg-danger text-white shadow") : "text-ink-soft")}>
              {k === "CREDIT" ? <Plus size={15} /> : <Minus size={15} />}{k === "CREDIT" ? "Add balance" : "Remove balance"}
            </button>
          ))}
        </div>
        <Field label="Amount (USD)"><AmountInput value={amount} onChange={setAmount} /></Field>
        <Field label="Reason (required, saved to audit log)"><TextArea rows={2} value={reason} onChange={e => setReason(e.target.value)} placeholder="Compensation for failed delivery…" /></Field>
        <Button className="w-full" loading={busy} onClick={go} variant={kind === "CREDIT" ? "primary" : "danger"}>
          {kind === "CREDIT" ? "Credit" : "Debit"} {amount ? money(majorToMinor(amount)) : ""}
        </Button>
      </div>
    </Modal>
  );
}

function UserDetail({ user, onClose }: { user: U; onClose: () => void }) {
  const { money, toast } = useStore();
  const { data, loading } = useLoad<{ user: any; wallet: any; orders: any[]; txns: any[] }>(`/api/admin/users/${user.id}`);

  return (
    <Modal open onClose={onClose} title={user.displayName} wide>
      {loading || !data ? <Loading inline /> : (
        <div className="space-y-4 text-sm">
          <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
            <Mini label="Telegram ID" value={String(data.user.telegramId)} mono />
            <Mini label="Username" value={data.user.username ? "@" + data.user.username : "—"} />
            <Mini label="Registered" value={data.user.createdAt ? new Date(String(data.user.createdAt)).toLocaleDateString() : "—"} />
            <Mini label="Balance" value={money(Number(data.wallet?.balanceMinor || 0))} />
          </div>
          <div>
            <p className="mb-1.5 text-[11px] font-black uppercase tracking-wide text-ink-faint">Recent orders</p>
            <div className="max-h-44 overflow-y-auto rounded-xl border border-ink/5">
              {data.orders.length === 0 ? <Empty text="No orders" /> : data.orders.map((o: any) => (
                <div key={o.id} className="flex items-center gap-3 border-b border-ink/5 px-3.5 py-2.5 text-xs last:border-0">
                  <span className="font-mono font-bold">{o.code}</span>
                  <StatusChip status={o.status} />
                  <span className="ml-auto font-bold">{money(Number(o.totalMinor))}</span>
                </div>
              ))}
            </div>
          </div>
          <div>
            <p className="mb-1.5 text-[11px] font-black uppercase tracking-wide text-ink-faint">Wallet transactions</p>
            <div className="max-h-44 overflow-y-auto rounded-xl border border-ink/5">
              {data.txns.length === 0 ? <Empty text="No transactions" /> : data.txns.map((x: any) => (
                <div key={x.id} className="flex items-center gap-3 border-b border-ink/5 px-3.5 py-2.5 text-xs last:border-0">
                  <span className="w-24 font-bold uppercase text-ink-soft">{String(x.type).toLowerCase()}</span>
                  <span className={cx("font-bold", Number(x.amountMinor) > 0 ? "text-success" : "text-ink")}>{Number(x.amountMinor) > 0 ? "+" : "−"}{money(Math.abs(Number(x.amountMinor)))}</span>
                  <span className="ml-auto text-ink-faint">{x.reason || ""}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </Modal>
  );
}

function Mini({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="rounded-xl bg-canvas p-3">
      <p className="text-[10px] font-black uppercase tracking-wide text-ink-faint">{label}</p>
      <p className={cx("mt-0.5 truncate text-sm font-bold", mono && "font-mono")}>{value}</p>
    </div>
  );
}
function Empty({ text }: { text: string }) { return <p className="p-4 text-center text-xs text-ink-faint">{text}</p>; }
