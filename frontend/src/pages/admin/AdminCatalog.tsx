import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  Cpu, Gift, Image as ImageIcon, Layers, Package, Pencil, Plus, Trash2, Upload, Warehouse, X
} from "lucide-react";
import { api, HttpError } from "../../lib/api";
import { useStore } from "../../state/store";
import { Button, Card, Field, Input, Modal, Select, Skeleton, StatusChip, TextArea, Toggle, cx } from "../../components/ui";
import { AmountInput, Loading, Pager, SearchBox, Table, Td, majorToMinor, minorToMajor, useLoad } from "../../components/adminKit";
import { ImagePicker } from "../../components/ImagePicker";

interface AdminProduct {
  id: number; code: string; name: string; categoryId: number | null; priceMinor: number; costMinor: number;
  deliveryType: string; status: string; stockMode: string; isFeatured: number | boolean; isOffer: number | boolean;
  durationLabel: string | null; salesCount: number; viewCount: number; coverUrl: string | null;
}
interface AdminVariantX { id: number; name: string; price: string; cost: string; compare: string; durationLabel: string; sort: number; isActive: boolean }
interface Category { id: number; nameKm: string; nameEn: string; slug: string; icon: string | null; iconUrl?: string | null; sortOrder: number; isActive: number | boolean }

export default function AdminCatalog() {
  const { toast, confirm, money, lang } = useStore();
  const [tab, setTab] = useState<"products" | "categories" | "banners">("products");

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="font-display text-2xl font-bold text-ink">{lang === "km" ? "ផលិតផល និងកាតាឡុក" : "Products & Catalog"}</h1>
        <div className="flex rounded-pill bg-primary-light p-1">
          {(["products", "categories", "banners"] as const).map(tb => (
            <button key={tb} onClick={() => setTab(tb)} className={cx("rounded-pill px-4 py-1.5 text-xs font-bold capitalize", tab === tb ? "bg-white text-primary-dark shadow-card" : "text-ink-soft")}>{tb}</button>
          ))}
        </div>
      </div>
      {tab === "products" && <ProductsTab />}
      {tab === "categories" && <CategoriesTab />}
      {tab === "banners" && <BannersTab />}
    </div>
  );

  void Layers;
}

