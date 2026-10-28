import path from "path";
import fs from "fs";
import { config } from "./config";
import { db, closeDb } from "./db";
import { makeKnex } from "./db";
import { createApp } from "./app";
import { retryTelegramNotifications } from "./services/notify";
import { expireDeposits } from "./services/deposits";
import { bootstrapAdminAll } from "./services/bootstrap";

async function runMigrationsAndSeed() {
  const k = db();
  const migrationsDir = path.join(__dirname, "db", "migrations");
  const extension = fs.existsSync(path.join(migrationsDir, "001_identity.js")) ? "js" : "ts";
  await k.migrate.latest({ directory: migrationsDir, extension });
  const hasData = await k("categories").count({ n: "*" } as any).first();
  if (!Number(hasData?.n || 0) && !config.isProd) {
    // development convenience only: production databases are never auto-seeded.
    const seedsDir = path.join(__dirname, "db", "seeds");
    await k.seed.run({ directory: seedsDir, extension });
  }
}

let loop: NodeJS.Timeout | null = null;

export async function start(port = config.port): Promise<import("http").Server> {
  await runMigrationsAndSeed();
  await bootstrapAdminAll();
  const app = createApp();
  const server = app.listen(port);
  loop = setInterval(async () => {
    try {
      await retryTelegramNotifications();
      await expireDeposits();
    } catch (e) {
      console.error("background loop error (non-fatal)", e);
    }
  }, 60_000);
  return server;
}

if (require.main === module) {
  start().then((s) => {
    const addr = s.address();
    console.log(`[digital-store] listening on ${typeof addr === "object" && addr ? addr.port : addr} (${config.env}, db=${config.db.client})`);
  }).catch(async (e) => {
    console.error(e);
    await closeDb();
    process.exit(1);
  });
  const shutdown = async () => {
    if (loop) clearInterval(loop);
    await closeDb();
    process.exit(0);
  };
  process.on("SIGTERM", shutdown);
  process.on("SIGINT", shutdown);
}

export { makeKnex };
