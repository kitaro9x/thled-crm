-- AI trực thay khi chủ shop nghỉ (Cài đặt → Trợ lý AI → AI trực thay). Mặc định TẮT và ở chế độ chạy thử (không gửi).
-- Trạng thái AI nằm ở bảng riêng (KHÔNG để trong crm_conversations.labels/meta — các luồng khác ghi đè).

-- 1) Mỗi hội thoại 1 dòng trạng thái: đang chờ trả lời / đang xử lý / nghỉ
create table if not exists crm_ai_away_state (
  conversation_id uuid primary key references crm_conversations(id) on delete cascade,
  status text not null default 'idle' check (status in ('idle', 'pending', 'running')),
  queued_at timestamptz,                                  -- lúc bắt đầu chờ (tin khách đầu tiên của lượt này tới)
  last_in_at timestamptz,                                 -- tin khách mới nhất (sent_at)
  due_at timestamptz,                                     -- tới giờ này thì xử lý (chờ khách nhắn dồn xong)
  lease_until timestamptz,                                -- đang xử lý tới giờ này; quá hạn = treo → huỷ, không gửi lại
  session_start timestamptz,                              -- mốc đầu "ca" để đếm giới hạn
  replies int not null default 0,                         -- số lượt AI đã trả lời trong ca
  handoff_at timestamptz,                                 -- đã gửi câu giữ khách trong ca
  last_ai_at timestamptz,
  off boolean not null default false,                     -- nhân viên tắt AI trực thay cho riêng hội thoại này
  updated_at timestamptz not null default now()
);
create index if not exists crm_ai_away_state_due_idx on crm_ai_away_state (due_at) where status = 'pending';

-- 2) Nhật ký ca trực (chỉ thêm): mỗi lượt AI xử lý 1 dòng — cả lượt chạy thử lẫn gửi thật
create table if not exists crm_ai_away_runs (
  id bigserial primary key,
  created_at timestamptz not null default now(),
  conversation_id uuid references crm_conversations(id) on delete cascade,
  mode text not null,                                     -- shadow | live
  action text not null,                                   -- answer | handoff | skip | blocked | error
  need text,                                              -- khách cần gì (AI tóm tắt)
  reason text,                                            -- vì sao chọn hành động này / vì sao bị chặn
  reply text,                                             -- nội dung đã gửi (live) hoặc sẽ gửi (shadow)
  product_codes text[] not null default '{}',
  sent boolean not null default false,
  error text,
  ms int
);
create index if not exists crm_ai_away_runs_created_idx on crm_ai_away_runs (created_at desc);

alter table crm_ai_away_state enable row level security;
alter table crm_ai_away_runs enable row level security;
drop policy if exists crm_ai_away_state_member_read on crm_ai_away_state;
create policy crm_ai_away_state_member_read on crm_ai_away_state for select to authenticated
  using (exists (select 1 from crm_members m where m.id = auth.uid() and m.is_active));
drop policy if exists crm_ai_away_runs_member_read on crm_ai_away_runs;
create policy crm_ai_away_runs_member_read on crm_ai_away_runs for select to authenticated
  using (exists (select 1 from crm_members m where m.id = auth.uid() and m.is_active));
-- ghi: chỉ service role qua các hàm dưới đây

-- 3) Khách nhắn → xếp hàng. Nhắn dồn nhiều tin thì lùi giờ xử lý, nhưng không quá 3 phút kể từ tin đầu.
--    Đang xử lý (running) mà khách nhắn thêm → chỉ ghi nhận last_in_at; lúc kết thúc sẽ bỏ câu trả lời cũ và xếp hàng lại.
create or replace function crm_ai_away_enqueue(p_conv uuid, p_msg_at timestamptz, p_delay_sec int)
returns text language plpgsql security definer set search_path = public as $$
declare st text;
begin
  insert into crm_ai_away_state as s (conversation_id, status, queued_at, last_in_at, due_at)
  values (p_conv, 'pending', now(), p_msg_at, now() + make_interval(secs => greatest(p_delay_sec, 10)))
  on conflict (conversation_id) do update set
    last_in_at = greatest(coalesce(s.last_in_at, excluded.last_in_at), excluded.last_in_at),
    queued_at = case when s.status = 'idle' then now() else coalesce(s.queued_at, now()) end,
    due_at = case
      when s.status = 'running' then s.due_at
      when s.status = 'idle' then excluded.due_at
      else least(excluded.due_at, coalesce(s.queued_at, now()) + interval '3 minutes') end,
    status = case when s.status = 'running' then 'running' else 'pending' end,
    updated_at = now()
  where not s.off
  returning s.status into st;
  return coalesce(st, 'off');
