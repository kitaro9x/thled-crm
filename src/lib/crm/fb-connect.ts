import { supabaseAdmin } from "@/lib/supabase/admin";
import { fbExchangePages, fbSubscribePage } from "@/lib/crm/facebook";

const GRAPH = "https://graph.facebook.com/v21.0";
export const FB_SCOPES = "pages_show_list,pages_messaging,pages_manage_metadata,pages_read_engagement,pages_manage_engagement,pages_read_user_content";

export function fbRedirectUri(origin: string) { return `${origin}/api/channels/facebook/callback`; }

/** Bước 1 của OAuth redirect: URL hộp thoại đăng nhập Facebook */
export function fbAuthUrl(origin: string, state: string) {
  const q = new URLSearchParams({ client_id: process.env.FB_APP_ID || "", redirect_uri: fbRedirectUri(origin), state, scope: FB_SCOPES, response_type: "code" });
  return `https://www.facebook.com/v21.0/dialog/oauth?${q}`;
}

/** Bước 2: đổi code → user access token */
export async function fbExchangeCode(origin: string, code: string) {
  const q = new URLSearchParams({ client_id: process.env.FB_APP_ID || "", client_secret: process.env.FB_APP_SECRET || "", redirect_uri: fbRedirectUri(origin), code });
  const j = await fetch(`${GRAPH}/oauth/access_token?${q}`).then((r) => r.json());
  if (!j.access_token) throw new Error(j.error?.message || "Không đổi được code lấy token");
  return j.access_token as string;
}

/** Từ user token → lấy page token, subscribe webhook, lưu crm_channels */
export async function connectPagesFromUserToken(userToken: string, pageIds?: string[]) {
  const pages = await fbExchangePages(userToken);
  if (!pages.length) throw new Error("Tài khoản này không quản trị Fanpage nào, hoặc chưa cấp quyền pages_show_list.");
  const db = supabaseAdmin();
  const out: { id: string; name: string; subscribed: boolean; error?: string }[] = [];
  for (const p of pages) {
    if (pageIds?.length && !pageIds.includes(p.id)) continue;
    const sub = await fbSubscribePage(p.id, p.access_token).catch((e) => ({ error: { message: e.message } }));
    const subscribed = !!sub?.success;
    const { data, error } = await db.from("crm_channels").upsert({ type: "fb_page", external_id: p.id, name: p.name, avatar_url: p.picture?.data?.url, status: "connected", last_error: subscribed ? null : (sub?.error?.message || "Chưa subscribe webhook"), credentials: { page_access_token: p.access_token } }, { onConflict: "type,external_id" }).select("id,name").single();
    if (error) throw new Error(`Không lưu được kênh "${p.name}": ${error.message}` + (/row-level|permission|JWT|apikey/i.test(error.message) ? " — kiểm tra SUPABASE_SERVICE_ROLE_KEY trên Vercel" : ""));
    out.push({ id: data?.id || p.id, name: p.name, subscribed, error: subscribed ? undefined : sub?.error?.message });
  }
  return out;
}
