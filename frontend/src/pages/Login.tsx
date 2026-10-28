import React, { useEffect, useRef, useState } from "react";
import { Navigate, useSearchParams } from "react-router-dom";
import { ArrowLeftRight, Bot, Crown, Send, ShieldCheck, User } from "lucide-react";
import { api, storeToken, type User as UserT } from "../lib/api";
import { useStore } from "../state/store";
import { Button, Card } from "../components/ui";
import { isTelegram } from "../lib/telegram";

declare global { interface Window { TelegramLoginWidget?: any } }

export default function Login() {
  const { user, login, refreshUser, t, lang, toast } = useStore();
  const [caps, setCaps] = useState<{ telegramBotConfigured: boolean; demoLogin: boolean } | null>(null);
  const [botUsername, setBotUsername] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const widgetRef = useRef<HTMLDivElement>(null);
  const [params] = useSearchParams();

  useEffect(() => {
    (async () => {
      try {
        const [c, cfg] = await Promise.all([
          api.get<{ telegramBotConfigured: boolean; demoLogin: boolean }>("/api/auth/capabilities"),
          api.get<{ telegramBotUsername: string | null }>("/api/config")
        ]);
        setCaps(c); setBotUsername(cfg.telegramBotUsername || null);
      } catch { setCaps({ telegramBotConfigured: false, demoLogin: false }); }
    })();
  }, []);

  // Telegram Web Login Widget (official embed). Loads the widget script once,
  // then renders the declarative button for the configured bot.
  useEffect(() => {
    if (!caps?.telegramBotConfigured || isTelegram() || !botUsername) return;
    const render = () => {
      const holder = widgetRef.current;
      if (!holder) return;
      holder.innerHTML = "";
      const script = document.createElement("script");
      script.src = "https://telegram.org/js/telegram-widget.js?22";
      script.setAttribute("data-telegram-login", (botUsername || "").replace("@", ""));
      script.setAttribute("data-size", "large");
      script.setAttribute("data-radius", "14");
      script.setAttribute("data-request_access", "photo");
      script.setAttribute("data-userpic", "true");
      script.setAttribute("data-onauth", "dsTelegramLogin(token)");
      holder.appendChild(script);
      window.TelegramLoginWidget?.render?.();
    };
    if (document.querySelector('script[src*="telegram-widget"]')) { render(); return; }
    const s = document.createElement("script");
    s.src = "https://telegram.org/js/telegram-widget.js?22";
    s.async = true;
    s.onload = render;
    document.head.appendChild(s);
  }, [caps, botUsername]);

  useEffect(() => {
    (window as any).dsTelegramLogin = async (token: any) => {
      try {
        const res = await api.post<{ ok: boolean; token?: string }>("/api/auth/telegram-web", token);
        if (res.token) storeToken(res.token);
        await refreshUser();
      } catch (e: any) { toast("error", e?.message || "Telegram login failed"); }
    };
  }, [refreshUser, toast]);

  async function demo(asAdmin: boolean) {
    setBusy(true);
    try {
      const res = await api.post<{ ok: boolean; token: string }>("/api/auth/demo", { asAdmin });
      storeToken(res.token);
      await refreshUser();
      const me = await api.get<{ user: UserT | null }>("/api/auth/me");
      if (me.user) login(me.user);
    } catch (e: any) {
      toast("error", e?.message || "login failed");
    } finally { setBusy(false); }
  }

  if (user) {
    const next = params.get("next");
    return <Navigate to={next && next.startsWith("/") ? next : user.isAdmin && next === "/admin" ? "/admin" : "/"} replace />;
  }

  return (
    <div className="app-shell flex min-h-dvh items-center justify-center bg-gradient-to-b from-primary/10 via-canvas to-canvas px-5">
      <div className="w-full max-w-sm animate-fadeUp">
        <div className="mb-8 text-center">
          <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-3xl bg-primary font-display text-2xl font-bold text-white shadow-pop">DS</div>
          <h1 className="font-display text-2xl font-bold text-ink">{t("signInTitle")}</h1>
          <p className="mt-2 text-sm leading-6 text-ink-soft">{t("signInSub")}</p>
        </div>

        <Card className="space-y-3 p-5">
          {isTelegram() ? (
            <p className="text-center text-sm text-ink-soft">Sign-in via Telegram is in progress…</p>
          ) : (
            <>
              {caps?.telegramBotConfigured && botUsername ? (
                <div ref={widgetRef} className="flex justify-center py-1" />
              ) : (
                <div className="flex items-center gap-2 rounded-xl bg-primary-light/70 px-3 py-2.5 text-[13px] text-primary-dark">
                  <Bot size={16} className="shrink-0" />
                  Telegram login activates automatically once <b>&nbsp;TELEGRAM_BOT_TOKEN</b> &amp; bot username are configured.
                </div>
              )}
              {caps?.demoLogin ? (
                <div className="space-y-2 pt-1">
                  <Button className="w-full" icon={User} loading={busy} onClick={() => demo(false)}>{t("demoUser")}</Button>
                  <Button variant="outline" className="w-full" icon={adminIcon} loading={busy} onClick={() => demo(true)}>{t("demoAdmin")}</Button>
                </div>
              ) : null}
            </>
          )}
        </Card>

        <div className="mt-6 flex items-center justify-center gap-4 text-xs text-ink-faint">
          <span className="flex items-center gap-1"><Send size={12} /> Mini App ready</span>
          <span className="flex items-center gap-1"><ArrowLeftRight size={12} /> {lang === "km" ? "ខ្មែរ / English" : "English / ខ្មែរ"}</span>
        </div>
      </div>
    </div>
  );
}

function adminIcon(p: { size?: number }) { return <Crown size={p.size} />; }
void ShieldCheck;