end $$;

-- 4) Có người trả lời (anh nhắn từ điện thoại, nhân viên gửi từ CRM, Meta AI trả lời) → huỷ lượt đang chờ
create or replace function crm_ai_away_cancel(p_conv uuid)
returns void language sql security definer set search_path = public as $$
  update crm_ai_away_state set status = 'idle', due_at = null, queued_at = null, updated_at = now()
  where conversation_id = p_conv and status = 'pending';
$$;

-- 5) Cron nhận 1 hội thoại tới hạn (không bao giờ 2 lượt cron cùng nhận 1 hội thoại)
create or replace function crm_ai_away_claim(p_lease_sec int)
returns setof crm_ai_away_state language sql security definer set search_path = public as $$
  update crm_ai_away_state s set status = 'running', lease_until = now() + make_interval(secs => p_lease_sec), updated_at = now()
  where s.conversation_id = (
    select conversation_id from crm_ai_away_state
    where status = 'pending' and due_at <= now() and not off
    order by due_at limit 1 for update skip locked)
  returning s.*;
$$;

-- 6) Lượt xử lý bị treo (hết lease) → về nghỉ, KHÔNG gửi lại (tránh gửi đôi). Trả về các hội thoại bị treo để ghi nhật ký.
create or replace function crm_ai_away_reap()
returns setof uuid language sql security definer set search_path = public as $$
  update crm_ai_away_state set status = 'idle', due_at = null, queued_at = null, lease_until = null, updated_at = now()
  where status = 'running' and lease_until < now()
  returning conversation_id;
$$;

-- 7) Kết thúc 1 lượt. Trong lúc xử lý khách nhắn thêm (last_in_at > p_snapshot) → xếp hàng lại ngay.
create or replace function crm_ai_away_finish(p_conv uuid, p_snapshot timestamptz, p_replied boolean, p_handoff boolean,
  p_session_start timestamptz default null)
returns text language plpgsql security definer set search_path = public as $$
declare again boolean;
begin
  update crm_ai_away_state s set
    status = case when s.last_in_at > p_snapshot and not s.off then 'pending' else 'idle' end,
    due_at = case when s.last_in_at > p_snapshot and not s.off then now() + interval '20 seconds' else null end,
    queued_at = case when s.last_in_at > p_snapshot and not s.off then now() else null end,
    lease_until = null,
    session_start = coalesce(p_session_start, s.session_start),
    replies = (case when p_session_start is not null and (s.session_start is null or s.session_start < p_session_start) then 0 else s.replies end)
              + (case when p_replied then 1 else 0 end),
    handoff_at = case when p_handoff then now()
                      when p_session_start is not null and (s.session_start is null or s.session_start < p_session_start) then null
                      else s.handoff_at end,
    last_ai_at = case when p_replied or p_handoff then now() else s.last_ai_at end,
    updated_at = now()
  where s.conversation_id = p_conv and s.status = 'running'
  returning (s.status = 'pending') into again;
  return case when again then 'requeued' else 'done' end;
end $$;

