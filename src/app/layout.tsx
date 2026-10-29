import type { Metadata, Viewport } from "next";
import "./globals.css";
export const metadata: Metadata = {
  title: "THLED CRM", description: "CRM bán hàng qua Zalo & Facebook cho THLED",
  manifest: "/manifest.json",
  appleWebApp: { capable: true, statusBarStyle: "black-translucent", title: "THLED CRM" },
  icons: { icon: [{ url: "/favicon.ico", sizes: "32x32" }, { url: "/icons/favicon-64.png", sizes: "64x64" }, { url: "/icons/icon-192.png", sizes: "192x192" }], apple: "/icons/apple-touch-icon.png" },
};
export const viewport: Viewport = { themeColor: "#2563eb", width: "device-width", initialScale: 1, maximumScale: 1, viewportFit: "cover" };
export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (<html lang="vi" suppressHydrationWarning><body className="h-full">
    <script dangerouslySetInnerHTML={{ __html: `try{var t=localStorage.getItem('theme')||(matchMedia('(prefers-color-scheme: dark)').matches?'dark':'light');if(t==='dark')document.documentElement.classList.add('dark')}catch(e){}` }} />
    {children}
    <script dangerouslySetInnerHTML={{ __html: `if('serviceWorker' in navigator){window.addEventListener('load',()=>navigator.serviceWorker.register('/sw.js').catch(()=>{}))}` }} />
  </body></html>);
}
