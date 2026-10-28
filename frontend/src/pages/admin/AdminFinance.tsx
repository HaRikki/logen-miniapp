import React, { useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { BadgePercent, Check, Clock3, CreditCard, Image, Plus, QrCode, Wallet, X } from "lucide-react";
import { api } from "../../lib/api";
import { useStore } from "../../state/store";
import { Button, Card, Field, Input, Modal, Select, StatusChip, TextArea, Toggle, cx } from "../../components/ui";
import { AmountInput, Loading, Pager, SearchBox, Table, Td, majorToMinor, minorToMajor, useLoad } from "../../components/adminKit";
import { ImagePicker } from "../../components/ImagePicker";

type Tab = "deposits" | "methods" | "promotions";

export default function AdminFinance() {
  const { lang } = useStore();
  const { tab } = useParams();
  const nav = useNavigate();
  const active: Tab = (["deposits", "methods", "promotions"].includes(String(tab)) ? tab : "deposits") as Tab;

  return (
    <div className="space-y-5">
      <h1 className="font-display text-2xl font-bold text-ink">{lang === "km" ? "ការបង់ប្រាក់ & ប្រូម៉ូសិន" : "Payments & Promotions"}</h1>
      <div className="flex rounded-pill bg-primary-light p-1">
        {([["deposits", "Deposit requests", Wallet], ["methods", "Payment methods", CreditCard], ["promotions", "Discount codes", BadgePercent]] as Array<[Tab, string, any]>).map(([id, label, Icon]) => (
          <button key={id} onClick={() => nav(`/admin/finance/${id}`)} className={cx("flex flex-1 items-center justify-center gap-1.5 rounded-pill px-3 py-2 text-xs font-bold transition", active === id ? "bg-white text-primary-dark shadow-card" : "text-ink-soft")}>
            <Icon size={14} /> {label}
          </button>
        ))}
      </div>
      {active === "deposits" && <DepositsTab />}
      {active === "methods" && <MethodsTab />}
      {active === "promotions" && <PromotionsTab />}
    </div>
  );
}

// -------------------------------- deposits --------------------------------
function DepositsTab() {
  const { money, toast, confirm } = useStore();
  const [status, setStatus] = useState("PENDING");
  const [q, setQ] = useState("");
  const [page, setPage] = useState(1);
  const [tick, setTick] = useState(0);
  const [proof, setProof] = useState<number | null>(null);
  const sp = new URLSearchParams({ status, page: String(page), limit: "15" });
  if (q) sp.set("q", q);
  const { data, loading, reload } = useLoad<{ total: number; items: any[] }>(`/api/admin/deposits?${sp.toString()}`, [tick, status]);
  const pages = Math.max(1, Math.ceil((data?.total || 0) / 15));

  async function approve(id: number) {
    const ok = await confirm("Approve deposit?", "This credits the user's wallet exactly once.", false);
    if (!ok) return;
    try { const r = await api.post<{ skipped: boolean }>(`/api/admin/deposits/${id}/approve`, {}); toast(r.skipped ? "info" : "success", r.skipped ? "Already reviewed — nothing credited" : "Approved & wallet credited"); setTick(t => t + 1); }
    catch (e: any) { toast("error", e?.message); }
  }
  async function reject(id: number) {
    const reason = window.prompt("Rejection reason (user sees this)?") || "Payment could not be verified";
    try { await api.post(`/api/admin/deposits/${id}/reject`, { reason }); toast("info", "Rejected"); setTick(t => t + 1); }
    catch (e: any) { toast("error", e?.message); }
  }

  return (
    <>
      <div className="flex flex-wrap gap-2">
        <Select value={status} onChange={e => { setStatus(e.target.value); setPage(1); }} className="py-2.5 text-sm">
          {["PENDING", "APPROVED", "REJECTED", "EXPIRED", ""].map(s => <option key={s} value={s}>{s ? s : "All"}</option>)}
        </Select>
        <SearchBox value={q} onChange={setQ} placeholder="DEP code / txn ref…" />
      </div>
      {loading && !data ? <Loading /> : (
        <Table head={["Deposit", "User", "Amount", "Txn reference", "Status", "Actions"]}>
          {data?.items.map((d: any) => (
            <tr key={d.id} className="transition hover:bg-canvas/60">
              <Td><span className="font-mono text-xs font-bold">{d.code}</span><p className="text-[10px] text-ink-faint">{d.providerCode} · {new Date(String(d.createdAt).replace(" ", "T") + "Z").toLocaleDateString()}</p></Td>
              <Td><p className="text-xs font-bold">{d.userName}</p><p className="font-mono text-[10px] text-ink-faint">{d.telegramId}</p></Td>
              <Td><span className="text-sm font-bold text-primary-dark">{money(Number(d.amountMinor), d.currency)}</span></Td>
              <Td>
                <span className="font-mono text-[11px]">{d.txnRef}</span>
                <button onClick={() => setProof(Number(d.id))} className="ml-2 text-[10px] font-bold text-primary">proof?</button>
              </Td>
              <Td><StatusChip status={d.status} /></Td>
              <Td>
                {d.status === "PENDING" ? (
                  <div className="flex justify-end gap-1.5">
                    <Button size="sm" icon={Check} onClick={() => approve(Number(d.id))}>Approve</Button>
                    <Button size="sm" variant="outline" icon={X} onClick={() => reject(Number(d.id))}>Reject</Button>
                  </div>
                ) : <p className="text-right text-[10px] text-ink-faint">{d.reviewedAt ? "reviewed" : ""} {d.adminNote ? `· ${d.adminNote}` : ""}</p>}
              </Td>
            </tr>
          ))}
          {(data?.items || []).length === 0 && <tr><td colSpan={6} className="p-8 text-center text-xs text-ink-faint">No deposits in this state.</td></tr>}
        </Table>
      )}
      <Pager page={page} pages={pages} onPage={setPage} />
      {proof ? <ProofModal id={proof} onClose={() => setProof(null)} /> : null}
    </>
  );
}

function ProofModal({ id, onClose }: { id: number; onClose: () => void }) {
  const [failed, setFailed] = useState(false);
  return (
    <Modal open onClose={onClose} title={`Deposit #${id} — payment proof`}>
      <div className="space-y-3">
        {failed ? (
          <div className="min-h-[220px] rounded-2xl border border-ink/10 bg-canvas p-6 text-center">
            <Image size={30} className="mx-auto mt-6 text-ink-faint" />
            <p className="mt-3 text-xs font-bold text-ink-soft">User did not attach a proof screenshot — verify via the transaction reference against your bank/PSP statement.</p>
          </div>
        ) : (
          <img src={`/api/admin/deposit-proof/${id}`} alt="payment proof" onError={() => setFailed(true)} className="max-h-[60vh] w-full rounded-2xl border border-ink/10 bg-canvas object-contain" />
        )}
        <Button className="w-full" variant="outline" onClick={onClose}>Close</Button>
      </div>
    </Modal>
  );
}

// -------------------------------- methods --------------------------------
function MethodsTab() {
  const { money, toast, confirm } = useStore();
  const { data, loading, reload } = useLoad<{ items: any[] }>("/api/admin/payment-methods");
  const [edit, setEdit] = useState<any | null>(null);

  async function toggle(pm: any) {
    try { await api.put(`/api/admin/payment-methods/${pm.id}`, { isActive: !pm.isActive }); reload(); } catch (e: any) { toast("error", e?.message); }
  }

  return (
    <>
      <div className="flex items-center justify-between">
        <p className="text-xs text-ink-faint">Mode MANUAL = admin verifies receipts & approves deposits. Gateway providers can be added later; QR images here are display-only.</p>
        <Button icon={Plus} onClick={() => setEdit({ code: "", name: "", mode: "MANUAL", accountName: "", accountNumber: "", qrUrl: "", instructions: "", minMajor: "1", maxMajor: "0", currency: "USD", sort: 0, isActive: true })}>Add method</Button>
      </div>
      {loading || !data ? <Loading /> : (
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {data.items.map((pm: any) => (
            <Card key={pm.id} className="p-4">
              <div className="mb-2 flex items-center gap-2">
                <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-primary-light text-primary"><QrCode size={17} /></div>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-bold">{pm.name}</p>
                  <p className="font-mono text-[10px] text-ink-faint">{pm.code} · min {money(pm.minMinor, pm.currency)}</p>
                </div>
                <StatusChip status={pm.isActive ? "COMPLETED" : "CANCELLED"} label={pm.isActive ? "active" : "off"} />
              </div>
              {pm.qrUrl ? <img src={pm.qrUrl} alt="" className="mb-2 h-20 rounded-xl object-contain bg-canvas p-1" /> : null}
              <div className="flex items-center gap-2">
                <Button size="sm" variant="outline" onClick={() => setEdit({ ...pm, minMajor: String(minorToMajor(pm.minMinor)), maxMajor: String(minorToMajor(pm.maxMinor)), accountName: pm.accountName || "", accountNumber: pm.accountNumber || "", sort: pm.sortOrder, isActive: Boolean(pm.isActive) })}>Edit</Button>
                <Button size="sm" variant="ghost" onClick={() => toggle(pm)}>{pm.isActive ? "Disable" : "Enable"}</Button>
              </div>
            </Card>
          ))}
        </div>
      )}
      {edit ? <MethodEditor pm={edit} onClose={() => setEdit(null)} onSaved={reload} confirm={confirm} /> : null}
    </>
  );
}

function MethodEditor({ pm, onClose, onSaved }: { pm: any; onClose: () => void; onSaved: () => void; confirm: any }) {
  const { toast } = useStore();
  const [f, setF] = useState({ ...pm });
  const [busy, setBusy] = useState(false);
  const isNew = !pm.id;

  async function save() {
    const payload = {
      ...f,
      minMinor: majorToMinor(f.minMajor || "1"),
      maxMinor: majorToMinor(f.maxMajor || "0"),
      sortOrder: Number(f.sort) || 0
    };
    setBusy(true);
    try {
      if (isNew) await api.post("/api/admin/payment-methods", payload);
      else await api.put(`/api/admin/payment-methods/${f.id}`, payload);
      toast("success", "Saved"); onSaved(); onClose();
    } catch (e: any) { toast("error", e?.message || "failed"); } finally { setBusy(false); }
  }

  return (
    <Modal open onClose={onClose} title={isNew ? "Add payment method" : `Edit ${f.code}`} wide>
      <div className="grid gap-3.5 md:grid-cols-2">
        <Field label="Code (A-Z, 0-9)"><Input value={f.code || ""} disabled={!isNew} onChange={e => setF({ ...f, code: e.target.value.toUpperCase() })} /></Field>
        <Field label="Display name"><Input value={f.name || ""} onChange={e => setF({ ...f, name: e.target.value })} /></Field>
        <Field label="Mode">
          <Select className="w-full" value={f.mode} onChange={e => setF({ ...f, mode: e.target.value })}>
            <option value="MANUAL">MANUAL — admin approval</option>
            <option value="GATEWAY">GATEWAY — via verified webhook</option>
          </Select>
        </Field>
        <div className="grid grid-cols-2 gap-2">
          <Field label="Min (USD)"><AmountInput value={f.minMajor} onChange={v => setF({ ...f, minMajor: v })} /></Field>
          <Field label="Max (0 = no cap)"><AmountInput value={f.maxMajor} onChange={v => setF({ ...f, maxMajor: v })} /></Field>
        </div>
        <Field label="Account name"><Input value={f.accountName || ""} onChange={e => setF({ ...f, accountName: e.target.value })} /></Field>
        <Field label="Account number"><Input value={f.accountNumber || ""} onChange={e => setF({ ...f, accountNumber: e.target.value })} /></Field>
        <div className="md:col-span-2"><Field label="QR image (display only — NOT proof of payment)"><ImagePicker value={f.qrUrl || ""} onChange={u => setF({ ...f, qrUrl: u || "" })} /></Field></div>
        <div className="md:col-span-2"><Field label="Instructions for user"><TextArea rows={3} value={f.instructions || ""} onChange={e => setF({ ...f, instructions: e.target.value })} /></Field></div>
        <label className="flex items-center gap-2 text-sm font-semibold"><Toggle checked={Boolean(f.isActive)} onChange={v => setF({ ...f, isActive: v })} /> Active</label>
      </div>
      <div className="mt-5 flex justify-end gap-2">
        <Button variant="outline" onClick={onClose}>Cancel</Button>
        <Button loading={busy} onClick={save}>Save</Button>
      </div>
    </Modal>
  );
}

// -------------------------------- promotions --------------------------------
function PromotionsTab() {
  const { money, toast, lang } = useStore();
  const { data, loading, reload } = useLoad<{ items: any[] }>("/api/admin/promotions");
  const [edit, setEdit] = useState<any | null>(null);

  return (
    <>
      <div className="flex justify-end"><Button icon={Plus} onClick={() => setEdit({ code: "", name: "", kind: "PERCENT", percentValue: "10", maxDiscountMajor: "0", minOrderMajor: "0", usageLimit: 0, perUserLimit: 1, isActive: true })}>New code</Button></div>
      {loading || !data ? <Loading /> : (
        <Table head={["Code", "Discount", "Limits", "Window", "Used", "Status", ""]}>
          {data.items.map((p: any) => (
            <tr key={p.id} className="transition hover:bg-canvas/60">
              <Td><span className="font-mono text-sm font-black text-primary">{p.code}</span><p className="text-[10px] text-ink-faint">{p.name}</p></Td>
              <Td>{p.kind === "PERCENT" ? `${minorToMajor(p.valueMinor)}%` : money(p.valueMinor)}{Number(p.maxDiscountMinor) ? ` (max ${money(p.maxDiscountMinor)})` : ""}</Td>
              <Td className="text-xs">min {money(p.minOrderMinor)} · limit {p.usageLimit || "∞"}<br />per user {p.perUserLimit}</Td>
              <Td className="text-[11px]">{fmtD(p.startsAt)} → {fmtD(p.endsAt)}</Td>
              <Td className="text-xs">{p.usedCount}</Td>
              <Td><StatusChip status={p.isActive ? "COMPLETED" : "CANCELLED"} label={p.isActive ? "on" : "off"} /></Td>
              <Td className="text-right"><Button size="sm" variant="outline" onClick={() => setEdit({ ...p, percentValue: String(minorToMajor(p.valueMinor)), maxDiscountMajor: String(minorToMajor(p.maxDiscountMinor)), minOrderMajor: String(minorToMajor(p.minOrderMinor)) })}>Edit</Button></Td>
            </tr>
          ))}
          {data.items.length === 0 && <tr><td colSpan={7} className="p-8 text-center text-xs text-ink-faint">No promotion codes</td></tr>}
        </Table>
      )}
      {edit ? <PromoEditor promo={edit} onClose={() => setEdit(null)} onSaved={reload} /> : null}
    </>
  );
}
const fmtD = (v: any) => (v ? new Date(String(v).replace(" ", "T") + "Z").toLocaleDateString() : "—");

function PromoEditor({ promo, onClose, onSaved }: { promo: any; onClose: () => void; onSaved: () => void }) {
  const { toast } = useStore();
  const [f, setF] = useState({ ...promo });
  const [busy, setBusy] = useState(false);
  const isNew = !promo.id;
  return (
    <Modal open onClose={onClose} title={isNew ? "New discount code" : `Edit ${promo.code}`}>
      <div className="space-y-3.5">
        <div className="grid grid-cols-2 gap-3">
          <Field label="Code"><Input value={f.code || ""} disabled={!isNew} onChange={e => setF({ ...f, code: e.target.value.toUpperCase() })} className="font-mono" /></Field>
          <Field label="Name"><Input value={f.name || ""} onChange={e => setF({ ...f, name: e.target.value })} /></Field>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Kind">
            <Select className="w-full" value={f.kind} onChange={e => setF({ ...f, kind: e.target.value })}><option value="PERCENT">Percent</option><option value="FIXED">Fixed amount</option></Select>
          </Field>
          {f.kind === "PERCENT" ? (
            <Field label="Percent %"><AmountInput value={f.percentValue || "0"} onChange={v => setF({ ...f, percentValue: v })} /></Field>
          ) : (
            <Field label="Amount off (USD)"><AmountInput value={String(minorToMajor(f.valueMinor))} onChange={v => setF({ ...f, valueMinor: majorToMinor(v) })} /></Field>
          )}
        </div>
        <div className="grid grid-cols-2 gap-3">
          <Field label={f.kind === "PERCENT" ? "Max discount (USD, 0 = none)" : "Min order (USD)"}><AmountInput value={f.kind === "PERCENT" ? (f.maxDiscountMajor || "0") : (f.minOrderMajor || "0")} onChange={v => f.kind === "PERCENT" ? setF({ ...f, maxDiscountMajor: v }) : setF({ ...f, minOrderMajor: v })} /></Field>
          <Field label="Usage limit (total, 0 = ∞)"><Input type="number" value={f.usageLimit ?? 0} onChange={e => setF({ ...f, usageLimit: Number(e.target.value) })} /></Field>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Per-user limit"><Input type="number" value={f.perUserLimit ?? 1} onChange={e => setF({ ...f, perUserLimit: Number(e.target.value) })} /></Field>
          <Field label="Starts"><Input type="datetime-local" value={isoLocal(f.startsAt)} onChange={e => setF({ ...f, startsAt: e.target.value })} /></Field>
        </div>
        <Field label="Ends"><Input type="datetime-local" value={isoLocal(f.endsAt)} onChange={e => setF({ ...f, endsAt: e.target.value })} /></Field>
        <label className="flex items-center gap-2 text-sm font-semibold"><Toggle checked={Boolean(f.isActive)} onChange={v => setF({ ...f, isActive: v })} /> Active</label>
      </div>
      <div className="mt-5 flex justify-end gap-2">
        <Button variant="outline" onClick={onClose}>Cancel</Button>
        <Button loading={busy} onClick={async () => {
          setBusy(true);
          try {
            if (isNew) {
              await api.post("/api/admin/promotions", {
                code: f.code, name: f.name, kind: f.kind,
                percentValue: f.kind === "PERCENT" ? Number(f.percentValue) : undefined,
                valueMinor: f.kind === "FIXED" ? majorToMinor(f.valueMinor || 0) : undefined,
                maxDiscountMinor: majorToMinor(f.maxDiscountMajor || 0),
                minOrderMinor: majorToMinor(f.minOrderMajor || 0),
                usageLimit: Number(f.usageLimit) || 0, perUserLimit: Number(f.perUserLimit) || 1,
                startsAt: f.startsAt ? new Date(f.startsAt).toISOString() : undefined,
                endsAt: f.endsAt ? new Date(f.endsAt).toISOString() : undefined,
                isActive: f.isActive !== false
              });
            } else {
              await api.put(`/api/admin/promotions/${f.id}`, {
                name: f.name,
                valueMinor: f.kind === "PERCENT" ? Math.round(Number(f.percentValue || 0) * 100) : majorToMinor(f.valueMinor || 0),
                maxDiscountMinor: majorToMinor(f.maxDiscountMajor || 0),
                minOrderMinor: majorToMinor(f.minOrderMajor || 0),
                usageLimit: Number(f.usageLimit) || 0, perUserLimit: Number(f.perUserLimit) || 1,
                startsAt: f.startsAt ? new Date(f.startsAt).toISOString() : undefined,
                endsAt: f.endsAt ? new Date(f.endsAt).toISOString() : undefined,
                isActive: f.isActive !== false
              });
            }
            toast("success", "Saved"); onSaved(); onClose();
          } catch (e: any) { toast("error", e?.message || "failed"); } finally { setBusy(false); }
        }}>Save</Button>
      </div>
    </Modal>
  );
}
function isoLocal(v: any): string {
  if (!v) return "";
  const d = new Date(String(v).replace(" ", "T") + "Z");
  if (Number.isNaN(d.getTime())) return "";
  return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
}

void Clock3;
