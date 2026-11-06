/** Màu chip nhãn theo nhóm ý nghĩa — chữ đủ tương phản cả sáng/tối */
export function labelTone(name: string) {
  const n = (name || "").toLowerCase();
  if (/khách hàng|khách vip|đã mua|khách xử lý/.test(n)) return "lchip-green";
  if (/khách hỏi|tìm hiểu|trả lời sau|led|đèn|quạt|quảng cáo/.test(n)) return "lchip-blue";
  if (/nhà cung cấp|thầu|công việc|shiper|shipper/.test(n)) return "lchip-amber";
  if (/công nợ|khiếu nại|bảo hành|huỷ|hủy/.test(n)) return "lchip-red";
  if (/gia đình|bạn bè/.test(n)) return "lchip-gray";
  return "lchip-violet";
}
