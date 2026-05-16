"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";

import { createAdminBrowserClient } from "@/lib/supabase";

export default function AdminLoginPage() {
  const router = useRouter();
  const nextPath = useMemo(() => {
    if (typeof window === "undefined") return "/admin";
    try {
      const sp = new URLSearchParams(window.location.search);
      return sp.get("next") || "/admin";
    } catch {
      return "/admin";
    }
  }, []);

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    // 이미 로그인 상태면 바로 /admin
    (async () => {
      try {
        const supabase = createAdminBrowserClient();
        const { data } = await supabase.auth.getUser();
        if (data.user) router.replace("/admin");
      } catch {
        // ignore
      }
    })();
  }, [router]);

  const onSubmit = async () => {
    setIsSubmitting(true);
    setErrorMessage(null);
    try {
      const supabase = createAdminBrowserClient();
      const { error } = await supabase.auth.signInWithPassword({
        email: email.trim(),
        password,
      });

      if (error) {
        setErrorMessage(error.message);
        return;
      }

      router.replace(nextPath);
    } catch (e) {
      setErrorMessage(e instanceof Error ? e.message : String(e));
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-100">
      <div className="mx-auto flex min-h-screen max-w-md items-center px-4 py-10">
        <div className="w-full rounded-3xl border border-slate-200 bg-white p-6 shadow-sm sm:p-8">
          <h1 className="text-xl font-black tracking-tight text-slate-900">
            관리자 로그인
          </h1>
          <p className="mt-2 text-sm font-medium text-slate-500">
            로그인 후 관리자 페이지에 접근할 수 있습니다.
          </p>

          <div className="mt-6 space-y-4">
            <label className="block">
              <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                이메일
              </span>
              <input
                type="email"
                inputMode="email"
                autoComplete="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="mt-2 h-12 w-full rounded-2xl border border-slate-200 bg-white px-4 text-sm font-semibold text-slate-900 shadow-sm outline-none placeholder:text-slate-400 focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20"
                placeholder="admin@example.com"
              />
            </label>

            <label className="block">
              <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                비밀번호
              </span>
              <input
                type="password"
                autoComplete="current-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="mt-2 h-12 w-full rounded-2xl border border-slate-200 bg-white px-4 text-sm font-semibold text-slate-900 shadow-sm outline-none placeholder:text-slate-400 focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20"
                placeholder="비밀번호 입력"
              />
            </label>

            {errorMessage ? (
              <div
                className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-semibold text-red-800"
                role="alert"
              >
                {errorMessage}
              </div>
            ) : null}

            <button
              type="button"
              onClick={() => void onSubmit()}
              disabled={isSubmitting || email.trim() === "" || password === ""}
              className="h-12 w-full rounded-2xl bg-slate-950 text-sm font-black tracking-tight text-white shadow-sm transition hover:bg-slate-900 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {isSubmitting ? "로그인 중…" : "로그인"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

