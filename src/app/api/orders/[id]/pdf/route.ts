import { NextRequest, NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { buildOrderPdf } from "@/lib/crm/order-pdf";
export const runtime = "nodejs"; export const dynamic = "force-dynamic";
async function load(id: string) {
  const sb = await supabaseServer(); const { data: { user } } = await sb.auth.getUser(); if (!user) return null;
  const { data: o } = await sb.from("crm_orders").select("*, crm_customers(name,phone,address)").eq("id", id).single(); if (!o) return null;
  const { data: company } = await sb.from("crm_settings").select("value").eq("key", "company").maybeSingle();
  return { o, company: company?.value || {}, user };
}
/** GET → tải PDF trực tiếp */
export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params; const x = await load(id); if (!x) return NextResponse.json({ error: "not found" }, { status: 404 });
  const pdf = await buildOrderPdf(x.o, x.company);
  return new NextResponse(new Uint8Array(pdf), { headers: { "content-type": "application/pdf", "content-disposition": `attachment; filename="${(x.o.code || "don-hang").replace(/[^\w-]/g, "_")}.pdf"` } });
}
/** POST → dựng PDF, lưu lên kho crm-media, trả URL để gửi qua hội thoại */
export async function POST(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params; const x = await load(id); if (!x) return NextResponse.json({ error: "not found" }, { status: 404 });
  const pdf = await buildOrderPdf(x.o, x.company);
  const name = `${(x.o.code || "don-hang").replace(/[^\w-]/g, "_")}.pdf`; const path = `orders/${id}/${Date.now()}-${name}`;
  const db = supabaseAdmin(); const { error } = await db.storage.from("crm-media").upload(path, pdf, { contentType: "application/pdf", upsert: true });
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  const { data } = db.storage.from("crm-media").getPublicUrl(path);
  return NextResponse.json({ url: data.publicUrl, name });
}
