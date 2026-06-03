"use client";

import Link from "next/link";
import { roleRegisterUrl } from "@/lib/role-hosts";

export function SiteHeroSection() {
  const partnerRegisterHref = roleRegisterUrl("partner");
  const sponsorRegisterHref = roleRegisterUrl("sponsor");
  return (
    <>
      <header className="relative z-10 flex h-[78px] items-center justify-between rounded-b-[2rem] bg-gradient-to-r from-[#2563EB] to-[#1D4ED8] px-6 text-white shadow-lg shadow-blue-900/25 ring-1 ring-white/20">
        <h1 className="rounded-2xl bg-white px-3.5 py-2.5 text-base font-black tracking-[-0.04em] text-blue-900 shadow-sm ring-1 ring-white/60 sm:text-lg">
          무료전세버스
        </h1>
        <Link
          href="/client/dashboard"
          className="rounded-full px-3 py-2 text-sm font-semibold text-white transition hover:bg-white/15 hover:text-white"
        >
          로그인
        </Link>
      </header>

      <section className="relative bg-gradient-to-b from-sky-50 via-cyan-50 to-[#f3f8fb] px-6 pb-20 pt-12 text-center">
        <p className="relative mx-auto mb-4 inline-flex rounded-full bg-white px-3 py-1 text-xs font-black text-blue-700 ring-1 ring-blue-100">
          무료전세버스 견적 신청
        </p>
        <p className="relative text-[1.9rem] font-black leading-[1.2] tracking-[-0.06em] text-slate-950 sm:text-[2.12rem]">
          무료버스 견적을
          <br />
          바로 신청하세요
        </p>
        <p className="relative mt-6 text-[1rem] font-semibold leading-8 tracking-[-0.035em] text-slate-500 sm:text-[1.03rem]">
          열심히 일한 당신은 전액 무료!~
          <br />
          견적 신청만해도 전액 무료!~
        </p>
        <div className="relative mt-6 grid gap-2 sm:mx-auto sm:max-w-[28rem] sm:grid-cols-2">
          <Link
            href={partnerRegisterHref}
            className="inline-flex min-h-11 w-full touch-manipulation items-center justify-center rounded-2xl border border-blue-200/90 bg-white/80 px-4 py-2.5 text-center text-sm font-black leading-5 tracking-[-0.02em] text-blue-800 shadow-sm shadow-blue-900/5 ring-1 ring-blue-100/80 transition hover:border-blue-300 hover:bg-blue-50/90 hover:ring-blue-200/80 active:scale-[0.99]"
            style={{ WebkitTapHighlightColor: "transparent" }}
          >
            기사님/운수업체 제휴하기
          </Link>
          <Link
            href={sponsorRegisterHref}
            className="inline-flex min-h-11 w-full touch-manipulation items-center justify-center rounded-2xl border border-emerald-200/90 bg-white/80 px-4 py-2.5 text-center text-sm font-black leading-5 tracking-[-0.02em] text-emerald-800 shadow-sm shadow-emerald-900/5 ring-1 ring-emerald-100/80 transition hover:border-emerald-300 hover:bg-emerald-50/90 hover:ring-emerald-200/80 active:scale-[0.99]"
            style={{ WebkitTapHighlightColor: "transparent" }}
          >
            후원업체 제휴하기
          </Link>
        </div>
      </section>
    </>
  );
}
