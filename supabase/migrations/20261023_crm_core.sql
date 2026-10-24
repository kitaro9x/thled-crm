-- =====================================================================
-- THLED CRM — core schema (clone SO9 CRM) — extends existing crm_* tables
-- All tables live in public with prefix crm_ (same Supabase project as thled.vn)
-- =====================================================================

create extension if not exists pgcrypto;

-- ---------- helpers ----------
create or replace function crm_normalize_phone(p text) returns text
language sql immutable as $$
  select case
    when p is null then null
    else (
      with d as (select regexp_replace(p, '[^0-9+]', '', 'g') as s)
      select case
        when s like '+84%' then '0' || substr(s, 4)
        when s like '84%' and length(s) >= 11 then '0' || substr(s, 3)
        else s end
      from d)
  end
$$;

-- regex extract first VN phone from free text
create or replace function crm_extract_phone(t text) returns text
language sql immutable as $$
  select crm_normalize_phone(substring(regexp_replace(coalesce(t,''), '[\s.\-]', '', 'g') from '(?:\+?84|0)[35789][0-9]{8}'))
$$;

create or replace function crm_touch_updated_at() returns trigger
language plpgsql as $$ begin new.updated_at = now(); return new; end $$;

-- ---------- enums ----------
do $$ begin
  create type crm_channel_type as enum ('fb_page','zalo_personal','zalo_oa','web_widget','email','tiktok','instagram');
exception when duplicate_object then null; end $$;
do $$ begin
  create type crm_member_role as enum ('admin','manager','sale','viewer');
exception when duplicate_object then null; end $$;
do $$ begin
  create type crm_activity_type as enum ('note','call','meeting','follow_up','email');
exception when duplicate_object then null; end $$;
do $$ begin
  create type crm_lead_status as enum ('open','won','lost');
exception when duplicate_object then null; end $$;
do $$ begin
  create type crm_rule_action as enum ('add_activity','change_stage','change_field','distribute_lead','add_sequence','zalo_friend','create_lead','required_fields','api_call');
exception when duplicate_object then null; end $$;
do $$ begin
  create type crm_rule_event as enum ('created_in_pipeline','moved_to_pipeline','moved_to_other_stage','created_or_moved_to_stage','field_updated','scheduled');
exception when duplicate_object then null; end $$;
do $$ begin
  create type crm_distribution_algo as enum ('round_robin','online_first','shift_first','responder','phone_prefix');
exception when duplicate_object then null; end $$;

-- ---------- members (users) ----------
create table if not exists crm_members (
  id uuid primary key references auth.users(id) on delete cascade,
  name text not null,
  email text,
  avatar_url text,
  role crm_member_role not null default 'sale',
  is_active boolean not null default true,
  is_online boolean not null default false,
  last_seen_at timestamptz,
  shift jsonb not null default '{"mode":"fulltime"}'::jsonb,   -- {mode:'fulltime'|'custom', slots:[{dow:1,from:'08:00',to:'17:30'}]}
  max_open_leads int,
  max_open_conversations int,
  zalo_uid text,                 -- Zalo cá nhân dùng để kết bạn
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);
drop trigger if exists trg_members_upd on crm_members;
create trigger trg_members_upd before update on crm_members for each row execute function crm_touch_updated_at();

-- ---------- channels ----------
create table if not exists crm_channels (
  id uuid primary key default gen_random_uuid(),
  type crm_channel_type not null,
  external_id text not null,          -- page_id / zalo uid / oa_id
  name text not null,
  avatar_url text,
  status text not null default 'connected',   -- connected|error|disconnected
  credentials jsonb not null default '{}'::jsonb,  -- page access token etc. (service-role only)
  settings jsonb not null default '{}'::jsonb,
  last_error text,
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  unique (type, external_id)
);
drop trigger if exists trg_channels_upd on crm_channels;
create trigger trg_channels_upd before update on crm_channels for each row execute function crm_touch_updated_at();

-- ---------- labels (nhãn hội thoại) ----------
create table if not exists crm_labels (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  color text not null default '#3b82f6',
  description text,
  sort_order int not null default 0,
  scope text not null default 'conversation',   -- conversation|person|lead
  access text not null default 'all',           -- all|admin
  synced_from text,                              -- 'zalo' nếu đồng bộ từ nhãn Zalo
  created_at timestamptz default now(),
  unique (scope, name)
);

-- ---------- extend persons (crm_customers) ----------
alter table crm_customers
  add column if not exists gender text,
  add column if not exists email text,
  add column if not exists zalo text,
  add column if not exists avatar_url text,
  add column if not exists address text,
  add column if not exists assigned_to uuid references crm_members(id),
  add column if not exists subscribers uuid[] not null default '{}',
  add column if not exists labels text[] not null default '{}',
  add column if not exists source_origin text,            -- automation|manual|import|api|leadform
  add column if not exists source_id uuid,                -- crm_lead_sources.id
  add column if not exists source_channel_id uuid references crm_channels(id),
  add column if not exists utm jsonb not null default '{}'::jsonb,
  add column if not exists custom jsonb not null default '{}'::jsonb,   -- sp_quan_tam...
  add column if not exists emotion text,
  add column if not exists last_message_text text,
  add column if not exists last_message_at timestamptz,
  add column if not exists total_leads int not null default 0,
  add column if not exists won_leads int not null default 0,
  add column if not exists total_orders int not null default 0;
