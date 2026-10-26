import type { SupabaseClient } from "@supabase/supabase-js";
import { extractPhone, normalizePhone } from "@/lib/phone";
import type { Attachment, ChannelType, LeadSource } from "@/lib/types";
import { runAutomation } from "./automation";
import { pickAssignee } from "./distribution";

export interface InboundMessage {
  channelType: ChannelType;
  channelExternalId: string;          // page_id / zalo own uid
  senderExternalId: string;           // PSID / zalo uid
  senderName?: string | null;
  senderAvatar?: string | null;
  senderPhone?: string | null;        // Zalo cá nhân thường biết SĐT bạn bè
  text?: string | null;
  type?: string;                      // text|image|file|sticker|call|location
  attachments?: Attachment[];
  externalMsgId?: string | null;
  sentAt?: string | null;
  direction?: "in" | "out";           // tin do chính mình gửi từ app Zalo/FB khác cũng đồng bộ về
  referral?: { source?: string; type?: string; ad_id?: string; ref?: string; ads_context?: any }; // click-to-Messenger từ quảng cáo
  kind?: "inbox" | "comment";
  postId?: string | null;
  raw?: unknown;
}

/**
 * Nhận 1 tin nhắn từ kênh bất kỳ → identity → conversation → message
 * → Nguồn khách hàng (bắt SĐT, dedupe, tạo person + lead) → automation → phân phối hội thoại.
 */
export async function ingestMessage(db: SupabaseClient, m: InboundMessage) {
  const { data: channel } = await db.from("crm_channels").select("id,type,name").eq("type", m.channelType).eq("external_id", m.channelExternalId).single();
  if (!channel) throw new Error(`Kênh chưa kết nối: ${m.channelType}/${m.channelExternalId}`);

  // 1. identity
  const { data: identity, error: idErr } = await db
    .from("crm_identities")
    .upsert(
      { channel_id: channel.id, channel: m.channelType, external_id: m.senderExternalId, display_name: m.senderName ?? undefined, avatar_url: m.senderAvatar ?? undefined, phone: normalizePhone(m.senderPhone) ?? undefined },
      { onConflict: "channel_id,external_id", ignoreDuplicates: false }
    )
    .select("id,customer_id,display_name,avatar_url,phone").single();
  if (!identity) throw new Error("identity upsert failed: " + (idErr?.message || "unknown"));

  // 2. conversation (1 identity = 1 inbox conversation; comment = theo post)
  const kind = m.kind || "inbox";
  let convQ = db.from("crm_conversations").select("*").eq("identity_id", identity.id).eq("kind", kind);
  convQ = m.postId ? convQ.eq("post_id", m.postId) : convQ.is("post_id", null);
  let { data: conv } = await convQ.limit(1).maybeSingle();
  const isNew = !conv;
  if (!conv) {
    const ins = await db.from("crm_conversations").insert({ identity_id: identity.id, customer_id: identity.customer_id, channel_id: channel.id, channel: m.channelType, kind, post_id: m.postId ?? null, status: "open" }).select("*").single();
    conv = ins.data;
  }
  if (!conv) throw new Error("conversation create failed");

  // 3. message (idempotent theo external_msg_id)
  const direction = m.direction || "in";
  const { data: msg, error } = await db.from("crm_messages").insert({
    conversation_id: conv.id, direction, type: m.type || "text", text: m.text ?? null, attachments: m.attachments || [],
    external_msg_id: m.externalMsgId ?? null, sent_at: m.sentAt || new Date().toISOString(), raw: m.raw ?? null, status: "sent",
  }).select("id").single();
  if (error && !/duplicate/i.test(error.message)) throw error;
  if (!msg) return { conversationId: conv.id, duplicate: true };

  // nguồn quảng cáo (click-to-Messenger)
  if (m.referral?.ad_id || m.referral?.source === "ADS") {
    const meta = { ...(conv.meta || {}), referral: m.referral, ad_id: m.referral.ad_id, ad_title: m.referral.ads_context?.ad_title };
    const labels: string[] = Array.from(new Set([...(conv.labels || []), "Quảng cáo"]));
    await db.from("crm_conversations").update({ meta, labels }).eq("id", conv.id);
    if (conv.customer_id) await db.from("crm_customers").update({ utm: { source: "facebook_ads", ad_id: m.referral.ad_id, ad_title: m.referral.ads_context?.ad_title } }).eq("id", conv.customer_id).is("utm", null);
  }

  if (direction !== "in") return { conversationId: conv.id, messageId: msg.id };

  // 4. Nguồn khách hàng → person + lead
  const phone = normalizePhone(m.senderPhone) || extractPhone(m.text) || identity.phone;
  const personId = await applyLeadSources(db, { channelId: channel.id, conversation: conv, identity, phone, email: null, isNewConversation: isNew });

  // 5. Phân phối hội thoại (chỉ khi chưa có người phụ trách)
  if (!conv.assigned_to) {
    const assignee = await pickAssignee(db, { scope: "conversation", channelId: channel.id, phone, targetId: conv.id });
    if (assignee) await db.from("crm_conversations").update({ assigned_to: assignee }).eq("id", conv.id);
  }
  return { conversationId: conv.id, messageId: msg.id, personId };
}