-- 8) Gửi qua Zalo trong MỘT giao dịch: kiểm lần cuối rồi mới xếp tin vào hàng gửi của worker.
--    p_items = [{ "type": "text"|"image", "text": "...", "attachments": [...] }] — mỗi ảnh 1 dòng (worker khớp tin dội lại theo từng dòng).
--    source = 'manual' để worker KHÔNG tự chèn thêm crm_messages (worker/zalo.mjs); tin AI nhận biết bằng raw.ai_away.
create or replace function crm_ai_away_commit_zalo(p_conv uuid, p_snapshot timestamptz, p_items jsonb)
returns jsonb language plpgsql security definer set search_path = public as $$
declare st crm_ai_away_state; cv record; it jsonb; n int := 0;
begin
  select * into st from crm_ai_away_state where conversation_id = p_conv for update;
  if st.conversation_id is null or st.status <> 'running' or st.lease_until < now() then return jsonb_build_object('ok', false, 'reason', 'lease'); end if;
  if st.off then return jsonb_build_object('ok', false, 'reason', 'off'); end if;
  if exists (select 1 from crm_messages where conversation_id = p_conv and direction = 'in' and sent_at > p_snapshot) then
    return jsonb_build_object('ok', false, 'reason', 'newer_inbound'); end if;
  if exists (select 1 from crm_messages where conversation_id = p_conv and direction = 'out' and sent_at > p_snapshot) then
    return jsonb_build_object('ok', false, 'reason', 'answered'); end if;
  if exists (select 1 from crm_outbox where conversation_id = p_conv and status = 'queued') then
    return jsonb_build_object('ok', false, 'reason', 'outbox_busy'); end if;
  select c.channel_id, i.external_id into cv from crm_conversations c join crm_identities i on i.id = c.identity_id where c.id = p_conv;
  if cv.external_id is null then return jsonb_build_object('ok', false, 'reason', 'no_recipient'); end if;
  for it in select * from jsonb_array_elements(p_items) loop
    insert into crm_messages (conversation_id, direction, type, text, attachments, status, sent_by, raw, created_at, sent_at)
    values (p_conv, 'out', coalesce(it->>'type', 'text'), nullif(it->>'text', ''), coalesce(it->'attachments', '[]'::jsonb), 'queued', 'ai_away',
            jsonb_build_object('ai_away', true), clock_timestamp(), clock_timestamp());
    insert into crm_outbox (conversation_id, channel_id, external_id, text, attachments, source, sent_by, created_at)
    values (p_conv, cv.channel_id, cv.external_id, coalesce(it->>'text', ''), coalesce(it->'attachments', '[]'::jsonb), 'manual', 'ai_away', clock_timestamp());
    n := n + 1;
  end loop;
  return jsonb_build_object('ok', true, 'queued', n);
end $$;

-- 9) Tin AI xếp hàng quá 3 phút mà worker chưa gửi (mất phiên Zalo…) → huỷ, tránh gửi muộn hàng giờ sau khi quét lại QR
create or replace function crm_ai_away_expire_outbox()
returns int language plpgsql security definer set search_path = public as $$
declare n int;
begin
  update crm_messages set status = 'failed', raw = coalesce(raw, '{}'::jsonb) || jsonb_build_object('error', 'AI trực thay: quá 3 phút chưa gửi được — đã huỷ')
  where status = 'queued' and sent_by = 'ai_away' and created_at < now() - interval '3 minutes';
  update crm_outbox set status = 'failed', error = 'AI trực thay: quá 3 phút chưa gửi được — đã huỷ'
  where status = 'queued' and sent_by = 'ai_away' and created_at < now() - interval '3 minutes';
  get diagnostics n = row_count; return n;
end $$;

revoke all on function crm_ai_away_enqueue(uuid, timestamptz, int) from public, anon, authenticated;
revoke all on function crm_ai_away_cancel(uuid) from public, anon, authenticated;
revoke all on function crm_ai_away_claim(int) from public, anon, authenticated;
revoke all on function crm_ai_away_reap() from public, anon, authenticated;
revoke all on function crm_ai_away_finish(uuid, timestamptz, boolean, boolean, timestamptz) from public, anon, authenticated;
revoke all on function crm_ai_away_commit_zalo(uuid, timestamptz, jsonb) from public, anon, authenticated;
revoke all on function crm_ai_away_expire_outbox() from public, anon, authenticated;
grant execute on function crm_ai_away_enqueue(uuid, timestamptz, int) to service_role;
grant execute on function crm_ai_away_cancel(uuid) to service_role;
grant execute on function crm_ai_away_claim(int) to service_role;
grant execute on function crm_ai_away_reap() to service_role;
grant execute on function crm_ai_away_finish(uuid, timestamptz, boolean, boolean, timestamptz) to service_role;
grant execute on function crm_ai_away_commit_zalo(uuid, timestamptz, jsonb) to service_role;
grant execute on function crm_ai_away_expire_outbox() to service_role;
