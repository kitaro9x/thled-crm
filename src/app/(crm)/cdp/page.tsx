import Link from "next/link";
import { supabaseServer } from "@/lib/supabase/server";
import { Avatar } from "@/components/Avatar";
import { ago } from "@/lib/utils";
export const dynamic = "force-dynamic";
export default async function Page({ searchParams }: { searchParams: Promise<{ q?: string; page?: string }> }) {
  const { q = "", page = "1" } = await searchParams;
  const sb = await supabaseServer();
  const from = (Number(page) - 1) * 50;
  let query = sb.from("crm_customers").select("*, crm_members!crm_customers_assigned_to_fkey(name)", { count: "exact" }).order("created_at", { ascending: false }).range(from, from + 49);
  if (q) query = query.or(`name.ilike.%${q}%,phone.ilike.%${q}%,email.ilike.%${q}%`);
  const { data, count } = await query;
  return (
    <div className="h-full flex flex-col">
      <div className="px-4 py-2 bg-white border-b border-slate-200 flex items-center gap-2"><b>Dữ liệu khách hàng</b><span className="text-slate-400 text-sm">{count} khách</span>
        <form className="ml-4"><input name="q" defaultValue={q} className="input w-72" placeholder="Tìm tên, email, SĐT" /></form>
        <div className="ml-auto flex gap-2"><Link href="/cdp/import" className="btn">Import</Link><a href="/api/export/customers" className="btn">Export CSV</a><Link href="/cdp/new" className="btn btn-primary">+ Customer</Link></div>
      </div>
      <div className="flex-1 overflow-auto p-4">
        <table className="w-full text-sm card bg-white">
          <thead className="bg-slate-50 text-xs text-slate-500 text-left"><tr><th className="p-2">#</th><th className="p-2">Name</th><th className="p-2">Phone</th><th className="p-2">Email</th><th className="p-2">Nhãn</th><th className="p-2">Phụ trách</th><th className="p-2">Lead</th><th className="p-2">Đơn</th><th className="p-2">Tin cuối</th></tr></thead>
          <tbody>{(data || []).map((p: any, i) => <tr key={p.id} className="border-t border-slate-100 hover:bg-blue-50"><td className="p-2 text-slate-400">{(count || 0) - from - i}</td><td className="p-2"><Link href={`/cdp/${p.id}`} className="flex items-center gap-2 font-medium"><Avatar src={p.avatar_url} name={p.name} size={26} />{p.name}</Link></td><td className="p-2">{p.phone || "-"}</td><td className="p-2">{p.email || "-"}</td><td className="p-2">{p.labels?.map((l: string) => <span key={l} className="chip bg-slate-100 mr-1">{l}</span>)}</td><td className="p-2">{p.crm_members?.name || "-"}</td><td className="p-2">{p.total_leads}</td><td className="p-2">{p.total_orders}</td><td className="p-2 text-slate-500">{ago(p.last_message_at)}</td></tr>)}</tbody>
        </table>
        <div className="flex gap-2 mt-3">{Number(page) > 1 && <Link className="btn" href={`/cdp?q=${q}&page=${Number(page) - 1}`}>Trước</Link>}{from + 50 < (count || 0) && <Link className="btn" href={`/cdp?q=${q}&page=${Number(page) + 1}`}>Sau</Link>}</div>
      </div>
    </div>
  );
}
