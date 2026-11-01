import { PhoneMissed, PhoneIncoming, PhoneOutgoing, Video } from "lucide-react";
/** Thẻ cuộc gọi: nhỡ = đỏ, đến = xanh lá, đi = xanh dương */
export function CallCard({ call }: { call: { missed: boolean; duration: number; video?: boolean; incoming: boolean } }) {
  const mmss = `${Math.floor(call.duration / 60)}:${String(call.duration % 60).padStart(2, "0")}`;
  const kind = call.missed ? "missed" : call.incoming ? "in" : "out";
  const style = { missed: "bg-red-50 text-red-700 border-red-200", in: "bg-emerald-50 text-emerald-700 border-emerald-200", out: "bg-blue-50 text-blue-700 border-blue-200" }[kind];
  const Icon = kind === "missed" ? PhoneMissed : kind === "in" ? PhoneIncoming : PhoneOutgoing;
  const label = call.missed ? (call.incoming ? "Cuộc gọi nhỡ" : "Gọi đi không bắt máy") : `Cuộc gọi ${call.incoming ? "đến" : "đi"}`;
  return <div className={`inline-flex items-center gap-2 rounded-lg border px-3 py-2 ${style}`}>
    <span className="rounded-full bg-white/70 p-1.5"><Icon size={16} /></span>
    <div className="leading-tight"><div className="font-semibold text-sm flex items-center gap-1">{label}{call.video && <Video size={12} />}</div><div className="text-[11px] opacity-80">{call.missed ? "Không có kết nối" : `Thời lượng ${mmss}`}</div></div>
  </div>;
}