// =====================================================================
// Products
// =====================================================================
function ProductsTab() {
  const { money, toast, confirm } = useStore();
  const [q, setQ] = useState("");
  const [page, setPage] = useState(1);
  const [editing, setEditing] = useState<{ id: number | "new" } | null>(null);
  const [inventory, setInventory] = useState<number | null>(null);
  const [tickLoad, setTickLoad] = useState(0);
  const path = `/api/admin/products?limit=12&page=${page}${q ? `&q=${encodeURIComponent(q)}` : ""}`;
  const { data, loading, reload } = useLoad<{ total: number; items: AdminProduct[] }>(path, [tickLoad]);
  const { data: cats } = useLoad<{ items: Category[] }>("/api/admin/categories");
  const catName = (id: number | null) => cats?.items.find(c => c.id === Number(id))?.[ "nameEn" in cats.items[0] ? "nameEn" : "nameEn"] || null;
  const pages = Math.max(1, Math.ceil((data?.total || 0) / 12));

  const onSaved = () => { setTickLoad(t => t + 1); reload(); };

  async function remove(p: AdminProduct) {
    const ok = await confirm("Delete product?", `"${p.name}" — products with order history are archived (soft delete).`, true);
    if (!ok) return;
    try {
      const r = await api.del<{ ok: boolean; softDeleted: boolean }>(`/api/admin/products/${p.id}`);
      toast("success", r.softDeleted ? "Archived (had orders). Marked inactive." : "Deleted");
      onSaved();
    } catch (e: any) { toast("error", e?.message || "failed"); }
  }

  async function quickToggle(p: AdminProduct, field: "isFeatured" | "isOffer") {
    try {
      await api.put(`/api/admin/products/${p.id}`, { [field]: !Boolean(p[field === "isFeatured" ? "isFeatured" : "isOffer"]) });
      onSaved();
    } catch (e: any) { toast("error", e?.message); }
  }

  return (
    <>
      <div className="flex flex-wrap items-center gap-2">
        <SearchBox value={q} onChange={v => { setQ(v); setPage(1); }} placeholder="Search products…" />
        <Button className="ml-auto" icon={Plus} onClick={() => setEditing({ id: "new" })}>Add product</Button>
      </div>

      {loading && !data ? <Loading /> : (
        <Table head={["", "Product", "Pricing", "Delivery / Stock", "Status", ""]}>
          {data?.items.map(p => (
            <tr key={p.id} className="transition hover:bg-canvas/60">
              <Td className="w-12"><div className="h-9 w-14 overflow-hidden rounded-lg bg-primary-light">{p.coverUrl ? <img src={p.coverUrl} alt="" className="h-full w-full object-cover" /> : <span className="grid h-full place-items-center text-[9px] font-bold text-primary">PRO</span>}</div></Td>
              <Td>
                <p className="max-w-[260px] truncate font-bold text-ink">{p.name}</p>
                <p className="font-mono text-[10px] text-ink-faint">{p.code}{p.categoryId ? ` · cat #${p.categoryId}` : ""}</p>
              </Td>
              <Td>
                <p className="font-bold text-primary-dark">{money(p.priceMinor)}</p>
                <p className="text-[10px] text-ink-faint">cost {money(p.costMinor)}</p>
                <p className="text-[10px] text-ink-faint">sold {p.salesCount} · views {p.viewCount}</p>
              </Td>
              <Td>
                <p className="text-[11px] font-bold uppercase tracking-wide">{p.deliveryType === "AUTO" ? <><Cpu size={11} className="mb-[-1px] mr-1 inline" />Auto</> : <><Gift size={11} className="mb-[-1px] mr-1 inline" />Manual</>}</p>
                <p className="text-[10px] text-ink-faint">{p.stockMode}{p.durationLabel ? ` · ${p.durationLabel}` : ""}</p>
              </Td>
              <Td>
                <StatusChip status={p.status === "ACTIVE" ? "COMPLETED" : "CANCELLED"} label={p.status} />
                <div className="mt-1.5 flex gap-2 text-[10px] font-bold">
                  <button onClick={() => quickToggle(p, "isFeatured")} className={cx("rounded-lg px-1.5 py-0.5", p.isFeatured ? "bg-primary text-white" : "bg-canvas text-ink-faint")}>PRO</button>
                  <button onClick={() => quickToggle(p, "isOffer")} className={cx("rounded-lg px-1.5 py-0.5", p.isOffer ? "bg-danger text-white" : "bg-canvas text-ink-faint")}>OFFER</button>
                </div>
              </Td>
              <Td>
                <div className="flex justify-end gap-1.5">
                  <IconBtn title="Digital inventory" onClick={() => setInventory(p.id)}><Warehouse size={15} /></IconBtn>
                  <IconBtn title="Edit" onClick={() => setEditing({ id: p.id })}><Pencil size={15} /></IconBtn>
                  <IconBtn title="Delete" danger onClick={() => remove(p)}><Trash2 size={15} /></IconBtn>
                </div>
              </Td>
            </tr>
          ))}
        </Table>
      )}
      <Pager page={page} pages={pages} onPage={setPage} />

      {editing ? (
        <ProductEditor idOrNew={editing.id} onClose={() => setEditing(null)} onSaved={() => { onSaved(); }} catNames={catsSafe(cats)} />
      ) : null}
      {inventory ? <InventoryPanel productId={inventory} onClose={() => setInventory(null)} /> : null}
    </>
  );
}

function catsSafe(cats: any): string[] { void cats; return []; }

function IconBtn({ children, onClick, title, danger }: { children: React.ReactNode; onClick: () => void; title: string; danger?: boolean }) {
  return (
    <button title={title} onClick={onClick}
      className={cx("rounded-lg border border-ink/10 bg-white p-2 shadow-card transition active:scale-90", danger ? "text-danger hover:bg-red-50" : "text-ink-soft hover:bg-primary-light")}>
      {children}
    </button>
  );
}