create unique index if not exists crm_customers_phone_uq on crm_customers (crm_normalize_phone(phone)) where phone is not null;
create index if not exists crm_customers_assigned_idx on crm_customers(assigned_to);
drop trigger if exists trg_customers_upd on crm_customers;
create trigger trg_customers_upd before update on crm_customers for each row execute function crm_touch_updated_at();

-- ---------- extend identities / conversations / messages ----------
alter table crm_identities
  add column if not exists channel_id uuid references crm_channels(id) on delete cascade,
  add column if not exists phone text,
  add column if not exists meta jsonb not null default '{}'::jsonb;
create unique index if not exists crm_identities_channel_ext_uq on crm_identities(channel_id, external_id);

alter table crm_conversations
  add column if not exists channel_id uuid references crm_channels(id) on delete cascade,
  add column if not exists labels text[] not null default '{}',
  add column if not exists subscribers uuid[] not null default '{}',
  add column if not exists is_important boolean not null default false,
  add column if not exists is_hidden boolean not null default false,
  add column if not exists kind text not null default 'inbox',        -- inbox|comment
  add column if not exists post_id text,
  add column if not exists ai_summary text,
  add column if not exists emotion text,
  add column if not exists last_outbound_at timestamptz,
  add column if not exists first_response_seconds int,
  add column if not exists scheduled_message jsonb,                   -- {text, send_at}
  add column if not exists updated_at timestamptz default now();
-- assigned_to: text -> uuid (tables are empty)
do $$ begin
  if exists (select 1 from information_schema.columns where table_name='crm_conversations' and column_name='assigned_to' and data_type='text') then
    alter table crm_conversations alter column assigned_to type uuid using null;
    alter table crm_conversations add constraint crm_conversations_assigned_fk foreign key (assigned_to) references crm_members(id);
  end if;
end $$;
create index if not exists crm_conversations_last_idx on crm_conversations(last_message_at desc);
create index if not exists crm_conversations_assigned_idx on crm_conversations(assigned_to);
drop trigger if exists trg_conversations_upd on crm_conversations;
create trigger trg_conversations_upd before update on crm_conversations for each row execute function crm_touch_updated_at();

alter table crm_messages
  add column if not exists type text not null default 'text',   -- text|image|file|sticker|call|location|system
  add column if not exists sender_member_id uuid references crm_members(id),
  add column if not exists status text not null default 'sent', -- queued|sent|delivered|read|failed
  add column if not exists sent_at timestamptz default now();
create index if not exists crm_messages_conv_idx on crm_messages(conversation_id, created_at);
create unique index if not exists crm_messages_ext_uq on crm_messages(external_msg_id) where external_msg_id is not null;

-- keep conversation summary in sync
create or replace function crm_after_message_insert() returns trigger
language plpgsql security definer as $$
begin
  update crm_conversations c set
    last_message_text = coalesce(new.text, '[' || new.type || ']'),
    last_message_at   = coalesce(new.sent_at, new.created_at),
    last_inbound_at   = case when new.direction='in'  then coalesce(new.sent_at,new.created_at) else c.last_inbound_at end,
    last_outbound_at  = case when new.direction='out' then coalesce(new.sent_at,new.created_at) else c.last_outbound_at end,
    unread_count      = case when new.direction='in' then c.unread_count + 1 else 0 end,
    first_response_seconds = case
      when new.direction='out' and c.first_response_seconds is null and c.last_inbound_at is not null
      then extract(epoch from (coalesce(new.sent_at,new.created_at) - c.last_inbound_at))::int
      else c.first_response_seconds end
  where c.id = new.conversation_id;
  update crm_customers p set
    last_message_text = coalesce(new.text,'[' || new.type || ']'),
    last_message_at = coalesce(new.sent_at,new.created_at)
  from crm_conversations c where c.id = new.conversation_id and p.id = c.customer_id;
  return new;
end $$;
drop trigger if exists trg_after_message_insert on crm_messages;
create trigger trg_after_message_insert after insert on crm_messages for each row execute function crm_after_message_insert();

-- ---------- pipelines & stages ----------
create table if not exists crm_pipelines (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  sort_order int not null default 0,
  is_default boolean not null default false,
  member_ids uuid[] not null default '{}',   -- quyền truy cập (rỗng = tất cả)
  created_at timestamptz default now()
);
create table if not exists crm_stages (
  id uuid primary key default gen_random_uuid(),
  pipeline_id uuid not null references crm_pipelines(id) on delete cascade,
  name text not null,
  color text not null default '#2563eb',
  sort_order int not null default 0,
  kind text not null default 'open',  -- open|won|lost
  rotten_days int,                    -- cảnh báo lead ở lâu
  created_at timestamptz default now()
);
create index if not exists crm_stages_pipe_idx on crm_stages(pipeline_id, sort_order);

