import React, { useState } from "react";
import { Database, Save, ScrollText, ShieldCheck, UserCog } from "lucide-react";
import { api } from "../../lib/api";
import { useStore } from "../../state/store";
import { Button, Card, Field, Input, Modal, Select, StatusChip, TextArea, Toggle, cx } from "../../components/ui";
import { Loading, Table, Td, useLoad } from "../../components/adminKit";

export default function AdminSettings() {
  const { lang, toast, user } = useStore();
  const [tab, setTab] = useState<"store" | "payments" | "admins" | "audit">("store");

  return (
    <div className="space-y-5">
      <h1 className="font-display text-2xl font-bold text-ink">{lang === "km" ? "ការកំណត់ប្រព័ន្ធ" : "System Settings"}</h1>
      <div className="no-scrollbar flex gap-1.5 overflow-x-auto rounded-pill bg-primary-light p-1">
        {([["store", "Store"], ["payments", "Payments & Delivery"], ["admins", "Admins"], ["audit", "Audit logs"]] as const).map(([id, label]) => (
          <button key={id} onClick={() => setTab(id)} className={cx("shrink-0 rounded-pill px-4 py-1.5 text-xs font-bold", tab === id ? "bg-white text-primary-dark shadow-card" : "text-ink-soft")}>{label}</button>
        ))}
      </div>
      {tab === "store" && <StoreSettings onToast={toast} />}
      {tab === "payments" && <PaymentSettings onToast={toast} />}
      {tab === "admins" && <AdminsTab meId={user?.id || 0} />}
      {tab === "audit" && <AuditTab />}
    </div>
  );
}

function StoreSettings({ onToast }: { onToast: (k: any, m: string) => void }) {
  const { data, loading, reload } = useLoad<{ settings: any }>("/api/admin/settings/store");
  const [f, setF] = useState<any | null>(null);
  const [busy, setBusy] = useState(false);
  const s = f || data?.settings;
  if (loading && !data) return <Loading />;
  if (!s) return null;

  async function save() {
    setBusy(true);
    try { await api.put("/api/admin/settings/store", { settings: s }); onToast("success", "Store settings saved"); reload(); }
    catch (e: any) { onToast("error", e?.message || "failed"); } finally { setBusy(false); }
  }
  const set = (k: string, v: any) => setF({ ...(f || data?.settings), [k]: v });

  return (
    <Card className="space-y-4 p-5">
      <div className="grid gap-3 md:grid-cols-2">
        <Field label="Store name"><Input value={s.storeName || ""} onChange={e => set("storeName", e.target.value)} /></Field>
        <Field label="Website title (browser tab)"><Input value={s.websiteTitle || ""} onChange={e => set("websiteTitle", e.target.value)} /></Field>
        <Field label="Currency"><Select className="w-full" value={s.currency || "USD"} onChange={e => set("currency", e.target.value)}><option>USD</option><option>KHR</option><option>EUR</option></Select></Field>
        <Field label="Timezone"><Input value={s.timezone || ""} onChange={e => set("timezone", e.target.value)} /></Field>
        <Field label="Telegram bot username"><Input value={s.telegramBotUsername || ""} onChange={e => set("telegramBotUsername", e.target.value)} placeholder="@your_store_bot" /></Field>
        <Field label="Support link"><Input value={s.supportUrl || ""} onChange={e => set("supportUrl", e.target.value)} placeholder="https://t.me/support_user" /></Field>
      </div>
      <div className="grid gap-3 md:grid-cols-2">
        <Field label="Terms of Service (ខ្មែរ)"><TextArea rows={3} value={s.termsKm || ""} onChange={e => set("termsKm", e.target.value)} /></Field>
        <Field label="Terms of Service (English)"><TextArea rows={3} value={s.termsEn || ""} onChange={e => set("termsEn", e.target.value)} /></Field>
        <Field label="Privacy Policy (ខ្មែរ)"><TextArea rows={2} value={s.privacyKm || ""} onChange={e => set("privacyKm", e.target.value)} /></Field>
        <Field label="Privacy Policy (English)"><TextArea rows={2} value={s.privacyEn || ""} onChange={e => set("privacyEn", e.target.value)} /></Field>
      </div>
      <div className="flex items-center justify-between rounded-2xl bg-canvas p-4">
        <div>
          <p className="text-sm font-bold">Maintenance mode</p>
          <p className="text-xs text-ink-faint">Customers cannot place orders while enabled. Admins are unaffected.</p>
        </div>
        <Toggle checked={Boolean(s.maintenanceMode)} onChange={v => set("maintenanceMode", v)} />
      </div>
      <div className="flex justify-end"><Button icon={Save} loading={busy} onClick={save}>Save settings</Button></div>
    </Card>
  );
}

