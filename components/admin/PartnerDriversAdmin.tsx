"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";

import * as XLSX from "xlsx";

import {
  normalizePartnerDrivers,
  type PartnerDriverDetail,
} from "@/lib/partner-drivers-admin";
import { createSupabaseClient } from "@/lib/supabase";

const PARTNER_STATUS_OPTIONS = [
  { value: "pending", label: "접수완료" },
  { value: "reviewing", label: "검토중" },
  { value: "approved", label: "승인완료" },
  { value: "rejected", label: "반려" },
] as const;

type PartnerStatusValue = (typeof PARTNER_STATUS_OPTIONS)[number]["value"];

function parsePartnerStatus(raw: string): PartnerStatusValue | null {
  const n = raw.trim().toLowerCase();
  if (n === "approve" || n === "approved") return "approved";
  if (n === "reject" || n === "rejected" || n === "denied") return "rejected";
  if (n === "reviewing" || n === "review") return "reviewing";
  if (n === "pending") return "pending";
  return null;
}

function coercePartnerStatus(raw: string): PartnerStatusValue {
  return parsePartnerStatus(raw) ?? "pending";
}

function statusLabelForSearch(raw: string): string {
  const known = parsePartnerStatus(raw);
  if (known === "pending") return "접수완료";
  if (known === "reviewing") return "검토중";
  if (known === "approved") return "승인완료";
  if (known === "rejected") return "반려";
  return raw.trim();
}

function statusLabelForExport(raw: string): string {
  return statusLabelForSearch(raw);
}

function formatCreatedAt(iso: string | null): string {
  if (iso == null || iso === "") return "—";
  try {
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return iso;
    return d.toLocaleString("ko-KR", {
      dateStyle: "medium",
      timeStyle: "short",
    });
  } catch {
    return iso;
  }
}

function ymdTodayLocal(): string {
  const d = new Date();
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

function PartnerEmailDisplay({ email }: { email: string }) {
  const t = email.trim();
  if (t === "" || t === "—") {
    return (
      <span className="inline-flex items-center rounded-full border border-slate-200 bg-slate-100 px-2 py-0.5 text-xs font-bold text-slate-600">
        이메일 없음 / 휴대폰 계정 사용 가능
      </span>
    );
  }
  return <span className="line-clamp-2 break-all">{email}</span>;
}

function PartnerStatusBadge({ status }: { status: string }) {
  const trimmed = status.trim();
  if (trimmed === "" || trimmed === "—") {
    return (
      <span className="inline-flex items-center rounded-full border border-slate-200 bg-slate-50 px-2.5 py-0.5 text-xs font-semibold text-slate-600 ring-1 ring-slate-100">
        —
      </span>
    );
  }
  const known = parsePartnerStatus(trimmed);
  let label: string;
  let className: string;
  if (known === null) {
    label = trimmed;
    className = "border-slate-200 bg-slate-50 text-slate-700 ring-slate-100";
  } else if (known === "pending") {
    label = "접수완료";
    className = "border-blue-200 bg-blue-50 text-blue-800 ring-blue-100";
  } else if (known === "reviewing") {
    label = "검토중";
    className = "border-amber-300 bg-amber-50 text-amber-950 ring-amber-100";
  } else if (known === "approved") {
    label = "승인완료";
    className = "border-emerald-300 bg-emerald-50 text-emerald-900 ring-emerald-100";
  } else {
    label = "반려";
    className = "border-red-200 bg-red-50 text-red-800 ring-red-100";
  }
  return (
    <span
      className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold ring-1 ${className}`}
    >
      {label}
    </span>
  );
}

function PartnerReferralBadge({ row }: { row: PartnerDriverDetail }) {
  const mismatch = row.referral_source.trim() === "quote_referral_phone_mismatch";
  const referred =
    mismatch ||
    row.referral_source.trim() === "quote_referral" ||
    row.referrer_partner_driver_id.trim() !== "";
  return (
    <span
      className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold ring-1 ${
        mismatch
          ? "border-amber-200 bg-amber-50 text-amber-800 ring-amber-100"
          : referred
          ? "border-emerald-200 bg-emerald-50 text-emerald-800 ring-emerald-100"
          : "border-slate-200 bg-slate-50 text-slate-600 ring-slate-100"
      }`}
    >
      {mismatch ? "추천보류" : referred ? "추천가입" : "일반가입"}
    </span>
  );
}

function referralSourceLabel(source: string): string {
  const trimmed = source.trim();
  if (trimmed === "quote_referral") return "견적요청 추천";
  if (trimmed === "quote_referral_phone_mismatch") {
    return "추천 링크 전화번호 불일치";
  }
  return trimmed === "" ? "—" : trimmed;
}

function referralStatusLabel(row: PartnerDriverDetail): string {
  if (row.referral_source.trim() === "quote_referral_phone_mismatch") {
    return "추천인 자동등록 보류";
  }
  if (
    row.referral_source.trim() === "quote_referral" ||
    row.referrer_partner_driver_id.trim() !== ""
  ) {
    return "추천인 자동등록 완료";
  }
  return "일반가입";
}

function referralPhoneMatchLabel(row: PartnerDriverDetail): string {
  if (row.referral_source.trim() === "quote_referral_phone_mismatch") {
    return "불일치";
  }
  if (
    row.referral_source.trim() === "quote_referral" ||
    row.referrer_partner_driver_id.trim() !== ""
  ) {
    return "일치";
  }
  return "—";
}

function PartnerResendInviteButton({
  partnerDriverId,
  email,
  status,
  authUserId,
  setToast,
}: {
  partnerDriverId: string;
  email: string;
  status: string;
  authUserId: string;
  setToast: (t: { message: string }) => void;
}) {
  const approved = parsePartnerStatus(status) === "approved";
  const [busy, setBusy] = useState(false);

  const allowed = approved || authUserId.trim() !== "";
  if (!allowed || email.trim() === "") return null;

  return (
    <div className="mt-3">
      <button
        type="button"
        disabled={busy}
        onClick={() => {
          void (async () => {
            setBusy(true);
            try {
              const res = await fetch("/api/admin/partner-drivers/resend-invite", {
                method: "POST",
                credentials: "same-origin",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ id: partnerDriverId }),
              });
              const json = (await res.json()) as {
                error?: string;
                invite_email_sent?: boolean;
                message?: string;
              };
              if (!res.ok) {
                setToast({
                  message: json.error ?? "초대 메일 재발송에 실패했습니다.",
                });
                return;
              }
              setToast({
                message: json.invite_email_sent
                  ? "초대 메일 발송을 요청했습니다."
                  : (json.message ?? "처리되었습니다."),
              });
            } catch (e) {
              setToast({
                message: e instanceof Error ? e.message : String(e),
              });
            } finally {
              setBusy(false);
            }
          })();
        }}
        className="min-h-11 w-full rounded-xl border border-indigo-300 bg-indigo-50 px-3 text-sm font-black text-indigo-950 shadow-sm transition hover:bg-indigo-100 disabled:opacity-50"
      >
        {busy ? "요청 중…" : "초대메일 재발송"}
      </button>
      <p className="mt-2 text-[11px] font-medium leading-snug text-slate-500">
        이미 계정이 있는 이메일이면 재발송이 제한될 수 있습니다. 오류 시 메시지를 확인해 주세요.
      </p>
    </div>
  );
}

