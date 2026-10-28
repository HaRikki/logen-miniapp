import React, { useCallback } from "react";
import { api } from "../lib/api";
import { useStore } from "../state/store";

/** Uploads an image via admin endpoint, returns public URL ("" on failure toast). */
export function useImageUpload(): { uploading: boolean; upload: (file: File) => Promise<string | null> } {
  const [uploading, setUp] = React.useState(false);
  const { toast } = useStore();
  const upload = useCallback(async (file: File): Promise<string | null> => {
    setUp(true);
    try {
      const form = new FormData();
      form.append("file", file);
      const r = await api.upload<{ url: string }>("/api/admin/uploads/image", form);
      return r.url;
    } catch (e: any) {
      toast("error", e?.message || "upload failed");
      return null;
    } finally { setUp(false); }
  }, [toast]);
  return { uploading, upload };
}

export function ImagePicker({ value, onChange }: { value?: string | null; onChange: (url: string | null) => void }) {
  const { uploading, upload } = useImageUpload();
  const ref = React.useRef<HTMLInputElement>(null);
  return (
    <div className="flex items-center gap-2">
      <div className="flex h-14 w-24 shrink-0 items-center justify-center overflow-hidden rounded-xl border border-dashed border-ink/15 bg-canvas text-[10px] font-bold text-ink-faint">
        {value ? <img src={value} alt="" className="h-full w-full object-cover" /> : (uploading ? "…" : "none")}
      </div>
      <input ref={ref} type="file" accept="image/*" className="hidden" onChange={async e => {
        const f = e.target.files?.[0];
        if (f) { const u = await upload(f); if (u) onChange(u); }
        e.target.value = "";
      }} />
      <button type="button" onClick={() => ref.current?.click()} disabled={uploading}
        className="rounded-xl border border-ink/10 bg-white px-3 py-2 text-xs font-bold text-ink-soft shadow-card active:scale-95 disabled:opacity-50">
        {uploading ? "Uploading…" : value ? "Replace" : "Upload"}
      </button>
      {value ? (
        <>
          <button type="button" onClick={() => onChange(null)} className="rounded-lg px-2 py-2 text-ink-faint hover:text-danger">✕</button>
          <input value={value} onChange={e => onChange(e.target.value)} className="hidden" aria-hidden />
        </>
      ) : null}
    </div>
  );
}
