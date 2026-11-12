import { NextRequest, NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { pushToMember } from "@/lib/crm/push";
import { convName } from "@/lib/utils";

const TYPES = ["call", "meeting", "follow_up", "email"];
const PRIORITIES = ["low", "medium", "high"];

/**
 * POST /api/activities — tạo công việc (Hành động) từ hội thoại.
 * { title, type?, description?, attachments?, conversation_id?, person_id?, assignee_id?, due_at?, priority? }
 * Tự gắn cơ hội đang mở của khách (lead_id) → hiện trong Kanban/timeline cơ hội, trigger DB cập nhật next_activity_at.
 * Giao cho người khác → gửi thông báo đẩy tới người đó.
 */
export async function POST(req: NextRequest) {
  const sb = await supabaseServer();
  const { data: { user } } = await sb.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const b = await req.json().catch(() => ({}));
  const title = String(b.title || "").trim();
  if (!title) return NextResponse.json({ error: "Thiếu tên công việc" }, { status: 422 });
  const type = TYPES.includes(b.type) ? b.type : "follow_up";
  const priority = PRIORITIES.includes(b.priority) ? b.priority : "medium";
  const attachments = Array.isArray(b.attachments) ? b.attachments.filter((a: any) => a && typeof a.url === "string").slice(0, 20).map((a: any) => ({ type: a.type || "image", url: a.url, name: a.name || undefined })) : [];
  const due_at = b.due_at && !isNaN(Date.parse(b.due_at)) ? new Date(b.due_at).toISOString() : null;
  const conversation_id = b.conversation_id || null;
  let person_id = b.person_id || null;

  // hội thoại đã gắn khách → lấy khách từ hội thoại (tránh client gửi lệch)
  let who = "";
  if (conversation_id) {
    const { data: c } = await sb.from("crm_v_conversations").select("customer_id,meta,person_name,display_name,external_id").eq("id", conversation_id).maybeSingle();
    if (c) { person_id = c.customer_id || person_id; who = convName(c); }
  }
  let lead_id: string | null = null;
  if (person_id) {
    const { data: l } = await sb.from("crm_leads").select("id").eq("person_id", person_id).eq("status", "open").order("updated_at", { ascending: false }).limit(1).maybeSingle();
    lead_id = l?.id || null;
  }
  const assignee_id = b.assignee_id || user.id;
  const { data, error } = await sb.from("crm_activities").insert({
    type, title: title.slice(0, 300), description: b.description ? String(b.description).slice(0, 4000) : null, attachments,
    conversation_id, person_id, lead_id, assignee_id, due_at, priority, created_by: user.id,
  }).select("id").single();
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });

  if (assignee_id !== user.id) {
    const { data: me } = await sb.from("crm_members").select("name").eq("id", user.id).maybeSingle();
    const due = due_at ? " · hạn " + new Date(due_at).toLocaleString("vi-VN", { timeZone: "Asia/Ho_Chi_Minh", hour: "2-digit", minute: "2-digit", day: "2-digit", month: "2-digit" }) : "";
    await pushToMember(supabaseAdmin(), assignee_id, {
      title: `📋 ${me?.name || "Bạn"} giao việc${who ? " · " + who : ""}`,
      body: title + due,
      url: conversation_id ? `/inbox?c=${conversation_id}` : "/activities",
      tag: `act-${data.id}`,
    });
  }
  return NextResponse.json({ ok: true, id: data.id, lead_id });
}
