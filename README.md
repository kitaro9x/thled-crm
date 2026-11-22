# THLED CRM — clone SO9 CRM cho Zalo & Facebook

CRM bán hàng dựa trên tin nhắn: gom inbox Fanpage + Zalo cá nhân, tự bắt SĐT tạo khách & cơ hội, phễu Kanban, hành động, luồng tự động hoá (kết bạn Zalo, giao việc, chuyển giai đoạn…), kịch bản nuôi, đơn hàng/báo giá, báo cáo.

Stack: Next.js 15 (App Router) · Supabase (Postgres + Auth + Realtime, project `lighting-website`) · Vercel · worker Zalo (Node, chạy riêng).

> **Trạng thái triển khai & sổ tay vận hành (VPS, Zalo, lỗi đã gặp): xem `docs/OPERATIONS.md`.**

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
| `ANTHROPIC_API_KEY` | tuỳ chọn: Trợ lý AI (Claude) — xem mục 9 |
| `BRAIN_SYNC_SECRET` | tuỳ chọn: chuỗi bí mật ≥16 ký tự để repo THLED-Brain đẩy tri thức sang (mục 9) |
| `APP_URL` | (worker) URL app đã deploy, vd https://crm.thled.vn |

## 4. Deploy lên Vercel

```bash
npm i
npm run build        # kiểm tra
vercel               # hoặc import repo trên vercel.com
```
`vercel.json` có cron `/api/cron/jobs` 1 lần/ngày (giới hạn gói Hobby). Worker Zalo gọi endpoint này **mỗi phút** (gửi tin hẹn giờ, kịch bản nuôi, trigger theo lịch, online/offline) — nên worker cần chạy 24/7. Nếu lên gói Pro, đổi schedule thành `* * * * *`.

## 5. Kết nối Facebook Fanpage (API chính thức)

1. Meta for Developers → tạo app (Business) → thêm sản phẩm **Messenger** và **Webhooks**.
2. Webhooks → Page → Callback URL `https://<domain>/api/webhooks/facebook`, Verify token = `FB_VERIFY_TOKEN`; subscribe `messages, messaging_postbacks, message_deliveries, message_reads, feed`.
3. App Settings → Basic → thêm domain app vào *App Domains*. Thêm sản phẩm **Đăng nhập Facebook** → Cài đặt → *URI chuyển hướng OAuth hợp lệ* = `https://<domain>/api/channels/facebook/callback`.
4. Trong CRM: Cài đặt → Kết nối kênh → **Kết nối** Facebook (OAuth redirect) → chọn page. App lưu page token + tự subscribe. Dự phòng: nút *Dùng token* dán User Access Token từ Graph API Explorer.
5. Để gửi tin cho khách sau 24h, app dùng message tag `POST_PURCHASE_UPDATE` (chỉ dùng cho cập nhật đơn/giao hàng theo chính sách Meta). Chạy production cần App Review quyền `pages_messaging`.

## 6. Kết nối Zalo cá nhân (worker, KHÔNG chính thức)

VPS Ubuntu mới (cần Node 22): `curl -fsSL https://raw.githubusercontent.com/kitaro9x/thled-crm/main/scripts/install-vps.sh | bash` — script cài Node/pm2, clone repo, hỏi 4 biến env, chạy `pm2 start worker/zalo.mjs --name zalo`.

