import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "제휴기사 등록신청 | 무료관광버스",
  description: "무료관광버스 제휴 기사님·전세버스 회사 모집",
};

export default function PartnerRegisterLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return children;
}
