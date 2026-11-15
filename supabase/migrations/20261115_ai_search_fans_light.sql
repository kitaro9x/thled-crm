-- Sửa tra quạt trần cho Trợ lý AI: 108 mẫu quạt CÓ đèn ghi cột den kiểu "LED 24W 3 màu" (không có chữ "đèn"),
-- còn quạt không đèn ghi "Không đèn" → tìm "quạt 1m4 đèn" chỉ ra quạt KHÔNG đèn (AI trả lời sai).
-- Thêm chữ "có đèn"/"không đèn" theo cột co_den vào chuỗi tìm kiếm + tham số lọc p_co_den.
-- Hàm mới crm_ai_search_products_v2 (thêm p_co_den); hàm cũ 5 tham số giữ nguyên tên, gọi sang v2 → code cũ cũng được sửa ngay.
-- (Không tạo overload cùng tên: PostgREST sẽ báo trùng hàm khi gọi bằng 5 tham số.)

create or replace function crm_ai_search_products_v2(q text, p_line text default null, p_min bigint default null,
  p_max bigint default null, p_limit int default 8, p_co_den boolean default null)
returns table (source text, code text, line text, line_name text, url text, price_text text, price_from bigint,
  image_url text, specs jsonb, categories text[])
language sql stable security definer set search_path = public as $$
  with words as (
    select array_agg('%' || w || '%') as pats
    from regexp_split_to_table(lower(trim(coalesce(q, ''))), '\s+') w where w <> ''
  ),
  items as (
    select 'landing_items'::text as source, i.model as code, i.line, l.name as line_name,
           'https://www.thled.vn' || coalesce(l.path, '') as url, i.gia as price_text, i.gia_tu as price_from,
           crm_ai_abs_url(i.image_url) as image_url, i.specs, i.categories,
           lower(concat_ws(' ', i.model, i.slug, i.gia, i.specs::text, array_to_string(i.categories, ' '), l.name)) as hay,
           null::boolean as co_den
    from landing_items i left join landing_lines l on l.code = i.line
    where i.active
    union all
    select 'landing_fans', f.model, 'quat-tran', 'Quạt trần', 'https://www.thled.vn/quattrandongnai', f.gia, f.gia_tu,
           crm_ai_abs_url(coalesce(f.image_url, f.thumb_url)),
           jsonb_strip_nulls(jsonb_build_object('mau_sac', f.mau_sac, 'chieu_cao', f.chieu_cao, 'duong_kinh', f.duong_kinh,
             'dong_co', f.dong_co, 'den', f.den, 'co_den', f.co_den, 'bao_hanh', f.bao_hanh)),
           f.categories,
           lower(concat_ws(' ', f.model, f.slug, f.gia, f.mau_sac, f.chieu_cao, f.duong_kinh, f.dong_co, f.den, f.bao_hanh,
             array_to_string(f.categories, ' '), 'quạt trần', case when f.co_den then 'có đèn' when f.co_den = false then 'không đèn' end)),
           f.co_den
    from landing_fans f where f.active
  )
  select it.source, it.code, it.line, it.line_name, it.url, it.price_text, it.price_from, it.image_url, it.specs, it.categories
  from items it, words w
  where (w.pats is null or it.hay like all (w.pats))
    and (p_line is null or it.line = p_line)
    and (p_min is null or it.price_from >= p_min)
    and (p_max is null or it.price_from <= p_max)
    and (p_co_den is null or it.co_den = p_co_den)
  order by (lower(it.code) = lower(trim(coalesce(q, '')))) desc, (it.price_from is null), it.price_from
  limit least(greatest(coalesce(p_limit, 8), 1), 20);
$$;
revoke all on function crm_ai_search_products_v2(text, text, bigint, bigint, int, boolean) from public, anon, authenticated;
grant execute on function crm_ai_search_products_v2(text, text, bigint, bigint, int, boolean) to service_role;

create or replace function crm_ai_search_products(q text, p_line text default null, p_min bigint default null,
  p_max bigint default null, p_limit int default 8)
returns table (source text, code text, line text, line_name text, url text, price_text text, price_from bigint,
  image_url text, specs jsonb, categories text[])
language sql stable security definer set search_path = public as $$
  select * from crm_ai_search_products_v2(q, p_line, p_min, p_max, p_limit, null)
$$;
revoke all on function crm_ai_search_products(text, text, bigint, bigint, int) from public, anon, authenticated;
grant execute on function crm_ai_search_products(text, text, bigint, bigint, int) to service_role;
