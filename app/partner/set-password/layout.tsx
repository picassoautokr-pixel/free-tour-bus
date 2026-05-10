import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "비밀번호 설정 | 제휴 기사",
  description: "초대를 수락한 제휴 기사 비밀번호 설정",
  robots: { index: false, follow: false },
};

export default function PartnerSetPasswordLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return children;
}