-- ---------- leads (cơ hội) ----------
create table if not exists crm_leads (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  person_id uuid references crm_customers(id) on delete set null,
  pipeline_id uuid not null references crm_pipelines(id),
  stage_id uuid not null references crm_stages(id),
  status crm_lead_status not null default 'open',
  assigned_to uuid references crm_members(id),
  subscribers uuid[] not null default '{}',
  labels text[] not null default '{}',
  qualified boolean,
  deal_size numeric(14,0),
  score int,
  lost_reason text,
  source_origin text,                 -- automation|manual|import|api
  source_id uuid,
  source_channel_id uuid references crm_channels(id),
  source_conversation_id uuid references crm_conversations(id),
  utm jsonb not null default '{}'::jsonb,
  custom jsonb not null default '{}'::jsonb,
  last_stage_change_at timestamptz default now(),
  qualified_at timestamptz,
  won_at timestamptz,
  lost_at timestamptz,
  next_activity_at timestamptz,
  last_activity_at timestamptz,
  created_by uuid references crm_members(id),
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);
create index if not exists crm_leads_stage_idx on crm_leads(pipeline_id, stage_id) where status='open';
create index if not exists crm_leads_person_idx on crm_leads(person_id);
create index if not exists crm_leads_assigned_idx on crm_leads(assigned_to);
drop trigger if exists trg_leads_upd on crm_leads;
create trigger trg_leads_upd before update on crm_leads for each row execute function crm_touch_updated_at();

create or replace function crm_lead_stage_change() returns trigger
language plpgsql as $$
begin
  if new.stage_id is distinct from old.stage_id then
    new.last_stage_change_at = now();
    select case kind when 'won' then 'won'::crm_lead_status when 'lost' then 'lost'::crm_lead_status else 'open'::crm_lead_status end
      into new.status from crm_stages where id = new.stage_id;
    if new.status='won' and old.status<>'won' then new.won_at = now(); end if;
    if new.status='lost' and old.status<>'lost' then new.lost_at = now(); end if;
  end if;
  if new.qualified is true and old.qualified is not true then new.qualified_at = now(); end if;
  return new;
end $$;
drop trigger if exists trg_lead_stage_change on crm_leads;
create trigger trg_lead_stage_change before update on crm_leads for each row execute function crm_lead_stage_change();

-- person counters
create or replace function crm_lead_counters() returns trigger
language plpgsql security definer as $$
begin
  if tg_op='INSERT' and new.person_id is not null then
    update crm_customers set total_leads = total_leads + 1 where id = new.person_id;
  elsif tg_op='UPDATE' and new.status='won' and old.status<>'won' and new.person_id is not null then
    update crm_customers set won_leads = won_leads + 1 where id = new.person_id;
  end if;
  return new;
end $$;
drop trigger if exists trg_lead_counters on crm_leads;
create trigger trg_lead_counters after insert or update on crm_leads for each row execute function crm_lead_counters();

create table if not exists crm_lead_stage_history (
  id bigserial primary key,
  lead_id uuid not null references crm_leads(id) on delete cascade,
  from_stage uuid, to_stage uuid,
  changed_by uuid, changed_at timestamptz default now()
);

-- ---------- activities ----------
create table if not exists crm_activities (
  id uuid primary key default gen_random_uuid(),
  type crm_activity_type not null default 'note',
  title text,
  description text,
  attachments jsonb not null default '[]'::jsonb,
  lead_id uuid references crm_leads(id) on delete cascade,
  person_id uuid references crm_customers(id) on delete cascade,
  conversation_id uuid references crm_conversations(id) on delete set null,
  assignee_id uuid references crm_members(id),
  due_at timestamptz,
  priority text not null default 'medium',   -- low|medium|high
  customer_busy boolean not null default false,
  is_done boolean not null default false,
  done_at timestamptz,
  created_by uuid references crm_members(id),
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);
create index if not exists crm_activities_due_idx on crm_activities(assignee_id, is_done, due_at);
create index if not exists crm_activities_lead_idx on crm_activities(lead_id);
drop trigger if exists trg_activities_upd on crm_activities;
create trigger trg_activities_upd before update on crm_activities for each row execute function crm_touch_updated_at();

create or replace function crm_activity_sync_lead() returns trigger
language plpgsql security definer as $$
begin
  if new.lead_id is not null then
    update crm_leads l set
      last_activity_at = now(),
      next_activity_at = (select min(due_at) from crm_activities a where a.lead_id=l.id and not a.is_done and a.due_at is not null)
    where l.id = new.lead_id;
  end if;
  return new;
end $$;
drop trigger if exists trg_activity_sync_lead on crm_activities;
create trigger trg_activity_sync_lead after insert or update on crm_activities for each row execute function crm_activity_sync_lead();

