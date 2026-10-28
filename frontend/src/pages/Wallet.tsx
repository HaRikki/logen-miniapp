import React, { useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";
import {
  ArrowDownLeft, ArrowUpRight, Banknote, CreditCard, History, Info, Loader2,
  Minus, Plus, QrCode, Receipt, ShieldAlert, Upload, Wallet as WalletIcon, X
} from "lucide-react";
import { api, type Deposit, type PaymentMethod, type WalletTxn } from "../lib/api";
import { useStore } from "../state/store";
import { Shell } from "../components/Layout";
import { Button, Card, EmptyState, Field, Input, Modal, Select, Skeleton, StatusChip, TextArea, cx } from "../components/ui";

const TXN_META: Record<string, { icon: any; tone: string; key: any }> = {
  DEPOSIT: { icon: ArrowDownLeft, tone: "bg-emerald-50 text-success", key: "deposit" },
  PURCHASE: { icon: Receipt, tone: "bg-red-50 text-danger", key: "purchase" },
  REFUND: { icon: Banknote, tone: "bg-violet-50 text-violet-600", key: "refund" },
  ADMIN_CREDIT: { icon: Plus, tone: "bg-emerald-50 text-success", key: "adminCredit" },
  ADMIN_DEBIT: { icon: Minus, tone: "bg-red-50 text-danger", key: "adminDebit" }
};

export default function WalletPage() {
  const { t, money, lang, toast, refreshUser, user } = useStore();
  const [balance, setBalance] = useState<{ balanceMinor: number; lifetimeTopupMinor: number; lifetimeSpendMinor: number } | null>(null);
  const [txns, setTxns] = useState<WalletTxn[] | null>(null);
  const [deposits, setDeposits] = useState<Deposit[] | null>(null);
  const [topupOpen, setTopupOpen] = useState(false);
  const [params, setParams] = useSearchParams();

  useEffect(() => { if (params.get("topup") === "1") { setTopupOpen(true); params.delete("topup"); setParams(params, { replace: true }); } }, [params]);

  const load = () => {
    api.get<any>("/api/wallet").then(r => setBalance(r)).catch(() => setBalance({ balanceMinor: 0, lifetimeTopupMinor: 0, lifetimeSpendMinor: 0 }));
    api.get<{ items: WalletTxn[] }>("/api/wallet/transactions?limit=50").then(r => setTxns(r.items)).catch(() => setTxns([]));
    api.get<{ items: Deposit[] }>("/api/deposits").then(r => setDeposits(r.items)).catch(() => setDeposits([]));
  };
  useEffect(load, []);

  async function onTopupDone() {
    setTopupOpen(false);
    await refreshUser();
    load();
  }

  return (
    <Shell title={t("wallet")}>
      {/* balance hero */}
      <Card className="relative mb-4 overflow-hidden bg-gradient-to-br from-primary via-[#0A8FB8] to-[#2BB3D9] p-0 text-white">
        <div className="absolute -right-8 -top-10 h-40 w-40 rounded-full bg-white/10" />
        <div className="absolute -bottom-14 right-14 h-32 w-32 rounded-full bg-white/5" />
        <div className="relative px-5 py-6">
          <p className="text-xs font-semibold uppercase tracking-wider text-white/70">{t("balance")}</p>
          <p className="mt-1 font-display text-[38px] font-bold leading-none drop-shadow-sm">
            {balance ? money(balance.balanceMinor) : <Loader2 className="h-8 w-8 animate-spin" />}
          </p>
          <div className="mt-5 flex items-center gap-2">
            <Button variant="soft" className="!bg-white !text-primary-dark shadow-pop" icon={Plus} onClick={() => setTopupOpen(true)}>{t("topUp")}</Button>
            <div className="ml-auto flex gap-4 text-right text-[11px] font-semibold">
              <div><p className="text-white/70">{lang === "km" ? "បានបញ្ចូល" : "Top-ups"}</p><p className="font-display text-sm">{balance ? money(balance.lifetimeTopupMinor) : "—"}</p></div>
              <div><p className="text-white/70">{lang === "km" ? "បានចាយ" : "Spent"}</p><p className="font-display text-sm">{balance ? money(balance.lifetimeSpendMinor) : "—"}</p></div>
            </div>
          </div>
        </div>
      </Card>

      <div className="mb-2 flex items-center justify-between">
        <p className="font-display text-sm font-bold">{t("transactionHistory")}</p>
        <button onClick={load} className="text-xs font-bold text-primary">{t("retry")} ↻</button>
      </div>

      {txns === null ? <div className="space-y-2.5">{[...Array(5)].map((_, i) => <Skeleton key={i} className="h-16 rounded-card" />)}</div> :
        txns.length === 0 ? <EmptyState title={t("noTransactions")} icon={History} /> : (
          <div className="space-y-2.5">
            {txns.map(x => {
              const meta = TXN_META[x.type] || TXN_META.PURCHASE;
              const Icon = meta.icon;
              return (
                <Card key={x.id} className="flex items-center gap-3 p-3.5">
                  <div className={cx("flex h-9 w-9 shrink-0 items-center justify-center rounded-xl", meta.tone)}><Icon size={17} /></div>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[13px] font-bold text-ink">{t(meta.key)}<span className="ml-2 font-mono text-[10px] font-medium text-ink-faint">{x.ref}</span></p>
                    <p className="truncate text-[11px] text-ink-faint">{x.createdAt ? new Date(String(x.createdAt).replace(" ", "T") + "Z").toLocaleString(lang === "km" ? "km-KH" : "en-US", { dateStyle: "medium", timeStyle: "short" }) : ""}</p>
                  </div>
                  <div className="text-right">
                    <p className={cx("font-display text-sm font-bold", Number(x.amountMinor) >= 0 ? "text-success" : "text-ink")}>
                      {Number(x.amountMinor) >= 0 ? "+" : "−"}{money(Math.abs(Number(x.amountMinor)))}
                    </p>
                    <p className="text-[11px] text-ink-faint">{money(Number(x.balanceAfterMinor))}</p>
                  </div>
                </Card>
              );
            })}
          </div>
        )}

      <Modal open={topupOpen} onClose={() => setTopupOpen(false)} title={t("topUpWallet")}>
        <TopupForm onClose={() => setTopupOpen(false)} onDone={onTopupDone} />
      </Modal>
    </Shell>
  );
}

function TopupForm({ onClose, onDone }: { onClose: () => void; onDone: () => void }) {
  const { t, money, lang, toast } = useStore();
  const [methods, setMethods] = useState<PaymentMethod[] | null>(null);
  const [autoVerify, setAutoVerify] = useState(false);
  const [method, setMethod] = useState<PaymentMethod | null>(null);
  const [amount, setAmount] = useState("");
  const [ref, setRef] = useState("");
  const [proof, setProof] = useState<{ path: string; name: string; url: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [deposits, setDeposits] = useState<Deposit[] | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    api.get<{ items: PaymentMethod[]; autoVerification: boolean }>("/api/payment-methods").then(r => {
      setMethods(r.items); setAutoVerify(!!r.autoVerification);
      if (r.items.length) setMethod(r.items[0]);
    }).catch(() => setMethods([]));
    api.get<{ items: Deposit[] }>("/api/deposits").then(r => setDeposits(r.items.slice(0, 5))).catch(() => setDeposits([]));
  }, []);

  const quick = method ? [5, 10, 20, 50].map(n => Math.max(n, method.minMinor / 100)).filter((v, i, a) => a.indexOf(v) === i) : [];
  const amountNum = useMemo(() => Number(amount), [amount]);
  const valid = method && amountNum > 0 && (!method.maxMinor || amountNum * 100 <= method.maxMinor) && amountNum * 100 >= method.minMinor;

  async function upload(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    if (!f) return;
    if (f.size > 8 * 1024 * 1024) { toast("error", "Max 8MB"); return; }
    const form = new FormData();
    form.append("file", f);
    try {
      const r = await api.upload<{ path: string; name: string }>("/api/uploads/proof", form);
      setProof({ ...r, url: URL.createObjectURL(f) });
      toast("success", lang === "km" ? "បានបង្ហោះភស្តុតាង" : "Proof attached");
    } catch (err: any) { toast("error", err?.message || "upload failed"); }
  }

  async function submit() {
    if (!valid) { toast("error", `${t("minPrice")}: ${method ? (method.minMinor / 100).toFixed(2) : ""} ${method?.currency}`); return; }
    setBusy(true);
    try {
      const r = await api.post<{ deposit: Deposit }>("/api/deposits", {
        providerCode: method!.code, amountMinor: Math.round(amountNum * 100), txnRef: ref.trim() || undefined, proofPath: proof?.path
      });
      toast("success", t("depositSubmitted"));
      onDone();
    } catch (e: any) {
      toast("error", e?.code === "DUP_TXN_REF" ? (lang === "km" ? "លេខយោងនេះបានប្រើរួច" : "That reference was already used") : e?.message || "failed");
    } finally { setBusy(false); }
  }

  return (
    <div className="max-h-[80dvh] space-y-4 overflow-y-auto pr-1">
      {!autoVerify ? (
        <div className="flex items-start gap-2 rounded-xl bg-amber-50 p-3 text-xs leading-5 text-[#92400E]">
          <Info size={14} className="mt-0.5 shrink-0" />
          {t("autoVerifyNote")}
        </div>
      ) : null}

      <Field label={t("chooseMethod")}>
        {methods === null ? <Skeleton className="h-10" /> : methods.length === 0 ? (
          <p className="rounded-xl bg-primary-light p-3 text-xs text-ink-soft">{lang === "km" ? "មិនទាន់មានវិធីបង់ប្រាក់ — សូមទាក់ទងហាង" : "No payment methods configured yet — contact the store."}</p>
        ) : (
          <div className="grid gap-2 sm:grid-cols-2">
            {methods.map(pm => (
              <button key={pm.id} onClick={() => setMethod(pm)}
                className={cx("flex items-center gap-3 rounded-xl border p-3 text-left transition",
                  method?.id === pm.id ? "border-primary bg-primary-soft shadow-pop" : "border-ink/10 bg-white hover:border-primary/40")}>
                <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-primary-light text-primary"><CreditCard size={17} /></div>
                <div className="min-w-0">
                  <p className="truncate text-[13px] font-bold">{pm.name}</p>
                  <p className="text-[11px] text-ink-faint">min {money(pm.minMinor, pm.currency)}{pm.isActive ? "" : " · off"}</p>
                </div>
                <QrCode size={15} className={cx("ml-auto shrink-0", method?.id === pm.id ? "text-primary" : "text-ink-faint")} />
              </button>
            ))}
          </div>
        )}
      </Field>

      {method?.qrUrl ? (
        <Card className="flex flex-col items-center gap-2 border-primary/15 bg-primary-soft p-4">
          <p className="text-[11px] font-black uppercase tracking-widest text-primary">{t("qrShow")}</p>
          <img src={method.qrUrl} alt="payment QR" className="h-44 w-44 rounded-xl bg-white p-2 shadow-card" />
          {method.accountName ? <p className="text-center text-xs font-bold text-ink">{method.accountName} <span className="ml-1 font-mono text-primary-dark">{method.accountNumber}</span></p> : null}
          {method.instructions ? <p className="whitespace-pre-wrap text-center text-[12px] leading-5 text-ink-soft">{method.instructions}</p> : null}
        </Card>
      ) : null}

      <Field label={t("enterAmount")}>
        <div className="mb-2 flex flex-wrap gap-1.5">
          {quick.map(n => (
            <button key={n} onClick={() => setAmount(String(n))} className={cx("rounded-pill border px-3 py-1 text-xs font-bold", amountNum === n ? "border-primary bg-primary text-white" : "border-ink/10 bg-white text-ink-soft")}>
              {money(Math.round(n * 100))}
            </button>
          ))}
        </div>
        <Input type="number" inputMode="decimal" min="1" step="0.01" value={amount} onChange={e => setAmount(e.target.value)} placeholder="10.00" />
      </Field>

      <Field label={t("txnRef")} hint={t("txnRefHint")}>
        <Input value={ref} onChange={e => setRef(e.target.value)} maxLength={120} placeholder="e.g. 8754f09c12ab…" />
      </Field>

      <Field label={t("uploadProof")}>
        <input ref={fileRef} type="file" accept="image/png,image/jpeg,image/webp" className="hidden" onChange={upload} />
        {proof ? (
          <Card className="flex items-center gap-3 p-3">
            <img src={proof.url} alt="" className="h-12 w-12 rounded-lg object-cover" />
            <span className="min-w-0 flex-1 truncate text-xs font-semibold">{proof.name}</span>
            <button onClick={() => setProof(null)} className="rounded-full p-1.5 hover:bg-primary-light"><X size={15} /></button>
          </Card>
        ) : (
          <button onClick={() => fileRef.current?.click()} className="flex w-full items-center justify-center gap-2 rounded-xl border-2 border-dashed border-primary/30 bg-primary-soft/50 py-4 text-sm font-semibold text-primary hover:bg-primary-light/60">
            <Upload size={16} /> {t("uploadProof")}
          </button>
        )}
      </Field>

      <Button size="lg" className="w-full" icon={ArrowUpRight} disabled={!valid || busy} loading={busy} onClick={submit}>
        {t("submitRequest")}
      </Button>
      <p className="flex items-center justify-center gap-1 text-[11px] text-ink-faint"><ShieldAlert size={12} />{lang === "km" ? "សមតុល្យផ្ទុកនៅពេលអនុម័តប៉ុណ្ណោះ" : "Balance credits only after approval"}</p>

      {deposits && deposits.length ? (
        <div className="mt-2">
          <p className="mb-2 text-[13px] font-bold">{t("myDeposits")}</p>
          <div className="space-y-2">
            {deposits.map(d => (
              <Card key={d.id} className="flex items-center justify-between gap-2 p-3">
                <div className="min-w-0">
                  <p className="truncate font-mono text-[12px] font-bold">{d.code}</p>
                  <p className="text-[11px] text-ink-faint">{new Date(String(d.createdAt).replace(" ", "T") + "Z").toLocaleDateString()} · {d.providerCode.replace(/_/g, " ")}</p>
                </div>
                <div className="text-right">
                  <p className="text-sm font-bold">{money(d.amountMinor, d.currency)}</p>
                  <StatusChip status={d.status} />
                </div>
              </Card>
            ))}
          </div>
        </div>
      ) : null}
    </div>
  );
}
