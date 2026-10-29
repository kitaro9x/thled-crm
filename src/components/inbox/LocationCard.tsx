import { MapPin } from "lucide-react";
/** Thẻ vị trí: tên, địa chỉ, bản đồ xem trước; bấm mở Google Maps */
export function LocationCard({ loc }: { loc: { lat: number; lng: number; title?: string; address?: string } }) {
  const maps = `https://maps.google.com/?q=${loc.lat},${loc.lng}`;
  const img = `https://staticmap.openstreetmap.de/staticmap.php?center=${loc.lat},${loc.lng}&zoom=15&size=300x150&markers=${loc.lat},${loc.lng},red-pushpin`;
  return <a href={maps} target="_blank" rel="noreferrer" className="block w-[300px] max-w-full rounded-xl overflow-hidden bg-white text-slate-800 border border-slate-200 hover:shadow">
    <img src={img} alt="Bản đồ" className="w-full h-[150px] object-cover bg-slate-100" onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = "none"; }} />
    <div className="p-2 flex gap-2 items-start"><MapPin size={16} className="text-red-500 shrink-0 mt-0.5" /><div className="min-w-0"><div className="font-semibold text-sm truncate">{loc.title || "Vị trí"}</div>{loc.address && <div className="text-xs text-slate-500">{loc.address}</div>}<div className="text-[11px] text-blue-600 mt-1">Mở Google Maps ↗</div></div></div>
  </a>;
}
