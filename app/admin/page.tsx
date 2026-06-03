"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";

import * as XLSX from "xlsx";

import {
  realtimeStatusLabel,
  useSupabaseRealtimeRefresh,
} from "@/hooks/useSupabaseRealtimeRefresh";
import {
  fetchProfileForAuthUser,
  resolveAdminRoleAccess,
  type Profile,
} from "@/lib/profile";
import { roleLoginPath } from "@/lib/role-hosts";
import { ApplicationDetailMatchedPanel } from "@/components/admin/ApplicationDetailMatchedPanel";
import { PartnerDriversAdmin } from "@/components/admin/PartnerDriversAdmin";
import { SponsorCompaniesAdmin } from "@/components/admin/SponsorCompaniesAdmin";
import { normalizePartnerDrivers } from "@/lib/partner-drivers-admin";
import { createAdminBrowserClient } from "@/lib/supabase";

// ── 분리된 공유 모듈 ──────────────────────────────────────────────────
import type {
  ApplicationDetail,
  ApplicationStatusValue,
  StatusFilterValue,
  SortKey,
  SortDirection,
  DashboardStats,
  AdminToast,
  RealtimeToastPayload,
  RecentNotificationItem,
} from "@/components/admin/admin-types";
import {
  NOTIFICATION_SOUND_PREF_KEY,
  parseKnownApplicationStatus,
  statusLabelForSearch,
  statusLabelForExport,
  formatIsoDate,
  ymdTodayLocal,
  computeDashboardStats,
  safeText,
  displayApplicationTypeLabel,
  playNotificationBeep,
  normalizeRows,
  formatCreatedAt,
  formatDepartureTimeLabel,
  memoPreview,
  buildDefaultSmsText,
} from "@/components/admin/admin-page-utils";
import { StatusBadge, QuoteStageBadge } from "@/components/admin/AdminStatusBadge";
import { AdminSmsModal } from "@/components/admin/AdminSmsModal";
import { AdminDetailSlidePanel } from "@/components/admin/AdminDetailSlidePanel";
import { AdminQuoteAutomationCard } from "@/components/admin/AdminQuoteAutomationCard";

// suppress unused import warnings for StatusBadge (used in JSX)
void StatusBadge;

