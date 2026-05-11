import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "비밀번호 변경 | 제휴 기사",
  description: "제휴 기사 임시 비밀번호 변경",
  robots: { index: false, follow: false },
};

export default function PartnerChangePasswordLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return children;
}
