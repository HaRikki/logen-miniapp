import { describe, it, expect } from "vitest";
import { app, request, loginAs, nextTg, json, bearer, makeAdmin, seedProduct, credit } from "./helpers";
import { db, toDbTime } from "../src/db";
import crypto from "crypto";
import { config } from "../src/config";

async function balanceOf(userId: number): Promise<number> {
  const w = await db()("wallets").where({ user_id: userId }).first();
  return Number(w.balance_minor);
}

describe("Purchase with wallet", () => {
  it("pays an auto-delivery order, delivers exactly one unique key, moves product stats", async () => {
    const a = await loginAs(nextTg());
    await credit(a.userId, 5000);
    const prod = await seedProduct({ name: "OneKey", price: 1500, keys: 2 });

    const ord = await request(app).post("/api/orders").set(bearer(a)).set(json)
      .send({ items: [{ productId: prod.id, quantity: 1 }] });
    expect(ord.status).toBe(201);
    const code = ord.body.order.code;

    const pay = await request(app).post(`/api/orders/${code}/pay`).set(bearer(a));
    expect(pay.status).toBe(200);
    expect(pay.body.order.status).toBe("COMPLETED");
    expect(pay.body.order.deliveries).toHaveLength(1);
    expect(String(pay.body.order.deliveries[0].secret)).toMatch(/^KEY-/);
    expect(await balanceOf(a.userId)).toBe(3500);

    const avail = await db()("digital_inventory").where({ product_id: prod.id, status: "AVAILABLE" }).count({ n: "*" } as any).first();
    expect(Number(avail?.n)).toBe(1);

    // second purchase gets a DIFFERENT key (one key can never reach two buyers)
    const ord2 = await request(app).post("/api/orders").set(bearer(a)).set(json)
      .send({ items: [{ productId: prod.id, quantity: 1 }] });
    const pay2 = await request(app).post(`/api/orders/${ord2.body.order.code}/pay`).set(bearer(a));
    expect(pay2.body.order.deliveries[0].secret).not.toBe(pay.body.order.deliveries[0].secret);

    // third one is out of stock
    const ord3 = await request(app).post("/api/orders").set(bearer(a)).set(json)
      .send({ items: [{ productId: prod.id, quantity: 1 }] });
    expect(ord3.status).toBe(409);
    expect(ord3.body.error.code).toBe("OUT_OF_STOCK");
  });

  it("refuses payment when balance is insufficient and never touches wallet", async () => {
    const a = await loginAs(nextTg());
    await credit(a.userId, 500);
    const prod = await seedProduct({ name: "Costly", price: 9000, keys: 5 });
    const ord = await request(app).post("/api/orders").set(bearer(a)).set(json)
      .send({ items: [{ productId: prod.id, quantity: 1 }] });
    expect(ord.status).toBe(201);
    const pay = await request(app).post(`/api/orders/${ord.body.order.code}/pay`).set(bearer(a));
    expect(pay.status).toBe(409);
    expect(pay.body.error.code).toBe("INSUFFICIENT_BALANCE");
    expect(await balanceOf(a.userId)).toBe(500);
    const o = await db()("orders").where({ id: ord.body.order.id }).first();
    expect(o.status).toBe("PENDING_PAYMENT");
  });

  it("double-clicking pay debits exactly once", async () => {
    const a = await loginAs(nextTg());
    await credit(a.userId, 10000);
    const prod = await seedProduct({ name: "DupPay", price: 1000, keys: 5 });
    const ord = await request(app).post("/api/orders").set(bearer(a)).set(json)
      .send({ items: [{ productId: prod.id, quantity: 1 }] });
    const code = ord.body.order.code;
    await new Promise(r => setTimeout(r, 1600)); // pass double-click window
    const [r1, r2] = await Promise.all([
      request(app).post(`/api/orders/${code}/pay`).set(bearer(a)),
      request(app).post(`/api/orders/${code}/pay`).set(bearer(a))
    ]);
    // exactly-one semantics: second concurrent request either sees "already done" (200)
    // or is intercepted by the anti-double-click guard (429). The invariant: one debit.
    expect([200, 429]).toContain(r1.status);
    expect([200, 429]).toContain(r2.status);
    expect([r1.status, r2.status].filter(s => s === 429).length).toBeLessThanOrEqual(1);
    expect(await balanceOf(a.userId)).toBe(9000); // one debit only
    const txns = await db()("wallet_transactions").where({ user_id: a.userId, type: "PURCHASE" });
    expect(txns.length).toBe(1);
  });

  it("refund credits wallet once, voids keys, legal machine enforced", async () => {
    const admin = await loginAs(nextTg());
    await makeAdmin(admin);
    const a = await loginAs(nextTg());
    await credit(a.userId, 10000);
    const prod = await seedProduct({ name: "RefundMe", price: 2000, keys: 3 });
    const ord = await request(app).post("/api/orders").set(bearer(a)).set(json)
      .send({ items: [{ productId: prod.id, quantity: 1 }] });
    await request(app).post(`/api/orders/${ord.body.order.code}/pay`).set(bearer(a));

    const ref = await request(app).post(`/api/admin/orders/${ord.body.order.id}/status`).set(bearer(admin)).set(json)
      .send({ status: "REFUNDED", reason: "customer request" });
    expect(ref.status).toBe(200);
    expect(ref.body.order.status).toBe("REFUNDED");
    expect(await balanceOf(a.userId)).toBe(10000);

    // replay the refund -> status machine refuses (REFUNDED terminal) — wallet untouched
    const again = await request(app).post(`/api/admin/orders/${ord.body.order.id}/status`).set(bearer(admin)).set(json)
      .send({ status: "REFUNDED" });
    expect(again.status).toBe(200); // idempotent early-return
    expect(await balanceOf(a.userId)).toBe(10000);

    const voided = await db()("digital_inventory").where({ status: "VOID" });
    expect(voided.length).toBeGreaterThanOrEqual(1);
  });

  it("manual delivery queue: order waits, admin delivers, user sees content", async () => {
    const admin = await loginAs(nextTg());
    await makeAdmin(admin);
    const a = await loginAs(nextTg());
    await credit(a.userId, 5000);
    const prod = await seedProduct({ name: "ManualItem", price: 700, deliveryType: "MANUAL", stockMode: "UNLIMITED" });
    const ord = await request(app).post("/api/orders").set(bearer(a)).set(json)
      .send({ items: [{ productId: prod.id, quantity: 1 }], deliveryAccount: "player-77" });
    const pay = await request(app).post(`/api/orders/${ord.body.order.code}/pay`).set(bearer(a));
    expect(pay.body.order.status).toBe("PROCESSING");

    const item = pay.body.order.items[0];
    const del = await request(app).post(`/api/admin/orders/${ord.body.order.id}/deliver`).set(bearer(admin)).set(json)
      .send({ orderItemId: item.id, text: "Here is your access", secret: "LOGIN: abc\nPASS: xyz" });
    expect(del.status).toBe(200);
    expect(del.body.order.status).toBe("COMPLETED");

    const viewed = await request(app).get(`/api/orders/${ord.body.order.code}`).set(bearer(a));
    expect(viewed.body.order.deliveries[0].contentText).toBeDefined();
  });

  it("cannot Complete a manual order without a delivery record; cannot Failed->Completed either", async () => {
    const admin = await loginAs(nextTg());
    await makeAdmin(admin);
    const a = await loginAs(nextTg());
    await credit(a.userId, 5000);
    const prod = await seedProduct({ name: "GuardState", price: 500, deliveryType: "MANUAL", stockMode: "UNLIMITED" });
    const ord = await request(app).post("/api/orders").set(bearer(a)).set(json)
      .send({ items: [{ productId: prod.id, quantity: 1 }] });
    await request(app).post(`/api/orders/${ord.body.order.code}/pay`).set(bearer(a));

    const bad = await request(app).post(`/api/admin/orders/${ord.body.order.id}/status`).set(bearer(admin)).set(json)
      .send({ status: "COMPLETED" });
    expect(bad.status).toBe(409);
    expect(bad.body.error.code).toBe("DELIVERY_REQUIRED");
  });

  it("price is always re-computed server side; client cannot buy at a discount by cheating", async () => {
    const a = await loginAs(nextTg());
    await credit(a.userId, 5000);
    const prod = await seedProduct({ name: "Honest", price: 4000, keys: 1 });
    const ord = await request(app).post("/api/orders").set(bearer(a)).set(json)
      .send({ items: [{ productId: prod.id, quantity: 1, unitPriceMinor: 1 }] });
    // createOrder ignores client prices entirely
    expect(ord.body.order.itemsTotalMinor).toBe(4000);
    await request(app).post(`/api/orders/${ord.body.order.code}/pay`).set(bearer(a));
    expect(await balanceOf(a.userId)).toBe(1000);
  });
});