Chạy tay:
```bash
APP_URL=https://thled-crm.vercel.app npm run worker:zalo
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

**Tên khách**: tên trên kênh (Zalo/FB) nằm ở `crm_identities.display_name`; tên trong CRM là `crm_customers.name` (sửa được ở header hội thoại, panel khách, trang khách). Khi đổi tên, tên cũ được dồn vào `crm_customers.custom.old_names` (giống `custom.phones`), hiển thị ở mục *Tên cũ* (↑ dùng lại) và tìm được ở Dữ liệu khách hàng. Worker/ingest chỉ tự đổi `name` khi đang là tên tạm (*Khách mới*/SĐT) nên tên đặt tay trong CRM không bị ghi đè. Tên tạm *Người dùng Facebook* (FB ẩn tên) cũng không được lưu vào lịch sử.

> Nếu merge xong mà Vercel không tạo deploy Production (webhook rớt): Vercel → Deployments → ⋯ → *Create Deployment* chọn `main`, hoặc push thêm 1 commit lên `main`.

## 8. Cấu trúc thư mục

```
src/app/(crm)/{inbox,leads,activities,cdp,knowledge,orders,reports,settings/*}
src/app/api/{webhooks/facebook,messages/send,leads,cron/jobs,internal/ingest,channels,members,presence,ai/summarize,export}
src/lib/crm/{ingest,automation,distribution,facebook}.ts
worker/zalo.mjs
supabase/migrations/20261023_crm_core.sql
```

## 9. Trợ lý AI (Claude) + THLED-Brain

Bật/tắt ở **Cài đặt → Trợ lý AI (Claude)** (chỉ admin; mặc định TẮT). Mỗi nhân viên tự ẩn AI cho mình bằng ô *Trợ lý AI cho tôi* đầu danh sách hội thoại (localStorage). Tắt ở Cài đặt → server trả 403 cho mọi `/api/ai/*`.

| Tính năng | Ở đâu | API |
|---|---|---|
| Gợi ý trả lời (3 phương án, kèm ảnh SP) | nút **Gợi ý AI** trong ô soạn tin — chỉ chèn, không tự gửi | `POST /api/ai/suggest` |
| Tra giá / ảnh / chính sách | khung *Trợ lý AI* cột phải → *Ảnh* / *Chèn* vào ô soạn | `POST /api/ai/ask` |
| Tóm tắt hội thoại | nút *AI tóm tắt* cột phải | `POST /api/ai/summarize` |
| Đưa vào Brain (bài học) | menu ⋯ của hội thoại, hoặc chọn vài tin → *Đưa vào Brain* | `POST /api/ai/lessons/draft` → `POST /api/ai/lessons` |

- Model mặc định `claude-opus-5-5` (đổi Sonnet/Haiku 5.5 trong Cài đặt), SDK `@anthropic-ai/sdk`, structured output + tool chỉ-đọc (`search_products` → RPC `crm_ai_search_products` trên `landing_items` + `landing_fans`; `search_brain`; `search_quick_replies`). Giá/ảnh trên thẻ lấy từ DB, AI không tự viết. Mỗi lần gọi ghi `crm_ai_logs` (token → chi phí ước tính trong Cài đặt).
- Khách **thầu**: hội thoại có nhãn chứa “Thầu” → AI áp chính sách thầu (nhân viên đổi tay Lẻ/Thầu được).
- **THLED-Brain** (repo `kitaro9x/thled-brain`): GitHub Action `dong-bo-crm.yml` gửi **chỉ vùng chung** `01-noi-bo-chung/` sang `POST /api/internal/brain-sync` (header `x-brain-secret`). Server kiểm lần 2 (`src/lib/crm/brain.ts`: path, `vung: chung`, từ vùng riêng) rồi thay toàn bộ `crm_brain_pages` / `crm_brain_chunks`. Trang “luôn nạp” (cam kết dịch vụ, sổ tay văn hoá, chính sách thầu) vào system prompt có cache 1 giờ.
- **Bài học từ hội thoại** (`crm_ai_lessons`): AI chắt hội thoại thành bài học đã ẩn danh (`scrubPii` trong `src/lib/lessons.ts` xoá SĐT, email, link cá nhân; giữ SĐT của shop). Admin lưu → `approved`, nhân viên khác → `pending` chờ duyệt ở Cài đặt → Trợ lý AI. Bài `approved` vào prompt của Gợi ý / Tra cứu (quy tắc rút ra trong system prompt + 3 tình huống khớp nhất, tra phía server — `src/lib/crm/lessons-server.ts`), và được GitHub Action của THLED-Brain kéo về `raw/inbox/` qua `GET/POST /api/internal/brain-lessons` (cùng `BRAIN_SYNC_SECRET`).
- Migration: `supabase/migrations/20261115_ai_assistant.sql`, `20261115_ai_search_images.sql`, `20261115_ai_search_fans_light.sql`, `20261122_ai_lessons.sql`.

## 10. Chưa làm / roadmap

- Zalo OA, Website chat widget, Email inbox
- Chatbot AI **tự** trả lời khách (bảng `crm_chatbots` đã có, chưa có runtime — hiện AI chỉ gợi ý, nhân viên gửi)
- Chấm điểm lead tự động (bảng `crm_scoring_rules` + UI có; chưa có job tính điểm)
- Báo cáo tuỳ chỉnh, xuất Excel báo cáo
- Kéo thả thứ tự giai đoạn, bulk edit lead, mobile layout
- Đồng bộ đơn hàng sang KiotViet (dùng `crm_orders.external_id`)
