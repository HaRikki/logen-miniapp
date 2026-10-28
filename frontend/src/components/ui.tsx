import React from "react";
import { AlertCircle, CheckCircle2, Inbox, Info, Loader2, X } from "lucide-react";
import { useStore } from "../state/store";

export function cx(...parts: Array<string | false | null | undefined>): string {
  return parts.filter(Boolean).join(" ");
}

type BtnVariant = "primary" | "outline" | "ghost" | "danger" | "soft";
export function Button({
  variant = "primary", loading, className, children, size = "md", icon: Icon, ...rest
}: React.ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: BtnVariant; loading?: boolean; size?: "sm" | "md" | "lg"; icon?: React.ComponentType<any>;
}) {
  const base = "inline-flex items-center justify-center gap-2 font-semibold rounded-pill transition-all active:scale-[.97] disabled:opacity-50 disabled:pointer-events-none select-none";
  const sizes = { sm: "text-xs px-3 py-1.5", md: "text-sm px-4 py-2.5", lg: "text-base px-6 py-3" }[size];
  const variants: Record<BtnVariant, string> = {
    primary: "bg-primary text-white shadow-pop hover:bg-primary-dark",
    outline: "border border-primary/30 text-primary bg-white hover:bg-primary-soft",
    ghost: "text-ink-soft hover:bg-primary-light/60",
    danger: "bg-danger text-white hover:opacity-90",
    soft: "bg-primary-light text-primary-dark hover:bg-primary-light/70"
  };
  return (
    <button className={cx(base, sizes, variants[variant], className)} disabled={rest.disabled || loading} {...rest}>
      {loading ? <Loader2 size={16} className="animate-spin" /> : Icon ? <Icon size={size === "sm" ? 14 : 17} /> : null}
      {children}
    </button>
  );
}

export function Card({ className, children, ...rest }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cx("bg-white rounded-card shadow-card border border-ink/[.04]", className)} {...rest}>{children}</div>;
}

export function Input({ className, ...rest }: React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      className={cx(
        "w-full rounded-xl border border-ink/10 bg-white px-3.5 py-2.5 text-sm placeholder:text-ink-faint",
        "focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary transition",
        className
      )}
      {...rest}
    />
  );
}

export function TextArea({ className, ...rest }: React.TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea className={cx("w-full rounded-xl border border-ink/10 bg-white px-3.5 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30", className)} {...rest} />;
}

export function Select({ className, children, ...rest }: React.SelectHTMLAttributes<HTMLSelectElement>) {
  return <select className={cx("rounded-xl border border-ink/10 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30", className)} {...rest}>{children}</select>;
}

export function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-[13px] font-semibold text-ink">{label}</span>
      {children}
      {hint ? <span className="mt-1 block text-xs text-ink-faint">{hint}</span> : null}
    </label>
  );
}

export function Skeleton({ className }: { className?: string }) {
  return <div className={cx("skeleton", className)} />;
}

export function Spinner({ className }: { className?: string }) {
  return <Loader2 className={cx("animate-spin text-primary", className || "h-6 w-6")} />;
}

export const ORDER_TONES: Record<string, string> = {
  PENDING_PAYMENT: "bg-amber-50 text-warning border-amber-200",
  PAID: "bg-sky-50 text-[#0369A1] border-sky-200",
  PROCESSING: "bg-primary-light text-primary-dark border-primary/20",
  COMPLETED: "bg-emerald-50 text-success border-emerald-200",
  FAILED: "bg-red-50 text-danger border-red-200",
  CANCELLED: "bg-slate-100 text-slate-500 border-slate-200",
  REFUNDED: "bg-violet-50 text-violet-700 border-violet-200",
  APPROVED: "bg-emerald-50 text-success border-emerald-200",
  REJECTED: "bg-red-50 text-danger border-red-200",
  PENDING: "bg-amber-50 text-warning border-amber-200",
  EXPIRED: "bg-slate-100 text-slate-500 border-slate-200",
  DELIVERED: "bg-emerald-50 text-success border-emerald-200",
  AVAILABLE: "bg-emerald-50 text-success border-emerald-200",
  ASSIGNED: "bg-slate-100 text-slate-500 border-slate-200",
  VOID: "bg-red-50 text-danger border-red-200"
};

export function StatusChip({ status, label }: { status: string; label?: string }) {
  return (
    <span className={cx("inline-flex items-center gap-1 rounded-pill border px-2.5 py-1 text-[11px] font-bold uppercase tracking-wide", ORDER_TONES[status] || "bg-slate-100 text-slate-500 border-slate-200")}>
      {label || status.replace(/_/g, " ")}
    </span>
  );
}

export function EmptyState({ title, hint, icon: Icon = Inbox, action }: { title: string; hint?: string; icon?: React.ComponentType<any>; action?: React.ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center gap-2 py-14 text-center animate-fadeUp">
      <div className="mb-1 flex h-16 w-16 items-center justify-center rounded-full bg-primary-light text-primary">
        <Icon size={28} />
      </div>
      <p className="font-display text-[15px] font-semibold text-ink">{title}</p>
      {hint ? <p className="max-w-[280px] text-sm text-ink-faint">{hint}</p> : null}
      {action ? <div className="mt-3">{action}</div> : null}
    </div>
  );
}

