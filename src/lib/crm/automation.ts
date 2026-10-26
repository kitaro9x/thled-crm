import type { SupabaseClient } from "@supabase/supabase-js";
import type { AutomationRule, RuleCondition, RuleEvent } from "@/lib/types";
import { fbSendMessage } from "@/lib/crm/facebook";
import { pickAssignee } from "./distribution";

/** Render {fullname} {gender} {phone} + spin #text{a|b} */
export function renderTemplate(tpl: string, ctx: Record<string, unknown>) {
  let s = tpl.replace(/#text\{([^}]+)\}/g, (_m, g) => {
    const opts = String(g).split("|");
    return opts[Math.floor(Math.random() * opts.length)].trim();
  });
  s = s.replace(/\{(\w+)\}/g, (_m, k) => String(ctx[k] ?? ""));
  return s.trim();
}

function getField(obj: Record<string, any>, field: string) {
  if (field in obj) return obj[field];
  return obj.custom?.[field];
}
export function matchConditions(conds: RuleCondition[] | null | undefined, obj: Record<string, any>) {
  for (const c of conds || []) {
    const v = getField(obj, c.field);
    const empty = v === null || v === undefined || v === "" || (Array.isArray(v) && !v.length);
    switch (c.op) {
      case "empty": if (!empty) return false; break;
      case "not_empty": if (empty) return false; break;
      case "eq": if (String(v) !== String(c.value)) return false; break;
      case "neq": if (String(v) === String(c.value)) return false; break;
      case "contains": if (!String(v ?? "").toLowerCase().includes(String(c.value ?? "").toLowerCase())) return false; break;
      case "gt": if (!(Number(v) > Number(c.value))) return false; break;
      case "lt": if (!(Number(v) < Number(c.value))) return false; break;
    }
  }
  return true;
}

const dueFrom = (due: string | { d?: number; h?: number; m?: number } | undefined) => {
  const now = new Date();
  if (!due || due === "now") return now.toISOString();
  if (typeof due === "object") { now.setDate(now.getDate() + (due.d || 0)); now.setHours(now.getHours() + (due.h || 0)); now.setMinutes(now.getMinutes() + (due.m || 0)); return now.toISOString(); }
  const end = (d: Date) => { d.setHours(23, 59, 0, 0); return d.toISOString(); };
  if (due === "end_of_day") return end(now);
  if (due === "in_1_day") { now.setDate(now.getDate() + 1); return end(now); }
  if (due === "in_3_days") { now.setDate(now.getDate() + 3); return end(now); }
  if (due === "end_of_week") { now.setDate(now.getDate() + ((7 - now.getDay()) % 7)); return end(now); }
  return now.toISOString();
};

/**
 * Chạy automation cho 1 lead sau sự kiện (clone "Luồng tự động hoá" của SO9).
 * events: created_in_pipeline | moved_to_pipeline | moved_to_other_stage | created_or_moved_to_stage | field_updated
 */
