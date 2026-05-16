"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import {
  isPartnerDriverLoginAllowed,
  type PartnerDriverRecordStatus,
} from "@/lib/partner-driver-access";
import {
  digitsOnlyKoreanMobile,
  resolvePartnerLoginEmail,
} from "@/lib/partner-phone-login";
import { fetchProfileForAuthUser } from "@/lib/profile";
import { isRoleHost, roleDashboardPath } from "@/lib/role-hosts";
import { USER_ROLES, parseUserRole } from "@/lib/roles";
import { createPartnerBrowserClient } from "@/lib/supabase";

const ACCESS_DENIED_MESSAGE =
  "제휴 기사(driver) 권한이 확인되지 않습니다. 등록·승인 여부를 확인하거나 담당자에게 문의해 주세요.";

const APPROVAL_REQUIRED_MESSAGE = "관리자 승인 후 로그인 가능합니다.";
const ACCOUNT_NOT_FOUND_MESSAGE = "등록되지 않은 계정입니다.";
const ACCOUNT_NOT_ISSUED_MESSAGE =
  "계정 발급이 필요합니다. 관리자에게 문의해주세요.";
const PASSWORD_INVALID_MESSAGE = "비밀번호가 올바르지 않습니다.";

type RegistrationLookup = {
  status: PartnerDriverRecordStatus | null;
  accountIssued: boolean;
};

function isEmailLike(s: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s.trim());
}

async function fetchRegistrationLookup(
  rawInput: string,
): Promise<RegistrationLookup> {
  const trimmed = rawInput.trim();
  const phoneDigits = digitsOnlyKoreanMobile(trimmed);
  const query = phoneDigits
    ? `phone=${encodeURIComponent(phoneDigits)}`
    : isEmailLike(trimmed.toLowerCase())
      ? `email=${encodeURIComponent(trimmed.toLowerCase())}`
      : "";

  if (query === "") return { status: null, accountIssued: false };

  const res = await fetch(`/api/partner/registration-status?${query}`);
  const json = (await res.json()) as {
    status?: PartnerDriverRecordStatus | null;
    account_issued?: boolean;
  };
  return {
    status: json.status ?? null,
    accountIssued: json.account_issued === true,
  };
}

async function needsTemporaryPasswordChange(
  supabase: ReturnType<typeof createPartnerBrowserClient>,
  partnerDriverId: string | null | undefined,
): Promise<boolean> {
  const pid = String(partnerDriverId ?? "").trim();
  if (pid === "") return false;

  const { data, error } = await supabase
    .from("partner_drivers")
    .select("temporary_password_issued_at, password_changed_at")
    .eq("id", pid)
    .maybeSingle();

  if (error || !data || typeof data !== "object") return false;
  const row = data as {
    temporary_password_issued_at?: unknown;
    password_changed_at?: unknown;
  };
  const issued =
    row.temporary_password_issued_at != null &&
    String(row.temporary_password_issued_at).trim() !== "";
  const changed =
    row.password_changed_at != null &&
    String(row.password_changed_at).trim() !== "";
  return issued && !changed;
}

