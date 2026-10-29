import { Avatar } from "@/components/Avatar";
/** Avatar nhóm kiểu Zalo: ghép ảnh tối đa 4 thành viên + số thành viên. Nhóm có ảnh riêng → dùng ảnh đó. */
export function GroupAvatar({ src, name, members, size = 40 }: { src?: string | null; name?: string | null; members?: { avatar?: string | null; name?: string }[]; size?: number }) {
  const withAvt = (members || []).filter((m) => m.avatar).slice(0, 4);
  const total = members?.length || 0;
  const isDefault = !src || /default|\/avt_default|zalo_default/i.test(src);
  if (!isDefault || withAvt.length < 2) return <Avatar src={src} name={name} size={size} />;
  const n = withAvt.length; const half = Math.round(size / 2);
  // 2 ảnh: chéo nhau; 3 ảnh: 1 trên 2 dưới; 4 ảnh: lưới 2x2
  const pos = n === 2 ? [[0, 0], [half, half]] : n === 3 ? [[half / 2, 0], [0, half], [half, half]] : [[0, 0], [half, 0], [0, half], [half, half]];
  const d = half + 2;
  return <div className="relative shrink-0" style={{ width: size, height: size }}>
    {withAvt.map((m, i) => (
      // eslint-disable-next-line @next/next/no-img-element
      <img key={i} src={m.avatar!} alt="" className="absolute rounded-full object-cover border border-white" style={{ width: d, height: d, left: pos[i][0], top: pos[i][1] }} />
    ))}
    {total > 2 && <span className="absolute -bottom-1 -right-1 bg-slate-200 text-slate-700 rounded-full text-[9px] font-semibold px-1 min-w-[16px] text-center border border-white">{total}</span>}
  </div>;
}
