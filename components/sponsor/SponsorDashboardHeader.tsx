"use client";

/**
 * components/sponsor/SponsorDashboardHeader.tsx
 *
 * 후원업체 대시보드 상단 헤더:
 * - 회사명 / 프로필 요약
 * - 실시간 연결 상태 배지
 * - 알림음 / 브라우저 알림 / 새로고침 / 로그아웃 버튼
 */

import { LABEL, SPONSOR_DASHBOARD_TITLE } from "@/lib/sponsor-dashboard-labels";
import { safeText } from "@/lib/sponsor";

const tapStyle = { WebkitTapHighlightColor: "transparent" } as const;

interface SponsorDashboardHeaderProps {
  company: Record<string, unknown> | null;
  realtimeStatusValue: string;
  soundEnabled: boolean;
  notificationPermission: NotificationPermission | "unsupported";
  loading: boolean;
  onToggleSound: () => void;
  onRequestNotifications: () => void;
  onRefresh: () => void;
  onLogout: () => void;
}

export function SponsorDashboardHeader({
  company,
  realtimeStatusValue,
  soundEnabled,
  notificationPermission,
  loading,
  onToggleSound,
  onRequestNotifications,
  onRefresh,
  onLogout,
}: SponsorDashboardHeaderProps) {
  return (
    <div className="flex flex-col gap-4">
      <div>
        <p className="text-xs font-black text-blue-600">{SPONSOR_DASHBOARD_TITLE}</p>
        <h1 className="mt-1 text-2xl font-black tracking-[-0.04em] text-slate-950">
          {safeText(company?.company_name, "후원업체")}
        </h1>
      </div>
      <div className="rounded-2xl bg-slate-50 px-4 py-3 ring-1 ring-slate-100">
        <p className="text-xs font-black text-slate-500">후원업체 프로필</p>
        <p className="mt-1 text-sm font-black text-slate-900">
          {safeText(company?.company_name, "—")} · {safeText(company?.manager_name, "—")}
        </p>
        <p className="mt-0.5 text-xs font-bold text-slate-600">
          {safeText(company?.phone, "—")} · {LABEL.companyStatus}:{" "}
          {safeText(company?.status, "—")}
        </p>
      </div>
      <div className="flex flex-wrap gap-2">
        <span className="inline-flex min-h-10 items-center rounded-xl border border-slate-200 bg-white px-3 text-xs font-black text-slate-600">
          {realtimeStatusValue}
        </span>
        <button
          type="button"
          onClick={onToggleSound}
          className={`min-h-10 rounded-xl border px-3 text-xs font-black ${
            soundEnabled
              ? "border-emerald-200 bg-emerald-50 text-emerald-900"
              : "border-slate-200 bg-white text-slate-800"
          }`}
          style={tapStyle}
        >
          {soundEnabled ? LABEL.soundOn : LABEL.soundOff}
        </button>
        <button
          type="button"
          onClick={onRequestNotifications}
          disabled={
            notificationPermission === "granted" ||
            notificationPermission === "unsupported"
          }
          className="min-h-10 rounded-xl border border-slate-200 bg-white px-3 text-xs font-black text-slate-800 disabled:opacity-60"
          style={tapStyle}
        >
          {notificationPermission === "granted"
            ? LABEL.browserNotifyOn
            : LABEL.browserNotify}
        </button>
        <button
          type="button"
          onClick={onRefresh}
          disabled={loading}
          className="min-h-10 rounded-xl border border-slate-200 bg-white px-3 text-xs font-black text-slate-800 disabled:opacity-50"
          style={tapStyle}
        >
          {loading ? LABEL.loading : LABEL.refresh}
        </button>
        <button
          type="button"
          onClick={onLogout}
          className="min-h-10 rounded-xl bg-slate-950 px-3 text-xs font-black text-white"
          style={tapStyle}
        >
          {LABEL.logout}
        </button>
      </div>
    </div>
  );
}
