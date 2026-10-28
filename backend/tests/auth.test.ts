import { describe, it, expect } from "vitest";
import { app, request, loginAs, nextTg, json, buildInitData, seedProduct } from "./helpers";
import { db, toDbTime } from "../src/db";
import { config } from "../src/config";

describe("Telegram authentication", () => {
  it("accepts correctly-signed initData and creates the user + session", async () => {
    const tg = nextTg();
    const initData = buildInitData(config.telegram.botToken, { id: tg, first_name: "Mara", username: "mara_test" });
    const res = await request(app).post("/api/auth/telegram").send({ initData });
    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
    expect(res.body.token).toBeTruthy();

    const me = await request(app).get("/api/auth/me").set("Authorization", `Bearer ${res.body.token}`);
    expect(me.status).toBe(200);
    expect(me.body.user.telegramId).toBe(tg);
    expect(me.body.user.displayName).toContain("Mara");
    // wallet was auto-created
    const w = await db()("wallets").where({ user_id: me.body.user.id }).first();
    expect(w).toBeTruthy();
    expect(Number(w.balance_minor)).toBe(0);
  });

  it("rejects tampered initData", async () => {
    const tg = nextTg();
    const initData = buildInitData(config.telegram.botToken, { id: tg }, Math.floor(Date.now() / 1000));
    const parts = initData.split("&").map(p => (p.startsWith("user=") ? "user=" + encodeURIComponent(JSON.stringify({ id: tg + 4242424, first_name: "Evil" })) : p));
    const res = await request(app).post("/api/auth/telegram").send({ initData: parts.join("&") });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe("BAD_SIGN");
  });

  it("rejects expired auth_date", async () => {
    const old = Math.floor(Date.now() / 1000) - 999 * 86400;
    const initData = buildInitData(config.telegram.botToken, { id: nextTg() }, old);
    const res = await request(app).post("/api/auth/telegram").send({ initData });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe("AUTH_DATE_EXPIRED");
  });

  it("me returns null without a session", async () => {
    const res = await request(app).get("/api/auth/me");
    expect(res.status).toBe(200);
    expect(res.body.user).toBeNull();
  });

  it("blocks suspended users at session check", async () => {
    const a = await loginAs(nextTg());
    await db()("users").where({ id: a.userId }).update({ is_active: 0 });
    const res = await request(app).get("/api/wallet").set("Authorization", `Bearer ${a.token}`);
    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe("ACCOUNT_DISABLED");
  });
});

describe("Session + CSRF", () => {
  it("cookie-authenticated state change requires matching CSRF header", async () => {
    const a = await loginAs(nextTg());
    const createBody = { items: [] };
    // cookie session present but no CSRF header -> 403
    const r2 = await request(app).post("/api/orders")
      .set("Cookie", [`ds_session=${a.token}`, `ds_csrf=${a.csrf}`]).set(json).send(createBody);
    expect(r2.status).toBe(403);
    expect(r2.body.error.code).toBe("CSRF_TOKEN");

    // with CSRF header it passes the guard and hits business validation
    const r3 = await request(app).post("/api/orders")
      .set("Cookie", [`ds_session=${a.token}`, `ds_csrf=${a.csrf}`])
      .set("x-csrf-token", a.csrf).set(json).send(createBody);
    expect(r3.status).toBe(400); // passed CSRF, failed validation (empty items)
    expect(r3.body.error.code).toBe("EMPTY_ORDER");
  });

  it("logout revokes the session", async () => {
    const a = await loginAs(nextTg());
    await request(app).post("/api/auth/logout").set("Authorization", `Bearer ${a.token}`);
    const me = await request(app).get("/api/auth/me").set("Authorization", `Bearer ${a.token}`);
    expect(me.body.user).toBeNull();
    // second: 401 on protected
    const w = await request(app).get("/api/wallet").set("Authorization", `Bearer ${a.token}`);
    expect(w.status).toBe(401);
  });
});

describe("Catalog access rules", () => {
  it("only lists ACTIVE products and excludes INACTIVE from public API", async () => {
    const { seedProduct } = await import("./helpers");
    const active = await seedProduct({ name: "VisibleProduct", active: true });
    const hidden = await seedProduct({ name: "HiddenProduct", active: false });
    const res = await request(app).get("/api/products?limit=100&q=Product");
    const names = res.body.items.map((p: any) => p.name);
    expect(names).toContain("VisibleProduct");
    expect(names).not.toContain("HiddenProduct");
    expect(active.id && hidden.id).toBeTruthy();
  });

  it("product detail 404s for INACTIVE", async () => {
    const hidden = await seedProduct({ name: "Gone", active: false });
    const res = await request(app).get(`/api/products/${hidden.id}`);
    expect(res.status).toBe(404);
  });

  it("home payload contains all storefront sections", async () => {
    const res = await request(app).get("/api/home");
    expect(res.status).toBe(200);
    for (const key of ["featured", "newest", "popular", "offers", "categories", "banners", "recentlyViewed"]) {
      expect(Array.isArray(res.body[key])).toBe(true);
    }
    expect(res.body.categories.length).toBeGreaterThan(0);
  });

  it("recently viewed records views only for authenticated users, then appears on home", async () => {
    const prod = await seedProduct({ name: "Watched" });
    const a = await loginAs(nextTg());
    await request(app).get(`/api/products/${prod.id}`).set("Authorization", `Bearer ${a.token}`);
    const home = await request(app).get("/api/home").set("Authorization", `Bearer ${a.token}`);
    expect(home.body.recentlyViewed.map((p: any) => p.name)).toContain("Watched");
  });
});

void toDbTime;
