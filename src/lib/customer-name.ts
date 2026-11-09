/** Đổi tên khách trong CRM nhưng không làm mất dấu tên cũ: tên trước đó được dồn vào custom.old_names (cùng kiểu custom.phones). */
export const PLACEHOLDER_NAME = /^(Khách mới|0\d{9})$/; // tên tạm hệ thống tự đặt — không đáng lưu vào lịch sử

type NameRow = { name?: string | null; custom?: Record<string, unknown> | null };

/** Danh sách tên cũ đã lưu (cũ nhất đứng trước). */
export const oldNames = (p?: NameRow | null): string[] =>
  Array.isArray(p?.custom?.old_names) ? (p!.custom!.old_names as unknown[]).filter((x): x is string => typeof x === "string" && !!x.trim()) : [];

/** Patch cho crm_customers khi đổi tên: name mới + custom.old_names đã gom tên cũ (bỏ trùng, bỏ tên tạm, bỏ tên vừa chọn lại). */
export function renamePatch(p: NameRow, newName: string) {
  const name = newName.trim();
  const prev = (p.name || "").trim();
  const keep = oldNames(p).filter((x) => x !== name);
  if (prev && prev !== name && !PLACEHOLDER_NAME.test(prev) && !keep.includes(prev)) keep.push(prev);
  return { name, custom: { ...(p.custom || {}), old_names: keep } };
}

/** Bỏ một tên khỏi lịch sử (không đổi tên hiện tại). */
export function dropOldNamePatch(p: NameRow, name: string) {
  return { custom: { ...(p.custom || {}), old_names: oldNames(p).filter((x) => x !== name) } };
}
