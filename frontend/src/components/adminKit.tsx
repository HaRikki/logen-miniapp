import React, { useCallback, useEffect, useRef, useState } from "react";
import { Loader2 } from "lucide-react";
import { api } from "../lib/api";

/** small data hook: GET with refresh + loading/errors */
export function useLoad<T>(path: string | null, deps: unknown[] = []): { data: T | null; loading: boolean; error: string | null; reload: () => void; setData: (d: T) => void } {
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState(!!path);
  const [error, setError] = useState<string | null>(null);
  const [tick, setTick] = useState(0);
  const alive = useRef(true);
  useEffect(() => () => { alive.current = false; }, []);
  useEffect(() => {
    if (!path) return;
    setLoading(true); setError(null);
    api.get<T>(path)
      .then((d: T) => { if (alive.current) setData(d); })
      .catch((e: any) => { if (alive.current) setError(e?.message || "load failed"); })
      .finally(() => { if (alive.current) setLoading(false); });
  }, [path, tick, ...deps]);
  const reload = useCallback(() => setTick(t => t + 1), []);
  return { data, loading, error, reload, setData };
}

export function Pager({ page, pages, onPage }: { page: number; pages: number; onPage: (p: number) => void }) {
  if (pages <= 1) return null;
  return (
    <div className="mt-4 flex items-center justify-end gap-1.5 text-sm">
      <button disabled={page <= 1} onClick={() => onPage(page - 1)} className="rounded-lg border border-ink/10 bg-white px-3 py-1.5 font-semibold disabled:opacity-40">←</button>
      <span className="px-1 text-ink-soft">{page} / {pages}</span>
      <button disabled={page >= pages} onClick={() => onPage(page + 1)} className="rounded-lg border border-ink/10 bg-white px-3 py-1.5 font-semibold disabled:opacity-40">→</button>
    </div>
  );
}

export function Table({ head, children, className }: { head: string[] | React.ReactNode; children: React.ReactNode; className?: string }) {
  return (
    <div className={`admin-scroll overflow-x-auto rounded-card border border-ink/5 bg-white shadow-card ${className || ""}`}>
      <table className="w-full min-w-[720px] text-left text-[13px]">
        <thead>
          <tr className="border-b border-ink/5 bg-canvas/60 text-[11px] uppercase tracking-wider text-ink-faint">
            {Array.isArray(head)
              ? head.map((h, i) => <th key={i} className="px-3.5 py-3 font-bold">{h}</th>)
              : head}
          </tr>
        </thead>
        <tbody className="divide-y divide-ink/5">{children}</tbody>
      </table>
    </div>
  );
}

export function Td({ children, className }: { children?: React.ReactNode; className?: string }) {
  return <td className={`px-3.5 py-3 align-middle ${className || ""}`}>{children}</td>;
}

export function Loading({ inline }: { inline?: boolean }) {
  return <div className={`flex items-center justify-center gap-2 ${inline ? "py-6" : "py-20"} text-sm font-semibold text-ink-faint`}><Loader2 size={18} className="animate-spin text-primary" /> Loading…</div>;
}

export function SearchBox({ value, onChange, placeholder }: { value: string; onChange: (v: string) => void; placeholder?: string }) {
  return (
    <input
      value={value}
      onChange={e => onChange(e.target.value)}
      onKeyDown={e => { if (e.key === "Enter") (e.target as HTMLInputElement).blur(); }}
      placeholder={placeholder || "Search…"}
      className="w-full rounded-xl border border-ink/10 bg-white px-3.5 py-2.5 text-sm outline-none focus:border-primary/40 focus:ring-2 focus:ring-primary/25 md:w-64"
    />
  );
}

/** money input in major units, returns minor */
export function AmountInput({ value, onChange, placeholder }: { value: string; onChange: (major: string) => void; placeholder?: string }) {
  return (
    <div className="relative">
      <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-sm font-bold text-ink-faint">$</span>
      <input
        type="number" inputMode="decimal" min="0" step="0.01"
        value={value} placeholder={placeholder || "0.00"}
        onChange={e => onChange(e.target.value)}
        className="w-full rounded-xl border border-ink/10 bg-white py-2.5 pl-8 pr-3 text-sm outline-none focus:border-primary/40 focus:ring-2 focus:ring-primary/25"
      />
    </div>
  );
}

export const majorToMinor = (v: string | number) => Math.round((Number(v) || 0) * 100);
export const minorToMajor = (v: unknown) => (Number(v) || 0) / 100;
