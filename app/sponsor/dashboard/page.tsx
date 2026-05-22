"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { useRouter } from "next/navigation";

import {
  SponsorCallCard,
  type SponsorCardForm,
} from "@/components/sponsor/SponsorCallCard";
import { SponsorReportCards } from "@/components/sponsor/SponsorReportCards";
import {
  SponsorSettingsRulePanel,
  type SponsorRuleFormState,
} from "@/components/sponsor/SponsorSettingsRulePanel";
import {
  SponsorSettingsStaffPanel,
  type SponsorStaffFormState,
} from "@/components/sponsor/SponsorSettingsStaffPanel";
import { roleLoginPath } from "@/lib/role-hosts";
import {
  isConfirmedCall,
  isReviewCall,
  matchesPayoutFilter,
  sponsorTabCounts,
  type SponsorCallRow,
  type SponsorSummary,
} from "@/lib/sponsor-call-view-model";
import {
  LABEL,
  labelWithCount,
  PAYOUT_FILTERS,
  SPONSOR_DASHBOARD_TITLE,
  SPONSOR_MAIN_TABS,
  type CardExpandMode,
  type ConfirmedPayoutFilter,
  type SponsorMainTab,
} from "@/lib/sponsor-dashboard-labels";
import {
  findDefaultRule,
  ruleSupportConditionLabel,
  ruleSupportFormLabel,
  type SponsorRuleRecord,
} from "@/lib/sponsor-rule-helpers";
import { safeText } from "@/lib/sponsor";
import { createSponsorBrowserClient } from "@/lib/supabase";
import {
  realtimeStatusLabel,
  useSupabaseRealtimeRefresh,
} from "@/hooks/useSupabaseRealtimeRefresh";

const SPONSOR_NOTIFICATION_SOUND_PREF_KEY = "sponsorDashboardSoundEnabled";
const tapStyle = { WebkitTapHighlightColor: "transparent" } as const;

type Rule = Record<string, unknown> & { id: string; title?: string; is_active?: boolean };
type Staff = Record<string, unknown> & {
  id: string;
  name?: string;
  phone?: string;
  role?: string;
  is_active?: boolean;
};

type SettingsSubTab = "rules" | "staff";

function defaultFormFromCall(
  call: SponsorCallRow,
  rules: SponsorRuleRecord[],
): SponsorCardForm {
  const defaultRule = findDefaultRule(rules);
  return {
    ruleId: call.sponsor_rule_id || defaultRule?.id || "",
    amount: String(call.approved_support_amount ?? call.estimated_support_amount ?? ""),
    staffId: call.assigned_staff_id ?? "",
    memo: call.decision_memo ?? "",
  };
}