// =====================================================================
// Product editor modal
// =====================================================================
function ProductEditor({ idOrNew, onClose, catNames }: { idOrNew: number | "new"; onClose: () => void; onSaved?: () => void; catNames?: string[] }) {
  const { toast, money, lang } = useStore();
  const [busy, setBusy] = useState(false);
  const [f, setF] = useState({
    name: "", description: "", instructions: "", coverUrl: "", categoryId: "" as string | number,
    priceMajor: "", costMajor: "", durationLabel: "", deliveryType: "AUTO", status: "ACTIVE",
    stockMode: "INVENTORY", isFeatured: false, isOffer: false
  });
  const [variants, setVariants] = useState<any[]>([]);
  const [dirtyVariant, setDirtyVariant] = useState(false);
  const [tick, setTick] = useState(0);
  void catNames;

  useEffect(() => {
    if (idOrNew === "new") return;
    api.get<{ product: any; variants: any[] }>(`/api/admin/products/${idOrNew}`).then(r => {
      const p = r.product;
      setF({
        name: p.name, description: p.description || "", instructions: p.instructions || "", coverUrl: p.coverUrl || "",
        categoryId: p.categoryId ?? "", priceMajor: String(minorToMajor(p.priceMinor)), costMajor: String(minorToMajor(p.costMinor)),
        durationLabel: p.durationLabel || "", deliveryType: p.deliveryType, status: p.status, stockMode: p.stockMode,
        isFeatured: Boolean(p.isFeatured), isOffer: Boolean(p.isOffer)
      });
      setVariants(r.variants.map((v: any) => ({ id: Number(v.id), productId: Number(v.productId), name: v.name, price: String(minorToMajor(v.priceMinor)), cost: String(minorToMajor(v.costMinor)), compare: String(minorToMajor(v.compareAtMinor)), durationLabel: v.durationLabel || "", isActive: Boolean(v.isActive), sort: Number(v.sortOrder) || 0 })));
    });
  }, [idOrNew]);
  void tick;

  const { data: cats } = useLoad<{ items: Category[] }>("/api/admin/categories");

  async function save() {
    if (!f.name.trim()) { toast("error", "Name is required"); return; }
    setBusy(true);
    try {
      const body = {
        name: f.name.trim(), description: f.description, instructions: f.instructions, coverUrl: f.coverUrl || null,
        categoryId: f.categoryId ? Number(f.categoryId) : null,
        priceMinor: majorToMinor(f.priceMajor || "0"), costMinor: majorToMinor(f.costMajor || "0"),
        durationLabel: f.durationLabel || null, deliveryType: f.deliveryType, status: f.status,
        stockMode: f.stockMode, isFeatured: f.isFeatured, isOffer: f.isOffer
      };
      let pid: number;
      if (idOrNew === "new") {
        const r = await api.post<{ id: number }>("/api/admin/products", body);
        pid = r.id;
      } else {
        await api.put(`/api/admin/products/${idOrNew}`, body);
        pid = idOrNew as number;
      }
      // variants: create/update the dirty ones (server deletes are explicit)
      if (dirtyVariant) {
        for (const v of variants.filter(x => x.name)) {
          const payload = {
            name: v.name, priceMinor: majorToMinor(v.price), costMinor: majorToMinor(v.cost),
            compareAtMinor: majorToMinor(v.compare), durationLabel: v.durationLabel, isActive: Boolean(v.isActive), sortOrder: v.sort
          };
          if (v.id === 0) await api.post(`/api/admin/products/${pid}/variants`, payload);
          else await api.put(`/api/admin/variants/${v.id}`, payload);
        }
      }
      toast("success", "Saved");
      onClose();
    } catch (e: any) {
      toast("error", e?.message || "failed");
    } finally { setBusy(false); }
  }

  function set<K extends keyof typeof f>(k: K, v: (typeof f)[K]) { setF(s => ({ ...s, [k]: v })); }
  const unlimited = f.stockMode === "UNLIMITED" || f.deliveryType === "MANUAL";

  return (
    <Modal open onClose={onClose} title={idOrNew === "new" ? "Add product" : `Edit #${idOrNew}`} wide>
      <div className="grid gap-4 md:grid-cols-2">
        <Field label="Name (shown to customers)"><Input value={f.name} onChange={e => set("name", e.target.value)} maxLength={250} /></Field>
        <Field label="Category">
          <Select value={String(f.categoryId)} onChange={e => set("categoryId", e.target.value)} className="w-full">
            <option value="">— none —</option>
            {cats?.items.map(c => <option key={c.id} value={c.id}>{lang === "km" ? c.nameKm : c.nameEn}</option>)}
          </Select>
        </Field>
        <div className="md:col-span-2"><Field label="Description"><TextArea rows={3} value={f.description} onChange={e => set("description", e.target.value)} /></Field></div>
        <div className="md:col-span-2"><Field label="Buyer instructions (shown after delivery)"><TextArea rows={2} value={f.instructions} onChange={e => set("instructions", e.target.value)} /></Field></div>

        <Field label="Selling price (USD)"><AmountInput value={f.priceMajor} onChange={v => set("priceMajor", v)} /></Field>
        <Field label="Cost price (for profit calc)"><AmountInput value={f.costMajor} onChange={v => set("costMajor", v)} /></Field>
        <Field label="Duration label"><Input value={f.durationLabel} onChange={e => set("durationLabel", e.target.value)} placeholder="30 days / Lifetime" /></Field>
        <Field label="Delivery type">
          <Select value={f.deliveryType} onChange={e => set("deliveryType", e.target.value)} className="w-full">
            <option value="AUTO">AUTO — instant (keys / files / instructions)</option>
            <option value="MANUAL">MANUAL — staff delivers per order</option>
          </Select>
        </Field>
        <Field label="Stock mode">
          <Select value={f.stockMode} onChange={e => set("stockMode", e.target.value)} className="w-full">
            <option value="INVENTORY">Shared key/file pool</option>
            <option value="KEY_POOL">Per-package key pool</option>
            <option value="UNLIMITED">Unlimited</option>
            <option value="OUT_OF_STOCK">Force out of stock</option>
          </Select>
        </Field>
        <Field label="Status">
          <Select value={f.status} onChange={e => set("status", e.target.value)} className="w-full">
            <option value="ACTIVE">ACTIVE</option>
            <option value="INACTIVE">INACTIVE</option>
          </Select>
        </Field>

        <div className="md:col-span-2"><Field label="Cover image"><ImagePicker value={f.coverUrl} onChange={u => set("coverUrl", u || "")} /></Field></div>

        <div className="flex items-center gap-6 md:col-span-2">
          <label className="flex items-center gap-2 text-sm font-semibold"><Toggle checked={f.isFeatured} onChange={v => set("isFeatured", v)} /> Featured</label>
          <label className="flex items-center gap-2 text-sm font-semibold"><Toggle checked={f.isOffer} onChange={v => set("isOffer", v)} /> Special offer</label>
        </div>

        {/* variants */}
        <div className="md:col-span-2">
          <div className="mb-2 flex items-center justify-between">
            <p className="text-sm font-bold">Packages / variants</p>
            <Button size="sm" variant="soft" icon={Plus} onClick={() => { setDirtyVariant(true); setVariants(v => [...v, { id: 0, name: "", price: "0", cost: "0", compare: "0", durationLabel: "", sort: variants.length, isActive: true }]); }}>Add</Button>
          </div>
          {unlimited && f.stockMode === "UNLIMITED" ? <p className="mb-2 text-xs text-ink-faint">Unlimited stock — variants optional. Leave one row to keep a single price.</p> : null}
          <div className="space-y-2">
            {variants.filter(() => true).map((v, i) => (
              <div key={v.id || `new${i}`} className="flex flex-wrap items-center gap-2 rounded-xl border border-ink/5 bg-canvas/60 p-2.5">
                <Input className="min-w-[140px] flex-1" placeholder="Package name" value={v.name} onChange={e => { setDirtyVariant(true); setVariants(vs => vs.map((x, xi) => xi === i ? { ...x, name: e.target.value } : x)); }} />
                <div className="w-28"><AmountInput value={v.price} onChange={n => { setDirtyVariant(true); setVariants(vs => vs.map((x, xi) => xi === i ? { ...x, price: n } : x)); }} /></div>
                <Input className="w-24" placeholder="days" value={v.durationLabel || ""} onChange={e => { setDirtyVariant(true); setVariants(vs => vs.map((x, xi) => xi === i ? { ...x, durationLabel: e.target.value } : x)); }} />
                <Select value={String(v.isActive)} onChange={e => { setDirtyVariant(true); setVariants(vs => vs.map((x, xi) => xi === i ? { ...x, isActive: Number(e.target.value) as any } : x)); }} className="w-24 py-2 text-xs"><option value="1">On</option><option value="0">Off</option></Select>
                <button title="Remove" className="rounded-lg p-2 text-danger hover:bg-red-50" onClick={async () => {
                  if (v.id && typeof idOrNew === "number") { try { await api.del(`/api/admin/variants/${v.id}`); } catch { /* ignore */ } }
                  setDirtyVariant(true); setVariants(vs => vs.filter((_, xi) => xi !== i));
                }}><X size={16} /></button>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="mt-5 flex justify-end gap-2">
        <Button variant="outline" onClick={onClose}>Cancel</Button>
        <Button loading={busy} onClick={save}>{idOrNew === "new" ? "Create product" : "Save changes"}</Button>
      </div>
    </Modal>
  );
}

// =====================================================================
// Inventory panel
// =====================================================================
function InventoryPanel({ productId, onClose }: { productId: number; onClose: () => void }) {
  const { toast, money, confirm } = useStore();
  const [page, setPage] = useState(1);
  const [statusF, setStatusF] = useState("");
  const [tick, setTick] = useState(0);
  const { data: product } = useLoad<any>(`/api/admin/products/${productId}`);
  const [inv, setInv] = useState<{ total: number; items: any[] } | null>(null);
  const [adding, setAdding] = useState(false);
  const [values, setValues] = useState("");
  const [itemType, setItemType] = useState("KEY");
  const [variantId, setVariantId] = useState("");
  const [busy, setBusy] = useState(false);
  const fileRef = React.useRef<HTMLInputElement>(null);

  const load = useCallback(() => {
    api.get<{ total: number; items: any[] }>(`/api/admin/inventory?productId=${productId}&limit=40&page=${page}${statusF ? `&status=${statusF}` : ""}`)
      .then(setInv).catch(() => setInv({ total: 0, items: [] }));
  }, [productId, page, statusF]);
  useEffect(load, [load, tick]);

  async function bulkAdd() {
    const lines = values.split(/\r?\n/).map(x => x.trim()).filter(Boolean);
    if (!lines.length) return;
    if (lines.length > 2000) { toast("error", "Too many items"); return; }
    setBusy(true);
    try {
      await api.post("/api/admin/inventory/bulk", { productId, itemType, variantId: variantId ? Number(variantId) : null, values: lines });
      toast("success", `${lines.length} item(s) added`);
      setValues(""); setAdding(false); setTick(t => t + 1);
    } catch (e: any) { toast("error", e?.message); }
    finally { setBusy(false); }
  }

  async function uploadFile(file: File) {
    setBusy(true);
    try {
      const form = new FormData();
      form.append("file", file);
      form.append("productId", String(productId));
      if (variantId) form.append("variantId", variantId);
      await api.upload("/api/admin/inventory/file", form);
      toast("success", "File stock added");
      setTick(t => t + 1);
    } catch (e: any) { toast("error", e?.message || "failed"); }
    finally { setBusy(false); }
  }

  async function voidItem(id: number) {
    const ok = await confirm("Void item?", "It will never be delivered.", true);
    if (!ok) return;
    try { await api.post(`/api/admin/inventory/${id}/void`, {}); setTick(t => t + 1); } catch (e: any) { toast("error", e?.message); }
  }

  const pages = Math.max(1, Math.ceil((inv?.total || 0) / 40));

  return (
    <Modal open onClose={onClose} title={`Inventory — ${product?.product?.name || "product #" + productId}`} wide>
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <Select value={statusF} onChange={e => setStatusF(e.target.value)} className="py-2 text-xs"><option value="">All statuses</option><option>AVAILABLE</option><option>ASSIGNED</option><option>VOID</option></Select>
        <Select value={variantId} onChange={e => setVariantId(e.target.value)} className="py-2 text-xs"><option value="">Pool: any / product</option>{product?.variants?.map((v: any) => <option key={v.id} value={v.id}>{v.name}</option>)}</Select>
        <div className="ml-auto flex gap-2">
          <input ref={fileRef} type="file" className="hidden" accept=".pdf,.zip,.txt,image/*" onChange={e => { const f = e.target.files?.[0]; if (f) uploadFile(f); e.target.value = ""; }} />
          <Button size="sm" variant="outline" icon={Upload} disabled={busy} onClick={() => fileRef.current?.click()}>Upload file</Button>
          <Button size="sm" icon={Plus} onClick={() => setAdding(v => !v)}>{adding ? "Close" : "Add items"}</Button>
        </div>
      </div>

      {adding ? (
        <Card className="mb-3 border-primary/20 bg-primary-soft p-3">
          <p className="mb-1.5 text-xs font-bold">One item per line — keys, voucher codes, account JSON or text instructions</p>
          <TextArea rows={5} value={values} onChange={e => setValues(e.target.value)} placeholder={"XXXX-XXXX-XXXX\n{\"login\":\"user\",\"password\":\"secret\"}"} className="font-mono text-xs" />
          <div className="mt-2 flex items-center gap-2">
            <Select value={itemType} onChange={e => setItemType(e.target.value)} className="py-2 text-xs"><option value="KEY">Key / code</option><option value="TEXT">Text</option><option value="ACCOUNT">Account</option></Select>
            <Button size="sm" className="ml-auto" loading={busy} onClick={bulkAdd}>Add {values.split(/\r?\n/).filter(Boolean).length || ""}</Button>
          </div>
        </Card>
      ) : null}

      {inv === null ? <Loading inline /> : (
        <div className="admin-scroll max-h-[46vh] overflow-auto rounded-xl border border-ink/5">
          <table className="w-full text-left text-xs">
            <thead className="sticky top-0 bg-canvas"><tr className="text-[10px] uppercase text-ink-faint"><th className="p-2.5">#</th><th className="p-2.5">Type</th><th className="p-2.5">Value</th><th className="p-2.5">Status</th><th className="p-2.5" /></tr></thead>
            <tbody className="divide-y divide-ink/5">
              {inv.items.map(x => (
                <tr key={x.id} className="hover:bg-canvas/70">
                  <Td className="!p-2.5 text-ink-faint">{x.id}</Td>
                  <Td className="!p-2.5 font-bold">{String(x.itemType)}</Td>
                  <Td className="!max-w-[260px] !p-2.5 truncate font-mono">{String(x.value ?? "")}</Td>
                  <Td className="!p-2.5"><StatusChip status={String(x.status)} /></Td>
                  <Td className="!p-2.5 text-right">{x.status === "AVAILABLE" ? <button onClick={() => voidItem(x.id)} className="rounded-md p-1.5 text-danger hover:bg-red-50" title="Void"><Trash2 size={13} /></button> : null}</Td>
                </tr>
              ))}
              {inv.items.length === 0 ? <tr><td colSpan={5} className="p-6 text-center text-ink-faint">Inventory empty — add keys/files above</td></tr> : null}
            </tbody>
          </table>
        </div>
      )}
      <Pager page={page} pages={pages} onPage={setPage} />
    </Modal>
  );
}

// =====================================================================
// Categories
// =====================================================================
function CategoriesTab() {
  const { toast, confirm, lang } = useStore();
  const { data, loading, reload } = useLoad<{ items: Category[] }>("/api/admin/categories");
  const [edit, setEdit] = useState<Category | "new" | null>(null);

  async function remove(c: Category) {
    const ok = await confirm("Delete category?", `"${lang === "km" ? c.nameKm : c.nameEn}"`, true);
    if (!ok) return;
    try { await api.del(`/api/admin/categories/${c.id}`); toast("success", "Deleted"); reload(); }
    catch (e: any) { toast("error", e instanceof HttpError ? e.message : "failed"); }
  }

  return (
    <>
      <div className="flex justify-end"><Button icon={Plus} onClick={() => setEdit("new")}>Add category</Button></div>
      {loading || !data ? <Loading /> : (
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {data.items.map(c => (
            <Card key={c.id} className="flex items-center gap-3 p-4">
              <div className="flex h-12 w-12 shrink-0 items-center justify-center overflow-hidden rounded-xl bg-primary-light font-display font-bold text-primary">
                {c.iconUrl ? <img src={c.iconUrl} alt="" className="h-full w-full object-cover" /> : (c.nameEn || "?").charAt(0)}
              </div>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-bold">{lang === "km" ? c.nameKm : c.nameEn}</p>
                <p className="text-[11px] text-ink-faint">order {c.sortOrder} · {c.isActive ? "active" : "hidden"}</p>
              </div>
              <div className="flex gap-1">
                <IconBtn title="Edit" onClick={() => setEdit(c)}><Pencil size={14} /></IconBtn>
                <IconBtn title="Delete" danger onClick={() => remove(c)}><Trash2 size={14} /></IconBtn>
              </div>
            </Card>
          ))}
        </div>
      )}
      {edit ? <CategoryEditor cat={edit} onClose={() => setEdit(null)} onSaved={reload} /> : null}
    </>
  );
}

function CategoryEditor({ cat, onClose, onSaved }: { cat: Category | "new"; onClose: () => void; onSaved: () => void }) {
  const { toast } = useStore();
  const base = cat === "new" ? { nameKm: "", nameEn: "", slug: "", icon: "", iconUrl: "", sortOrder: 0, isActive: 1 } : cat;
  const [f, setF] = useState({ ...base } as any);
  const [busy, setBusy] = useState(false);
  return (
    <Modal open onClose={onClose} title={cat === "new" ? "Add category" : "Edit category"}>
      <div className="space-y-3.5">
        <Field label="Name (Khmer)"><Input value={f.nameKm} onChange={e => setF({ ...f, nameKm: e.target.value })} /></Field>
        <Field label="Name (English)"><Input value={f.nameEn} onChange={e => setF({ ...f, nameEn: e.target.value })} /></Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Slug"><Input value={f.slug || ""} onChange={e => setF({ ...f, slug: e.target.value })} disabled={cat !== "new"} /></Field>
          <Field label="Sort order"><Input type="number" value={f.sortOrder} onChange={e => setF({ ...f, sortOrder: Number(e.target.value) })} /></Field>
        </div>
        <Field label="Icon (lucide name)"><Input value={f.icon || ""} onChange={e => setF({ ...f, icon: e.target.value })} placeholder="Crown / KeyRound / Gamepad2…" /></Field>
        <Field label="Icon image (optional)"><ImagePicker value={f.iconUrl || ""} onChange={u => setF({ ...f, iconUrl: u || "" })} /></Field>
        <label className="flex items-center gap-2 text-sm font-semibold"><Toggle checked={Boolean(f.isActive)} onChange={v => setF({ ...f, isActive: v ? 1 : 0 })} /> Active</label>
      </div>
      <div className="mt-5 flex justify-end gap-2">
        <Button variant="outline" onClick={onClose}>Cancel</Button>
        <Button loading={busy} onClick={async () => {
          if (!f.nameKm.trim() || !f.nameEn.trim()) { toast("error", "Names required"); return; }
          setBusy(true);
          try {
            if (cat === "new") await api.post("/api/admin/categories", f);
            else await api.put(`/api/admin/categories/${(cat as Category).id}`, f);
            toast("success", "Saved"); onSaved(); onClose();
          } catch (e: any) { toast("error", e?.message); } finally { setBusy(false); }
        }}>Save</Button>
      </div>
    </Modal>
  );
}

// =====================================================================
// Banners
// =====================================================================
function BannersTab() {
  const { toast, confirm } = useStore();
  const { data, loading, reload } = useLoad<{ items: any[] }>("/api/admin/banners");
  const [edit, setEdit] = useState<any | null>(null);

  async function remove(b: any) {
    const ok = await confirm("Delete banner?", b.title, true);
    if (!ok) return;
    try { await api.del(`/api/admin/banners/${b.id}`); toast("success", "Deleted"); reload(); } catch { toast("error", "failed"); }
  }

  return (
    <>
      <div className="flex justify-end"><Button icon={Plus} onClick={() => setEdit({ title: "", subtitle: "", imageUrl: "", linkUrl: "", sortOrder: 0, isActive: true })}>Add banner</Button></div>
      {loading || !data ? <Loading /> : (
        <div className="grid gap-3 md:grid-cols-2">
          {data.items.map(b => (
            <Card key={b.id} className="overflow-hidden">
              <img src={b.imageUrl} alt={b.title} className="h-28 w-full object-cover" />
              <div className="flex items-center gap-2 p-3">
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-bold">{b.title}</p>
                  <p className="truncate text-[11px] text-ink-faint">{b.subtitle} {b.linkUrl ? `→ ${b.linkUrl}` : ""}</p>
                </div>
                <StatusChip status={b.isActive ? "COMPLETED" : "CANCELLED"} label={b.isActive ? "active" : "off"} />
                <IconBtn title="Edit" onClick={() => setEdit({ ...b, isActive: Boolean(b.isActive) })}><Pencil size={14} /></IconBtn>
                <IconBtn title="Delete" danger onClick={() => remove(b)}><Trash2 size={14} /></IconBtn>
              </div>
            </Card>
          ))}
        </div>
      )}
      {edit ? <BannerEditor b={edit} isNew={!edit.id} onClose={() => setEdit(null)} onSaved={reload} /> : null}
    </>
  );
}

function BannerEditor({ b, isNew, onClose, onSaved }: { b: any; isNew: boolean; onClose: () => void; onSaved: () => void }) {
  const { toast } = useStore();
  const [f, setF] = useState({ ...b });
  const [busy, setBusy] = useState(false);
  return (
    <Modal open onClose={onClose} title={isNew ? "Add banner" : "Edit banner"}>
      <div className="space-y-3.5">
        <Field label="Title"><Input value={f.title} onChange={e => setF({ ...f, title: e.target.value })} /></Field>
        <Field label="Subtitle"><Input value={f.subtitle || ""} onChange={e => setF({ ...f, subtitle: e.target.value })} /></Field>
        <Field label="Image"><ImagePicker value={f.imageUrl} onChange={u => setF({ ...f, imageUrl: u || "" })} /></Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Link (internal path ok)"><Input value={f.linkUrl || ""} onChange={e => setF({ ...f, linkUrl: e.target.value })} placeholder="/products?category=4" /></Field>
          <Field label="Sort order"><Input type="number" value={f.sortOrder ?? 0} onChange={e => setF({ ...f, sortOrder: Number(e.target.value) })} /></Field>
        </div>
        <label className="flex items-center gap-2 text-sm font-semibold"><Toggle checked={Boolean(f.isActive)} onChange={v => setF({ ...f, isActive: v })} /> Active</label>
      </div>
      <div className="mt-5 flex justify-end gap-2">
        <Button variant="outline" onClick={onClose}>Cancel</Button>
        <Button loading={busy} onClick={async () => {
          setBusy(true);
          try {
            if (isNew) await api.post("/api/admin/banners", f); else await api.put(`/api/admin/banners/${f.id}`, f);
            toast("success", "Saved"); onSaved(); onClose();
          } catch (e: any) { toast("error", e?.message); } finally { setBusy(false); }
        }}>Save</Button>
      </div>
    </Modal>
  );
}

void ImageIcon; void Package;
