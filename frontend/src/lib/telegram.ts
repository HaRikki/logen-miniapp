import { api, storeToken, type User } from "./api";

declare global {
  interface Window {
    Telegram?: any;
  }
}

export function getTelegram(): any {
  return typeof window !== "undefined" ? window.Telegram?.WebApp : undefined;
}

export function isTelegram(): boolean {
  const tg = getTelegram();
  const hasUser = !!tg?.initDataUnsafe?.user;
  const rawInit = typeof tg?.initData === "string" ? tg.initData : "";
  // SDK is loaded in every browser (script tag) — only treat as Mini App when
  // Telegram injected a real user/credential payload.
  return hasUser || rawInit.length > 24;
}

/** Expand to full height, sync theme accent & safe bottom inset. Keeps brand colors. */
export function setupTelegramChrome(): void {
  const tg = getTelegram();
  if (!tg) return;
  try {
    tg.ready();
    tg.expand();
    tg.setHeaderColor("#087FA5");
    if (tg.setBackgroundColor) tg.setBackgroundColor("#F4F9FC");
    if (tg.disableVerticalSwipes) tg.disableVerticalSwipes();
    const applyBottom = () => {
      const inset = tg.safeAreaInset?.bottom ?? 0;
      const edge = typeof tg.viewport?.stable_vertical_edge_bottom === "number"
        ? Math.max(0, (tg.viewport.height || 0) - tg.viewport.stable_vertical_edge_bottom) : 0;
      document.documentElement.style.setProperty("--tg-safe-bottom", `${Math.max(inset, edge)}px`);
    };
    applyBottom();
    tg.onEvent?.("viewportChanged", applyBottom);
  } catch {
    /* SDK unavailable in plain browser */
  }
}

/**
 * Auto-login inside Mini App with Telegram initData (verified server-side).
 * Returns user when a session exists (cookie set by /api/auth/telegram).
 */
export async function telegramAutoLogin(): Promise<User | "telegram-fail" | null> {
  const tg = getTelegram();
  try {
    if (tg?.initData && !isAuthenticatedLocal()) {
      await api.post("/api/auth/telegram", { initData: tg.initData });
    }
  } catch {
    return "telegram-fail";
  }
  try {
    const me = await api.get<{ user: User | null }>("/api/auth/me");
    return me.user || null;
  } catch {
    return null;
  }
}

function isAuthenticatedLocal(): boolean {
  // If a token exists we still try /me first; re-posting initData is cheap and idempotent.
  return false;
}

export function haptic(type: "light" | "medium" | "heavy" | "rigid" | "soft" = "light"): void {
  try {
    const tg = getTelegram();
    if (type === "rigid" || type === "soft") tg?.HapticFeedback?.selectionChanged?.();
    else tg?.HapticFeedback?.impactOccurred?.(type);
  } catch { /* noop */ }
}

export function shareUrl(title: string): void {
  const tg = getTelegram();
  const url = window.location.href;
  if (tg?.sendData) {
    try { tg.openTelegramLink(`https://t.me/share/url?url=${encodeURIComponent(url)}&text=${encodeURIComponent(title)}`); return; } catch { /* fall through */ }
  }
  if (navigator.share) { void navigator.share({ title, url }); return; }
  void navigator.clipboard?.writeText(url);
}

export function shareProduct(name: string, priceText: string, id: number): void {
  const url = `${window.location.origin}/product/${id}`;
  const tg = getTelegram();
  const text = `${name} — ${priceText}`;
  if (tg?.openTelegramLink) {
    try { tg.openTelegramLink(`https://t.me/share/url?url=${encodeURIComponent(url)}&text=${encodeURIComponent(text)}`); return; } catch { /* noop */ }
  }
  if (navigator.share) { void navigator.share({ title: name, text, url }); return; }
  void navigator.clipboard?.writeText(`${text} ${url}`);
}

export function webAppButtonLink(): string | null {
  const tg = getTelegram();
  return tg?.initDataUnsafe?.webAppVersion || null;
}

export { storeToken };
