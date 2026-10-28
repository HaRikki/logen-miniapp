import { describe, it, expect } from "vitest";
import { app, request, loginAs, nextTg, bearer } from "./helpers";

// 1x1 PNG
const PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==",
  "base64"
);

describe("Upload endpoints (multer 2.x)", () => {
  it("accepts a valid PNG payment proof", async () => {
    const a = await loginAs(nextTg());
    const res = await request(app).post("/api/uploads/proof")
      .set("Authorization", `Bearer ${a.token}`)
      .attach("file", PNG, { filename: "proof.png", contentType: "image/png" });
    expect(res.status, JSON.stringify(res.body)).toBe(201);
    expect(res.body.path).toMatch(/^proofs\/proofs-\d+-[0-9a-f]+\.png$/);
  });

  it("rejects non-image files with a clean error", async () => {
    const a = await loginAs(nextTg());
    const res = await request(app).post("/api/uploads/proof")
      .set("Authorization", `Bearer ${a.token}`)
      .attach("file", Buffer.from("echo hack"), { filename: "evil.txt", contentType: "text/plain" });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe("BAD_FILE");
  });

  it("rejects oversized bodies before processing", async () => {
    const a = await loginAs(nextTg());
    const big = Buffer.alloc(20 * 1024 * 1024, 1); // > 15MB limit
    const res = await request(app).post("/api/uploads/proof")
      .set("Authorization", `Bearer ${a.token}`)
      .attach("file", big, { filename: "big.png", contentType: "image/png" });
    expect([400, 413]).toContain(res.status);
  });
});