export default function AdminApplicationsPage() {
  const [adminEmail, setAdminEmail] = useState<string | null>(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [sessionProfile, setSessionProfile] = useState<Profile | null>(null);

  const adminRoleAccess = useMemo(
    () => resolveAdminRoleAccess(sessionProfile),
    [sessionProfile],
  );

  const [rows, setRows] = useState<ApplicationDetail[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [detailOpen, setDetailOpen] = useState(false);
  const [selected, setSelected] = useState<ApplicationDetail | null>(null);
  const [toast, setToast] = useState<AdminToast | null>(null);
  const [realtimeToast, setRealtimeToast] =
    useState<RealtimeToastPayload | null>(null);
  /** SSR과 첫 클라이언트 페인트를 일치시키기 위해 초기값은 false, 마운트 후 localStorage 동기화 */
  const [soundEnabled, setSoundEnabled] = useState(false);
  const audioContextRef = useRef<AudioContext | null>(null);
  const soundEnabledRef = useRef(false);
  const realtimeToastTimerRef = useRef<number | null>(null);
  const supabaseRef = useRef<ReturnType<typeof createAdminBrowserClient> | null>(
    null,
  );
  const realtimeSubscribedRef = useRef(false);
  const seenRealtimeIdsRef = useRef<{
    bus: Set<string>;
    /** admin_notifications 행 단위 중복 방지 */
    partnerNotif: Set<string>;
  }>({
    bus: new Set(),
    partnerNotif: new Set(),
  });

  soundEnabledRef.current = soundEnabled;

  useEffect(() => {
    try {
      setSoundEnabled(
        window.localStorage.getItem(NOTIFICATION_SOUND_PREF_KEY) === "1",
      );
    } catch {
      /* ignore */
    }
  }, []);

  const [unseenRealtimeCount, setUnseenRealtimeCount] = useState(0);
  const [recentNotifications, setRecentNotifications] = useState<
    RecentNotificationItem[]
  >([]);
  const [notificationPanelOpen, setNotificationPanelOpen] = useState(false);
  const notificationWrapRef = useRef<HTMLDivElement | null>(null);
  const [smsOpen, setSmsOpen] = useState(false);
  const [smsRow, setSmsRow] = useState<ApplicationDetail | null>(null);
  const [smsText, setSmsText] = useState("");
  const [smsSending, setSmsSending] = useState(false);
  const [smsSendError, setSmsSendError] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState("");
  const [statusFilter, setStatusFilter] = useState<StatusFilterValue>("all");
  const [sortKey, setSortKey] = useState<SortKey>("created_at");
  const [sortDirection, setSortDirection] = useState<SortDirection>("desc");
  const [showHidden, setShowHidden] = useState(false);
  const [adminSectionTab, setAdminSectionTab] = useState<"bus" | "partner" | "sponsor">(
    "bus",
  );

  useEffect(() => {
    if (adminSectionTab === "bus") return;
    setDetailOpen(false);
    setSelected(null);
    setSmsOpen(false);
    setSmsRow(null);
  }, [adminSectionTab]);

  useEffect(() => {
    if (toast == null) return;
    const timerId = window.setTimeout(() => setToast(null), 3200);
    return () => window.clearTimeout(timerId);
  }, [toast]);

  useEffect(() => {
    return () => {
      if (realtimeToastTimerRef.current != null) {
        window.clearTimeout(realtimeToastTimerRef.current);
      }
    };
  }, []);

  const handleEnableNotificationSound = useCallback(async () => {
    try {
      const AC =
        typeof window !== "undefined"
          ? window.AudioContext ??
            (
              window as Window & {
                webkitAudioContext?: typeof AudioContext;
              }
            ).webkitAudioContext
          : undefined;
      if (!AC) {
        console.warn("[notification sound] AudioContext를 사용할 수 없습니다.");
        return;
      }
      if (!audioContextRef.current) {
        audioContextRef.current = new AC();
      }
      const ctx = audioContextRef.current;
      await ctx.resume();
      playNotificationBeep(ctx);
      setSoundEnabled(true);
      window.localStorage.setItem(NOTIFICATION_SOUND_PREF_KEY, "1");
    } catch (e) {
      console.warn("[notification sound] 알림음 활성화 실패", e);
    }
  }, []);

  useEffect(() => {
    if (!notificationPanelOpen) return;
    const onPointerDown = (e: PointerEvent) => {
      const el = notificationWrapRef.current;
      if (el && !el.contains(e.target as Node)) {
        setNotificationPanelOpen(false);
      }
    };
    document.addEventListener("pointerdown", onPointerDown);
    return () => document.removeEventListener("pointerdown", onPointerDown);
  }, [notificationPanelOpen]);

  const openSms = useCallback((row: ApplicationDetail) => {
    setSmsRow(row);
    setSmsText(buildDefaultSmsText(row));
    setSmsSendError(null);
    setSmsOpen(true);
  }, []);

  const closeSms = useCallback(() => {
    setSmsOpen(false);
    setSmsRow(null);
    setSmsSendError(null);
    setSmsSending(false);
  }, []);

  const handleSendSms = useCallback(async () => {
    if (!smsRow) return;
    setSmsSending(true);
    setSmsSendError(null);
    try {
      const res = await fetch("/api/admin/sms/send", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "same-origin",
        body: JSON.stringify({
          to: smsRow.phone,
          text: smsText,
        }),
      });
      const data = (await res.json()) as { error?: string; ok?: boolean };
      if (!res.ok) {
        setSmsSendError(data.error ?? "발송에 실패했습니다.");
        return;
      }
      setToast({ message: "문자가 발송되었습니다." });
      closeSms();
    } catch (e) {
      setSmsSendError(
        e instanceof Error ? e.message : "발송 요청 중 오류가 발생했습니다.",
      );
    } finally {
      setSmsSending(false);
    }
  }, [smsRow, smsText, closeSms]);

  const handleCopySms = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(smsText);
      setToast({ message: "복사 완료" });
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      setToast({ message: `복사 실패: ${message}` });
    }
  }, [smsText]);

  useEffect(() => {
    // 로그인된 관리자 이메일 + profiles 역할(STEP 1: 조회만, 미확인 시에도 접근 유지)
    (async () => {
      try {
        const supabase = createAdminBrowserClient();
        const { data } = await supabase.auth.getUser();
        const user = data.user;
        setAdminEmail(user?.email ?? null);
        if (user?.id) {
          const p = await fetchProfileForAuthUser(supabase, user.id);
          const access = resolveAdminRoleAccess(p);
          if (p && !access.isVerifiedAdmin) {
            await supabase.auth.signOut();
            window.location.href = roleLoginPath("admin");
            return;
          }
          setSessionProfile(p);
        } else {
          setSessionProfile(null);
        }
      } catch {
        setAdminEmail(null);
        setSessionProfile(null);
      } finally {
        setAuthLoading(false);
      }
    })();
  }, []);

  const handleLogout = useCallback(async () => {
    try {
      const supabase = createAdminBrowserClient();
      await supabase.auth.signOut();
    } finally {
      window.location.href = roleLoginPath("admin");
    }
  }, []);

  const handleStatusSaved = useCallback(
    (
      applicationId: string,
      nextStatus: ApplicationStatusValue,
      nextMemo: string,
    ) => {
      setRows((prev) =>
        prev.map((r) =>
          r.id === applicationId
            ? { ...r, status: nextStatus, admin_memo: nextMemo }
            : r,
        ),
      );
      setSelected((prev) =>
        prev && prev.id === applicationId
          ? { ...prev, status: nextStatus, admin_memo: nextMemo }
          : prev,
      );
      setToast({ message: "저장되었습니다." });
    },
    [],
  );

  const load = useCallback(async (includeHidden = false) => {
    setLoading(true);
    setError(null);
    try {
      const supabase = createAdminBrowserClient();
      const { data, error: queryError } = await supabase
        .from("applications")
        .select("*")
        .order("created_at", { ascending: false });

      if (queryError) {
        setError(queryError.message);
        setRows([]);
        return;
      }

      setRows(normalizeRows(data, includeHidden));
    } catch (e) {
      const message =
        e instanceof Error ? e.message : typeof e === "string" ? e : String(e);
      setError(message);
      setRows([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    /* eslint-disable react-hooks/set-state-in-effect -- 초기 목록 로드 */
    void load(showHidden);
    /* eslint-enable react-hooks/set-state-in-effect */
  }, [load, showHidden]);

  const adminRealtimeStatus = useSupabaseRealtimeRefresh({
    channelName: "admin-dashboard-live-refresh",
    tables: [
      "applications",
      "driver_quotes",
      "guest_driver_quotes",
      "partner_drivers",
      "sponsor_companies",
      "notification_logs",
    ],
    debounceMs: 800,
    onRefresh: () => {
      void load(showHidden);
      window.dispatchEvent(new CustomEvent("partner-admin-refresh"));
      window.dispatchEvent(new CustomEvent("sponsor-admin-refresh"));
    },
  });

  useEffect(() => {
    // /admin 이 mount 된 상태에서만 realtime 연결
    if (realtimeSubscribedRef.current) return;
    realtimeSubscribedRef.current = true;

    if (!supabaseRef.current) {
      supabaseRef.current = createAdminBrowserClient();
    }
    const supabase = supabaseRef.current;

    const handleBeep = () => {
      if (!soundEnabledRef.current) return;
      try {
        const ctx = audioContextRef.current;
        if (!ctx) {
          console.warn(
            "[notification sound] AudioContext가 없습니다. 상단에서 「알림음 켜기」를 눌러 주세요.",
          );
          return;
        }
        void ctx.resume().then(() => {
          try {
            playNotificationBeep(ctx);
          } catch (e) {
            console.warn("[notification sound] 비프 재생 실패", e);
          }
        });
      } catch (e) {
        console.warn("[notification sound] 재생 처리 실패", e);
      }
    };

    const channel = supabase
      .channel("realtime-admin-inserts")
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "applications",
        },
        (payload) => {
          console.log("[realtime] applications INSERT payload:", payload);
          const raw = payload.new as Record<string, unknown>;
          const normalized = normalizeRows([raw]);
          const row = normalized[0];
          if (!row?.id || row.id.startsWith("idx-")) return;
          if (seenRealtimeIdsRef.current.bus.has(row.id)) return;
          seenRealtimeIdsRef.current.bus.add(row.id);

          setRows((prev) => {
            if (prev.some((r) => r.id === row.id)) return prev;
            return [row, ...prev];
          });

          setUnseenRealtimeCount((c) => c + 1);
          setRecentNotifications((prev) => {
            const item: RecentNotificationItem = {
              kind: "bus",
              id: row.id,
              applicant_name: row.applicant_name,
              application_type: row.application_type,
              passenger_count: row.passenger_count ?? null,
              created_at: row.created_at,
            };
            return [
              item,
              ...prev.filter((x) => !(x.kind === item.kind && x.id === item.id)),
            ].slice(0, 25);
          });

          const typeLabel = displayApplicationTypeLabel(row.application_type);
          const passengerLine =
            row.passenger_count != null && Number.isFinite(row.passenger_count)
              ? `${row.passenger_count}명`
              : "—";
          const applicant =
            row.applicant_name === "—" || row.applicant_name.trim() === ""
              ? "(이름 없음)"
              : row.applicant_name;

          setRealtimeToast({
            kind: "bus",
            applicantName: applicant,
            applicationTypeLabel: typeLabel,
            passengerLine,
          });
          if (realtimeToastTimerRef.current != null) {
            window.clearTimeout(realtimeToastTimerRef.current);
          }
          realtimeToastTimerRef.current = window.setTimeout(() => {
            setRealtimeToast(null);
            realtimeToastTimerRef.current = null;
          }, 5000);

          handleBeep();
        },
      )
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "admin_notifications",
        },
        (payload) => {
          console.log("admin_notifications payload", payload);
          const raw = payload.new as Record<string, unknown>;
          const notifType = String(raw.type ?? "").trim();
          if (notifType !== "partner_driver") return;

          const sourceId = String(raw.source_id ?? "").trim();
          if (!sourceId) return;

          const notifRowId =
            raw.id != null && String(raw.id).trim() !== ""
              ? String(raw.id).trim()
              : "";
          const dedupeKey =
            notifRowId ||
            `${sourceId}:${raw.created_at != null ? String(raw.created_at) : ""}`;
          if (seenRealtimeIdsRef.current.partnerNotif.has(dedupeKey)) return;
          seenRealtimeIdsRef.current.partnerNotif.add(dedupeKey);

          const msg = String(raw.message ?? "").trim();

          window.dispatchEvent(new CustomEvent("partner-admin-refresh"));

          void (async () => {
            const { data: pdRow, error: fetchErr } = await supabase
              .from("partner_drivers")
              .select("*")
              .eq("id", sourceId)
              .maybeSingle();
            if (fetchErr) {
              console.warn(
                "[admin_notifications] partner_drivers 조회 실패:",
                fetchErr.message,
              );
              return;
            }
            if (pdRow) {
              const row = normalizePartnerDrivers([pdRow])[0];
              window.dispatchEvent(
                new CustomEvent("partner-admin-insert", {
                  detail: { row },
                }),
              );
            }
          })();

          setUnseenRealtimeCount((c) => c + 1);
          setRecentNotifications((prev) => {
            const item: RecentNotificationItem = {
              kind: "partner",
              id: sourceId,
              notification_id: notifRowId || undefined,
              message: msg,
              created_at:
                raw.created_at != null ? String(raw.created_at) : null,
            };
            return [
              item,
              ...prev.filter((x) => {
                if (x.kind !== "partner") return true;
                if (notifRowId) return x.notification_id !== notifRowId;
                return x.id !== sourceId;
              }),
            ].slice(0, 25);
          });

          setRealtimeToast({
            kind: "partner",
            title: "새 제휴기사 신청이 접수되었습니다.",
            message: msg || "내용이 없습니다.",
          });
          if (realtimeToastTimerRef.current != null) {
            window.clearTimeout(realtimeToastTimerRef.current);
          }
          realtimeToastTimerRef.current = window.setTimeout(() => {
            setRealtimeToast(null);
            realtimeToastTimerRef.current = null;
          }, 5000);

          handleBeep();
        },
      )
      .subscribe((status) => {
        console.log("[realtime] realtime-admin-inserts status:", status);
      });

    return () => {
      void supabase.removeChannel(channel);
      realtimeSubscribedRef.current = false;
    };
  }, []);

  const openDetail = (row: ApplicationDetail) => {
    setSelected(row);
    setDetailOpen(true);
  };

  const focusApplicationRow = useCallback((applicationId: string) => {
    requestAnimationFrame(() => {
      document
        .getElementById(`admin-application-row-${applicationId}`)
        ?.scrollIntoView({ behavior: "smooth", block: "center" });
    });
  }, []);

  const focusPartnerRow = useCallback((partnerDriverId: string) => {
    requestAnimationFrame(() => {
      window.dispatchEvent(
        new CustomEvent("partner-admin-focus", {
          detail: { id: partnerDriverId },
        }),
      );
    });
  }, []);

  const handleSelectNotification = useCallback(
    (n: RecentNotificationItem) => {
      setNotificationPanelOpen(false);
      if (n.kind === "bus") {
        setAdminSectionTab("bus");
        const row = rows.find((r) => r.id === n.id);
        if (row) {
          setSelected(row);
          setDetailOpen(true);
          focusApplicationRow(n.id);
        }
        return;
      }

      // partner
      setAdminSectionTab("partner");
      focusPartnerRow(n.id);
    },
    [rows, focusApplicationRow, focusPartnerRow],
  );

  const closeDetail = () => {
    setDetailOpen(false);
    setSelected(null);
  };

  const filteredRows = useMemo(() => {
    const term = searchTerm.trim().toLowerCase();
    const hasTerm = term.length > 0;

    return rows.filter((row) => {
      if (statusFilter !== "all") {
        const known = parseKnownApplicationStatus(row.status);
        if (known !== statusFilter) return false;
      }

      if (!hasTerm) return true;

      const haystack = [
        row.receipt_number,
        row.applicant_name,
        row.phone,
        row.organization_name,
        row.departure,
        row.departure_detail,
        row.destination,
        row.destination_detail,
        row.application_type,
        displayApplicationTypeLabel(row.application_type),
        row.status,
        statusLabelForSearch(row.status),
      ]
        .join(" ")
        .toLowerCase();

      return haystack.includes(term);
    });
  }, [rows, searchTerm, statusFilter]);

  const filteredAndSortedRows = (() => {
    const copy = [...filteredRows];

    const directionFactor = sortDirection === "asc" ? 1 : -1;

    const getTimestamp = (v: string | null) => {
      if (v == null || v === "") return Number.NEGATIVE_INFINITY;
      const t = new Date(v).getTime();
      return Number.isNaN(t) ? Number.NEGATIVE_INFINITY : t;
    };

    const cmpText = (a: string, b: string) =>
      a.localeCompare(b, "ko-KR", { sensitivity: "base" });

    copy.sort((a, b) => {
      if (sortKey === "created_at") {
        return (getTimestamp(a.created_at) - getTimestamp(b.created_at)) * directionFactor;
      }

      if (sortKey === "passenger_count") {
        const av = a.passenger_count ?? Number.NEGATIVE_INFINITY;
        const bv = b.passenger_count ?? Number.NEGATIVE_INFINITY;
        return (av - bv) * directionFactor;
      }

      if (sortKey === "status") {
        const al = statusLabelForSearch(a.status);
        const bl = statusLabelForSearch(b.status);
        return cmpText(al, bl) * directionFactor;
      }

      const av = safeText(
        (a as unknown as Record<string, unknown>)[sortKey],
        "",
      );
      const bv = safeText(
        (b as unknown as Record<string, unknown>)[sortKey],
        "",
      );
      return cmpText(av, bv) * directionFactor;
    });

    return copy;
  })();

  const dashboardStats: DashboardStats = useMemo(
    () => computeDashboardStats(rows),
    [rows],
  );

  const handleSortClick = (key: SortKey) => {
    if (key === sortKey) {
      setSortDirection((prev) => (prev === "asc" ? "desc" : "asc"));
      return;
    }
    setSortKey(key);
    setSortDirection("asc");
  };

  const sortIndicator = (key: SortKey) => {
    if (key !== sortKey) return null;
    return (
      <span className="ml-1 text-[10px] font-black text-slate-500" aria-hidden>
        {sortDirection === "asc" ? "▲" : "▼"}
      </span>
    );
  };

  const handleExcelDownload = useCallback(() => {
    try {
      const exportRows = filteredAndSortedRows.map((r) => ({
        신청일: formatCreatedAt(r.created_at),
        접수번호: r.receipt_number,
        신청유형: displayApplicationTypeLabel(r.application_type),
        상태: statusLabelForExport(r.status),
        신청자명: r.applicant_name,
        연락처: r.phone,
        단체명: r.organization_name,
        단체유형: r.organization_type,
        출발지: r.departure,
        출발지역: r.departure_region,
        도착지: r.destination,
        출발일: formatIsoDate(r.departure_date),
        출발시간:
          r.departure_time === "—"
            ? ""
            : formatDepartureTimeLabel(r.departure_time),
        오는날짜: formatIsoDate(r.return_date),
        인원수: r.passenger_count ?? "",
        "왕복/편도": r.trip_type,
        "일반/프리미엄": r.bus_grade,
        요청사항: r.request_message === "—" ? "" : r.request_message,
        관리자메모: r.admin_memo,
      }));

      const ws = XLSX.utils.json_to_sheet(exportRows, { skipHeader: false });

      // 컬럼 너비 자동 조절 (간단 추정)
      const headers = Object.keys(exportRows[0] ?? {});
      const colWidths = headers.map((h) => {
        let max = h.length;
        for (const row of exportRows) {
          const v = (row as Record<string, unknown>)[h];
          const s = v == null ? "" : String(v);
          if (s.length > max) max = s.length;
        }
        // 너무 넓어지는 것 방지
        return { wch: Math.min(Math.max(max + 2, 10), 60) };
      });
      (ws as XLSX.WorkSheet)["!cols"] = colWidths;

      // 헤더 bold (xlsx에서 지원되는 경우 적용)
      for (let c = 0; c < headers.length; c++) {
        const addr = XLSX.utils.encode_cell({ r: 0, c });
        const cell = (ws as XLSX.WorkSheet)[addr] as XLSX.CellObject | undefined;
        if (cell) {
          (cell as XLSX.CellObject & { s?: unknown }).s = {
            font: { bold: true },
          };
        }
      }

      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, "신청목록");

      const filename = `지원금전세버스_신청목록_${ymdTodayLocal()}.xlsx`;
      XLSX.writeFile(wb, filename, { bookType: "xlsx" });
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      setToast({ message: `엑셀 다운로드 실패: ${message}` });
    }
  }, [filteredAndSortedRows]);

  return (
    <div className="min-h-screen bg-slate-100">
      <header className="border-b border-slate-200 bg-white shadow-sm">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-4 sm:px-6">
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="text-lg font-bold tracking-tight text-slate-900 sm:text-xl">
                지원금 매칭 관리
              </h1>
              {unseenRealtimeCount > 0 ? (
                <span className="rounded-full bg-[#1e3a5f] px-2.5 py-0.5 text-[10px] font-black uppercase tracking-wide text-white shadow-sm ring-1 ring-slate-900/15">
                  새 신청
                </span>
              ) : null}
            </div>
            <p className="mt-0.5 text-sm text-slate-500">
              {adminSectionTab === "bus"
                ? "클라이언트 신청과 지원 가능 여부를 관리합니다."
                : adminSectionTab === "partner"
                  ? "기사 등록과 견적 참여 상태를 관리합니다."
                  : "후원업체 신청과 후원조건 승인 상태를 관리합니다."}
            </p>
            <div className="mt-2 flex flex-wrap gap-1.5">
              {["클라이언트", "기사", "후원업체", "관리자"].map((role) => (
                <span
                  key={role}
                  className="rounded-full bg-slate-100 px-2.5 py-1 text-[11px] font-black text-slate-600"
                >
                  {role}
                </span>
              ))}
            </div>
            <p className="mt-1 text-xs font-semibold text-slate-500">
              {authLoading
                ? "관리자 확인 중…"
                : adminEmail
                  ? `관리자: ${adminEmail}`
                  : "관리자: -"}
            </p>
            <p className="mt-1 text-xs font-black text-slate-500">
              {realtimeStatusLabel(adminRealtimeStatus)}
            </p>
            <span className="sr-only">
              {adminRoleAccess.isVerifiedAdmin
                ? "프로필 기준 관리자 역할이 확인되었습니다."
                : "프로필이 없거나 관리자 역할이 확인되지 않아 기존 방식으로 접근합니다."}
            </span>
          </div>
          <div className="flex flex-wrap items-center justify-end gap-2">
            <button
              type="button"
              onClick={() => void handleEnableNotificationSound()}
              className={`rounded-lg border px-3 py-2 text-xs font-bold shadow-sm transition sm:text-sm ${
                soundEnabled
                  ? "border-emerald-200 bg-emerald-50 text-emerald-900 ring-1 ring-emerald-100 hover:bg-emerald-100"
                  : "border-slate-200 bg-white text-[#1e3a5f] hover:bg-slate-50"
              }`}
            >
              {soundEnabled ? "알림음 켜짐" : "알림음 켜기"}
            </button>
            <div className="relative" ref={notificationWrapRef}>
              <button
                type="button"
                aria-label="실시간 알림"
                onClick={() => {
                  setNotificationPanelOpen((prev) => {
                    const next = !prev;
                    if (next) setUnseenRealtimeCount(0);
                    return next;
                  });
                }}
                className="relative rounded-lg border border-slate-200 bg-white p-2 text-[#1e3a5f] shadow-sm transition hover:bg-slate-50"
              >
                <svg
                  aria-hidden="true"
                  className="h-5 w-5"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                  strokeWidth={2}
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M14.857 17.082a23.848 23.848 0 0 0 5.454-1.31A8.967 8.967 0 0 1 18 9.75V9A6 6 0 0 0 6 9v.75a8.967 8.967 0 0 1-2.312 6.022c1.733.64 3.56 1.085 5.455 1.31m5.714 0a24.255 24.255 0 0 1-5.714 0m5.714 0a3 3 0 1 1-5.714 0"
                  />
                </svg>
                {unseenRealtimeCount > 0 ? (
                  <span className="absolute -right-1 -top-1 flex h-[18px] min-w-[18px] items-center justify-center rounded-full bg-red-600 px-1 text-[10px] font-black text-white ring-2 ring-white">
                    {unseenRealtimeCount > 99 ? "99+" : unseenRealtimeCount}
                  </span>
                ) : null}
              </button>
              {notificationPanelOpen ? (
                <div className="absolute right-0 top-full z-[80] mt-2 w-[min(calc(100vw-2rem),22rem)] overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-xl shadow-slate-900/15 ring-1 ring-slate-100">
                  <div className="border-b border-slate-100 bg-slate-50 px-4 py-3">
                    <p className="text-sm font-black text-slate-900">
                      최근 신청
                    </p>
                    <p className="mt-0.5 text-xs font-medium text-slate-500">
                      실시간 접수 알림
                    </p>
                  </div>
                  <ul className="max-h-[min(60vh,24rem)] overflow-y-auto py-1">
                    {recentNotifications.length === 0 ? (
                      <li className="px-4 py-8 text-center text-sm text-slate-500">
                        아직 알림이 없습니다.
                      </li>
                    ) : (
                      recentNotifications.map((n) => (
                        <li
                          key={
                            n.kind === "bus"
                              ? `bus-${n.id}`
                              : `partner-${n.notification_id ?? n.id}`
                          }
                        >
                          <button
                            type="button"
                            className="flex w-full flex-col gap-1 border-b border-slate-100 px-4 py-3 text-left transition last:border-b-0 hover:bg-slate-50 active:bg-slate-100"
                            onClick={() => handleSelectNotification(n)}
                          >
                            {n.kind === "bus" ? (
                              <>
                                <span className="text-sm font-bold text-slate-900">
                                  {`[버스 신청] ${n.applicant_name} / ${
                                    n.passenger_count != null &&
                                    Number.isFinite(n.passenger_count)
                                      ? `${n.passenger_count}명`
                                      : "—"
                                  }`}
                                </span>
                                <span className="line-clamp-2 text-xs font-medium leading-snug text-slate-600">
                                  {displayApplicationTypeLabel(
                                    n.application_type,
                                  )}
                                </span>
                              </>
                            ) : (
                              <span className="line-clamp-3 whitespace-pre-wrap text-sm font-bold leading-snug text-slate-900">
                                [제휴기사]{" "}
                                {n.message.trim() !== ""
                                  ? n.message
                                  : "새 제휴기사 신청"}
                              </span>
                            )}
                            <span className="text-[11px] font-semibold text-slate-400">
                              {formatCreatedAt(n.created_at)}
                            </span>
                          </button>
                        </li>
                      ))
                    )}
                  </ul>
                </div>
              ) : null}
            </div>
            <button
              type="button"
              onClick={handleExcelDownload}
              disabled={
                adminSectionTab !== "bus" ||
                loading ||
                filteredAndSortedRows.length === 0
              }
              title={
                adminSectionTab !== "bus"
                  ? "클라이언트 신청 탭에서 이용할 수 있습니다."
                  : undefined
              }
              className="rounded-lg bg-emerald-600 px-3 py-2 text-sm font-bold text-white shadow-sm transition hover:bg-emerald-700 disabled:opacity-50"
            >
              <span className="hidden items-center gap-2 sm:inline-flex">
                <svg
                  aria-hidden="true"
                  className="h-4 w-4"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth="2"
                    d="M12 3v10m0 0 4-4m-4 4-4-4M4 17v2a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-2"
                  />
                </svg>
                엑셀 다운로드
              </span>
              <span className="sm:hidden">엑셀 다운로드</span>
            </button>
            <button
              type="button"
              onClick={() => {
                if (adminSectionTab === "partner") {
                  window.dispatchEvent(new CustomEvent("partner-admin-refresh"));
                } else if (adminSectionTab === "sponsor") {
                  window.dispatchEvent(new CustomEvent("sponsor-admin-refresh"));
                } else {
                  void load();
                }
              }}
              disabled={adminSectionTab === "bus" && loading}
              className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-700 shadow-sm transition hover:bg-slate-50 disabled:opacity-50"
            >
              새로고침
            </button>
            <button
              type="button"
              onClick={() => void handleLogout()}
              className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-700 shadow-sm transition hover:bg-slate-50"
            >
              로그아웃
            </button>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-4 py-6 sm:px-6">
        <div
          className="mb-6 flex flex-col gap-2 rounded-2xl border border-slate-200 bg-white p-1 shadow-sm sm:flex-row sm:flex-wrap"
          role="tablist"
          aria-label="관리 메뉴"
        >
          <button
            type="button"
            role="tab"
            aria-selected={adminSectionTab === "bus"}
            onClick={() => setAdminSectionTab("bus")}
            className={`min-h-11 flex-1 rounded-xl px-4 py-2.5 text-sm font-black transition sm:flex-none ${
              adminSectionTab === "bus"
                ? "bg-[#1e3a5f] text-white shadow-sm"
                : "bg-transparent text-slate-600 hover:bg-slate-50"
            }`}
          >
            클라이언트 신청
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={adminSectionTab === "partner"}
            onClick={() => setAdminSectionTab("partner")}
            className={`min-h-11 flex-1 rounded-xl px-4 py-2.5 text-sm font-black transition sm:flex-none ${
              adminSectionTab === "partner"
                ? "bg-[#1e3a5f] text-white shadow-sm"
                : "bg-transparent text-slate-600 hover:bg-slate-50"
            }`}
          >
            기사 관리
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={adminSectionTab === "sponsor"}
            onClick={() => setAdminSectionTab("sponsor")}
            className={`min-h-11 flex-1 rounded-xl px-4 py-2.5 text-sm font-black transition sm:flex-none ${
              adminSectionTab === "sponsor"
                ? "bg-[#1e3a5f] text-white shadow-sm"
                : "bg-transparent text-slate-600 hover:bg-slate-50"
            }`}
          >
            후원업체 관리
          </button>
        </div>

        {adminSectionTab === "partner" ? (
          <PartnerDriversAdmin setToast={setToast} />
        ) : adminSectionTab === "sponsor" ? (
          <SponsorCompaniesAdmin setToast={setToast} />
        ) : (
          <>
            <AdminQuoteAutomationCard />
            <section
              className="mb-5"
              aria-labelledby="admin-dashboard-heading"
            >
              <h2
                id="admin-dashboard-heading"
                className="mb-3 text-sm font-black tracking-tight text-slate-900"
              >
                운영 통계
              </h2>
              <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-7">
                <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm ring-1 ring-slate-100">
                  <p className="text-[11px] font-bold uppercase tracking-wide text-slate-500">
                    전체 신청
                  </p>
                  <p className="mt-2 text-2xl font-black tabular-nums text-slate-900">
                    {dashboardStats.total}
                  </p>
                </div>
                <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm ring-1 ring-slate-100">
                  <p className="text-[11px] font-bold uppercase tracking-wide text-slate-500">
                    오늘 신청
                  </p>
                  <p className="mt-2 text-2xl font-black tabular-nums text-slate-900">
                    {dashboardStats.todayCount}
                  </p>
                </div>
                <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm ring-1 ring-slate-100">
                  <p className="text-[11px] font-bold uppercase tracking-wide text-slate-500">
                    이번 달 신청
                  </p>
                  <p className="mt-2 text-2xl font-black tabular-nums text-slate-900">
                    {dashboardStats.monthCount}
                  </p>
                </div>
                <div className="rounded-2xl border border-blue-200 bg-blue-50/60 p-4 shadow-sm ring-1 ring-blue-100">
                  <p className="text-[11px] font-bold uppercase tracking-wide text-blue-800">
                    접수완료
                  </p>
                  <p className="mt-2 text-2xl font-black tabular-nums text-blue-950">
                    {dashboardStats.pending}
                  </p>
                </div>
                <div className="rounded-2xl border border-amber-200 bg-amber-50/70 p-4 shadow-sm ring-1 ring-amber-100">
                  <p className="text-[11px] font-bold uppercase tracking-wide text-amber-900">
                    검토중
                  </p>
                  <p className="mt-2 text-2xl font-black tabular-nums text-amber-950">
                    {dashboardStats.reviewing}
                  </p>
                </div>
                <div className="rounded-2xl border border-emerald-200 bg-emerald-50/70 p-4 shadow-sm ring-1 ring-emerald-100">
                  <p className="text-[11px] font-bold uppercase tracking-wide text-emerald-900">
                    승인완료
                  </p>
                  <p className="mt-2 text-2xl font-black tabular-nums text-emerald-950">
                    {dashboardStats.approved}
                  </p>
                </div>
                <div className="rounded-2xl border border-red-200 bg-red-50/70 p-4 shadow-sm ring-1 ring-red-100">
                  <p className="text-[11px] font-bold uppercase tracking-wide text-red-900">
                    반려
                  </p>
                  <p className="mt-2 text-2xl font-black tabular-nums text-red-950">
                    {dashboardStats.rejected}
                  </p>
                </div>
              </div>
              <p className="mt-2 text-[11px] font-medium text-slate-400">
                검색·필터와 무관하게 전체 신청 데이터 기준입니다.
              </p>
            </section>

            <div className="mb-5 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
                <label className="block flex-1">
                  <span className="sr-only">검색</span>
                  <input
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    placeholder="접수번호, 신청자명, 연락처, 단체명, 출발지, 도착지 검색"
                    className="h-11 w-full rounded-xl border border-slate-200 bg-white px-4 text-sm font-semibold text-slate-900 shadow-sm outline-none placeholder:text-slate-400 focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20"
                  />
                </label>
                <label className="block sm:w-[220px]">
                  <span className="sr-only">상태 필터</span>
                  <select
                    value={statusFilter}
                    onChange={(e) =>
                      setStatusFilter(e.target.value as StatusFilterValue)
                    }
                    className="h-11 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm font-semibold text-slate-900 shadow-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20"
                  >
                    <option value="all">전체</option>
                    <option value="pending">접수완료</option>
                    <option value="reviewing">검토중</option>
                    <option value="approved">승인완료</option>
                    <option value="rejected">반려</option>
                  </select>
                </label>
                <button
                  type="button"
                  onClick={() => setShowHidden((v) => !v)}
                  className={`h-11 rounded-xl border px-4 text-sm font-black transition sm:w-auto ${
                    showHidden
                      ? "border-slate-700 bg-slate-800 text-white"
                      : "border-slate-300 bg-white text-slate-600 hover:bg-slate-50"
                  }`}
                >
                  {showHidden ? "숨김 포함 중" : "숨김 보기"}
                </button>
              </div>
              <p className="mt-3 text-xs font-medium text-slate-500">
                {showHidden
                  ? `전체 (숨김 포함) ${rows.length}건 중 ${filteredAndSortedRows.length}건 표시`
                  : `총 ${rows.length}건 중 ${filteredAndSortedRows.length}건 표시`}
              </p>
            </div>

            {loading ? (
              <div className="rounded-2xl border border-slate-200 bg-white p-10 text-center shadow-sm">
                <div
                  className="mx-auto h-10 w-10 animate-spin rounded-full border-2 border-slate-200 border-t-blue-600"
                  aria-hidden
                />
                <p className="mt-4 text-sm font-medium text-slate-600">
                  목록을 불러오는 중…
                </p>
              </div>
            ) : error ? (
              <div
                className="rounded-2xl border border-red-200 bg-gradient-to-b from-red-50 to-white p-6 shadow-sm"
                role="alert"
              >
                <p className="text-sm font-semibold text-red-900">
                  데이터를 불러오지 못했습니다.
                </p>
                <p className="mt-3 rounded-lg border border-red-100 bg-white/80 px-3 py-2 text-xs leading-relaxed text-red-800">
                  {error}
                </p>
                <p className="mt-3 text-xs text-red-700/90">
                  Supabase 연결·RLS 정책·테이블 권한을 확인해 주세요.
                </p>
                <button
                  type="button"
                  onClick={() => void load()}
                  className="mt-4 rounded-lg bg-red-600 px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-red-700"
                >
                  다시 시도
                </button>
              </div>
            ) : rows.length === 0 ? (
              <div className="rounded-2xl border border-dashed border-slate-300 bg-white p-12 text-center shadow-sm">
                <p className="text-base font-semibold text-slate-700">
                  등록된 신청이 없습니다.
                </p>
                <p className="mt-2 text-sm text-slate-500">
                  신청이 접수되면 이곳에 표시됩니다.
                </p>
              </div>
            ) : filteredRows.length === 0 ? (
              <div className="rounded-2xl border border-dashed border-slate-300 bg-white p-12 text-center shadow-sm">
                <p className="text-base font-semibold text-slate-700">
                  조건에 맞는 신청 내역이 없습니다.
                </p>
                <p className="mt-2 text-sm text-slate-500">
                  검색어 또는 상태 필터를 조정해 주세요.
                </p>
              </div>
            ) : (
              <>
                <ul className="space-y-4 md:hidden">
                  {filteredAndSortedRows.map((row) => (
                    <li key={row.id} id={`admin-application-row-${row.id}`}>
                      <button
                        type="button"
                        onClick={() => openDetail(row)}
                        className={`w-full rounded-2xl border p-4 text-left shadow-sm transition ${
                          row.is_hidden
                            ? "border-slate-300 bg-slate-50 opacity-60 hover:opacity-80"
                            : "border-slate-200 bg-white hover:border-slate-300 hover:bg-slate-50/80 active:bg-slate-50"
                        }`}
                      >
                        <div className="flex items-start justify-between gap-3">
                          <p className="text-xs font-medium text-slate-500">
                            {formatCreatedAt(row.created_at)}
                          </p>
                          <div className="flex flex-wrap gap-1">
                            {row.is_hidden ? (
                              <span className="rounded-full bg-slate-400 px-2 py-0.5 text-[10px] font-black text-white">
                                숨김
                              </span>
                            ) : null}
                            <QuoteStageBadge quoteStatus={row.quote_status} finalId={row.final_selected_quote_id} />
                          </div>
                        </div>
                        <p className="mt-2 text-xs font-semibold text-slate-700">
                          접수번호{" "}
                          <span className="font-mono text-[0.8125rem] font-bold text-slate-900">
                            {row.receipt_number}
                          </span>
                        </p>
                        <p className="mt-3 text-base font-bold text-slate-900">
                          {row.applicant_name}
                        </p>
                        <p className="mt-1 text-sm text-slate-600">
                          {displayApplicationTypeLabel(row.application_type)}
                        </p>
                        <p className="mt-2 max-w-full truncate text-xs font-semibold text-slate-600">
                          <span className="mr-1 text-slate-400" aria-hidden>
                            📝
                          </span>
                          {memoPreview(row.admin_memo, 28)}
                        </p>
                        <dl className="mt-4 space-y-2 text-sm">
                          <div className="flex justify-between gap-2">
                            <dt className="text-slate-500">연락처</dt>
                            <dd className="text-right font-medium text-slate-800">
                              {row.phone}
                            </dd>
                          </div>
                          <div className="flex justify-between gap-2">
                            <dt className="text-slate-500">단체명</dt>
                            <dd className="text-right font-medium text-slate-800">
                              {row.organization_name}
                            </dd>
                          </div>
                          <div className="flex justify-between gap-2">
                            <dt className="text-slate-500">출발 → 도착</dt>
                            <dd className="max-w-[55%] text-right font-medium text-slate-800">
                              {`${row.departure} → ${row.destination}`}
                            </dd>
                          </div>
                          <div className="flex justify-between gap-2">
                            <dt className="text-slate-500">출발지역</dt>
                            <dd className="text-right font-medium text-slate-800">
                              {row.departure_region || "—"}
                            </dd>
                          </div>
                          <div className="flex justify-between gap-2">
                            <dt className="text-slate-500">인원</dt>
                            <dd className="text-right font-medium text-slate-800">
                              {row.passenger_count ?? "—"}
                            </dd>
                          </div>
                        </dl>
                        <p className="mt-3 text-xs font-medium text-blue-600">
                          탭하여 상세 보기 →
                        </p>
                      </button>
                    </li>
                  ))}
                </ul>

                <div className="hidden overflow-x-auto rounded-2xl border border-slate-200 bg-white shadow-sm md:block">
                  <table className="min-w-full divide-y divide-slate-200 text-left text-sm">
                    <thead className="bg-slate-50">
                      <tr>
                        <th className="whitespace-nowrap px-4 py-0 font-semibold text-slate-700">
                          <button
                            type="button"
                            onClick={() => handleSortClick("created_at")}
                            className="flex w-full items-center gap-1 py-3 hover:text-slate-900"
                          >
                            신청일{sortIndicator("created_at")}
                          </button>
                        </th>
                        <th className="whitespace-nowrap px-4 py-0 font-semibold text-slate-700">
                          <button
                            type="button"
                            onClick={() => handleSortClick("receipt_number")}
                            className="flex w-full items-center gap-1 py-3 hover:text-slate-900"
                          >
                            접수번호{sortIndicator("receipt_number")}
                          </button>
                        </th>
                        <th className="whitespace-nowrap px-4 py-0 font-semibold text-slate-700">
                          <button
                            type="button"
                            onClick={() => handleSortClick("application_type")}
                            className="flex w-full items-center gap-1 py-3 hover:text-slate-900"
                          >
                            신청 유형{sortIndicator("application_type")}
                          </button>
                        </th>
                        <th className="whitespace-nowrap px-4 py-0 font-semibold text-slate-700">
                          <button
                            type="button"
                            onClick={() => handleSortClick("applicant_name")}
                            className="flex w-full items-center gap-1 py-3 hover:text-slate-900"
                          >
                            신청자명{sortIndicator("applicant_name")}
                          </button>
                        </th>
                        <th className="whitespace-nowrap px-4 py-0 font-semibold text-slate-700">
                          <button
                            type="button"
                            onClick={() => handleSortClick("phone")}
                            className="flex w-full items-center gap-1 py-3 hover:text-slate-900"
                          >
                            연락처{sortIndicator("phone")}
                          </button>
                        </th>
                        <th className="whitespace-nowrap px-4 py-0 font-semibold text-slate-700">
                          <button
                            type="button"
                            onClick={() => handleSortClick("organization_name")}
                            className="flex w-full items-center gap-1 py-3 hover:text-slate-900"
                          >
                            단체명{sortIndicator("organization_name")}
                          </button>
                        </th>
                        <th className="whitespace-nowrap px-4 py-0 font-semibold text-slate-700">
                          <button
                            type="button"
                            onClick={() => handleSortClick("departure")}
                            className="flex w-full items-center gap-1 py-3 hover:text-slate-900"
                          >
                            출발지{sortIndicator("departure")}
                          </button>
                        </th>
                        <th className="whitespace-nowrap px-4 py-0 font-semibold text-slate-700">
                          <button
                            type="button"
                            onClick={() => handleSortClick("departure_region")}
                            className="flex w-full items-center gap-1 py-3 hover:text-slate-900"
                          >
                            출발지역{sortIndicator("departure_region")}
                          </button>
                        </th>
                        <th className="whitespace-nowrap px-4 py-0 font-semibold text-slate-700">
                          <button
                            type="button"
                            onClick={() => handleSortClick("destination")}
                            className="flex w-full items-center gap-1 py-3 hover:text-slate-900"
                          >
                            도착지{sortIndicator("destination")}
                          </button>
                        </th>
                        <th className="whitespace-nowrap px-4 py-0 font-semibold text-slate-700">
                          <button
                            type="button"
                            onClick={() => handleSortClick("passenger_count")}
                            className="flex w-full items-center gap-1 py-3 hover:text-slate-900"
                          >
                            인원수{sortIndicator("passenger_count")}
                          </button>
                        </th>
                        <th className="whitespace-nowrap px-4 py-0 font-semibold text-slate-700">
                          <button
                            type="button"
                            onClick={() => handleSortClick("quote_status")}
                            className="flex w-full items-center gap-1 py-3 hover:text-slate-900"
                          >
                            단계{sortIndicator("quote_status")}
                          </button>
                        </th>
                        <th className="whitespace-nowrap px-4 py-0 font-semibold text-slate-700">
                          <button
                            type="button"
                            onClick={() => handleSortClick("admin_memo")}
                            className="flex w-full items-center gap-1 py-3 hover:text-slate-900"
                          >
                            메모{sortIndicator("admin_memo")}
                          </button>
                        </th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 bg-white">
                      {filteredAndSortedRows.map((row) => (
                        <tr
                          key={row.id}
                          id={`admin-application-row-${row.id}`}
                          className="cursor-pointer hover:bg-slate-50/80"
                          onClick={() => openDetail(row)}
                          onKeyDown={(e) => {
                            if (e.key === "Enter" || e.key === " ") {
                              e.preventDefault();
                              openDetail(row);
                            }
                          }}
                          role="button"
                          tabIndex={0}
                        >
                          <td className="whitespace-nowrap px-4 py-3 text-slate-700">
                            {formatCreatedAt(row.created_at)}
                          </td>
                          <td className="whitespace-nowrap px-4 py-3 font-mono text-[13px] font-semibold text-slate-800">
                            {row.receipt_number}
                          </td>
                          <td className="max-w-[200px] px-4 py-3 text-slate-800">
                            <span className="line-clamp-2">
                              {displayApplicationTypeLabel(row.application_type)}
                            </span>
                          </td>
                          <td className="whitespace-nowrap px-4 py-3 font-medium text-slate-900">
                            {row.applicant_name}
                          </td>
                          <td className="whitespace-nowrap px-4 py-3 text-slate-700">
                            {row.phone}
                          </td>
                          <td className="max-w-[160px] px-4 py-3 text-slate-700">
                            <span className="line-clamp-2">
                              {row.organization_name}
                            </span>
                          </td>
                          <td className="max-w-[140px] px-4 py-3 text-slate-700">
                            <span className="line-clamp-2">{row.departure}</span>
                          </td>
                          <td className="whitespace-nowrap px-4 py-3 text-slate-700">
                            {row.departure_region || "—"}
                          </td>
                          <td className="max-w-[140px] px-4 py-3 text-slate-700">
                            <span className="line-clamp-2">{row.destination}</span>
                          </td>
                          <td className="whitespace-nowrap px-4 py-3 text-slate-700">
                            {row.passenger_count ?? "—"}
                          </td>
                          <td className="whitespace-nowrap px-4 py-3">
                            <QuoteStageBadge quoteStatus={row.quote_status} finalId={row.final_selected_quote_id} />
                          </td>
                          <td className="px-4 py-3 text-slate-700">
                            <div className="flex min-w-0 items-center gap-2">
                              <span className="text-slate-400" aria-hidden>
                                📝
                              </span>
                              <span className="min-w-0 max-w-[260px] truncate text-sm">
                                {memoPreview(row.admin_memo, 28)}
                              </span>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                <p className="mt-4 text-center text-xs text-slate-500">
                  총 {rows.length}건 중 {filteredAndSortedRows.length}건 표시 · 행 클릭 시 상세
                </p>
              </>
            )}
          </>
        )}
      </main>

      <AdminDetailSlidePanel
        row={selected}
        open={detailOpen}
        onClose={closeDetail}
        onStatusSaved={handleStatusSaved}
        onOpenSms={openSms}
        onApplicationHidden={() => {
          if (!showHidden) {
            closeDetail();
          }
          void load(showHidden);
        }}
      />

      {smsRow ? (
        <AdminSmsModal
          row={smsRow}
          open={smsOpen}
          message={smsText}
          onChangeMessage={setSmsText}
          onSend={() => void handleSendSms()}
          sendLoading={smsSending}
          sendError={smsSendError}
          onCopy={() => void handleCopySms()}
          onClose={closeSms}
        />
      ) : null}

      {realtimeToast ? (
        <div
          className="fixed right-4 top-4 z-[300] w-[min(calc(100vw-2rem),22rem)] rounded-2xl border border-slate-200 bg-white px-4 py-3 shadow-xl shadow-slate-900/20 ring-1 ring-slate-100"
          role="status"
          aria-live="assertive"
        >
          <div className="flex gap-3">
            <span
              className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[#1e3a5f]/10 text-[#1e3a5f]"
              aria-hidden
            >
              <svg
                className="h-5 w-5"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                strokeWidth={2}
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M14.857 17.082a23.848 23.848 0 0 0 5.454-1.31A8.967 8.967 0 0 1 18 9.75V9A6 6 0 0 0 6 9v.75a8.967 8.967 0 0 1-2.312 6.022c1.733.64 3.56 1.085 5.455 1.31m5.714 0a24.255 24.255 0 0 1-5.714 0m5.714 0a3 3 0 1 1-5.714 0"
                />
              </svg>
            </span>
            <div className="min-w-0 flex-1 py-0.5">
              <p className="text-sm font-black leading-snug text-slate-900">
                {realtimeToast.kind === "partner"
                  ? realtimeToast.title
                  : "새 신청이 접수되었습니다."}
              </p>
              {realtimeToast.kind === "partner" ? (
                <p className="mt-2 whitespace-pre-wrap text-xs font-semibold leading-relaxed text-slate-600">
                  {realtimeToast.message}
                </p>
              ) : (
                <>
                  <p className="mt-2 text-xs font-semibold leading-relaxed text-slate-600">
                    <span className="text-slate-500">신청자명</span>{" "}
                    {realtimeToast.applicantName}
                  </p>
                  <p className="mt-1 text-xs font-semibold leading-relaxed text-slate-600">
                    <span className="text-slate-500">신청유형</span>{" "}
                    {realtimeToast.applicationTypeLabel}
                  </p>
                  <p className="mt-1 text-xs font-semibold leading-relaxed text-slate-600">
                    <span className="text-slate-500">인원수</span>{" "}
                    {realtimeToast.passengerLine}
                  </p>
                </>
              )}
            </div>
          </div>
        </div>
      ) : null}

      {toast ? (
        <div
          className="fixed bottom-6 left-1/2 z-[60] flex max-w-[min(420px,calc(100vw-2rem))] -translate-x-1/2 items-center gap-2 rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-semibold text-emerald-900 shadow-lg shadow-emerald-900/10 ring-1 ring-emerald-100"
          role="status"
          aria-live="polite"
        >
          <span
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-emerald-100 text-emerald-700"
            aria-hidden
          >
            <svg
              className="h-5 w-5"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M5 13l4 4L19 7"
              />
            </svg>
          </span>
          <span className="leading-snug">{toast.message}</span>
        </div>
      ) : null}
    </div>
  );
}
