const GRAPH = "https://graph.facebook.com/v21.0";

export async function fbSendMessage(pageToken: string, psid: string, text?: string, attachmentUrl?: string, tag?: string) {
  const message: any = text ? { text } : attachmentUrl ? { attachment: { type: "image", payload: { url: attachmentUrl, is_reusable: true } } } : null;
  if (!message) throw new Error("empty message");
  const body: any = { recipient: { id: psid }, message, messaging_type: tag ? "MESSAGE_TAG" : "RESPONSE" };
  if (tag) body.tag = tag; // vd POST_PURCHASE_UPDATE / CONFIRMED_EVENT_UPDATE để gửi sau 24h đúng chính sách
  const r = await fetch(`${GRAPH}/me/messages?access_token=${pageToken}`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
  const j = await r.json();
  if (!r.ok) throw new Error(j?.error?.message || "fb send failed");
  return j as { message_id: string };
}

export async function fbGetProfile(pageToken: string, psid: string) {
  const r = await fetch(`${GRAPH}/${psid}?fields=name,profile_pic&access_token=${pageToken}`);
  if (!r.ok) return null;
  return (await r.json()) as { name?: string; profile_pic?: string };
}

export async function fbReplyComment(pageToken: string, commentId: string, message: string) {
  const r = await fetch(`${GRAPH}/${commentId}/comments?access_token=${pageToken}`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ message }) });
  return r.json();
}
export async function fbLikeComment(pageToken: string, commentId: string) {
  await fetch(`${GRAPH}/${commentId}/likes?access_token=${pageToken}`, { method: "POST" });
}
export async function fbHideComment(pageToken: string, commentId: string) {
  await fetch(`${GRAPH}/${commentId}?is_hidden=true&access_token=${pageToken}`, { method: "POST" });
}
export async function fbPrivateReply(pageToken: string, commentId: string, text: string) {
  const r = await fetch(`${GRAPH}/me/messages?access_token=${pageToken}`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ recipient: { comment_id: commentId }, message: { text } }) });
  return r.json();
}

/** Đổi user token ngắn hạn → long-lived + lấy danh sách page token */
export async function fbExchangePages(userToken: string) {
  const ll = await fetch(`${GRAPH}/oauth/access_token?grant_type=fb_exchange_token&client_id=${process.env.FB_APP_ID}&client_secret=${process.env.FB_APP_SECRET}&fb_exchange_token=${userToken}`).then((r) => r.json());
  const token = ll.access_token || userToken;
  const pages = await fetch(`${GRAPH}/me/accounts?fields=id,name,access_token,picture{url}&access_token=${token}`).then((r) => r.json());
  return (pages.data || []) as { id: string; name: string; access_token: string; picture?: { data?: { url?: string } } }[];
}
export async function fbSubscribePage(pageId: string, pageToken: string) {
  const r = await fetch(`${GRAPH}/${pageId}/subscribed_apps?subscribed_fields=messages,messaging_postbacks,message_deliveries,message_reads,message_echoes,feed&access_token=${pageToken}`, { method: "POST" });
  return r.json();
}
