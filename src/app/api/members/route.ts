import { NextRequest, NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
/** Admin tạo user Supabase Auth + crm_members */
export async function POST(req: NextRequest) {
  const sb = await supabaseServer(); const { data: { user } } = await sb.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const { data: me } = await sb.from("crm_members").select("role").eq("id", user.id).single();
  if (me?.role !== "admin") return NextResponse.json({ error: "Chỉ admin" }, { status: 403 });
  const { email, password, name, role } = await req.json();
  const admin = supabaseAdmin();
  const { data, error } = await admin.auth.admin.createUser({ email, password, email_confirm: true });
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  await admin.from("crm_members").insert({ id: data.user.id, name, email, role });
  return NextResponse.json({ ok: true });
}