-- ---------- lead sources (nguồn khách hàng) ----------
create table if not exists crm_lead_sources (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  type text not null default 'conversation',   -- conversation|api|leadform|ladipage|import
  is_active boolean not null default true,
  channel_ids uuid[] not null default '{}',     -- rỗng = tất cả kênh
  owner_mode text not null default 'current',   -- current|fixed|none
  owner_id uuid references crm_members(id),
  create_when_phone boolean not null default true,
  create_when_email boolean not null default false,
  create_when_new_conversation boolean not null default false,
  dedupe_phone boolean not null default true,
  dedupe_email boolean not null default false,
  on_duplicate text not null default 'link',    -- link|skip
  after_duplicate jsonb not null default '{}'::jsonb,  -- {note, activity:{type,title,assignee_mode,due}}
  create_lead boolean not null default true,
  lead_mode text not null default 'if_none',    -- always|if_none
  pipeline_id uuid references crm_pipelines(id),
  stage_id uuid references crm_stages(id),
  lead_owner_mode text not null default 'current',
  lead_owner_id uuid references crm_members(id),
  lead_followers uuid[] not null default '{}',
  api_key text,                                  -- cho type=api
  stats jsonb not null default '{}'::jsonb,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);
drop trigger if exists trg_lead_sources_upd on crm_lead_sources;
create trigger trg_lead_sources_upd before update on crm_lead_sources for each row execute function crm_touch_updated_at();

-- ---------- automation rules (luồng tự động hoá) ----------
create table if not exists crm_automation_rules (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  pipeline_id uuid not null references crm_pipelines(id) on delete cascade,
  stage_id uuid references crm_stages(id) on delete cascade,   -- null = toàn phễu
  action crm_rule_action not null,
  event crm_rule_event not null default 'created_or_moved_to_stage',
  event_field text,                 -- cho field_updated
  schedule_at timestamptz,          -- cho scheduled
  conditions jsonb not null default '[]'::jsonb,   -- [{field:'phone',op:'not_empty',value:null}]
  config jsonb not null default '{}'::jsonb,       -- tuỳ action, xem spec
  is_active boolean not null default true,
  sort_order int not null default 0,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);
drop trigger if exists trg_rules_upd on crm_automation_rules;
create trigger trg_rules_upd before update on crm_automation_rules for each row execute function crm_touch_updated_at();
create table if not exists crm_automation_logs (
  id bigserial primary key,
  rule_id uuid references crm_automation_rules(id) on delete cascade,
  lead_id uuid, person_id uuid,
  status text not null,          -- ok|skipped|error
  detail text,
  created_at timestamptz default now()
);

-- scoring config per pipeline
create table if not exists crm_scoring_rules (
  pipeline_id uuid primary key references crm_pipelines(id) on delete cascade,
  is_enabled boolean not null default false,
  formula text not null default 'A',           -- '5*A+B'
  variables jsonb not null default '[]'::jsonb -- [{letter:'A',field:'stage_id',values:{<stage_id>:10,...}}]
);

-- ---------- sequences (kịch bản nuôi) ----------
create table if not exists crm_knowledge_topics (
  id uuid primary key default gen_random_uuid(),
  name text not null, sort_order int default 0
);
create table if not exists crm_knowledge (
  id uuid primary key default gen_random_uuid(),
  topic_id uuid references crm_knowledge_topics(id) on delete set null,
  kind text not null default 'message',   -- message|mail
  title text not null,
  shortcut text,                          -- phím tắt trả lời nhanh, vd /gia
  ai_description text,
  content text not null,
  attachments jsonb not null default '[]'::jsonb,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);
drop trigger if exists trg_knowledge_upd on crm_knowledge;
create trigger trg_knowledge_upd before update on crm_knowledge for each row execute function crm_touch_updated_at();

create table if not exists crm_sequences (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  description text,
  status text not null default 'draft',          -- draft|active|paused
  channel_mode text not null default 'priority', -- fixed|priority
  fixed_channel_type crm_channel_type,
  channel_priority jsonb not null default '{"zalo_personal":3,"zalo_oa":3,"fb_page":2,"tiktok":2,"instagram":1,"email":1}'::jsonb,
  trigger jsonb not null default '{}'::jsonb,    -- {mode:'lead'|'person'|'manual', pipeline_id, event, conditions_all:[], conditions_any:[]}
  stop_conditions jsonb not null default '[]'::jsonb,
  single_run boolean not null default true,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);
drop trigger if exists trg_sequences_upd on crm_sequences;
create trigger trg_sequences_upd before update on crm_sequences for each row execute function crm_touch_updated_at();
create table if not exists crm_sequence_steps (
  id uuid primary key default gen_random_uuid(),
  sequence_id uuid not null references crm_sequences(id) on delete cascade,
  sort_order int not null default 0,
  knowledge_id uuid references crm_knowledge(id),
  content_override text,
  delay_minutes int not null default 0,
  send_at_time time                       -- nếu muốn gửi đúng giờ
);
create table if not exists crm_sequence_enrollments (
  id uuid primary key default gen_random_uuid(),
  sequence_id uuid not null references crm_sequences(id) on delete cascade,
  person_id uuid not null references crm_customers(id) on delete cascade,
  lead_id uuid references crm_leads(id) on delete set null,
  current_step int not null default 0,
  next_run_at timestamptz,
  status text not null default 'running',   -- running|done|stopped|error
  sent_count int not null default 0,
  last_error text,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);