export async function runAutomation(db: SupabaseClient, leadId: string, events: RuleEvent[], changedField?: string, depth = 0) {
  if (depth > 3) return; // chống vòng lặp change_stage → change_stage
  const { data: lead } = await db.from("crm_v_leads").select("*").eq("id", leadId).single();
  if (!lead) return;
  const { data: person } = lead.person_id ? await db.from("crm_customers").select("*").eq("id", lead.person_id).single() : { data: null };

  const { data: rules } = await db
    .from("crm_automation_rules").select("*").eq("pipeline_id", lead.pipeline_id).eq("is_active", true)
    .or(`stage_id.is.null,stage_id.eq.${lead.stage_id}`).order("sort_order");

  for (const rule of (rules || []) as AutomationRule[]) {
    if (!events.includes(rule.event)) continue;
    if (rule.event === "field_updated" && rule.event_field && rule.event_field !== changedField) continue;
    const ctx = { ...lead, phone: person?.phone, fullname: person?.name ?? lead.person_name, gender: person?.gender === "Nữ" ? "chị" : "anh", email: person?.email };
    if (!matchConditions(rule.conditions, ctx)) { continue; }
    const log = (status: string, detail?: string) => db.from("crm_automation_logs").insert({ rule_id: rule.id, lead_id: lead.id, person_id: lead.person_id, status, detail });
    try {
      const cfg = rule.config || {};
      switch (rule.action) {
        case "add_activity": {
          const assignee = cfg.assignee_mode === "fixed" ? cfg.assignee_id : lead.assigned_to;
          await db.from("crm_activities").insert({ type: cfg.type || "call", title: cfg.title || rule.name, description: cfg.description, lead_id: lead.id, person_id: lead.person_id, assignee_id: assignee, due_at: dueFrom(cfg.due), priority: cfg.priority || "medium" });
          break;
        }
        case "change_stage": {
          if (cfg.stage_id && cfg.stage_id !== lead.stage_id) {
            await db.from("crm_leads").update({ stage_id: cfg.stage_id }).eq("id", lead.id);
            await db.from("crm_lead_stage_history").insert({ lead_id: lead.id, from_stage: lead.stage_id, to_stage: cfg.stage_id });
            await runAutomation(db, lead.id, ["created_or_moved_to_stage", "moved_to_other_stage"], undefined, depth + 1);
          }
          break;
        }
        case "change_field": {
          const patchLead: Record<string, unknown> = {}; const customLead = { ...(lead.custom || {}) };
          for (const [k, v] of Object.entries(cfg.fields || {})) { if (["title", "labels", "qualified", "deal_size", "assigned_to"].includes(k)) patchLead[k] = v; else customLead[k] = v; }
          await db.from("crm_leads").update({ ...patchLead, custom: customLead }).eq("id", lead.id);
          break;
        }
        case "distribute_lead": {
          if (lead.assigned_to && !cfg.reassign) { await log("skipped", "đã có người phụ trách"); continue; }
          const m = await pickAssignee(db, { scope: "lead", pipelineId: lead.pipeline_id, phone: person?.phone, targetId: lead.id });
          if (m) await db.from("crm_leads").update({ assigned_to: m }).eq("id", lead.id);
          break;
        }
        case "add_sequence": {
          if (cfg.sequence_id && lead.person_id) await enrollSequence(db, cfg.sequence_id, lead.person_id, lead.id);
          break;
        }
        case "zalo_friend": {
          if (!person?.phone) { await log("skipped", "không có SĐT"); continue; }
          const { data: owner } = lead.assigned_to ? await db.from("crm_members").select("zalo_uid").eq("id", lead.assigned_to).single() : { data: null };
          const { data: exists } = await db.from("crm_zalo_friend_tasks").select("id,status").eq("phone", person.phone).in("status", ["todo", "sent", "accepted"]).limit(1);
          if (exists?.length && cfg.skip_if_friend !== false) { await log("skipped", "đã gửi/đã là bạn"); continue; }
          await db.from("crm_zalo_friend_tasks").insert({
            customer_id: person.id, lead_id: lead.id, rule_id: rule.id, phone: person.phone, source_conversation_id: lead.source_conversation_id,
            greeting: renderTemplate(cfg.greeting || "Xin chào {fullname}, em bên THLED ạ.", ctx).slice(0, 150),
            after_accept_message: cfg.after_accept_message ? renderTemplate(cfg.after_accept_message, ctx) : null,
            notify_old_channel: !!cfg.notify_old_channel, scheduled_at: cfg.send_mode === "schedule" ? cfg.send_at : null,
            context: JSON.stringify({ zalo_uid: cfg.account_mode === "fixed" ? cfg.zalo_uid : owner?.zalo_uid, notify_text: cfg.notify_text }),
          });
          if (cfg.notify_old_channel && lead.source_conversation_id && cfg.notify_text) {
            const { data: conv } = await db.from("crm_v_conversations").select("channel_id,channel_type,external_id").eq("id", lead.source_conversation_id).single();
            if (conv && conv.channel_type !== "zalo_personal") {
              const text = renderTemplate(cfg.notify_text, ctx);
              if (conv.channel_type === "fb_page") {
                // gửi Messenger ngay (trong cửa sổ 24h), không chờ cron
                const { data: ch } = await db.from("crm_channels").select("credentials").eq("id", conv.channel_id).single();
                try {
                  const res = await fbSendMessage(ch?.credentials?.page_access_token, conv.external_id, text);
                  await db.from("crm_messages").insert({ conversation_id: lead.source_conversation_id, direction: "out", type: "text", text, external_msg_id: res?.message_id, status: "sent" });
                } catch (e: any) { await log("error", "Gửi FB thất bại: " + e.message); }
              } else {
                await db.from("crm_outbox").insert({ conversation_id: lead.source_conversation_id, channel_id: conv.channel_id, external_id: conv.external_id, text, source: "automation" });
              }
            }
          }
          break;
        }
        case "create_lead": {
          if (cfg.pipeline_id && cfg.stage_id) await db.from("crm_leads").insert({ title: lead.title, person_id: lead.person_id, pipeline_id: cfg.pipeline_id, stage_id: cfg.stage_id, assigned_to: lead.assigned_to, source_origin: "automation" });
          break;
        }
        case "api_call": {
          if (cfg.url) await fetch(cfg.url, { method: cfg.method || "POST", headers: { "content-type": "application/json", ...(cfg.headers || {}) }, body: JSON.stringify({ lead, person }) });
          break;
        }
        case "required_fields": // chỉ dùng ở UI để chặn chuyển giai đoạn
          break;
      }
      await log("ok");
    } catch (e: any) { await log("error", e?.message); }
  }
}

export async function enrollSequence(db: SupabaseClient, sequenceId: string, personId: string, leadId?: string | null) {
  const { data: seq } = await db.from("crm_sequences").select("id,single_run,status").eq("id", sequenceId).single();
  if (!seq || seq.status !== "active") return;
  if (seq.single_run) {
    const { data: running } = await db.from("crm_sequence_enrollments").select("id").eq("person_id", personId).eq("status", "running").limit(1);
    if (running?.length) return;
  }
  const { data: first } = await db.from("crm_sequence_steps").select("delay_minutes").eq("sequence_id", sequenceId).order("sort_order").limit(1).single();
  const next = new Date(Date.now() + (first?.delay_minutes || 0) * 60000).toISOString();
  await db.from("crm_sequence_enrollments").insert({ sequence_id: sequenceId, person_id: personId, lead_id: leadId, next_run_at: next });
}
