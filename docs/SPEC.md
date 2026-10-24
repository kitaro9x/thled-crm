# THLED CRM — Đặc tả (clone SO9 CRM)

Nguồn: tài liệu SO9 (so9.gitbook.io) + khảo sát trực tiếp tài khoản SO9 của THLED (22–23/10/2026). Mục tiêu: CRM bán hàng dựa trên tin nhắn cho Zalo cá nhân + Fanpage, tự bắt SĐT → khách → cơ hội → kết bạn Zalo → chăm sóc.

## 1. Module & màn hình

| Module | Màn hình | Trạng thái code |
|---|---|---|
| Hội thoại | Inbox 3 cột: danh sách (lọc nhanh 7 tab + bộ lọc kênh/nhãn/nhân viên/SĐT), thread (gửi, hẹn giờ, nhãn, giao, quan trọng, đóng, trả lời nhanh `/phím_tắt`), panel khách (tạo khách, cơ hội, kết bạn Zalo, đơn, AI tóm tắt) | ✅ |
| Cơ hội | KPI bar, Table/Kanban kéo thả, tab Tất cả/Open/Lưu trữ, drawer lead (WON/LOST + lý do, tiến trình stage, ghi chú, hành động nhanh, dòng thời gian, trường) | ✅ |
| Hành động | tab Chưa xong/Gọi/Họp/Bám đuổi/Email/Quá hạn/Hôm nay/Đã xong | ✅ (chưa có view Lịch) |
| CDP | danh sách + tìm + phân trang, chi tiết Customer 360, tạo tay, import CSV, export CSV | ✅ |
| Tri thức | chủ đề, nội dung (tiêu đề, phím tắt, mô tả AI, loại) | ✅ |
| Đơn hàng | danh sách, tạo từ cơ hội (tự điền khách), tìm SP từ catalog thled.vn, thuế/ship/giảm, trang in báo giá | ✅ |
| Báo cáo | tổng quan tin nhắn theo giờ, kênh, thẻ, phản hồi TB; bán hàng theo nhân viên (Total/Qualified/Won/Lost/CR/Order/Revenue/AOV); phễu; lý do thất bại | ✅ (chưa có báo cáo tuỳ chỉnh) |
| Cài đặt | Kênh, Nhãn, Bot bình luận, Phân phối hội thoại/cơ hội, Ca làm việc, Nguồn khách hàng, Phễu, Luồng tự động hoá + Chấm điểm, Kịch bản nuôi, Nhân sự, SĐT, Lý do thất bại, Cảm xúc, Cài đặt hội thoại, Chuyển giao, Công ty | ✅ |

## 2. Luồng lõi

```
Tin đến (FB webhook / Zalo worker) → ingestMessage
  → identity (channel_id + external_id) → conversation (1/identity, comment theo post) → message (idempotent external_msg_id)
  → Nguồn khách hàng: regex SĐT (+84|0)[35789]xxxxxxxx → blacklist → dedupe phone/email
       → tạo/liên kết crm_customers → tạo crm_leads (always | if_none) → runAutomation(created_in_pipeline, created_or_moved_to_stage)
  → Phân phối hội thoại (nếu chưa có người phụ trách)
Lead đổi stage (UI/API) → required_fields check → runAutomation(created_or_moved_to_stage, moved_to_other_stage)
Cron 1 phút → outbox hẹn giờ (FB gửi tag POST_PURCHASE_UPDATE) · sequence step → outbox · trigger theo lịch · offline nhân sự
Zalo worker 15s → outbox zalo_personal · friend tasks (limit/ngày, delay 20–60s) · kiểm tra đã kết bạn → gửi tin sau kết bạn
```

## 3. Automation (9 trigger × 6 sự kiện × điều kiện)

- **Sự kiện**: created_in_pipeline · moved_to_pipeline · moved_to_other_stage · created_or_moved_to_stage · field_updated(field) · scheduled(at)
- **Điều kiện** (AND): `{field, op: empty|not_empty|eq|neq|contains|gt|lt, value}` trên trường lead + phone/email/fullname/gender của khách.
- **Hành động** `config`:
  - add_activity `{type, title, description, assignee_mode: owner|fixed, assignee_id, due: now|end_of_day|in_1_day|in_3_days|end_of_week|{d,h,m}, priority}`
  - change_stage `{stage_id}` (đệ quy tối đa 3 cấp)
  - change_field `{fields:{k:v}}` (title/labels/qualified/deal_size/assigned_to → cột; còn lại → custom)
  - distribute_lead `{reassign}` → crm_distribution_rules scope=lead
  - add_sequence `{sequence_id}`
  - zalo_friend `{account_mode: owner|fixed, zalo_uid, greeting≤150, after_accept_message, skip_if_friend, notify_old_channel, notify_text, send_mode, send_at}` → crm_zalo_friend_tasks
  - create_lead `{pipeline_id, stage_id}`
  - required_fields `{fields:[]}` (chặn ở API PATCH lead)
  - api_call `{url, method, headers}` body `{lead, person}`
- Biến mẫu: `{fullname} {gender} {phone}`; spin `#text{a|b|c}`.
- **Chấm điểm**: `formula` + `variables[{letter, field, values{value:score}}]` → 0–100 (chưa có job tính; UI có).

## 4. Phân phối (5 thuật toán)
round_robin · online_first (heartbeat 60s, offline sau 5 phút) · shift_first (crm_members.shift) · responder · phone_prefix. Tỷ lệ theo member, fallback ratio|fixed|none, only_with_phone, log vào crm_distribution_logs.

## 5. Schema (public.crm_*)
members · channels · labels · customers(person, +custom jsonb) · identities · conversations · messages · pipelines · stages · leads · lead_stage_history · activities · lead_sources · automation_rules · automation_logs · scoring_rules · knowledge_topics · knowledge · sequences · sequence_steps · sequence_enrollments · lead_products · orders (grand_total generated) · quote_templates · quotes · distribution_rules · distribution_logs · settings(kv) · lost_reasons · emotions · comment_bots · chatbots · zalo_friend_tasks · zalo_worker · outbox · webhook_events · oauth_tokens. Views: crm_v_conversations, crm_v_leads, crm_v_channels. RLS: thành viên active mới đọc/ghi; credentials kênh chỉ service role.

## 6. Rủi ro & quyết định
- Zalo cá nhân qua `zca-js` (không chính thức) → có thể bị khoá; giới hạn 15 kết bạn/ngày, 1 tài khoản, chạy trên VPS riêng. Phương án an toàn: Zalo OA (chưa làm).
- Messenger sau 24h phải dùng message tag; cần App Review để lên production.
- AI (tóm tắt/cảm xúc) tuỳ chọn, cần ANTHROPIC_API_KEY; prompt cảm xúc lấy nguyên từ SO9, lưu ở crm_emotions.
- Chưa làm: Zalo OA, chat widget, email, chatbot AI runtime, báo cáo tuỳ chỉnh, lịch hành động, mobile.