create index if not exists crm_enroll_next_idx on crm_sequence_enrollments(status, next_run_at);
drop trigger if exists trg_enroll_upd on crm_sequence_enrollments;
create trigger trg_enroll_upd before update on crm_sequence_enrollments for each row execute function crm_touch_updated_at();

-- ---------- products / orders / quotes ----------
create table if not exists crm_lead_products (
  id uuid primary key default gen_random_uuid(),
  lead_id uuid not null references crm_leads(id) on delete cascade,
  product_id bigint references products(id),
  name text not null,
  unit_price numeric(14,0) not null default 0,
  quantity numeric(10,2) not null default 1,
  note text
);
create table if not exists crm_orders (
  id uuid primary key default gen_random_uuid(),
  code text unique,
  name text,
  status text not null default 'new',   -- new|confirmed|delivering|done|cancelled
  source text,
  lead_id uuid references crm_leads(id) on delete set null,
  person_id uuid references crm_customers(id) on delete set null,
  saler_id uuid references crm_members(id),
  marketer_id uuid references crm_members(id),
  ops_id uuid references crm_members(id),
  items jsonb not null default '[]'::jsonb,   -- [{product_id,name,unit_price,qty,amount}]
  total_amount numeric(14,0) not null default 0,
  tax numeric(14,0) not null default 0,
  shipping_fee numeric(14,0) not null default 0,
  total_discount numeric(14,0) not null default 0,
  grand_total numeric(14,0) generated always as (total_amount + tax + shipping_fee - total_discount) stored,
  currency text not null default 'VND',
  note text,
  external_id text,                            -- mã đơn KiotViet
  created_by uuid references crm_members(id),
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);
drop trigger if exists trg_orders_upd on crm_orders;
create trigger trg_orders_upd before update on crm_orders for each row execute function crm_touch_updated_at();
create or replace function crm_order_code() returns trigger language plpgsql as $$
begin
  if new.code is null then new.code = 'DH' || to_char(now(),'YYMMDD') || lpad(nextval('crm_order_seq')::text, 4, '0'); end if;
  return new;
end $$;
create sequence if not exists crm_order_seq;
drop trigger if exists trg_order_code on crm_orders;
create trigger trg_order_code before insert on crm_orders for each row execute function crm_order_code();

create table if not exists crm_quote_templates (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  layout text not null default 'classic',
  color text not null default '#0f172a',
  config jsonb not null default '{}'::jsonb,  -- {title,message,note,sign1,sign2,company:{...},customer_fields:[],order_fields:[]}
  is_default boolean not null default false,
  created_at timestamptz default now()
);
create table if not exists crm_quotes (
  id uuid primary key default gen_random_uuid(),
  code text unique,
  lead_id uuid references crm_leads(id) on delete set null,
  order_id uuid references crm_orders(id) on delete set null,
  person_id uuid references crm_customers(id) on delete set null,
  template_id uuid references crm_quote_templates(id),
  items jsonb not null default '[]'::jsonb,
  totals jsonb not null default '{}'::jsonb,
  file_url text,                 -- PDF/Excel đã xuất (Supabase Storage)
  created_by uuid references crm_members(id),
  created_at timestamptz default now()
);

-- ---------- distribution (phân phối hội thoại / cơ hội) ----------
create table if not exists crm_distribution_rules (
  id uuid primary key default gen_random_uuid(),
  scope text not null default 'conversation',   -- conversation|lead
  name text not null,
  description text,
  channel_id uuid references crm_channels(id) on delete cascade,
  pipeline_id uuid references crm_pipelines(id) on delete cascade,
  algorithm crm_distribution_algo not null default 'online_first',
  members jsonb not null default '[]'::jsonb,   -- [{member_id, permission:'full'|'assigned', zalo_friend:true, ratio:50}]
  fallback text not null default 'ratio',       -- ratio|fixed|none  (khi không ai online)
  fallback_member_id uuid references crm_members(id),
  only_with_phone boolean not null default false,
  phone_prefix_map jsonb not null default '{}'::jsonb,   -- {"09":member_id,...}
  is_active boolean not null default true,
  last_index int not null default 0,            -- con trỏ round robin
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);
drop trigger if exists trg_dist_upd on crm_distribution_rules;
create trigger trg_dist_upd before update on crm_distribution_rules for each row execute function crm_touch_updated_at();
create table if not exists crm_distribution_logs (
  id bigserial primary key,
  rule_id uuid references crm_distribution_rules(id) on delete cascade,
  target_type text not null, target_id uuid not null,
  member_id uuid, reason text, created_at timestamptz default now()
);

