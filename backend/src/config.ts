import path from "path";
import fs from "fs";
import dotenv from "dotenv";

// Load .env from project root (monorepo) then local override.
for (const p of [path.resolve(__dirname, "..", "..", ".env"), path.resolve(__dirname, "..", "..", "..", ".env")]) {
  if (fs.existsSync(p)) dotenv.config({ path: p });
}

function bool(v: string | undefined, d = false): boolean {
  if (v === undefined || v === "") return d;
  return ["1", "true", "yes", "on"].includes(v.toLowerCase());
}
function num(v: string | undefined, d: number): number {
  const n = Number(v);
  return Number.isFinite(n) ? n : d;
}

const isProd = process.env.NODE_ENV === "production";

export const config = {
  isProd,
  env: process.env.NODE_ENV || "development",
  port: num(process.env.PORT, 3000),
  appBaseUrl: (process.env.APP_BASE_URL || "http://localhost:3000").replace(/\/+$/, ""),
  sessionSecret: process.env.SESSION_SECRET || "dev-insecure-secret-change-me",
  sessionDays: 30,

  db: {
    client: (process.env.DB_CLIENT || "sqlite") as "sqlite" | "postgres",
    sqliteFile: process.env.SQLITE_FILE || "./data/digital-store.sqlite3",
    url: process.env.DATABASE_URL || ""
  },

  telegram: {
    botToken: process.env.TELEGRAM_BOT_TOKEN || "",
    maxAuthAgeSec: num(process.env.TELEGRAM_MAX_AUTH_AGE_SEC, 86400),
    adminUserIds: (process.env.ADMIN_TELEGRAM_USER_IDS || "")
      .split(",").map(s => s.trim()).filter(Boolean).map(Number).filter(n => Number.isFinite(n))
  },

  demoLogin: !isProd && bool(process.env.ALLOW_DEMO_LOGIN_IN_DEV, true),

  store: {
    name: process.env.STORE_NAME || "Digital Store",
    currency: process.env.DEFAULT_CURRENCY || "USD",
    timezone: process.env.TIMEZONE || "Asia/Phnom_Penh"
  },

  uploads: {
    dir: path.resolve(process.env.UPLOAD_DIR || "./data/uploads"),
    maxBytes: num(process.env.MAX_UPLOAD_MB, 15) * 1024 * 1024
  },

  deposits: {
    expiryHours: num(process.env.DEPOSIT_EXPIRY_HOURS, 24),
    webhookSecret: process.env.PAYMENT_WEBHOOK_SECRET || ""
  },

  rate: {
    windowMs: num(process.env.RATE_LIMIT_WINDOW_MS, 60_000),
    max: num(process.env.RATE_LIMIT_MAX, 300),
    authMax: num(process.env.AUTH_RATE_LIMIT_MAX, 20)
  },

  frontendDist: (() => {
    const candidates = [
      // src layout:  backend/src/config -> backend -> project root
      path.resolve(__dirname, "..", "..", "frontend", "dist"),
      // dist layout: backend/dist -> backend -> project root
      path.resolve(__dirname, "..", "..", "..", "frontend", "dist"),
      // cwd fallbacks
      path.resolve(process.cwd(), "frontend", "dist"),
      path.resolve(process.cwd(), "..", "frontend", "dist")
    ].filter(p => fs.existsSync(path.join(p, "index.html")));
    return candidates[0] || path.resolve(__dirname, "..", "..", "frontend", "dist");
  })()
};

export function sessionCookieName(): string {
  return isProd ? "__Host-ds_session" : "ds_session";
}