function PaymentSettings({ onToast }: { onToast: (k: any, m: string) => void }) {
  const { data: pay, reload: rl1 } = useLoad<{ settings: any }>("/api/admin/settings/payments");
  const { data: del, reload: rl2 } = useLoad<{ settings: any }>("/api/admin/settings/delivery");
  const [pf, setPf] = useState<any | null>(null);
  const [df, setDf] = useState<any | null>(null);
  const [busy, setBusy] = useState(false);
  if (!pay || !del) return <Loading />;
  const p = pf || pay.settings;
  const d = df || del.settings;

  async function save() {
    setBusy(true);
    try {
      await api.put("/api/admin/settings/payments", { settings: p });
      await api.put("/api/admin/settings/delivery", { settings: d });
      onToast("success", "Saved"); rl1(); rl2();
    } catch (e: any) { onToast("error", e?.message); } finally { setBusy(false); }
  }

  return (
    <div className="space-y-4">
      <Card className="space-y-3 p-5">
        <p className="flex items-center gap-2 font-display text-sm font-bold"><Database size={15} className="text-primary" />Payments</p>
        <div className={cx("rounded-xl p-3 text-xs leading-5", p.autoWebhookEnabled ? "bg-amber-50 text-[#92400E]" : "bg-emerald-50 text-success")}>
          {p.autoWebhookEnabled
            ? "⚠ Auto webhook verification is ENABLED. Only turn this on after connecting a real payment provider with contracted API access — this app refuses to fake automatic payment confirmation."
            : "Deposits are credited only by manual admin approval (auto verification not connected). Payment QR images are display-only until a verified gateway is integrated."}
        </div>
        <label className="flex items-center gap-2 text-sm font-semibold">
          <Toggle checked={Boolean(p.autoWebhookEnabled)} onChange={v => setPf({ ...p, autoWebhookEnabled: v })} />
          Allow webhook auto-verification (requires real PSP + shared secret)
        </label>
        <Field label="Deposit expiry (hours)"><Input type="number" className="md:w-40" value={p.depositExpiryHours ?? 24} onChange={e => setPf({ ...p, depositExpiryHours: Number(e.target.value) || 24 })} /></Field>
      </Card>
      <Card className="space-y-3 p-5">
        <p className="font-display text-sm font-bold">Delivery</p>
        <label className="flex items-center gap-2 text-sm font-semibold">
          <Toggle checked={d.autoNotifyTelegram !== false} onChange={v => setDf({ ...d, autoNotifyTelegram: v })} />
          Send delivery updates through Telegram Bot (best-effort, never blocks orders)
        </label>
      </Card>
      <div className="flex justify-end"><Button icon={Save} loading={busy} onClick={save}>Save</Button></div>
    </div>
  );
}

