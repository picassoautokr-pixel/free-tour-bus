"use client";

import Link from "next/link";
import { useState } from "react";

import { SPONSOR_SUPPORT_TYPES } from "@/lib/sponsor";

const tapStyle = { WebkitTapHighlightColor: "transparent" } as const;

export default function SponsorRegisterPage() {
  const [form, setForm] = useState({
    company_name: "",
    manager_name: "",
    phone: "",
    email: "",
    password: "",
    business_number: "",
    business_category: "",
    product_category: "",
    support_type: "cash",
    product_description: "",
    admin_memo: "",
  });
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  const submit = async () => {
    setBusy(true);
    setMessage(null);
    try {
      const res = await fetch("/api/sponsor/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      const json = (await res.json()) as { error?: string };
      if (!res.ok) {
        setMessage(json.error ?? "신청 저장에 실패했습니다.");
        return;
      }
      setDone(true);
      setMessage("후원업체 신청이 접수되었습니다. 관리자 검토 후 연락드리겠습니다.");
    } catch (e) {
      setMessage(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  const inputClass =
    "mt-2 min-h-12 w-full rounded-2xl border border-slate-200 bg-white px-4 text-base font-semibold outline-none focus:border-blue-500";

  return (
    <main className="min-h-screen bg-gradient-to-b from-sky-50 to-[#f3f8fb] pb-16">
      <header className="relative z-10 flex h-[78px] items-center justify-between rounded-b-[2rem] bg-gradient-to-r from-[#2563EB] to-[#1D4ED8] px-6 text-white shadow-lg shadow-blue-900/25 ring-1 ring-white/20">
        <Link
          href="/"
          className="rounded-2xl bg-white px-4 py-2.5 text-lg font-black tracking-[-0.04em] text-blue-900 shadow-sm ring-1 ring-white/60 transition hover:bg-blue-50"
        >
          무료관광버스
        </Link>
        <Link
          href="/sponsor/login"
          className="rounded-full px-3 py-2 text-sm font-semibold text-white transition hover:bg-white/15"
        >
          후원업체 로그인
        </Link>
      </header>
      <div className="px-5 py-10">
      <section className="mx-auto max-w-xl rounded-[2rem] bg-white p-6 shadow-[0_18px_45px_rgba(15,23,42,0.12)] ring-1 ring-slate-100 sm:p-8">
        <p className="text-xs font-black uppercase tracking-[0.14em] text-blue-600">
          무료전세버스
        </p>
        <h1 className="mt-3 text-2xl font-black tracking-[-0.04em] text-slate-950">
          후원업체 제휴 신청
        </h1>
        <p className="mt-3 text-sm font-semibold leading-6 text-slate-500">
          무료버스 이용 고객에게 지원 가능한 상품/서비스 조건을 등록해 주세요.
        </p>

        <div className="mt-7 grid gap-4 sm:grid-cols-2">
          {[
            ["company_name", "업체명"],
            ["manager_name", "담당자명"],
            ["phone", "연락처"],
            ["email", "이메일"],
            ["password", "로그인 비밀번호"],
            ["business_number", "사업자번호"],
            ["business_category", "업종"],
            ["product_category", "후원/판매 품목"],
          ].map(([key, label]) => (
            <label key={key} className="block">
              <span className="text-xs font-bold text-slate-500">{label}</span>
              <input
                type={key === "password" ? "password" : key === "email" ? "email" : "text"}
                value={form[key as keyof typeof form]}
                onChange={(event) =>
                  setForm((prev) => ({ ...prev, [key]: event.target.value }))
                }
                className={inputClass}
                placeholder={key === "password" ? "8자 이상" : label}
              />
            </label>
          ))}
          <label className="block sm:col-span-2">
            <span className="text-xs font-bold text-slate-500">지원 형태</span>
            <select
              value={form.support_type}
              onChange={(event) =>
                setForm((prev) => ({ ...prev, support_type: event.target.value }))
              }
              className={inputClass}
            >
              {SPONSOR_SUPPORT_TYPES.map((item) => (
                <option key={item.value} value={item.value}>
                  {item.label}
                </option>
              ))}
            </select>
          </label>
          <label className="block sm:col-span-2">
            <span className="text-xs font-bold text-slate-500">상품/서비스 설명</span>
            <textarea
              value={form.product_description}
              onChange={(event) =>
                setForm((prev) => ({ ...prev, product_description: event.target.value }))
              }
              className="mt-2 min-h-28 w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-base font-semibold outline-none focus:border-blue-500"
            />
          </label>
          <label className="block sm:col-span-2">
            <span className="text-xs font-bold text-slate-500">희망 지원 조건 메모</span>
            <textarea
              value={form.admin_memo}
              onChange={(event) =>
                setForm((prev) => ({ ...prev, admin_memo: event.target.value }))
              }
              className="mt-2 min-h-24 w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-base font-semibold outline-none focus:border-blue-500"
            />
          </label>
        </div>

        {message ? (
          <p
            className={`mt-5 rounded-2xl px-4 py-3 text-sm font-bold leading-6 ${
              done ? "bg-emerald-50 text-emerald-900" : "bg-red-50 text-red-800"
            }`}
          >
            {message}
          </p>
        ) : null}

        <button
          type="button"
          onClick={() => void submit()}
          disabled={busy || done}
          className="mt-6 flex min-h-12 w-full items-center justify-center rounded-2xl bg-blue-600 text-base font-black text-white shadow-sm disabled:opacity-50"
          style={tapStyle}
        >
          {busy ? "신청 중..." : done ? "신청 완료" : "후원업체 신청하기"}
        </button>
        <Link
          href="/sponsor/login"
          className="mt-4 block text-center text-sm font-bold text-slate-500 underline-offset-2 hover:underline"
        >
          이미 신청하셨나요? 로그인
        </Link>
      </section>
      </div>
    </main>
  );
}