function PartnerPasswordResetButton({
  partnerDriverId,
  email,
  status,
  authUserId,
  setToast,
}: {
  partnerDriverId: string;
  email: string;
  status: string;
  authUserId: string;
  setToast: (t: { message: string }) => void;
}) {
  const approved = parsePartnerStatus(status) === "approved";
  const allowed = approved || authUserId.trim() !== "";
  const [busy, setBusy] = useState(false);

  if (!allowed || email.trim() === "") return null;

  return (
    <div className="mt-2">
      <button
        type="button"
        disabled={busy}
        onClick={() => {
          void (async () => {
            setBusy(true);
            try {
              const res = await fetch("/api/admin/partner-drivers/password-reset", {
                method: "POST",
                credentials: "same-origin",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ id: partnerDriverId }),
              });
              const json = (await res.json()) as {
                error?: string;
                password_reset_email_sent?: boolean;
                message?: string;
              };
              if (!res.ok) {
                setToast({
                  message:
                    json.error ?? "비밀번호 설정메일 발송에 실패했습니다.",
                });
                return;
              }
              setToast({
                message: json.password_reset_email_sent
                  ? "비밀번호 설정메일 발송을 요청했습니다."
                  : (json.message ?? "처리되었습니다."),
              });
            } catch (e) {
              setToast({
                message: e instanceof Error ? e.message : String(e),
              });
            } finally {
              setBusy(false);
            }
          })();
        }}
        className="min-h-11 w-full rounded-xl border border-slate-300 bg-slate-50 px-3 text-sm font-black text-slate-900 shadow-sm transition hover:bg-slate-100 disabled:opacity-50"
      >
        {busy ? "요청 중…" : "비밀번호 설정메일 발송"}
      </button>
      <p className="mt-2 text-[11px] font-medium leading-snug text-slate-500">
        기존 사용자(이미 가입된 이메일)인 경우에는 이 버튼을 사용해 비밀번호 설정/재설정 링크를 발송하세요.
      </p>
    </div>
  );
}

function TempCredentialsModal({
  open,
  loginId,
  temporaryPassword,
  onClose,
  setToast,
}: {
  open: boolean;
  loginId: string;
  temporaryPassword: string;
  onClose: () => void;
  setToast: (t: { message: string }) => void;
}) {
  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = prev;
      window.removeEventListener("keydown", onKey);
    };
  }, [open, onClose]);

  const copyText = async (message: string, text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setToast({ message });
    } catch {
      setToast({ message: "복사에 실패했습니다." });
    }
  };

  if (!open) return null;

  const copyAll = `${loginId}\n${temporaryPassword}`;

  return (
    <>
      <button
        type="button"
        aria-label="임시 로그인 정보 닫기"
        className="fixed inset-0 z-[100] bg-slate-900/50 backdrop-blur-[2px]"
        onClick={onClose}
      />
      <div
        className="fixed left-1/2 top-1/2 z-[110] w-[min(calc(100vw-2rem),24rem)] -translate-x-1/2 -translate-y-1/2 rounded-2xl border border-slate-200 bg-white p-5 shadow-2xl shadow-slate-900/25 ring-1 ring-slate-100"
        role="dialog"
        aria-modal="true"
        aria-labelledby="temp-creds-title"
      >
        <h2
          id="temp-creds-title"
          className="text-base font-black leading-snug text-slate-900"
        >
          임시 로그인 정보
        </h2>
        <p className="mt-2 text-xs font-semibold leading-relaxed text-amber-900">
          이 창을 닫거나 새로고침하면 비밀번호를 다시 볼 수 없습니다. 필요한
          항목을 복사해 보관해 주세요.
        </p>

        <div className="mt-4 space-y-3">
          <div>
            <p className="text-[11px] font-bold uppercase tracking-wide text-slate-500">
              로그인 ID (전화번호)
            </p>
            <div className="mt-1 flex gap-2">
              <code className="min-w-0 flex-1 break-all rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm font-bold text-slate-900">
                {loginId}
              </code>
              <button
                type="button"
                onClick={() =>
                  void copyText("로그인 ID를 복사했습니다.", loginId)
                }
                className="shrink-0 rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-black text-slate-800 hover:bg-slate-50"
              >
                복사
              </button>
            </div>
          </div>
          <div>
            <p className="text-[11px] font-bold uppercase tracking-wide text-slate-500">
              임시 비밀번호
            </p>
            <div className="mt-1 flex gap-2">
              <code className="min-w-0 flex-1 break-all rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm font-bold text-slate-900">
                {temporaryPassword}
              </code>
              <button
                type="button"
                onClick={() =>
                  void copyText(
                    "임시 비밀번호를 복사했습니다.",
                    temporaryPassword,
                  )
                }
                className="shrink-0 rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-black text-slate-800 hover:bg-slate-50"
              >
                복사
              </button>
            </div>
          </div>
        </div>

        <button
          type="button"
          onClick={() =>
            void copyText("로그인 ID와 비밀번호를 복사했습니다.", copyAll)
          }
          className="mt-4 h-10 w-full rounded-xl border border-slate-200 bg-slate-50 text-sm font-black text-slate-900 hover:bg-slate-100"
        >
          ID·비밀번호 한 번에 복사
        </button>

        <button
          type="button"
          onClick={onClose}
          className="mt-3 h-11 w-full rounded-xl bg-slate-900 text-sm font-black text-white hover:bg-slate-800"
        >
          확인
        </button>
      </div>
    </>
  );
}

