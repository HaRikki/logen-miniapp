import express from "express";
import path from "path";
import fs from "fs";
import { config } from "./config";
import { cookies, authOptional, csrfGuard } from "./middleware/auth";
import { AppError } from "./common/errors";
import { authRouter } from "./routes/auth";
import { shopRouter } from "./routes/shop";
import { userRouter } from "./routes/user";
import { webhookRouter } from "./routes/webhooks";
import { adminCatalogRouter } from "./routes/admin/catalog";
import { adminUsersRouter } from "./routes/admin/users";
import { adminOrdersRouter } from "./routes/admin/orders";
import { adminPaymentsRouter, adminPromotionsRouter, adminSettingsRouter } from "./routes/admin/payments";
import { adminDashboardRouter } from "./routes/admin/dashboard";
import { isMaintenanceMode } from "./services/settings";

export function createApp() {
  const app = express();
  app.disable("x-powered-by");
  app.set("trust proxy", 1);

  // ---- security headers (kept dependency-free; add helmet in hardening phase) ----
  app.use((req, res, next) => {
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.setHeader("X-Frame-Options", "DENY");
    res.setHeader("Referrer-Policy", "strict-origin-when-cross-origin");
    res.setHeader("Permissions-Policy", "camera=(), microphone=(), geolocation=()");
    res.setHeader(
      "Content-Security-Policy",
      "default-src 'self'; img-src 'self' data: https:; script-src 'self' https://telegram.org https://oauth.telegram.org; " +
      "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src 'self' https://fonts.gstatic.com; " +
      "connect-src 'self'; frame-ancestors 'self' https://web.telegram.org; object-src 'none'; base-uri 'self';"
    );
    next();
  });

  // CORS: same-origin by default (frontend served from backend); allow explicitly listed origins.
  const allowOrigins = new Set((process.env.ALLOWED_ORIGINS || "").split(",").map(s => s.trim()).filter(Boolean));
  app.use((req, res, next) => {
    const origin = req.headers.origin;
    if (origin && (allowOrigins.has(origin) || origin === config.appBaseUrl)) {
      res.setHeader("Access-Control-Allow-Origin", origin);
      res.setHeader("Vary", "Origin");
      res.setHeader("Access-Control-Allow-Credentials", "true");
      res.setHeader("Access-Control-Allow-Headers", "content-type, authorization, x-csrf-token, idempotency-key");
      res.setHeader("Access-Control-Allow-Methods", "GET,POST,PUT,PATCH,DELETE,OPTIONS");
    }
    if (req.method === "OPTIONS") { res.sendStatus(204); return; }
    next();
  });

  // webhooks need the RAW body for signature verification -> parsed before global JSON parser
  app.use("/api/payments/webhook", express.raw({ type: "*/*", limit: "200kb" }));

  app.use(express.json({ limit: "100kb" }));
  app.use(cookies());
  app.use(authOptional);

  // public uploads (product images / banner images only)
  app.use("/uploads", express.static(config.uploads.dir, {
    maxAge: "7d",
    setHeaders: (res, p) => {
      if (!/\.(png|jpe?g|webp|gif|svg)$/i.test(p)) res.setHeader("Content-Disposition", "attachment");
    }
  }));

  // webhooks get the RAW body (before json parsing) for signature verification
  app.use("/api", webhookRouter);

  app.use("/api", csrfGuard);

  const rl = require("express-rate-limit").default;
  app.use("/api", rl({
    windowMs: config.rate.windowMs, limit: config.rate.max, standardHeaders: true, legacyHeaders: false,
    keyGenerator: (req: any) => req.user?.id ? `u${req.user.id}` : req.ip || "anon"
  }));

  // maintenance gate for non-admin write traffic (must run BEFORE routers)
  app.use("/api", async (req, res, next) => {
    try {
      if (["GET", "HEAD", "OPTIONS"].includes(req.method)) return next();
      if (req.path.startsWith("/api/auth") || req.path.startsWith("/api/admin") || req.path.includes("webhook")) return next();
      if (req.user?.isAdmin) return next();
      if (await isMaintenanceMode()) {
        res.status(503).json({ error: { code: "MAINTENANCE", message: "Store is under maintenance. Please check back soon." } });
        return;
      }
      next();
    } catch (e) { next(e); }
  });

  // API routes
  app.use("/api/auth", authRouter);
  app.use("/api", shopRouter);            // /api/config /home /categories /products /notifications /users/me ...
  app.use("/api", userRouter);           // /api/orders /api/wallet /api/deposits /api/payment-methods /api/files ...
  app.use("/api/admin", adminDashboardRouter);
  app.use("/api/admin", adminCatalogRouter);
  app.use("/api/admin", adminUsersRouter);
  app.use("/api/admin", adminOrdersRouter);
  app.use("/api/admin", adminPaymentsRouter);
  app.use("/api/admin/promotions", adminPromotionsRouter);
  app.use("/api/admin", adminSettingsRouter);

  app.get("/api/health", (_req, res) => res.json({ ok: true, ts: Date.now() }));
  app.get("/api/admin/permissions", (_req, res) => {
    res.json({ permissions: require("./domain/auth").ADMIN_PERMS });
  });

  // unknown API -> JSON 404
  app.use("/api", (_req, res) => res.status(404).json({ error: { code: "NOT_FOUND", message: "Unknown endpoint" } }));

  // ---- SPA static serving (production build) ----
  if (fs.existsSync(config.frontendDist)) {
    app.use(express.static(config.frontendDist, { index: false }));
    app.get(/^(?!\/api|\/uploads).*/, (_req, res) => {
      res.sendFile(path.join(config.frontendDist, "index.html"));
    });
  } else {
    app.get("/", (_req, res) => res.status(200).send(
      "<div style='font-family:system-ui;padding:40px;color:#163547'><h2>Digital Store API running</h2><p>Frontend not built yet. Run <code>npm run build -w frontend</code> (or the dev server on Vite).</p></div>"
    ));
  }

  // ---- error handler ----
  app.use((err: any, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
    if (res.headersSent) return;
    if (err instanceof AppError) {
      const body: any = { error: { code: err.code, message: err.message } };
      if (err.details !== undefined && process.env.NODE_ENV !== "production") body.error.details = err.details;
      else if (err.details !== undefined && (err.code === "INSUFFICIENT_BALANCE")) body.error.details = err.details;
      res.status(err.status).json(body);
      return;
    }
    if (err?.type === "entity.too.large") {
      res.status(413).json({ error: { code: "TOO_LARGE", message: "Request body too large" } });
      return;
    }
    if (err?.code === "LIMIT_FILE_SIZE" || err?.code === "LIMIT_UNEXPECTED_FILE") {
      res.status(413).json({ error: { code: err.code, message: "File too large or unexpected field" } });
      return;
    }
    console.error("[unhandled]", err);
    res.status(500).json({ error: { code: "INTERNAL", message: "Unexpected server error" } });
  });

  return app;
}
