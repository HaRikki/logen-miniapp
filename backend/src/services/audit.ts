import { db, toDbTime } from "../db";

/** Every significant admin action lands here (financial changes MUST have a log). */
export async function audit(entry: {
  actorUserId?: number | null;
  actorRole?: string;
  action: string;
  entityType: string;
  entityId: string | number;
  before?: unknown;
  after?: unknown;
  reason?: string | null;
  ip?: string | null;
}): Promise<void> {
  try {
    await db()("audit_logs").insert({
      actor_user_id: entry.actorUserId ?? null,
      actor_role: entry.actorRole || "ADMIN",
      action: entry.action.slice(0, 64),
      entity_type: entry.entityType.slice(0, 32),
      entity_id: String(entry.entityId).slice(0, 64),
      before_data: entry.before !== undefined ? JSON.stringify(redact(entry.before)) : null,
      after_data: entry.after !== undefined ? JSON.stringify(redact(entry.after)) : null,
      reason: (entry.reason || "").slice(0, 2000) || null,
      ip: entry.ip || null,
      created_at: toDbTime()
    });
  } catch (e) {
    console.error("audit write failed (non-fatal)", e);
  }
}

const SECRET_KEYS = ["secret_payload", "value", "telegrampass", "session_secret", "token", "token_hash", "password", "api_key", "download_token"];
function redact(v: unknown): unknown {
  if (Array.isArray(v)) return v.map(redact);
  if (v && typeof v === "object") {
    const out: Record<string, unknown> = {};
    for (const [k, val] of Object.entries(v as Record<string, unknown>)) {
      out[k] = SECRET_KEYS.includes(k) ? "[REDACTED]" : redact(val);
    }
    return out;
  }
  return v;
}
