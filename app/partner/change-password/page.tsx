"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

import { isPartnerDriverLoginAllowed } from "@/lib/partner-driver-access";
import { fetchProfileForAuthUser } from "@/lib/profile";
import { USER_ROLES, parseUserRole } from "@/lib/roles";
import { createPartnerBrowserClient } from "@/lib/supabase";

const MIN_LEN = 8;
const tapStyle = { WebkitTapHighlightColor: "transparent" } as const;

export default function PartnerChangePasswordPage() {
  const router = useRouter();
  const [checking, setChecking] = useState(true);
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const supabase = createPartnerBrowserClient();
        const {
          data: { user },
        } = await supabase.auth.getUser();

        if (!user?.id) {
          router.replace("/partner/login");
          return;
        }

        const profile = await fetchProfileForAuthUser(supabase, user.id);
        const role = parseUserRole(profile?.role ?? null);
        if (role !== USER_ROLES.DRIVER) {
          await supabase.auth.signOut();
          router.replace("/partner/login?error=forbidden");
          return;
        }

        const approvedOk = await isPartnerDriverLoginAllowed(
          supabase,
          profile,
          user.email,
        );
        if (!approvedOk) {
          await supabase.auth.signOut();
          router.replace("/partner/login");
          return;
        }

        if (!cancelled) setChecking(false);
      } catch {
        router.replace("/partner/login");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [router]);

  const onSubmit = async () => {
    setErrorMessage(null);
    if (newPassword !== confirmPassword) {
      setErrorMessage("새 비밀번호가 일치하지 않습니다.");
      return;
    }
    if (newPassword.length < MIN_LEN) {
      setErrorMessage(`새 비밀번호는 ${MIN_LEN}자 이상으로 설정해 주세요.`);
      return;
    }
    if (currentPassword === newPassword) {
      setErrorMessage("새 비밀번호는 현재 비밀번호와 다르게 설정해 주세요.");
      return;
    }

    setBusy(true);
    try {
      const supabase = createPartnerBrowserClient();
      const {
        data: { user },
      } = await supabase.auth.getUser();
      const email = user?.email?.trim();
      if (!email) {
        setErrorMessage("로그인 정보를 확인할 수 없습니다. 다시 로그인해 주세요.");
        return;
      }

      const { error: verifyError } = await supabase.auth.signInWithPassword({
        email,
        password: currentPassword,
      });
      if (verifyError) {
        setErrorMessage("현재 비밀번호가 올바르지 않습니다.");
        return;
      }

      const { error: updateError } = await supabase.auth.updateUser({
        password: newPassword,
      });
      if (updateError) {
        setErrorMessage(updateError.message);
        return;
      }

      const markRes = await fetch("/api/partner/change-password", {
        method: "POST",
        credentials: "same-origin",
      });
      const markJson = (await markRes.json()) as { error?: string };
      if (!markRes.ok) {
        setErrorMessage(
          markJson.error ?? "비밀번호 변경 시각을 저장하지 못했습니다.",
        );
        return;
      }

      router.replace("/partner/dashboard");
    } catch (e) {
      setErrorMessage(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  if (checking) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#f3f8fb] text-sm font-semibold text-slate-500">
        확인 중…
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-b from-sky-50 to-[#f3f8fb]">
      <div className="mx-auto flex min-h-screen max-w-md items-center px-4 py-10">
        <div className="w-full rounded-3xl border border-slate-200/90 bg-white p-6 shadow-[0_18px_45px_rgba(15,23,42,0.1)] sm:p-8">
          <p className="text-center text-xs font-bold uppercase tracking-[0.12em] text-blue-600">
            무료관광버스
          </p>
          <h1 className="mt-2 text-center text-xl font-black tracking-[-0.04em] text-slate-900">
            비밀번호 변경
          </h1>
          <p className="mt-2 text-center text-sm font-medium leading-relaxed text-slate-500">
            임시 비밀번호로 로그인한 경우 새 비밀번호로 변경해야 대시보드를 이용할 수 있습니다.
          </p>

          <div className="mt-8 space-y-4">
            <label className="block">
              <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                현재 비밀번호
              </span>
              <input
                type="password"
                autoComplete="current-password"
                value={currentPassword}
                onChange={(e) => setCurrentPassword(e.target.value)}
                className="mt-2 min-h-12 w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-base font-semibold text-slate-900 shadow-sm outline-none placeholder:text-slate-400 focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20"
                placeholder="현재 비밀번호"
              />
            </label>

            <label className="block">
              <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                새 비밀번호
              </span>
              <input
                type="password"
                autoComplete="new-password"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
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
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
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
                currentPassword === "" ||
                newPassword === "" ||
                confirmPassword === "" ||
                newPassword !== confirmPassword
              }
              className="touch-manipulation flex min-h-12 w-full items-center justify-center rounded-2xl bg-gradient-to-r from-[#2563EB] to-[#1D4ED8] text-base font-black tracking-[-0.02em] text-white shadow-lg shadow-blue-900/20 transition hover:brightness-105 disabled:cursor-not-allowed disabled:opacity-50"
              style={tapStyle}
            >
              {busy ? "변경 중…" : "비밀번호 변경"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
