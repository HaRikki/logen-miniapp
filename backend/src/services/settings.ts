import { db, toDbTime, asJson } from "../db";

/** store_settings rows hold JSON blobs under namespaced keys (store, payments, delivery). */
export async function getSetting(key: string): Promise<any | null> {
  const row = await db()("store_settings").where({ key }).first();
  if (!row) return null;
  return asJson<any>(row.value, null);
}

export async function putSetting(key: string, value: unknown, updatedBy: number | null): Promise<void> {
  const k = db();
  const existing = await k("store_settings").where({ key }).first();
  const payload = JSON.stringify(value ?? null);
  if (existing) await k("store_settings").where({ key }).update({ value: payload, updated_by: updatedBy, updated_at: toDbTime() });
  else await k("store_settings").insert({ key, value: payload, updated_by: updatedBy, updated_at: toDbTime() });
}

export async function isMaintenanceMode(): Promise<boolean> {
  const s = await getSetting("store");
  return !!(s && s.maintenanceMode);
}

export const SETTING_DEFAULTS = {
  store: {
    storeName: "Digital Store",
    websiteTitle: "Digital Store — Premium digital products",
    currency: "USD",
    timezone: "Asia/Phnom_Penh",
    telegramBotUsername: "",
    supportUrl: "",
    termsKm: "", termsEn: "", privacyKm: "", privacyEn: "",
    maintenanceMode: false
  },
  payments: {
    autoWebhookEnabled: false, // must stay false until a real, verified PSP integration is configured
    depositExpiryHours: 24
  },
  delivery: {
    autoNotifyTelegram: true
  }
};
