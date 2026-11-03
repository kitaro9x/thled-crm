import { NextRequest, NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
const GRAPH = "https://graph.facebook.com/v21.0";
const META_INBOX_APP = "263902037430900"; // Page Inbox / Business Suite (nơi tác nhân AI của Meta trả lời)
/** Handover Protocol: giành quyền hội thoại về CRM (AI Meta ngừng) hoặc trả lại cho Business Suite (AI Meta tiếp tục) */
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const sb = await supabaseServer(); const { data: { user } } = await sb.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const { id } = await params; const { conversation_id, action } = await req.json(); // action: take | release
  const db = supabaseAdmin();
  const { data: ch } = await db.from("crm_channels").select("credentials").eq("id", id).single();
  const { data: cv } = await db.from("crm_conversations").select("id,meta,identity_id, crm_identities(external_id)").eq("id", conversation_id).single();
  const token = (ch?.credentials as any)?.page_access_token; const psid = (cv as any)?.crm_identities?.external_id;
  if (!token || !psid) return NextResponse.json({ error: "Thiếu token page hoặc PSID" }, { status: 400 });
  const url = action === "release" ? `${GRAPH}/me/pass_thread_control` : `${GRAPH}/me/take_thread_control`;
  const body: any = { recipient: { id: psid }, metadata: action === "release" ? "THLED CRM trả lại cho Business Suite" : "THLED CRM nhân viên tự trả lời" };
  if (action === "release") body.target_app_id = META_INBOX_APP;
  const r = await fetch(`${url}?access_token=${encodeURIComponent(token)}`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
  const j = await r.json();
  if (!r.ok || j.error) return NextResponse.json({ error: j.error?.message || "Meta từ chối", code: j.error?.code, detail: j.error }, { status: 400 });
  const meta = ((cv?.meta as any) || {}); meta.ai_meta = { ...(meta.ai_meta || {}), taken_over: action !== "release", handover_at: new Date().toISOString(), by: user.id };
  await db.from("crm_conversations").update({ meta }).eq("id", conversation_id);
  return NextResponse.json({ ok: true, taken_over: action !== "release" });
}
