-- AI trực thay — sửa sau lượt soát: tin AI xếp hàng mà worker Zalo chưa gửi trong 60 giây thì huỷ (trước là 3 phút).
-- Lý do: worker khớp "tin dội lại" với dòng crm_messages tạo trong 2 PHÚT gần nhất (worker/zalo.mjs). Tin gửi muộn hơn 2 phút
-- sẽ không khớp → bị ghi thành một tin "gửi từ điện thoại" → hệ thống tưởng có người vừa trả lời và AI đứng ngoài 30 phút.
-- Cron chạy mỗi phút nên ngưỡng 60 giây bảo đảm tin bị huỷ trước mốc 2 phút.
-- Hàm mới trả về các hội thoại bị huỷ để ghi Nhật ký ca trực + báo người. (Hàm cũ crm_ai_away_expire_outbox() không còn được gọi.)
create or replace function crm_ai_away_expire(p_after_sec int default 60)
returns setof uuid language plpgsql security definer set search_path = public as $$
declare lim timestamptz := now() - make_interval(secs => greatest(p_after_sec, 30));
begin
  update crm_messages set status = 'failed', raw = coalesce(raw, '{}'::jsonb) || jsonb_build_object('error', 'AI trực thay: Zalo chưa gửi được sau ' || greatest(p_after_sec, 30) || ' giây — đã huỷ')
  where status = 'queued' and sent_by = 'ai_away' and created_at < lim;
  return query
    with x as (
      update crm_outbox set status = 'failed', error = 'AI trực thay: Zalo chưa gửi được sau ' || greatest(p_after_sec, 30) || ' giây — đã huỷ'
      where status = 'queued' and sent_by = 'ai_away' and created_at < lim
      returning conversation_id)
    select distinct x.conversation_id from x;
end $$;
revoke all on function crm_ai_away_expire(int) from public, anon, authenticated;
grant execute on function crm_ai_away_expire(int) to service_role;
