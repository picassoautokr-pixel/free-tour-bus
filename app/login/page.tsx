"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

import { isPartnerDriverLoginAllowed } from "@/lib/partner-driver-access";
import { resolvePartnerLoginEmail } from "@/lib/partner-phone-login";
import { fetchProfileForAuthUser } from "@/lib/profile";
import { USER_ROLES, parseUserRole } from "@/lib/roles";
import {
  createAdminBrowserClient,
  createClientBrowserClient,
  createPartnerBrowserClient,
  createTransientBrowserClient,
} from "@/lib/supabase";

const tapStyle = { WebkitTapHighlightColor: "transparent" } as const;

function routeForRole(role: string | null | undefined): string {
  const parsed = parseUserRole(role);
  if (parsed === USER_ROLES.ADMIN) return "/admin";
  if (parsed === USER_ROLES.DRIVER) return "/partner/dashboard";
  if (parsed === USER_ROLES.CLIENT) return "/client/dashboard";
  return "/partner/login";
}

export default function LoginPage() {
  const router = useRouter();
  const [loginId, setLoginId] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        for (const supabase of [
          createAdminBrowserClient(),
          createPartnerBrowserClient(),
          createClientBrowserClient(),
        ]) {
          const {
            data: { user },
          } = await supabase.auth.getUser();
          if (!user?.id || cancelled) continue;
          const profile = await fetchProfileForAuthUser(supabase, user.id);
          router.replace(routeForRole(profile?.role));
          return;
        }
      } catch {
        /* ignore */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [router]);

  const onSubmit = async () => {
    setBusy(true);
    setError(null);
    try {
      const supabase = createTransientBrowserClient();
      const authEmail = resolvePartnerLoginEmail(loginId);
      if (authEmail === "") {
        setError("이메일 또는 휴대폰번호를 입력해 주세요.");
        return;
      }

      const { error: signError } = await supabase.auth.signInWithPassword({
        email: authEmail,
        password,
      });
      if (signError) {
        setError("로그인 정보가 올바르지 않습니다.");
        return;
      }

      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user?.id) {
        setError("로그인 정보를 확인할 수 없습니다.");
        return;
      }

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
          setError("관리자 승인 후 로그인할 수 있습니다.");
          return;
        }
      }

      const roleSupabase =
        role === USER_ROLES.ADMIN
          ? createAdminBrowserClient()
          : role === USER_ROLES.DRIVER
            ? createPartnerBrowserClient()
            : createClientBrowserClient();
      const { error: roleSignInError } = await roleSupabase.auth.signInWithPassword({
        email: authEmail,
        password,
      });
      await supabase.auth.signOut();
      if (roleSignInError) {
        setError("역할별 로그인 세션을 저장하지 못했습니다.");
        return;
      }

      router.replace(routeForRole(profile?.role));
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <main className="min-h-screen bg-gradient-to-b from-sky-50 to-[#f3f8fb] px-5 py-10">
      <section className="mx-auto flex min-h-[calc(100vh-5rem)] max-w-md items-center">
        <div className="w-full rounded-[2rem] bg-white p-6 shadow-[0_18px_45px_rgba(15,23,42,0.12)] ring-1 ring-slate-100 sm:p-8">
          <p className="text-center text-xs font-black uppercase tracking-[0.14em] text-blue-600">
            무료관광버스
          </p>
          <h1 className="mt-3 text-center text-2xl font-black tracking-[-0.04em] text-slate-950">
            로그인
          </h1>
          <p className="mt-3 text-center text-sm font-semibold leading-6 text-slate-500">
            계정 권한에 따라 알맞은 화면으로 이동합니다.
          </p>

          <div className="mt-8 space-y-4">
            <label className="block">
              <span className="text-xs font-bold text-slate-500">
                이메일 또는 휴대폰번호
              </span>
              <input
                type="text"
                inputMode="email"
                autoComplete="username"
                value={loginId}
                onChange={(e) => setLoginId(e.target.value)}
                className="mt-2 min-h-12 w-full rounded-2xl border border-slate-200 bg-white px-4 text-base font-semibold outline-none focus:border-blue-500"
                placeholder="email@example.com 또는 01012345678"
              />
            </label>
            <label className="block">
              <span className="text-xs font-bold text-slate-500">비밀번호</span>
              <input
                type="password"
                autoComplete="current-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="mt-2 min-h-12 w-full rounded-2xl border border-slate-200 bg-white px-4 text-base font-semibold outline-none focus:border-blue-500"
                placeholder="비밀번호"
              />
            </label>

            {error ? (
              <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-semibold text-red-800">
                {error}
              </div>
            ) : null}

            <button
              type="button"
              onClick={() => void onSubmit()}
              disabled={busy || loginId.trim() === "" || password === ""}
              className="flex min-h-12 w-full items-center justify-center rounded-2xl bg-blue-600 px-4 text-base font-black text-white shadow-sm transition hover:bg-blue-700 disabled:opacity-50"
              style={tapStyle}
            >
              {busy ? "로그인 중…" : "로그인"}
            </button>
          </div>
        </div>
      </section>
    </main>
  );
}
