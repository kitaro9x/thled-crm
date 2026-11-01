import PDFDocument from "pdfkit";
import path from "path";
import fs from "fs";
const FONT = path.join(process.cwd(), "fonts", "Sans.ttf"), FONT_B = path.join(process.cwd(), "fonts", "Sans-Bold.ttf");
const vnd = (n: number) => (Number(n) || 0).toLocaleString("vi-VN") + " đ";
const d2 = (iso: string) => { const d = new Date(iso); return `${String(d.getDate()).padStart(2, "0")}/${String(d.getMonth() + 1).padStart(2, "0")}/${d.getFullYear()}`; };
/** Dựng PDF báo giá / đơn hàng (A4) → Buffer */
export async function buildOrderPdf(o: any, company: any): Promise<Buffer> {
  // dọn khoảng trống tránh pdfkit đọc font chuẩn AFM (không có trong bundle serverless)
  const doc = new PDFDocument({ size: "A4", margin: 48, font: fs.existsSync(FONT) ? FONT : undefined, info: { Title: `${o.code || "Don hang"} - ${company?.name || "THLED"}` } });
  const chunks: Buffer[] = []; doc.on("data", (c) => chunks.push(c));
  const done = new Promise<Buffer>((res) => doc.on("end", () => res(Buffer.concat(chunks))));
  const R = () => doc.font(FONT), B = () => doc.font(FONT_B);
  const W = doc.page.width - 96; const L = 48;
  // header
  B().fontSize(16).fillColor("#0f172a").text(company?.name || "THLED", L, 48, { width: W * 0.6 });
  R().fontSize(9).fillColor("#475569").text([company?.address, [company?.phone && "ĐT: " + company.phone, company?.website, company?.tax_code && "MST " + company.tax_code].filter(Boolean).join(" · ")].filter(Boolean).join("\n"), L, doc.y + 2, { width: W * 0.6 });
  B().fontSize(15).fillColor("#1d4ed8").text("BÁO GIÁ / ĐƠN HÀNG", L + W * 0.6, 48, { width: W * 0.4, align: "right" });
  R().fontSize(10).fillColor("#0f172a").text(`Số: ${o.code || "-"}\nNgày: ${d2(o.created_at)}`, L + W * 0.6, doc.y + 2, { width: W * 0.4, align: "right" });
  doc.moveTo(L, 118).lineTo(L + W, 118).lineWidth(1.5).strokeColor("#0f172a").stroke();
  // customer
  let y = 130; const cu = o.crm_customers || {};
  B().fontSize(10).text("Khách hàng: ", L, y, { continued: true }); R().text(cu.name || "-");
  B().text("SĐT: ", L, doc.y, { continued: true }); R().text(cu.phone || "-");
  B().text("Địa chỉ: ", L, doc.y, { continued: true }); R().text(cu.address || "-", { width: W * 0.55 });
  const yR = 130; B().text("Trạng thái: ", L + W * 0.6, yR, { continued: true }); R().text({ new: "Mới", confirmed: "Đã xác nhận", delivering: "Đang giao", done: "Hoàn thành", cancelled: "Huỷ" }[o.status as string] || o.status);
  if (o.note) { B().text("Ghi chú: ", L + W * 0.6, doc.y, { continued: true }); R().text(o.note, { width: W * 0.4 }); }
  y = Math.max(doc.y, 190) + 10;
  // table
  const cols = [28, W - 28 - 90 - 40 - 100, 90, 40, 100]; const heads = ["#", "Sản phẩm", "Đơn giá", "SL", "Thành tiền"]; const aligns: ("left" | "right")[] = ["left", "left", "right", "right", "right"];
  const row = (vals: string[], bold = false, bg?: string) => {
    const h = Math.max(...vals.map((v, i) => (bold ? B() : R()).fontSize(9.5).heightOfString(v, { width: cols[i] - 8 }))) + 10;
    if (y + h > doc.page.height - 120) { doc.addPage(); y = 48; }
    if (bg) doc.rect(L, y, W, h).fill(bg);
    let x = L; vals.forEach((v, i) => { (bold ? B() : R()).fontSize(9.5).fillColor("#0f172a").text(v, x + 4, y + 5, { width: cols[i] - 8, align: aligns[i] }); x += cols[i]; });
    doc.moveTo(L, y + h).lineTo(L + W, y + h).lineWidth(0.5).strokeColor("#e2e8f0").stroke(); y += h;
  };
  row(heads, true, "#f1f5f9");
  (o.items || []).forEach((it: any, i: number) => row([String(i + 1), it.name || "", vnd(it.unit_price), String(it.qty), vnd(it.amount)]));
  // totals
  y += 10; const tx = L + W - 240;
  const tot = (k: string, v: string, bold = false) => { (bold ? B() : R()).fontSize(bold ? 11 : 10).fillColor(bold ? "#0f172a" : "#475569").text(k, tx, y, { width: 120 }); (bold ? B() : R()).fillColor("#0f172a").text(v, tx + 120, y, { width: 120, align: "right" }); y += bold ? 20 : 16; };
  tot("Tổng tiền hàng", vnd(o.total_amount)); if (Number(o.tax)) tot("Thuế", vnd(o.tax)); if (Number(o.shipping_fee)) tot("Phí vận chuyển", vnd(o.shipping_fee)); if (Number(o.total_discount)) tot("Giảm giá", "-" + vnd(o.total_discount));
  doc.moveTo(tx, y).lineTo(L + W, y).lineWidth(1).strokeColor("#0f172a").stroke(); y += 6; tot("Tổng thanh toán", vnd(o.grand_total), true);
  // commitments + signatures
  y += 14; R().fontSize(9).fillColor("#475569").text(company?.commitment || "Giá đã bao gồm lắp đặt tận nơi · Bảo hành tận nơi · Giao tận nơi · Đổi trả 7 ngày", L, y, { width: W });
  y = Math.min(doc.y + 30, doc.page.height - 110);
  B().fontSize(10).fillColor("#0f172a").text("Người lập báo giá", L, y, { width: W / 2, align: "center" }); B().text("Khách hàng", L + W / 2, y, { width: W / 2, align: "center" });
  R().fontSize(8).fillColor("#94a3b8").text("(Ký, ghi rõ họ tên)", L, y + 14, { width: W / 2, align: "center" }); R().text("(Ký, ghi rõ họ tên)", L + W / 2, y + 14, { width: W / 2, align: "center" });
  doc.end(); return done;
}