function PartnerSmsTempAccountSection({
  row,
  onPartnerRowUpdated,
  setToast,
}: {
  row: PartnerDriverDetail;
  onPartnerRowUpdated: (next: PartnerDriverDetail) => void;
  setToast: (t: { message: string }) => void;
}) {
  const [busyIssue, setBusyIssue] = useState(false);
  const [busyReset, setBusyReset] = useState(false);
  const [credModal, setCredModal] = useState<{
    loginId: string;
    temporaryPassword: string;
  } | null>(null);

  const phoneDigits = row.phone.replace(/\D/g, "");
  const canPhone = /^010\d{8}$/.test(phoneDigits);

  const run = async (mode: "issue" | "reset") => {
    if (mode === "issue") setBusyIssue(true);
    else setBusyReset(true);
    try {
      const res = await fetch("/api/admin/partner-drivers/issue-temp-account", {
        method: "POST",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: row.id, mode }),
      });
      const json = (await res.json()) as {
        error?: string;
        ok?: boolean;
        message?: string;
        sms_sent?: boolean;
        sms_error?: string | null;
        warnings?: string[];
        partner_driver?: PartnerDriverDetail | null;
        credentials_once?: {
          login_id?: string;
          temporary_password?: string;
        };
      };
      if (!res.ok) {
        setToast({ message: json.error ?? "처리에 실패했습니다." });
        return;
      }
      const c = json.credentials_once;
      if (
        c?.login_id &&
        c.temporary_password &&
        typeof c.login_id === "string" &&
        typeof c.temporary_password === "string"
      ) {
        setCredModal({
          loginId: c.login_id,
          temporaryPassword: c.temporary_password,
        });
      }
      if (json.partner_driver) {
        onPartnerRowUpdated(json.partner_driver);
      }
      window.dispatchEvent(new CustomEvent("partner-admin-refresh"));
      const parts: string[] = [];
      if (json.message) parts.push(json.message);
      if (json.sms_sent === false && json.sms_error) {
        parts.push(`문자 오류: ${json.sms_error}`);
      }
      if (json.warnings?.length) parts.push(...json.warnings);
      setToast({
        message: parts.join(" ").trim() || "처리되었습니다.",
      });
    } catch (e) {
      setToast({
        message: e instanceof Error ? e.message : String(e),
      });
    } finally {
      setBusyIssue(false);
      setBusyReset(false);
    }
  };

  return (
    <>
      <TempCredentialsModal
        open={credModal != null}
        loginId={credModal?.loginId ?? ""}
        temporaryPassword={credModal?.temporaryPassword ?? ""}
        onClose={() => setCredModal(null)}
        setToast={setToast}
      />
    <div className="mt-4 rounded-xl border border-teal-200 bg-teal-50/40 p-4 ring-1 ring-teal-100">
      <p className="text-xs font-semibold uppercase tracking-wide text-teal-900">
        전화번호 로그인 (임시 비밀번호)
      </p>
      {!canPhone ? (
        <p className="mt-2 text-xs font-medium text-amber-900">
          010으로 시작하는 휴대폰 번호가 있어야 문자로 계정을 발급할 수 있습니다.
        </p>
      ) : null}
      <div className="mt-3 grid grid-cols-1 gap-2">
        <button
          type="button"
          disabled={busyIssue || busyReset || !canPhone}
          onClick={() => void run("issue")}
          className="min-h-11 rounded-xl bg-teal-700 px-3 text-sm font-black text-white shadow-sm transition hover:bg-teal-800 disabled:opacity-50"
        >
          {busyIssue ? "처리 중…" : "임시 계정 발급 및 문자발송"}
        </button>
        <button
          type="button"
          disabled={busyIssue || busyReset || !canPhone}
          onClick={() => void run("reset")}
          className="min-h-11 rounded-xl border border-teal-400 bg-white px-3 text-sm font-black text-teal-950 shadow-sm transition hover:bg-teal-50 disabled:opacity-50"
        >
          {busyReset ? "처리 중…" : "비밀번호 재설정 문자발송"}
        </button>
      </div>
      <p className="mt-2 text-[11px] font-medium leading-snug text-teal-950/80">
        발급 직후 팝업에서 임시 로그인 정보를 1회 확인할 수 있으며, 문자로도
        안내됩니다. DB에는 평문 비밀번호를 저장하지 않습니다.
      </p>
    </div>
    </>
  );
}

function PartnerWorkflowButtons({
  row,
  getAdminMemo,
  onPartnerRowUpdated,
  setToast,
}: {
  row: PartnerDriverDetail;
  /** 제출 시점 textarea 값 — 클로저/렌더 타이밍과 무관하게 최신 문자열 사용 */
  getAdminMemo: () => string;
  onPartnerRowUpdated: (next: PartnerDriverDetail) => void;
  setToast: (t: { message: string }) => void;
}) {
  const [busy, setBusy] = useState(false);
  const [workflowError, setWorkflowError] = useState<string | null>(null);

  const post = async (status: PartnerStatusValue) => {
    setBusy(true);
    setWorkflowError(null);
    try {
      const memoTrim = getAdminMemo().trim();
      const res = await fetch("/api/admin/partner-drivers/status", {
        method: "POST",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          partner_driver_id: row.id,
          status,
          admin_memo: memoTrim,
        }),
      });
      const json = (await res.json()) as {
        error?: string;
        partner_driver?: PartnerDriverDetail | null;
        invite_email_sent?: boolean;
        linked_existing_auth_user?: boolean;
        invite_error?: string | null;
      };
      if (!res.ok) {
        const msg =
          json.error ??
          "처리에 실패했습니다. 서버 로그와 SUPABASE_SERVICE_ROLE_KEY 설정을 확인해 주세요.";
        setWorkflowError(msg);
        setToast({ message: msg });
        return;
      }
      if (json.partner_driver) {
        onPartnerRowUpdated(json.partner_driver);
      }
      if (status === "approved") {
        if (json.invite_email_sent) {
          setToast({
            message: "승인 완료. 초대 이메일이 발송되었습니다.",
          });
        } else if (json.invite_error) {
          setToast({
            message: json.invite_error,
          });
        } else if (json.linked_existing_auth_user) {
          setToast({
            message:
              "승인 완료. 이미 등록된 이메일 계정과 연결되었습니다. 초대 메일은 발송되지 않았을 수 있습니다.",
          });
        } else {
          setToast({
            message:
              "승인 완료. 계정이 생성·연결되었습니다. (초대 메일은 설정·경로에 따라 다를 수 있습니다.)",
          });
        }
      } else {
        setToast({ message: "저장되었습니다." });
      }
      window.dispatchEvent(new CustomEvent("partner-admin-refresh"));
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      setWorkflowError(msg);
      setToast({ message: msg });
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="mt-4 grid grid-cols-1 gap-2 sm:grid-cols-3">
      <button
        type="button"
        disabled={busy}
        onClick={() => void post("approved")}
        className="min-h-11 rounded-xl bg-emerald-600 px-3 text-sm font-black text-white shadow-sm transition hover:bg-emerald-700 disabled:opacity-50"
      >
        {busy ? "처리 중…" : "승인"}
      </button>
      <button
        type="button"
        disabled={busy}
        onClick={() => void post("reviewing")}
        className="min-h-11 rounded-xl border border-amber-300 bg-amber-50 px-3 text-sm font-black text-amber-950 shadow-sm transition hover:bg-amber-100 disabled:opacity-50"
      >
        검토중
      </button>
      <button
        type="button"
        disabled={busy}
        onClick={() => void post("rejected")}
        className="min-h-11 rounded-xl border border-red-300 bg-red-50 px-3 text-sm font-black text-red-900 shadow-sm transition hover:bg-red-100 disabled:opacity-50"
      >
        반려
      </button>
      {workflowError ? (
        <div
          className="col-span-full rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs font-medium text-red-800"
          role="alert"
        >
          {workflowError}
        </div>
      ) : null}
    </div>
  );
}

