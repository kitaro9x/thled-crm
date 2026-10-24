import { initials } from "@/lib/utils";
export function Avatar({ src, name, size = 36 }: { src?: string | null; name?: string | null; size?: number }) {
  return src ? (
    // eslint-disable-next-line @next/next/no-img-element
    <img src={src} alt="" width={size} height={size} className="rounded-full object-cover shrink-0" style={{ width: size, height: size }} />
  ) : (
    <div className="rounded-full bg-slate-200 text-slate-600 grid place-items-center font-semibold shrink-0" style={{ width: size, height: size, fontSize: size / 2.6 }}>{initials(name)}</div>
  );
}
