export const metadata = { title: "Chính sách quyền riêng tư — THLED CRM" };
export default function Privacy() {
  return (
    <main className="max-w-3xl mx-auto px-5 py-10 text-[15px] leading-7 text-slate-800">
      <h1 className="text-2xl font-bold mb-1">Chính sách quyền riêng tư</h1>
      <p className="text-slate-500 mb-6">Ứng dụng THLED CRM · Cập nhật: 25/10/2026</p>
      <p><b>Công ty TNHH Thương mại Dịch vụ THLED</b> (MST 3603912675, địa chỉ 824B Quốc lộ 1A, ấp Ngũ Phúc, P. Hố Nai, TP Đồng Nai; điện thoại 0966 931 056; email lecuong110296@gmail.com) vận hành ứng dụng nội bộ <b>THLED CRM</b> để tiếp nhận và chăm sóc khách hàng liên hệ qua Fanpage Facebook, Zalo và website thled.vn.</p>
      <H>1. Dữ liệu chúng tôi thu thập</H>
      <ul className="list-disc pl-6">
        <li>Thông tin bạn gửi khi nhắn tin hoặc bình luận trên Fanpage/Zalo của THLED: tên hiển thị, ảnh đại diện, nội dung tin nhắn, hình ảnh/tệp đính kèm, thời gian gửi.</li>
        <li>Thông tin bạn chủ động cung cấp để được tư vấn: số điện thoại, địa chỉ giao hàng, sản phẩm quan tâm.</li>
        <li>Dữ liệu kỹ thuật tối thiểu do nền tảng Meta/Zalo cung cấp qua API chính thức (ID người dùng theo trang – PSID).</li>
      </ul>
      <H>2. Mục đích sử dụng</H>
      <ul className="list-disc pl-6">
        <li>Trả lời tin nhắn, tư vấn sản phẩm, lập báo giá, xử lý đơn hàng và bảo hành.</li>
        <li>Lưu lịch sử trao đổi để nhân viên THLED hỗ trợ bạn liền mạch giữa các kênh.</li>
        <li>Thống kê nội bộ về chất lượng phục vụ (thời gian phản hồi, số lượng yêu cầu).</li>
      </ul>
      <p>Chúng tôi <b>không</b> bán, cho thuê hoặc chia sẻ dữ liệu cá nhân của bạn cho bên thứ ba vì mục đích quảng cáo.</p>
      <H>3. Lưu trữ và bảo mật</H>
      <p>Dữ liệu được lưu trên hạ tầng Supabase (khu vực Singapore) và Vercel, mã hoá khi truyền tải (HTTPS), chỉ nhân viên THLED được phân quyền mới truy cập. Dữ liệu được giữ trong thời gian cần thiết cho việc chăm sóc khách hàng và nghĩa vụ bảo hành, tối đa 5 năm kể từ lần tương tác cuối.</p>
      <H>4. Quyền của bạn</H>
      <p>Bạn có quyền yêu cầu xem, chỉnh sửa hoặc xoá dữ liệu cá nhân của mình bất kỳ lúc nào. Xem hướng dẫn tại <a className="text-blue-600 underline" href="/data-deletion">trang xoá dữ liệu</a> hoặc liên hệ hotline 0966 931 056 / email lecuong110296@gmail.com. Chúng tôi xử lý yêu cầu trong vòng 7 ngày làm việc.</p>
      <H>5. Nền tảng bên thứ ba</H>
      <p>Ứng dụng sử dụng API chính thức của Meta (Facebook Pages, Messenger) và Zalo theo điều khoản của các nền tảng này. Việc bạn sử dụng Facebook/Zalo còn chịu sự điều chỉnh của chính sách quyền riêng tư của Meta và Zalo.</p>
      <H>6. Thay đổi chính sách</H>
      <p>Mọi thay đổi sẽ được cập nhật tại trang này kèm ngày hiệu lực mới.</p>
      <hr className="my-8" />
      <h2 className="text-xl font-bold mb-2">Privacy Policy (English summary)</h2>
      <p>THLED CRM is an internal customer-service tool operated by THLED Trading & Services Co., Ltd (Vietnam). We collect messages, comments and contact details that customers send to the THLED Facebook Page, Zalo accounts or website, solely to reply, quote, fulfil orders and provide warranty support. Data is stored on Supabase/Vercel, encrypted in transit, accessible only to authorised THLED staff, and never sold or shared for advertising. You may request access, correction or deletion at any time via <a className="text-blue-600 underline" href="/data-deletion">/data-deletion</a>, hotline +84 966 931 056 or lecuong110296@gmail.com; requests are handled within 7 business days.</p>
    </main>
  );
}
const H = ({ children }: { children: React.ReactNode }) => <h2 className="text-lg font-semibold mt-6 mb-2">{children}</h2>;
