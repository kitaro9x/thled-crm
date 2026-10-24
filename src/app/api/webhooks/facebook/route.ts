import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { ingestMessage } from "@/lib/crm/ingest";
import { fbGetProfile, fbLikeComment, fbReplyComment, fbPrivateReply, fbHideComment } from "@/lib/crm/facebook";
import { renderTemplate } from "@/lib/crm/automation";

export const runtime = "nodejs";

// Xác thực webhook (Meta Developer → Webhooks → Callback URL: https://<domain>/api/webhooks/facebook)
export async function GET(req: NextRequest) {
  const q = req.nextUrl.searchParams;
  if (q.get("hub.mode") === "subscribe" && q.get("hub.verify_token") === process.env.FB_VERIFY_TOKEN) {
    return new NextResponse(q.get("hub.challenge"), { status: 200 });
  }
  return new NextResponse("forbidden", { status: 403 });
}

export async function POST(req: NextRequest) {
  const raw = await req.text();
  // verify X-Hub-Signature-256
  const sig = req.headers.get("x-hub-signature-256") || "";
  if (process.env.FB_APP_SECRET) {
    const expected = "sha256=" + crypto.createHmac("sha256", process.env.FB_APP_SECRET).update(raw).digest("hex");
    if (sig !== expected) return new NextResponse("bad signature", { status: 401 });
  }
  const body = JSON.parse(raw);
  const db = supabaseAdmin();
  const { data: ev } = await db.from("crm_webhook_events").insert({ source: "facebook", payload: body }).select("id").single();

  try {
    for (const entry of body.entry || []) {
      const pageId: string = entry.id;
      const { data: channel } = await db.from("crm_channels").select("id,credentials").eq("type", "fb_page").eq("external_id", pageId).single();
      const pageToken: string | undefined = channel?.credentials?.page_access_token;

      // --- Messenger ---
      for (const m of entry.messaging || []) {
        const isEcho = !!m.message?.is_echo;
        const senderId = isEcho ? m.recipient.id : m.sender.id;
        if (!m.message) continue; // bỏ qua delivery/read
        const profile = !isEcho && pageToken ? await fbGetProfile(pageToken, senderId) : null;
        const atts = (m.message.attachments || []).map((a: any) => ({ type: a.type === "image" ? "image" : a.type === "video" ? "video" : a.type === "audio" ? "audio" : "file", url: a.payload?.url, name: a.payload?.title }));
        await ingestMessage(db, {
          channelType: "fb_page", channelExternalId: pageId, senderExternalId: senderId,
          senderName: profile?.name, senderAvatar: profile?.profile_pic,
          text: m.message.text, type: atts.length ? atts[0].type : m.message.sticker_id ? "sticker" : "text", attachments: atts,
          externalMsgId: m.message.mid, sentAt: new Date(m.timestamp).toISOString(), direction: isEcho ? "out" : "in", raw: m,
        });
      }

      // --- Bình luận (feed) ---
      for (const ch of entry.changes || []) {
        const v = ch.value;
        if (ch.field !== "feed" || v?.item !== "comment" || v?.verb !== "add") continue;
        if (v.from?.id === pageId) continue; // comment của chính page
        await ingestMessage(db, {
          channelType: "fb_page", channelExternalId: pageId, senderExternalId: v.from?.id || v.comment_id,
          senderName: v.from?.name, text: v.message, kind: "comment", postId: v.post_id,
          externalMsgId: v.comment_id, sentAt: new Date((v.created_time || Date.now() / 1000) * 1000).toISOString(), raw: v,
        });
        if (pageToken) await runCommentBots(db, channel!.id, pageId, pageToken, v);
      }
    }
    if (ev) await db.from("crm_webhook_events").update({ processed: true }).eq("id", ev.id);
  } catch (e: any) {
    if (ev) await db.from("crm_webhook_events").update({ error: e?.message }).eq("id", ev.id);
    console.error("fb webhook error", e);
  }
  return NextResponse.json({ ok: true });
}

/** Bot trả lời bình luận (clone SO9): like / reply / ẩn / gửi inbox sau khi trả lời */
async function runCommentBots(db: ReturnType<typeof supabaseAdmin>, channelId: string, pageId: string, token: string, v: any) {
  const { data: bots } = await db.from("crm_comment_bots").select("*").eq("is_active", true);
  for (const b of bots || []) {
    if (b.target_mode === "channel" && b.channel_ids.length && !b.channel_ids.includes(channelId)) continue;
    if (b.target_mode === "post" && !b.post_ids.includes(v.post_id)) continue;
    if (b.keywords?.length && !b.keywords.some((k: string) => (v.message || "").toLowerCase().includes(k.toLowerCase()))) continue;
    const ctx = { fullname: v.from?.name || "bạn" };
    const a = b.actions || {};
    if (a.like) await fbLikeComment(token, v.comment_id).catch(() => {});
    if (a.hide) await fbHideComment(token, v.comment_id).catch(() => {});
    if (a.reply && b.reply_templates?.length) {
      const tpl = b.reply_templates[Math.floor(Math.random() * b.reply_templates.length)];
      await fbReplyComment(token, v.comment_id, renderTemplate(tpl, ctx)).catch(() => {});
    }
    if (a.message && b.message_template) await fbPrivateReply(token, v.comment_id, renderTemplate(b.message_template, ctx)).catch(() => {});
  }
}
