"use client";

import { PARTNER_DASHBOARD_TITLE } from "@/lib/partner-dashboard-labels";
import { realtimeStatusLabel } from "@/hooks/useSupabaseRealtimeRefresh";
import type { RealtimeConnectionStatus } from "@/hooks/useSupabaseRealtimeRefresh";
import type { PartnerDriverInfo } from "./partner-dashboard-types";

const tapStyle = { WebkitTapHighlightColor: "transparent" } as const;

export function PartnerDashboardHeader({
  driverInfo,
  realtimeStatus,
  soundEnabled,
  notificationPermission,
  callsLoading,
  onToggleSound,
  onRequestBrowserNotifications,
  onRefresh,
  onLogout,
}: {
  driverInfo: PartnerDriverInfo | null;
  realtimeStatus: RealtimeConnectionStatus;
  soundEnabled: boolean;
  notificationPermission: NotificationPermission | "unsupported";
  callsLoading: boolean;
  onToggleSound: () => void;
  onRequestBrowserNotifications: () => void;
  onRefresh: () => void;
  onLogout: () => void;
}) {
  return (
    <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
      <div>
        <p className="text-xs font-bold uppercase tracking-[0.14em] text-blue-600">
          제휴 기사
        </p>
        <h1 className="mt-2 text-2xl font-black tracking-[-0.04em] text-slate-900">
          {PARTNER_DASHBOARD_TITLE}
        </h1>
        <p className="mt-2 text-sm font-semibold leading-relaxed text-slate-500">
          신규 견적 · 제출 견적 · 매칭 성공 단계별로 관리합니다. 매칭 전까지
          고객 연락처는 공개되지 않습니다.
        </p>
        {driverInfo ? (
          <div className="mt-3 rounded-2xl bg-blue-50 px-4 py-3 text-sm font-bold text-blue-950 ring-1 ring-blue-100">
            <p className="text-xs font-black text-blue-600">로그인한 제휴기사</p>
            <p className="mt-1">
              {driverInfo.company_name || "업체명 미등록"} ·{" "}
              {driverInfo.manager_name || "담당자 미등록"}
            </p>
            <p className="mt-0.5 text-xs text-blue-800">
              {driverInfo.phone || "전화번호 미등록"}
            </p>
          </div>
        ) : null}
      </div>
      <div className="flex flex-wrap gap-2 sm:justify-end">
        <span className="inline-flex min-h-10 items-center justify-center rounded-xl border border-slate-200 bg-white px-3 text-xs font-black text-slate-600">
          {realtimeStatusLabel(realtimeStatus)}
        </span>
        <button
          type="button"
          onClick={onToggleSound}
          className={`inline-flex min-h-10 items-center justify-center rounded-xl border px-4 text-sm font-black shadow-sm transition ${
            soundEnabled
              ? "border-emerald-200 bg-emerald-50 text-emerald-900 hover:bg-emerald-100"
              : "border-slate-200 bg-white text-slate-800 hover:bg-slate-50"
          }`}
          style={tapStyle}
        >
          {soundEnabled ? "알림음 끄기" : "알림음 켜기"}
        </button>
        <button
          type="button"
          onClick={onRequestBrowserNotifications}
          disabled={
            notificationPermission === "granted" ||
            notificationPermission === "unsupported"
          }
          className={`inline-flex min-h-10 items-center justify-center rounded-xl border px-4 text-sm font-black shadow-sm transition disabled:cursor-not-allowed disabled:opacity-60 ${
            notificationPermission === "granted"
              ? "border-blue-200 bg-blue-50 text-blue-900"
              : "border-slate-200 bg-white text-slate-800 hover:bg-slate-50"
          }`}
          style={tapStyle}
        >
          {notificationPermission === "granted"
            ? "브라우저 알림 켜짐"
            : notificationPermission === "unsupported"
              ? "브라우저 알림 미지원"
              : "브라우저 알림 켜기"}
        </button>
        <button
          type="button"
          onClick={onRefresh}
          disabled={callsLoading}
          className="inline-flex min-h-10 items-center justify-center rounded-xl border border-slate-200 bg-white px-4 text-sm font-black text-slate-800 shadow-sm transition hover:bg-slate-50 disabled:opacity-50"
          style={tapStyle}
        >
          {callsLoading ? "새로고침 중…" : "새로고침"}
        </button>
        <button
          type="button"
          onClick={onLogout}
          className="inline-flex min-h-10 items-center justify-center rounded-xl bg-slate-950 px-4 text-sm font-black text-white shadow-sm transition hover:bg-slate-900"
          style={tapStyle}
        >
          로그아웃
        </button>
      </div>
    </div>
  );
}
