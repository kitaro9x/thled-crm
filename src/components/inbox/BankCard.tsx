"use client";
import { useState } from "react";
import { Copy, Check, Landmark } from "lucide-react";
const BANK_NAMES: Record<string, string> = { VCB: "Vietcombank", TCB: "Techcombank", CTG: "VietinBank", BIDV: "BIDV", VBA: "Agribank", MB: "MB Bank", ACB: "ACB", VPB: "VPBank", TPB: "TPBank", STB: "Sacombank", HDB: "HDBank", VIB: "VIB", SHB: "SHB", OCB: "OCB", MSB: "MSB", SEAB: "SeABank", EIB: "Eximbank", LPB: "LPBank", NAB: "Nam A Bank", BAB: "Bac A Bank", SCB: "SCB", PVCB: "PVcomBank", KLB: "KienlongBank", VIETBANK: "VietBank", ABB: "ABBANK", BVB: "BVBank", CAKE: "CAKE", TIMO: "Timo", MOMO: "MoMo" };
/** Thẻ tài khoản ngân hàng kiểu Zalo: tên NH, STK, chủ TK, QR chuyển khoản (VietQR) */
export function BankCard({ bank }: { bank: { bank?: string | null; bank_name?: string | null; account?: string | null; holder?: string | null } }) {
  const [ok, setOk] = useState(false);
  const name = (bank.bank && BANK_NAMES[bank.bank]) || bank.bank_name || "Ngân hàng";
  const qr = bank.bank && bank.account ? `https://img.vietqr.io/image/${bank.bank}-${bank.account}-qr_only.png` : null;
  const copy = async () => { try { await navigator.clipboard.writeText(bank.account || ""); setOk(true); setTimeout(() => setOk(false), 1500); } catch {} };
  return <div className="rounded-xl overflow-hidden text-white w-[300px] max-w-full" style={{ background: "linear-gradient(135deg,#0f7a4b,#15975c)" }}>
    <div className="flex items-center gap-2 px-3 py-2 bg-white/10"><span className="bg-white rounded-md p-1 text-emerald-700"><Landmark size={16} /></span><b className="text-sm">Ngân hàng {name}</b></div>
    <div className="flex items-center gap-3 p-3">
      <div className="flex-1 min-w-0">
        {bank.holder && <div className="text-xs text-emerald-100 truncate">{bank.holder}</div>}
        <div className="font-bold text-lg tracking-wide break-all">{bank.account || "—"}</div>
        <div className="text-[11px] text-emerald-100">Quét để chuyển khoản nhanh</div>
        {bank.account && <button onClick={copy} className="mt-2 inline-flex items-center gap-1 text-xs bg-white/15 hover:bg-white/25 rounded px-2 py-1">{ok ? <Check size={12} /> : <Copy size={12} />}{ok ? "Đã chép" : "Chép STK"}</button>}
      </div>
      {qr && <a href={qr} target="_blank" rel="noreferrer" className="shrink-0 bg-white rounded-lg p-1"><img src={qr} alt="QR" className="w-24 h-24" /></a>}
    </div>
  </div>;
}