-- ---------- settings (key/value) ----------
create table if not exists crm_settings (
  key text primary key,
  value jsonb not null default '{}'::jsonb,
  updated_at timestamptz default now()
);
create table if not exists crm_lost_reasons (
  id uuid primary key default gen_random_uuid(),
  name text not null unique, sort_order int default 0
);
create table if not exists crm_emotions (
  key text primary key,
  name text not null,
  emoji text,
  group_name text not null,     -- negative|support|positive|neutral
  urgency text not null,        -- urgent|high|medium|low
  alert boolean not null default false,
  prompt text not null,
  sort_order int default 0
);
create table if not exists crm_comment_bots (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  is_active boolean not null default true,
  target_mode text not null default 'channel',   -- channel|post
  channel_ids uuid[] not null default '{}',
  post_ids text[] not null default '{}',
  keywords text[] not null default '{}',
  actions jsonb not null default '{"like":true,"reply":true,"hide":false,"delete":false,"message":true,"block":false}'::jsonb,
  reply_templates text[] not null default '{}',   -- có {fullname} hoặc #text{a|b}
  reply_limit_per_post int,
  message_template text,
  message_buttons jsonb not null default '[]'::jsonb,
  created_at timestamptz default now()
);
create table if not exists crm_chatbots (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  is_active boolean not null default false,
  persona jsonb not null default '{}'::jsonb,   -- {assistant_name, description, self_pronoun, customer_pronoun, tone, length}
  channel_ids uuid[] not null default '{}',
  conversation_kinds text[] not null default '{inbox}',
  mode text not null default 'suggest',          -- auto|suggest
  schedule jsonb not null default '{"mode":"always"}'::jsonb,
  stop_rules jsonb not null default '{"on_personal_info":true,"keywords":[],"max_replies":null,"on_agent_join":true}'::jsonb,
  stop_action jsonb not null default '{"mode":"message","text":"Nhân viên sẽ liên hệ hỗ trợ anh/chị trong ít phút ạ."}'::jsonb,
  knowledge_ids uuid[] not null default '{}',
  created_at timestamptz default now()
);

-- ---------- extend existing zalo friend tasks / outbox ----------
alter table crm_zalo_friend_tasks
  add column if not exists lead_id uuid references crm_leads(id) on delete set null,
  add column if not exists rule_id uuid references crm_automation_rules(id) on delete set null,
  add column if not exists greeting text,
  add column if not exists after_accept_message text,
  add column if not exists notify_old_channel boolean not null default false,
  add column if not exists scheduled_at timestamptz;
alter table crm_outbox
  add column if not exists channel_id uuid references crm_channels(id),
  add column if not exists attachments jsonb not null default '[]'::jsonb,
  add column if not exists scheduled_at timestamptz,
  add column if not exists source text;   -- manual|sequence|bot|automation

-- ---------- views ----------
create or replace view crm_v_conversations as
select c.*, ch.type as channel_type, ch.name as channel_name,
       i.display_name, i.avatar_url as identity_avatar, i.external_id,
       p.name as person_name, p.phone as person_phone,
       m.name as assignee_name
from crm_conversations c
left join crm_channels ch on ch.id=c.channel_id
left join crm_identities i on i.id=c.identity_id
left join crm_customers p on p.id=c.customer_id
left join crm_members m on m.id=c.assigned_to;

create or replace view crm_v_leads as
select l.*, s.name as stage_name, s.color as stage_color, s.kind as stage_kind,
       p.name as person_name, p.phone as person_phone, p.avatar_url as person_avatar,
       m.name as assignee_name,
       (select count(*) from crm_activities a where a.lead_id=l.id and not a.is_done) as open_activities
from crm_leads l
join crm_stages s on s.id=l.stage_id
left join crm_customers p on p.id=l.person_id
left join crm_members m on m.id=l.assigned_to;

-- ---------- RLS ----------
do $$ declare t text; begin
  for t in select unnest(array['crm_members','crm_channels','crm_labels','crm_pipelines','crm_stages','crm_leads','crm_lead_stage_history',
    'crm_activities','crm_lead_sources','crm_automation_rules','crm_automation_logs','crm_scoring_rules','crm_knowledge_topics','crm_knowledge',
    'crm_sequences','crm_sequence_steps','crm_sequence_enrollments','crm_lead_products','crm_orders','crm_quote_templates','crm_quotes',
    'crm_distribution_rules','crm_distribution_logs','crm_settings','crm_lost_reasons','crm_emotions','crm_comment_bots','crm_chatbots']) loop
    execute format('alter table %I enable row level security', t);
    execute format('drop policy if exists %I on %I', t||'_member_all', t);
    execute format('create policy %I on %I for all to authenticated using (exists (select 1 from crm_members m where m.id=auth.uid() and m.is_active)) with check (exists (select 1 from crm_members m where m.id=auth.uid() and m.is_active))', t||'_member_all', t);
  end loop;
end $$;
-- channels.credentials chỉ service role đọc: dùng view an toàn cho client
create or replace view crm_v_channels as select id,type,external_id,name,avatar_url,status,settings,last_error,created_at from crm_channels;

