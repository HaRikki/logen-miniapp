import React, { useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import {
  AlertTriangle, BadgePercent, Bolt, CheckCircle2, Clock,
  Hand, Info, Minus, Plus, Share2, ShieldCheck, Store, Tag, Wallet
} from "lucide-react";
import { api, HttpError, type Product } from "../lib/api";
import { useStore } from "../state/store";
import { Shell } from "../components/Layout";
import { Button, Card, EmptyState, Field, Input, Modal, Select, Skeleton, TextArea, StatusChip, cx } from "../components/ui";
import { haptic, shareUrl, webAppButtonLink } from "../lib/telegram";

export default function ProductDetail() {
  const { id } = useParams();
  const { t, user, money, lang, toast, refreshUser } = useStore();
  const nav = useNavigate();
  const [product, setProduct] = useState<Product | null | "loading" | "missing">("loading");
  const [buyOpen, setBuyOpen] = useState(false);

  useEffect(() => {
    setProduct("loading");
    api.get<{ product: Product }>(`/api/products/${id}`).then(r => setProduct(r.product)).catch((e) => {
      if (e instanceof HttpError && e.status === 404) setProduct("missing");
      else setProduct("missing");
    });
  }, [id]);

  useEffect(() => { document.title = product && product !== "loading" && product !== "missing" ? `${product.name} — Digital Store` : "Digital Store"; }, [product]);

  if (product === "loading") {
    return (
      <Shell back title=" ">
        <Skeleton className="aspect-[16/10] w-full rounded-card" />
        <Skeleton className="mt-4 h-6 w-3/4" />
        <Skeleton className="mt-2 h-4 w-1/2" />
        <Skeleton className="mt-6 h-28 w-full rounded-card" />
      </Shell>
    );
  }
  if (product === "missing") {
    return (
      <Shell back title={t("products")}>
        <EmptyState title={t("noResults")} hint={t("tryAnotherQuery")} icon={Store} action={<Button onClick={() => nav("/products")}>{t("home")}</Button>} />
      </Shell>
    );
  }

  const variants = product.variants && product.variants.length ? product.variants : null;
  const minPrice = Math.min(product.priceMinor, ...(variants ? variants.map(v => v.priceMinor) : [Infinity]));

  return (
    <Shell back>
      <div className="pb-28 lg:pb-6">
        <Card className="overflow-hidden">
          <div className="relative">
            {product.coverUrl ? <img src={product.coverUrl} alt={product.name} className="aspect-[16/9] w-full object-cover" /> :
              <div className="flex aspect-[16/9] w-full items-center justify-center bg-primary-light text-primary"><Store size={44} /></div>}
            {product.isOffer ? <span className="absolute left-3 top-3 rounded-pill bg-danger px-2.5 py-1 text-[11px] font-bold text-white shadow-pop"><Tag size={11} className="mr-1 inline -mt-0.5" />{t("specialOffers")}</span> : null}
            {product.isFeatured ? <span className="absolute right-3 top-3 rounded-pill bg-primary px-2.5 py-1 text-[11px] font-bold text-white shadow-pop">PRO</span> : null}
          </div>
          <div className="p-4">
            <div className="flex items-start justify-between gap-3">
              <h1 className="font-display text-lg font-bold leading-snug text-ink">{product.name}</h1>
              <button onClick={() => { shareUrl(product.name); haptic("light"); }} className="rounded-full border border-ink/10 p-2 text-ink-soft hover:bg-primary-light" aria-label={t("share")}><Share2 size={16} /></button>
            </div>
            {product.categoryName ? <p className="mt-0.5 text-xs font-semibold text-primary">{product.categoryName}</p> : null}
            <div className="mt-3 flex flex-wrap items-baseline gap-x-3 gap-y-1">
              <span className="font-display text-[28px] font-bold text-primary-dark">{money(minPrice)}</span>
              {product.variants?.length && product.priceMinor > minPrice ? <span className="text-sm text-ink-faint">· {t("package")} ↓</span> : null}
            </div>
            <div className="mt-2 flex flex-wrap gap-2 text-[12px] font-semibold text-ink-soft">
              <span className="flex items-center gap-1 rounded-pill bg-primary-light px-2.5 py-1 text-primary-dark">
                {product.deliveryType === "AUTO" ? <Bolt size={13} /> : <Hand size={13} />}
                {product.deliveryType === "AUTO" ? t("deliveryInstant") : t("deliveryManual")}
              </span>
              {product.durationLabel ? <span className="flex items-center gap-1 rounded-pill bg-primary-light px-2.5 py-1 text-primary-dark"><Clock size={13} />{product.durationLabel}</span> : null}
              <span className={cx("rounded-pill px-2.5 py-1", stockTone(product.stockAvailable))}>
                {product.stockAvailable > 0 ? (product.stockAvailable >= 9999 ? t("unlimited") : `${product.stockAvailable} ${t("left")}`) : t("outOfStock")}
              </span>
            </div>
          </div>
        </Card>

        {product.description ? (
          <Card className="mt-4 p-4">
            <h2 className="mb-2 font-display text-sm font-bold text-ink">{t("description")}</h2>
            <p className="whitespace-pre-wrap text-sm leading-7 text-ink-soft">{product.description}</p>
          </Card>
        ) : null}

        {variants ? (
          <div className="mt-5">
            <h2 className="mb-2 font-display text-sm font-bold text-ink">{t("package")}</h2>
            <div className="space-y-2.5">
              {variants.map(v => (
                <Card key={v.id} className={cx("flex items-center justify-between gap-3 p-3.5 transition", v.stock <= 0 && "opacity-50")}>
                  <div className="min-w-0">
                    <p className="truncate text-sm font-bold text-ink">{v.name}</p>
                    <p className="mt-0.5 text-xs text-ink-faint">{v.durationLabel ? `${v.durationLabel} · ` : ""}{v.stock > 0 ? (v.stock >= 9999 ? t("unlimited") : `${v.stock} ${t("left")}`) : t("outOfStock")}</p>
                  </div>
                  <div className="text-right">
                    <p className="font-display text-[15px] font-bold text-primary-dark">{money(v.priceMinor)}</p>
                    {v.compareAtMinor > v.priceMinor ? <p className="text-xs text-ink-faint line-through">{money(v.compareAtMinor)}</p> : null}
                    <Button size="sm" className="mt-1.5" disabled={v.stock <= 0} onClick={() => { haptic("medium"); setBuyOpen(true); window.__preselect = { variant: v.id }; }}>{t("buyNow")}</Button>
                  </div>
                </Card>
              ))}
            </div>
          </div>
        ) : null}

        {product.instructions ? (
          <Card className="mt-5 p-4">
            <h2 className="mb-2 flex items-center gap-1.5 font-display text-sm font-bold text-ink"><Info size={15} className="text-primary" />{t("instructions")}</h2>
            <p className="whitespace-pre-wrap text-[13px] leading-7 text-ink-soft">{product.instructions}</p>
          </Card>
        ) : null}

        <div className="mt-5 flex items-center justify-center gap-2 text-xs text-ink-faint">
          <ShieldCheck size={14} className="text-success" /> {lang === "km" ? "ការទូទាត់ត្រូវបានគ្រប់គ្រងដោយសុវត្ថិភាពនៅ Backend" : "Payments are processed securely on the server"}
        </div>
      </div>

      {/* sticky buy bar */}
      <div className="fixed inset-x-0 bottom-[64px] safe-bottom z-30 lg:sticky lg:bottom-auto lg:mt-6 lg:block">
        <div className="mx-auto flex max-w-[560px] items-center gap-3 px-4 lg:mx-0 lg:max-w-none">
          <div className="hidden bg-white lg:block">
            <span className="font-display text-xl font-bold text-primary-dark">{money(minPrice)}</span>
          </div>
          <Button size="lg" className="flex-1" disabled={product.stockAvailable <= 0 || product.status !== "ACTIVE"}
            onClick={() => { haptic("medium"); setBuyOpen(true); window.__preselect = null; }}>
            {product.stockAvailable > 0 ? <><Wallet size={18} /> {t("buyNow")}</> : t("outOfStock")}
          </Button>
        </div>
      </div>

      {user && product && buyOpen ? (
        <BuySheet product={product} onClose={() => setBuyOpen(false)} />
      ) : null}
    </Shell>
  );
}

function stockTone(n: number): string {
  if (n <= 0) return "bg-red-50 text-danger";
  if (n < 6) return "bg-amber-50 text-warning";
  return "bg-emerald-50 text-success";
}

declare global { interface Window { __preselect?: { variant: number } | null } }

function BuySheet({ product, onClose }: { product: Product; onClose: () => void }) {
  const { t, user, money, refreshUser, toast, confirm } = useStore();
  const nav = useNavigate();
  const variants = product.variants && product.variants.length ? product.variants : [{ id: 0, name: product.name, priceMinor: product.priceMinor, costMinor: 0, compareAtMinor: 0, stock: product.stockAvailable, durationLabel: product.durationLabel }];
  const pre = window.__preselect?.variant;
  const [variantId, setVariantId] = useState<number>(pre && variants.some(v => v.id === pre) ? pre : variants[0].id);
  const variant = variants.find(v => v.id === variantId)!;
  const [qty, setQty] = useState(1);
  const [account, setAccount] = useState("");
  const [note, setNote] = useState("");
  const [promo, setPromo] = useState("");
  const [applied, setApplied] = useState<{ code: string; name: string; discountMinor: number } | null>(null);
  const [busy, setBusy] = useState(false);
  const promoBtn = applied ? "ok" : "idle";

  const unit = variant.priceMinor;
  const subtotal = unit * qty;
  const discount = applied ? Math.min(applied.discountMinor, subtotal) : 0;
  const total = Math.max(0, subtotal - discount);
  const insufficient = (user?.balanceMinor ?? 0) < total;

  async function applyPromo() {
    if (!promo.trim() || applied) { if (applied) { setApplied(null); setPromo(""); } return; }
    try {
      const r = await api.post<{ code: string; name: string; discountMinor: number }>("/api/promotions/validate", {
        code: promo.trim(), subtotalMinor: subtotal, productIds: [product.id]
      });
      setApplied(r);
      haptic("light");
    } catch (e: any) { toast("error", e?.message || "invalid code"); }
  }

  async function purchase() {
    if (!user) { nav("/login?next=" + encodeURIComponent(`/product/${product.id}`)); return; }
    if (insufficient) { toast("error", t("insufficientBalance")); return; }
    const ok = await confirm(t("confirmPurchase"), `${product.name}${variant.name && variant.id ? ` — ${variant.name}` : ""} × ${qty} · ${money(total)}`, false);
    if (!ok) return;
    setBusy(true);
    try {
      const r = await api.post<{ order: any }>("/api/orders", {
        items: [{ productId: product.id, variantId: variant.id || undefined, quantity: qty }],
        promoCode: applied?.code, deliveryAccount: account || undefined, customerNote: note || undefined
      });
      const pay = await api.post<{ order: any }>(`/api/orders/${r.order.code}/pay`, {});
      await refreshUser();
      haptic("rigid");
      toast("success", pay.order.status === "COMPLETED" ? t("orderCompleted") : t("paymentSuccess"));
      onClose();
      nav(`/orders/${pay.order.code}`);
    } catch (e: any) {
      haptic("heavy");
      toast("error", e?.message || t("errorTitle"));
      if (e?.code === "INSUFFICIENT_BALANCE") setTimeout(() => { onClose(); nav("/wallet?topup=1"); }, 900);
    } finally { setBusy(false); }
  }

  return (
    <Modal open onClose={onClose} title={t("confirmPurchase")}>
      <div className="space-y-4">
        <Card className="flex items-center gap-3 border-primary/15 bg-primary-soft p-0">
          {product.coverUrl ? <img src={product.coverUrl} alt="" className="h-16 w-24 shrink-0 rounded-l-card object-cover" /> : null}
          <div className="min-w-0 py-2 pr-3">
            <p className="truncate text-sm font-bold">{product.name}</p>
            <p className="mt-0.5 flex items-center gap-1 text-xs text-ink-soft">
              {product.deliveryType === "AUTO" ? <><Bolt size={12} className="text-primary" />{t("deliveryInstant")}</> : <><Hand size={12} />{t("deliveryManual")}</>}
            </p>
          </div>
        </Card>

        {product.variants && product.variants.length ? (
          <Field label={t("package")}>
            <Select value={variantId} onChange={e => { setVariantId(Number(e.target.value)); setApplied(null); }}>
              {variants.map(v => (
                <option key={v.id} value={v.id}>{v.name} — {money(v.priceMinor)}{v.stock <= 0 ? ` (${t("outOfStock")})` : ""}</option>
              ))}
            </Select>
          </Field>
        ) : null}

        <div className="grid grid-cols-2 gap-3">
          <Field label={t("qty")}>
            <div className="flex items-center gap-2">
              <button type="button" onClick={() => setQty(q => Math.max(1, q - 1))} className="rounded-xl border border-ink/10 p-2 text-ink-soft"><Minus size={14} /></button>
              <span className="w-8 text-center font-display text-lg font-bold">{qty}</span>
              <button type="button" onClick={() => setQty(q => Math.min(20, q + 1))} className="rounded-xl border border-ink/10 p-2 text-ink-soft"><Plus size={14} /></button>
            </div>
          </Field>
          <Field label={t("yourBalance")}>
            <div className={cx("flex h-[42px] items-center gap-1.5 rounded-xl px-3 text-sm font-bold", insufficient ? "bg-red-50 text-danger" : "bg-primary-light text-primary-dark")}>
              <Wallet size={15} /> {money(user?.balanceMinor || 0)}
            </div>
          </Field>
        </div>

        <Field label={t("deliveryAccountLabel")}>
          <Input value={account} onChange={e => setAccount(e.target.value)} placeholder={"@username / player id …"} maxLength={200} />
        </Field>
        <Field label={t("customerNote")}>
          <TextArea rows={2} value={note} onChange={e => setNote(e.target.value)} maxLength={500} placeholder="…" />
        </Field>

        <div>
          <p className="mb-1.5 flex items-center gap-1.5 text-[13px] font-semibold text-ink"><BadgePercent size={15} className="text-primary" /> {t("promoCode")}</p>
          {applied ? (
            <div className="flex items-center justify-between rounded-xl bg-emerald-50 px-3 py-2.5 text-sm font-semibold text-success">
              <span><CheckCircle2 size={14} className="mr-1.5 inline" />{applied.name} · −{money(applied.discountMinor)}</span>
              <button className="text-xs text-ink-faint underline" onClick={() => { setApplied(null); setPromo(""); }}>{t("cancel")}</button>
            </div>
          ) : (
            <div className="flex gap-2">
              <Input value={promo} onChange={e => setPromo(e.target.value.toUpperCase())} placeholder="WELCOME2 / GAME20" maxLength={40} />
              <Button variant="soft" onClick={applyPromo} disabled={!promo.trim()}>{t("applyPromo")}</Button>
            </div>
          )}
        </div>

        <Card className="divide-y divide-ink/5 p-0">
          <Row label={t("subtotal")} value={money(subtotal)} />
          {discount > 0 ? <Row label={t("discount")} value={"−" + money(discount)} tone="text-success" /> : null}
          <Row label={t("total")} value={money(total)} bold />
        </Card>

        {insufficient ? (
          <div className="flex items-start gap-2 rounded-xl bg-red-50 p-3 text-[13px] font-semibold text-danger">
            <AlertTriangle size={16} className="mt-0.5 shrink-0" />
            <span>{t("insufficientBalance")} <Link to="/wallet?topup=1" onClick={onClose} className="underline">{t("topUp")} →</Link></span>
          </div>
        ) : null}

        <Button size="lg" className="w-full" loading={busy} disabled={insufficient || variant.stock <= 0} onClick={purchase}>
          <Wallet size={17} /> {t("buyNow")} · {money(total)}
        </Button>
      </div>
    </Modal>
  );
}

function Row({ label, value, tone, bold }: { label: string; value: string; tone?: string; bold?: boolean }) {
  return (
    <div className="flex items-center justify-between px-4 py-2.5 text-sm">
      <span className={cx(bold ? "font-bold text-ink" : "text-ink-soft")}>{label}</span>
      <span className={cx(bold ? "font-display text-base font-bold text-primary-dark" : "font-semibold", tone)}>{value}</span>
    </div>
  );
}
