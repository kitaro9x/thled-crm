"use client";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { supabaseBrowser } from "@/lib/supabase/client";
import { normalizePhone } from "@/lib/phone";
export default function Page() {
  const r = useRouter(); const [f, setF] = useState({ name: "", phone: "", email: "", gender: "", address: "" }); const [err, setErr] = useState("");
  const save = async () => { const { data, error } = await supabaseBrowser().from("crm_customers").insert({ ...f, phone: normalizePhone(f.phone) || f.phone || null, gender: f.gender || null, source_origin: "manual" }).select("id").single(); if (error) setErr(error.message.includes("duplicate") ? "Số điện thoại đã tồn tại" : error.message); else r.push(`/cdp/${data.id}`); };
  return <div className="p-6"><div className="card p-4 max-w-md space-y-2"><b>Tạo khách hàng</b>{(["name", "phone", "email", "address"] as const).map((k) => <input key={k} className="input" placeholder={k} value={f[k]} onChange={(e) => setF({ ...f, [k]: e.target.value })} />)}<select className="input" value={f.gender} onChange={(e) => setF({ ...f, gender: e.target.value })}><option value="">Giới tính</option><option>Nam</option><option>Nữ</option></select>{err && <div className="text-red-600 text-sm">{err}</div>}<button className="btn btn-primary" onClick={save}>Tạo khách hàng</button></div></div>;
}
