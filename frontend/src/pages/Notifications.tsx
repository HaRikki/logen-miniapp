import React, { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Bell, BellRing, CheckCheck } from "lucide-react";
import { api } from "../lib/api";
import { useStore } from "../state/store";
import { Shell } from "../components/Layout";
import { Button, Card, EmptyState, Skeleton, cx } from "../components/ui";

interface N {
  id: number; kind: string; title: string; body: string | null; link: string | null;
  isRead: boolean | number; createdAt: string;
}

export default function Notifications() {
  const { t, lang } = useStore();
  const [rows, setRows] = useState<N[] | null>(null);

  const load = () => {
    api.get<{ items: N[] }>("/api/notifications").then(r => setRows(r.items)).catch(() => setRows([]));
  };
  useEffect(load, []);

  async function markAll() {
    await api.post("/api/notifications/read", {});
    setRows(rs => (rs || []).map(r => ({ ...r, isRead: true })));
  }
  async function open(nRow: N) {
    if (!nRow.isRead) {
      await api.post("/api/notifications/read", { ids: [nRow.id] }).catch(() => { /* ignore */ });
      setRows(rs => (rs || []).map(r => (r.id === nRow.id ? { ...r, isRead: true } : r)));
    }
  }

  return (
    <Shell back title={t("notifications")}>
      {rows === null ? (
        <div className="space-y-2.5">{[...Array(4)].map((_, i) => <Skeleton key={i} className="h-20 rounded-card" />)}</div>
      ) : rows.length === 0 ? (
        <EmptyState title={t("noNotifications")} icon={BellRing} />
      ) : (
        <>
          <div className="mb-3 flex justify-end">
            <Button size="sm" variant="ghost" icon={CheckCheck} onClick={markAll}>{lang === "km" ? "សម្គាល់បានអានទាំងអស់" : "Mark all read"}</Button>
          </div>
          <div className="space-y-2.5">
            {rows.map(n => {
              const inner = (
                <Card className={cx("flex gap-3 p-4 transition", !n.isRead && "border-primary/25 bg-primary-soft")}>
                  <div className={cx("mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-xl", n.isRead ? "bg-primary-light/60 text-primary" : "bg-primary text-white shadow-pop")}>
                    <Bell size={16} />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-[13.5px] font-bold leading-snug text-ink">{n.title}</p>
                    {n.body ? <p className="mt-1 line-clamp-3 text-xs leading-5 text-ink-soft">{n.body}</p> : null}
                    <p className="mt-1.5 text-[10.5px] text-ink-faint">{new Date(String(n.createdAt).replace(" ", "T") + "Z").toLocaleString(lang === "km" ? "km-KH" : "en-US", { dateStyle: "medium", timeStyle: "short" })}</p>
                  </div>
                  {!n.isRead ? <span className="mt-1 h-2 w-2 shrink-0 rounded-full bg-primary" /> : null}
                </Card>
              );
              return n.link?.startsWith("/") ? (
                <Link key={n.id} to={n.link} onClick={() => void open(n)}>{inner}</Link>
              ) : (
                <div key={n.id} onClick={() => void open(n)} role="button">{inner}</div>
              );
            })}
          </div>
        </>
      )}
    </Shell>
  );
}
