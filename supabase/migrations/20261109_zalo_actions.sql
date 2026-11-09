-- Hành động Zalo do CRM yêu cầu, worker (worker/zalo.mjs) thực hiện: chặn / bỏ chặn người dùng spam
create table if not exists crm_zalo_actions (
  id uuid primary key default gen_random_uuid(),
  action text not null,                                   -- block | unblock
  zalo_uid text not null,
  conversation_id uuid references crm_conversations(id) on delete set null,
  identity_id uuid references crm_identities(id) on delete set null,
  status text not null default 'todo',                    -- todo | done | failed
  last_error text,
  requested_by uuid references crm_members(id),
  created_at timestamptz default now(),
  done_at timestamptz
);
alter table crm_zalo_actions enable row level security;
drop policy if exists crm_zalo_actions_member_all on crm_zalo_actions;
create policy crm_zalo_actions_member_all on crm_zalo_actions for all to authenticated
  using (exists (select 1 from crm_members m where m.id=auth.uid() and m.is_active))
  with check (exists (select 1 from crm_members m where m.id=auth.uid() and m.is_active));
-- worker nhận hành động tức thì qua realtime
do $$ begin
  if not exists (select 1 from pg_publication_tables where pubname='supabase_realtime' and schemaname='public' and tablename='crm_zalo_actions') then
    alter publication supabase_realtime add table crm_zalo_actions;
  end if;
end $$;
-- kết bạn theo UID Zalo (hội thoại Zalo chưa có SĐT): cho phép phone trống, worker dùng zalo_uid
alter table crm_zalo_friend_tasks alter column phone drop not null;
