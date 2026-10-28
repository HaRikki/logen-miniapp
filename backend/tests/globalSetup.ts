import { execSync } from "child_process";
import fs from "fs";
import path from "path";

/** Fresh migrated DB file for the whole vitest run (tsx subprocess loads .ts migrations). */
export async function setup(): Promise<void> {
  const root = path.resolve(__dirname, "..");
  const file = path.join(root, "data", "test.sqlite3");
  for (const f of [file, file + "-wal", file + "-shm"]) {
    if (fs.existsSync(f)) fs.rmSync(f);
  }
  fs.mkdirSync(path.dirname(file), { recursive: true });
  execSync(`npx tsx src/db/cli.ts migrate --file=./data/test.sqlite3`, { cwd: root, stdio: "inherit", env: { ...process.env, DB_CLIENT: "sqlite" } });
  execSync(`npx tsx src/db/cli.ts seed --file=./data/test.sqlite3`, { cwd: root, stdio: "inherit", env: { ...process.env, DB_CLIENT: "sqlite" } });
}
