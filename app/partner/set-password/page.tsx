"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";

import { createSupabaseClient } from "@/lib/supabase";

const MIN_LEN = 8;

const tapStyle = { WebkitTapHighlightColor: "transparent" } as const;

/**
 * Supabase 초대/복구 링크: hash(#access_token, #refresh_token) 또는 ?code= (PKCE)
 */
export default function PartnerSetPasswordPage() {
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [sessionReady, setSessionReady] = useState(false);
  const [checking, setChecking] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [busy, setBusy] = useState(false);

  const establishSession = useCallback(async (): Promise<boolean> => {
    const supabase = createSupabaseClient();

    const {
      data: { session: existing },
    } = await supabase.auth.getSession();
    if (existing) return true;

    if (typeof window === "undefined") return false;

    const url = new URL(window.location.href);
    const code = url.searchParams.get("code");
    if (code) {
      const { error } = await supabase.auth.exchangeCodeForSession(code);
      if (error) {
        console.error("[set-password] exchangeCodeForSession:", error.message);
        return false;
      }
      window.history.replaceState({}, "", url.pathname);
      return true;
    }

    const hash = window.location.hash.replace(/^#/, "");
    if (hash) {
      const params = new URLSearchParams(hash);
      const access_token = params.get("access_token");
      const refresh_token = params.get("refresh_token");
      if (access_token && refresh_token) {
        const { error } = await supabase.auth.setSession({
          access_token,
          refresh_token,
        });
        if (error) {
          console.error("[set-password] setSession:", error.message);
          return false;
        }
        window.history.replaceState({}, "", url.pathname + url.search);
        return true;
      }
    }

    return false;
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setChecking(true);
      setErrorMessage(null);
      try {
        let ok = await establishSession();
        if (!ok) {
          await new Promise((r) => setTimeout(r, 400));
          const supabase = createSupabaseClient();
          const {
            data: { session },
          } = await supabase.auth.getSession();
          ok = Boolean(session);
        }
        if (!cancelled) {
          setSessionReady(ok);
          if (!ok) {
            setErrorMessage(
              "유효한 초대 링크가 아니거나 만료되었습니다. 메일의 링크를 다시 확인하거나 관리자에게 문의해 주세요.",
            );
          }
        }
      } catch (e) {
        if (!cancelled) {
          setSessionReady(false);
          setErrorMessage(
            e instanceof Error ? e.message : String(e),
          );
        }
      } finally {
        if (!cancelled) setChecking(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [establishSession]);

  useEffect(() => {
    const supabase = createSupabaseClient();
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event, session) => {
      if (
        session &&
        (event === "INITIAL_SESSION" ||
          event === "SIGNED_IN" ||
          event === "TOKEN_REFRESHED")
      ) {
        setSessionReady(true);
        setErrorMessage(null);
      }
    });
    return () => subscription.unsubscribe();
  }, []);

  const onSubmit = async () => {
    setErrorMessage(null);
    if (password !== confirm) {
      setErrorMessage("비밀번호가 일치하지 않습니다.");
      return;
    }
    if (password.length < MIN_LEN) {
      setErrorMessage(`비밀번호는 ${MIN_LEN}자 이상으로 설정해 주세요.`);
      return;
    }

    setBusy(true);
    try {
      const supabase = createSupabaseClient();
      const { error } = await supabase.auth.updateUser({ password });
      if (error) {
        setErrorMessage(error.message);
        return;
      }
      await supabase.auth.signOut();
      setSuccess(true);
    } catch (e) {
      setErrorMessage(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
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
            비밀번호 설정
          </h1>
          <p className="mt-2 text-center text-sm font-medium leading-relaxed text-slate-500">
            초대를 수락하신 경우 아래에서 로그인용 비밀번호를 설정해 주세요.
          </p>

          {checking ? (
            <p className="mt-10 text-center text-sm font-semibold text-slate-500">
              초대 정보 확인 중…
            </p>
          ) : success ? (
            <div className="mt-8 space-y-6">
              <div
                className="rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-center text-sm font-semibold leading-relaxed text-emerald-900"
                role="status"
              >
                비밀번호가 설정되었습니다. 이제 로그인할 수 있습니다.
              </div>
              <Link
                href="/partner/login"
                className="flex min-h-12 w-full items-center justify-center rounded-2xl bg-gradient-to-r from-[#2563EB] to-[#1D4ED8] text-base font-black tracking-[-0.02em] text-white shadow-lg shadow-blue-900/20 transition hover:brightness-105"
                style={tapStyle}
              >
                로그인 화면으로 이동
              </Link>
            </div>
          ) : !sessionReady ? (
            errorMessage ? (
              <div
                className="mt-8 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-semibold leading-relaxed text-red-800"
                role="alert"
              >
                {errorMessage}
              </div>
            ) : null
          ) : (
            <div className="mt-8 space-y-4">
              <label className="block">
                <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                  새 비밀번호
                </span>
                <input
                  type="password"
                  autoComplete="new-password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="mt-2 min-h-12 w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-base font-semibold text-slate-900 shadow-sm outline-none placeholder:text-slate-400 focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20"
                  placeholder={`${MIN_LEN}자 이상`}
                />
              </label>
              <label className="block">
                <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                  새 비밀번호 확인
                </span>
                <input
                  type="password"
                  autoComplete="new-password"
                  value={confirm}
                  onChange={(e) => setConfirm(e.target.value)}
                  className="mt-2 min-h-12 w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-base font-semibold text-slate-900 shadow-sm outline-none placeholder:text-slate-400 focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20"
                  placeholder="한 번 더 입력"
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
                  busy ||
                  password === "" ||
                  confirm === "" ||
                  password !== confirm
                }
                className="touch-manipulation flex min-h-12 w-full items-center justify-center rounded-2xl bg-gradient-to-r from-[#2563EB] to-[#1D4ED8] text-base font-black tracking-[-0.02em] text-white shadow-lg shadow-blue-900/20 transition hover:brightness-105 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {busy ? "저장 중…" : "비밀번호 설정"}
              </button>

              <Link
                href="/partner/login"
                className="block w-full text-center text-sm font-semibold text-slate-500 underline-offset-2 hover:text-slate-700 hover:underline"
              >
                이미 비밀번호가 있으신가요? 로그인
              </Link>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
