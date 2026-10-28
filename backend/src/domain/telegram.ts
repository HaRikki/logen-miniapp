import crypto from "crypto";
import { config } from "../config";
import { badRequest } from "../common/errors";

/**
 * Telegram Mini App initData verification (HTTPS://core.telegram.org/bots/webapps#validating-data-received-via-the-mini-app)
 * secret_key = HMAC_SHA256(key="WebAppData", msg=BOT_TOKEN)
 * data_check_string = sorted "k=v" lines (excluding hash), joined with \n
 * hash = HMAC_SHA256(key=secret_key, msg=data_check_string)
 */
export interface TelegramUser {
  id: number;
  firstName?: string;
  lastName?: string;
  username?: string;
  photoUrl?: string; // not present in initData; may come from getUserProfilePhotos / web widget
  languageCode?: string;
  isPremium?: boolean;
}

function parseUrlSearchParams(initData: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const pair of initData.split("&")) {
    const idx = pair.indexOf("=");
    if (idx <= 0) continue;
    const k = pair.slice(0, idx);
    try { out[k] = decodeURIComponent(pair.slice(idx + 1).replace(/\+/g, " ")); } catch { out[k] = pair.slice(idx + 1); }
  }
  return out;
}

export function verifyMiniAppInitData(initData: string): TelegramUser {
  if (!config.telegram.botToken) throw badRequest("Telegram bot is not configured on the server", "BOT_NOT_CONFIGURED");
  if (!initData || initData.length < 32) throw badRequest("Missing initData", "INIT_DATA_MISSING");

  const data = parseUrlSearchParams(initData);
  const hash = data["hash"];
  if (!hash) throw badRequest("Missing hash in initData", "HASH_MISSING");
  const authDate = Number(data["auth_date"] || 0);
  if (!authDate) throw badRequest("Missing auth_date", "AUTH_DATE_MISSING");
  const ageSec = Math.floor(Date.now() / 1000) - authDate;
  if (ageSec > config.telegram.maxAuthAgeSec) throw badRequest("Login data expired, please reopen the app", "AUTH_DATE_EXPIRED");

  const checkString = Object.keys(data)
    .filter((k) => k !== "hash")
    .sort()
    .map((k) => `${k}=${data[k]}`)
    .join("\n");

  const secretKey = crypto.createHmac("sha256", Buffer.from("WebAppData", "utf-8")).update(config.telegram.botToken, "utf8").digest();
  const computed = crypto.createHmac("sha256", secretKey).update(checkString, "utf8").digest("hex");
  const expected = Buffer.from(hash, "utf-8");
  const actual = Buffer.from(computed, "utf-8");
  if (expected.length !== actual.length || !crypto.timingSafeEqual(actual, expected)) {
    throw badRequest("Telegram initData signature verification failed", "BAD_SIGN");
  }

  try {
    const u = JSON.parse(data["user"] || "{}");
    if (!u || typeof u.id !== "number") throw new Error("no user");
    return {
      id: u.id,
      firstName: u.first_name,
      lastName: u.last_name,
      username: u.username,
      languageCode: u.language_code,
      isPremium: !!u.premium
    };
  } catch {
    throw badRequest("initData.user missing/invalid", "USER_MISSING");
  }
}

/**
 * Telegram Login Widget (website) verification:
 * hash = SHA256(data_check_string) where secret key = SHA256(BOT_TOKEN) raw bytes,
 * data_check_string = "first_name=..\\nid=..\\nusername=..\\nauth_date=.." (fixed field order per docs)
 */
export function verifyLoginWidget(payload: {
  id: number | string; first_name?: string; last_name?: string; username?: string;
  photo_url?: string; auth_date: number | string; hash: string;
}): TelegramUser {
  if (!config.telegram.botToken) throw badRequest("Telegram bot is not configured on the server", "BOT_NOT_CONFIGURED");
  const { id, first_name = "", last_name = "", username = "", photo_url, auth_date, hash } = payload;
  const ageSec = Math.floor(Date.now() / 1000) - Number(auth_date);
  if (!Number.isFinite(ageSec) || ageSec > config.telegram.maxAuthAgeSec) {
    throw badRequest("Login data expired", "AUTH_DATE_EXPIRED");
  }
  const lines = [`id=${id}`, `first_name=${first_name}`, `last_name=${last_name}`, `username=${username}`, `auth_date=${auth_date}`]
    .filter((l) => !l.endsWith("="))
    .join("\n");
  const secret = crypto.createHash("sha256").update(config.telegram.botToken, "utf8").digest();
  const computed = crypto.createHmac("sha256", secret).update(lines, "utf8").digest("hex");
  if (!hash || computed.length !== hash.length || !crypto.timingSafeEqual(Buffer.from(computed), Buffer.from(hash))) {
    throw badRequest("Telegram login widget signature invalid", "BAD_SIGN");
  }
  return { id: Number(id), firstName: first_name || "Telegram user", lastName: last_name, username: username || undefined, photoUrl: photo_url };
}

function apiBase(): string {
  return `https://api.telegram.org/bot${config.telegram.botToken}`;
}

/** Best-effort notification send; NEVER throws — order flow must not fail because of Telegram. */
export async function sendTelegramMessage(chatId: number, text: string): Promise<{ ok: boolean; error?: string }> {
  if (!config.telegram.botToken) return { ok: false, error: "NO_BOT_TOKEN" };
  try {
    const res = await fetch(`${apiBase()}/sendMessage`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ chat_id: chatId, text, disable_web_page_preview: true }),
      signal: AbortSignal.timeout(8000)
    });
    const json: any = await res.json().catch(() => ({}));
    if (!res.ok || !json.ok) return { ok: false, error: json?.description || `HTTP ${res.status}` };
    return { ok: true };
  } catch (e: any) {
    return { ok: false, error: e?.message || "NETWORK" };
  }
}

/** Fetch a printable profile photo URL for a user (used after login). */
export async function getUserPhotoUrl(userId: number): Promise<string | undefined> {
  if (!config.telegram.botToken) return undefined;
  try {
    const res = await fetch(`${apiBase()}/getUserProfilePhotos`, {
      method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({ user_id: userId, limit: 1 }),
      signal: AbortSignal.timeout(8000)
    });
    const json: any = await res.json();
    const fileId = json?.result?.photos?.[0]?.pop?.();
    if (!fileId) return undefined;
    const f = await fetch(`${apiBase()}/getFile`, {
      method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({ file_id: fileId }), signal: AbortSignal.timeout(8000)
    });
    const fj: any = await f.json();
    return fj?.result?.file_path ? `https://api.telegram.org/file/bot${config.telegram.botToken}/${fj.result.file_path}` : undefined;
  } catch {
    return undefined;
  }
}
