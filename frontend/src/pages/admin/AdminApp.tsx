import React from "react";
import { NavLink, Navigate, Outlet, Route, Routes, useLocation } from "react-router-dom";
import {
  BadgePercent, BellRing, Coins, CreditCard, LayoutDashboard, LogOut, Menu,
  Package, ScrollText, Settings, Shield, ShoppingBag, Store, Users, Warehouse, X
} from "lucide-react";
import { useStore } from "../../state/store";
import { cx } from "../../components/ui";
import AdminDashboard from "./AdminDashboard";
import AdminCatalog from "./AdminCatalog";
import AdminOrders from "./AdminOrders";
import AdminUsers from "./AdminUsers";
import AdminFinance from "./AdminFinance";
import AdminSettings from "./AdminSettings";

const MENU = [
  { to: "/admin", icon: LayoutDashboard, label: "Dashboard", perm: "dashboard", end: true },
  { to: "/admin/catalog", icon: Package, label: "Products & Catalog", perm: "products" },
  { to: "/admin/orders", icon: ShoppingBag, label: "Orders & Delivery", perm: "orders" },
  { to: "/admin/users", icon: Users, label: "Users", perm: "users" },
  { to: "/admin/finance", icon: CreditCard, label: "Payments & Promotions", perm: "payments" },
  { to: "/admin/settings", icon: Settings, label: "Settings & Audit", perm: "settings" }
];

export default function AdminApp() {
  const { user, t, lang, logout, confirm } = useStore();
  const loc = useLocation();
  const [open, setOpen] = React.useState(false);

  React.useEffect(() => { setOpen(false); }, [loc.pathname]);

  if (!user) return <Navigate to="/login" replace />;
  if (!user.isAdmin) return <Navigate to="/" replace />;

  const menu = MENU.filter(m => hasPerm(user, m.perm));

  async function doLogout() {
    const ok = await confirm("Exit admin?", undefined, true);
    if (ok) { await logout(); window.location.href = "/login"; }
  }

  return (
    <div className="flex min-h-dvh bg-canvas">
      {/* sidebar */}
      <aside className={cx(
        "fixed inset-y-0 left-0 z-50 flex w-64 flex-col border-r border-ink/5 bg-white shadow-2xl transition-transform lg:sticky lg:top-0 lg:h-dvh lg:translate-x-0 lg:shadow-none",
        open ? "translate-x-0" : "-translate-x-full"
      )}>
        <div className="flex h-16 items-center gap-2.5 border-b border-ink/5 px-5">
          <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-primary font-display text-sm font-bold text-white shadow-pop">DS</div>
          <div>
            <p className="font-display text-[14px] font-bold leading-none text-ink">Digital Store</p>
            <p className="mt-1 text-[10px] font-bold uppercase tracking-widest text-primary">Admin Panel</p>
          </div>
          <button className="ml-auto rounded-lg p-1.5 text-ink-faint hover:bg-primary-light lg:hidden" onClick={() => setOpen(false)}><X size={18} /></button>
        </div>
        <nav className="flex-1 space-y-1 overflow-y-auto p-3">
          {menu.map(m => (
            <NavLink key={m.to} to={m.to} end={(m as any).end}
              className={({ isActive }) => cx(
                "flex items-center gap-2.5 rounded-xl px-3.5 py-2.5 text-[13px] font-bold transition",
                isActive ? "bg-gradient-to-r from-primary to-[#1B95BC] text-white shadow-pop" : "text-ink-soft hover:bg-primary-light"
              )}>
              <m.icon size={16} /> {m.label}
            </NavLink>
          ))}
        </nav>
        <div className="space-y-1 border-t border-ink/5 p-3">
          <NavLink to="/" className="flex items-center gap-2.5 rounded-xl px-3.5 py-2.5 text-[13px] font-bold text-ink-soft hover:bg-primary-light"><Store size={16} /> Back to Store</NavLink>
          <button onClick={doLogout} className="flex w-full items-center gap-2.5 rounded-xl px-3.5 py-2.5 text-[13px] font-bold text-danger hover:bg-red-50"><LogOut size={16} /> {t("logout")}</button>
          <p className="px-2 pb-1 pt-2 text-[11px] text-ink-faint">{user.displayName} · <Shield size={10} className="inline" /> {user.adminRole}</p>
        </div>
      </aside>
      {open ? <div className="fixed inset-0 z-40 bg-ink/40 backdrop-blur-[1px] lg:hidden" onClick={() => setOpen(false)} /> : null}

      <div className="min-w-0 flex-1">
        <header className="safe-top sticky top-0 z-30 flex h-14 items-center gap-3 border-b border-ink/5 bg-canvas/90 px-4 backdrop-blur lg:hidden">
          <button onClick={() => setOpen(true)} className="rounded-lg p-2 text-ink-soft hover:bg-primary-light"><Menu size={20} /></button>
          <p className="font-display text-sm font-bold">{(menu.find(m => loc.pathname.startsWith(m.to) && m.to !== "/admin") || menu.find(m => m.to === "/admin"))?.label || "Admin"}</p>
        </header>
        <main className="mx-auto max-w-[1200px] p-4 md:p-6">
          <Routes>
            <Route index element={<AdminDashboard />} />
            <Route path="catalog" element={<AdminCatalog key="cat" />} />
            <Route path="catalog/:productId?" element={<AdminCatalog />} />
            <Route path="orders" element={<AdminOrders key="ord" />} />
            <Route path="users" element={<AdminUsers />} />
            <Route path="finance" element={<AdminFinance key="fin" />} />
            <Route path="finance/:tab" element={<AdminFinance />} />
            <Route path="settings" element={<AdminSettings />} />
            <Route path="*" element={<Navigate to="/admin" replace />} />
          </Routes>
        </main>
      </div>
    </div>
  );
}

function hasPerm(user: any, perm: string): boolean {
  if (user.adminRole === "SUPER_ADMIN") return true;
  return !!user.adminPermissions && user.adminPermissions.includes(perm);
}

void BadgePercent; void Coins; void ScrollText; void Warehouse; void BellRing;
