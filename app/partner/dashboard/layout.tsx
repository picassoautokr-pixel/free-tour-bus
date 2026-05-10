import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "제휴 기사 | 무료관광버스",
  robots: { index: false, follow: false },
};

export default function PartnerDashboardLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return children;
}
