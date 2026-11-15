-- Sửa Trợ lý AI: ảnh sản phẩm nhiều dòng (đèn chùm, ốp trần, thiết bị điện, vật tư LED, NLMT, quạt Panasonic) lưu
-- đường dẫn tương đối "/thietbidien/sp/…" (file nằm trong public/ của web www.thled.vn) → CRM hiện ảnh lỗi.
-- Trả về URL tuyệt đối https://www.thled.vn/… (thled.vn chuyển hướng sang www). Link dòng sản phẩm cũng dùng www.
-- Thêm cột speed vào crm_ai_logs (standard | fast) để tính đúng chi phí khi bật chế độ nhanh.
alter table crm_ai_logs add column if not exists speed text;

create or replace function crm_ai_abs_url(u text) returns text language sql immutable as $$
  select case
    when u is null or u = '' then null
    when u like 'http://%' or u like 'https://%' then u
    when u like '//%' then 'https:' || u
    when u like '/%' then 'https://www.thled.vn' || u
    else 'https://www.thled.vn/' || u
  end
$$;

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
           'https://www.thled.vn' || coalesce(l.path, '') as url, i.gia as price_text, i.gia_tu as price_from,
           crm_ai_abs_url(i.image_url) as image_url, i.specs, i.categories,
           lower(concat_ws(' ', i.model, i.slug, i.gia, i.specs::text, array_to_string(i.categories, ' '), l.name)) as hay
    from landing_items i left join landing_lines l on l.code = i.line
    where i.active
    union all
    select 'landing_fans', f.model, 'quat-tran', 'Quạt trần', 'https://www.thled.vn/quattrandongnai', f.gia, f.gia_tu,
           crm_ai_abs_url(coalesce(f.image_url, f.thumb_url)),
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
