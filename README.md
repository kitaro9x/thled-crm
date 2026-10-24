# THLED CRM — clone SO9 CRM cho Zalo & Facebook

CRM bán hàng dựa trên tin nhắn: gom inbox Fanpage + Zalo cá nhân, tự bắt SĐT tạo khách & cơ hội, phễu Kanban, hành động, luồng tự động hoá (kết bạn Zalo, giao việc, chuyển giai đoạn…), kịch bản nuôi, đơn hàng/báo giá, báo cáo.

Stack: Next.js 15 (App Router) · Supabase (Postgres + Auth + Realtime, project `lighting-website`) · Vercel · worker Zalo (Node, chạy riêng).

## 1. Database

Chạy file `supabase/migrations/20261023_crm_core.sql` trong Supabase SQL Editor (hoặc `supabase db push`). File này **mở rộng** các bảng `crm_*` đã có, không xoá dữ liệu. Có seed sẵn: phễu Default + 7 giai đoạn, 11 nhãn Zalo, 10 cảm xúc, lý do thất bại, mẫu báo giá, thông tin công ty.

## 2. Tài khoản admin đầu tiên

1. Supabase → Authentication → Users → Add user (email + password).
2. SQL:
   ```sql
   insert into crm_members (id, name, email, role)
   select id, 'THLED Admin', email, 'admin' from auth.users where email = 'thled.vn@gmail.com';
   ```
3. Các nhân sự sau tạo trong app: Cài đặt → Nhân sự & Quyền.

## 3. Biến môi trường

Copy `.env.example` → `.env.local` (local) và vào Vercel → Settings → Environment Variables.

| Biến | Lấy ở đâu |
|---|---|
| `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Supabase → Settings → API |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase → Settings → API (secret, chỉ server) |
| `FB_APP_ID`, `FB_APP_SECRET` | developers.facebook.com → app của THLED |
| `FB_VERIFY_TOKEN` | tự đặt, dùng khi đăng ký webhook |
| `CRON_SECRET` | tự đặt; Vercel tự gửi header này cho cron |
| `ANTHROPIC_API_KEY` | tuỳ chọn: AI tóm tắt / cảm xúc |
| `APP_URL` | (worker) URL app đã deploy, vd https://crm.thled.vn |

## 4. Deploy lên Vercel

```bash
npm i
npm run build        # kiểm tra
vercel               # hoặc import repo trên vercel.com
```
`vercel.json` đã có cron `/api/cron/jobs` mỗi phút (gửi tin hẹn giờ, kịch bản nuôi, trigger theo lịch, online/offline).

## 5. Kết nối Facebook Fanpage (API chính thức)

1. Meta for Developers → tạo app (Business) → thêm sản phẩm **Messenger** và **Webhooks**.
2. Webhooks → Page → Callback URL `https://<domain>/api/webhooks/facebook`, Verify token = `FB_VERIFY_TOKEN`; subscribe `messages, messaging_postbacks, message_deliveries, message_reads, feed`.
3. App Settings → Basic → thêm domain app vào *App Domains*; Facebook Login → Valid OAuth Redirect = domain app.
4. Trong CRM: Cài đặt → Kết nối kênh → **Kết nối** Facebook → chọn page. App lưu page token + tự subscribe.
5. Để gửi tin cho khách sau 24h, app dùng message tag `POST_PURCHASE_UPDATE` (chỉ dùng cho cập nhật đơn/giao hàng theo chính sách Meta). Chạy production cần App Review quyền `pages_messaging`.

## 6. Kết nối Zalo cá nhân (worker, KHÔNG chính thức)

```bash
APP_URL=https://crm.thled.vn npm run worker:zalo
```
- Chạy trên VPS/máy tính bật 24/7 (pm2: `pm2 start worker/zalo.mjs --name zalo`).
- Lần đầu: trong CRM bấm **Lấy mã QR đăng nhập** → quét bằng app Zalo của số sale. Session lưu trong `crm_zalo_worker`.
- Worker: nhận tin → `/api/internal/ingest`; gửi `crm_outbox`; kết bạn từ `crm_zalo_friend_tasks` (giới hạn `friend_daily_limit`, mặc định 15/ngày, delay 20–60s).

**Rủi ro**: dùng thư viện giả lập Zalo Web (`zca-js`) vi phạm điều khoản Zalo; tài khoản có thể bị hạn chế/khoá. Chỉ dùng số phụ, không spam, không chạy nhiều tài khoản trên cùng IP. Zalo OA (API chính thức) là lựa chọn an toàn nhưng tính phí và không kết bạn được.

## 7. Luồng dữ liệu

```
Tin nhắn (FB webhook / Zalo worker)
 └─ ingestMessage()  src/lib/crm/ingest.ts
     ├─ crm_identities ─ crm_conversations ─ crm_messages (trigger DB cập nhật last_message, unread)
     ├─ Nguồn khách hàng (crm_lead_sources): bắt SĐT (regex) → blacklist → dedupe → crm_customers → crm_leads
     │    └─ runAutomation()  src/lib/crm/automation.ts   (9 loại trigger, điều kiện, kích hoạt)
     │          └─ zalo_friend → crm_zalo_friend_tasks → worker gửi lời mời
     └─ Phân phối hội thoại (crm_distribution_rules, 5 thuật toán)  src/lib/crm/distribution.ts
Cron mỗi phút: outbox hẹn giờ · sequence steps · trigger theo lịch · offline nhân sự
```

## 8. Cấu trúc thư mục

```
src/app/(crm)/{inbox,leads,activities,cdp,knowledge,orders,reports,settings/*}
src/app/api/{webhooks/facebook,messages/send,leads,cron/jobs,internal/ingest,channels,members,presence,ai/summarize,export}
src/lib/crm/{ingest,automation,distribution,facebook}.ts
worker/zalo.mjs
supabase/migrations/20261023_crm_core.sql
```

## 9. Chưa làm / roadmap

- Zalo OA, Website chat widget, Email inbox
- Chatbot AI tự trả lời (bảng `crm_chatbots` đã có, chưa có runtime)
- Chấm điểm lead tự động (bảng `crm_scoring_rules` + UI có; chưa có job tính điểm)
- Báo cáo tuỳ chỉnh, xuất Excel báo cáo
- Kéo thả thứ tự giai đoạn, bulk edit lead, mobile layout
- Đồng bộ đơn hàng sang KiotViet (dùng `crm_orders.external_id`)
