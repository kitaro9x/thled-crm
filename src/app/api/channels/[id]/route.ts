import { NextRequest, NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { fbSubscribePage } from "@/lib/crm/facebook";
export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params; const sb = await supabaseServer(); const { data: { user } } = await sb.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  await supabaseAdmin().from("crm_channels").delete().eq("id", id);
  return NextResponse.json({ ok: true });
}

/** Chẩn đoán kênh FB: xem app đã subscribe trường nào trên page, và đăng ký lại (POST) */
export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params; const sb = await supabaseServer(); const { data: { user } } = await sb.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const { data: ch } = await supabaseAdmin().from("crm_channels").select("type,external_id,credentials").eq("id", id).single();
  if (!ch || ch.type !== "fb_page") return NextResponse.json({ error: "not fb_page" }, { status: 400 });
  const token = ch.credentials?.page_access_token;
  const subs = await fetch(`https://graph.facebook.com/v21.0/${ch.external_id}/subscribed_apps?access_token=${token}`).then((r) => r.json());
  const perms = await fetch(`https://graph.facebook.com/v21.0/me?fields=id,name,tasks&access_token=${token}`).then((r) => r.json());
  return NextResponse.json({ subscribed_apps: subs, page: perms });
}
export async function POST(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params; const sb = await supabaseServer(); const { data: { user } } = await sb.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const { data: ch } = await supabaseAdmin().from("crm_channels").select("type,external_id,credentials").eq("id", id).single();
  if (!ch || ch.type !== "fb_page") return NextResponse.json({ error: "not fb_page" }, { status: 400 });
  const r = await fbSubscribePage(ch.external_id, ch.credentials?.page_access_token);
  await supabaseAdmin().from("crm_channels").update({ last_error: r?.success ? null : JSON.stringify(r) }).eq("id", id);
  return NextResponse.json(r);
}
