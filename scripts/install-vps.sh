#!/usr/bin/env bash
# THLED CRM — cài worker Zalo trên VPS Ubuntu 22.04/24.04 bằng 1 lệnh:
#   curl -fsSL https://raw.githubusercontent.com/kitaro9x/thled-crm/main/scripts/install-vps.sh | bash
set -e
echo "== 1/5 Cài Node.js 22 + git + pm2 =="
if ! command -v node >/dev/null || [ "$(node -v | cut -c2-3)" -lt 22 ]; then
  curl -fsSL https://deb.nodesource.com/setup_22.x | bash - >/dev/null
  apt-get install -y nodejs git >/dev/null
fi
npm i -g pm2 >/dev/null 2>&1 || true

echo "== 2/5 Tải mã nguồn =="
cd /opt
if [ -d thled-crm ]; then cd thled-crm && git pull -q; else git clone -q https://github.com/kitaro9x/thled-crm.git && cd thled-crm; fi
npm i --no-audit --no-fund >/dev/null

echo "== 3/5 Cấu hình =="
if [ ! -f .env.local ]; then
  read -rp "NEXT_PUBLIC_SUPABASE_URL: " SB_URL </dev/tty
  read -rp "SUPABASE_SERVICE_ROLE_KEY: " SB_KEY </dev/tty
  read -rp "CRON_SECRET (giống trên Vercel): " CRON </dev/tty
  read -rp "APP_URL [https://thled-crm.vercel.app]: " APP </dev/tty; APP=${APP:-https://thled-crm.vercel.app}
  cat > .env.local <<ENV
NEXT_PUBLIC_SUPABASE_URL=$SB_URL
SUPABASE_SERVICE_ROLE_KEY=$SB_KEY
CRON_SECRET=$CRON
APP_URL=$APP
ENV
  chmod 600 .env.local
fi

echo "== 4/5 Chạy worker bằng pm2 (tự khởi động lại khi reboot) =="
pm2 delete zalo >/dev/null 2>&1 || true
pm2 start worker/zalo.mjs --name zalo --time
pm2 save >/dev/null
pm2 startup systemd -u root --hp /root >/dev/null 2>&1 || true

echo "== 5/5 Xong =="
echo "Xem log:      pm2 logs zalo"
echo "Khởi động lại: pm2 restart zalo"
echo "Cập nhật code: cd /opt/thled-crm && git pull && npm i && pm2 restart zalo"
echo "Giờ vào CRM → Cài đặt → Kết nối kênh → 'Lấy mã QR đăng nhập' rồi quét bằng Zalo."
