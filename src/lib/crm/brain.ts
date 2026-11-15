/**
 * THLED-Brain (vault Obsidian, repo kitaro9x/thled-brain) → kho tri thức cho AI trong CRM.
 * CHỈ nhận vùng chung `01-noi-bo-chung/` — vùng riêng (giá vốn, chiết khấu NCC, lãi gộp…) không bao giờ vào CRM.
 * Giữ đồng bộ luật lọc với `_tools/dong-bo-crm.py` trong repo THLED-Brain.
 */
export const BRAIN_PUBLIC_PREFIX = "01-noi-bo-chung/";

/** Có các cụm này trong trang vùng chung → KHÔNG nhận trang (nghi lọt dữ liệu vùng riêng). */
export const BRAIN_BLOCK_WORDS = ["giá đại lý", "giá nhập", "giá vốn", "biên lợi nhuận", "lãi gộp", "chiết khấu ncc"];
// Repo CRM là public → KHÔNG liệt kê tên nhà cung cấp ở đây. Cảnh báo tên NCC chạy ở `_tools/dong-bo-crm.py` (repo private).

export type BrainFrontmatter = Record<string, string | string[]>;
export interface BrainPage { path: string; title: string; type: string | null; tags: string[]; status: string | null; updated: string | null; content: string }
export interface BrainChunk { path: string; ord: number; heading: string | null; content: string }

const unquote = (s: string) => s.trim().replace(/^["'](.*)["']$/, "$1").trim();
function splitInlineList(s: string): string[] {
  const out: string[] = []; let cur = ""; let q: string | null = null;
  for (const ch of s) {
    if (q) { if (ch === q) q = null; cur += ch; continue; }
    if (ch === '"' || ch === "'") { q = ch; cur += ch; continue; }
    if (ch === ",") { out.push(cur); cur = ""; continue; }
    cur += ch;
  }
  out.push(cur);
  return out.map(unquote).filter(Boolean);
}

/** Frontmatter YAML đơn giản của vault: `key: value`, `key: [a, b]`, hoặc danh sách `- item` xuống dòng. */
export function parseFrontmatter(md: string): { fm: BrainFrontmatter; body: string } {
  const text = md.replace(/\r\n/g, "\n").normalize("NFC");
  const m = text.match(/^---\n([\s\S]*?)\n---\n?/);
  if (!m) return { fm: {}, body: text };
  const fm: BrainFrontmatter = {}; let listKey: string | null = null;
  for (const line of m[1].split("\n")) {
    const item = line.match(/^\s*-\s+(.*)$/);
    if (item && listKey) { (fm[listKey] as string[]).push(unquote(item[1])); continue; }
    const kv = line.match(/^([A-Za-z0-9_-]+):\s*(.*)$/);
    if (!kv) continue;
    const [, k, v] = kv; listKey = null;
    if (v.startsWith("[") && v.endsWith("]")) fm[k] = splitInlineList(v.slice(1, -1));
    else if (v === "") { fm[k] = []; listKey = k; }
    else fm[k] = unquote(v);
  }
  return { fm, body: text.slice(m[0].length) };
}

/** `[[a/b|Tên]]` → `Tên`; `[[ten-trang]]` → `ten-trang`; bỏ comment Obsidian `%% … %%`. */
export const cleanWiki = (s: string) => s
  .replace(/%%[\s\S]*?%%/g, "")
  .replace(/!\[\[[^\]]*\]\]/g, "")
  .replace(/\[\[([^\]|]+)\|([^\]]+)\]\]/g, "$2")
  .replace(/\[\[([^\]]+)\]\]/g, "$1");

const str = (v: string | string[] | undefined) => (Array.isArray(v) ? v.join(", ") : v || "").trim() || null;
const arr = (v: string | string[] | undefined) => (Array.isArray(v) ? v : v ? [v] : []);

/** Cắt trang theo heading `##`/`###`; đoạn quá dài cắt theo dòng, bảng markdown lặp lại dòng tiêu đề. */
export function chunkPage(path: string, title: string, body: string, maxChars = 3500): BrainChunk[] {
  const chunks: BrainChunk[] = [];
  let heading: string | null = null; let buf: string[] = []; let size = 0;
  let tableHead: string[] | null = null;
  const flush = () => {
    const text = buf.join("\n").trim();
    if (text) chunks.push({ path, ord: chunks.length, heading, content: `${title}${heading ? " › " + heading : ""}\n${text}` });
    buf = []; size = 0;
  };
  const lines = body.split("\n");
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const h = line.match(/^(#{2,3})\s+(.*)$/);
    if (h) { flush(); tableHead = null; heading = h[2].trim(); continue; }
    if (/^#\s+/.test(line) && !buf.length && !heading) continue; // tiêu đề H1 trùng title
    const isRow = line.trimStart().startsWith("|");
    if (isRow && !tableHead && /^\s*\|?\s*:?-{2,}/.test(lines[i + 1] || "")) tableHead = [line, lines[i + 1]];
    if (!isRow) tableHead = null;
    if (size + line.length > maxChars && buf.length) {
      flush();
      if (isRow && tableHead && line !== tableHead[0] && line !== tableHead[1]) { buf.push(...tableHead); size = tableHead.join("\n").length; }
    }
    buf.push(line); size += line.length + 1;
  }
  flush();
  return chunks;
}

export type BrainCheck = { ok: true; page: BrainPage; chunks: BrainChunk[]; warnings: string[] } | { ok: false; reason: string };

/** Kiểm + chuẩn hoá 1 file vault gửi sang. Từ chối mọi thứ không thuộc vùng chung. */
export function prepareBrainFile(path: string, raw: string): BrainCheck {
  const p = (path || "").replace(/\\/g, "/").normalize("NFC");
  if (!p.startsWith(BRAIN_PUBLIC_PREFIX) || p.includes("..") || !p.endsWith(".md")) return { ok: false, reason: "ngoài vùng chung 01-noi-bo-chung/" };
  const { fm, body } = parseFrontmatter(raw || "");
  if (str(fm.vung) !== "chung") return { ok: false, reason: `frontmatter vung=${str(fm.vung) || "(trống)"} — chỉ nhận vung: chung` };
  const lower = body.toLowerCase();
  const blocked = BRAIN_BLOCK_WORDS.filter((w) => lower.includes(w));
  if (blocked.length) return { ok: false, reason: `chứa từ vùng riêng: ${blocked.join(", ")}` };
  const warnings = str(fm.status) === "mau-thuan" ? ["trang đang có nội dung mâu thuẫn — AI sẽ chỉ cảnh báo nhân viên"] : [];
  const title = str(fm.title) || p.split("/").pop()!.replace(/\.md$/, "");
  const content = cleanWiki(body).trim();
  const page: BrainPage = { path: p, title, type: str(fm.type), tags: arr(fm.tags), status: str(fm.status), updated: str(fm.updated), content };
  return { ok: true, page, chunks: chunkPage(p, title, content), warnings };
}

export const BRAIN_STATUS_LABEL: Record<string, string> = { "on-dinh": "✅ ổn định", "can-bo-sung": "🟡 cần bổ sung", "chua-xac-minh": "🟡 chưa xác minh", "mau-thuan": "⚠️ mâu thuẫn" };
