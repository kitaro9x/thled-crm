import { NextRequest, NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { runAutomation } from "@/lib/crm/automation";

/** PATCH /api/leads  { id, stage_id?, assigned_to?, qualified?, deal_size?, lost_reason?, custom? } — chạy automation sau khi đổi */
export async function PATCH(req: NextRequest) {
  const sb = await supabaseServer();
  const { data: { user } } = await sb.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const { id, ...patch } = await req.json();
  const db = supabaseAdmin();
  const { data: before } = await db.from("crm_leads").select("stage_id,pipeline_id").eq("id", id).single();
  // required_fields rule: chặn chuyển stage nếu thiếu trường
  if (patch.stage_id && before && patch.stage_id !== before.stage_id) {
    const { data: rules } = await db.from("crm_automation_rules").select("config").eq("pipeline_id", before.pipeline_id).eq("stage_id", patch.stage_id).eq("action", "required_fields").eq("is_active", true);
    const { data: lead } = await db.from("crm_v_leads").select("*").eq("id", id).single();
    for (const r of rules || []) for (const f of r.config?.fields || []) {
      const v = (lead as any)?.[f] ?? (lead as any)?.custom?.[f] ?? (f === "phone" ? (lead as any)?.person_phone : undefined);
      if (v === null || v === undefined || v === "") return NextResponse.json({ error: `Thiếu trường bắt buộc: ${f}` }, { status: 422 });
    }
  }
  const { error } = await db.from("crm_leads").update(patch).eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  if (patch.stage_id && before && patch.stage_id !== before.stage_id) {
    await db.from("crm_lead_stage_history").insert({ lead_id: id, from_stage: before.stage_id, to_stage: patch.stage_id, changed_by: user.id });
    await runAutomation(db, id, ["created_or_moved_to_stage", "moved_to_other_stage"]);
  } else {
    const field = Object.keys(patch)[0];
    await runAutomation(db, id, ["field_updated"], field);
  }
  return NextResponse.json({ ok: true });
}

/** POST /api/leads — tạo cơ hội thủ công */
export async function POST(req: NextRequest) {
  const sb = await supabaseServer();
  const { data: { user } } = await sb.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const body = await req.json();
  const db = supabaseAdmin();
  // chống tạo trùng: khách đã có cơ hội mở trong cùng phễu → trả về cơ hội đó (trừ khi force=true)
  if (body.person_id && body.pipeline_id && !body.force) {
    const { data: open } = await db.from("crm_leads").select("id").eq("person_id", body.person_id).eq("pipeline_id", body.pipeline_id).eq("status", "open").limit(1);
    if (open?.length) return NextResponse.json({ ok: true, id: open[0].id, existing: true });
  }
  delete body.force;
  const { data, error } = await db.from("crm_leads").insert({ ...body, source_origin: "manual", created_by: user.id, assigned_to: body.assigned_to || user.id }).select("id").single();
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  await runAutomation(db, data.id, ["created_in_pipeline", "created_or_moved_to_stage"]);
  return NextResponse.json({ ok: true, id: data.id });
}