export function ErrorState({ error, onRetry }: { error: { message?: string; code?: string } | null; onRetry?: () => void }) {
  const { t } = useStore();
  return (
    <div className="flex flex-col items-center gap-3 py-12 text-center">
      <div className="flex h-14 w-14 items-center justify-center rounded-full bg-red-50 text-danger"><AlertCircle size={26} /></div>
      <p className="font-display font-semibold">{t("errorTitle")}</p>
      <p className="max-w-xs text-sm text-ink-faint">{error?.message || ""}</p>
      {onRetry ? <Button variant="outline" size="sm" onClick={onRetry}>{t("retry")}</Button> : null}
    </div>
  );
}

export function Modal({ open, onClose, children, title, wide }: { open: boolean; onClose: () => void; children: React.ReactNode; title?: string; wide?: boolean }) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center" role="dialog" aria-modal>
      <div className="absolute inset-0 bg-ink/40 backdrop-blur-[2px]" onClick={onClose} />
      <div className={cx(
        "relative z-10 max-h-[92dvh] w-full overflow-y-auto rounded-t-3xl bg-white p-5 shadow-2xl animate-slideUp sm:rounded-3xl sm:animate-fadeUp",
        wide ? "sm:max-w-3xl" : "sm:max-w-md"
      )}>
        {(title) && (
          <div className="mb-4 flex items-center justify-between">
            <h3 className="font-display text-lg font-bold text-ink">{title}</h3>
            <button onClick={onClose} className="rounded-full p-2 text-ink-faint hover:bg-primary-light" aria-label="close"><X size={18} /></button>
          </div>
        )}
        {children}
      </div>
    </div>
  );
}

export function ToastHost() {
  const { toasts } = useStore();
  const icons = { success: CheckCircle2, error: AlertCircle, info: Info };
  const tones = { success: "bg-success", error: "bg-danger", info: "bg-primary" };
  return (
    <div className="pointer-events-none fixed inset-x-0 top-3 z-[80] flex flex-col items-center gap-2 px-4 safe-top">
      {toasts.map(tt => {
        const Icon = icons[tt.kind];
        return (
          <div key={tt.id} className={cx("pointer-events-auto flex max-w-md items-center gap-2 rounded-2xl px-4 py-3 text-sm font-semibold text-white shadow-pop animate-fadeUp", tones[tt.kind])}>
            <Icon size={17} className="shrink-0" />
            <span>{tt.text}</span>
          </div>
        );
      })}
    </div>
  );
}

export function ConfirmHost() {
  const { confirmState, closeConfirm, t } = useStore();
  if (!confirmState) return null;
  return (
    <Modal open onClose={() => closeConfirm(false)} title={confirmState.title}>
      {confirmState.body ? <p className="mb-5 text-sm leading-6 text-ink-soft">{confirmState.body}</p> : <div className="mb-5" />}
      <div className="flex gap-2">
        <Button variant="outline" className="flex-1" onClick={() => closeConfirm(false)}>{t("cancel")}</Button>
        <Button variant={confirmState.danger ? "danger" : "primary"} className="flex-1" onClick={() => closeConfirm(true)}>{t("confirm")}</Button>
      </div>
    </Modal>
  );
}

export function Toggle({ checked, onChange }: { checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <button
      type="button" onClick={() => onChange(!checked)}
      className={cx("relative h-6 w-11 shrink-0 rounded-full transition-colors", checked ? "bg-primary" : "bg-ink/15")}
      aria-pressed={checked}
    >
      <span className={cx("absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-all", checked ? "left-[22px]" : "left-0.5")} />
    </button>
  );
}

export function Tabs({ tabs, active, onChange }: { tabs: { id: string; label: string; count?: number }[]; active: string; onChange: (id: string) => void }) {
  return (
    <div className="no-scrollbar flex gap-1.5 overflow-x-auto rounded-pill bg-primary-light/70 p-1">
      {tabs.map(tb => (
        <button key={tb.id} onClick={() => onChange(tb.id)}
          className={cx("whitespace-nowrap rounded-pill px-3.5 py-1.5 text-[13px] font-semibold transition-all",
            active === tb.id ? "bg-white text-primary-dark shadow-sm" : "text-ink-soft hover:text-primary-dark")}>
          {tb.label}{tb.count != null ? <span className="ml-1 text-[10px] opacity-70">({tb.count})</span> : null}
        </button>
      ))}
    </div>
  );
}

export function Stat({ label, value, tone, icon: Icon }: { label: string; value: React.ReactNode; tone?: string; icon?: React.ComponentType<any> }) {
  return (
    <Card className="p-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-ink-faint">{label}</p>
          <p className={cx("mt-1.5 font-display text-2xl font-bold", tone || "text-ink")}>{value}</p>
        </div>
        {Icon ? <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-primary-light text-primary"><Icon size={18} /></div> : null}
      </div>
    </Card>
  );
}