export default function SponsorDashboardPage() {
  const router = useRouter();
  const [mainTab, setMainTab] = useState<SponsorMainTab>("review");
  const [payoutFilter, setPayoutFilter] = useState<ConfirmedPayoutFilter>("all");
  const [settingsSubTab, setSettingsSubTab] = useState<SettingsSubTab>("rules");
  const [customerDetailCall, setCustomerDetailCall] = useState<SponsorCallRow | null>(null);
  const [settingsBusy, setSettingsBusy] = useState(false);
  const [company, setCompany] = useState<Record<string, unknown> | null>(null);
  const [rules, setRules] = useState<Rule[]>([]);
  const [staff, setStaff] = useState<Staff[]>([]);
  const [calls, setCalls] = useState<SponsorCallRow[]>([]);
  const [summary, setSummary] = useState<SponsorSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [soundEnabled, setSoundEnabled] = useState(false);
  const [notificationPermission, setNotificationPermission] = useState<
    NotificationPermission | "unsupported"
  >("default");
  const [expandByCallId, setExpandByCallId] = useState<Record<string, CardExpandMode>>({});
  const [formsByCallId, setFormsByCallId] = useState<Record<string, SponsorCardForm>>({});
  const [busyCallId, setBusyCallId] = useState<string | null>(null);
  const [ruleForm, setRuleForm] = useState<SponsorRuleFormState>({
    id: "",
    title: "",
    support_per_person: "",
    support_per_case: "",
    max_support_amount: "",
    min_passenger_count: "",
    target_groups: [],
    support_type: "cash",
    support_condition: "홍보시",
  });
  const [staffForm, setStaffForm] = useState<SponsorStaffFormState>({
    id: "",
    name: "",
    phone: "",
    email: "",
    role: "",
    service_regions: [],
  });
  const callIdsRef = useRef<Set<string>>(new Set());
  const audioContextRef = useRef<AudioContext | null>(null);
  const soundEnabledRef = useRef(false);
  const notificationPermissionRef = useRef<NotificationPermission | "unsupported">("default");

  useEffect(() => {
    soundEnabledRef.current = soundEnabled;
  }, [soundEnabled]);

  useEffect(() => {
    notificationPermissionRef.current = notificationPermission;
  }, [notificationPermission]);

  const load = useCallback(async () => {
    setLoading(true);
    setMessage(null);
    try {
      const res = await fetch("/api/sponsor/dashboard", { credentials: "same-origin" });
      const json = (await res.json()) as {
        error?: string;
        approved?: boolean;
        company?: Record<string, unknown>;
        rules?: Rule[];
        staff?: Staff[];
        calls?: SponsorCallRow[];
        summary?: SponsorSummary | null;
      };
      if (!res.ok) {
        if ([401, 403, 404].includes(res.status)) {
          const supabase = createSponsorBrowserClient();
          await supabase.auth.signOut();
          router.replace(roleLoginPath("sponsor"));
          return;
        }
        setMessage(json.error ?? "후원업체 정보를 불러오지 못했습니다.");
        return;
      }
      setCompany(json.company ?? null);
      if (!json.approved) {
        setMessage("관리자 승인 후 후원업체 대시보드를 이용할 수 있습니다.");
        setRules([]);
        setStaff([]);
        setCalls([]);
        setSummary(null);
        return;
      }
      setRules(Array.isArray(json.rules) ? json.rules : []);
      setStaff(Array.isArray(json.staff) ? json.staff : []);
      const nextCalls = Array.isArray(json.calls) ? json.calls : [];
      const previousIds = callIdsRef.current;
      if (previousIds.size > 0 && nextCalls.some((call) => !previousIds.has(call.id))) {
        setToast(LABEL.newReviewToast);
        if (soundEnabledRef.current && audioContextRef.current) {
          try {
            const osc = audioContextRef.current.createOscillator();
            const gain = audioContextRef.current.createGain();
            osc.connect(gain);
            gain.connect(audioContextRef.current.destination);
            osc.frequency.value = 880;
            gain.gain.value = 0.08;
            osc.start();
            osc.stop(audioContextRef.current.currentTime + 0.12);
          } catch {
            /* ignore */
          }
        }
        if (notificationPermissionRef.current === "granted" && typeof window !== "undefined") {
          try {
            new window.Notification(SPONSOR_DASHBOARD_TITLE, {
              body: LABEL.newReviewToast,
            });
          } catch {
            /* ignore */
          }
        }
      }
      callIdsRef.current = new Set(nextCalls.map((call) => call.id));
      setCalls(nextCalls);
      setSummary(json.summary ?? null);
    } catch (e) {
      setMessage(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, [router]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    try {
      setSoundEnabled(
        window.localStorage.getItem(SPONSOR_NOTIFICATION_SOUND_PREF_KEY) === "1",
      );
      setNotificationPermission(
        "Notification" in window ? window.Notification.permission : "unsupported",
      );
    } catch {
      /* ignore */
    }
  }, []);

  const realtimeStatus = useSupabaseRealtimeRefresh({
    channelName: "sponsor-dashboard-live",
    tables: ["sponsor_preapprovals"],
    enabled: company != null && safeText(company.status) === "approved",
    debounceMs: 800,
    onRefresh: load,
  });

  useEffect(() => {
    if (!toast) return;
    const id = window.setTimeout(() => setToast(null), 3200);
    return () => window.clearTimeout(id);
  }, [toast]);

  const tabCounts = useMemo(() => sponsorTabCounts(calls), [calls]);

  const reviewCalls = useMemo(
    () => calls.filter((call) => isReviewCall(call)),
    [calls],
  );

  const confirmedCalls = useMemo(
    () =>
      calls
        .filter((call) => isConfirmedCall(call))
        .filter((call) => matchesPayoutFilter(call, payoutFilter)),
    [calls, payoutFilter],
  );

  const sponsorRules = useMemo(
    () => rules as SponsorRuleRecord[],
    [rules],
  );

  const getForm = (call: SponsorCallRow) =>
    formsByCallId[call.id] ?? defaultFormFromCall(call, sponsorRules);

  const patchForm = (callId: string, call: SponsorCallRow, patch: Partial<SponsorCardForm>) => {
    setFormsByCallId((prev) => ({
      ...prev,
      [callId]: { ...(prev[callId] ?? defaultFormFromCall(call, sponsorRules)), ...patch },
    }));
  };

  const toggleExpand = (callId: string, mode: CardExpandMode) => {
    setExpandByCallId((prev) => {
      const current = prev[callId];
      if (current === mode) {
        const next = { ...prev };
        delete next[callId];
        return next;
      }
      return { ...prev, [callId]: mode };
    });
  };

  const resolveRuleForForm = (form: SponsorCardForm): SponsorRuleRecord | null =>
    sponsorRules.find((r) => r.id === form.ruleId) ?? null;

  const buildApprovePayload = (form: SponsorCardForm) => {
    const rule = resolveRuleForForm(form);
    return {
      approved_support_amount: form.amount,
      assigned_staff_id: form.staffId,
      decision_memo: form.memo,
      sponsor_rule_id: form.ruleId,
      support_kind: safeText(rule?.title),
      support_form_kind: rule ? ruleSupportFormLabel(rule) : "",
      support_condition_label: rule ? ruleSupportConditionLabel(rule) : "",
    };
  };

  const postPreapproval = async (
    callId: string,
    action: string,
    body: Record<string, unknown>,
  ) => {
    setBusyCallId(callId);
    setMessage(null);
    try {
      const res = await fetch("/api/sponsor/preapprovals/update", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "same-origin",
        body: JSON.stringify({ action, preapproval_id: callId, ...body }),
      });
      const json = (await res.json().catch(() => null)) as { error?: string } | null;
      if (!res.ok) {
        setMessage(json?.error ?? "처리에 실패했습니다.");
        return;
      }
      setExpandByCallId((prev) => {
        const next = { ...prev };
        delete next[callId];
        return next;
      });
      await load();
    } finally {
      setBusyCallId(null);
    }
  };

  const saveRule = async () => {
    setSettingsBusy(true);
    try {
      const res = await fetch("/api/sponsor/dashboard", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "same-origin",
        body: JSON.stringify({ type: "rule", id: ruleForm.id, payload: ruleForm }),
      });
      const json = (await res.json().catch(() => null)) as { error?: string } | null;
      if (!res.ok) {
        setMessage(json?.error ?? "지원종류 저장에 실패했습니다.");
        return;
      }
      await load();
    } finally {
      setSettingsBusy(false);
    }
  };

  const deleteRule = async (id: string) => {
    setSettingsBusy(true);
    try {
      const res = await fetch("/api/sponsor/dashboard", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "same-origin",
        body: JSON.stringify({ type: "rule_delete", id }),
      });
      const json = (await res.json().catch(() => null)) as { error?: string } | null;
      if (!res.ok) {
        setMessage(json?.error ?? "삭제에 실패했습니다.");
        return;
      }
      setRuleForm({
        id: "",
        title: "",
        support_per_person: "",
        support_per_case: "",
        max_support_amount: "",
        min_passenger_count: "",
        target_groups: [],
        support_type: "cash",
        support_condition: "홍보시",
      });
      await load();
    } finally {
      setSettingsBusy(false);
    }
  };

  const saveStaff = async () => {
    setSettingsBusy(true);
    try {
      const res = await fetch("/api/sponsor/dashboard", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "same-origin",
        body: JSON.stringify({
          type: "staff",
          id: staffForm.id,
          payload: { ...staffForm, is_active: true },
        }),
      });
      const json = (await res.json().catch(() => null)) as { error?: string } | null;
      if (!res.ok) {
        setMessage(json?.error ?? "담당자 저장에 실패했습니다.");
        return;
      }
      setStaffForm({
        id: "",
        name: "",
        phone: "",
        email: "",
        role: "",
        service_regions: [],
      });
      await load();
    } finally {
      setSettingsBusy(false);
    }
  };

  const deleteStaff = async (id: string) => {
    setSettingsBusy(true);
    try {
      const res = await fetch("/api/sponsor/dashboard", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "same-origin",
        body: JSON.stringify({ type: "staff_delete", id }),
      });
      const json = (await res.json().catch(() => null)) as { error?: string } | null;
      if (!res.ok) {
        setMessage(json?.error ?? "삭제에 실패했습니다.");
        return;
      }
      setStaffForm({
        id: "",
        name: "",
        phone: "",
        email: "",
        role: "",
        service_regions: [],
      });
      await load();
    } finally {
      setSettingsBusy(false);
    }
  };

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
      window.localStorage.setItem(SPONSOR_NOTIFICATION_SOUND_PREF_KEY, next ? "1" : "0");
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

  const logout = async () => {
    const supabase = createSponsorBrowserClient();
    await supabase.auth.signOut();
    router.replace(roleLoginPath("sponsor"));
  };

  const settingsLinks: Array<{ id: SettingsSubTab; label: string }> = [
    { id: "rules", label: LABEL.settingsSupportKinds },
    { id: "staff", label: LABEL.settingsStaff },
  ];

  const listCalls = mainTab === "review" ? reviewCalls : confirmedCalls;

  return (
    <main className="min-h-screen bg-gradient-to-b from-sky-50 to-[#f3f8fb] px-4 py-6 pb-16 sm:px-5">
      {toast ? (
        <div className="fixed left-1/2 top-4 z-[120] w-[min(calc(100vw-2rem),24rem)] -translate-x-1/2 rounded-2xl bg-white px-4 py-3 text-center text-sm font-black text-blue-900 shadow-xl ring-1 ring-blue-100">
          {toast}
        </div>
      ) : null}
      <section className="mx-auto max-w-3xl">
        <div className="rounded-[2rem] border border-slate-200/90 bg-white p-5 shadow-sm ring-1 ring-slate-100 sm:p-6">
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
                {realtimeStatusLabel(realtimeStatus)}
              </span>
              <button
                type="button"
                onClick={() => void toggleSound()}
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
                onClick={() => void requestBrowserNotifications()}
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
                onClick={() => void load()}
                disabled={loading}
                className="min-h-10 rounded-xl border border-slate-200 bg-white px-3 text-xs font-black text-slate-800 disabled:opacity-50"
                style={tapStyle}
              >
                {loading ? LABEL.loading : LABEL.refresh}
              </button>
              <button
                type="button"
                onClick={() => void logout()}
                className="min-h-10 rounded-xl bg-slate-950 px-3 text-xs font-black text-white"
                style={tapStyle}
              >
                {LABEL.logout}
              </button>
            </div>
          </div>

          <SponsorReportCards summary={summary} />

          {message ? (
            <p className="mt-4 rounded-2xl bg-amber-50 px-4 py-3 text-sm font-bold text-amber-900">
              {message}
            </p>
          ) : null}

          <div className="mt-5 flex flex-wrap gap-2">
            {SPONSOR_MAIN_TABS.map((tab) => {
              const tabLabel =
                tab.id === "review"
                  ? labelWithCount(tab.label, tabCounts.review)
                  : tab.id === "confirmed"
                    ? labelWithCount(tab.label, tabCounts.confirmed)
                    : tab.label;
              return (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => setMainTab(tab.id)}
                  className={`min-h-10 shrink-0 whitespace-nowrap rounded-xl px-3 text-xs font-black sm:px-4 sm:text-sm ${
                    mainTab === tab.id ? "bg-blue-600 text-white" : "bg-slate-100 text-slate-700"
                  }`}
                  style={tapStyle}
                >
                  {tabLabel}
                </button>
              );
            })}
          </div>

          {mainTab === "settings" ? (
            <div className="mt-4 flex flex-wrap gap-2">
              {settingsLinks.map((link) => (
                <button
                  key={link.id}
                  type="button"
                  onClick={() => setSettingsSubTab(link.id)}
                  className={`min-h-9 rounded-full px-3 text-xs font-black ${
                    settingsSubTab === link.id
                      ? "bg-slate-900 text-white"
                      : "bg-slate-100 text-slate-700"
                  }`}
                >
                  {link.label}
                </button>
              ))}
            </div>
          ) : null}

          {mainTab === "confirmed" ? (
            <div className="mt-4 flex flex-wrap gap-2">
              {PAYOUT_FILTERS.map((f) => {
                const count =
                  f.id === "all"
                    ? tabCounts.payoutAll
                    : f.id === "processing"
                      ? tabCounts.payoutProcessing
                      : tabCounts.payoutCompleted;
                return (
                  <button
                    key={f.id}
                    type="button"
                    onClick={() => setPayoutFilter(f.id)}
                    className={`min-h-9 shrink-0 whitespace-nowrap rounded-full px-3 text-xs font-black ${
                      payoutFilter === f.id
                        ? "bg-violet-600 text-white"
                        : "bg-slate-100 text-slate-700"
                    }`}
                    style={tapStyle}
                  >
                    {labelWithCount(f.label, count)}
                  </button>
                );
              })}
            </div>
          ) : null}
        </div>

        {mainTab === "review" || mainTab === "confirmed" ? (
          <div className="mt-5 space-y-3">
            {loading ? (
              <p className="rounded-2xl bg-white p-8 text-center text-sm font-bold text-slate-500">
                {LABEL.loading}
              </p>
            ) : listCalls.length === 0 ? (
              <p className="rounded-2xl bg-white p-8 text-center text-sm font-bold text-slate-500">
                {mainTab === "review" ? LABEL.noReviewItems : LABEL.noConfirmedItems}
              </p>
            ) : (
              listCalls.map((call) => {
                const expandMode = expandByCallId[call.id] ?? null;
                const listMode = mainTab === "review" ? "review" : "confirmed";
                const toggleMode: CardExpandMode =
                  listMode === "review" ? "support_input" : "edit";
                return (
                  <SponsorCallCard
                    key={call.id}
                    call={call}
                    sponsorRule={
                      rules.find((r) => r.id === call.sponsor_rule_id) ?? null
                    }
                    listMode={listMode}
                    expandMode={expandMode}
                    onToggleExpand={() => {
                      if (!expandMode) {
                        setFormsByCallId((prev) => ({
                          ...prev,
                          [call.id]: prev[call.id] ?? defaultFormFromCall(call, sponsorRules),
                        }));
                      }
                      toggleExpand(call.id, toggleMode);
                    }}
                    form={getForm(call)}
                    onFormChange={(patch) => patchForm(call.id, call, patch)}
                    rules={sponsorRules}
                    staff={staff}
                    busy={busyCallId === call.id}
                    onOpenCustomerInfo={() => setCustomerDetailCall(call)}
                    onSubmitConfirm={() => {
                      const form = getForm(call);
                      const action =
                        listMode === "review" ? "approve" : "change";
                      void postPreapproval(call.id, action, buildApprovePayload(form));
                    }}
                  />
                );
              })
            )}
          </div>
        ) : null}

        {customerDetailCall ? (
          <div
            className="fixed inset-0 z-[120] flex items-center justify-center px-4 py-8"
            role="dialog"
            aria-modal="true"
          >
            <button
              type="button"
              className="absolute inset-0 bg-slate-900/50 backdrop-blur-[2px]"
              aria-label="닫기"
              onClick={() => setCustomerDetailCall(null)}
            />
            <div className="relative w-full max-w-md rounded-[1.75rem] bg-white p-6 shadow-2xl ring-1 ring-slate-200">
              <h2 className="text-lg font-black text-slate-950">{LABEL.customerInfoTitle}</h2>
              <dl className="mt-4 space-y-3 text-sm">
                <div className="rounded-xl bg-emerald-50 p-3 ring-1 ring-emerald-100">
                  <dt className="text-[11px] font-bold text-emerald-700">{LABEL.customer}</dt>
                  <dd className="mt-1 font-black">
                    {customerDetailCall.customer_name || LABEL.dash}
                  </dd>
                  <dd className="mt-1 font-semibold">
                    {customerDetailCall.customer_phone || LABEL.dash}
                  </dd>
                </div>
                <div className="rounded-xl bg-blue-50 p-3 ring-1 ring-blue-100">
                  <dt className="text-[11px] font-bold text-blue-700">{LABEL.driverInfo}</dt>
                  <dd className="mt-1 font-black">
                    {customerDetailCall.driver_name || LABEL.dash}
                  </dd>
                  <dd className="mt-1 font-semibold">
                    {customerDetailCall.driver_phone || LABEL.dash}
                  </dd>
                </div>
              </dl>
              <button
                type="button"
                className="mt-6 min-h-12 w-full rounded-2xl bg-slate-900 text-sm font-black text-white"
                onClick={() => setCustomerDetailCall(null)}
              >
                닫기
              </button>
            </div>
          </div>
        ) : null}

        {mainTab === "settings" && settingsSubTab === "rules" ? (
          <SponsorSettingsRulePanel
            rules={rules}
            form={ruleForm}
            setForm={setRuleForm}
            onSave={() => void saveRule()}
            onDelete={(id) => void deleteRule(id)}
            busy={settingsBusy}
          />
        ) : null}
        {mainTab === "settings" && settingsSubTab === "staff" ? (
          <SponsorSettingsStaffPanel
            staff={staff}
            form={staffForm}
            setForm={setStaffForm}
            onSave={() => void saveStaff()}
            onDelete={(id) => void deleteStaff(id)}
            busy={settingsBusy}
          />
        ) : null}
      </section>
    </main>
  );
}
