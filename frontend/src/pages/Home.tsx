import React, { useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import {
  BookOpen, Bolt, ChevronLeft, ChevronRight, Crown, Flame, Gamepad2, Gift,
  Heading1, KeyRound, Plus, Repeat, Search, Sparkles, Tag, UserCircle, Wallet as WalletIcon, LayoutGrid
} from "lucide-react";
import { api, type Category, type Product } from "../lib/api";
import { useStore } from "../state/store";
import { Shell } from "../components/Layout";
import { Card, Skeleton } from "../components/ui";
import { ProductCard, ProductCardSkeleton } from "../components/ProductCard";
import { haptic } from "../lib/telegram";

const ICONS: Record<string, any> = {
  Crown, KeyRound, Repeat, Gamepad2, Gift, FileCode2: Heading1, BookOpen, UserCircle, LayoutGrid
};

interface HomeData {
  featured: Product[]; newest: Product[]; popular: Product[]; offers: Product[];
  categories: Category[]; banners: Array<{ id: number; title: string; subtitle: string | null; imageUrl: string; linkUrl: string | null }>;
  recentlyViewed: Product[];
}

export default function Home() {
  const { user, t, money, lang } = useStore();
  const [data, setData] = useState<HomeData | null>(null);
  const nav = useNavigate();
  const [q, setQ] = useState("");
  const [slide, setSlide] = useState(0);
  const timer = useRef<number | null>(null);

  useEffect(() => {
    api.get<HomeData>("/api/home?locale=" + lang).then(setData).catch(() => setData(null));
  }, [lang]);

  const banners = data?.banners || [];
  useEffect(() => {
    if (timer.current) window.clearInterval(timer.current);
    if (banners.length > 1) {
      timer.current = window.setInterval(() => setSlide(v => (v + 1) % banners.length), 5000);
    }
    return () => { if (timer.current) window.clearInterval(timer.current); };
  }, [banners.length]);

  const rows = useMemo(() => [
    { key: "featured", title: t("featured"), icon: Sparkles, items: data?.featured || [] },
    { key: "offers", title: t("specialOffers"), icon: Tag, items: data?.offers || [] },
    { key: "popular", title: t("bestSelling"), icon: Flame, items: data?.popular || [] },
    { key: "new", title: t("newArrivals"), icon: Bolt, items: data?.newest || [] }
  ].filter(r => r.items.length), [data, t]);

  return (
    <Shell>
      {/* search */}
      <form className="mb-4 flex items-center gap-2" onSubmit={e => { e.preventDefault(); haptic("light"); nav(`/products?q=${encodeURIComponent(q)}`); }}>
        <div className="flex flex-1 items-center gap-2 rounded-pill border border-ink/10 bg-white px-4 py-2.5 shadow-card focus-within:border-primary/40">
          <Search size={17} className="text-ink-faint" />
          <input value={q} onChange={e => setQ(e.target.value)} placeholder={t("search")}
            className="w-full bg-transparent text-sm outline-none placeholder:text-ink-faint" />
        </div>
      </form>

      {/* balance strip */}
      {user ? (
        <Card className="mb-5 flex items-center justify-between gap-3 overflow-hidden bg-gradient-to-br from-primary to-[#2BB3D9] p-0 text-white">
          <div className="flex-1 px-5 py-4">
            <p className="text-[11px] font-semibold uppercase tracking-wider text-white/75">{t("balance")}</p>
            <p className="mt-0.5 font-display text-[26px] font-bold leading-tight">{money(user.balanceMinor)}</p>
          </div>
          <Link to="/wallet" onClick={() => haptic("light")} className="mr-2 flex flex-col items-center gap-0.5 rounded-2xl bg-white/15 px-4 py-3 text-[11px] font-semibold backdrop-blur transition hover:bg-white/25">
            <WalletIcon size={17} /> {t("wallet")}
          </Link>
          <Link to="/wallet?topup=1" onClick={() => haptic("light")}
            className="mr-4 flex flex-col items-center gap-0.5 rounded-2xl bg-white px-4 py-3 text-[11px] font-bold text-primary-dark shadow-pop transition hover:scale-[1.02]">
            <Plus size={17} /> {t("topUp")}
          </Link>
        </Card>
      ) : (
        <Card className="mb-5 p-4 text-center text-sm text-ink-soft">
          <Link className="font-bold text-primary" to="/login">{t("login")} →</Link>
        </Card>
      )}

      {/* banners */}
      {banners.length ? (
        <div className="relative mb-6 overflow-hidden rounded-card shadow-card">
          <div className="flex transition-transform duration-500" style={{ transform: `translateX(-${slide * 100}%)` }}>
            {banners.map(b => (
              <Link key={b.id} to={b.linkUrl?.startsWith("/") ? b.linkUrl : (b.linkUrl || "/products")}
                className="relative w-full shrink-0">
                <img src={b.imageUrl} alt={b.title} className="aspect-[21/9] w-full object-cover" />
                <div className="absolute inset-0 bg-gradient-to-r from-ink/70 via-ink/25 to-transparent" />
                <div className="absolute inset-0 flex flex-col justify-center gap-1 px-5">
                  <p className="font-display text-[17px] font-bold leading-tight text-white drop-shadow">{b.title}</p>
                  {b.subtitle ? <p className="max-w-[70%] text-xs text-white/85">{b.subtitle}</p> : null}
                </div>
              </Link>
            ))}
          </div>
          {banners.length > 1 ? (
            <>
              <button onClick={() => setSlide(v => (v - 1 + banners.length) % banners.length)} className="absolute left-2 top-1/2 -translate-y-1/2 rounded-full bg-white/85 p-1.5 shadow"><ChevronLeft size={16} /></button>
              <button onClick={() => setSlide(v => (v + 1) % banners.length)} className="absolute right-2 top-1/2 -translate-y-1/2 rounded-full bg-white/85 p-1.5 shadow"><ChevronRight size={16} /></button>
              <div className="absolute bottom-2 left-1/2 flex -translate-x-1/2 gap-1.5">
                {banners.map((b, i) => <span key={b.id} className={`h-1.5 rounded-full transition-all ${i === slide ? "w-5 bg-white" : "w-1.5 bg-white/60"}`} />)}
              </div>
            </>
          ) : null}
        </div>
      ) : data === null ? <Skeleton className="mb-6 aspect-[21/9] w-full" /> : null}

      {/* categories */}
      {data ? (
        <section className="mb-6">
          <SectionHead title={t("allCategories")} to="/products" />
          <div className="no-scrollbar -mx-4 flex snap-x gap-3 overflow-x-auto px-4 pb-1">
            {data.categories.map(c => {
              const Icon = (c.icon && ICONS[c.icon]) || Heading1;
              return (
                <Link key={c.id} to={`/products?category=${c.id}`} onClick={() => haptic("light")}
                  className="flex w-[84px] shrink-0 snap-start flex-col items-center gap-2">
                  <div className="flex h-[62px] w-[62px] items-center justify-center rounded-2xl border border-primary/10 bg-white text-primary shadow-card transition hover:-translate-y-0.5">
                    {c.iconUrl ? <img src={c.iconUrl} alt="" className="h-8 w-8 object-contain" /> : <Icon size={26} />}
                  </div>
                  <span className="line-clamp-2 text-center text-[11px] font-semibold leading-tight text-ink-soft">
                    {lang === "km" ? c.nameKm : c.nameEn}
                  </span>
                </Link>
              );
            })}
          </div>
        </section>
      ) : (
        <div className="mb-6 flex gap-3">{[...Array(5)].map((_, i) => <div key={i} className="skeleton h-[62px] w-[62px] shrink-0 rounded-2xl" />)}
        </div>
      )}

      {/* product rows */}
      {data === null ? (
        <RowSkeleton title={t("featured")} />
      ) : (
        rows.map(row => (
          <section key={row.key} className="mb-7">
            <SectionHead title={row.title} to={`/products?${row.key === "offers" ? "offer=1" : row.key === "featured" ? "featured=1" : ""}`} icon={row.icon} />
            <div className="no-scrollbar -mx-4 flex snap-x gap-3 overflow-x-auto px-4 pb-1">
              {row.items.slice(0, 8).map(p => <ProductCard key={p.id} p={p} horizontal />)}
            </div>
          </section>
        ))
      )}

      {data?.recentlyViewed?.length ? (
        <section className="mb-7">
          <SectionHead title={t("recentlyViewed")} to="/products" />
          <div className="no-scrollbar -mx-4 flex snap-x gap-3 overflow-x-auto px-4 pb-1">
            {data.recentlyViewed.map(p => <ProductCard key={p.id} p={p} horizontal />)}
          </div>
        </section>
      ) : null}
    </Shell>
  );
}

function SectionHead({ title, to, icon: Icon }: { title: string; to?: string; icon?: any }) {
  const { t } = useStore();
  return (
    <div className="mb-3 flex items-center justify-between">
      <h2 className="flex items-center gap-1.5 font-display text-[15px] font-bold text-ink">
        {Icon ? <Icon size={16} className="text-primary" /> : null}{title}
      </h2>
      {to ? <Link to={to} className="text-xs font-bold text-primary">{t("seeAll")} →</Link> : null}
    </div>
  );
}

function RowSkeleton({ title }: { title: string }) {
  return (
    <section className="mb-7">
      <div className="mb-3 flex items-center justify-between">
        <Skeleton className="h-4 w-28" /><Skeleton className="h-3 w-12" />
      </div>
      <div className="no-scrollbar -mx-4 flex gap-3 overflow-x-auto px-4">
        {[...Array(4)].map((_, i) => <ProductCardSkeleton key={i} horizontal />)}
      </div>
    </section>
  );
}
