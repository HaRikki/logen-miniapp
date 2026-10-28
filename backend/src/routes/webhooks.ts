import { Router, raw } from "express";
import crypto from "crypto";
import { db, toDbTime } from "../db";
import { config } from "../config";
import { asyncHandler } from "../common/errors";
import { timingSafeEqualHex } from "../common/id";
import { audit } from "../services/audit";

export const webhookRouter = Router();

/**
 * Generic payment gateway webhook receiver.
 * - Verifies HMAC-SHA256 signature of the RAW body (header X-Webhook-Signature)
 *   using PAYMENT_WEBHOOK_SECRET; invalid signatures are recorded + rejected.
 * - Deduplicates by (provider, external id) via payment_webhook_events unique key.
 * - Auto-credits deposits ONLY IF a settings.payments.autoWebhookEnabled was
 *   explicitly enabled (which itself requires a real, contracted PSP — the
 *   default stays false and everything remains manual-approval).
 */
webhookRouter.post("/payments/webhook/:provider", asyncHandler(async (req, res) => {
  const provider = String(req.params.provider).toUpperCase().slice(0, 32);
  const bodyBuf: Buffer = Buffer.isBuffer(req.body) ? req.body : Buffer.from(JSON.stringify(req.body || {}));
  const sigHeader = String(req.headers["x-webhook-signature"] || "");
  let sigValid = false;
  if (config.deposits.webhookSecret && sigHeader) {
    const computed = crypto.createHmac("sha256", config.deposits.webhookSecret).update(bodyBuf).digest("hex");
    sigValid = timingSafeEqualHex(computed, sigHeader.slice(0, 128));
  }

  let payload: any = {};
  try { payload = JSON.parse(bodyBuf.toString("utf8") || "{}"); } catch { payload = { unparseable: true }; }
  const externalId = String(payload.id ?? payload.event_id ?? payload.notification_id ?? crypto.createHash("sha1").update(bodyBuf).digest("hex")).slice(0, 255);

  const k = db();
  if (!sigValid) {
    // do not store unauthenticated payloads (garbage/DoS protection); just audit + reject
    await audit({ action: "WEBHOOK_BAD_SIGNATURE", entityType: "payment_webhook", entityId: externalId, actorRole: "SYSTEM" });
    res.status(401).json({ error: { code: "BAD_SIGNATURE", message: "Signature verification failed" } });
    return;
  }
  const existing = await k("payment_webhook_events").where({ provider_code: provider, external_id: externalId }).first();
  if (existing) {
    res.json({ received: true, duplicate: true }); // replayed webhook — no double processing
    return;
  }
  try {
    await k("payment_webhook_events").insert({
      provider_code: provider, external_id: externalId, payload: bodyBuf.toString("utf8").slice(0, 60_000),
      signature_valid: 1, status: "RECEIVED", process_note: null, received_at: toDbTime()
    });
  } catch {
    res.json({ received: true, duplicate: true }); // raced duplicate — processed once
    return;
  }
  const settings = await (await import("../services/settings")).getSetting("payments");
  if (!settings?.autoWebhookEnabled) {
    await k("payment_webhook_events").where({ provider_code: provider, external_id: externalId })
      .update({ status: "IGNORED", process_note: "auto verification not enabled — manual approval required" });
    res.json({ received: true, processed: false, reason: "AUTO_DISABLED" });
    return;
  }

  if (payload.type === "deposit.paid" && payload.reference) {
    const dep = await k("deposits").where({ txn_ref: String(payload.reference).slice(0, 128), status: "PENDING" }).first();
    if (dep && Number(payload.amount_minor) === Number(dep.amount_minor)) {
      const { approveDeposit } = await import("../services/deposits");
      try {
        await approveDeposit(Number(dep.id), null as unknown as number, `auto-verified via ${provider} webhook`);
        await k("payment_webhook_events").where({ provider_code: provider, external_id: externalId }).update({ status: "PROCESSED", process_note: `deposit ${dep.code} credited` });
        res.json({ received: true, processed: true });
        return;
      } catch (e: any) {
        await k("payment_webhook_events").where({ provider_code: provider, external_id: externalId }).update({ status: "FAILED", process_note: String(e?.message).slice(0, 500) });
        res.json({ received: true, processed: false });
        return;
      }
    }
  }
  await k("payment_webhook_events").where({ provider_code: provider, external_id: externalId }).update({ status: "IGNORED", process_note: "no matching pending deposit" });
  res.json({ received: true, processed: false });
}));
