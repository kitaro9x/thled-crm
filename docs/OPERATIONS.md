# THLED CRM — Trạng thái triển khai & Sổ tay vận hành (cập nhật 25/10/2026)

## 1. Hệ thống đang chạy

| Thành phần | Ở đâu | Ghi chú |
|---|---|---|
| Web CRM | https://thled-crm.vercel.app (Vercel, project `thled-crm`, repo GitHub `kitaro9x/thled-crm` — public) | Push lên `main` là tự deploy. Luôn `npm run build` sạch trước khi push. |
| Database | Supabase project `lighting-website` (`crnaymzkkoawgqcnpeub`), bảng `crm_*` | Dùng chung DB với web thled.vn. Migrations đã áp dụng: `crm_01`…`crm_15`. |
| Facebook | Meta app **THLED CRM** (ID 1547504764063226), chế độ **Phát triển** | Page đã kết nối: *Đèn trang trí và quạt trần đèn Đồng Nai* (103305928499577). Webhook `/api/webhooks/facebook` đã xác minh. |
| Zalo cá nhân | Worker `worker/zalo.mjs` trên VPS Vultr Singapore `207.148.73.195` (Ubuntu 24.04, Node 22, pm2 process `zalo`) | Tài khoản Zalo **Lyly** (uid 646165570850815279). Code tại `/opt/thled-crm`, env tại `/opt/thled-crm/.env.local`. |
| Admin CRM | thled.vn@gmail.com, lecuong110296@gmail.com (role admin) | Thêm nhân viên: Cài đặt → Nhân sự & Quyền. |

Luồng đã test thành công: FB nhận tin → inbox realtime → trả lời từ CRM → khách nhận; Zalo nhận/gửi (text + ảnh); bắt SĐT → tạo khách + cơ hội "Khởi tạo Lead" (nguồn *Hội thoại Fanpage & Zalo — bắt SĐT*).

## 2. Các lỗi đã gặp khi triển khai (để không lặp lại)

DB dùng chung với web nên các bảng `crm_*` có sẵn mang cấu hình cũ:
- `crm_identities.channel` có CHECK chỉ cho `facebook|zalo_oa|zalo_personal` → đã nới (`crm_13`).
- Bảng `crm_*` chưa GRANT cho role `authenticated` → thread trống dù list có → đã cấp (`crm_14`).
- Chưa bảng nào trong publication `supabase_realtime` → phải F5 mới thấy tin → đã bật cho messages/conversations/leads/activities/zalo_worker/outbox/friend_tasks (`crm_15`).
- Vercel env `SUPABASE_SERVICE_ROLE_KEY` dán nhầm nội dung → lỗi "Cannot convert argument to a ByteString" → dán lại key service_role.
- Kết nối FB qua popup JS SDK không chạy → đổi sang OAuth redirect (`/api/channels/facebook/start` → `/callback`), cần *Valid OAuth Redirect URIs* = `https://thled-crm.vercel.app/api/channels/facebook/callback` trong Meta → Đăng nhập Facebook → Cài đặt.
- Worker: `dotenv` phải ở dependencies; supabase-js cần Node ≥ 22.

## 3. Vận hành VPS (PowerShell trên Windows)

```
ssh root@207.148.73.195          # mật khẩu lấy trong Vultr → server → Password (gõ không hiện ký tự; tắt Unikey)
pm2 logs zalo                    # xem log, Ctrl+C thoát
pm2 restart zalo                 # khởi động lại worker
pm2 status
cd /opt/thled-crm && git pull && npm i && pm2 restart zalo   # cập nhật code mới
cat /opt/thled-crm/.env.local    # xem env (URL, service key, CRON_SECRET, APP_URL)
```
Cài lại từ máy trắng: `curl -fsSL https://raw.githubusercontent.com/kitaro9x/thled-crm/main/scripts/install-vps.sh | bash`

Worker tự chạy lại khi VPS reboot (pm2 startup đã bật). Session Zalo lưu trong `crm_zalo_worker`; nếu mất (đăng xuất trên điện thoại, Zalo bắt đăng nhập lại) → CRM → Cài đặt → Kết nối kênh → *Lấy mã QR đăng nhập* → quét lại.

## 4. Quy tắc dùng Zalo cá nhân (tránh bị khoá)

- Chỉ dùng **số phụ** (Lyly), không dùng Zalo chính. Không bấm "đăng xuất thiết bị khác" trên điện thoại.
- Kết bạn tự động: `friend_daily_limit` mặc định 15/ngày, delay 20–60s. Tuần đầu nên 5–10.
- Nếu Zalo báo hạn chế → tắt kết bạn vài ngày (đặt limit = 0), không cố.
- VPS IP Singapore → đôi khi Zalo hỏi xác minh trên điện thoại, xác nhận "Đó là tôi".
- Phương án dự phòng: chạy worker trên máy tính cửa hàng (IP Việt Nam) — code không đổi.

## 5. Việc còn lại

1. Vercel env `CRON_SECRET` phải khớp với VPS (`.env.local`) → Save → Redeploy (để tin hẹn giờ, kịch bản nuôi, trigger theo lịch chạy mỗi phút qua worker).
2. Meta: xác minh doanh nghiệp (Business ID 1208653463059756) + App Review `pages_messaging`, `pages_read_engagement`, `pages_manage_metadata` → chuyển app sang **Chính thức**. Khi chưa chuyển, Fanpage chỉ nhận tin từ admin/tester của app; **khách thật chưa vào CRM qua Facebook** (Zalo thì đã nhận khách thật).
3. Kết nối thêm page THLED Decor nếu cần (bấm Kết nối lại + "Thêm đăng ký" page trong Meta → Messenger).
4. Reset App Secret trên Meta (đã lộ qua chat) → cập nhật `FB_APP_SECRET` Vercel → Redeploy. Cân nhắc xoay service_role key (ảnh hưởng web thled.vn, làm lúc rảnh).
5. Đổi mật khẩu admin tạm; đổi tên 2 tài khoản "THLED Admin" trong Nhân sự.
6. Blacklist SĐT: hiện có hotline 0966931056 (Cài đặt → Số điện thoại); thêm số chi nhánh/nhân viên khác để không tạo khách giả.
