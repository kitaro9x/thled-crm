import { supabaseServer } from "@/lib/supabase/server";
import { AiClient, type AiStats } from "@/components/settings/AiClient";
import { aiCostUsd, mergeAi } from "@/lib/ai-config";
import { LessonsCard } from "@/components/settings/LessonsCard";
import type { Lesson } from "@/lib/lessons";
export const dynamic = "force-dynamic";

export default async function Page() {
  const sb = await supabaseServer();
  const since = new Date(Date.now() - 30 * 86400_000).toISOString();
  const [{ data: rows }, { data: pages }, { data: logs }, { data: lessons }, { data: mem }] = await Promise.all([
    sb.from("crm_settings").select("key,value").in("key", ["ai", "brain_sync"]),
    sb.from("crm_brain_pages").select("path,title,status,updated").order("path"),
    sb.from("crm_ai_logs").select("created_at,feature,model,speed,input_tokens,output_tokens,cache_read_tokens,cache_write_tokens,ok,error,ms").gte("created_at", since).order("created_at", { ascending: false }).limit(5000),
    sb.from("crm_ai_lessons").select("id,created_at,status,created_by,conversation_id,approved_at,brain_exported_at,title,situation,handling,outcome,takeaway,sample_reply,customer_type,tags").order("created_at", { ascending: false }).limit(200),
    sb.from("crm_members").select("id,name"),
  ]);
  const byKey = Object.fromEntries((rows || []).map((r) => [r.key, r.value]));
  const stats: AiStats = { calls: 0, failed: 0, usd: 0, byFeature: {}, errors: [], avgMs: 0 };
  let ms = 0;
  for (const l of logs || []) {
    stats.calls++; if (!l.ok) stats.failed++; ms += l.ms || 0;
    const usd = aiCostUsd(l.model, l); stats.usd += usd;
    const f = (stats.byFeature[l.feature] ||= { calls: 0, usd: 0 }); f.calls++; f.usd += usd;
    if (!l.ok && stats.errors.length < 5) stats.errors.push({ at: l.created_at, feature: l.feature, error: l.error || "" });
  }
  stats.avgMs = stats.calls ? Math.round(ms / stats.calls) : 0;
  return <div className="space-y-3">
    <AiClient
      initial={mergeAi(byKey.ai)}
      brainSync={byKey.brain_sync || null}
      pages={pages || []}
      stats={stats}
      hasKey={!!process.env.ANTHROPIC_API_KEY}
      hasSyncSecret={(process.env.BRAIN_SYNC_SECRET || "").length >= 16}
    />
    <LessonsCard lessons={(lessons || []) as Lesson[]} members={Object.fromEntries((mem || []).map((m) => [m.id, m.name]))} />
  </div>;
}
