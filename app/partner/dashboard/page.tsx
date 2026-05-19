"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";

import { PartnerCallCard } from "@/components/partner/PartnerCallCard";
import { SupportQuoteBreakdown } from "@/components/SupportQuoteBreakdown";
import {
  MATCHED_RUN_FILTERS,
  PARTNER_DASHBOARD_TABS,
  PARTNER_DASHBOARD_TITLE,
  type MatchedRunFilter,
  type PartnerDashboardTab,
} from "@/lib/partner-dashboard-labels";
import { matchedRunStatus } from "@/lib/partner-call-view-model";
import type { QuoteSupportBreakdown } from "@/lib/support-calculation";
import { buildQuoteSupportBreakdown } from "@/lib/support-calculation";
import {
  realtimeStatusLabel,
  useSupabaseRealtimeRefresh,
} from "@/hooks/useSupabaseRealtimeRefresh";
import { isPartnerDriverLoginAllowed } from "@/lib/partner-driver-access";
import { fetchProfileForAuthUser } from "@/lib/profile";
import {
  SERVICE_REGIONS,
  normalizeRegion,
  normalizeServiceRegions,
  type ServiceRegion,
} from "@/lib/regions";
import { USER_ROLES, parseUserRole } from "@/lib/roles";
import { isRoleHost, roleLoginPath } from "@/lib/role-hosts";
import {
  formatRouteWithStopovers,
  formatStopovers,
  parseStopovers,
} from "@/lib/stopovers";
import { createPartnerBrowserClient } from "@/lib/supabase";
import { estimateSponsorSupport } from "@/lib/support-estimate";

const tapStyle = { WebkitTapHighlightColor: "transparent" } as const;

/** 콜 목록에 포함된 내 견적(회원 제출 또는 동일 번호 비회원 제출) */
type PartnerMyQuote = {
  source: "member" | "guest";
  id: string;
  price: number | null;
  support_settlement_type?: "client_priority" | "ratio" | string;
  preapproved_support_amount?: number | null;
  approved_support_amount?: number | null;
  estimated_support_amount?: number | null;
  support_discount_amount?: number | null;
  customer_support_amount?: number | null;
  member_price?: number | null;
  final_customer_support_amount?: number | null;
  final_driver_support_amount?: number | null;
  final_member_price?: number | null;
  support_recalculated_at?: string;
  is_member_quote?: boolean;
  converted_from_guest_quote_id?: string;
  sponsor_support_amount?: number | null;
  sponsor_support_status?: string;
  sponsor_approved_support_amount?: number | null;
  sponsor_discounted_price?: number | null;
  sponsor_quote_enabled?: boolean;
  driver_support_amount?: number | null;
  client_reward_amount?: number | null;
  support_breakdown?: QuoteSupportBreakdown | null;
  support_discount_planned_price?: number | null;
  support_discount_applied_price?: number | null;
  final_discount_applied_price?: number | null;
  vehicle_type: string;
  available_time: string;
  message: string;
  status: string;
  created_at: string;
  match_result?: string;
};

type PartnerCall = {
  id: string;
  created_at: string;
  receipt_number: string;
  contract_number: string;
  contract_pdf_generated_at: string;
  contract_pdf_url: string;
  application_type: string;
  trip_type: string;
  bus_grade: string;
  departure: string;
  departure_region: string;
  destination: string;
  stopovers?: string[];
  departure_date: string;
  departure_time: string;
  return_date: string;
  passenger_count: number | null;
  request_message?: string;
  estimated_support_amount: number;
  quote_status: string;
  quote_deadline_at: string;
  quote_limit_count: number | null;
  quote_count: number;
  call_category: "new" | "quoted" | "matched";
  target_normal_price: number | null;
  target_member_price: number | null;
  quote_closed_at: string;
  extension_round: number;
  support_client_reward_ratio: number;
  support_driver_ratio: number;
  auto_selected_quote_id: string;
  auto_selected_quote_source: string;
  final_selected_quote_id: string;
  final_selected_quote_source: string;
  auto_final_confirm_at: string;
  contact_revealed_at: string;
  contract_status: string;
  contract_started_at: string;
  client_contract_confirmed_at: string;
  driver_contract_confirmed_at: string;
  deposit_amount: number;
  deposit_status: string;
  deposit_confirmed_at: string;
  contract_memo: string;
  customer_name?: string;
  customer_phone?: string;
  sponsor_support_status?: string;
  sponsor_approved_support_amount?: number | null;
  sponsor_estimated_support_amount?: number | null;
  sponsors?: Array<{
    id: string;
    company_name: string;
    status: string;
    estimated_support_amount: number | null;
    approved_support_amount: number | null;
  }>;
  my_quote: PartnerMyQuote | null;
};

type PartnerDriverInfo = {
  company_name: string;
  manager_name: string;
  phone: string;
};

type QuoteForm = {
  price: string;
  supportDiscountAmount: string;
  supportSettlementType: "client_priority" | "ratio";
  vehicleType: string;
  availableTime: string;
  message: string;
};

type ReferralForm = {
  phones: string;
};

type ReferralResult = {
  phone: string;
  status: "sent" | "skipped_duplicate" | "invalid_phone" | "send_failed";
  error?: string;
};

const emptyQuoteForm: QuoteForm = {
  price: "",
  supportDiscountAmount: "",
  supportSettlementType: "client_priority",
  vehicleType: "",
  availableTime: "",
  message: "",
};

const emptyReferralForm: ReferralForm = {
  phones: "",
};

const PARTNER_NOTIFICATION_SOUND_PREF_KEY = "partnerDashboardSoundEnabled";
const APPLICATION_TYPE_NEW_BOOKING = "신규로 예약이 필요하신 경우";

function formatDate(value: string): string {
  const t = value.trim();
  if (t === "") return "미정";
  if (/^\d{4}-\d{2}-\d{2}$/.test(t)) return t;
  const d = new Date(t);
  if (Number.isNaN(d.getTime())) return t;
  return d.toISOString().slice(0, 10);
}

function formatDeparture(call: PartnerCall): string {
  const date = formatDate(call.departure_date);
  const time = call.departure_time.trim();
  if (time === "" || time === "—") return date;
  return `${date} ${time}`;
}

function formatPrice(value: number | null): string {
  if (value == null) return "제출 완료";
  return `${value.toLocaleString("ko-KR")}원`;
}

function formatRemaining(deadline: string): string {
  const time = new Date(deadline).getTime();
  if (!Number.isFinite(time)) return "마감시간 미정";
  const diff = time - Date.now();
  if (diff <= 0) return "마감 임박";
  const hours = Math.floor(diff / (60 * 60 * 1000));
  const minutes = Math.ceil((diff % (60 * 60 * 1000)) / (60 * 1000));
  if (hours <= 0) return `마감까지 ${minutes}분`;
  return `마감까지 ${hours}시간`;
}

function isQuoteClosed(call: PartnerCall): boolean {
  const closedStatuses = new Set([
    "closed_by_time",
    "closed_by_quote_count",
    "closed_by_price",
    "auto_selected",
    "final_selected",
    "completed",
    "contract_pending",
    "manually_closed",
  ]);
  return (
    call.quote_closed_at.trim() !== "" ||
    call.final_selected_quote_id.trim() !== "" ||
    closedStatuses.has(call.quote_status)
  );
}

function isMatchedCall(call: PartnerCall): boolean {
  if (call.call_category === "matched") return true;
  if (call.my_quote == null) return false;
  const selectedQuoteId =
    call.final_selected_quote_id.trim() || call.auto_selected_quote_id.trim();
  return selectedQuoteId !== "" && call.my_quote.id === selectedQuoteId;
}

