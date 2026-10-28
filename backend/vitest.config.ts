import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    include: ["tests/**/*.test.ts"],
    testTimeout: 60000,
    hookTimeout: 60000,
    pool: "forks",
    poolOptions: { forks: { singleFork: true } },
    globalSetup: ["./tests/globalSetup.ts"],
    env: {
      NODE_ENV: "test",
      PORT: "0",
      APP_BASE_URL: "http://localhost:3000",
      DB_CLIENT: "sqlite",
      SQLITE_FILE: "./data/test.sqlite3",
      SESSION_SECRET: "test-secret-value",
      TELEGRAM_BOT_TOKEN: "123456:TEST-BOT-SECRET-TOKEN",
      ADMIN_TELEGRAM_USER_IDS: "",
      ALLOW_DEMO_LOGIN_IN_DEV: "true",
      PAYMENT_WEBHOOK_SECRET: "whsec_integration_test",
      RATE_LIMIT_MAX: "100000",
      AUTH_RATE_LIMIT_MAX: "100000",
      RATE_LIMIT_WINDOW_MS: "1000"
    }
  }
});
