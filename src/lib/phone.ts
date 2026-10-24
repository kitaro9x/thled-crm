export function normalizePhone(p?: string | null): string | null {
  if (!p) return null;
  let s = p.replace(/[^0-9+]/g, "");
  if (s.startsWith("+84")) s = "0" + s.slice(3);
  else if (s.startsWith("84") && s.length >= 11) s = "0" + s.slice(2);
  return /^0[35789][0-9]{8}$/.test(s) ? s : null;
}
export function extractPhone(text?: string | null): string | null {
  if (!text) return null;
  const m = text.replace(/[\s.\-]/g, "").match(/(?:\+?84|0)[35789][0-9]{8}/);
  return m ? normalizePhone(m[0]) : null;
}
export function formatPhone(p?: string | null) {
  if (!p) return "";
  return p.replace(/(\d{4})(\d{3})(\d{3})/, "$1 $2 $3");
}
