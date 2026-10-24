export type ChannelType = "fb_page" | "zalo_personal" | "zalo_oa" | "web_widget" | "email" | "tiktok" | "instagram";
export type Role = "admin" | "manager" | "sale" | "viewer";
export type ActivityType = "note" | "call" | "meeting" | "follow_up" | "email";
export type LeadStatus = "open" | "won" | "lost";
export type RuleAction =
  | "add_activity" | "change_stage" | "change_field" | "distribute_lead" | "add_sequence"
  | "zalo_friend" | "create_lead" | "required_fields" | "api_call";
export type RuleEvent =
  | "created_in_pipeline" | "moved_to_pipeline" | "moved_to_other_stage"
  | "created_or_moved_to_stage" | "field_updated" | "scheduled";

export interface Member { id: string; name: string; email?: string | null; avatar_url?: string | null; role: Role; is_active: boolean; is_online: boolean; zalo_uid?: string | null; }
export interface Channel { id: string; type: ChannelType; external_id: string; name: string; avatar_url?: string | null; status: string; settings: Record<string, unknown>; last_error?: string | null; }
export interface Label { id: string; name: string; color: string; sort_order: number; scope: string; }
export interface Person {
  id: string; name?: string | null; phone?: string | null; email?: string | null; gender?: string | null; zalo?: string | null;
  avatar_url?: string | null; address?: string | null; assigned_to?: string | null; labels: string[]; tags?: string[];
  note?: string | null; custom: Record<string, unknown>; emotion?: string | null; last_message_text?: string | null; last_message_at?: string | null;
  total_leads: number; won_leads: number; total_orders: number; source_origin?: string | null; created_at: string;
}
export interface Conversation {
  id: string; identity_id: string; customer_id?: string | null; channel_id?: string | null; channel: string; status: string;
  assigned_to?: string | null; labels: string[]; subscribers: string[]; is_important: boolean; kind: string;
  last_message_text?: string | null; last_message_at?: string | null; last_inbound_at?: string | null; unread_count: number;
  ai_summary?: string | null; emotion?: string | null; scheduled_message?: { text: string; send_at: string } | null;
  // from view
  channel_type?: ChannelType; channel_name?: string; display_name?: string | null; identity_avatar?: string | null; external_id?: string;
  person_name?: string | null; person_phone?: string | null; assignee_name?: string | null;
}
export interface Message {
  id: string; conversation_id: string; direction: "in" | "out"; type: string; text?: string | null; attachments: Attachment[];
  external_msg_id?: string | null; sender_member_id?: string | null; status: string; sent_at: string; created_at: string;
}
export interface Attachment { type: "image" | "file" | "video" | "audio" | "sticker"; url: string; name?: string; }
export interface Pipeline { id: string; name: string; sort_order: number; is_default: boolean; }
export interface Stage { id: string; pipeline_id: string; name: string; color: string; sort_order: number; kind: "open" | "won" | "lost"; rotten_days?: number | null; }
export interface Lead {
  id: string; title: string; person_id?: string | null; pipeline_id: string; stage_id: string; status: LeadStatus;
  assigned_to?: string | null; subscribers: string[]; labels: string[]; qualified?: boolean | null; deal_size?: number | null;
  score?: number | null; lost_reason?: string | null; source_origin?: string | null; source_channel_id?: string | null;
  source_conversation_id?: string | null; custom: Record<string, unknown>; last_stage_change_at: string; next_activity_at?: string | null;
  created_at: string; updated_at: string;
  stage_name?: string; stage_color?: string; stage_kind?: string; person_name?: string | null; person_phone?: string | null;
  person_avatar?: string | null; assignee_name?: string | null; open_activities?: number;
}
export interface Activity {
  id: string; type: ActivityType; title?: string | null; description?: string | null; lead_id?: string | null; person_id?: string | null;
  conversation_id?: string | null; assignee_id?: string | null; due_at?: string | null; priority: "low" | "medium" | "high";
  customer_busy: boolean; is_done: boolean; done_at?: string | null; created_by?: string | null; created_at: string;
}
export interface RuleCondition { field: string; op: "empty" | "not_empty" | "eq" | "neq" | "contains" | "gt" | "lt"; value?: unknown; }
export interface AutomationRule {
  id: string; name: string; pipeline_id: string; stage_id?: string | null; action: RuleAction; event: RuleEvent;
  event_field?: string | null; schedule_at?: string | null; conditions: RuleCondition[]; config: Record<string, any>; is_active: boolean;
}
export interface LeadSource {
  id: string; name: string; type: string; is_active: boolean; channel_ids: string[]; owner_mode: "current" | "fixed" | "none"; owner_id?: string | null;
  create_when_phone: boolean; create_when_email: boolean; create_when_new_conversation: boolean; dedupe_phone: boolean; dedupe_email: boolean;
  on_duplicate: "link" | "skip"; after_duplicate: Record<string, any>; create_lead: boolean; lead_mode: "always" | "if_none";
  pipeline_id?: string | null; stage_id?: string | null; lead_owner_mode: string; lead_owner_id?: string | null; lead_followers: string[];
}
export interface Order {
  id: string; code: string; name?: string | null; status: string; lead_id?: string | null; person_id?: string | null; saler_id?: string | null;
  items: { product_id?: number; name: string; unit_price: number; qty: number; amount: number }[];
  total_amount: number; tax: number; shipping_fee: number; total_discount: number; grand_total: number; note?: string | null; created_at: string;
}
export interface Knowledge { id: string; topic_id?: string | null; kind: string; title: string; shortcut?: string | null; ai_description?: string | null; content: string; attachments: Attachment[]; }
