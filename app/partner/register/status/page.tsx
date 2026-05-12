"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

const tapStyle = { WebkitTapHighlightColor: "transparent" } as const;

function formatPhoneNumber(value: string) {
  const numbers = value.replace(/[^0-9]/g, "").slice(0, 11);
  if (numbers.length <= 3) return numbers;
  if (numbers.length <= 7) return `${numbers.slice(0, 3)}-${numbers.slice(3)}`;
  return `${numbers.slice(0, 3)}-${numbers.slice(3, 7)}-${numbers.slice(7)}`;
}

export default function PartnerRegistrationStatusPage() {
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<{
    found?: boolean;
    status?: string;
    company_name?: string;
    manager_name?: string;
    created_at?: string;
    message?: string;
    error?: string;
  } | null>(null);

  useEffect(() => {
    const sp = new URLSearchParams(window.location.search);
    const initialPhone = sp.get("phone") ?? "";
    const initialEmail = sp.get("email") ?? "";
    if (initialPhone) setPhone(formatPhoneNumber(initialPhone));
    if (initialEmail) setEmail(initialEmail);
  }, []);

  const check = async () => {
    setLoading(true);
    setResult(null);
    try {
      const query = new URLSearchParams();
      if (phone.trim()) query.set("phone", phone);
      if (email.trim()) query.set("email", email.trim());
      const res = await fetch(`/api/partner/registration-status?${query}`);
      const json = (await res.json()) as typeof result;
      setResult(json);
    } catch (e) {
      setResult({ error: e instanceof Error ? e.message : String(e) });
    } finally {
      setLoading(false);
    }
  };

  return (
    <main className="min-h-screen bg-[#f3f8fb] px-5 py-10">
      <section className="mx-auto max-w-md rounded-[2rem] bg-white p-6 shadow-[0_18px_45px_rgba(15,23,42,0.12)] ring-1 ring-slate-100">
        <p className="text-xs font-black uppercase tracking-[0.14em] text-blue-600">
          무료관광버스
        </p>
        <h1 className="mt-3 text-2xl font-black tracking-[-0.04em] text-slate-950">
          제휴기사 신청 상태 확인
        </h1>
        <div className="mt-6 space-y-3">
          <input
            value={phone}
            onChange={(e) => setPhone(formatPhoneNumber(e.target.value))}
            placeholder="010-0000-0000"
            className="h-12 w-full rounded-2xl border border-slate-200 px-4 text-sm font-semibold outline-none focus:border-blue-500"
          />
          <input
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="이메일(선택)"
            className="h-12 w-full rounded-2xl border border-slate-200 px-4 text-sm font-semibold outline-none focus:border-blue-500"
          />
          <button
            type="button"
            onClick={() => void check()}
            disabled={loading}
            className="flex min-h-12 w-full items-center justify-center rounded-2xl bg-blue-600 text-sm font-black text-white shadow-sm disabled:opacity-50"
            style={tapStyle}
          >
            {loading ? "확인 중…" : "상태 확인하기"}
          </button>
        </div>
        {result ? (
          <div className="mt-5 rounded-2xl bg-slate-50 p-4 text-sm font-semibold leading-6 text-slate-700">
            {result.error ? (
              result.error
            ) : result.found === false ? (
              "신청 내역을 찾을 수 없습니다."
            ) : (
              <>
                <p className="font-black text-slate-950">
                  {result.company_name} · {result.manager_name}
                </p>
                <p className="mt-1">상태: {result.status}</p>
                <p className="mt-2">{result.message}</p>
              </>
            )}
          </div>
        ) : null}
        <Link
          href="/"
          className="mt-5 flex min-h-12 items-center justify-center rounded-2xl border border-slate-200 bg-white text-sm font-black text-slate-700"
          style={tapStyle}
        >
          홈으로 이동
        </Link>
      </section>
    </main>
  );
}
