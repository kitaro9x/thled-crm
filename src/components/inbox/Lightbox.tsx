"use client";
import { useEffect, useState } from "react";
import { X, ChevronLeft, ChevronRight, Download, ZoomIn, ZoomOut, MessageSquareText } from "lucide-react";
/** Xem ảnh lớn: ←→ chuyển ảnh, +/- hoặc lăn chuột phóng to, Esc đóng; onJump → nút "Xem trong hội thoại" */
export function Lightbox({ images, index, onClose, onJump }: { images: { url: string; caption?: string }[]; index: number; onClose: () => void; onJump?: (index: number) => void }) {
  const [i, setI] = useState(index); const [zoom, setZoom] = useState(1);
  const prev = () => { setI((x) => (x - 1 + images.length) % images.length); setZoom(1); };
  const next = () => { setI((x) => (x + 1) % images.length); setZoom(1); };
  useEffect(() => {
    const k = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); else if (e.key === "ArrowLeft") prev(); else if (e.key === "ArrowRight") next(); else if (e.key === "+" || e.key === "=") setZoom((z) => Math.min(z + 0.5, 4)); else if (e.key === "-") setZoom((z) => Math.max(z - 0.5, 1)); };
    document.addEventListener("keydown", k); return () => document.removeEventListener("keydown", k); // eslint-disable-next-line
  }, [images.length]);
  const cur = images[i]; if (!cur) return null;
  return <div className="fixed inset-0 z-[60] bg-black/90 flex items-center justify-center select-none" onClick={onClose} onWheel={(e) => { e.stopPropagation(); setZoom((z) => Math.min(4, Math.max(1, z + (e.deltaY < 0 ? 0.25 : -0.25)))); }}>
    <div className="absolute top-3 left-3 text-white/80 text-sm">{i + 1} / {images.length}{cur.caption && <span className="ml-2 text-white/60">· {cur.caption}</span>}</div>
    <div className="absolute top-3 right-3 flex gap-1" onClick={(e) => e.stopPropagation()}>
      {onJump && <button className="text-white bg-white/10 hover:bg-white/20 rounded-full p-2" title="Xem trong hội thoại" onClick={() => onJump(i)}><MessageSquareText size={18} /></button>}
      <button className="text-white bg-white/10 hover:bg-white/20 rounded-full p-2" title="Phóng to (+)" onClick={() => setZoom((z) => Math.min(z + 0.5, 4))}><ZoomIn size={18} /></button>
      <button className="text-white bg-white/10 hover:bg-white/20 rounded-full p-2" title="Thu nhỏ (-)" onClick={() => setZoom((z) => Math.max(z - 0.5, 1))}><ZoomOut size={18} /></button>
      <a href={cur.url} target="_blank" rel="noreferrer" className="text-white bg-white/10 hover:bg-white/20 rounded-full p-2" title="Mở ảnh gốc / tải"><Download size={18} /></a>
      <button className="text-white bg-white/10 hover:bg-white/20 rounded-full p-2" title="Đóng (Esc)" onClick={onClose}><X size={18} /></button>
    </div>
    {images.length > 1 && <><button className="absolute left-2 md:left-4 text-white bg-white/10 hover:bg-white/20 rounded-full p-2" onClick={(e) => { e.stopPropagation(); prev(); }} title="Ảnh trước (←)"><ChevronLeft size={24} /></button>
      <button className="absolute right-2 md:right-4 text-white bg-white/10 hover:bg-white/20 rounded-full p-2" onClick={(e) => { e.stopPropagation(); next(); }} title="Ảnh sau (→)"><ChevronRight size={24} /></button></>}
    <div className="max-w-[92vw] max-h-[90vh] overflow-auto" onClick={(e) => e.stopPropagation()}>
      <img src={cur.url} alt="" draggable={false} style={{ transform: `scale(${zoom})`, transformOrigin: "center", transition: "transform .15s" }} className="max-w-[92vw] max-h-[90vh] object-contain cursor-zoom-in" onClick={() => setZoom((z) => (z >= 2 ? 1 : z + 1))} />
    </div>
  </div>;
}
