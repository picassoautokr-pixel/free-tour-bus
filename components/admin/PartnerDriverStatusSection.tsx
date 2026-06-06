"use client";

import { useEffect, useState } from "react";

import type { PartnerDriverDetail } from "@/lib/partner-drivers-admin";
import {
  PARTNER_STATUS_OPTIONS,
  type PartnerStatusValue,
  coercePartnerStatus,
} from "./partner-drivers-admin-types";

export function PartnerStatusSection({
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
          setToast({ message: "승인 완료. 초대 이메일이 발송되었습니다." });
        } else if (json.invite_error) {
          setToast({ message: json.invite_error });
        } else if (json.linked_existing_auth_user) {
          setToast({
            message:
              "승인 완료. 이미 등록된 이메일 계정과 연결되었습니다. 초대 메일은 발송되지 않았을 수 있습니다.",
          });
        } else {
          setToast({ message: "승인 완료. 계정이 생성·연결되었습니다." });
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
          onChange={(e) => setSelected(e.target.value as PartnerStatusValue)}
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

export function PartnerWorkflowButtons({
  row,
  getAdminMemo,
  onPartnerRowUpdated,
  setToast,
}: {
  row: PartnerDriverDetail;
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
          setToast({ message: "승인 완료. 초대 이메일이 발송되었습니다." });
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
