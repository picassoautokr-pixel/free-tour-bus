import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "지원금 기반 전세버스 매칭예약",
  description: "지원금 가승인 중심 전세버스 매칭예약 플랫폼",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ko">
      <body className="min-h-screen bg-slate-200 text-zinc-950 antialiased">
        {children}
      </body>
    </html>
  );
}
