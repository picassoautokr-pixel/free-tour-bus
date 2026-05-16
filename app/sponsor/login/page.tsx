"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import { roleDashboardPath } from "@/lib/role-hosts";
import { createSponsorBrowserClient } from "@/lib/supabase";

export default function SponsorLoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const login = async () => {
    setBusy(true);
    setMessage(null);
    try {
      const supabase = createSponsorBrowserClient();
      const { error } = await supabase.auth.signInWithPassword({
        email: email.trim().toLowerCase(),
        password,
      });
      if (error) {
        setMessage("로그인 정보가 올바르지 않습니다.");
        return;
      }
      const res = await fetch("/api/sponsor/dashboard", { credentials: "same-origin" });
      const json = (await res.json()) as { approved?: boolean; company?: { status?: string }; error?: string };
      if (!res.ok) {
        setMessage(json.error ?? "후원업체 정보를 확인하지 못했습니다.");
        await supabase.auth.signOut();
        return;
      }
      if (!json.approved) {
        setMessage(
          json.company?.status === "rejected"
            ? "후원업체 신청이 반려되었습니다. 관리자에게 문의해 주세요."
            : "관리자 승인 후 대시보드를 이용할 수 있습니다.",
        );
        return;
      }
      router.replace(roleDashboardPath("sponsor"));
    } catch (e) {
      setMessage(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <main className="min-h-screen bg-gradient-to-b from-sky-50 to-[#f3f8fb] px-5 py-10">
      <section className="mx-auto flex min-h-[calc(100vh-5rem)] max-w-md items-center">
        <div className="w-full rounded-[2rem] bg-white p-6 shadow-[0_18px_45px_rgba(15,23,42,0.12)] ring-1 ring-slate-100 sm:p-8">
          <p className="text-center text-xs font-black uppercase tracking-[0.14em] text-blue-600">
            후원업체
          </p>
          <h1 className="mt-3 text-center text-2xl font-black tracking-[-0.04em] text-slate-950">
            후원업체 로그인
          </h1>
          <div className="mt-8 space-y-4">
            <input
              type="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              placeholder="이메일"
              className="min-h-12 w-full rounded-2xl border border-slate-200 px-4 text-base font-semibold outline-none focus:border-blue-500"
            />
            <input
              type="password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              placeholder="비밀번호"
              className="min-h-12 w-full rounded-2xl border border-slate-200 px-4 text-base font-semibold outline-none focus:border-blue-500"
            />
            {message ? (
              <p className="rounded-2xl bg-slate-50 px-4 py-3 text-sm font-bold leading-6 text-slate-700">
                {message}
              </p>
            ) : null}
            <button
              type="button"
              onClick={() => void login()}
              disabled={busy || email.trim() === "" || password === ""}
              className="flex min-h-12 w-full items-center justify-center rounded-2xl bg-blue-600 text-base font-black text-white disabled:opacity-50"
            >
              {busy ? "로그인 중..." : "로그인"}
            </button>
          </div>
        </div>
      </section>
    </main>
  );
}
