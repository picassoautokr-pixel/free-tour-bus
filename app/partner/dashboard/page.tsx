"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

import { isPartnerDriverLoginAllowed } from "@/lib/partner-driver-access";
import { fetchProfileForAuthUser } from "@/lib/profile";
import { USER_ROLES, parseUserRole } from "@/lib/roles";
import { createSupabaseClient } from "@/lib/supabase";

const tapStyle = { WebkitTapHighlightColor: "transparent" } as const;

export default function PartnerDashboardPage() {
  const router = useRouter();
  const [checking, setChecking] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const supabase = createSupabaseClient();
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

  const handleLogout = async () => {
    try {
      const supabase = createSupabaseClient();
      await supabase.auth.signOut();
    } finally {
      router.replace("/partner/login");
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
    <main className="min-h-screen bg-gradient-to-b from-sky-50 to-[#f3f8fb] px-5 pb-16 pt-12">
      <div className="mx-auto max-w-lg">
        <div className="rounded-[2rem] border border-slate-200/90 bg-white px-6 py-10 text-center shadow-[0_18px_45px_rgba(15,23,42,0.1)]">
          <p className="text-xs font-bold uppercase tracking-[0.14em] text-blue-600">
            제휴 기사
          </p>
          <h1 className="mt-3 text-2xl font-black tracking-[-0.04em] text-slate-900">
            준비 중입니다
          </h1>
          <p className="mt-4 text-[0.9375rem] font-semibold leading-relaxed text-slate-600">
            제휴 기사 전용 대시보드는 곧 제공될 예정입니다.
            <br />
            잠시만 기다려 주세요.
          </p>
          <div className="mt-10 flex flex-col gap-3 sm:flex-row sm:justify-center">
            <Link
              href="/"
              className="touch-manipulation inline-flex min-h-12 flex-1 items-center justify-center rounded-2xl border-2 border-slate-200 bg-white px-5 text-sm font-bold text-slate-800 shadow-sm transition hover:bg-slate-50"
              style={tapStyle}
            >
              메인으로
            </Link>
            <button
              type="button"
              onClick={() => void handleLogout()}
              className="touch-manipulation inline-flex min-h-12 flex-1 items-center justify-center rounded-2xl bg-slate-950 px-5 text-sm font-black text-white shadow-sm transition hover:bg-slate-900"
              style={tapStyle}
            >
              로그아웃
            </button>
          </div>
        </div>
      </div>
    </main>
  );
}
