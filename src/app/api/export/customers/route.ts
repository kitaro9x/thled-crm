import { supabaseServer } from "@/lib/supabase/server";
export async function GET() {
  const sb = await supabaseServer();
  const { data } = await sb.from("crm_customers").select("name,phone,email,gender,labels,source_origin,total_leads,total_orders,created_at").order("created_at");
  const rows = [["name","phone","email","gender","labels","source","leads","orders","created_at"], ...(data || []).map((p) => [p.name, p.phone, p.email, p.gender, (p.labels || []).join("|"), p.source_origin, p.total_leads, p.total_orders, p.created_at])];
  const csv = "﻿" + rows.map((r) => r.map((v) => `"${String(v ?? "").replace(/"/g, '""')}"`).join(",")).join("\n");
  return new Response(csv, { headers: { "content-type": "text/csv; charset=utf-8", "content-disposition": "attachment; filename=customers.csv" } });
}
