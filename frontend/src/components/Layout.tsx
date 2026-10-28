import React from "react";
import { NavLink, useLocation, useNavigate } from "react-router-dom";
import { ChevronLeft, Home as HomeIcon, LayoutGrid, Receipt, ShieldCheck, User as UserIcon, Wallet as WalletIcon } from "lucide-react";
import { useStore } from "../state/store";
import { cx } from "./ui";
import { haptic, isTelegram } from "../lib/telegram";

function Logo({ compact }: { compact?: boolean }) {
  return (
    <div className="flex items-center gap-2">
      <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-primary font-display text-sm font-bold text-white shadow-pop">DS</div>
      {!compact ? <span className="font-display text-[17px] font-bold tracking-tight text-ink">Digital Store</span> : null}
    </div>
  );
}

const NAV = [
  { to: "/", icon: HomeIcon, key: "home" as const },
  { to: "/products", icon: LayoutGrid, key: "categories" as const },
  { to: "/orders", icon: Receipt, key: "orders" as const },
  { to: "/wallet", icon: WalletIcon, key: "wallet" as const },
  { to: "/profile", icon: UserIcon, key: "profile" as const }
];

export function Shell({ children, title, back }: { children: React.ReactNode; title?: string; back?: boolean }) {
  const { t } = useStore();
  const nav = useNavigate();
  const loc = useLocation();
  const tabRoute = loc.pathname === "/" ? "/" : NAV.find(n => n.to !== "/" && loc.pathname.startsWith(n.to))?.to;
  const showTabs = ["/", "/products", "/orders", "/wallet", "/profile"].some(p => loc.pathname === p || loc.pathname.startsWith(p + "/"));
  const tg = isTelegram();

  return (
    <div className="app-shell mx-auto flex min-h-dvh w-full max-w-[560px] flex-col bg-canvas shadow-[0_0_60px_rgba(22,53,71,.05)] lg:max-w-none">
      <header className="safe-top sticky top-0 z-30 border-b border-ink/5 bg-canvas/90 backdrop-blur">
        <div className="flex h-14 items-center gap-2 px-4">
          {back ? (
            <button onClick={() => { if (window.history.length > 1) { nav(-1); } else { nav("/"); } }} className="-ml-1.5 rounded-full p-2 text-ink-soft hover:bg-primary-light" aria-label={t("back")}>
              <ChevronLeft size={20} />
            </button>
          ) : null}
          {loc.pathname === "/" ? <Logo /> : (
            <h1 className="truncate font-display text-[17px] font-bold text-ink">{title || "Digital Store"}</h1>
          )}
          <span className="flex-1" />
          <DesktopNav />
        </div>
      </header>

      <main className="page-enter flex-1 px-4 pb-24 pt-3">{children}</main>

      {showTabs && (
        <nav className="safe-bottom fixed inset-x-0 bottom-0 z-40 border-t border-ink/5 bg-white/95 backdrop-blur lg:hidden">
          <div className="mx-auto grid max-w-[560px] grid-cols-5">
            {NAV.map(n => (
              <NavLink key={n.to} to={n.to} end={n.to === "/"} onClick={() => haptic("light")}
                className={({ isActive }) => cx(
                  "flex flex-col items-center gap-0.5 py-2.5 text-[10.5px] font-semibold transition-colors",
                  isActive ? "text-primary" : "text-ink-faint hover:text-ink-soft"
                )}>
                {({ isActive }) => (
                  <>
                    <div className={cx("rounded-xl p-1.5 transition-colors", isActive && "bg-primary-light")}>
                      <n.icon size={20} strokeWidth={isActive ? 2.4 : 2} />
                    </div>
                    {t(n.key)}
                  </>
                )}
              </NavLink>
            ))}
          </div>
        </nav>
      )}
    </div>
  );
}

function DesktopNav() {
  const { user, t } = useStore();
  return (
    <div className="hidden items-center gap-1 lg:flex">
      {NAV.map(n => (
        <NavLink key={n.to} to={n.to} end={n.to === "/"}
          className={({ isActive }) => cx("rounded-pill px-3.5 py-2 text-[13px] font-semibold",
            isActive ? "bg-primary text-white shadow-pop" : "text-ink-soft hover:bg-primary-light")}>
          {t(n.key)}
        </NavLink>
      ))}
      {user?.isAdmin ? (
        <NavLink to="/admin" className={({ isActive }) => cx("flex items-center gap-1.5 rounded-pill px-3.5 py-2 text-[13px] font-semibold",
          isActive ? "bg-ink text-white" : "border border-ink/10 text-ink-soft hover:bg-primary-light")}>
          <ShieldCheck size={15} /> {t("admin")}
        </NavLink>
      ) : null}
    </div>
  );
}
