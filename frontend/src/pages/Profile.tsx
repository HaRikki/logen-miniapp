import React, { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Bell, Crown, FileText, Globe, Hash, Lock, LogOut, Palette, Receipt, ShieldCheck, Globe2 } from "lucide-react";
import { api } from "../lib/api";
import { useStore } from "../state/store";
import { Shell } from "../components/Layout";
import { Button, Card, Skeleton, Toggle, cx } from "../components/ui";

export default function Profile() {
  const { t, user, login, logout, refreshUser, lang, setLang, toast, confirm, money } = useStore();
  const nav = useNavigate();
  const [stats, setStats] = useState<{ totalOrders: number; completed: number } | null>(null);
  const [notifyCount, setNotifyCount] = useState<number | undefined>();
  const [legal, setLegal] = useState<any>(null);
  const [busy, setBusy] = useState(false);
  const [notifyBusy, setNotifyBusy] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const o = await api.get<{ items: any[]; total: number }>("/api/orders?limit=1");
        setStats({ totalOrders: Number(o.total) || 0, completed: 0 });
        const o2 = await api.get<{ items: any[]; total: number }>("/api/orders?status=COMPLETED&limit=1");
        setStats(s => (s ? { ...s, completed: Number(o2.total) || 0 } : s));
        const n = await api.get<{ items: any[] }>("/api/notifications");
        setNotifyCount(n.items.filter((x: any) => !x.isRead).length || undefined);
        const c = await api.get<any>("/api/config");
        setLegal(c.legal || null);
      } catch { /* partial render ok */ }
    })();
  }, []);

  async function doLogout() {
    const ok = await confirm(t("logout"), t("logoutConfirm"), true);
    if (!ok) return;
    setBusy(true);
    await logout();
    const tg = (window as any).Telegram?.WebApp;
    if (tg?.initDataUnsafe) { try { tg.close(); } catch { /* noop */ } }
    nav("/login");
  }

  async function toggleNotify(v: boolean) {
    if (!user) return;
    setNotifyBusy(true);
    login({ ...user, notificationsEnabled: v });
    try {
      await api.patch("/api/users/me", { notificationsEnabled: v });
      await refreshUser();
    } catch {
      login(user);
      toast("error", "failed");
    } finally { setNotifyBusy(false); }
  }

  const initial = (user?.displayName || "?").trim().charAt(0).toUpperCase();

  return (
    <Shell title={t("accountTitle")}>
      <Card className="mb-4 p-5">
        <div className="flex items-center gap-4">
          {user?.photoUrl ? (
            <img src={user.photoUrl} alt="" className="h-16 w-16 rounded-2xl object-cover shadow-card" />
          ) : (
            <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-gradient-to-br from-primary to-[#2BB3D9] font-display text-2xl font-bold text-white shadow-pop">{initial}</div>
          )}
          <div className="min-w-0">
            <p className="truncate font-display text-lg font-bold text-ink">{user?.displayName}</p>
            {user?.username ? <p className="truncate text-[13px] text-ink-soft">@{user.username}</p> : null}
            <p className="mt-0.5 flex items-center gap-1 text-[11px] text-ink-faint"><Hash size={11} />{user?.telegramId}</p>
          </div>
          {user?.isAdmin ? <span className="ml-auto flex shrink-0 items-center gap-1 rounded-pill bg-amber-50 px-2.5 py-1 text-[11px] font-black text-warning"><Crown size={12} />{user.adminRole === "SUPER_ADMIN" ? "SUPER" : "STAFF"}</span> : null}
        </div>
        <div className="mt-4 grid grid-cols-3 gap-2 text-center">
          <div className="rounded-2xl bg-canvas p-3">
            <p className="text-[10px] font-bold uppercase tracking-wide text-ink-faint">{t("balance")}</p>
            <p className="mt-1 font-display text-[15px] font-bold text-primary-dark">{money(user?.balanceMinor ?? 0)}</p>
          </div>
          <div className="rounded-2xl bg-canvas p-3">
            <p className="text-[10px] font-bold uppercase tracking-wide text-ink-faint">{t("totalOrders")}</p>
            <p className="mt-1 font-display text-[15px] font-bold">{stats ? stats.totalOrders : <Skeleton className="mx-auto h-4 w-6" />}</p>
          </div>
          <div className="rounded-2xl bg-canvas p-3">
            <p className="text-[10px] font-bold uppercase tracking-wide text-ink-faint">{t("completedOrders")}</p>
            <p className="mt-1 font-display text-[15px] font-bold text-success">{stats ? stats.completed : <Skeleton className="mx-auto h-4 w-6" />}</p>
          </div>
        </div>
        {user?.createdAt ? <p className="mt-3 text-center text-[11px] text-ink-faint">{t("memberSince")} {new Date(user.createdAt).toLocaleDateString(lang === "km" ? "km-KH" : "en-US")}</p> : null}
      </Card>

      {user?.isAdmin ? (
        <Link to="/admin" className="mb-4 block">
          <Card className="flex items-center gap-3 border-primary/20 bg-gradient-to-r from-primary to-[#2BB3D9] p-4 text-white shadow-card transition hover:shadow-pop">
            <ShieldCheck size={20} />
            <span className="flex-1 font-display text-sm font-bold">{t("adminPanel")}</span>
            <span className="text-lg">→</span>
          </Card>
        </Link>
      ) : null}

      <Card className="mb-4 divide-y divide-ink/5 p-0">
        <LinkRow to="/orders" icon={Receipt} label={t("orders")} />
        <LinkRow to="/notifications" icon={Bell} label={t("notifications")} badge={notifyCount} />
        <LinkRow to="/wallet" icon={FileText} label={t("transactionHistory")} />
      </Card>

      <Card className="mb-4 divide-y divide-ink/5 p-0">
        <div className="flex items-center justify-between gap-3 p-4">
          <span className="flex items-center gap-2.5 text-sm font-semibold"><Bell size={17} className="text-primary" /> {t("notifyOn")}</span>
          <span className={cx(notifyBusy && "animate-pulse")}><Toggle checked={user?.notificationsEnabled ?? true} onChange={toggleNotify} /></span>
        </div>
        <div className="flex items-center justify-between gap-3 p-4">
          <span className="flex items-center gap-2.5 text-sm font-semibold"><Palette size={17} className="text-primary" /> {t("language")}</span>
          <div className="flex rounded-pill bg-primary-light p-0.5">
            {(["km", "en"] as const).map(l => (
              <button key={l} onClick={() => setLang(l)} className={cx("rounded-pill px-3 py-1 text-xs font-bold", lang === l ? "bg-primary text-white" : "text-primary-dark")}>
                {l === "km" ? "ខ្មែរ" : "English"}
              </button>
            ))}
          </div>
        </div>
      </Card>

      <Card className="mb-4 p-4">
        <p className="mb-1 flex items-center gap-2 text-sm font-bold"><Globe2 size={15} className="text-primary" /> {t("supportAndTerms")}</p>
        <details className="group mt-2 text-[13px]">
          <summary className="cursor-pointer select-none font-semibold text-primary-dark">{lang === "km" ? "លក្ខខណ្ឌប្រើប្រាស់" : "Terms of Service"}</summary>
          <p className="whitespace-pre-wrap py-2 leading-6 text-ink-soft">{legal ? (lang === "km" ? legal.termsKm : legal.termsEn) || "—" : "…"}</p>
        </details>
        <details className="group mt-1 text-[13px]">
          <summary className="cursor-pointer select-none font-semibold text-primary-dark">{lang === "km" ? "គោលការណ៍ឯកជនភាព" : "Privacy Policy"}</summary>
          <p className="whitespace-pre-wrap py-2 leading-6 text-ink-soft">{legal ? (lang === "km" ? legal.privacyKm : legal.privacyEn) || "—" : "…"}</p>
        </details>
        <p className="mt-3 flex items-center gap-1.5 rounded-xl bg-canvas p-2.5 text-[11px] text-ink-soft">
          <Lock size={12} className="shrink-0 text-success" />
          {lang === "km" ? "ទិន្នន័យរបស់អ្នកត្រូវបានរក្សាទុកមូលដ្ឋានទិន្នន័យមានសុវត្ថិភាព មិនបង្ហាញឱ្យអ្នកដទៃ" : "Your data is stored in a secure database and never shown to other users."}
        </p>
      </Card>

      <Button variant="danger" className="w-full" icon={LogOut} loading={busy} onClick={doLogout}>{t("logout")}</Button>
      <p className="py-5 text-center text-[11px] text-ink-faint">
        <Globe size={10} className="mb-0.5 mr-1 inline" /> Digital Store · Website + Telegram Mini App
      </p>
    </Shell>
  );
}

function LinkRow({ to, icon: Icon, label, badge }: { to: string; icon: any; label: string; badge?: number }) {
  return (
    <Link to={to} className="flex items-center gap-3 px-4 py-3.5 text-sm font-semibold transition hover:bg-primary-soft">
      <Icon size={17} className="text-primary" /> <span className="flex-1">{label}</span>
      {badge ? <span className="rounded-pill bg-danger px-2 py-0.5 text-[10px] font-black text-white">{badge}</span> : null}
      <span className="text-ink-faint">→</span>
    </Link>
  );
}