-- =====================================================================
-- SEED (theo cấu hình SO9 hiện tại của THLED)
-- =====================================================================
insert into crm_pipelines (name, is_default, sort_order) select 'Default', true, 0 where not exists (select 1 from crm_pipelines);
with p as (select id from crm_pipelines where is_default limit 1)
insert into crm_stages (pipeline_id,name,color,sort_order,kind)
select p.id, s.name, s.color, s.o, s.kind from p, (values
  ('Khởi tạo Lead','#0e7490',0,'open'),('Đang suy nghĩ','#0f766e',1,'open'),('Đang tìm hiểu','#16a34a',2,'open'),
  ('Liên hệ lại','#eab308',3,'open'),('Đã hẹn lịch','#f97316',4,'open'),('Đã đăng ký','#2563eb',5,'open'),
  ('Huỷ','#ef4444',6,'open'),('WON','#16a34a',90,'won'),('LOST','#dc2626',91,'lost')) as s(name,color,o,kind)
where not exists (select 1 from crm_stages);

insert into crm_labels (name,color,sort_order,synced_from) values
 ('Khách hàng','#2563eb',1,'zalo'),('Gia đình','#16a34a',2,'zalo'),('Công việc','#0891b2',3,'zalo'),('Bạn bè','#7c3aed',4,'zalo'),
 ('Trả lời sau','#f59e0b',5,'zalo'),('Khách xử lý chưa xong','#ef4444',6,'zalo'),('Nhà cung cấp','#64748b',7,'zalo'),('Thầu','#0f766e',8,'zalo'),
 ('Khách hỏi dò','#a3a3a3',9,'zalo'),('Shipper','#78716c',10,'zalo'),('Khách VIP','#d946ef',11,'zalo')
on conflict do nothing;

insert into crm_settings(key,value) values
 ('phone', '{"allowed_prefixes":["84"],"blacklist":["0966931056"]}'),
 ('conversation', '{"font_size":13,"auto_summary_on_phone":true,"detect_emotion":true,"unanswered_alert_minutes":15,"permissions":{"mark_read":"all","send_message":"owner_admin","change_assignee":"all","change_subscriber":"owner_admin"}}'),
 ('transfer', '{"on_lead_owner_change":"keep","on_person_owner_change":"keep"}'),
 ('currency', '{"default":"VND"}'),
 ('company', '{"name":"Công ty TNHH Thương mại Dịch vụ THLED","tax_code":"3603912675","address":"824B Quốc lộ 1A, ấp Ngũ Phúc, P. Hố Nai, TP Đồng Nai","phone":"0966931056","email":"lecuong110296@gmail.com","website":"thled.vn"}')
on conflict (key) do nothing;

