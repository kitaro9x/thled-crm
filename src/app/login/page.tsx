"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { supabaseBrowser } from "@/lib/supabase/client";

export default function Login() {
  const r = useRouter();
  const [email, setEmail] = useState(""); const [pw, setPw] = useState(""); const [err, setErr] = useState<string | null>(null); const [busy, setBusy] = useState(false);
  const submit = async (e: React.FormEvent) => {
    e.preventDefault(); setBusy(true); setErr(null);
    const { error } = await supabaseBrowser().auth.signInWithPassword({ email, password: pw });
    setBusy(false);
    if (error) setErr(error.message); else { r.replace("/inbox"); r.refresh(); }
  };
  return (
    <div className="min-h-screen grid place-items-center bg-slate-100">
      <form onSubmit={submit} className="card w-[360px] p-6 space-y-4">
        <div><div className="text-xl font-bold text-blue-700">THLED CRM</div><div className="text-slate-500 text-sm">Đăng nhập để tiếp tục</div></div>
        <input className="input" placeholder="Email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
        <input className="input" placeholder="Mật khẩu" type="password" value={pw} onChange={(e) => setPw(e.target.value)} required />
        {err && <div className="text-red-600 text-sm">{err}</div>}
        <button className="btn btn-primary w-full justify-center" disabled={busy}>{busy ? "Đang vào..." : "Đăng nhập"}</button>
      </form>
    </div>
  );
}