function AdminsTab({ meId }: { meId: number }) {
  const { toast, confirm } = useStore();
  const { data, loading, reload } = useLoad<{ items: any[] }>("/api/admin/admins");
  const [add, setAdd] = useState(false);
  const [tg, setTg] = useState("");
  const [busy, setBusy] = useState(false);

  async function grant() {
    setBusy(true);
    try {
      await api.put(`/api/admin/admins/${tg}`, { role: "STAFF", permissions: ["dashboard", "products", "orders", "users", "payments", "inventory", "delivery"] });
      toast("success", "Staff admin added"); setAdd(false); setTg(""); reload();
    } catch (e: any) { toast("error", e?.message || "failed"); } finally { setBusy(false); }
  }

  return (
    <Card className="p-5">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="flex items-center gap-2 font-display text-sm font-bold"><UserCog size={15} className="text-primary" /> Admin team</p>
          <p className="mt-1 text-xs leading-5 text-ink-faint">First admins come from <code className="rounded bg-canvas px-1">ADMIN_TELEGRAM_USER_IDS</code> (server env). Everyone logs in with their Telegram identity — no passwords. Staff permissions can be trimmed here.</p>
        </div>
        <Button size="sm" icon={UserCog} onClick={() => setAdd(true)}>Grant staff access</Button>
      </div>
      {loading || !data ? <Loading inline /> : (
        <Table head={["Admin", "Telegram ID", "Role", "Permissions", ""]}>
          {data.items.map((a: any) => (
            <tr key={a.id}>
              <Td><p className="text-xs font-bold">{a.displayName}</p></Td>
              <Td><span className="font-mono text-xs">{a.telegramId}</span></Td>
              <Td><StatusChip status={a.role === "SUPER_ADMIN" ? "COMPLETED" : "PENDING_PAYMENT"} label={a.role === "SUPER_ADMIN" ? "SUPER_ADMIN" : "STAFF"} /></Td>
              <Td className="text-[10px] text-ink-faint">{a.permissions ? String(a.permissions).slice(0, 80) : "full access"}</Td>
              <Td className="text-right">{a.userId !== meId && a.role !== "SUPER_ADMIN" ? (
                <Button size="sm" variant="outline" onClick={async () => {
                  if (!await confirm("Revoke admin?", a.displayName, true)) return;
                  await api.del(`/api/admin/admins/${a.userId}`); reload();
                }}>Revoke</Button>
              ) : null}</Td>
            </tr>
          ))}
        </Table>
      )}
      <Modal open={add} title="Grant staff admin" onClose={() => setAdd(false)}>
        <div className="space-y-3">
          <Field label="Their Telegram user ID (numeric, must have signed in once)" hint="Ask them to open the Mini App first; the backend looks up the existing account.">
            <Input value={tg} onChange={e => setTg(e.target.value.replace(/\D/g, ""))} inputMode="numeric" className="font-mono" />
          </Field>
          <Button className="w-full" loading={busy} disabled={!tg} onClick={grant}>Add as STAFF (all permissions)</Button>
        </div>
      </Modal>
    </Card>
  );
}

function AuditTab() {
  const { data, loading } = useLoad<{ items: any[]; total: number }>("/api/admin/audit-logs?limit=60");
  const [tick, setTick] = useState(0);
  const { reload } = useLoad<any>("/api/health", [tick]);
  void reload;
  return (
    <Card className="p-5">
      <div className="mb-3 flex items-center justify-between">
        <p className="flex items-center gap-2 font-display text-sm font-bold"><ScrollText size={15} className="text-primary" /> Audit trail ({data?.total ?? 0} events)</p>
        <button onClick={() => setTick(t => t + 1)} className="text-xs font-bold text-primary">↻ refresh</button>
      </div>
      {loading || !data ? <Loading inline /> : (
        <div className="admin-scroll max-h-[65vh] overflow-auto rounded-xl border border-ink/5">
          <table className="w-full min-w-[700px] text-left text-xs">
            <thead className="sticky top-0 bg-canvas text-[10px] uppercase tracking-wide text-ink-faint">
              <tr><th className="p-2.5">When</th><th className="p-2.5">Actor</th><th className="p-2.5">Action</th><th className="p-2.5">Entity</th><th className="p-2.5">Reason / diff</th></tr>
            </thead>
            <tbody className="divide-y divide-ink/5">
              {data.items.map((l: any) => (
                <tr key={l.id} className="hover:bg-canvas/60">
                  <Td className="!p-2.5 whitespace-nowrap text-ink-faint">{l.createdAt ? new Date(String(l.createdAt).replace(" ", "T") + "Z").toLocaleString([], { dateStyle: "short", timeStyle: "short" }) : ""}</Td>
                  <Td className="!p-2.5 font-bold">{l.actorName || "system"}</Td>
                  <Td className="!p-2.5"><span className="rounded-md bg-primary-light px-1.5 py-0.5 font-mono text-[10px] font-black text-primary-dark">{l.action}</span></Td>
                  <Td className="!p-2.5">{l.entityType} <span className="text-ink-faint">#{l.entityId}</span></Td>
                  <Td className={("!max-w-[300px] !p-2.5 truncate text-ink-soft")}>{l.reason || (l.afterData ? String(l.afterData).slice(0, 90) : "")}</Td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Card>
  );
}

void ShieldCheck;
