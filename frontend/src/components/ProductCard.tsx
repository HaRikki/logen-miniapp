import React from "react";
import { Link } from "react-router-dom";
import { Bolt, Clock, Hand, Store } from "lucide-react";
import type { Product } from "../lib/api";
import { Card, cx } from "./ui";
import { useStore } from "../state/store";

export function ProductCard({ p, horizontal }: { p: Product; horizontal?: boolean }) {
  const { money, t } = useStore();
  const first = p.variants?.[0];
  const price = Math.min(p.priceMinor, ...(p.variants?.length ? p.variants.map(v => v.priceMinor) : [Infinity]));
  const compare = p.isOffer && (first?.compareAtMinor || 0) > price ? (first?.compareAtMinor || p.priceMinor * 1.25) : 0;
  const out = p.stockAvailable <= 0;
  return (
    <Link
      to={`/product/${p.id}`}
      className={cx("group block shrink-0", horizontal ? "w-[168px] snap-start" : "w-full")}
    >
      <Card className="overflow-hidden transition-shadow group-hover:shadow-pop">
        <div className="relative aspect-[16/10] w-full overflow-hidden bg-primary-light">
          {p.coverUrl ? (
            <img src={p.coverUrl} alt={p.name} loading="lazy" className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-[1.04]" />
          ) : (
            <div className="flex h-full w-full items-center justify-center text-primary"><Store size={30} /></div>
          )}
          {compare > price ? (
            <span className="absolute left-2 top-2 rounded-pill bg-danger px-2 py-0.5 text-[10px] font-bold text-white">
              -{Math.round((1 - price / compare) * 100)}%
            </span>
          ) : p.isFeatured ? (
            <span className="absolute left-2 top-2 rounded-pill bg-primary px-2 py-0.5 text-[10px] font-bold text-white shadow-pop">PRO</span>
          ) : null}
          {out ? (
            <span className="absolute inset-x-2 bottom-2 rounded-pill bg-ink/85 px-2 py-1 text-center text-[11px] font-bold text-white">{t("outOfStock")}</span>
          ) : null}
        </div>
        <div className="p-3">
          <p className="line-clamp-2 min-h-[36px] text-[13.5px] font-semibold leading-tight text-ink">{p.name}</p>
          <div className="mt-1.5 flex items-center gap-1.5 text-[11px] text-ink-faint">
            {p.deliveryType === "AUTO" ? <><Bolt size={12} className="text-primary" /> <span>{t("deliveryInstant")}</span></>
              : <><Hand size={12} /> <span>{t("deliveryManual")}</span></>}
            {p.durationLabel ? <><Clock size={12} className="ml-auto" /><span>{p.durationLabel}</span></> : null}
          </div>
          <div className="mt-2 flex items-baseline gap-2">
            <span className={cx("font-display text-[16px] font-bold", out ? "text-ink-faint" : "text-primary-dark")}>{money(price)}</span>
            {compare > price ? <span className="text-xs text-ink-faint line-through">{money(Math.round(compare))}</span> : null}
          </div>
        </div>
      </Card>
    </Link>
  );
}

export function ProductCardSkeleton({ horizontal }: { horizontal?: boolean }) {
  return (
    <div className={cx("shrink-0", horizontal ? "w-[168px]" : "w-full")}>
      <div className="skeleton aspect-[16/10] rounded-2xl" />
      <div className="skeleton mt-3 h-3.5 w-4/5 rounded" />
      <div className="skeleton mt-2 h-3.5 w-2/5 rounded" />
      <div className="skeleton mt-2 h-4 w-1/3 rounded" />
    </div>
  );
}