insert into crm_emotions(key,name,emoji,group_name,urgency,alert,prompt,sort_order) values
 ('threat','Đe dọa / Nguy cơ rời bỏ','⚠️','negative','urgent',true,'Khách nêu rõ hành động bất lợi cho doanh nghiệp nếu vấn đề không được giải quyết: ngừng hợp tác, hủy đơn, đòi hoàn tiền, đánh giá xấu, tố cáo, chuyển sang đối thủ. Tín hiệu: cấu trúc điều kiện–hậu quả ("nếu … thì tôi …", "lần cuối"); rời bỏ ("hủy", "không hợp tác nữa", "chuyển sang bên khác"); tiền và pháp lý ("hoàn tiền ngay", "báo công an", "kiện"); danh tiếng ("đăng lên group", "bóc phốt", "review 1 sao"); leo thang ("gặp quản lý"); cùng một vấn đề nhắc từ 2 lần chưa xong. Phân biệt: "Hủy đơn giúp mình, đặt nhầm" là yêu cầu thường; hỏi thủ tục hoàn tiền không kèm hậu quả không phải đe dọa.',1),
 ('angry','Tức giận / Bức xúc','😡','negative','urgent',true,'Khách giận dữ trực tiếp vì một lỗi đã xảy ra, kèm đòi sửa gấp hoặc quy trách nhiệm. Tín hiệu: trách móc ("sai rồi", "giao nhầm", "làm ăn kiểu gì", "vô trách nhiệm", "lừa đảo", "quá tệ"); chửi thề/viết tắt ("đm","vl"); câu hỏi tu từ; mệnh lệnh ("giải quyết ngay"); mỉa mai; nhắn dồn dập (≥3 tin/2 phút), chấm than lặp, viết hoa. Phân biệt: nhắm vào lỗi/chất lượng, còn chờ đợi lâu là "Bực bội do chờ đợi". "Giao gấp giúp mình" không trách móc chỉ là yêu cầu khẩn.',2),
 ('waiting','Bực bội do chờ đợi','⏳','negative','high',true,'Khách khó chịu vì chờ phản hồi/xử lý quá lâu; bắt nguồn từ thời gian. Tín hiệu: "chờ mãi", "đợi cả buổi", "sao lâu thế"; gọi người ("có ai không", "alo", "rep đi", "up" lặp); nhắc lịch sử ("nhắn mấy lần rồi", "hôm qua đã hỏi"); ≥2 tin nhắc liên tiếp chưa có phản hồi. Phân biệt: một tin "up" sau vài phút là bình thường; chửi thề thì là Tức giận; có hậu quả kèm điều kiện là Đe dọa.',3),
 ('disappointed','Thất vọng','😞','negative','high',false,'Kết quả thực tế thấp hơn kỳ vọng, khách buồn/ngán nhưng không gay gắt. Tín hiệu: "cứ tưởng", "không như mong đợi", "hơi thất vọng", "tiếc", so sánh ("lần trước tốt hơn", "kém hơn hẳn"); câu dài, giải thích lý do, ít chấm than. Phân biệt: không trách móc gay gắt (khác Tức giận); có điều kiện kèm hậu quả là Đe dọa; góp ý trung tính là Trung tính.',4),
 ('worried','Lo lắng / Bất an','😟','support','medium',false,'Khách lo về kết quả chưa chắc chắn (đơn, thanh toán, thời hạn) và cần trấn an. Tín hiệu: "lo quá", "sợ bị", "có chắc không", "có an toàn không"; hỏi xác nhận ("đã nhận được chưa"); đã làm mà chưa thấy kết quả ("đã chuyển khoản rồi mà chưa thấy"). Phân biệt: hỏi thông tin thuần là Trung tính; có trách móc là Tức giận.',5),
 ('confused','Bối rối / Khó hiểu','🤔','support','medium',false,'Khách không hiểu cách làm, chính sách hoặc thông tin, cần hướng dẫn. Tín hiệu: "không hiểu", "là sao vậy", "chưa rõ"; hỏi cách làm ("làm thế nào", "ở đâu"); báo khó khăn ("làm mãi không được", "bị lỗi"); nhiều dấu "?" hơn "!". Phân biệt: hỏi lại ≥3 lần kèm khó chịu là Bực bội/Tức giận; hỏi giá/địa chỉ thuần là Trung tính.',6),
 ('promoter','Khen ngợi / Sẵn sàng giới thiệu','🌟','positive','low',false,'Khách chủ động khen, tin tưởng, sẵn sàng gắn bó hoặc giới thiệu. Tín hiệu: "sẽ giới thiệu bạn bè", "ủng hộ dài dài", "lần sau vẫn mua", "uy tín", "recommend". Phân biệt: khen rồi xin ưu đãi là Hài lòng/Trung tính.',7),
 ('excited','Hào hứng / Quan tâm mua','🤩','positive','low',false,'Khách quan tâm thật sự và có xu hướng mua thêm: hỏi chi tiết, so sánh, hỏi cách đặt. Tín hiệu: "muốn đặt thêm", "mình quan tâm", "tư vấn giúp mình", "khi nào có hàng", "chốt", "dùng thử"; hỏi giá kèm số lượng, thời gian giao, thanh toán. Phân biệt: hỏi giá một lần không có tín hiệu thêm là Trung tính.',8),
 ('satisfied','Hài lòng / Biết ơn','😊','positive','low',false,'Khách hài lòng với kết quả/hỗ trợ và ghi nhận. Tín hiệu: "cảm ơn nhiều", "nhanh quá", "xử lý tốt", "nhiệt tình", "chuyên nghiệp"; emoji tích cực kèm khen; cảm ơn sau khi xong. Phân biệt: "Cảm ơn nhưng vẫn chưa thấy gì" là còn tồn; "nhanh thật đấy" sau trễ hẹn là mỉa mai; chỉ "ok"/"dạ" là Trung tính.',9),
 ('neutral','Trung tính','😐','neutral','low',false,'Trao đổi thông tin, hỏi đáp, xác nhận, không có cảm xúc rõ rệt; mặc định khi không đủ bằng chứng. Tín hiệu: câu ngắn ("cho mình xin báo giá", "đã nhận hàng", "ok", "dạ"); không từ cảm xúc, không chấm than lặp. "gấp" đứng một mình chỉ mức khẩn của yêu cầu.',10)
on conflict (key) do nothing;

insert into crm_lost_reasons(name,sort_order) values ('Giá cao',1),('Mua chỗ khác',2),('Không liên lạc được',3),('Chưa có nhu cầu',4),('Hết hàng / không có mẫu',5) on conflict do nothing;

insert into crm_quote_templates(name,layout,color,is_default,config) select 'Báo giá THLED','classic','#0f172a',true,
 '{"title":"BÁO GIÁ","message":"THLED cảm ơn anh/chị đã quan tâm. Dưới đây là báo giá chi tiết:","note":"Giá đã bao gồm VAT. Báo giá có hiệu lực 7 ngày.","sign1":"Người lập báo giá","sign2":"Khách hàng","customer_fields":["name","phone","address"],"order_fields":["name","unit_price","quantity","amount","total_discount","shipping_fee","grand_total"]}'
where not exists (select 1 from crm_quote_templates);
