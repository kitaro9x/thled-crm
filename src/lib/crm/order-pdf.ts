import PDFDocument from "pdfkit";
import path from "path";
import fs from "fs";
const FONT = path.join(process.cwd(), "fonts", "Sans.ttf"), FONT_B = path.join(process.cwd(), "fonts", "Sans-Bold.ttf");
const vnd = (n: number) => (Number(n) || 0).toLocaleString("vi-VN") + " đ";
const d2 = (iso: string) => { const d = new Date(iso); return `${String(d.getDate()).padStart(2, "0")}/${String(d.getMonth() + 1).padStart(2, "0")}/${d.getFullYear()}`; };
/**
 * Tải ảnh sản phẩm cho PDF. pdfkit chỉ đọc JPEG/PNG → thu nhỏ + chuyển JPEG bằng sharp (đi kèm Next.js);
 * không có sharp thì dùng thẳng ảnh JPEG/PNG; ảnh lỗi / quá 6 giây / định dạng khác → bỏ qua (dòng đó không có ảnh).
 */
async function loadImage(url: string): Promise<Buffer | null> {
  try {
    const ac = new AbortController(); const t = setTimeout(() => ac.abort(), 6000);
    const r = await fetch(url, { signal: ac.signal }).finally(() => clearTimeout(t));
    if (!r.ok) return null;
    const buf = Buffer.from(await r.arrayBuffer()); if (!buf.length || buf.length > 15 * 1024 * 1024) return null;
    try {
      const sharp = (await import("sharp")).default;
      return await sharp(buf).rotate().resize(240, 240, { fit: "inside", withoutEnlargement: true }).flatten({ background: "#ffffff" }).jpeg({ quality: 82 }).toBuffer();
    } catch { /* không có sharp / ảnh lạ */ }
    const jpg = buf[0] === 0xff && buf[1] === 0xd8, png = buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4e && buf[3] === 0x47;
    return jpg || png ? buf : null;
  } catch { return null; }
}

/** Dựng PDF báo giá / đơn hàng (A4) → Buffer. Dòng hàng có ảnh (items[].image) → thêm cột Ảnh. */
export async function buildOrderPdf(o: any, company: any): Promise<Buffer> {
  const items: any[] = o.items || [];
  const imgs = await Promise.all(items.map((it) => (it?.image ? loadImage(String(it.image)) : Promise.resolve(null))));
  const hasImg = imgs.some(Boolean);
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
  // cột Ảnh (54pt) chỉ có khi ít nhất 1 dòng có ảnh tải được
  const IMG = 54;
  const cols = hasImg ? [24, IMG, W - 24 - IMG - 88 - 36 - 96, 88, 36, 96] : [28, W - 28 - 90 - 40 - 100, 90, 40, 100];
  const heads = hasImg ? ["#", "Ảnh", "Sản phẩm", "Đơn giá", "SL", "Thành tiền"] : ["#", "Sản phẩm", "Đơn giá", "SL", "Thành tiền"];
  const aligns: ("left" | "right")[] = hasImg ? ["left", "left", "left", "right", "right", "right"] : ["left", "left", "right", "right", "right"];
  const row = (vals: string[], bold = false, bg?: string, img?: Buffer | null) => {
    const th = Math.max(...vals.map((v, i) => (bold ? B() : R()).fontSize(9.5).heightOfString(v, { width: cols[i] - 8 }))) + 10;
    const h = !bold && hasImg ? Math.max(th, IMG) : th;
    if (y + h > doc.page.height - 120) { doc.addPage(); y = 48; }
    if (bg) doc.rect(L, y, W, h).fill(bg);
    let x = L; vals.forEach((v, i) => { (bold ? B() : R()).fontSize(9.5).fillColor("#0f172a").text(v, x + 4, y + (h - th) / 2 + 5, { width: cols[i] - 8, align: aligns[i] }); x += cols[i]; });
    if (img) { try { doc.image(img, L + cols[0] + 4, y + 4, { fit: [IMG - 8, h - 8], align: "center", valign: "center" }); } catch { /* ảnh hỏng → bỏ */ } }
    doc.moveTo(L, y + h).lineTo(L + W, y + h).lineWidth(0.5).strokeColor("#e2e8f0").stroke(); y += h;
  };
  row(heads, true, "#f1f5f9");
  items.forEach((it: any, i: number) => {
    const v = [String(i + 1), it.name || "", vnd(it.unit_price), String(it.qty), vnd(it.amount)];
    row(hasImg ? [v[0], "", ...v.slice(1)] : v, false, undefined, imgs[i]);
  });
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
