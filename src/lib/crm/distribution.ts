import type { SupabaseClient } from "@supabase/supabase-js";

type DistMember = { member_id: string; permission?: "full" | "assigned"; zalo_friend?: boolean; ratio?: number };

/**
 * Chọn nhân sự theo quy tắc phân phối (clone 5 thuật toán SO9).
 * scope: 'conversation' | 'lead'. Trả về member_id hoặc null.
 */
export async function pickAssignee(
  db: SupabaseClient,
  opts: { scope: "conversation" | "lead"; channelId?: string | null; pipelineId?: string | null; phone?: string | null; lastResponderId?: string | null; targetId: string }
): Promise<string | null> {
  let q = db.from("crm_distribution_rules").select("*").eq("scope", opts.scope).eq("is_active", true);
  if (opts.scope === "conversation" && opts.channelId) q = q.eq("channel_id", opts.channelId);
  if (opts.scope === "lead" && opts.pipelineId) q = q.eq("pipeline_id", opts.pipelineId);
  const { data: rules } = await q.limit(1);
  const rule = rules?.[0];
  if (!rule) return null;
  if (rule.only_with_phone && !opts.phone) return null;

  const members: DistMember[] = (rule.members as DistMember[]) || [];
  if (!members.length) return null;
  const ids = members.map((m) => m.member_id);
  const { data: rows } = await db.from("crm_members").select("id,is_online,is_active,shift,max_open_leads,max_open_conversations").in("id", ids);
  const active = (rows || []).filter((r) => r.is_active);
  if (!active.length) return null;

  const now = new Date();
  const inShift = (shift: any) => {
    if (!shift || shift.mode !== "custom") return true;
    const dow = now.getDay() === 0 ? 7 : now.getDay();
    const hm = now.toTimeString().slice(0, 5);
    return (shift.slots || []).some((s: any) => s.dow === dow && s.from <= hm && hm <= s.to);
  };

  let pool = active.map((r) => r.id);
  let picked: string | null = null;

  switch (rule.algorithm) {
    case "phone_prefix": {
      const map = (rule.phone_prefix_map || {}) as Record<string, string>;
      const p = opts.phone || "";
      const key = Object.keys(map).sort((a, b) => b.length - a.length).find((k) => p.startsWith(k));
      picked = key ? map[key] : null;
      break;
    }
    case "responder":
      picked = opts.lastResponderId && pool.includes(opts.lastResponderId) ? opts.lastResponderId : null;
      break;
    case "online_first":
      pool = active.filter((r) => r.is_online).map((r) => r.id);
      break;
    case "shift_first":
      pool = active.filter((r) => inShift(r.shift)).map((r) => r.id);
      break;
    case "round_robin":
    default:
      break;
  }

  // fallback khi không ai online / không trong ca
  if (!picked && !pool.length) {
    if (rule.fallback === "fixed" && rule.fallback_member_id) picked = rule.fallback_member_id;
    else if (rule.fallback === "ratio") pool = active.map((r) => r.id);
    else return null;
  }

  if (!picked) {
    // weighted round robin theo ratio
    const weighted: string[] = [];
    for (const m of members) if (pool.includes(m.member_id)) for (let i = 0; i < Math.max(1, Math.round((m.ratio ?? 1) / 10) || 1); i++) weighted.push(m.member_id);
    if (!weighted.length) return null;
    const idx = (rule.last_index + 1) % weighted.length;
    picked = weighted[idx];
    await db.from("crm_distribution_rules").update({ last_index: idx }).eq("id", rule.id);
  }

  await db.from("crm_distribution_logs").insert({ rule_id: rule.id, target_type: opts.scope, target_id: opts.targetId, member_id: picked, reason: rule.algorithm });
  return picked;
}
