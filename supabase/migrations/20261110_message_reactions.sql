-- Biểu tượng cảm xúc (tim, like, haha…) trên từng tin nhắn — Zalo cá nhân + Messenger
-- reactions = { "<uid người thả>": { "icon": "❤️", "name": "Tên", "self": false, "at": "<iso>" } }
alter table crm_messages add column if not exists reactions jsonb not null default '{}'::jsonb;

-- cập nhật nguyên tử (nhiều reaction tới cùng lúc không ghi đè nhau); icon rỗng/null = gỡ reaction
create or replace function crm_set_reaction(p_msg_ids text[], p_uid text, p_icon text, p_name text default null, p_self boolean default false)
returns int language plpgsql security definer set search_path = public as $$
declare n int;
begin
  if p_icon is null or p_icon = '' then
    update crm_messages set reactions = reactions - p_uid where external_msg_id = any(p_msg_ids) and reactions ? p_uid;
  else
    update crm_messages set reactions = reactions || jsonb_build_object(p_uid, jsonb_build_object('icon', p_icon, 'name', p_name, 'self', p_self, 'at', now()))
    where external_msg_id = any(p_msg_ids);
  end if;
  get diagnostics n = row_count; return n;
end $$;
revoke all on function crm_set_reaction(text[], text, text, text, boolean) from public, anon, authenticated;
grant execute on function crm_set_reaction(text[], text, text, text, boolean) to service_role;
