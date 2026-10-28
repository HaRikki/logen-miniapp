#!/usr/bin/env node
/**
 * Attach the Digital Store Mini App to your bot:
 *   1) sets the bot menu button (opens the Mini App), and
 *   2) registers a deep-link helper.
 *
 * Usage (env from .env or shell):
 *   TELEGRAM_BOT_TOKEN=123:abc APP_BASE_URL=https://store.example.com node scripts/set-bot-menu.mjs
 */
import fs from "fs";

function loadEnv() {
  if (fs.existsSync(".env")) {
    for (const line of fs.readFileSync(".env", "utf8").split("\n")) {
      const m = line.match(/^([A-Z0-9_]+)=(.*)$/i);
      if (m && !process.env[m[1]]) process.env[m[1]] = m[2].trim();
    }
  }
}
loadEnv();

const token = process.env.TELEGRAM_BOT_TOKEN;
const url = (process.env.APP_BASE_URL || "http://localhost:3000").replace(/\/+$/, "");
if (!token) {
  console.error("TELEGRAM_BOT_TOKEN missing. Put it in .env or export it.");
  process.exit(1);
}

async function call(method, body) {
  const res = await fetch(`https://api.telegram.org/bot${token}/${method}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body ?? {})
  });
  const json = await res.json();
  if (!json.ok) throw new Error(`${method}: ${json.description} (HTTP ${res.status})`);
  return json.result;
}

const me = await call("getMe");
console.log(`Bot: @${me.username}`);

await call("setChatMenuButton", {
  menu_button: {
    type: "web_app",
    text: "Open Digital Store",
    web_app: { url }
  }
});
console.log(`✔ Menu button set → ${url}`);

try {
  await call("deleteWebhook", {});
} catch { /* no webhook */ }

console.log("\nNext step in @BotFather:");
console.log(`  /newapp or Bot Settings → Menu Button → ${url}`);
console.log(`  Share link: https://t.me/${me.username}/store?web_app`);
