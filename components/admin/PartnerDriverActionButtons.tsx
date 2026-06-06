"use client";

import { useEffect, useState } from "react";

import type { PartnerDriverDetail } from "@/lib/partner-drivers-admin";
import { parsePartnerStatus } from "./partner-drivers-admin-types";

export function TempCredentialsModal({
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
                onClick={() => void copyText("로그인 ID를 복사했습니다.", loginId)}
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
                  void copyText("임시 비밀번호를 복사했습니다.", temporaryPassword)
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

export function PartnerResendInviteButton({
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

export function PartnerPasswordResetButton({
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
                  message: json.error ?? "비밀번호 설정메일 발송에 실패했습니다.",
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

export function PartnerSmsTempAccountSection({
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
