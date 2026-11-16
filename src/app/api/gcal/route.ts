import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { currentMember } from "@/lib/crm/work-items-server";
import { maskIcsUrl, normalizeIcsUrl, syncFeed } from "@/lib/crm/gcal-sync";
import { vnDay } from "@/lib/work-items";

export const runtime = "nodejs";
export const maxDuration = 60;

/**
 * Kết nối Google Calendar (địa chỉ bí mật iCal) của người đang đăng nhập.
 * GET: trạng thái lịch của tôi + ai trong nhóm đã kết nối (không bao giờ trả link đầy đủ)
 * PUT { url, list_id? }: lưu + đồng bộ ngay (link sai → không lưu)
 * DELETE: ngắt kết nối + ẩn các việc chưa làm từ hôm nay trở đi đã nhập từ lịch
 */
export async function GET() {
  const me = await currentMember();
  if (!me) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const db = supabaseAdmin();
  const { data: feeds } = await db.from("crm_gcal_feeds").select("member_id,ics_url,list_id,last_synced_at,last_error,last_count,crm_members(name)");
  const mine = (feeds || []).find((f: any) => f.member_id === me.id);
  return NextResponse.json({
    mine: mine ? { url: maskIcsUrl(mine.ics_url), list_id: mine.list_id, last_synced_at: mine.last_synced_at, last_error: mine.last_error, last_count: mine.last_count } : null,
    team: (feeds || []).map((f: any) => ({ member_id: f.member_id, name: f.crm_members?.name || "?", last_synced_at: f.last_synced_at, ok: !f.last_error })),
  });
}

export async function PUT(req: NextRequest) {
  const me = await currentMember();
  if (!me) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  if (!me.email) return NextResponse.json({ error: "Tài khoản chưa có email trong Cài đặt → Nhân sự" }, { status: 422 });
  const b = await req.json().catch(() => ({}));
  const db = supabaseAdmin();
  const { data: cur } = await db.from("crm_gcal_feeds").select("ics_url,list_id").eq("member_id", me.id).maybeSingle();
  // không nhập link mới → giữ link cũ (chỉ đổi danh sách)
  const url = b.url ? normalizeIcsUrl(b.url) : cur?.ics_url || null;
  if (!url) return NextResponse.json({ error: "Link không đúng. Cần “Địa chỉ bí mật ở định dạng iCal”, dạng https://calendar.google.com/calendar/ical/…/basic.ics" }, { status: 422 });

  let list_id: string | null = null;
  if (b.list_id) {
    const { data: l } = await db.from("task_lists").select("id,name,owner_email").eq("id", b.list_id).maybeSingle();
    if (l && String(l.owner_email).toLowerCase() === me.email.toLowerCase()) list_id = l.id; // chỉ danh sách của chính mình trên /congviec
  }
  const feed = { member_id: me.id, ics_url: url, list_id, last_synced_at: null };
  try {
    // thử đọc lịch trước khi lưu: link sai thì báo ngay
    await db.from("crm_gcal_feeds").upsert({ ...feed, updated_at: new Date().toISOString() });
    const r = await syncFeed(db, feed, me.email);
    return NextResponse.json({ ok: true, ...r });
  } catch (e: any) {
    if (cur) await db.from("crm_gcal_feeds").update({ ics_url: cur.ics_url, list_id: cur.list_id }).eq("member_id", me.id); // quay về cài đặt cũ
    else await db.from("crm_gcal_feeds").delete().eq("member_id", me.id);
    return NextResponse.json({ error: "Không đọc được lịch: " + (e?.message || e) }, { status: 422 });
  }
}

export async function DELETE() {
  const me = await currentMember();
  if (!me) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const db = supabaseAdmin();
  await db.from("crm_gcal_feeds").delete().eq("member_id", me.id);
  if (me.email) {
    await db.from("tasks").update({ deleted_at: new Date().toISOString() }).eq("source", "gcal").eq("owner_email", me.email.toLowerCase())
      .is("deleted_at", null).neq("status", "done").gte("due_date", vnDay(new Date()));
  }
  return NextResponse.json({ ok: true });
}