function DetailField({
  label,
  children,
}: {
  label: string;
  children: ReactNode;
}) {
  return (
    <div className="border-b border-slate-100 py-3 last:border-b-0">
      <dt className="text-xs font-semibold uppercase tracking-wide text-slate-500">
        {label}
      </dt>
      <dd className="mt-1 text-sm font-medium text-slate-900">{children}</dd>
    </div>
  );
}

function PartnerStatusSection({
  rowId,
  statusFromServer,
  memoFromServer,
  memo,
  setMemo,
  onSaved,
  onPartnerRowUpdated,
  setToast,
}: {
  rowId: string;
  statusFromServer: string;
  memoFromServer: string;
  memo: string;
  setMemo: (v: string) => void;
  onSaved: (nextStatus: PartnerStatusValue, nextMemo: string) => void;
  onPartnerRowUpdated?: (next: PartnerDriverDetail) => void;
  setToast: (t: { message: string }) => void;
}) {
  const normalizedSaved = coercePartnerStatus(statusFromServer);
  const [selected, setSelected] = useState<PartnerStatusValue>(() =>
    coercePartnerStatus(statusFromServer),
  );
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setSelected(coercePartnerStatus(statusFromServer));
    setError(null);
  }, [rowId, statusFromServer]);

  const unchanged =
    selected === normalizedSaved &&
    memo.trim() === (memoFromServer ?? "").trim();

  const handleSave = async () => {
    setSaving(true);
    setError(null);
    try {
      const memoTrim = memo.trim();
      const res = await fetch("/api/admin/partner-drivers/status", {
        method: "POST",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          partner_driver_id: rowId,
          status: selected,
          admin_memo: memoTrim,
        }),
      });
      const json = (await res.json()) as {
        error?: string;
        partner_driver?: PartnerDriverDetail | null;
        invite_email_sent?: boolean;
        linked_existing_auth_user?: boolean;
        invite_error?: string | null;
      };
      if (!res.ok) {
        const msg =
          json.error ?? "저장에 실패했습니다. 서버 로그를 확인해 주세요.";
        setError(msg);
        setToast({ message: msg });
        return;
      }
      if (json.partner_driver) {
        onPartnerRowUpdated?.(json.partner_driver);
      }
      onSaved(
        coercePartnerStatus(json.partner_driver?.status ?? selected),
        memoTrim,
      );
      if (selected === "approved") {
        if (json.invite_email_sent) {
          setToast({
            message: "승인 완료. 초대 이메일이 발송되었습니다.",
          });
        } else if (json.invite_error) {
          setToast({ message: json.invite_error });
        } else if (json.linked_existing_auth_user) {
          setToast({
            message:
              "승인 완료. 이미 등록된 이메일 계정과 연결되었습니다. 초대 메일은 발송되지 않았을 수 있습니다.",
          });
        } else {
          setToast({
            message:
              "승인 완료. 계정이 생성·연결되었습니다.",
          });
        }
      } else {
        setToast({ message: "저장되었습니다." });
      }
      window.dispatchEvent(new CustomEvent("partner-admin-refresh"));
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      setError(msg);
      setToast({ message: msg });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="mt-4 rounded-xl border border-slate-200 bg-gradient-to-b from-slate-50 to-white p-4 shadow-sm ring-1 ring-slate-100/80">
      <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
        상태 변경
      </p>
      <div className="mt-3">
        <select
          value={selected}
          onChange={(e) =>
            setSelected(e.target.value as PartnerStatusValue)
          }
          disabled={saving}
          className="h-11 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm font-semibold text-slate-800 shadow-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 disabled:bg-slate-100"
          aria-label="제휴 신청 상태"
        >
          {PARTNER_STATUS_OPTIONS.map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </select>
      </div>

      <div className="mt-3">
        <label className="block">
          <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">
            관리자 메모
          </span>
          <textarea
            value={memo}
            onChange={(e) => setMemo(e.target.value)}
            disabled={saving}
            placeholder="내부 검토 메모"
            className="mt-2 min-h-[120px] w-full resize-none rounded-xl border border-slate-200 bg-white px-3 py-3 text-sm font-medium text-slate-900 shadow-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 disabled:bg-slate-100"
          />
        </label>
      </div>

      <button
        type="button"
        onClick={() => void handleSave()}
        disabled={saving || unchanged}
        className="mt-3 h-11 w-full rounded-xl bg-slate-900 px-4 text-sm font-bold text-white shadow-sm transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-45"
      >
        {saving ? "저장 중…" : "상태 및 메모 저장"}
      </button>

      {error ? (
        <div
          className="mt-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs font-medium text-red-800"
          role="alert"
        >
          {error}
        </div>
      ) : null}
    </div>
  );
}

type PartnerSortKey =
  | "created_at"
  | "company_name"
  | "manager_name"
  | "phone"
  | "email"
  | "region"
  | "business_type"
  | "vehicle_number"
  | "passenger_capacity"
  | "status";

type PartnerFilterValue = "all" | PartnerStatusValue;

type Props = {
  setToast: (t: { message: string }) => void;
};

