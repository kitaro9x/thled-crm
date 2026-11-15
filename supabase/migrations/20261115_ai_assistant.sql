-- Trợ lý AI (Claude) trong CRM: công tắc bật/tắt, nhật ký chi phí, kho tri thức THLED-Brain (chỉ vùng chung),
-- hàm tra sản phẩm (landing_items + landing_fans) cho AI. Chạy lại nhiều lần không sao.

-- 1) Cấu hình AI — mặc định TẮT để deploy xong không tự tốn tiền. Sửa ở Cài đặt → Trợ lý AI (chỉ admin).
insert into crm_settings (key, value) values ('ai', '{
  "enabled": false,
  "model": "claude-opus-5-5",
  "features": { "summary": true, "suggest": true, "lookup": true },
  "brain_pinned": [
    "01-noi-bo-chung/tu-van-khach/cam-ket-dich-vu.md",
    "01-noi-bo-chung/dao-tao/so-tay-van-hoa-thled.md",
    "01-noi-bo-chung/tu-van-khach/chinh-sach-khach-thau.md"
  ],
  "shop_notes": ""
}'::jsonb) on conflict (key) do nothing;

-- 2) Nhật ký mỗi lần gọi Claude (đếm token → ước tính chi phí)
create table if not exists crm_ai_logs (
  id bigserial primary key,
  created_at timestamptz not null default now(),
  member_id uuid references crm_members(id) on delete set null,
  conversation_id uuid references crm_conversations(id) on delete set null,
  feature text not null,                                  -- summary | suggest | ask
  model text,
  input_tokens int not null default 0,
  output_tokens int not null default 0,
  cache_read_tokens int not null default 0,
  cache_write_tokens int not null default 0,
  iterations int not null default 1,
  ms int,
  ok boolean not null default true,
  error text
);
create index if not exists crm_ai_logs_created_idx on crm_ai_logs (created_at desc);
alter table crm_ai_logs enable row level security;
drop policy if exists crm_ai_logs_admin_read on crm_ai_logs;
create policy crm_ai_logs_admin_read on crm_ai_logs for select to authenticated
  using (exists (select 1 from crm_members m where m.id=auth.uid() and m.is_active and m.role='admin'));
-- ghi: chỉ service role (API server), không có policy insert/update cho client

-- 3) Kho tri thức THLED-Brain — CHỈ vùng chung 01-noi-bo-chung/ (GitHub Action trong repo THLED-Brain đẩy sang)
create table if not exists crm_brain_pages (
  path text primary key check (path like '01-noi-bo-chung/%'),
  title text not null,
  type text,
  tags text[] not null default '{}',
  status text,                                            -- on-dinh | can-bo-sung | chua-xac-minh | mau-thuan
  updated date,
  content text not null default '',
  synced_at timestamptz not null default now()
);
create table if not exists crm_brain_chunks (
  id bigserial primary key,
  path text not null references crm_brain_pages(path) on delete cascade,
  ord int not null default 0,
  heading text,
  content text not null
);
create index if not exists crm_brain_chunks_path_idx on crm_brain_chunks (path, ord);
alter table crm_brain_pages enable row level security;
alter table crm_brain_chunks enable row level security;
drop policy if exists crm_brain_pages_member_read on crm_brain_pages;
create policy crm_brain_pages_member_read on crm_brain_pages for select to authenticated
  using (exists (select 1 from crm_members m where m.id=auth.uid() and m.is_active));
drop policy if exists crm_brain_chunks_member_read on crm_brain_chunks;
create policy crm_brain_chunks_member_read on crm_brain_chunks for select to authenticated
  using (exists (select 1 from crm_members m where m.id=auth.uid() and m.is_active));

