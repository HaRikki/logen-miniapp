import path from "path";
import fs from "fs";
import knexLib, { Knex } from "knex";
import pg from "pg";
import { config } from "../config";

// Postgres int8 arrives as string in node-pg; store ids/amounts as numbers.
pg.types.setTypeParser(20, (v: string) => parseInt(v, 10));
pg.types.setTypeParser(1700, (v: string) => Number(v));

let dbInstance: Knex | null = null;

export function makeKnex(client?: "sqlite" | "postgres", connectionString?: string): Knex {
  const kind = client || config.db.client;
  if (kind === "postgres") {
    const url = connectionString || config.db.url;
    if (!url) throw new Error("DATABASE_URL is required when DB_CLIENT=postgres");
    return knexLib({ client: "pg", connection: url, pool: { min: 1, max: 10 } });
  }
  const file = connectionString || config.db.sqliteFile;
  const dir = path.dirname(path.resolve(file));
  if (!fs.existsSync(dir) && file !== ":memory:") fs.mkdirSync(dir, { recursive: true });
  return knexLib({
    client: "better-sqlite3",
    connection: { filename: file },
    useNullAsDefault: true,
    pool: { afterCreate: (conn: any, done: (e: Error | null, c: any) => void) => {
      try { conn.pragma("journal_mode = WAL"); conn.pragma("foreign_keys = ON"); conn.pragma("busy_timeout = 5000"); }
      catch (e) { return done(e as Error, conn); }
      done(null, conn);
    } }
  });
}

export function db(): Knex {
  if (!dbInstance) dbInstance = makeKnex();
  return dbInstance;
}

export async function closeDb(): Promise<void> {
  if (dbInstance) { await dbInstance.destroy(); dbInstance = null; }
}

// ---------- value normalizers (sqlite returns 0/1 & strings; pg returns native types) ----------
export function asNum(v: unknown): number { return v == null ? 0 : Number(v); }
export function asBool(v: unknown): boolean { return v === true || v === 1 || v === "1"; }
export function asJson<T>(v: unknown, fallback: T): T {
  if (v == null) return fallback;
  if (typeof v === "object") return v as T;
  try { return JSON.parse(String(v)) as T; } catch { return fallback; }
}

// UTC 'YYYY-MM-DD HH:MM:SS' works identically on sqlite + pg timestamp columns.
export function toDbTime(d: Date = new Date()): string {
  return d.toISOString().replace("T", " ").slice(0, 19);
}
export function fromDbTime(s: null | string | Date | undefined): string | null {
  if (s == null) return null;
  if (s instanceof Date) return s.toISOString();
  const iso = String(s).includes("T") ? String(s) : String(s).replace(" ", "T") + "Z";
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? String(s) : d.toISOString();
}
export function parseClientDate(v: unknown): Date | null {
  if (!v) return null;
  const d = new Date(String(v).replace(" ", "T") + (String(v).includes("Z") || String(v).includes("+") ? "" : "Z"));
  return Number.isNaN(d.getTime()) ? null : d;
}

/** Convert snake_case row -> camelCase plain object (single level). */
export function camel(row: Record<string, unknown> | undefined | null): any {
  if (!row) return row;
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(row)) {
    const key = k.replace(/_([a-z0-9])/g, (_, c: string) => c.toUpperCase());
    out[key] = v;
  }
  return out;
}
export function camelAll(rows: Record<string, unknown>[]): any[] { return (rows || []).map(camel); }

export type Trx = Knex.Transaction;
export { Knex };
