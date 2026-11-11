/** Lời chào mặc định gửi khi khách đồng ý kết bạn Zalo (crm_settings.zalo_welcome). Giữ đồng bộ với WELCOME_DEFAULT trong worker/zalo.mjs */
export type ZaloWelcome = { enabled: boolean; skip_if_chatted: boolean; text: string };
export const ZALO_WELCOME_DEFAULT: ZaloWelcome = {
  enabled: true,
  skip_if_chatted: true,
  text: `Xin chào, hệ thống showroom THLED Trung Hiếu Đồng nai, cung cấp toàn bộ các sản phẩm thiết bị điện chiều sáng: Âm trần, thanh ray nam châm, dây led, vật tư led trần và cầu thang, công tắc ổ cắm, đèn trang trí và quạt trần giá và chính sách bảo hành đổi trả cực tốt. Anh chị cần gì cứ báo bên em báo giá ạ.
--------
💒Showroom 1: 126/13 Phạm Văn Thuân, Phường Tam Hiệp, Biên Hòa, Đồng Nai(Gần ngã ba bitis)
💒Showroom 2: 824B Ngũ Phúc, Trảng Bom, Đồng Nai( cạnh cây xăng 999)
💒Showroom 3: Long Thành, Đồng Nai
📱Hotline tư vấn, báo giá, phản ánh dịch vụ:  0966 931 056`,
};
