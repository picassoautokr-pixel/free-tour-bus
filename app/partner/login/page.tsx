"use client";

import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";

import { fetchProfileForAuthUser } from "@/lib/profile";
import { USER_ROLES, parseUserRole } from "@/lib/roles";
import { createSupabaseClient } from "@/lib/supabase";

const ACCESS_DENIED_MESSAGE =
  "제휴 기사(driver) 권한이 확인되지 않습니다. 등록·승인 여부를 확인하거나 담당자에게 문의해 주세요.";

export default function PartnerLoginPage() {
  const router = useRouter();
  const nextPath = useMemo(() => {
    if (typeof window === "undefined") return "/partner/dashboard";
    try {
      const sp = new URLSearchParams(window.location.search);
      return sp.get("next") || "/partner/dashboard";
    } catch {
      return "/partner/dashboard";
    }
  }, []);

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  /** 다른 역할(예: admin) 세션으로 접속한 경우 — 자동 로그아웃하지 않음 */
  const [otherRoleSession, setOtherRoleSession] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const supabase = createSupabaseClient();
        const {
          data: { user },
        } = await supabase.auth.getUser();
        if (!user || cancelled) return;

        const profile = await fetchProfileForAuthUser(supabase, user.id);
        const role = parseUserRole(profile?.role ?? null);

        if (role === USER_ROLES.DRIVER) {
          router.replace("/partner/dashboard");
          return;
        }

        setOtherRoleSession(true);
        setErrorMessage(
          "다른 권한으로 이미 로그인되어 있습니다. 제휴 기사 계정으로 이용하려면 아래에서 로그아웃한 뒤 다시 로그인해 주세요.",
        );
      } catch {
        /* ignore */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [router]);

  useEffect(() => {
    try {
      const sp = new URLSearchParams(window.location.search);
      if (sp.get("error") === "forbidden") {
        setErrorMessage(
          "제휴 기사 전용 영역입니다. 권한이 있는 계정으로 로그인해 주세요.",
        );
        const url = new URL(window.location.href);
        url.searchParams.delete("error");
        window.history.replaceState({}, "", url.pathname + url.search);
      }
    } catch {
      /* ignore */
    }
  }, []);

  const onSubmit = async () => {
    setIsSubmitting(true);
    setErrorMessage(null);
    try {
      const supabase = createSupabaseClient();
      const { error: signError } = await supabase.auth.signInWithPassword({
        email: email.trim(),
        password,
      });

      if (signError) {
        setErrorMessage(signError.message);
        return;
      }

      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (!user?.id) {
        setErrorMessage("로그인 정보를 확인할 수 없습니다.");
        await supabase.auth.signOut();
        return;
      }

      const profile = await fetchProfileForAuthUser(supabase, user.id);
      const role = parseUserRole(profile?.role ?? null);

      if (role !== USER_ROLES.DRIVER) {
        setErrorMessage(ACCESS_DENIED_MESSAGE);
        await supabase.auth.signOut();
        return;
      }

      const dest =
        nextPath.startsWith("/partner/") && nextPath !== "/partner/login"
          ? nextPath
          : "/partner/dashboard";
      router.replace(dest);
    } catch (e) {
      setErrorMessage(e instanceof Error ? e.message : String(e));
      try {
        const supabase = createSupabaseClient();
        await supabase.auth.signOut();
      } catch {
        /* ignore */
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleLogoutOnly = async () => {
    setErrorMessage(null);
    try {
      const supabase = createSupabaseClient();
      await supabase.auth.signOut();
      setOtherRoleSession(false);
    } catch {
      /* ignore */
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-b from-sky-50 to-[#f3f8fb]">
      <div className="mx-auto flex min-h-screen max-w-md items-center px-4 py-10">
        <div className="w-full rounded-3xl border border-slate-200/90 bg-white p-6 shadow-[0_18px_45px_rgba(15,23,42,0.1)] sm:p-8">
          <p className="text-center text-xs font-bold uppercase tracking-[0.12em] text-blue-600">
            무료관광버스
          </p>
          <h1 className="mt-2 text-center text-xl font-black tracking-[-0.04em] text-slate-900">
            제휴 기사 로그인
          </h1>
          <p className="mt-2 text-center text-sm font-medium leading-relaxed text-slate-500">
            등록된 제휴 기사 계정으로 로그인합니다.
          </p>

          <div className="mt-8 space-y-4">
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
                className="mt-2 min-h-12 w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-base font-semibold text-slate-900 shadow-sm outline-none placeholder:text-slate-400 focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20"
                placeholder="이메일 주소"
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
                className="mt-2 min-h-12 w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-base font-semibold text-slate-900 shadow-sm outline-none placeholder:text-slate-400 focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20"
                placeholder="비밀번호"
              />
            </label>

            {errorMessage ? (
              <div
                className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-semibold leading-relaxed text-red-800"
                role="alert"
              >
                {errorMessage}
              </div>
            ) : null}

            <button
              type="button"
              onClick={() => void onSubmit()}
              disabled={
                isSubmitting ||
                email.trim() === "" ||
                password === "" ||
                otherRoleSession
              }
              className="touch-manipulation flex min-h-12 w-full items-center justify-center rounded-2xl bg-gradient-to-r from-[#2563EB] to-[#1D4ED8] text-base font-black tracking-[-0.02em] text-white shadow-lg shadow-blue-900/20 transition hover:brightness-105 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {isSubmitting ? "로그인 중…" : "로그인"}
            </button>

            {otherRoleSession ? (
              <button
                type="button"
                onClick={() => void handleLogoutOnly()}
                className="touch-manipulation flex min-h-12 w-full items-center justify-center rounded-2xl border border-slate-300 bg-white text-sm font-black text-slate-800 shadow-sm transition hover:bg-slate-50"
              >
                로그아웃 후 제휴 계정으로 로그인
              </button>
            ) : null}
          </div>
        </div>
      </div>
    </div>
  );
}
