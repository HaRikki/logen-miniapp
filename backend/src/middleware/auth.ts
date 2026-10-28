import { Request, Response, NextFunction } from "express";
import cookieParser from "cookie-parser";
import { config, sessionCookieName } from "../config";
import { getSessionUser, SessionUser } from "../domain/auth";
import { AppError, forbidden } from "../common/errors";

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      user?: SessionUser;
      sessionToken?: string;
    }
  }
}

export function cookies() { return cookieParser(); }

/** Resolve session from cookie or Bearer header (either transport, same backend checks). */
export async function authOptional(req: Request, _res: Response, next: NextFunction) {
  try {
    let raw: string | undefined = req.cookies?.[sessionCookieName()];
    const bearer = req.headers.authorization;
    if (!raw && bearer?.startsWith("Bearer ")) raw = bearer.slice(7);
    if (raw) {
      const u = await getSessionUser(raw);
      if (u) { req.user = u; req.sessionToken = raw; }
    }
    next();
  } catch (e) { next(e); }
}

/**
 * CSRF guard for cookie-authenticated state changes (double submit pattern +
 * same-origin check). Bearer-token clients (native/API) are exempt because the
 * token is not ambient.
 */
export function csrfGuard(req: Request, res: Response, next: NextFunction) {
  const usingCookie = !!req.cookies?.[sessionCookieName()] && !req.headers.authorization;
  if (usingCookie && !["GET", "HEAD", "OPTIONS"].includes(req.method)) {
    const origin = req.headers.origin;
    if (origin) {
      try {
        const allowed = new Set([config.appBaseUrl, `https://${req.headers.host}`, `http://${req.headers.host}`]);
        if (!allowed.has(new URL(origin).origin)) throw forbidden("Cross-origin request blocked", "CSRF_ORIGIN");
      } catch (e) { return next(e instanceof AppError ? e : forbidden("Bad origin", "CSRF_ORIGIN")); }
    }
    const header = req.headers["x-csrf-token"];
    const cookie = req.cookies?.["ds_csrf"];
    if (!header || !cookie || String(header) !== String(cookie)) {
      return next(forbidden("Missing or invalid CSRF token", "CSRF_TOKEN"));
    }
  }
  next();
}

/** Minimal body sanitizer for stored strings: strips control chars, caps length. */
export function cleanStr(v: unknown, max = 2000): string {
  return String(v ?? "").replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, "").trim().slice(0, max);
}
