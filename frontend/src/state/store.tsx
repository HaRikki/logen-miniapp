import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { api, getStoredToken, HttpError, storeToken, type User } from "../lib/api";
import { setupTelegramChrome, telegramAutoLogin, isTelegram } from "../lib/telegram";
import type { Lang } from "../i18n/dict";
import { tr, type TKey } from "../i18n/dict";

export interface Toast { id: number; kind: "success" | "error" | "info"; text: string }
export interface ConfirmState { title: string; body?: string; danger?: boolean; resolve: (v: boolean) => void }

interface Store {
  booting: boolean;
  user: User | null;
  refreshUser: () => Promise<void>;
  login: (u: User) => void;
  logout: () => Promise<void>;
  lang: Lang;
  setLang: (l: Lang) => void;
  t: (k: TKey) => string;
  toasts: Toast[];
  toast: (kind: Toast["kind"], text: string) => void;
  confirm: (title: string, body?: string, danger?: boolean) => Promise<boolean>;
  confirmState: ConfirmState | null;
  closeConfirm: (v: boolean) => void;
  inTelegram: boolean;
  money: (minor: number, currency?: string) => string;
}

const Ctx = createContext<Store>(null as unknown as Store);
export const useStore = () => useContext(Ctx);

export function StoreProvider({ children }: { children: React.ReactNode }) {
  const [booting, setBooting] = useState(true);
  const [user, setUser] = useState<User | null>(null);
  const [lang, setLangState] = useState<Lang>(() => (localStorage.getItem("ds_lang") as Lang) || "km");
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [confirmState, setConfirmState] = useState<ConfirmState | null>(null);
  const toastId = useRef(0);

  const t = useCallback((k: TKey) => tr(lang, k), [lang]);

  const money = useCallback((minor: number, currency = "USD") => {
    const v = (Number(minor) || 0) / 100;
    if (currency === "KHR") return `${v.toLocaleString("en-US", { maximumFractionDigits: 0 })} ៛`;
    return `$${v.toFixed(2)}`;
  }, []);

  const toast = useCallback((kind: Toast["kind"], text: string) => {
    const id = ++toastId.current;
    setToasts(ts => [...ts.slice(-3), { id, kind, text }]);
    setTimeout(() => setToasts(ts => ts.filter(x => x.id !== id)), 4200);
  }, []);

  const confirm = useCallback((title: string, body?: string, danger = false) =>
    new Promise<boolean>(resolve => setConfirmState({ title, body, danger, resolve })), []);
  const closeConfirm = useCallback((v: boolean) => {
    setConfirmState(c => { c?.resolve(v); return null; });
  }, []);

  const refreshUser = useCallback(async () => {
    try {
      const me = await api.get<{ user: User | null }>("/api/auth/me");
      setUser(me.user);
      if (me.user && (localStorage.getItem("ds_lang") === null)) setLangState((me.user.language === "en" ? "en" : "km"));
    } catch { setUser(null); }
  }, []);

  const setLang = useCallback((l: Lang) => {
    setLangState(l);
    try { localStorage.setItem("ds_lang", l); } catch { /* noop */ }
    if (user) void api.patch("/api/users/me", { language: l }).catch(() => { /* ignore */ });
  }, [user]);

  useEffect(() => {
    document.documentElement.lang = lang;
    document.documentElement.classList.toggle("lang-km", lang === "km");
  }, [lang]);

  useEffect(() => {
    let alive = true;
    (async () => {
      setupTelegramChrome();
      const auto = await telegramAutoLogin().catch((): null => null);
      if (!alive) return;
      if (auto && auto !== "telegram-fail") setUser(auto);
      else if (getStoredToken()) {
        try { const me = await api.get<{ user: User | null }>("/api/auth/me"); if (alive) setUser(me.user); } catch { storeToken(null); }
      }
      if (alive) setBooting(false);
    })();
    return () => { alive = false; };
  }, []);

  const login = useCallback((u: User) => setUser(u), []);

  const logout = useCallback(async () => {
    try { await api.post("/api/auth/logout"); } catch { /* still clear */ }
    storeToken(null);
    setUser(null);
  }, []);

  useEffect(() => { document.body.classList.toggle("tg-env", isTelegram()); }, []);

  const value = useMemo<Store>(() => ({
    booting, user, refreshUser, login, logout, lang, setLang, t, toasts, toast, confirm, confirmState, closeConfirm,
    inTelegram: isTelegram(), money
  }), [booting, user, refreshUser, login, logout, lang, setLang, t, toasts, toast, confirm, confirmState, closeConfirm, money]);

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function userFromAuth(res: { token?: string }): User | null { void res; return null; }
export { HttpError };
