import { Router } from "express";
import rateLimit from "express-rate-limit";
import { config, sessionCookieName } from "../config";
import { asyncHandler, badRequest, unauthorized } from "../common/errors";
import { verifyMiniAppInitData, verifyLoginWidget } from "../domain/telegram";
import { upsertTelegramUser, createSession, revokeSession, requireAuth, getUserPhotoUrlSafe } from "../domain/auth";
import { demoLogin } from "../domain/demo";

export const authRouter = Router();

const limiter = rateLimit({
  windowMs: config.rate.windowMs,
  limit: config.rate.authMax,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: { code: "RATE_LIMITED", message: "Too many login attempts, try again later" } }
});

function setSessionCookies(res: any, sess: { token: string; csrf: string; expiresAt: string }) {
  const opts = {
    httpOnly: true, sameSite: "lax" as const,
    secure: config.isProd, path: "/",
    expires: new Date(sess.expiresAt)
  };
  res.cookie(sessionCookieName(), sess.token, opts);
  // readable by frontend, used for double-submit CSRF
  res.cookie("ds_csrf", sess.csrf, { ...opts, httpOnly: false });
}

authRouter.post("/telegram", limiter, asyncHandler(async (req, res) => {
  const initData = String(req.body?.initData || "");
  if (!initData) throw badRequest("initData is required", "INIT_DATA_MISSING");
  const tgUser = verifyMiniAppInitData(initData);
  const userId = await upsertTelegramUser(tgUser, "MINI_APP");
  const sess = await createSession(userId, "TELEGRAM_MINI_APP", req.headers["user-agent"]);
  setSessionCookies(res, sess);
  res.json({ ok: true, token: sess.token, csrfToken: sess.csrf });
}));

authRouter.post("/telegram-web", limiter, asyncHandler(async (req, res) => {
  const payload = req.body || {};
  if (!payload.id || !payload.hash || !payload.auth_date) throw badRequest("Incomplete login payload", "PAYLOAD");
  const tgUser = verifyLoginWidget(payload);
  if (!tgUser.photoUrl) {
    tgUser.photoUrl = await getUserPhotoUrlSafe(tgUser.id);
  }
  const userId = await upsertTelegramUser(tgUser, "WEB_WIDGET");
  const sess = await createSession(userId, "TELEGRAM_WEB", req.headers["user-agent"]);
  setSessionCookies(res, sess);
  res.json({ ok: true, token: sess.token, csrfToken: sess.csrf });
}));

// Dev/demo only: never available in production builds.
authRouter.post("/demo", limiter, asyncHandler(async (req, res) => {
  if (!config.demoLogin) throw unauthorized("Demo login is disabled", "DEMO_DISABLED");
  const asAdmin = !!req.body?.asAdmin;
  const userId = await demoLogin(String(req.body?.name || "").slice(0, 40), asAdmin);
  if (!userId) throw unauthorized("Demo data not seeded", "NO_DEMO");
  const sess = await createSession(userId, "DEMO", req.headers["user-agent"]);
  setSessionCookies(res, sess);
  res.json({ ok: true, token: sess.token, csrfToken: sess.csrf });
}));

authRouter.get("/capabilities", asyncHandler(async (_req, res) => {
  res.json({
    telegramBotConfigured: !!config.telegram.botToken,
    demoLogin: config.demoLogin,
    env: config.env
  });
}));

authRouter.post("/logout", asyncHandler(async (req, res) => {
  const raw = req.cookies?.[sessionCookieName()] || (req.headers.authorization?.startsWith("Bearer ") ? req.headers.authorization.slice(7) : null);
  if (raw) await revokeSession(raw);
  res.clearCookie(sessionCookieName(), { path: "/" });
  res.clearCookie("ds_csrf", { path: "/" });
  res.json({ ok: true });
}));

authRouter.get("/me", asyncHandler(async (req, res) => {
  if (!req.user) { res.json({ user: null }); return; }
  const u = requireAuth(req);
  res.json({ user: publicUser(u) });
}));

export function publicUser(u: any) {
  return {
    id: u.id, telegramId: u.telegramId, displayName: u.displayName, username: u.username,
    photoUrl: u.photoUrl, language: u.language, isAdmin: u.isAdmin, adminRole: u.adminRole,
    adminPermissions: u.adminPermissions, balanceMinor: u.balanceMinor,
    notificationsEnabled: u.notificationsEnabled, createdAt: u.createdAt
  };
}
