import { db, toDbTime } from "../db";
import { sendTelegramMessage } from "../domain/telegram";

/**
 * Persist an in-app notification and enqueue a Telegram send (fire-and-forget).
 * A failing Telegram call NEVER affects orders/payments — statuses are stored
 * and retried by the background worker with backoff.
 */
export async function notify(opts: {
  userId: number; kind: string; title: string; body?: string; link?: string; telegramText?: string;
}): Promise<void> {
  const k = db();
  const user = await k("users").where({ id: opts.userId }).first();
  const wantTelegram = !!user && !!opts.telegramText && !!user.notifications_enabled;
  const id = await k("notifications").insert({
    user_id: opts.userId, kind: opts.kind, title: opts.title.slice(0, 250), body: (opts.body || "").slice(0, 4000),
    link: (opts.link || "").slice(0, 500), is_read: 0,
    telegram_state: wantTelegram ? "PENDING" : "NONE", telegram_attempts: 0,
    next_retry_at: wantTelegram ? toDbTime() : null, created_at: toDbTime()
  }).then((r: any) => (Array.isArray(r) ? Number(r[0]) : NaN));

  const rowId = Number.isFinite(id) && id > 0 ? id : (await k("notifications").where({ user_id: opts.userId }).orderBy("id", "desc").first())?.id;
  if (wantTelegram && rowId) {
    void attemptTelegram(Number(rowId), Number(user.telegram_id), opts.telegramText!);
  }
}

async function attemptTelegram(notifId: number, chatId: number, text: string): Promise<void> {
  const k = db();
  const res = await sendTelegramMessage(chatId, text);
  if (res.ok) {
    await k("notifications").where({ id: notifId }).update({ telegram_state: "SENT", telegram_attempts: 1, next_retry_at: null });
  } else {
    await k("notifications").where({ id: notifId }).update({
      telegram_state: "FAILED", telegram_attempts: 1,
      next_retry_at: toDbTime(new Date(Date.now() + 60_000))
    });
  }
}

/** Background retry sweep — called every minute from the server loop. */
export async function retryTelegramNotifications(maxAttempts = 5): Promise<number> {
  const k = db();
  const due = await k("notifications").where({ telegram_state: "FAILED" }).andWhere("telegram_attempts", "<", maxAttempts)
    .andWhere("next_retry_at", "<=", toDbTime()).limit(20);
  let sent = 0;
  for (const n of due) {
    const user = await k("users").where({ id: n.user_id }).first();
    if (!user) { await k("notifications").where({ id: n.id }).update({ telegram_state: "SKIPPED" }); continue; }
    const res = await sendTelegramMessage(Number(user.telegram_id), String(n.title + (n.body ? `\n${n.body}` : "")));
    const attempts = Number(n.telegram_attempts || 0) + 1;
    const backoff = Math.min(3_600_000, 60_000 * 2 ** attempts);
    await k("notifications").where({ id: n.id }).update(res.ok
      ? { telegram_state: "SENT", telegram_attempts: attempts, next_retry_at: null }
      : { telegram_state: attempts >= maxAttempts ? "SKIPPED" : "FAILED", telegram_attempts: attempts, next_retry_at: toDbTime(new Date(Date.now() + backoff)) });
    if (res.ok) sent++;
  }
  return sent;
}
