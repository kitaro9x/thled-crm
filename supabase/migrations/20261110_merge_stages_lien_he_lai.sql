-- Gộp giai đoạn "Đang suy nghĩ" + "Đang tìm hiểu" vào "Liên hệ lại" (phễu mặc định)
-- Cơ hội đang ở 2 giai đoạn cũ được chuyển sang "Liên hệ lại" (có ghi lịch sử), rồi xoá 2 giai đoạn cũ.
do $$
declare p uuid; tgt uuid;
begin
  select id into p from crm_pipelines where is_default limit 1;
  if p is null then return; end if;
  select id into tgt from crm_stages where pipeline_id = p and name = 'Liên hệ lại' limit 1;
  if tgt is null then return; end if;

  insert into crm_lead_stage_history (lead_id, from_stage, to_stage)
  select l.id, l.stage_id, tgt from crm_leads l join crm_stages s on s.id = l.stage_id
  where s.pipeline_id = p and s.name in ('Đang suy nghĩ', 'Đang tìm hiểu');

  update crm_leads l set stage_id = tgt from crm_stages s
  where s.id = l.stage_id and s.pipeline_id = p and s.name in ('Đang suy nghĩ', 'Đang tìm hiểu');

  update crm_lead_sources set stage_id = tgt where stage_id in (select id from crm_stages where pipeline_id = p and name in ('Đang suy nghĩ', 'Đang tìm hiểu'));
  update crm_automation_rules set stage_id = tgt where stage_id in (select id from crm_stages where pipeline_id = p and name in ('Đang suy nghĩ', 'Đang tìm hiểu'));
  update crm_automation_rules set config = jsonb_set(config, '{stage_id}', to_jsonb(tgt::text))
  where config->>'stage_id' in (select id::text from crm_stages where pipeline_id = p and name in ('Đang suy nghĩ', 'Đang tìm hiểu'));

  delete from crm_stages where pipeline_id = p and name in ('Đang suy nghĩ', 'Đang tìm hiểu');
  update crm_stages set sort_order = 1 where id = tgt;
end $$;