function isNewCall(call: PartnerCall): boolean {
  return call.call_category === "new" && call.my_quote == null && !isQuoteClosed(call);
}

function isQuotedCall(call: PartnerCall): boolean {
  return (
    call.call_category === "quoted" &&
    call.my_quote != null &&
    call.final_selected_quote_id.trim() === "" &&
    !isMatchedCall(call)
  );
}

function canRevealCustomerInfo(call: PartnerCall): boolean {
  if (call.my_quote == null) return false;
  const revealStatuses = new Set(["final_selected", "contract_pending", "completed"]);
  return (
    call.contact_revealed_at.trim() !== "" &&
    call.final_selected_quote_id.trim() !== "" &&
    call.my_quote.id === call.final_selected_quote_id &&
    revealStatuses.has(call.quote_status)
  );
}

function quoteStatusLabel(call: PartnerCall): string {
  if (isMatchedCall(call)) {
    return call.final_selected_quote_id.trim() !== ""
      ? "매칭 성공"
      : "예상 지원금 후보";
  }
  if (call.my_quote != null) return "견적 검토중";
  return "제출 전";
}

function averageStatusLabel(call: PartnerCall): string {
  const myPrice =
    call.my_quote?.final_member_price ??
    call.my_quote?.member_price ??
    call.my_quote?.sponsor_discounted_price ??
    call.my_quote?.price ??
    null;
  if (myPrice == null || call.quote_count <= 1) return "평균가 산정 전";
  return "평균가 대비 상태 확인 중";
}

function supportQuotePrice(quote: PartnerMyQuote): number | null {
  const storedPrice =
    quote.final_member_price ?? quote.member_price ?? quote.sponsor_discounted_price;
  if (storedPrice != null) return storedPrice;
  const customerSupportAmount =
    quote.customer_support_amount ?? quote.support_discount_amount ?? null;
  if (quote.price == null || customerSupportAmount == null) return null;
  return Math.max(0, quote.price - customerSupportAmount);
}

function supportStatusLabel(status?: string): string {
  if (status === "approved") return "확정 지원금";
  if (status === "preapproved" || status === "pending" || status === "mixed") return "예상 지원금 검토중";
  if (["rejected", "cancelled", "expired"].includes(status ?? "")) return "미승인";
  return "일반/지원 없음";
}

function quoteSupportBreakdown(quote: PartnerMyQuote): QuoteSupportBreakdown {
  return (
    quote.support_breakdown ??
    buildQuoteSupportBreakdown({
      ...quote,
      sponsor_quote_enabled: quote.sponsor_quote_enabled,
    })
  );
}

function formatSubmittedAt(iso: string): string {
  const t = iso.trim();
  if (t === "" || t === "—") return "—";
  const d = new Date(t);
  if (Number.isNaN(d.getTime())) return t;
  return d.toLocaleString("ko-KR", {
    dateStyle: "medium",
    timeStyle: "short",
  });
}

function parsePriceInput(value: string): number | null {
  const digits = value.replace(/[^\d]/g, "");
  if (digits === "") return null;
  const n = Number.parseInt(digits, 10);
  return Number.isFinite(n) ? n : null;
}

function safeText(value: unknown, emptyLabel = ""): string {
  if (value == null) return emptyLabel;
  const text = String(value).trim();
  return text === "" ? emptyLabel : text;
}

function parseInteger(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) {
    return Math.trunc(value);
  }
  if (typeof value === "string") {
    const digits = value.replace(/[^\d-]/g, "");
    if (digits !== "") {
      const parsed = Number.parseInt(digits, 10);
      if (Number.isFinite(parsed)) return parsed;
    }
  }
  return null;
}

function supportDiscountFor(call: PartnerCall, value: string): number {
  const parsed = parsePriceInput(value);
  return parsed ?? call.estimated_support_amount;
}

function discountedPriceFor(
  call: PartnerCall,
  priceText: string,
  supportDiscountText: string,
): number | null {
  const price = parsePriceInput(priceText);
  if (price == null) return null;
  return Math.max(price - supportDiscountFor(call, supportDiscountText), 0);
}

function parseReferralPhones(value: string): string[] {
  return value
    .split(/[\s,;]+/)
    .map((item) => item.trim())
    .filter(Boolean);
}

function referralStatusLabel(status: ReferralResult["status"]): string {
  if (status === "sent") return "발송 완료";
  if (status === "skipped_duplicate") return "중복 건너뜀";
  if (status === "invalid_phone") return "번호 오류";
  return "발송 실패";
}

function buildReferralPreview(call: PartnerCall): string {
  const stopoverText = formatStopovers(call.stopovers);
  return `[지원금 전세버스]
전세버스 견적요청이 전달되었습니다.

출발: ${call.departure}
${stopoverText ? `경유: ${stopoverText}\n` : ""}도착: ${call.destination}
일시: ${formatDeparture(call)}
인원: ${call.passenger_count ?? "미정"}

견적 확인:
https://www.free-bus.co.kr/shared-quote/{전달 후 생성}

제휴기사 등록:
https://www.free-bus.co.kr/partner/register?ref={전달 후 생성}`;
}

function logRealtime(message: string, payload?: unknown) {
  if (process.env.NODE_ENV !== "development") return;
  if (payload === undefined) console.log(message);
  else console.log(message, payload);
}

function buildOptimisticCall(row: Record<string, unknown>): PartnerCall | null {
  const id = safeText(row.id);
  if (id === "") return null;
  if (safeText(row.application_type) !== APPLICATION_TYPE_NEW_BOOKING) return null;

  const passengerCount = parseInteger(row.passenger_count);
  const estimatedSupportAmount = estimateSponsorSupport({
    passengerCount,
    price: 0,
  }).supportAmount;

  return {
    id,
    created_at: safeText(row.created_at, new Date().toISOString()),
    receipt_number: safeText(row.receipt_number),
    contract_number: safeText(row.contract_number),
    contract_pdf_generated_at: safeText(row.contract_pdf_generated_at),
    contract_pdf_url: safeText(row.contract_pdf_url),
    application_type: safeText(row.application_type),
    trip_type: safeText(row.trip_type),
    bus_grade: safeText(row.bus_grade),
    departure: safeText(row.departure),
    departure_region: safeText(row.departure_region),
    destination: safeText(row.destination),
    stopovers: parseStopovers(row.stopovers),
    departure_date: safeText(row.departure_date),
    departure_time: safeText(row.departure_time),
    return_date: safeText(row.return_date),
    passenger_count: passengerCount,
    estimated_support_amount: estimatedSupportAmount,
    quote_status: safeText(row.quote_status, "collecting"),
    quote_deadline_at: safeText(row.quote_deadline_at),
    quote_limit_count: parseInteger(row.quote_limit_count),
    quote_count: 0,
    call_category: "new",
    target_normal_price: parseInteger(row.target_normal_price),
    target_member_price: parseInteger(row.target_member_price),
    quote_closed_at: safeText(row.quote_closed_at),
    extension_round: parseInteger(row.extension_round) ?? 0,
    support_client_reward_ratio: parseInteger(row.support_client_reward_ratio) ?? 0,
    support_driver_ratio: parseInteger(row.support_driver_ratio) ?? 100,
    auto_selected_quote_id: safeText(row.auto_selected_quote_id),
    auto_selected_quote_source: safeText(row.auto_selected_quote_source),
    final_selected_quote_id: safeText(row.final_selected_quote_id),
    final_selected_quote_source: safeText(row.final_selected_quote_source),
    auto_final_confirm_at: safeText(row.auto_final_confirm_at),
    contact_revealed_at: safeText(row.contact_revealed_at),
    contract_status: safeText(row.contract_status),
    contract_started_at: safeText(row.contract_started_at),
    client_contract_confirmed_at: safeText(row.client_contract_confirmed_at),
    driver_contract_confirmed_at: safeText(row.driver_contract_confirmed_at),
    deposit_amount: parseInteger(row.deposit_amount) ?? 0,
    deposit_status: safeText(row.deposit_status, "unpaid"),
    deposit_confirmed_at: safeText(row.deposit_confirmed_at),
    contract_memo: safeText(row.contract_memo),
    my_quote: null,
  };
}

