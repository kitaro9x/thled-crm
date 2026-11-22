-- Bài học từ hội thoại ("Đưa vào Brain"): nhân viên chọn 1 hội thoại / vài tin → AI chắt thành bài học đã ẩn danh
-- (tình huống → cách xử lý → kết quả → quy tắc rút ra). Admin duyệt (status = approved) là Trợ lý AI dùng ngay;
-- GitHub Action của repo THLED-Brain kéo bài đã duyệt về raw/inbox/ rồi đánh dấu brain_exported_at.
create table if not exists crm_ai_lessons (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references crm_members(id) on delete set null,
  conversation_id uuid references crm_conversations(id) on delete set null,
  status text not null default 'pending' check (status in ('pending', 'approved', 'rejected', 'off')),
  approved_by uuid references crm_members(id) on delete set null,
  approved_at timestamptz,
  title text not null,
  situation text not null default '',                     -- khách hỏi / gặp chuyện gì
  handling text not null default '',                      -- shop đã xử lý thế nào
  outcome text not null default '',                       -- kết quả
  takeaway text not null default '',                      -- quy tắc rút ra (AI luôn đọc phần này)
  sample_reply text not null default '',                  -- câu trả lời mẫu (tuỳ chọn)
  customer_type text check (customer_type in ('le', 'thau')),
  tags text[] not null default '{}',
  brain_exported_at timestamptz                           -- đã chép sang THLED-Brain raw/inbox
);
create index if not exists crm_ai_lessons_status_idx on crm_ai_lessons (status, created_at desc);
drop trigger if exists trg_ai_lessons_upd on crm_ai_lessons;
create trigger trg_ai_lessons_upd before update on crm_ai_lessons for each row execute function crm_touch_updated_at();

alter table crm_ai_lessons enable row level security;
drop policy if exists crm_ai_lessons_member_read on crm_ai_lessons;
create policy crm_ai_lessons_member_read on crm_ai_lessons for select to authenticated
  using (exists (select 1 from crm_members m where m.id = auth.uid() and m.is_active));
-- ghi: chỉ service role (API /api/ai/lessons kiểm quyền admin khi duyệt)
