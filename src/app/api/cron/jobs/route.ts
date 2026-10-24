import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { fbSendMessage } from "@/lib/crm/facebook";
import { renderTemplate, runAutomation } from "@/lib/crm/automation";

export const runtime = "nodejs";
export const maxDuration = 60;

/**
 * Cron mỗi phút (vercel.json). Việc:
 * 1. Gửi outbox đến hạn (fb_page gửi trực tiếp; zalo để worker)
 * 2. Chạy kịch bản nuôi (sequence enrollments)
 * 3. Trigger theo lịch (scheduled)
 * 4. Đánh dấu online/offline nhân sự
 */
export async function GET(req: NextRequest) {
  if (req.headers.get("authorization") !== `Bearer ${process.env.CRON_SECRET}`) return new NextResponse("forbidden", { status: 403 });
  const db = supabaseAdmin();
  const now = new Date().toISOString();
  const report: Record<string, number> = { outbox: 0, sequences: 0, scheduled_rules: 0 };

  // 1. outbox (fb only — zalo worker tự lấy)
  const { data: outbox } = await db.from("crm_outbox").select("*, crm_channels(type,credentials)").eq("status", "queued").or(`scheduled_at.is.null,scheduled_at.lte.${now}`).limit(50);
  for (const o of outbox || []) {
    const ch: any = o.crm_channels;
    if (ch?.type !== "fb_page") continue;
    try {
      const res = await fbSendMessage(ch.credentials.page_access_token, o.external_id, o.text, o.attachments?.[0]?.url, "POST_PURCHASE_UPDATE");
      await db.from("crm_messages").insert({ conversation_id: o.conversation_id, direction: "out", type: "text", text: o.text, attachments: o.attachments, external_msg_id: res.message_id, sender_member_id: o.sent_by, status: "sent" });
      await db.from("crm_outbox").update({ status: "sent", sent_at: now }).eq("id", o.id);
      await db.from("crm_conversations").update({ scheduled_message: null }).eq("id", o.conversation_id);
      report.outbox++;
    } catch (e: any) {
      await db.from("crm_outbox").update({ status: "failed", error: e.message }).eq("id", o.id);
    }
  }

  // 2. sequences
  const { data: enrolls } = await db.from("crm_sequence_enrollments").select("*, crm_sequences(*)").eq("status", "running").lte("next_run_at", now).limit(50);
  for (const en of enrolls || []) {
    const seq: any = en.crm_sequences;
    const { data: steps } = await db.from("crm_sequence_steps").select("*, crm_knowledge(content,attachments)").eq("sequence_id", en.sequence_id).order("sort_order");
    const step = steps?.[en.current_step];
    if (!step) { await db.from("crm_sequence_enrollments").update({ status: "done" }).eq("id", en.id); continue; }
    // chọn kênh theo ưu tiên
    const { data: convs } = await db.from("crm_v_conversations").select("id,channel_id,channel_type,external_id").eq("customer_id", en.person_id);
    const pri: Record<string, number> = seq.channel_priority || {};
    const conv = (convs || []).filter((c) => (seq.channel_mode === "fixed" ? c.channel_type === seq.fixed_channel_type : true)).sort((a, b) => (pri[b.channel_type!] || 0) - (pri[a.channel_type!] || 0))[0];
    if (!conv) { await db.from("crm_sequence_enrollments").update({ status: "error", last_error: "không có kênh" }).eq("id", en.id); continue; }
    const { data: person } = await db.from("crm_customers").select("name,gender,phone").eq("id", en.person_id).single();
    const text = renderTemplate(step.content_override || step.crm_knowledge?.content || "", { fullname: person?.name, gender: person?.gender === "Nữ" ? "chị" : "anh", phone: person?.phone });
    await db.from("crm_outbox").insert({ conversation_id: conv.id, channel_id: conv.channel_id, external_id: conv.external_id, text, attachments: step.crm_knowledge?.attachments || [], source: "sequence" });
    const nextStep = steps![en.current_step + 1];
    await db.from("crm_sequence_enrollments").update({
      current_step: en.current_step + 1, sent_count: en.sent_count + 1,
      next_run_at: nextStep ? new Date(Date.now() + (nextStep.delay_minutes || 0) * 60000).toISOString() : null,
      status: nextStep ? "running" : "done",
    }).eq("id", en.id);
    report.sequences++;
  }

  // 3. scheduled rules
  const { data: rules } = await db.from("crm_automation_rules").select("id,pipeline_id,stage_id").eq("event", "scheduled").eq("is_active", true).lte("schedule_at", now);
  for (const r of rules || []) {
    let q = db.from("crm_leads").select("id").eq("pipeline_id", r.pipeline_id).eq("status", "open");
    if (r.stage_id) q = q.eq("stage_id", r.stage_id);
    const { data: leads } = await q.limit(500);
    for (const l of leads || []) await runAutomation(db, l.id, ["scheduled"]);
    await db.from("crm_automation_rules").update({ is_active: false }).eq("id", r.id);
    report.scheduled_rules++;
  }

  // 4. offline sau 5 phút không heartbeat
  await db.from("crm_members").update({ is_online: false }).lt("last_seen_at", new Date(Date.now() - 5 * 60000).toISOString()).eq("is_online", true);

  return NextResponse.json({ ok: true, ...report });
}
