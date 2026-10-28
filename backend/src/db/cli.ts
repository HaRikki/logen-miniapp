import knexLib from "knex";
import { knexConfig } from "./knexConfig";

// Usage:
//   tsx src/db/cli.ts migrate [sqlite|postgres] [--file path]
//   tsx src/db/cli.ts seed
//   tsx src/db/cli.ts reset          (destructive: drops sqlite file only)
async function main() {
  const [cmd, arg] = process.argv.slice(2);
  const client = arg === "postgres" ? "postgres" : undefined;
  const fileArg = process.argv.find(a => a.startsWith("--file="))?.split("=")[1];
  const overrides = client ? { client: "postgres" as const } : fileArg ? { sqliteFile: fileArg } : {};
  const conf = knexConfig(overrides as any);
  const k = knexLib(conf);
  try {
    if (cmd === "migrate") {
      const n = await k.migrate.latest();
      console.log("migrations batch applied:", n[1]?.length ?? 0, n[1] ?? []);
    } else if (cmd === "seed") {
      await k.seed.run();
      console.log("seeds applied");
    } else if (cmd === "reset") {
      await k.migrate.rollback(undefined, true);
      console.log("rolled back all");
    } else {
      console.error("unknown command", cmd);
      process.exitCode = 2;
    }
  } finally {
    await k.destroy();
  }
}
main().catch((e) => { console.error(e); process.exit(1); });
