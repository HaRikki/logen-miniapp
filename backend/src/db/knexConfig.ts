import path from "path";
import fs from "fs";
import { config } from "../config";

function ext(dir: string): "js" | "ts" {
  const files = fs.existsSync(dir) ? fs.readdirSync(dir) : [];
  if (files.some(f => f.endsWith(".js"))) return "js";
  return "ts";
}

export function knexConfig(overrides?: Partial<typeof config.db>) {
  const db = { ...config.db, ...overrides };
  const migrations = path.join(__dirname, "migrations");
  const seeds = path.join(__dirname, "seeds");
  const common = {
    migrations: { directory: migrations, extension: ext(migrations) },
    seeds: { directory: seeds, extension: ext(seeds) }
  };
  if (db.client === "postgres") {
    const url = db.url;
    if (!url) throw new Error("DATABASE_URL is required when DB_CLIENT=postgres");
    return { client: "pg", connection: url, pool: { min: 1, max: 10 }, ...common };
  }
  const dir = path.dirname(path.resolve(db.sqliteFile));
  fs.mkdirSync(dir, { recursive: true });
  return {
    client: "better-sqlite3",
    connection: { filename: db.sqliteFile },
    useNullAsDefault: true,
    ...common
  };
}
