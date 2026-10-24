"use client";
import { useState } from "react";
import { supabaseBrowser } from "@/lib/supabase/client";
import { normalizePhone } from "@/lib/phone";
export default function Page() {
  const [log, setLog] = useState(""); 
  const onFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0]; if (!f) return; const text = await f.text();
    const lines = text.replace(/^\uFEFF/, "").split(/\r?\n/).filter(Boolean); const head = lines[0].split(",").map((h) => h.trim().toLowerCase());
    const rows = lines.slice(1).map((l) => { const c = l.split(","); const o: any = {}; head.forEach((h, i) => (o[h] = c[i]?.trim())); return o; });
    const sb = supabaseBrowser(); let ok = 0, dup = 0;
    for (const r of rows) { const { error } = await sb.from("crm_customers").insert({ name: r.name || r.ten, phone: normalizePhone(r.phone || r.sdt), email: r.email || null, address: r.address || null, source_origin: "import", labels: r.labels ? r.labels.split("|") : [] }); if (error) dup++; else ok++; }
    setLog(`Đã nhập ${ok}, bỏ qua (trùng/lỗi) ${dup}`);
  };
  return <div className="p-6"><div className="card p-4 max-w-lg space-y-2 text-sm"><b>Import khách hàng (CSV)</b><p className="text-slate-500">Cột: name, phone, email, address, labels (a|b). Tối đa vài nghìn dòng/lần. Trùng SĐT sẽ bị bỏ qua.</p><input type="file" accept=".csv" onChange={onFile} />{log && <div className="text-emerald-700">{log}</div>}</div></div>;
}
