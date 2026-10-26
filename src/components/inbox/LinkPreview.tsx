"use client";
import { useEffect, useState } from "react";
const cache = new Map<string, any>();
export const URL_RE = /https?:\/\/[^\s<>"']+|(?:^|\s)((?:[a-z0-9-]+\.)+(?:vn|com|net|org|io|co)(?:\/[^\s<>"']*)?)/gi;
export function firstUrl(text?: string | null): string | null {
  if (!text) return null; const m = text.match(/https?:\/\/[^\s<>"']+/i) || text.match(/(?:^|\s)((?:[a-z0-9-]+\.)+(?:vn|com|net|org|io|co)(?:\/[^\s<>"']*)?)/i);
  if (!m) return null; const u = (m[1] || m[0]).trim(); return u.startsWith("http") ? u : "https://" + u;
}
export function LinkPreview({ url, dark }: { url: string; dark?: boolean }) {
  const [p, setP] = useState<any>(cache.get(url));
  useEffect(() => { if (cache.has(url)) return; fetch(`/api/link-preview?url=${encodeURIComponent(url)}`).then((r) => r.json()).then((j) => { cache.set(url, j); setP(j); }).catch(() => {}); }, [url]);
  if (!p || (!p.image && !p.description)) return null;
  return (
    <a href={url} target="_blank" rel="noreferrer" className={`block mt-1 rounded-lg overflow-hidden border ${dark ? "border-blue-400/40 bg-blue-500/30" : "border-slate-200 bg-slate-50"}`}>
      {p.image && <img src={p.image} alt="" className="w-full max-h-44 object-cover" />}
      <div className="p-2">
        <div className={`text-xs font-semibold line-clamp-2 ${dark ? "text-white" : "text-slate-800"}`}>{p.title}</div>
        {p.description && <div className={`text-[11px] line-clamp-2 ${dark ? "text-blue-100" : "text-slate-500"}`}>{p.description}</div>}
        <div className={`text-[10px] mt-0.5 ${dark ? "text-blue-200" : "text-slate-400"}`}>{p.site}</div>
      </div>
    </a>
  );
}
