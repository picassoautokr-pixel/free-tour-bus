import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "무료관광버스",
  description: "무료관광버스 MVP",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ko">
      <body className="min-h-screen bg-slate-200 text-zinc-950 antialiased">
        <div className="mx-auto min-h-screen w-full max-w-[480px] bg-white">
          {children}
        </div>
      </body>
    </html>
  );
}
