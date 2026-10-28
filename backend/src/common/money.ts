/**
 * Money is stored as INTEGER minor units (e.g. cents) everywhere in the system.
 * Nothing is ever parsed from the client except through parseAmount below.
 */
export function toMinor(display: string | number, scale = 100): number {
  const n = typeof display === "number" ? display : Number(String(display).replace(/,/g, ""));
  if (!Number.isFinite(n) || n < 0) throw new Error("INVALID_AMOUNT");
  return Math.round(n * scale);
}

export function fromMinor(minor: number, scale = 100): string {
  const v = (minor ?? 0) / scale;
  return v.toFixed(2);
}

export function money(minor: number, scale = 100): number {
  return Math.round(((minor ?? 0) / scale) * 100) / 100;
}

export function fmtMoney(minor: number, currency = "USD", scale = 100): string {
  const v = money(minor, scale);
  const symbols: Record<string, string> = { USD: "$", KHR: "៛", EUR: "€" };
  const s = symbols[currency] || currency + " ";
  return currency === "KHR" ? `${v.toLocaleString("en-US", { maximumFractionDigits: 0 })} ${s}` : `${s}${v.toFixed(2)}`;
}
