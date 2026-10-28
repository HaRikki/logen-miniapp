import React, { lazy, Suspense } from "react";
import { Navigate, Route, Routes } from "react-router-dom";
import { useStore } from "./state/store";
import { ConfirmHost, Spinner, ToastHost } from "./components/ui";
import Login from "./pages/Login";

const Home = lazy(() => import("./pages/Home"));
const Products = lazy(() => import("./pages/Products"));
const ProductDetail = lazy(() => import("./pages/ProductDetail"));
const Orders = lazy(() => import("./pages/Orders"));
const OrderDetail = lazy(() => import("./pages/OrderDetail"));
const WalletPage = lazy(() => import("./pages/Wallet"));
const Profile = lazy(() => import("./pages/Profile"));
const Notifications = lazy(() => import("./pages/Notifications"));
const AdminApp = lazy(() => import("./pages/admin/AdminApp"));

function Boot() {
  return (
    <div className="flex min-h-dvh flex-col items-center justify-center gap-4 bg-canvas">
      <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-primary font-display text-xl font-bold text-white shadow-pop">DS</div>
      <Spinner />
    </div>
  );
}

export default function App() {
  const { booting } = useStore();
  if (booting) return <Boot />;

  return (
    <>
      <ToastHost />
      <ConfirmHost />
      <Suspense fallback={<div className="flex min-h-[60dvh] items-center justify-center"><Spinner /></div>}>
        <Routes>
          <Route path="/login" element={<Login />} />
          <Route path="/" element={<Home />} />
          <Route path="/products" element={<Products />} />
          <Route path="/product/:id" element={<ProductDetail />} />
          <Route path="/orders" element={<NeedAuth><Orders /></NeedAuth>} />
          <Route path="/orders/:code" element={<NeedAuth><OrderDetail /></NeedAuth>} />
          <Route path="/wallet" element={<NeedAuth><WalletPage /></NeedAuth>} />
          <Route path="/notifications" element={<NeedAuth><Notifications /></NeedAuth>} />
          <Route path="/profile" element={<NeedAuth><Profile /></NeedAuth>} />
          <Route path="/admin/*" element={<AdminApp />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </Suspense>
    </>
  );
}

function NeedAuth({ children }: { children: React.ReactNode }) {
  const { user } = useStore();
  const loc = window.location.pathname;
  if (!user) return <Navigate to={`/login?next=${encodeURIComponent(loc)}`} replace />;
  return <>{children}</>;
}
