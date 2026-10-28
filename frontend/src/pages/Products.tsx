import React, { useEffect, useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { Filter, LayoutGrid, Search, SlidersHorizontal, Sparkles, Tag, X } from "lucide-react";
import { api, type Category, type Product } from "../lib/api";
import { useStore } from "../state/store";
import { Shell } from "../components/Layout";
import { Button, EmptyState, ErrorState, Input, Select, Skeleton, cx } from "../components/ui";
import { ProductCard } from "../components/ProductCard";

export default function Products() {
  const { t, lang } = useStore();
  const [params, setParams] = useSearchParams();
  const [items, setItems] = useState<Product[] | null>(null);
  const [total, setTotal] = useState(0);
  const [error, setError] = useState<any>(null);
  const [categories, setCategories] = useState<Category[]>([]);
  const [showFilters, setShowFilters] = useState(false);

  const q = params.get("q") || "";
  const category = params.get("category") || "";
  const sort = params.get("sort") || "new";
  const min = params.get("min") || "";
  const max = params.get("max") || "";
  const page = Number(params.get("page") || 1);
  const featured = params.get("featured") === "1";
  const offer = params.get("offer") === "1";

  useEffect(() => { void api.get<{ items: Category[] }>("/api/categories").then(r => setCategories(r.items)).catch(() => { /* ignore */ }); }, []);

  useEffect(() => {
    let alive = true;
    setItems(null); setError(null);
    const sp = new URLSearchParams();
    if (q) sp.set("q", q);
    if (category) sp.set("category", category);
    if (min) sp.set("min", min);
    if (max) sp.set("max", max);
    if (featured) sp.set("featured", "1");
    if (offer) sp.set("offer", "1");
    sp.set("sort", sort);
    sp.set("page", String(page));
    sp.set("limit", "12");
    sp.set("locale", lang);
    api.get<{ items: Product[]; total: number; pages: number }>("/api/products?" + sp.toString())
      .then(r => { if (alive) { setItems(r.items); setTotal(r.total); } })
      .catch(e => { if (alive) setError(e); });
    return () => { alive = false; };
  }, [q, category, sort, min, max, page, featured, offer, lang]);

  const patch = (kv: Record<string, string | null>) => {
    const next = new URLSearchParams(params);
    for (const [k, v] of Object.entries(kv)) { if (v === null || v === "") next.delete(k); else next.set(k, v); }
    if (!("page" in kv)) next.delete("page");
    setParams(next, { replace: true });
  };

  const chips = useMemo(() => {
    const out: { label: string; onRemove: () => void }[] = [];
    if (q) out.push({ label: `"${q}"`, onRemove: () => patch({ q: null }) });
    if (category) out.push({ label: categoryName(category), onRemove: () => patch({ category: null }) });
    if (min || max) out.push({ label: `$${min || "0"} – ${max ? "$" + max : "∞"}`, onRemove: () => patch({ min: null, max: null }) });
    if (offer) out.push({ label: t("specialOffers"), onRemove: () => patch({ offer: null }) });
    return out;
    function categoryName(id: string) { return categories.find(c => String(c.id) === id)?.[lang === "km" ? "nameKm" : "nameEn"] || `#${id}`; }
  }, [params, categories, lang]);

  return (
    <Shell title={t("products")}>
      <div className="grid gap-6 lg:grid-cols-[240px_1fr]">
        {/* filters — sidebar on desktop, sheet on mobile */}
        <aside className={cx("lg:sticky lg:top-20 lg:block", showFilters ? "block" : "hidden")}>
          <FilterPanel
            q={q} setQ={v => patch({ q: v || null })}
            category={category} setCategory={v => patch({ category: v || null })}
            sort={sort} setSort={v => patch({ sort: v === "new" ? null : v })}
            min={min} max={max} setRange={(a, b) => patch({ min: a || null, max: b || null })}
            categories={categories}
          />
        </aside>

        <div className="min-w-0">
          <div className="mb-3 flex items-center gap-2 lg:hidden">
            <button onClick={() => setShowFilters(v => !v)} className="flex items-center gap-1.5 rounded-pill border border-ink/10 bg-white px-3.5 py-2 text-[13px] font-semibold text-ink-soft shadow-card">
              <SlidersHorizontal size={15} /> {t("filter")}
            </button>
            <div className="flex flex-1 items-center gap-2 rounded-pill border border-ink/10 bg-white px-3.5 py-2 shadow-card">
              <Search size={15} className="text-ink-faint" />
              <input value={qInputPlaceholder()} onChange={e => patch({ q: e.target.value || null })} placeholder={t("search")} className="w-full bg-transparent text-sm outline-none" />
            </div>
          </div>

          {chips.length ? (
            <div className="mb-3 flex flex-wrap gap-1.5">
              {chips.map((c, i) => (
                <button key={i} onClick={c.onRemove} className="flex items-center gap-1 rounded-pill bg-primary-light px-3 py-1 text-xs font-semibold text-primary-dark">
                  {c.label}<X size={12} />
                </button>
              ))}
            </div>
          ) : null}

          <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-ink-faint">{total} {t("products").toLowerCase()}</p>

          {error ? <ErrorState error={error} onRetry={() => patch({ page: null })} /> :
            items === null ? (
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-4">
                {[...Array(6)].map((_, i) => <Skeleton key={i} className="h-56 w-full rounded-card" />)}
              </div>
            ) : items.length ? (
              <>
                <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-4">
                  {items.map(p => <ProductCard key={p.id} p={p} />)}
                </div>
                <Pagination page={page} total={total} onPage={p => { patch({ page: String(p) }); window.scrollTo({ top: 0, behavior: "smooth" }); }} />
              </>
            ) : (
              <EmptyState title={t("noResults")} hint={t("tryAnotherQuery")} icon={LayoutGrid} action={<Button variant="outline" onClick={() => setParams(new URLSearchParams(), { replace: true })}>{t("reset")}</Button>} />
            )}
        </div>
      </div>
    </Shell>
  );

  function qInputPlaceholder() { return q; }
}

function FilterPanel(props: {
  q: string; setQ: (v: string) => void;
  category: string; setCategory: (v: string) => void;
  sort: string; setSort: (v: string) => void;
  min: string; max: string; setRange: (min: string, max: string) => void;
  categories: Category[];
}) {
  const { t, lang } = useStore();
  const [min, setMin] = useState(props.min);
  const [max, setMax] = useState(props.max);
  useEffect(() => { setMin(props.min); setMax(props.max); }, [props.min, props.max]);

  return (
    <div className="space-y-5 rounded-card border border-ink/5 bg-white p-4 shadow-card">
      <div>
        <p className="mb-2 flex items-center gap-1.5 text-[13px] font-bold text-ink"><Sparkles size={14} className="text-primary" /> {t("sortBy")}</p>
        <div className="flex flex-wrap gap-1.5">
          {[["new", t("sortNew")], ["popular", t("sortPopular")], ["price_asc", t("sortPriceAsc")], ["price_desc", t("sortPriceDesc")]].map(([id, label]) => (
            <button key={id} onClick={() => props.setSort(id)}
              className={cx("rounded-pill px-3 py-1.5 text-xs font-semibold transition", props.sort === id && id !== "new" || (id === "new" && (props.sort === "new" || !props.sort)) ? "bg-primary text-white" : "bg-primary-light text-primary-dark hover:bg-primary-light/70")}>
              {label}
            </button>
          ))}
        </div>
      </div>

      <div>
        <p className="mb-2 flex items-center gap-1.5 text-[13px] font-bold text-ink"><Tag size={14} className="text-primary" /> {t("categories")}</p>
        <div className="max-h-56 space-y-1 overflow-y-auto pr-1">
          <button onClick={() => props.setCategory("")} className={cx("block w-full rounded-lg px-3 py-2 text-left text-[13px] font-semibold", !props.category ? "bg-primary-light text-primary-dark" : "text-ink-soft hover:bg-canvas")}>
            {t("allCategories")}
          </button>
          {props.categories.map(c => (
            <button key={c.id} onClick={() => props.setCategory(String(c.id))}
              className={cx("flex w-full items-center justify-between rounded-lg px-3 py-2 text-left text-[13px] font-semibold",
                props.category === String(c.id) ? "bg-primary text-white shadow-pop" : "text-ink-soft hover:bg-canvas")}>
              <span>{lang === "km" ? c.nameKm : c.nameEn}</span>
              <span className="text-[11px] opacity-70">{c.productCount}</span>
            </button>
          ))}
        </div>
      </div>

      <form className="space-y-2" onSubmit={e => { e.preventDefault(); props.setRange(min, max); }}>
        <p className="mb-1 flex items-center gap-1.5 text-[13px] font-bold text-ink"><Filter size={14} className="text-primary" /> {t("minPrice")} / {t("maxPrice")}</p>
        <div className="flex gap-2">
          <Input type="number" inputMode="decimal" min={0} step="0.5" placeholder="0.00" value={min} onChange={e => setMin(e.target.value)} />
          <Input type="number" inputMode="decimal" min={0} step="0.5" placeholder="∞" value={max} onChange={e => setMax(e.target.value)} />
        </div>
        <Button size="sm" variant="soft" className="w-full" type="submit">{t("apply")}</Button>
      </form>
    </div>
  );
}

function Pagination({ page, total, onPage }: { page: number; total: number; onPage: (p: number) => void }) {
  const pages = Math.max(1, Math.ceil(total / 12));
  if (pages <= 1) return null;
  return (
    <div className="mt-5 flex items-center justify-center gap-1.5">
      <Button size="sm" variant="outline" disabled={page <= 1} onClick={() => onPage(page - 1)}>←</Button>
      <span className="px-2 text-sm font-semibold text-ink-soft">{page} / {pages}</span>
      <Button size="sm" variant="outline" disabled={page >= pages} onClick={() => onPage(page + 1)}>→</Button>
    </div>
  );
}
