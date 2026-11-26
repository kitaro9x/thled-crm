/**
 * Nén ảnh trên trình duyệt: tối đa `max`px cạnh dài, JPEG 0.85.
 * Mặc định: ảnh < 300 KB và GIF giữ nguyên.
 * force=true → luôn xuất JPEG (nền trắng cho PNG trong suốt) — dùng cho ảnh sản phẩm trong đơn hàng vì PDF chỉ nhận JPEG/PNG.
 */
export function compressImage(file: File, opts: { max?: number; force?: boolean } = {}): Promise<File> {
  const max = opts.max ?? 1600;
  return new Promise((resolve) => {
    if (!file.type.startsWith("image/") || (!opts.force && (file.type === "image/gif" || file.size < 300 * 1024))) return resolve(file);
    const img = new Image(); const url = URL.createObjectURL(file);
    img.onload = () => {
      const sc = Math.min(1, max / Math.max(img.width, img.height));
      const c = document.createElement("canvas"); c.width = Math.round(img.width * sc); c.height = Math.round(img.height * sc);
      const ctx = c.getContext("2d")!;
      if (opts.force) { ctx.fillStyle = "#fff"; ctx.fillRect(0, 0, c.width, c.height); }
      ctx.drawImage(img, 0, 0, c.width, c.height);
      c.toBlob((b) => {
        URL.revokeObjectURL(url);
        resolve(b && (opts.force || b.size < file.size) ? new File([b], file.name.replace(/\.\w+$/, "") + ".jpg", { type: "image/jpeg" }) : file);
      }, "image/jpeg", 0.85);
    };
    img.onerror = () => { URL.revokeObjectURL(url); resolve(file); };
    img.src = url;
  });
}