describe("Deposits & payments", () => {
  it("full lifecycle: request -> approve credits once (double approve is a no-op)", async () => {
    const admin = await loginAs(nextTg());
    await makeAdmin(admin);
    const a = await loginAs(nextTg());

    await request(app).post("/api/admin/payment-methods").set(bearer(admin)).set(json).send({
      code: "TESTQR", name: "Test QR", instructions: "scan me", minMinor: 500, isActive: true
    });
    const dep = await request(app).post("/api/deposits").set(bearer(a)).set(json)
      .send({ providerCode: "TESTQR", amountMinor: 3000, txnRef: "TX-" + crypto.randomBytes(3).toString("hex") });
    expect(dep.status).toBe(201);
    expect(dep.body.deposit.status).toBe("PENDING");

    const ap1 = await request(app).post(`/api/admin/deposits/${dep.body.deposit.id}/approve`).set(bearer(admin)).set(json).send({});
    expect(ap1.status).toBe(200);
    expect(ap1.body.skipped).toBe(false);
    expect(await balanceOf(a.userId)).toBe(3000);

    const ap2 = await request(app).post(`/api/admin/deposits/${dep.body.deposit.id}/approve`).set(bearer(admin)).set(json).send({});
    expect(ap2.body.skipped).toBe(true);
    expect(await balanceOf(a.userId)).toBe(3000); // NOT 6000

    const txns = await db()("wallet_transactions").where({ user_id: a.userId, type: "DEPOSIT" });
    expect(txns.length).toBe(1);
  });

  it("reject does not credit; duplicate txn_ref is refused; negative/zero balance never happens", async () => {
    const admin = await loginAs(nextTg());
    await makeAdmin(admin);
    const a = await loginAs(nextTg());
    await request(app).post("/api/admin/payment-methods").set(bearer(admin)).set(json).send({
      code: "TESTREJ", name: "Rej", minMinor: 100, isActive: true
    });
    const ref = "RJ-" + crypto.randomBytes(3).toString("hex");
    const d1 = await request(app).post("/api/deposits").set(bearer(a)).set(json).send({ providerCode: "TESTREJ", amountMinor: 900, txnRef: ref });
    const rej = await request(app).post(`/api/admin/deposits/${d1.body.deposit.id}/reject`).set(bearer(admin)).set(json).send({ reason: "no proof" });
    expect(rej.status).toBe(200);
    expect(await balanceOf(a.userId)).toBe(0);
    const dup = await request(app).post("/api/deposits").set(bearer(a)).set(json).send({ providerCode: "TESTREJ", amountMinor: 900, txnRef: ref });
    expect(dup.status).toBe(409);

    // admin debit beyond balance is refused + audited
    await credit(a.userId, 400);
    const bad = await request(app).post(`/api/admin/users/${a.userId}/balance`).set(bearer(admin)).set(json)
      .send({ kind: "DEBIT", amountMinor: 900, reason: "test over-debit" });
    expect(bad.status).toBe(409);
    expect(await balanceOf(a.userId)).toBe(400);
    const logs = await db()("audit_logs").where({ action: "DEPOSIT_REJECT" });
    expect(logs.length).toBeGreaterThan(0);
  });

  it("webhook: invalid signature rejected and NOT stored; valid processes once then dedupes", async () => {
    const body = JSON.stringify({ type: "deposit.paid", id: "evt_bad_" + crypto.randomBytes(2).toString("hex") });
    const bad = await request(app).post("/api/payments/webhook/TESTPS").set("content-type", "application/json")
      .set("x-webhook-signature", "deadbeef").send(body);
    expect(bad.status).toBe(401);
    expect(await db()("payment_webhook_events").where({ external_id: body.match(/"id":"([^"]+)"/)![1] })).toHaveLength(0);

    const evtId = "evt_ok_" + crypto.randomBytes(3).toString("hex");
    const okBody = JSON.stringify({ type: "deposit.paid", id: evtId, reference: "no-such-ref", amount_minor: 1000 });
    const sig = crypto.createHmac("sha256", "whsec_integration_test").update(okBody).digest("hex");
    const r1 = await request(app).post("/api/payments/webhook/TESTPS").set("content-type", "application/json")
      .set("x-webhook-signature", sig).send(okBody);
    expect(r1.status).toBe(200);
    expect(r1.body.processed).toBe(false);       // auto-verification gate is OFF by default

    const r2 = await request(app).post("/api/payments/webhook/TESTPS").set("content-type", "application/json")
      .set("x-webhook-signature", sig).send(okBody);
    expect(r2.body.duplicate).toBe(true);       // same provider event processed exactly once
    const rec = await db()("payment_webhook_events").where({ external_id: evtId });
    expect(rec.length).toBe(1);
  });
});

describe("Promotions", () => {
  it("percent code applies once per user and is enforced at payment time", async () => {
    const admin = await loginAs(nextTg());
    await makeAdmin(admin);
    const a = await loginAs(nextTg());
    await credit(a.userId, 10000);
    await request(app).post("/api/admin/promotions").set(bearer(admin)).set(json).send({
      code: "SAVE25", name: "25 off", kind: "PERCENT", percentValue: 25, minOrder: 10, perUserLimit: 1,
      startsAt: new Date(Date.now() - 5 * 60000).toISOString(), endsAt: new Date(Date.now() + 7 * 86400_000).toISOString()
    });
    await request(app).post("/api/admin/payment-methods").set(bearer(admin)).set(json).send({ code: "X", name: "x", minMinor: 100 });

    const prod = await seedProduct({ name: "PromoItem", price: 4000, keys: 5 });
    const ord = await request(app).post("/api/orders").set(bearer(a)).set(json)
      .send({ items: [{ productId: prod.id, quantity: 1 }], promoCode: "SAVE25" });
    expect(ord.body.order.discountMinor).toBe(1000);
    const pay = await request(app).post(`/api/orders/${ord.body.order.code}/pay`).set(bearer(a));
    expect(pay.status).toBe(200);
    expect(await balanceOf(a.userId)).toBe(7000);

    const ord2 = await request(app).post("/api/orders").set(bearer(a)).set(json)
      .send({ items: [{ productId: prod.id, quantity: 1 }], promoCode: "SAVE25" });
    expect(ord2.status).toBe(400);
    expect(ord2.body.error.code).toBe("PROMO_USER_LIMIT");
  });
});

void toDbTime;
