export interface ApiError { code: string; message: string; status: number; details?: any }

const TOKEN_KEY = "ds_session_token";

export function getStoredToken(): string | null {
  try { return localStorage.getItem(TOKEN_KEY); } catch { return null; }
}
export function storeToken(t: string | null): void {
  try { if (t) localStorage.setItem(TOKEN_KEY, t); else localStorage.removeItem(TOKEN_KEY); } catch { /* private mode */ }
}

function getCookie(name: string): string | null {
  const m = document.cookie.match(new RegExp(`(^|; )${name}=([^;]*)`));
  return m ? decodeURIComponent(m[2]) : null;
}

export class HttpError extends Error {
  code: string;
  status: number;
  details?: any;
  constructor(e: ApiError) { super(e.message); this.code = e.code; this.status = e.status; this.details = e.details; }
}

async function call<T>(path: string, opts: RequestInit & { form?: FormData } = {}, retry = true): Promise<T> {
  const headers: Record<string, string> = { ...(opts.headers as Record<string, string>) };
  const isForm = !!opts.form || typeof opts.body === "string" || !opts.body;
  if (typeof opts.body === "string" || opts.form) delete headers["content-type"];
  if (typeof opts.body === "string") headers["content-type"] = "application/json";
  const token = getStoredToken();
  if (token) headers["Authorization"] = `Bearer ${token}`;
  if (!["GET", "HEAD"].includes(opts.method || "GET")) {
    const csrf = getCookie("ds_csrf");
    if (csrf) headers["x-csrf-token"] = csrf;
  }
  const res = await fetch(path, {
    ...opts,
    headers,
    body: opts.form ?? (typeof opts.body === "string" ? opts.body : undefined),
    credentials: "include"
  });
  let json: any = null;
  const ct = res.headers.get("content-type") || "";
  if (ct.includes("application/json")) json = await res.json().catch((): any => null);
  if (res.ok) return (json ?? {}) as T;
  if (res.status === 401 && retry && token) {
    storeToken(null);
    return call<T>(path, opts, false);
  }
  const err = json?.error || { code: "HTTP_" + res.status, message: "Request failed" };
  throw new HttpError({ ...err, status: res.status });
}

export const api = {
  get: <T,>(path: string) => call<T>(path),
  post: <T,>(path: string, body?: unknown) => call<T>(path, { method: "POST", body: JSON.stringify(body ?? {}) }),
  put: <T,>(path: string, body?: unknown) => call<T>(path, { method: "PUT", body: JSON.stringify(body ?? {}) }),
  patch: <T,>(path: string, body?: unknown) => call<T>(path, { method: "PATCH", body: JSON.stringify(body ?? {}) }),
  del: <T,>(path: string) => call<T>(path, { method: "DELETE" }),
  upload: <T,>(path: string, form: FormData) => call<T>(path, { method: "POST", form })
};

// ---------- domain types ----------
export interface User {
  id: number; telegramId: number; displayName: string; username: string | null;
  photoUrl: string | null; language: string; isAdmin: boolean; adminRole: string | null;
  adminPermissions: string[] | null; balanceMinor: number; notificationsEnabled: boolean; createdAt: string | null;
}
export interface Variant { id: number; name: string; durationLabel?: string | null; priceMinor: number; costMinor: number; compareAtMinor: number; stock: number }
export interface Product {
  id: number; code: string; name: string; description?: string; instructions?: string; coverUrl?: string | null;
  categoryId: number | null; categoryName: string | null; priceMinor: number; costMinor: number; durationLabel: string | null;
  deliveryType: "AUTO" | "MANUAL"; status: string; stockMode: string; isFeatured: boolean; isOffer: boolean;
  salesCount: number; viewCount: number; stockAvailable: number; variants: Variant[]; createdAt: string | null;
}
export interface Category { id: number; nameKm: string; nameEn: string; slug: string; icon: string | null; iconUrl?: string | null; sortOrder: number; isActive: number | boolean; productCount?: number }
export interface Banner { id: number; title: string; subtitle: string | null; imageUrl: string; linkUrl: string | null; sortOrder: number }
export interface OrderItem {
  id: number; productId: number | null; variantId: number | null; productName: string; variantName: string | null;
  quantity: number; unitPriceMinor: number; deliveryType: "AUTO" | "MANUAL"; deliveryStatus: string; deliveryError: string | null;
}
export interface Delivery {
  id: number; orderItemId: number; kind: "AUTO" | "MANUAL"; status: string; contentText: string | null;
  secret: string | null; hasFile: boolean; fileName: string | null; downloadUrl: string | null;
  deliveredBy: number | null; deliveredByBot: boolean; attemptedAt: string | null; attemptCount: number;
}
export interface OrderView {
  id: number; code: string; status: string; currency: string; userId: number; userTelegramId: number | null;
  userName: string | null; itemsTotalMinor: number; discountMinor: number; totalMinor: number;
  deliveryAccount: string | null; customerNote: string | null; failureReason: string | null;
  createdAt: string; updatedAt: string | null; items: OrderItem[]; deliveries: Delivery[];
  history: { from: string | null; to: string; actorRole: string; changedBy: number | null; reason: string | null; at: string | null }[];
}
export interface WalletInfo { balanceMinor: number; currency: string; lifetimeTopupMinor: number; lifetimeSpendMinor: number }
export interface WalletTxn {
  id: number; ref: string; type: string; amountMinor: number; balanceAfterMinor: number;
  orderId?: number | null; createdAt?: string; userName?: string; userId?: number;
}
export interface Deposit {
  id: number; code: string; providerCode: string; amountMinor: number; currency: string; status: string;
  txnRef: string | null; createdAt: string; userName?: string; telegramId?: number; reviewedAt?: string | null; adminNote?: string | null;
}
export interface PaymentMethod {
  id: number; code: string; name: string; mode: string; accountName?: string; accountNumber?: string;
  qrUrl?: string | null; instructions?: string | null; minMinor: number; maxMinor: number; currency: string; isActive: number | boolean; sortOrder: number;
}
