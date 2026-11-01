import type { NextConfig } from "next";
const nextConfig: NextConfig = {
  images: { remotePatterns: [{ protocol: "https", hostname: "**" }] },
  serverExternalPackages: ["pdfkit", "fontkit"], // pdfkit chạy nguyên bản trên Node, không bundle
  outputFileTracingIncludes: { "/api/orders/[id]/pdf": ["./fonts/**", "./node_modules/pdfkit/js/data/**"] }, // font tiếng Việt + dữ liệu pdfkit vào bundle Vercel
};
export default nextConfig;