export function PartnerDriversAdmin({ setToast }: Props) {
  const [rows, setRows] = useState<PartnerDriverDetail[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState("");
  const [statusFilter, setStatusFilter] =
    useState<PartnerFilterValue>("all");
  const [sortKey, setSortKey] = useState<PartnerSortKey>("created_at");
  const [sortDirection, setSortDirection] = useState<"asc" | "desc">("desc");
  const [detailOpen, setDetailOpen] = useState(false);
  const [selected, setSelected] = useState<PartnerDriverDetail | null>(null);
  const pendingFocusIdRef = useRef<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const supabase = createSupabaseClient();
      const { data, error: q } = await supabase
        .from("partner_drivers")
        .select("*")
        .order("created_at", { ascending: false });

      if (q) {
        setError(q.message);
        setRows([]);
        return;
      }
      setRows(normalizePartnerDrivers(data));
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setRows([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const focusPartnerRow = useCallback((partnerDriverId: string) => {
    requestAnimationFrame(() => {
      document
        .getElementById(`admin-partner-row-${partnerDriverId}`)
        ?.scrollIntoView({ behavior: "smooth", block: "center" });
    });
  }, []);

  useEffect(() => {
    const onRefresh = () => void load();
    window.addEventListener("partner-admin-refresh", onRefresh);
    return () => window.removeEventListener("partner-admin-refresh", onRefresh);
  }, [load]);

  useEffect(() => {
    const onInsert = (ev: Event) => {
      const e = ev as CustomEvent<{ row?: PartnerDriverDetail }>;
      const row = e.detail?.row;
      if (!row?.id) return;
      setRows((prev) => {
        if (prev.some((r) => r.id === row.id)) return prev;
        return [row, ...prev];
      });
    };
    window.addEventListener("partner-admin-insert", onInsert);
    return () => window.removeEventListener("partner-admin-insert", onInsert);
  }, []);

  useEffect(() => {
    const onFocus = (ev: Event) => {
      const e = ev as CustomEvent<{ id?: string }>;
      const id = e.detail?.id?.trim() ?? "";
      if (!id) return;
      const row = rows.find((r) => r.id === id);
      if (row) {
        setSelected(row);
        setDetailOpen(true);
        focusPartnerRow(id);
        return;
      }
      pendingFocusIdRef.current = id;
      void load();
    };
    window.addEventListener("partner-admin-focus", onFocus);
    return () => window.removeEventListener("partner-admin-focus", onFocus);
  }, [rows, load, focusPartnerRow]);

  useEffect(() => {
    const id = pendingFocusIdRef.current;
    if (!id) return;
    const row = rows.find((r) => r.id === id);
    if (!row) return;
    pendingFocusIdRef.current = null;
    setSelected(row);
    setDetailOpen(true);
    focusPartnerRow(id);
  }, [rows, focusPartnerRow]);

  const handlePartnerStatusSaved = useCallback(
    (id: string, nextStatus: PartnerStatusValue, nextMemo: string) => {
      setRows((prev) =>
        prev.map((r) =>
          r.id === id ? { ...r, status: nextStatus, admin_memo: nextMemo } : r,
        ),
      );
      setSelected((prev) =>
        prev && prev.id === id
          ? { ...prev, status: nextStatus, admin_memo: nextMemo }
          : prev,
      );
    },
    [],
  );

  const mergePartnerRowFromApi = useCallback((next: PartnerDriverDetail) => {
    setRows((prev) => prev.map((r) => (r.id === next.id ? next : r)));
    setSelected((prev) =>
      prev && prev.id === next.id ? next : prev,
    );
  }, []);

  const filteredRows = useMemo(() => {
    const term = searchTerm.trim().toLowerCase();
    const hasTerm = term.length > 0;

    return rows.filter((row) => {
      if (statusFilter !== "all") {
        const known = parsePartnerStatus(row.status);
        if (known !== statusFilter) return false;
      }
      if (!hasTerm) return true;

      const haystack = [
        row.company_name,
        row.manager_name,
        row.phone,
        row.email,
        row.region,
        row.vehicle_number,
        row.status,
        statusLabelForSearch(row.status),
        row.referral_source,
        row.referral_token,
        row.referrer_company_name,
        row.referrer_phone,
      ]
        .join(" ")
        .toLowerCase();

      return haystack.includes(term);
    });
  }, [rows, searchTerm, statusFilter]);

  const filteredAndSorted = useMemo(() => {
    const copy = [...filteredRows];
    const dir = sortDirection === "asc" ? 1 : -1;

    const ts = (v: string | null) => {
      if (v == null || v === "") return Number.NEGATIVE_INFINITY;
      const t = new Date(v).getTime();
      return Number.isNaN(t) ? Number.NEGATIVE_INFINITY : t;
    };

    const cmp = (a: string, b: string) =>
      a.localeCompare(b, "ko-KR", { sensitivity: "base" });

    copy.sort((a, b) => {
      if (sortKey === "created_at") {
        return (ts(a.created_at) - ts(b.created_at)) * dir;
      }
      if (sortKey === "passenger_capacity") {
        const av = a.passenger_capacity ?? Number.NEGATIVE_INFINITY;
        const bv = b.passenger_capacity ?? Number.NEGATIVE_INFINITY;
        return (av - bv) * dir;
      }
      if (sortKey === "status") {
        return (
          cmp(statusLabelForSearch(a.status), statusLabelForSearch(b.status)) *
          dir
        );
      }
      const av = String(
        (a as Record<string, unknown>)[sortKey] ?? "",
      );
      const bv = String((b as Record<string, unknown>)[sortKey] ?? "");
      return cmp(av, bv) * dir;
    });

    return copy;
  }, [filteredRows, sortKey, sortDirection]);

  const handleSortClick = (key: PartnerSortKey) => {
    if (key === sortKey) {
      setSortDirection((p) => (p === "asc" ? "desc" : "asc"));
      return;
    }
    setSortKey(key);
    setSortDirection("asc");
  };

  const sortIndicator = (key: PartnerSortKey) => {
    if (key !== sortKey) return null;
    return (
      <span className="ml-1 text-[10px] font-black text-slate-500" aria-hidden>
        {sortDirection === "asc" ? "▲" : "▼"}
      </span>
    );
  };

  const handleExcel = useCallback(() => {
    try {
      const exportRows = filteredAndSorted.map((r) => ({
        신청일: formatCreatedAt(r.created_at),
        업체명: r.company_name,
        담당자명: r.manager_name,
        연락처: r.phone,
        이메일: r.email,
        차고지: r.region,
        사업자유형: r.business_type,
        보유버스유형: r.bus_types.join(", "),
        차량모델: r.vehicle_model,
        차량번호: r.vehicle_number,
        최대탑승인원: r.passenger_capacity ?? "",
        상태: statusLabelForExport(r.status),
        가입구분:
          r.referral_source === "quote_referral_phone_mismatch"
            ? "추천보류"
            : r.referral_source === "quote_referral" ||
                r.referrer_partner_driver_id.trim() !== ""
            ? "추천가입"
            : "일반가입",
        추천인업체명: r.referrer_company_name,
        추천인연락처: r.referrer_phone,
        추천토큰: r.referral_token,
        추천경로: referralSourceLabel(r.referral_source),
        추천상태: referralStatusLabel(r),
        전화번호일치여부: referralPhoneMatchLabel(r),
        관리자메모: r.admin_memo,
        기타메모: r.memo === "—" ? "" : r.memo,
        사업자등록증파일명: r.business_license_name,
        사업자등록증URL: r.business_license_url,
        연결계정ID: r.auth_user_id.trim() === "" ? "" : r.auth_user_id,
        승인시각:
          r.approved_at == null || r.approved_at === ""
            ? ""
            : formatCreatedAt(r.approved_at),
        임시비밀번호발급시각:
          r.temporary_password_issued_at == null ||
          r.temporary_password_issued_at === ""
            ? ""
            : formatCreatedAt(r.temporary_password_issued_at),
        비밀번호변경시각:
          r.password_changed_at == null || r.password_changed_at === ""
            ? ""
            : formatCreatedAt(r.password_changed_at),
        최근문자오류: r.last_sms_error,
      }));

      const ws = XLSX.utils.json_to_sheet(exportRows, { skipHeader: false });
      const headers = Object.keys(exportRows[0] ?? {});
      const colWidths = headers.map((h) => {
        let max = h.length;
        for (const row of exportRows) {
          const v = (row as Record<string, unknown>)[h];
          const s = v == null ? "" : String(v);
          if (s.length > max) max = s.length;
        }
        return { wch: Math.min(Math.max(max + 2, 10), 60) };
      });
      (ws as XLSX.WorkSheet)["!cols"] = colWidths;

      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, "제휴기사신청");
      XLSX.writeFile(wb, `제휴기사_신청목록_${ymdTodayLocal()}.xlsx`, {
        bookType: "xlsx",
      });
    } catch (e) {
      setToast({
        message: `엑셀 다운로드 실패: ${e instanceof Error ? e.message : String(e)}`,
      });
    }
  }, [filteredAndSorted, setToast]);

  const openDetail = (row: PartnerDriverDetail) => {
    setSelected(row);
    setDetailOpen(true);
  };

  const closeDetail = () => {
    setDetailOpen(false);
    setSelected(null);
  };

  const partnerStats = useMemo(() => {
    let pending = 0;
    let reviewing = 0;
    let approved = 0;
    let rejected = 0;
    for (const r of rows) {
      const k = parsePartnerStatus(r.status);
      if (k === "pending") pending++;
      else if (k === "reviewing") reviewing++;
      else if (k === "approved") approved++;
      else if (k === "rejected") rejected++;
    }
    return { total: rows.length, pending, reviewing, approved, rejected };
  }, [rows]);

  return (
    <>
      <section className="mb-5" aria-labelledby="partner-dash-heading">
        <h2
          id="partner-dash-heading"
          className="mb-3 text-sm font-black tracking-tight text-slate-900"
        >
          제휴기사 신청 현황
        </h2>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
          <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
            <p className="text-[11px] font-bold text-slate-500">전체</p>
            <p className="mt-2 text-2xl font-black tabular-nums text-slate-900">
              {partnerStats.total}
            </p>
          </div>
          <div className="rounded-2xl border border-blue-200 bg-blue-50/60 p-4 shadow-sm">
            <p className="text-[11px] font-bold text-blue-800">접수완료</p>
            <p className="mt-2 text-2xl font-black tabular-nums text-blue-950">
              {partnerStats.pending}
            </p>
          </div>
          <div className="rounded-2xl border border-amber-200 bg-amber-50/80 p-4 shadow-sm">
            <p className="text-[11px] font-bold text-amber-900">검토중</p>
            <p className="mt-2 text-2xl font-black tabular-nums text-amber-950">
              {partnerStats.reviewing}
            </p>
          </div>
          <div className="rounded-2xl border border-emerald-200 bg-emerald-50/80 p-4 shadow-sm">
            <p className="text-[11px] font-bold text-emerald-900">승인완료</p>
            <p className="mt-2 text-2xl font-black tabular-nums text-emerald-950">
              {partnerStats.approved}
            </p>
          </div>
          <div className="rounded-2xl border border-red-200 bg-red-50/80 p-4 shadow-sm">
            <p className="text-[11px] font-bold text-red-900">반려</p>
            <p className="mt-2 text-2xl font-black tabular-nums text-red-950">
              {partnerStats.rejected}
            </p>
          </div>
        </div>
      </section>

      <div className="mb-5 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
          <label className="block flex-1">
            <span className="sr-only">검색</span>
            <input
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="업체명, 담당자명, 연락처, 이메일, 차고지, 차량번호, 상태 검색"
              className="h-11 w-full rounded-xl border border-slate-200 bg-white px-4 text-sm font-semibold text-slate-900 shadow-sm outline-none placeholder:text-slate-400 focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20"
            />
          </label>
          <label className="block sm:w-[220px]">
            <span className="sr-only">상태 필터</span>
            <select
              value={statusFilter}
              onChange={(e) =>
                setStatusFilter(e.target.value as PartnerFilterValue)
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
            onClick={() => void handleExcel()}
            disabled={loading || filteredAndSorted.length === 0}
            className="h-11 shrink-0 rounded-xl bg-emerald-600 px-4 text-sm font-black text-white shadow-sm transition hover:bg-emerald-700 disabled:opacity-50"
          >
            제휴 엑셀 다운로드
          </button>
        </div>
        <p className="mt-3 text-xs font-medium text-slate-500">
          총 {rows.length}건 중 {filteredAndSorted.length}건 표시
        </p>
      </div>

      {loading ? (
        <div className="rounded-2xl border border-slate-200 bg-white p-10 text-center shadow-sm">
          <div
            className="mx-auto h-10 w-10 animate-spin rounded-full border-2 border-slate-200 border-t-blue-600"
            aria-hidden
          />
          <p className="mt-4 text-sm font-medium text-slate-600">
            제휴 신청 목록을 불러오는 중…
          </p>
        </div>
      ) : error ? (
        <div
          className="rounded-2xl border border-red-200 bg-red-50 p-6 shadow-sm"
          role="alert"
        >
          <p className="text-sm font-semibold text-red-900">
            partner_drivers 를 불러오지 못했습니다.
          </p>
          <p className="mt-2 text-xs text-red-800">{error}</p>
          <button
            type="button"
            onClick={() => void load()}
            className="mt-4 rounded-lg bg-red-600 px-4 py-2 text-sm font-semibold text-white"
          >
            다시 시도
          </button>
        </div>
      ) : rows.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-slate-300 bg-white p-12 text-center shadow-sm">
          <p className="text-base font-semibold text-slate-700">
            등록된 제휴 신청이 없습니다.
          </p>
        </div>
      ) : filteredRows.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-slate-300 bg-white p-12 text-center shadow-sm">
          <p className="text-base font-semibold text-slate-700">
            조건에 맞는 내역이 없습니다.
          </p>
        </div>
      ) : (
        <>
          <ul className="space-y-4 md:hidden">
            {filteredAndSorted.map((row) => (
              <li key={row.id}>
                <button
                  type="button"
                  id={`admin-partner-row-${row.id}`}
                  onClick={() => openDetail(row)}
                  className="w-full rounded-2xl border border-slate-200 bg-white p-4 text-left shadow-sm transition hover:border-slate-300 hover:bg-slate-50/80"
                >
                  <div className="flex items-start justify-between gap-2">
                    <p className="text-xs text-slate-500">
                      {formatCreatedAt(row.created_at)}
                    </p>
                    <div className="flex flex-col items-end gap-1">
                      <PartnerStatusBadge status={row.status} />
                      <PartnerReferralBadge row={row} />
                    </div>
                  </div>
                  <p className="mt-2 text-base font-bold text-slate-900">
                    {row.company_name}
                  </p>
                  <p className="mt-1 text-sm text-slate-600">{row.manager_name}</p>
                  <dl className="mt-3 space-y-1 text-sm">
                    <div className="flex justify-between gap-2">
                      <dt className="text-slate-500">연락처</dt>
                      <dd className="font-medium text-slate-800">{row.phone}</dd>
                    </div>
                    <div className="flex justify-between gap-2">
                      <dt className="text-slate-500">차량번호</dt>
                      <dd className="font-medium text-slate-800">
                        {row.vehicle_number}
                      </dd>
                    </div>
                  </dl>
                </button>
              </li>
            ))}
          </ul>

          <div className="hidden overflow-x-auto rounded-2xl border border-slate-200 bg-white shadow-sm md:block">
            <table className="min-w-[1100px] w-full divide-y divide-slate-200 text-left text-sm">
              <thead className="bg-slate-50">
                <tr>
                  <th className="whitespace-nowrap px-3 py-0 font-semibold text-slate-700">
                    <button
                      type="button"
                      className="flex w-full items-center gap-1 py-3 hover:text-slate-900"
                      onClick={() => handleSortClick("created_at")}
                    >
                      신청일{sortIndicator("created_at")}
                    </button>
                  </th>
                  <th className="whitespace-nowrap px-3 py-0 font-semibold text-slate-700">
                    <button
                      type="button"
                      className="flex w-full items-center gap-1 py-3 hover:text-slate-900"
                      onClick={() => handleSortClick("company_name")}
                    >
                      업체명{sortIndicator("company_name")}
                    </button>
                  </th>
                  <th className="whitespace-nowrap px-3 py-0 font-semibold text-slate-700">
                    <button
                      type="button"
                      className="flex w-full items-center gap-1 py-3 hover:text-slate-900"
                      onClick={() => handleSortClick("manager_name")}
                    >
                      담당자명{sortIndicator("manager_name")}
                    </button>
                  </th>
                  <th className="whitespace-nowrap px-3 py-0 font-semibold text-slate-700">
                    <button
                      type="button"
                      className="flex w-full items-center gap-1 py-3 hover:text-slate-900"
                      onClick={() => handleSortClick("phone")}
                    >
                      연락처{sortIndicator("phone")}
                    </button>
                  </th>
                  <th className="whitespace-nowrap px-3 py-0 font-semibold text-slate-700">
                    <button
                      type="button"
                      className="flex w-full items-center gap-1 py-3 hover:text-slate-900"
                      onClick={() => handleSortClick("email")}
                    >
                      이메일{sortIndicator("email")}
                    </button>
                  </th>
                  <th className="whitespace-nowrap px-3 py-0 font-semibold text-slate-700">
                    <button
                      type="button"
                      className="flex w-full items-center gap-1 py-3 hover:text-slate-900"
                      onClick={() => handleSortClick("region")}
                    >
                      차고지{sortIndicator("region")}
                    </button>
                  </th>
                  <th className="whitespace-nowrap px-3 py-0 font-semibold text-slate-700">
                    <button
                      type="button"
                      className="flex w-full items-center gap-1 py-3 hover:text-slate-900"
                      onClick={() => handleSortClick("business_type")}
                    >
                      사업자 유형{sortIndicator("business_type")}
                    </button>
                  </th>
                  <th className="min-w-[120px] px-3 py-3 font-semibold text-slate-700">
                    보유버스
                  </th>
                  <th className="whitespace-nowrap px-3 py-0 font-semibold text-slate-700">
                    <button
                      type="button"
                      className="flex w-full items-center gap-1 py-3 hover:text-slate-900"
                      onClick={() => handleSortClick("vehicle_number")}
                    >
                      차량번호{sortIndicator("vehicle_number")}
                    </button>
                  </th>
                  <th className="whitespace-nowrap px-3 py-0 font-semibold text-slate-700">
                    <button
                      type="button"
                      className="flex w-full items-center gap-1 py-3 hover:text-slate-900"
                      onClick={() => handleSortClick("passenger_capacity")}
                    >
                      탑승인원{sortIndicator("passenger_capacity")}
                    </button>
                  </th>
                  <th className="whitespace-nowrap px-3 py-0 font-semibold text-slate-700">
                    <button
                      type="button"
                      className="flex w-full items-center gap-1 py-3 hover:text-slate-900"
                      onClick={() => handleSortClick("status")}
                    >
                      상태{sortIndicator("status")}
                    </button>
                  </th>
                  <th className="whitespace-nowrap px-3 py-3 font-semibold text-slate-700">
                    가입구분
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 bg-white">
                {filteredAndSorted.map((row) => (
                  <tr
                    key={row.id}
                    id={`admin-partner-row-${row.id}`}
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
                    <td className="whitespace-nowrap px-3 py-3 text-slate-700">
                      {formatCreatedAt(row.created_at)}
                    </td>
                    <td className="max-w-[140px] px-3 py-3 font-medium text-slate-900">
                      <span className="line-clamp-2">{row.company_name}</span>
                    </td>
                    <td className="whitespace-nowrap px-3 py-3 text-slate-800">
                      {row.manager_name}
                    </td>
                    <td className="whitespace-nowrap px-3 py-3 text-slate-700">
                      {row.phone}
                    </td>
                    <td className="max-w-[160px] px-3 py-3 text-slate-700">
                      <span className="line-clamp-2 break-all">{row.email}</span>
                    </td>
                    <td className="max-w-[120px] px-3 py-3 text-slate-700">
                      <span className="line-clamp-2">{row.region}</span>
                    </td>
                    <td className="whitespace-nowrap px-3 py-3 text-slate-700">
                      {row.business_type}
                    </td>
                    <td className="max-w-[140px] px-3 py-3 text-xs text-slate-700">
                      {row.bus_types.length === 0
                        ? "—"
                        : row.bus_types.join(", ")}
                    </td>
                    <td className="whitespace-nowrap px-3 py-3 font-mono text-[13px] text-slate-800">
                      {row.vehicle_number}
                    </td>
                    <td className="whitespace-nowrap px-3 py-3 text-slate-700">
                      {row.passenger_capacity ?? "—"}
                    </td>
                    <td className="whitespace-nowrap px-3 py-3">
                      <PartnerStatusBadge status={row.status} />
                    </td>
                    <td className="whitespace-nowrap px-3 py-3">
                      <PartnerReferralBadge row={row} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <p className="mt-4 text-center text-xs text-slate-500">
            행을 눌러 상세 보기 · 총 {filteredAndSorted.length}건
          </p>
        </>
      )}

      <PartnerDriverSlidePanel
        row={selected}
        open={detailOpen}
        onClose={closeDetail}
        onStatusSaved={handlePartnerStatusSaved}
        onPartnerRowUpdated={mergePartnerRowFromApi}
        setToast={setToast}
      />
    </>
  );
}

function PartnerDriverSlidePanel({
  row,
  open,
  onClose,
  onStatusSaved,
  onPartnerRowUpdated,
  setToast,
}: {
  row: PartnerDriverDetail | null;
  open: boolean;
  onClose: () => void;
  onStatusSaved: (
    id: string,
    nextStatus: PartnerStatusValue,
    nextMemo: string,
  ) => void;
  onPartnerRowUpdated: (next: PartnerDriverDetail) => void;
  setToast: (t: { message: string }) => void;
}) {
  const [draftMemo, setDraftMemo] = useState("");
  const draftMemoRef = useRef("");
  draftMemoRef.current = draftMemo;

  useEffect(() => {
    if (!open || !row) return;
    const m = row.admin_memo;
    setDraftMemo(m === "—" ? "" : m);
  }, [open, row?.id]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, [open, onClose]);

  if (!open || row == null) return null;

  const licenseUrl = row.business_license_url.trim();
  const licenseHttp =
    licenseUrl.startsWith("http://") || licenseUrl.startsWith("https://");

  return (
    <>
      <button
        type="button"
        aria-label="패널 닫기"
        className="fixed inset-0 z-40 bg-slate-900/40 backdrop-blur-[2px]"
        onClick={onClose}
      />

      <aside className="fixed inset-y-0 right-0 z-50 flex w-full max-w-lg flex-col bg-white shadow-2xl ring-1 ring-slate-200">
        <div className="flex shrink-0 items-center justify-between border-b border-slate-200 px-4 py-4 sm:px-6">
          <div>
            <h2 className="text-lg font-bold tracking-tight text-slate-900">
              제휴 신청 상세
            </h2>
            <p className="mt-0.5 text-xs text-slate-500">
              {formatCreatedAt(row.created_at)}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-2 text-slate-500 hover:bg-slate-100"
            aria-label="닫기"
          >
            <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18 18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-4 pb-10 pt-2 sm:px-6">
          <dl>
            <DetailField label="업체명">{row.company_name}</DetailField>
            <DetailField label="담당자명">{row.manager_name}</DetailField>
            <DetailField label="연락처">{row.phone}</DetailField>
            <DetailField label="이메일">
              <PartnerEmailDisplay email={row.email} />
            </DetailField>
            <DetailField label="차고지">{row.region}</DetailField>
            <DetailField label="사업자 유형">{row.business_type}</DetailField>
            <DetailField label="보유버스 유형">
              {row.bus_types.length === 0 ? "—" : row.bus_types.join(", ")}
            </DetailField>
            <DetailField label="차량 모델">{row.vehicle_model}</DetailField>
            <DetailField label="차량번호">{row.vehicle_number}</DetailField>
            <DetailField label="최대 탑승인원">
              {row.passenger_capacity ?? "—"}
            </DetailField>
            <DetailField label="사업자등록증 파일명">
              {row.business_license_name.trim() === "" ? (
                "—"
              ) : (
                row.business_license_name
              )}
            </DetailField>
            <div className="border-b border-slate-100 py-3">
              <dt className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                사업자등록증
              </dt>
              <dd className="mt-2">
                {licenseHttp ? (
                  <a
                    href={licenseUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex min-h-11 items-center justify-center rounded-xl bg-blue-600 px-4 text-sm font-black text-white shadow-sm hover:bg-blue-700"
                  >
                    파일 보기
                  </a>
                ) : (
                  <span className="text-sm text-slate-400">첨부 없음</span>
                )}
              </dd>
            </div>
            <DetailField label="기타 메모">
              {row.memo.trim() === "" || row.memo === "—" ? (
                <span className="text-slate-400">—</span>
              ) : (
                <span className="whitespace-pre-wrap">{row.memo}</span>
              )}
            </DetailField>
            <DetailField label="현재 상태">
              <PartnerStatusBadge status={row.status} />
            </DetailField>
            <DetailField label="가입 구분">
              <PartnerReferralBadge row={row} />
            </DetailField>
            {row.referral_token.trim() !== "" ? (
              <DetailField label="추천 토큰">
                <span className="break-all font-mono text-xs text-slate-600">
                  {row.referral_token}
                </span>
              </DetailField>
            ) : null}
            {row.referral_source.trim() !== "" ||
            row.referrer_partner_driver_id.trim() !== "" ? (
              <>
                <DetailField label="추천 경로">
                  {referralSourceLabel(row.referral_source)}
                </DetailField>
                <DetailField label="추천 상태">
                  {referralStatusLabel(row)}
                </DetailField>
                <DetailField label="전화번호 일치 여부">
                  {referralPhoneMatchLabel(row)}
                </DetailField>
                {row.referral_source.trim() ===
                "quote_referral_phone_mismatch" ? (
                  <DetailField label="추천 링크 전화번호 불일치">
                    <span className="whitespace-pre-wrap text-amber-800">
                      추천 링크의 수신번호와 가입 휴대폰번호가 달라 추천인 자동등록은 보류되었습니다.
                    </span>
                  </DetailField>
                ) : null}
                <DetailField label="추천인 업체명">
                  {row.referrer_company_name.trim() === ""
                    ? "—"
                    : row.referrer_company_name}
                </DetailField>
                <DetailField label="추천인 연락처">
                  {row.referrer_phone.trim() === "" ? "—" : row.referrer_phone}
                </DetailField>
              </>
            ) : null}
            {row.auth_user_id.trim() !== "" ? (
              <DetailField label="연결된 계정 ID">
                <span className="break-all font-mono text-xs text-slate-600">
                  {row.auth_user_id}
                </span>
              </DetailField>
            ) : null}
            {row.approved_at != null && row.approved_at !== "" ? (
              <DetailField label="승인 시각">
                {formatCreatedAt(row.approved_at)}
              </DetailField>
            ) : null}
            {row.temporary_password_issued_at != null &&
            row.temporary_password_issued_at !== "" ? (
              <DetailField label="임시 비밀번호 발급 시각">
                {formatCreatedAt(row.temporary_password_issued_at)}
              </DetailField>
            ) : null}
            {row.password_changed_at != null &&
            row.password_changed_at !== "" ? (
              <DetailField label="비밀번호 변경 시각">
                {formatCreatedAt(row.password_changed_at)}
              </DetailField>
            ) : null}
            {row.last_sms_error.trim() !== "" ? (
              <DetailField label="최근 문자 발송 오류">
                <span className="whitespace-pre-wrap text-red-700">
                  {row.last_sms_error}
                </span>
              </DetailField>
            ) : null}
          </dl>

          <PartnerStatusSection
            rowId={row.id}
            statusFromServer={row.status}
            memoFromServer={row.admin_memo}
            memo={draftMemo}
            setMemo={setDraftMemo}
            onSaved={(nextStatus, nextMemo) =>
              onStatusSaved(row.id, nextStatus, nextMemo)
            }
            onPartnerRowUpdated={onPartnerRowUpdated}
            setToast={setToast}
          />

          <PartnerWorkflowButtons
            row={row}
            getAdminMemo={() => draftMemoRef.current}
            onPartnerRowUpdated={onPartnerRowUpdated}
            setToast={setToast}
          />

          <PartnerResendInviteButton
            partnerDriverId={row.id}
            email={row.email}
            status={row.status}
            authUserId={row.auth_user_id}
            setToast={setToast}
          />

          <PartnerPasswordResetButton
            partnerDriverId={row.id}
            email={row.email}
            status={row.status}
            authUserId={row.auth_user_id}
            setToast={setToast}
          />

          <PartnerSmsTempAccountSection
            row={row}
            onPartnerRowUpdated={onPartnerRowUpdated}
            setToast={setToast}
          />
        </div>
      </aside>
    </>
  );
}