export default function PartnerDashboardPage() {
  const router = useRouter();
  const [checking, setChecking] = useState(true);
  const [calls, setCalls] = useState<PartnerCall[]>([]);
  const [driverInfo, setDriverInfo] = useState<PartnerDriverInfo | null>(null);
  const [activeTab, setActiveTab] = useState<PartnerDashboardTab>("new");
  const [matchedSubTab, setMatchedSubTab] = useState<MatchedRunFilter>("in_progress");
  const [expandedCallIds, setExpandedCallIds] = useState<Set<string>>(() => new Set());
  const [editingQuote, setEditingQuote] = useState(false);
  const [callsLoading, setCallsLoading] = useState(false);
  const [callsError, setCallsError] = useState<string | null>(null);
  const [activeQuoteCallId, setActiveQuoteCallId] = useState<string | null>(null);
  const [quoteForm, setQuoteForm] = useState<QuoteForm>(emptyQuoteForm);
  const [quoteBusy, setQuoteBusy] = useState(false);
  const [quoteMessage, setQuoteMessage] = useState<string | null>(null);
  const [quoteDetailCall, setQuoteDetailCall] = useState<PartnerCall | null>(
    null,
  );
  const [customerDetailCall, setCustomerDetailCall] = useState<PartnerCall | null>(
    null,
  );
  const [activeReferralCallId, setActiveReferralCallId] = useState<string | null>(null);
  const [referralForm, setReferralForm] =
    useState<ReferralForm>(emptyReferralForm);
  const [referralBusy, setReferralBusy] = useState(false);
  const [referralMessage, setReferralMessage] = useState<string | null>(null);
  const [referralResults, setReferralResults] = useState<ReferralResult[]>([]);
  const [serviceRegions, setServiceRegions] = useState<ServiceRegion[]>([]);
  const [savedServiceRegions, setSavedServiceRegions] = useState<ServiceRegion[]>([]);
  const [serviceRegionBusy, setServiceRegionBusy] = useState(false);
  const [serviceRegionMessage, setServiceRegionMessage] = useState<string | null>(null);
  const [soundEnabled, setSoundEnabled] = useState(false);
  const [newCallNoticeId, setNewCallNoticeId] = useState<string | null>(null);
  const [highlightedNewCallIds, setHighlightedNewCallIds] = useState<Set<string>>(
    () => new Set(),
  );
  const [notificationPermission, setNotificationPermission] = useState<
    NotificationPermission | "unsupported"
  >("unsupported");
  const knownCallIdsRef = useRef<Set<string>>(new Set());
  const notifiedCallIdsRef = useRef<Set<string>>(new Set());
  const callsInitializedRef = useRef(false);
  const audioContextRef = useRef<AudioContext | null>(null);
  const pendingApplicationInsertIdRef = useRef<string | null>(null);
  const realtimeSubscribedLoggedRef = useRef(false);
  const savedServiceRegionsRef = useRef<ServiceRegion[]>([]);
  const highlightTimersRef = useRef<Map<string, number>>(new Map());

  function scrollToCall(id: string) {
    setActiveTab("new");
    window.setTimeout(() => {
      document.getElementById(`partner-call-${id}`)?.scrollIntoView({
        behavior: "smooth",
        block: "center",
      });
    }, 80);
  }

  const playNotificationSound = useCallback(() => {
    if (!soundEnabled || !audioContextRef.current) return;
    try {
      const ctx = audioContextRef.current;
      const oscillator = ctx.createOscillator();
      const gain = ctx.createGain();
      oscillator.type = "sine";
      oscillator.frequency.value = 880;
      gain.gain.value = 0.05;
      oscillator.connect(gain);
      gain.connect(ctx.destination);
      oscillator.start();
      oscillator.stop(ctx.currentTime + 0.12);
    } catch {
      /* ignore */
    }
  }, [soundEnabled]);

  const highlightNewCall = useCallback((id: string) => {
    setHighlightedNewCallIds((prev) => {
      const next = new Set(prev);
      next.add(id);
      return next;
    });

    const previousTimer = highlightTimersRef.current.get(id);
    if (previousTimer != null) {
      window.clearTimeout(previousTimer);
    }

    const timer = window.setTimeout(() => {
      highlightTimersRef.current.delete(id);
      setHighlightedNewCallIds((prev) => {
        const next = new Set(prev);
        next.delete(id);
        return next;
      });
    }, 3000);
    highlightTimersRef.current.set(id, timer);
  }, []);

  const showBrowserNotification = useCallback((call: PartnerCall) => {
    if (typeof window === "undefined" || !("Notification" in window)) return;
    if (window.Notification.permission !== "granted") return;

    const title = `🔔 ${formatRouteWithStopovers(
      call.departure,
      call.stopovers,
      call.destination,
    )} 신규 견적`;
    const body = `${call.passenger_count ?? "미정"}인 / ${call.trip_type || "미정"} / ${
      call.bus_grade || "미정"
    }`;
    const notification = new window.Notification(title, {
      body,
      tag: `partner-new-call-${call.id}`,
    });
    notification.onclick = () => {
      window.focus();
      scrollToCall(call.id);
      notification.close();
    };
  }, []);

  const handleNewCallArrived = useCallback(
    (call: PartnerCall) => {
      if (notifiedCallIdsRef.current.has(call.id)) return;
      notifiedCallIdsRef.current.add(call.id);
      setNewCallNoticeId(call.id);
      highlightNewCall(call.id);
      playNotificationSound();
      showBrowserNotification(call);
    },
    [highlightNewCall, playNotificationSound, showBrowserNotification],
  );

  const loadCalls = useCallback(async () => {
    setCallsLoading(true);
    setCallsError(null);
    try {
      const res = await fetch("/api/partner/calls", {
        credentials: "same-origin",
      });
      const json = (await res.json()) as {
        error?: string;
        calls?: PartnerCall[];
        service_regions?: unknown;
        driver?: PartnerDriverInfo;
      };
      if (!res.ok) {
        setCallsError(json.error ?? "견적 목록을 불러오지 못했습니다.");
        setCalls([]);
        if (res.status === 401 || res.status === 403) {
          const supabase = createPartnerBrowserClient();
          await supabase.auth.signOut();
          router.replace(`${roleLoginPath("partner")}?error=forbidden`);
        }
        return;
      }
      const nextCalls = Array.isArray(json.calls) ? json.calls : [];
      const nextIds = new Set(nextCalls.map((call) => call.id));
      if (callsInitializedRef.current) {
        const pendingInsertId = pendingApplicationInsertIdRef.current;
        const newCall =
          (pendingInsertId
            ? nextCalls.find((call) => call.id === pendingInsertId && isNewCall(call))
            : undefined) ??
          nextCalls.find(
            (call) => !knownCallIdsRef.current.has(call.id) && isNewCall(call),
          );
        if (newCall) {
          handleNewCallArrived(newCall);
        }
        pendingApplicationInsertIdRef.current = null;
      } else {
        callsInitializedRef.current = true;
      }
      knownCallIdsRef.current = nextIds;
      setCalls(nextCalls);
      setDriverInfo(json.driver ?? null);
      const nextRegions = normalizeServiceRegions(json.service_regions);
      setServiceRegions(nextRegions);
      setSavedServiceRegions(nextRegions);
    } catch (e) {
      setCallsError(e instanceof Error ? e.message : String(e));
      setCalls([]);
    } finally {
      setCallsLoading(false);
    }
  }, [handleNewCallArrived, router]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const supabase = createPartnerBrowserClient();
        const {
          data: { user },
        } = await supabase.auth.getUser();

        if (!user?.id) {
          router.replace(roleLoginPath("partner"));
          return;
        }

        const profile = await fetchProfileForAuthUser(supabase, user.id);
        const role = parseUserRole(profile?.role ?? null);

        if (role !== USER_ROLES.DRIVER) {
          await supabase.auth.signOut();
          router.replace(`${roleLoginPath("partner")}?error=forbidden`);
          return;
        }

        const approvedOk = await isPartnerDriverLoginAllowed(
          supabase,
          profile,
          user.email,
        );
        if (!approvedOk) {
          await supabase.auth.signOut();
          router.replace(roleLoginPath("partner"));
          return;
        }

        const pid = profile?.partner_driver_id?.trim();
        if (pid) {
          const { data: pwRow, error: pwErr } = await supabase
            .from("partner_drivers")
            .select("temporary_password_issued_at, password_changed_at")
            .eq("id", pid)
            .maybeSingle();
          if (!pwErr && pwRow && typeof pwRow === "object") {
            const row = pwRow as {
              temporary_password_issued_at?: unknown;
              password_changed_at?: unknown;
            };
            const issued =
              row.temporary_password_issued_at != null &&
              String(row.temporary_password_issued_at).trim() !== "";
            const changed =
              row.password_changed_at != null &&
              String(row.password_changed_at).trim() !== "";
            if (issued && !changed) {
              router.replace(isRoleHost("partner") ? "/change-password" : "/partner/change-password");
              return;
            }
          }
        }

        if (!cancelled) {
          setChecking(false);
          void loadCalls();
        }
      } catch {
        router.replace(roleLoginPath("partner"));
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [loadCalls, router]);

  const handleRealtimeRefresh = useCallback(() => {
    logRealtime("[realtime] reload calls");
    return loadCalls();
  }, [loadCalls]);

  const realtimeStatus = useSupabaseRealtimeRefresh({
    channelName: "partner-dashboard-live",
    // Supabase Realtime 수신을 위해 public.applications도 supabase_realtime publication에 포함되어야 합니다.
    tables: ["applications", "driver_quotes", "guest_driver_quotes"],
    enabled: !checking,
    debounceMs: 800,
    onRefresh: handleRealtimeRefresh,
    onEvent: (payload) => {
      const table = String(payload.table ?? "");
      const eventType = String(payload.eventType ?? "");
      if (table === "applications" && eventType === "INSERT") {
        logRealtime("[realtime] applications INSERT", payload);
        const insertedId =
          typeof payload.new?.id === "string" ? payload.new.id : null;
        pendingApplicationInsertIdRef.current = insertedId;
        const optimisticCall = payload.new ? buildOptimisticCall(payload.new) : null;
        if (optimisticCall && isNewCall(optimisticCall)) {
          const selectedRegions = savedServiceRegionsRef.current;
          const callRegion = normalizeRegion(optimisticCall.departure_region);
          if (
            selectedRegions.length === 0 ||
            (callRegion !== "" && selectedRegions.includes(callRegion))
          ) {
            setCalls((prev) => {
              if (prev.some((call) => call.id === optimisticCall.id)) return prev;
              return [optimisticCall, ...prev];
            });
            knownCallIdsRef.current.add(optimisticCall.id);
            handleNewCallArrived(optimisticCall);
          }
        }
      } else if (table === "applications" && eventType === "UPDATE") {
        logRealtime("[realtime] applications UPDATE", payload);
      } else if (
        (table === "driver_quotes" || table === "guest_driver_quotes") &&
        (eventType === "INSERT" || eventType === "UPDATE")
      ) {
        logRealtime(`[realtime] ${table} ${eventType}`, payload);
      }
    },
  });

  useEffect(() => {
    if (realtimeStatus !== "connected" || realtimeSubscribedLoggedRef.current) return;
    realtimeSubscribedLoggedRef.current = true;
    logRealtime("[realtime] partner-dashboard subscribed");
  }, [realtimeStatus]);

  useEffect(() => {
    savedServiceRegionsRef.current = savedServiceRegions;
  }, [savedServiceRegions]);

  useEffect(() => {
    try {
      setSoundEnabled(
        window.localStorage.getItem(PARTNER_NOTIFICATION_SOUND_PREF_KEY) === "1",
      );
      setNotificationPermission(
        "Notification" in window ? window.Notification.permission : "unsupported",
      );
    } catch {
      /* ignore */
    }
  }, []);

  useEffect(() => {
    return () => {
      for (const timer of highlightTimersRef.current.values()) {
        window.clearTimeout(timer);
      }
      highlightTimersRef.current.clear();
    };
  }, []);

  const toggleSound = async () => {
    const next = !soundEnabled;
    if (next) {
      const AudioContextCtor =
        window.AudioContext ||
        (window as typeof window & { webkitAudioContext?: typeof AudioContext })
          .webkitAudioContext;
      if (AudioContextCtor && !audioContextRef.current) {
        audioContextRef.current = new AudioContextCtor();
      }
      if (audioContextRef.current?.state === "suspended") {
        await audioContextRef.current.resume();
      }
    }
    setSoundEnabled(next);
    try {
      window.localStorage.setItem(
        PARTNER_NOTIFICATION_SOUND_PREF_KEY,
        next ? "1" : "0",
      );
    } catch {
      /* ignore */
    }
  };

  const requestBrowserNotifications = async () => {
    if (typeof window === "undefined" || !("Notification" in window)) {
      setNotificationPermission("unsupported");
      return;
    }
    const nextPermission = await window.Notification.requestPermission();
    setNotificationPermission(nextPermission);
  };

  const handleLogout = async () => {
    try {
      const supabase = createPartnerBrowserClient();
      await supabase.auth.signOut();
    } finally {
      router.replace(roleLoginPath("partner"));
    }
  };

  const toggleServiceRegion = (region: ServiceRegion) => {
    setServiceRegionMessage(null);
    setServiceRegions((prev) =>
      prev.includes(region)
        ? prev.filter((item) => item !== region)
        : [...prev, region],
    );
  };

  const serviceRegionsChanged =
    serviceRegions.join("|") !== savedServiceRegions.join("|");

  const newCalls = calls.filter(isNewCall);
  const quotedCalls = calls.filter(isQuotedCall);
  const matchedCalls = calls.filter(isMatchedCall);
  const matchedFiltered = matchedCalls.filter(
    (call) => matchedRunStatus(call) === matchedSubTab,
  );
  const visibleCalls =
    activeTab === "new"
      ? newCalls
      : activeTab === "quoted"
        ? quotedCalls
        : matchedFiltered;
  const activeTabMeta =
    PARTNER_DASHBOARD_TABS.find((tab) => tab.id === activeTab) ??
    PARTNER_DASHBOARD_TABS[0];
  const tabCounts: Record<PartnerDashboardTab, number> = {
    new: newCalls.length,
    quoted: quotedCalls.length,
    matched: matchedCalls.length,
  };

  const toggleCallExpanded = (callId: string) => {
    setExpandedCallIds((prev) => {
      const next = new Set(prev);
      if (next.has(callId)) next.delete(callId);
      else next.add(callId);
      return next;
    });
  };

  const saveServiceRegions = async () => {
    setServiceRegionBusy(true);
    setServiceRegionMessage(null);
    try {
      const normalized = normalizeServiceRegions(serviceRegions);
      const res = await fetch("/api/partner/service-regions", {
        method: "PATCH",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ service_regions: normalized }),
      });
      const json = (await res.json()) as {
        error?: string;
        service_regions?: unknown;
      };
      if (!res.ok) {
        setServiceRegionMessage(json.error ?? "수신지역 저장에 실패했습니다.");
        return;
      }
      const nextRegions = normalizeServiceRegions(json.service_regions);
      setServiceRegions(nextRegions);
      setSavedServiceRegions(nextRegions);
      setServiceRegionMessage("수신지역을 저장했습니다.");
      void loadCalls();
    } catch (e) {
      setServiceRegionMessage(e instanceof Error ? e.message : String(e));
    } finally {
      setServiceRegionBusy(false);
    }
  };

  const openQuoteForm = (call: PartnerCall, edit = false) => {
    if (call.my_quote?.source === "member" && !edit) return;
    setEditingQuote(edit);
    setActiveQuoteCallId(call.id);
    setActiveReferralCallId(null);
    setExpandedCallIds((prev) => new Set(prev).add(call.id));
    const defaultCustomerSupport =
      call.sponsor_estimated_support_amount ?? call.estimated_support_amount ?? 0;
    if (edit && call.my_quote?.source === "member") {
      const mq = call.my_quote;
      setQuoteForm({
        price: mq.price != null ? String(mq.price) : "",
        supportDiscountAmount: String(
          mq.customer_support_amount ??
            mq.support_discount_amount ??
            defaultCustomerSupport,
        ),
        supportSettlementType:
          mq.support_settlement_type === "ratio" ? "ratio" : "client_priority",
        vehicleType: mq.vehicle_type === "—" ? "" : mq.vehicle_type,
        availableTime: mq.available_time === "—" ? "" : mq.available_time,
        message: mq.message,
      });
    } else {
      setQuoteForm({
        ...emptyQuoteForm,
        price:
          call.my_quote?.source === "guest" && call.my_quote.price != null
            ? String(call.my_quote.price)
            : "",
        vehicleType:
          call.my_quote?.source === "guest" ? call.my_quote.vehicle_type : "",
        availableTime:
          call.my_quote?.source === "guest" ? call.my_quote.available_time : "",
        message: call.my_quote?.source === "guest" ? call.my_quote.message : "",
        supportDiscountAmount: String(defaultCustomerSupport),
      });
    }
    setQuoteMessage(null);
  };

  const closeQuoteForm = () => {
    if (quoteBusy) return;
    setActiveQuoteCallId(null);
    setEditingQuote(false);
    setQuoteForm(emptyQuoteForm);
    setQuoteMessage(null);
  };

  const openReferralForm = (call: PartnerCall) => {
    if (isQuoteClosed(call)) return;
    setActiveReferralCallId(call.id);
    setActiveQuoteCallId(null);
    setReferralForm(emptyReferralForm);
    setReferralMessage(null);
    setReferralResults([]);
  };

  const closeReferralForm = () => {
    if (referralBusy) return;
    setActiveReferralCallId(null);
    setReferralForm(emptyReferralForm);
    setReferralMessage(null);
    setReferralResults([]);
  };

  const submitQuote = async (call: PartnerCall) => {
    setQuoteBusy(true);
    setQuoteMessage(null);
    try {
      const isEdit = editingQuote && call.my_quote?.source === "member";
      const res = await fetch("/api/partner/quotes", {
        method: isEdit ? "PATCH" : "POST",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          application_id: call.id,
          price: quoteForm.price,
          support_discount_amount: supportDiscountFor(
            call,
            quoteForm.supportDiscountAmount,
          ),
          support_settlement_type: quoteForm.supportSettlementType,
          sponsor_discounted_price: discountedPriceFor(
            call,
            quoteForm.price,
            quoteForm.supportDiscountAmount,
          ),
          vehicle_type: quoteForm.vehicleType,
          available_time: quoteForm.availableTime,
          message: quoteForm.message,
        }),
      });
      const json = (await res.json()) as {
        error?: string;
        quote_type?: "guest" | "member";
        quote?: { id?: string; price?: number | null };
      };
      if (!res.ok) {
        if (json.error === "already_quoted") {
          setQuoteMessage("이미 이 견적요청에 견적서를 제출했습니다.");
          void loadCalls();
          return;
        }
        setQuoteMessage(json.error ?? "견적 제출에 실패했습니다.");
        return;
      }
      setQuoteMessage(isEdit ? "견적을 수정했습니다." : "견적을 제출했습니다.");
      setActiveQuoteCallId(null);
      setEditingQuote(false);
      setQuoteForm(emptyQuoteForm);
      void loadCalls();
    } catch (e) {
      setQuoteMessage(e instanceof Error ? e.message : String(e));
    } finally {
      setQuoteBusy(false);
    }
  };

  const submitReferral = async (call: PartnerCall) => {
    if (isQuoteClosed(call)) {
      setReferralMessage("이미 마감되었거나 매칭 완료된 견적입니다.");
      return;
    }
    setReferralBusy(true);
    setReferralMessage(null);
    setReferralResults([]);
    try {
      const phones = parseReferralPhones(referralForm.phones);
      const res = await fetch("/api/partner/quote-referrals", {
        method: "POST",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          application_id: call.id,
          phones,
        }),
      });
      const json = (await res.json()) as {
        error?: string;
        success_count?: number;
        fail_count?: number;
        skipped_count?: number;
        results?: ReferralResult[];
      };
      if (!res.ok) {
        setReferralMessage(
          json.error === "quote_closed"
            ? "이미 마감되었거나 매칭 완료된 견적입니다."
            : (json.error ?? "문자 발송에 실패했습니다."),
        );
        return;
      }
      setReferralResults(Array.isArray(json.results) ? json.results : []);
      setReferralMessage(
        `발송 ${json.success_count ?? 0}건 · 실패 ${json.fail_count ?? 0}건 · 중복 ${json.skipped_count ?? 0}건`,
      );
      if ((json.success_count ?? 0) > 0) {
        setReferralForm(emptyReferralForm);
      }
    } catch (e) {
      setReferralMessage(e instanceof Error ? e.message : String(e));
    } finally {
      setReferralBusy(false);
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
    <main className="min-h-screen bg-gradient-to-b from-sky-50 to-[#f3f8fb] px-5 pb-16 pt-10">
      <style>{`
        @keyframes partner-new-call-glow {
          0% {
            box-shadow: 0 0 0 0 rgba(37, 99, 235, 0.45), 0 18px 45px rgba(15, 23, 42, 0.08);
            transform: translateY(-2px);
          }
          45% {
            box-shadow: 0 0 0 8px rgba(37, 99, 235, 0.18), 0 22px 55px rgba(37, 99, 235, 0.16);
          }
          100% {
            box-shadow: 0 0 0 0 rgba(37, 99, 235, 0), 0 1px 3px rgba(15, 23, 42, 0.08);
            transform: translateY(0);
          }
        }
      `}</style>
      <div className="mx-auto max-w-3xl">
        <div className="rounded-[2rem] border border-slate-200/90 bg-white px-5 py-6 shadow-[0_18px_45px_rgba(15,23,42,0.1)] sm:px-7">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <p className="text-xs font-bold uppercase tracking-[0.14em] text-blue-600">
                제휴 기사
              </p>
              <h1 className="mt-2 text-2xl font-black tracking-[-0.04em] text-slate-900">
                {PARTNER_DASHBOARD_TITLE}
              </h1>
              <p className="mt-2 text-sm font-semibold leading-relaxed text-slate-500">
                신규 견적 · 제출 견적 · 매칭 성공 단계별로 관리합니다. 매칭 전까지 고객
                연락처는 공개되지 않습니다.
              </p>
              {driverInfo ? (
                <div className="mt-3 rounded-2xl bg-blue-50 px-4 py-3 text-sm font-bold text-blue-950 ring-1 ring-blue-100">
                  <p className="text-xs font-black text-blue-600">로그인한 제휴기사</p>
                  <p className="mt-1">
                    {driverInfo.company_name || "업체명 미등록"} · {driverInfo.manager_name || "담당자 미등록"}
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
                onClick={() => void toggleSound()}
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
                onClick={() => void requestBrowserNotifications()}
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
                onClick={() => void loadCalls()}
                disabled={callsLoading}
                className="inline-flex min-h-10 items-center justify-center rounded-xl border border-slate-200 bg-white px-4 text-sm font-black text-slate-800 shadow-sm transition hover:bg-slate-50 disabled:opacity-50"
                style={tapStyle}
              >
                {callsLoading ? "새로고침 중…" : "새로고침"}
              </button>
              <button
                type="button"
                onClick={() => void handleLogout()}
                className="inline-flex min-h-10 items-center justify-center rounded-xl bg-slate-950 px-4 text-sm font-black text-white shadow-sm transition hover:bg-slate-900"
                style={tapStyle}
              >
                로그아웃
              </button>
            </div>
          </div>

          {newCallNoticeId ? (
            <div className="mt-5 rounded-2xl border border-blue-200 bg-blue-50 px-4 py-3 text-sm font-semibold text-blue-950">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <p className="font-black">새 견적요청이 도착했습니다.</p>
                <button
                  type="button"
                  onClick={() => {
                    scrollToCall(newCallNoticeId);
                    setNewCallNoticeId(null);
                  }}
                  className="min-h-10 rounded-xl bg-blue-600 px-4 text-sm font-black text-white shadow-sm"
                  style={tapStyle}
                >
                  확인하기
                </button>
              </div>
            </div>
          ) : null}

          <section className="mt-6 rounded-2xl border border-slate-200 bg-slate-50 p-4">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
              <div>
                <h2 className="text-sm font-black text-slate-900">
                  견적요청 수신지역 설정
                </h2>
                <p className="mt-1 text-xs font-semibold leading-5 text-slate-500">
                  선택한 지역의 출발 콜만 표시됩니다. 비워두면 모든 지역 콜을 표시합니다.
                </p>
              </div>
              <button
                type="button"
                onClick={() => void saveServiceRegions()}
                disabled={serviceRegionBusy || !serviceRegionsChanged}
                className="inline-flex min-h-10 items-center justify-center rounded-xl bg-slate-950 px-4 text-sm font-black text-white shadow-sm transition hover:bg-slate-900 disabled:opacity-50"
                style={tapStyle}
              >
                {serviceRegionBusy ? "저장 중…" : "수신지역 저장"}
              </button>
            </div>
            <div className="mt-4 flex flex-wrap gap-2">
              {SERVICE_REGIONS.map((region) => {
                const selected = serviceRegions.includes(region);
                return (
                  <button
                    key={region}
                    type="button"
                    onClick={() => toggleServiceRegion(region)}
                    className={`min-h-9 rounded-full border px-3 text-xs font-black transition ${
                      selected
                        ? "border-blue-600 bg-blue-600 text-white shadow-sm"
                        : "border-slate-200 bg-white text-slate-700 hover:bg-slate-50"
                    }`}
                    style={tapStyle}
                  >
                    {region}
                  </button>
                );
              })}
            </div>
            {serviceRegions.length === 0 ? (
              <p className="mt-3 rounded-xl bg-amber-50 px-3 py-2 text-xs font-bold leading-5 text-amber-900 ring-1 ring-amber-100">
                수신지역이 설정되지 않아 모든 지역 콜이 표시됩니다.
              </p>
            ) : null}
            {serviceRegionMessage ? (
              <p className="mt-3 rounded-xl bg-white px-3 py-2 text-xs font-bold leading-5 text-slate-700 ring-1 ring-slate-200">
                {serviceRegionMessage}
              </p>
            ) : null}
          </section>

          {callsError ? (
            <div
              className="mt-5 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-semibold leading-relaxed text-red-800"
              role="alert"
            >
              {callsError}
            </div>
          ) : null}

          {quoteMessage ? (
            <div
              className="mt-5 rounded-2xl border border-blue-200 bg-blue-50 px-4 py-3 text-sm font-semibold leading-relaxed text-blue-900"
              role="status"
            >
              {quoteMessage}
            </div>
          ) : null}

          {referralMessage ? (
            <div
              className="mt-5 rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-semibold leading-relaxed text-emerald-900"
              role="status"
            >
              {referralMessage}
            </div>
          ) : null}

          {quoteDetailCall?.my_quote ? (
            <div
              className="fixed inset-0 z-[120] flex items-center justify-center px-4 py-8"
              role="dialog"
              aria-modal="true"
              aria-labelledby="partner-quote-detail-title"
            >
              <button
                type="button"
                className="absolute inset-0 bg-slate-900/50 backdrop-blur-[2px]"
                aria-label="닫기"
                onClick={() => setQuoteDetailCall(null)}
              />
              <div className="relative max-h-[90vh] w-full max-w-md overflow-y-auto rounded-[1.75rem] bg-white p-6 shadow-2xl ring-1 ring-slate-200 sm:p-8">
                <h2
                  id="partner-quote-detail-title"
                  className="text-lg font-black tracking-[-0.04em] text-slate-950"
                >
                  내 견적 상세
                </h2>
                <p className="mt-1 text-xs font-bold text-slate-500">
                  {formatRouteWithStopovers(
                    quoteDetailCall.departure,
                    quoteDetailCall.stopovers,
                    quoteDetailCall.destination,
                  )}
                </p>
                <dl className="mt-4 space-y-3 text-sm">
                  <div className="rounded-xl bg-slate-50 p-3 ring-1 ring-slate-100">
                    <dt className="text-[11px] font-bold text-slate-400">
                      제출 방식
                    </dt>
                    <dd className="mt-1 font-black text-slate-900">
                      {quoteDetailCall.my_quote.source === "guest"
                        ? "일반기사 시 제출한 견적"
                        : "제휴기사 견적"}
                    </dd>
                  </div>
                  <div className="rounded-xl bg-slate-50 p-3 ring-1 ring-slate-100">
                    <dt className="text-[11px] font-bold text-slate-400">
                      {quoteDetailCall.my_quote.source === "guest"
                        ? "일반기사 제출가"
                        : "일반견적가"}
                    </dt>
                    <dd className="mt-1 font-black text-blue-900">
                      {formatPrice(quoteDetailCall.my_quote.price)}
                    </dd>
                  </div>
                  {quoteDetailCall.my_quote.source === "member" &&
                  quoteDetailCall.my_quote.sponsor_quote_enabled ? (
                    <div className="sm:col-span-2">
                      <SupportQuoteBreakdown
                        breakdown={quoteSupportBreakdown(quoteDetailCall.my_quote)}
                      />
                      <p className="mt-2 rounded-xl bg-amber-50 px-3 py-2 text-xs font-bold leading-5 text-amber-900 ring-1 ring-amber-100">
                        후원업체 확정 지원금 변경 시 아래 금액이 자동 재계산됩니다.
                      </p>
                    </div>
                  ) : null}
                  <div className="rounded-xl bg-slate-50 p-3 ring-1 ring-slate-100">
                    <dt className="text-[11px] font-bold text-slate-400">
                      차량유형
                    </dt>
                    <dd className="mt-1 font-semibold text-slate-800">
                      {quoteDetailCall.my_quote.vehicle_type}
                    </dd>
                  </div>
                  <div className="rounded-xl bg-slate-50 p-3 ring-1 ring-slate-100">
                    <dt className="text-[11px] font-bold text-slate-400">
                      가능 출발시간
                    </dt>
                    <dd className="mt-1 font-semibold text-slate-800">
                      {quoteDetailCall.my_quote.available_time}
                    </dd>
                  </div>
                  <div className="rounded-xl bg-slate-50 p-3 ring-1 ring-slate-100">
                    <dt className="text-[11px] font-bold text-slate-400">메모</dt>
                    <dd className="mt-1 whitespace-pre-wrap font-semibold text-slate-800">
                      {quoteDetailCall.my_quote.message.trim() === ""
                        ? "—"
                        : quoteDetailCall.my_quote.message}
                    </dd>
                  </div>
                  <div className="rounded-xl bg-slate-50 p-3 ring-1 ring-slate-100">
                    <dt className="text-[11px] font-bold text-slate-400">
                      제출일시
                    </dt>
                    <dd className="mt-1 font-semibold text-slate-800">
                      {formatSubmittedAt(quoteDetailCall.my_quote.created_at)}
                    </dd>
                  </div>
                  <div className="rounded-xl bg-slate-50 p-3 ring-1 ring-slate-100">
                    <dt className="text-[11px] font-bold text-slate-400">
                      견적 상태
                    </dt>
                    <dd className="mt-1 font-semibold text-slate-800">
                      {quoteDetailCall.my_quote.status}
                      {quoteDetailCall.my_quote.source === "guest" &&
                      quoteDetailCall.my_quote.match_result ? (
                        <span className="ml-2 text-xs font-bold text-slate-500">
                          (매칭: {quoteDetailCall.my_quote.match_result})
                        </span>
                      ) : null}
                    </dd>
                  </div>
                  <div
                    className={`rounded-xl p-3 ring-1 ${
                      quoteDetailCall.my_quote.source === "guest"
                        ? "bg-amber-50 ring-amber-100"
                        : "bg-blue-50 ring-blue-100"
                    }`}
                  >
                    <p
                      className={`text-xs font-semibold leading-5 ${
                        quoteDetailCall.my_quote.source === "guest"
                          ? "text-amber-900"
                          : "text-blue-900"
                      }`}
                    >
                      {quoteDetailCall.my_quote.source === "guest"
                        ? "일반기사 견적은 지원금 미적용가입니다. 제휴기사 전환 후 지원금 적용 견적을 다시 제출할 수 있습니다."
                        : "지원금 적용가는 후원사 심사 결과에 따라 변동 또는 거절될 수 있습니다."}
                    </p>
                  </div>
                </dl>
                <button
                  type="button"
                  className="mt-6 flex min-h-12 w-full items-center justify-center rounded-2xl bg-slate-900 text-sm font-black text-white shadow-sm"
                  style={tapStyle}
                  onClick={() => setQuoteDetailCall(null)}
                >
                  닫기
                </button>
              </div>
            </div>
          ) : null}

          {customerDetailCall ? (
            <div
              className="fixed inset-0 z-[120] flex items-center justify-center px-4 py-8"
              role="dialog"
              aria-modal="true"
              aria-labelledby="partner-customer-detail-title"
            >
              <button
                type="button"
                className="absolute inset-0 bg-slate-900/50 backdrop-blur-[2px]"
                aria-label="닫기"
                onClick={() => setCustomerDetailCall(null)}
              />
              <div className="relative max-h-[90vh] w-full max-w-md overflow-y-auto rounded-[1.75rem] bg-white p-6 shadow-2xl ring-1 ring-slate-200 sm:p-8">
                <h2
                  id="partner-customer-detail-title"
                  className="text-lg font-black tracking-[-0.04em] text-slate-950"
                >
                  고객정보 확인
                </h2>
                <p className="mt-1 text-xs font-bold text-slate-500">
                  {customerDetailCall.receipt_number || "신청번호 미정"}
                </p>
                <dl className="mt-4 space-y-3 text-sm">
                  <div className="rounded-xl bg-emerald-50 p-3 ring-1 ring-emerald-100">
                    <dt className="text-[11px] font-bold text-emerald-600">
                      고객명
                    </dt>
                    <dd className="mt-1 font-black text-emerald-950">
                      {customerDetailCall.customer_name || "—"}
                    </dd>
                  </div>
                  <div className="rounded-xl bg-emerald-50 p-3 ring-1 ring-emerald-100">
                    <dt className="text-[11px] font-bold text-emerald-600">
                      고객 전화번호
                    </dt>
                    <dd className="mt-2">
                      {customerDetailCall.customer_phone ? (
                        <div className="flex flex-col gap-2">
                          <p className="font-black text-emerald-950">
                            {customerDetailCall.customer_phone}
                          </p>
                          <div className="flex gap-2">
                            <a
                              href={`tel:${customerDetailCall.customer_phone}`}
                              className="inline-flex min-h-10 items-center justify-center rounded-xl bg-emerald-600 px-3 text-sm font-black text-white"
                              style={tapStyle}
                            >
                              전화하기
                            </a>
                            <a
                              href={`sms:${customerDetailCall.customer_phone}`}
                              className="inline-flex min-h-10 items-center justify-center rounded-xl border border-emerald-200 bg-white px-3 text-sm font-black text-emerald-900"
                              style={tapStyle}
                            >
                              문자보내기
                            </a>
                          </div>
                        </div>
                      ) : (
                        <span className="font-semibold text-slate-400">—</span>
                      )}
                    </dd>
                  </div>
                  <div className="rounded-xl bg-slate-50 p-3 ring-1 ring-slate-100">
                    <dt className="text-[11px] font-bold text-slate-400">출발지</dt>
                    <dd className="mt-1 font-semibold text-slate-800">
                      {customerDetailCall.departure}
                    </dd>
                  </div>
                  {formatStopovers(customerDetailCall.stopovers) ? (
                    <div className="rounded-xl bg-slate-50 p-3 ring-1 ring-slate-100">
                      <dt className="text-[11px] font-bold text-slate-400">
                        경유지
                      </dt>
                      <dd className="mt-1 font-semibold text-slate-800">
                        {formatStopovers(customerDetailCall.stopovers)}
                      </dd>
                    </div>
                  ) : null}
                  <div className="rounded-xl bg-slate-50 p-3 ring-1 ring-slate-100">
                    <dt className="text-[11px] font-bold text-slate-400">도착지</dt>
                    <dd className="mt-1 font-semibold text-slate-800">
                      {customerDetailCall.destination}
                    </dd>
                  </div>
                  <div className="rounded-xl bg-slate-50 p-3 ring-1 ring-slate-100">
                    <dt className="text-[11px] font-bold text-slate-400">
                      출발일시
                    </dt>
                    <dd className="mt-1 font-semibold text-slate-800">
                      {formatDeparture(customerDetailCall)}
                    </dd>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div className="rounded-xl bg-slate-50 p-3 ring-1 ring-slate-100">
                      <dt className="text-[11px] font-bold text-slate-400">
                        인원수
                      </dt>
                      <dd className="mt-1 font-semibold text-slate-800">
                        {customerDetailCall.passenger_count ?? "—"}
                      </dd>
                    </div>
                    <div className="rounded-xl bg-slate-50 p-3 ring-1 ring-slate-100">
                      <dt className="text-[11px] font-bold text-slate-400">
                        운행
                      </dt>
                      <dd className="mt-1 font-semibold text-slate-800">
                        {customerDetailCall.trip_type}
                      </dd>
                    </div>
                    <div className="rounded-xl bg-slate-50 p-3 ring-1 ring-slate-100">
                      <dt className="text-[11px] font-bold text-slate-400">
                        차량등급
                      </dt>
                      <dd className="mt-1 font-semibold text-slate-800">
                        {customerDetailCall.bus_grade}
                      </dd>
                    </div>
                    <div className="rounded-xl bg-slate-50 p-3 ring-1 ring-slate-100">
                      <dt className="text-[11px] font-bold text-slate-400">
                        지원금 상태
                      </dt>
                      <dd className="mt-1 font-semibold text-slate-800">
                        {customerDetailCall.sponsor_support_status === "approved"
                          ? "확정 지원금"
                          : customerDetailCall.sponsor_support_status === "rejected"
                            ? "지원금 미승인 또는 조건 불일치"
                            : customerDetailCall.sponsor_support_status === "preapproved"
                              ? "예상 지원금"
                              : customerDetailCall.final_selected_quote_id.trim() !== ""
                                ? "매칭 성공"
                                : "예상 지원금 검토"}
                        {customerDetailCall.sponsor_approved_support_amount != null ? (
                          <span className="ml-2 text-xs font-black text-blue-700">
                            {formatPrice(customerDetailCall.sponsor_approved_support_amount)}
                          </span>
                        ) : null}
                      </dd>
                    </div>
                  </div>
                  <div className="rounded-xl bg-slate-50 p-3 ring-1 ring-slate-100">
                    <dt className="text-[11px] font-bold text-slate-400">
                      요청사항
                    </dt>
                    <dd className="mt-1 whitespace-pre-wrap font-semibold text-slate-800">
                      {customerDetailCall.request_message?.trim()
                        ? customerDetailCall.request_message
                        : "—"}
                    </dd>
                  </div>
                </dl>
                <button
                  type="button"
                  className="mt-6 flex min-h-12 w-full items-center justify-center rounded-2xl bg-slate-900 text-sm font-black text-white shadow-sm"
                  style={tapStyle}
                  onClick={() => setCustomerDetailCall(null)}
                >
                  닫기
                </button>
              </div>
            </div>
          ) : null}

          <div className="mt-6">
            <div className="-mx-1 overflow-x-auto px-1 pb-2">
              <div className="flex min-w-max gap-2">
                {PARTNER_DASHBOARD_TABS.map((tab) => {
                  const selected = activeTab === tab.id;
                  return (
                    <button
                      key={tab.id}
                      type="button"
                      onClick={() => {
                        setActiveTab(tab.id);
                        setActiveQuoteCallId(null);
                        setActiveReferralCallId(null);
                      }}
                      className={`min-h-11 shrink-0 rounded-2xl border px-4 text-sm font-black transition ${
                        selected
                          ? "border-blue-600 bg-blue-600 text-white shadow-sm shadow-blue-900/20"
                          : "border-slate-200 bg-white text-slate-700 hover:bg-slate-50"
                      }`}
                      style={tapStyle}
                    >
                      {tab.label} ({tabCounts[tab.id]})
                    </button>
                  );
                })}
              </div>
            </div>
          </div>

          {activeTab === "matched" ? (
            <div className="mt-3 -mx-1 overflow-x-auto px-1 pb-1">
              <div className="flex min-w-max gap-2">
                {MATCHED_RUN_FILTERS.map((filter) => {
                  const selected = matchedSubTab === filter.id;
                  return (
                    <button
                      key={filter.id}
                      type="button"
                      onClick={() => setMatchedSubTab(filter.id)}
                      className={`min-h-9 shrink-0 rounded-xl border px-3 text-xs font-black transition ${
                        selected
                          ? "border-emerald-600 bg-emerald-600 text-white"
                          : "border-slate-200 bg-white text-slate-700"
                      }`}
                      style={tapStyle}
                    >
                      {filter.label}
                    </button>
                  );
                })}
              </div>
            </div>
          ) : null}

          <div className="mt-4 space-y-4">
            {callsLoading && calls.length === 0 ? (
              <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-8 text-center text-sm font-semibold text-slate-500">
                견적 목록을 불러오는 중…
              </div>
            ) : visibleCalls.length === 0 ? (
              <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50 px-4 py-8 text-center">
                <p className="text-sm font-black text-slate-700">
                  {activeTabMeta.empty}
                </p>
                <p className="mt-1 text-xs font-semibold text-slate-500">
                  새 신청이 들어오면 새로고침으로 확인할 수 있습니다.
                </p>
              </div>
            ) : (
              visibleCalls.map((call) => (
                <PartnerCallCard
                  key={call.id}
                  call={call}
                  stage={activeTab}
                  expanded={expandedCallIds.has(call.id)}
                  onToggleExpand={() => toggleCallExpanded(call.id)}
                  highlighted={highlightedNewCallIds.has(call.id)}
                  quoteClosed={isQuoteClosed(call)}
                  formOpen={activeQuoteCallId === call.id}
                  referralOpen={activeReferralCallId === call.id}
                  quoteForm={quoteForm}
                  setQuoteForm={setQuoteForm}
                  onOpenQuoteForm={() =>
                    openQuoteForm(
                      call,
                      activeTab === "quoted" && call.my_quote?.source === "member",
                    )
                  }
                  onCloseQuoteForm={closeQuoteForm}
                  onOpenReferral={() => openReferralForm(call)}
                  onCloseReferral={closeReferralForm}
                  onSubmitQuote={() => void submitQuote(call)}
                  onSubmitReferral={() => void submitReferral(call)}
                  quoteBusy={quoteBusy}
                  referralBusy={referralBusy}
                  referralForm={referralForm}
                  setReferralForm={setReferralForm}
                  referralResults={referralResults}
                  referralPreview={buildReferralPreview(call)}
                  onOpenQuoteDetail={() => setQuoteDetailCall(call)}
                  onOpenCustomerDetail={() => setCustomerDetailCall(call)}
                  customerInfoVisible={canRevealCustomerInfo(call)}
                  isEditMode={editingQuote && activeQuoteCallId === call.id}
                />
              ))
            )}
          </div>

          <div className="mt-8 flex flex-col gap-3 sm:flex-row">
            <Link
              href="/"
              className="touch-manipulation inline-flex min-h-12 flex-1 items-center justify-center rounded-2xl border-2 border-slate-200 bg-white px-5 text-sm font-bold text-slate-800 shadow-sm transition hover:bg-slate-50"
              style={tapStyle}
            >
              메인으로
            </Link>
          </div>
        </div>
      </div>
    </main>
  );
}
