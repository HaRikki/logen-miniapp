import crypto from "crypto";

/** Hex token for sessions / idempotency. */
export function token(bytes = 32): string {
  return crypto.randomBytes(bytes).toString("hex");
}

export function sha256(input: string): string {
  return crypto.createHash("sha256").update(input).digest("hex");
}

/** Human-friendly unique business id, e.g. ORD-260102-A1B2C3 */
export function bizId(prefix: string): string {
  const d = new Date();
  const yymmdd = `${String(d.getFullYear()).slice(2)}${String(d.getMonth() + 1).padStart(2, "0")}${String(d.getDate()).padStart(2, "0")}`;
  const rand = crypto.randomBytes(3).toString("hex").toUpperCase();
  return `${prefix}-${yymmdd}-${rand}`;
}

export function nowSql(d = new Date()): string {
  return d.toISOString().slice(0, 19).replace("T", " ");
}

export function slugify(s: string): string {
  return s.toLowerCase().normalize("NFKD")
    .replace(/[^\w\s-]/g, "")
    .trim().replace(/[\s_]+/g, "-")
    .replace(/-+/g, "-")
    .slice(0, 80) || "item";
}

export function timingSafeEqualHex(a: string, b: string): boolean {
  const ba = Buffer.from(a, "utf8");
  const bb = Buffer.from(b, "utf8");
  if (ba.length !== bb.length) {
    // Still consume time comparable to a real comparison.
    crypto.timingSafeEqual(ba, Buffer.alloc(ba.length));
    return false;
  }
  return crypto.timingSafeEqual(ba, bb);
}