-- thay toàn bộ bản chụp trong 1 transaction (không bao giờ thấy kho rỗng/nửa vời)
-- p_pages = [{path,title,type,tags[],status,updated,content}], p_chunks = [{path,ord,heading,content}]
create or replace function crm_brain_replace(p_pages jsonb, p_chunks jsonb)
returns int language plpgsql security definer set search_path = public as $$
declare n int;
begin
  delete from crm_brain_pages where true;
  insert into crm_brain_pages (path, title, type, tags, status, updated, content, synced_at)
  select p->>'path', coalesce(nullif(p->>'title', ''), p->>'path'), p->>'type',
         coalesce(array(select jsonb_array_elements_text(coalesce(p->'tags', '[]'::jsonb))), '{}'),
         p->>'status', (case when p->>'updated' ~ '^\d{4}-\d{2}-\d{2}$' then (p->>'updated')::date end),
         coalesce(p->>'content', ''), now()
  from jsonb_array_elements(p_pages) p;
  get diagnostics n = row_count;
  insert into crm_brain_chunks (path, ord, heading, content)
  select c->>'path', coalesce((c->>'ord')::int, 0), c->>'heading', c->>'content'
  from jsonb_array_elements(p_chunks) c;
  return n;
end $$;
revoke all on function crm_brain_replace(jsonb, jsonb) from public, anon, authenticated;
grant execute on function crm_brain_replace(jsonb, jsonb) to service_role;

-- 4) Tra sản phẩm cho AI: landing_items (đèn, vật tư, thiết bị điện…) + landing_fans (quạt trần).
-- Mỗi từ khoá trong q phải xuất hiện (không phân biệt hoa thường) trong mã / giá / thông số / danh mục / tên dòng.
create or replace function crm_ai_search_products(q text, p_line text default null, p_min bigint default null,
  p_max bigint default null, p_limit int default 8)
returns table (source text, code text, line text, line_name text, url text, price_text text, price_from bigint,
  image_url text, specs jsonb, categories text[])
language sql stable security definer set search_path = public as $$
  with words as (
    select array_agg('%' || w || '%') as pats
    from regexp_split_to_table(lower(trim(coalesce(q, ''))), '\s+') w where w <> ''
  ),
  items as (
    select 'landing_items'::text as source, i.model as code, i.line, l.name as line_name,
           'https://thled.vn' || coalesce(l.path, '') as url, i.gia as price_text, i.gia_tu as price_from,
           i.image_url, i.specs, i.categories,
           lower(concat_ws(' ', i.model, i.slug, i.gia, i.specs::text, array_to_string(i.categories, ' '), l.name)) as hay
    from landing_items i left join landing_lines l on l.code = i.line
    where i.active
    union all
    select 'landing_fans', f.model, 'quat-tran', 'Quạt trần', 'https://thled.vn/quattrandongnai', f.gia, f.gia_tu,
           f.image_url,
           jsonb_strip_nulls(jsonb_build_object('mau_sac', f.mau_sac, 'chieu_cao', f.chieu_cao, 'duong_kinh', f.duong_kinh,
             'dong_co', f.dong_co, 'den', f.den, 'co_den', f.co_den, 'bao_hanh', f.bao_hanh)),
           f.categories,
           lower(concat_ws(' ', f.model, f.slug, f.gia, f.mau_sac, f.chieu_cao, f.duong_kinh, f.dong_co, f.den, f.bao_hanh,
             array_to_string(f.categories, ' '), 'quạt trần'))
    from landing_fans f where f.active
  )
  select it.source, it.code, it.line, it.line_name, it.url, it.price_text, it.price_from, it.image_url, it.specs, it.categories
  from items it, words w
  where (w.pats is null or it.hay like all (w.pats))
    and (p_line is null or it.line = p_line)
    and (p_min is null or it.price_from >= p_min)
    and (p_max is null or it.price_from <= p_max)
  order by (lower(it.code) = lower(trim(coalesce(q, '')))) desc, (it.price_from is null), it.price_from
  limit least(greatest(coalesce(p_limit, 8), 1), 20);
$$;
revoke all on function crm_ai_search_products(text, text, bigint, bigint, int) from public, anon, authenticated;
grant execute on function crm_ai_search_products(text, text, bigint, bigint, int) to service_role;