function RegistrationStatusBadge({
  status,
}: {
  status: PartnerDriverRecordStatus | null;
}) {
  if (status == null) return null;
  if (status === "pending") {
    return (
      <span className="inline-flex w-full items-center justify-center rounded-2xl border border-blue-200 bg-blue-50 px-3 py-2 text-center text-xs font-black text-blue-900">
        승인 대기중
      </span>
    );
  }
  if (status === "reviewing") {
    return (
      <span className="inline-flex w-full items-center justify-center rounded-2xl border border-amber-300 bg-amber-50 px-3 py-2 text-center text-xs font-black text-amber-950">
        검토중
      </span>
    );
  }
  if (status === "rejected") {
    return (
      <span className="inline-flex w-full items-center justify-center rounded-2xl border border-red-200 bg-red-50 px-3 py-2 text-center text-xs font-black text-red-900">
        승인 반려
      </span>
    );
  }
  return (
    <span className="inline-flex w-full items-center justify-center rounded-2xl border border-emerald-300 bg-emerald-50 px-3 py-2 text-center text-xs font-black text-emerald-950">
      로그인 가능
    </span>
  );
}

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

  const [loginId, setLoginId] = useState("");
  const [password, setPassword] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  /** 다른 역할(예: admin) 세션으로 접속한 경우 — 자동 로그아웃하지 않음 */
  const [otherRoleSession, setOtherRoleSession] = useState(false);

  const [registrationStatus, setRegistrationStatus] =
    useState<PartnerDriverRecordStatus | null>(null);
  const [registrationAccountIssued, setRegistrationAccountIssued] =
    useState(false);
  const [statusLoading, setStatusLoading] = useState(false);

  const debounceRef = useRef<number | null>(null);

  const refreshRegistrationStatus = useCallback(async (rawInput: string) => {
    const trimmed = rawInput.trim();
    const phoneDigits = digitsOnlyKoreanMobile(trimmed);

    if (phoneDigits) {
      setStatusLoading(true);
      try {
        const lookup = await fetchRegistrationLookup(phoneDigits);
        setRegistrationStatus(lookup.status);
        setRegistrationAccountIssued(lookup.accountIssued);
      } catch {
        setRegistrationStatus(null);
        setRegistrationAccountIssued(false);
      } finally {
        setStatusLoading(false);
      }
      return;
    }

    const asEmail = trimmed.toLowerCase();
    if (!isEmailLike(asEmail)) {
      setRegistrationStatus(null);
      setRegistrationAccountIssued(false);
      return;
    }
    setStatusLoading(true);
    try {
      const lookup = await fetchRegistrationLookup(asEmail);
      setRegistrationStatus(lookup.status);
      setRegistrationAccountIssued(lookup.accountIssued);
    } catch {
      setRegistrationStatus(null);
      setRegistrationAccountIssued(false);
    } finally {
      setStatusLoading(false);
    }
  }, []);

  useEffect(() => {
    if (debounceRef.current != null) window.clearTimeout(debounceRef.current);
    debounceRef.current = window.setTimeout(() => {
      void refreshRegistrationStatus(loginId);
    }, 450);
    return () => {
      if (debounceRef.current != null) window.clearTimeout(debounceRef.current);
    };
  }, [loginId, refreshRegistrationStatus]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const supabase = createPartnerBrowserClient();
        const {
          data: { user },
        } = await supabase.auth.getUser();
        if (!user || cancelled) return;

        const profile = await fetchProfileForAuthUser(supabase, user.id);
        const role = parseUserRole(profile?.role ?? null);

        if (role === USER_ROLES.DRIVER) {
          const ok = await isPartnerDriverLoginAllowed(
            supabase,
            profile,
            user.email,
          );
          if (!ok) {
            await supabase.auth.signOut();
            setErrorMessage(APPROVAL_REQUIRED_MESSAGE);
            return;
          }
          if (
            await needsTemporaryPasswordChange(
              supabase,
              profile?.partner_driver_id,
            )
          ) {
            router.replace(isRoleHost("partner") ? "/change-password" : "/partner/change-password");
            return;
          }
          router.replace(roleDashboardPath("partner"));
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
        setErrorMessage("제휴기사 계정으로 로그인해주세요.");
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
      const supabase = createPartnerBrowserClient();
      const authEmail = resolvePartnerLoginEmail(loginId);
      if (authEmail === "") {
        setErrorMessage("이메일 또는 휴대폰 번호를 입력해 주세요.");
        return;
      }

      const lookup = await fetchRegistrationLookup(loginId);
      if (lookup.status == null) {
        setErrorMessage(ACCOUNT_NOT_FOUND_MESSAGE);
        return;
      }
      if (lookup.status !== "approved") {
        setErrorMessage(APPROVAL_REQUIRED_MESSAGE);
        return;
      }
      if (!lookup.accountIssued) {
        setErrorMessage(ACCOUNT_NOT_ISSUED_MESSAGE);
        return;
      }

      const { error: signError } = await supabase.auth.signInWithPassword({
        email: authEmail,
        password,
      });

      if (signError) {
        setErrorMessage(PASSWORD_INVALID_MESSAGE);
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

      const approvedOk = await isPartnerDriverLoginAllowed(
        supabase,
        profile,
        user.email,
      );
      if (!approvedOk) {
        setErrorMessage(APPROVAL_REQUIRED_MESSAGE);
        await supabase.auth.signOut();
        return;
      }

      if (
        await needsTemporaryPasswordChange(supabase, profile?.partner_driver_id)
      ) {
        router.replace(isRoleHost("partner") ? "/change-password" : "/partner/change-password");
        return;
      }

      const dest =
        nextPath.startsWith("/partner/") && nextPath !== "/partner/login"
          ? nextPath
          : nextPath === "/dashboard" && isRoleHost("partner")
            ? "/dashboard"
            : roleDashboardPath("partner");
      router.replace(dest);
    } catch (e) {
      setErrorMessage(e instanceof Error ? e.message : String(e));
      try {
        const supabase = createPartnerBrowserClient();
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
      const supabase = createPartnerBrowserClient();
      await supabase.auth.signOut();
      setOtherRoleSession(false);
    } catch {
      /* ignore */
    }
  };

  const loginBlockedByStatus =
    registrationStatus != null && registrationStatus !== "approved";

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
                이메일 또는 휴대폰번호
              </span>
              <input
                type="text"
                inputMode="email"
                autoComplete="username"
                value={loginId}
                onChange={(e) => setLoginId(e.target.value)}
                className="mt-2 min-h-12 w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-base font-semibold text-slate-900 shadow-sm outline-none placeholder:text-slate-400 focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20"
                placeholder="예: name@example.com 또는 01012345678"
              />
            </label>

            {statusLoading ? (
              <p className="text-center text-xs font-semibold text-slate-400">
                신청 상태 확인 중…
              </p>
            ) : (
              <RegistrationStatusBadge status={registrationStatus} />
            )}
            {registrationStatus === "approved" && !registrationAccountIssued ? (
              <p className="text-center text-xs font-semibold leading-relaxed text-amber-700">
                {ACCOUNT_NOT_ISSUED_MESSAGE}
              </p>
            ) : null}

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
                loginId.trim() === "" ||
                password === "" ||
                otherRoleSession ||
                loginBlockedByStatus
              }
              className="touch-manipulation flex min-h-12 w-full items-center justify-center rounded-2xl bg-gradient-to-r from-[#2563EB] to-[#1D4ED8] text-base font-black tracking-[-0.02em] text-white shadow-lg shadow-blue-900/20 transition hover:brightness-105 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {isSubmitting ? "로그인 중…" : "로그인"}
            </button>

            {loginBlockedByStatus ? (
              <p className="text-center text-xs font-semibold leading-relaxed text-slate-500">
                {APPROVAL_REQUIRED_MESSAGE}
              </p>
            ) : null}

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