async function applyLeadSources(
  db: SupabaseClient,
  a: { channelId: string; conversation: any; identity: any; phone: string | null; email: string | null; isNewConversation: boolean }
): Promise<string | null> {
  // blacklist SĐT (hotline, nhân viên)
  if (a.phone) {
    const { data: s } = await db.from("crm_settings").select("value").eq("key", "phone").maybeSingle();
    if ((s?.value?.blacklist || []).includes(a.phone)) a.phone = null;
  }
  const { data: sources } = await db.from("crm_lead_sources").select("*").eq("type", "conversation").eq("is_active", true);
  let personId: string | null = a.conversation.customer_id ?? a.identity.customer_id ?? null;

  for (const src of (sources || []) as LeadSource[]) {
    if (src.channel_ids?.length && !src.channel_ids.includes(a.channelId)) continue;
    const shouldCreate = (src.create_when_phone && a.phone) || (src.create_when_email && a.email) || (src.create_when_new_conversation && a.isNewConversation);
    if (!personId && !shouldCreate) continue;

    const ownerFor = (mode: string, fixed?: string | null) => (mode === "fixed" ? fixed : mode === "current" ? a.conversation.assigned_to : null);
    const hadPerson = !!personId;

    if (!personId) {
      // dedupe
      let existing: any = null;
      if (src.dedupe_phone && a.phone) existing = (await db.from("crm_customers").select("id").eq("phone", a.phone).maybeSingle()).data;
      if (!existing && src.dedupe_email && a.email) existing = (await db.from("crm_customers").select("id").eq("email", a.email).maybeSingle()).data;
      if (existing) {
        if (src.on_duplicate === "skip") continue;
        personId = existing.id;
        const ad = src.after_duplicate || {};
        if (ad.note) await db.from("crm_activities").insert({ type: "note", title: ad.note, person_id: personId, conversation_id: a.conversation.id });
        if (ad.activity?.type) await db.from("crm_activities").insert({ type: ad.activity.type, title: ad.activity.title || "Khách cũ nhắn lại", person_id: personId, conversation_id: a.conversation.id, assignee_id: ownerFor(ad.activity.assignee_mode || "current", ad.activity.assignee_id), due_at: ad.activity.due_at || new Date(Date.now() + 86400000).toISOString() });
      } else {
        const ins = await db.from("crm_customers").insert({
          name: a.identity.display_name || a.phone || "Khách mới", phone: a.phone, email: a.email, avatar_url: a.identity.avatar_url,
          assigned_to: ownerFor(src.owner_mode, src.owner_id), source_origin: "automation", source_id: src.id, source_channel_id: a.channelId,
        }).select("id").single();
        personId = ins.data?.id ?? null;
      }
      if (personId) {
        await db.from("crm_conversations").update({ customer_id: personId }).eq("id", a.conversation.id);
        await db.from("crm_identities").update({ customer_id: personId }).eq("id", a.identity.id);
      }
    }
    // đồng bộ tên: tên Facebook là tên chính; tên Zalo lưu vào cột zalo
    if (personId && a.identity.display_name) {
      const { data: cur } = await db.from("crm_customers").select("name,zalo,source_channel_id").eq("id", personId).single();
      const { data: ch } = await db.from("crm_channels").select("type").eq("id", a.channelId).single();
      if (ch?.type === "fb_page" && cur && cur.name !== a.identity.display_name && (!cur.name || cur.name === cur.zalo || /^(Khách mới|0\d{9})$/.test(cur.name))) await db.from("crm_customers").update({ name: a.identity.display_name }).eq("id", personId);
      if (ch?.type === "zalo_personal" && cur) {
        const patch: Record<string, string> = {};
        if (!cur.zalo) patch.zalo = a.identity.display_name;
        if (!cur.name || /^(Khách mới|0\d{9})$/.test(cur.name)) patch.name = a.identity.display_name; // chưa có tên FB → dùng tên Zalo
        if (Object.keys(patch).length) await db.from("crm_customers").update(patch).eq("id", personId);
      }
    }
    if (personId && a.phone && hadPerson) {
      // khách đã có: thiếu phone → điền; có phone khác → lưu vào custom.phones (SĐT phụ)
      const { data: cur } = await db.from("crm_customers").select("phone,custom").eq("id", personId).single();
      if (!cur?.phone) await db.from("crm_customers").update({ phone: a.phone }).eq("id", personId);
      else if (cur.phone !== a.phone) {
        const extra: string[] = Array.isArray(cur.custom?.phones) ? cur.custom.phones : [];
        if (!extra.includes(a.phone)) await db.from("crm_customers").update({ custom: { ...(cur.custom || {}), phones: [...extra, a.phone] } }).eq("id", personId);
      }
    }

    // tạo cơ hội
    if (personId && src.create_lead && src.pipeline_id && src.stage_id) {
      if (src.lead_mode === "if_none") {
        const { data: open } = await db.from("crm_leads").select("id").eq("person_id", personId).eq("status", "open").limit(1);
        if (open?.length) continue;
      }
      const { data: p } = await db.from("crm_customers").select("name").eq("id", personId).single();
      const { data: lead } = await db.from("crm_leads").insert({
        title: p?.name || "Cơ hội mới", person_id: personId, pipeline_id: src.pipeline_id, stage_id: src.stage_id,
        assigned_to: ownerFor(src.lead_owner_mode, src.lead_owner_id), subscribers: src.lead_followers || [],
        source_origin: "automation", source_id: src.id, source_channel_id: a.channelId, source_conversation_id: a.conversation.id,
      }).select("id").single();
      if (lead) await runAutomation(db, lead.id, ["created_in_pipeline", "created_or_moved_to_stage"]);
    }
  }
  return personId;
}
