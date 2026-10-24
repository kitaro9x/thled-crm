import type { Metadata } from "next";
import "./globals.css";
export const metadata: Metadata = { title: "THLED CRM", description: "CRM bán hàng qua Zalo & Facebook cho THLED" };
export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (<html lang="vi"><body className="h-full">{children}</body></html>);
}
