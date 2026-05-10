import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "제휴 기사 로그인 | 무료관광버스",
  description: "제휴 전세버스 기사·법인 로그인",
};

export default function PartnerLoginLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return children;
}
