import { describe, it, expect } from "vitest";
import { app, request, loginAs, nextTg, json, bearer, makeAdmin } from "./helpers";
import { db } from "../src/db";

describe("Admin RBAC", () => {
  it("regular users cannot reach any admin endpoint", async () => {
    const a = await loginAs(nextTg());
    for (const path of ["/api/admin/dashboard", "/api/admin/users", "/api/admin/orders", "/api/admin/settings/store", "/api/admin/audit-logs"]) {
      const res = await request(app).get(path).set(bearer(a));
      expect(res.status, path).toBe(403);
    }
  });

  it("anonymous cannot reach admin endpoints", async () => {
    const res = await request(app).get("/api/admin/dashboard");
    expect(res.status).toBe(401);
  });

  it("STAFF with limited permissions is blocked from settings but allowed products", async () => {
    const staff = await loginAs(nextTg());
    await makeAdmin(staff);
    await db()("admin_users").where({ user_id: staff.userId }).update({ role: "STAFF", permissions: JSON.stringify(["products", "orders"]) });

    const settings = await request(app).get("/api/admin/settings/store").set(bearer(staff));
    expect(settings.status).toBe(403);
    const products = await request(app).get("/api/admin/products").set(bearer(staff));
    expect(products.status).toBe(200);
    const depositApprove = await request(app).post("/api/admin/deposits/999999/approve").set(bearer(staff)).set(json).send({});
    expect(depositApprove.status).toBe(403);
  });

  it("product CRUD + validation + audit trail + deleting a sold product is a soft delete", async () => {
    const admin = await loginAs(nextTg());
    await makeAdmin(admin);

    const bad = await request(app).post("/api/admin/products").set(bearer(admin)).set(json).send({ name: "" });
    expect(bad.status).toBe(400);

    const created = await request(app).post("/api/admin/products").set(bearer(admin)).set(json)
      .send({ name: "Admin Created", priceMinor: 1234, costMinor: 500, deliveryType: "AUTO", stockMode: "KEY_POOL" });
    expect(created.status).toBe(201);
    const pid = created.body.id;

    const upd = await request(app).put(`/api/admin/products/${pid}`).set(bearer(admin)).set(json)
      .send({ priceMinor: 1999, isFeatured: true });
    expect(upd.status).toBe(200);
    const p = await db()("products").where({ id: pid }).first();
    expect(Number(p.price_minor)).toBe(1999);
    expect(Number(p.is_featured)).toBe(1);

    // add keys, buy one, then request delete -> soft delete keeps history
    await request(app).post("/api/admin/inventory/bulk").set(bearer(admin)).set(json)
      .send({ productId: pid, itemType: "KEY", values: ["AAAA-BBBB-CCCC-DDDD"] });
    const buyer = await loginAs(nextTg());
    const { credit } = await import("./helpers");
    await credit(buyer.userId, 5000);
    const ord = await request(app).post("/api/orders").set(bearer(buyer)).set(json).send({ items: [{ productId: pid, quantity: 1 }] });
    await request(app).post(`/api/orders/${ord.body.order.code}/pay`).set(bearer(buyer));

    const del = await request(app).delete(`/api/admin/products/${pid}`).set(bearer(admin));
    expect(del.status).toBe(200);
    expect(del.body.softDeleted).toBe(true);
    const after = await db()("products").where({ id: pid }).first();
    expect(after.status).toBe("INACTIVE");

    const logs = await db()("audit_logs").where({ entity_type: "product", entity_id: String(pid) }).whereIn("action", ["PRODUCT_CREATE", "PRODUCT_UPDATE", "PRODUCT_SOFT_DELETE"]);
    expect(logs.length).toBe(3);
  });

  it("category delete is blocked while products reference it", async () => {
    const admin = await loginAs(nextTg());
    await makeAdmin(admin);
    const cat = await request(app).post("/api/admin/categories").set(bearer(admin)).set(json)
      .send({ nameKm: "ថ្មី", nameEn: "fresh-cat", slug: "fresh-cat-test" });
    expect(cat.status).toBe(201);
    const prod = await request(app).post("/api/admin/products").set(bearer(admin)).set(json)
      .send({ name: "InCat", priceMinor: 100, categoryId: cat.body.id });
    expect(prod.status).toBe(201);
    const del = await request(app).delete(`/api/admin/categories/${cat.body.id}`).set(bearer(admin));
    expect(del.status).toBe(409);
    // move product out then delete works
    await request(app).put(`/api/admin/products/${prod.body.id}`).set(bearer(admin)).set(json).send({ categoryId: null });
    const del2 = await request(app).delete(`/api/admin/categories/${cat.body.id}`).set(bearer(admin));
    expect(del2.status).toBe(200);
  });

  it("maintenance mode blocks user writes but not admins; admins see banner CRUD", async () => {
    const admin = await loginAs(nextTg());
    await makeAdmin(admin);
    const user = await loginAs(nextTg());
    await request(app).put("/api/admin/settings/store").set(bearer(admin)).set(json).send({ settings: { maintenanceMode: true } });
    const blocked = await request(app).post("/api/orders").set(bearer(user)).set(json).send({ items: [] });
    expect(blocked.status).toBe(503);
    const allowedAdmin = await request(app).post("/api/admin/categories").set(bearer(admin)).set(json).send({ nameKm: "x", nameEn: "maint-test", slug: "maint-test-x" });
    expect(allowedAdmin.status).toBe(201);
    await request(app).put("/api/admin/settings/store").set(bearer(admin)).set(json).send({ settings: { maintenanceMode: false } });
    const ok = await request(app).post("/api/orders").set(bearer(user)).set(json).send({ items: [] });
    expect(ok.status).toBe(400);
  });
});
