-- Đồng bộ Google Calendar → Công việc (bảng tasks của /congviec, nguồn 'gcal').
-- Mỗi nhân sự dán "Địa chỉ bí mật ở định dạng iCal" của lịch Google; server đọc định kỳ (cron mỗi 5 phút).
-- Link là bí mật (ai có link đều xem được lịch) → bật RLS, KHÔNG tạo policy: chỉ service role (server) đọc/ghi.
create table if not exists public.crm_gcal_feeds (
  member_id uuid primary key references public.crm_members(id) on delete cascade,
  ics_url text not null,
  list_id uuid references public.task_lists(id) on delete set null, -- danh sách gán cho việc nhập từ lịch (vd "Cá nhân" để giữ riêng)
  last_synced_at timestamptz,
  last_error text,
  last_count int,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.crm_gcal_feeds enable row level security;

-- tra nhanh việc theo mã sự kiện Google (tránh tạo trùng)
create index if not exists tasks_gcal_event_idx on public.tasks (gcal_event_id) where gcal_event_id is not null;
