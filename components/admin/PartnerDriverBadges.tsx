"use client";

import type { PartnerDriverDetail } from "@/lib/partner-drivers-admin";
import { parsePartnerStatus } from "./partner-drivers-admin-types";

export function PartnerEmailDisplay({ email }: { email: string }) {
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

export function PartnerStatusBadge({ status }: { status: string }) {
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

export function PartnerReferralBadge({ row }: { row: PartnerDriverDetail }) {
  const mismatch = row.referral_source.trim() === "quote_referral_phone_mismatch";
  const unregistered =
    row.referral_source.trim() === "manual_phone_referral_unregistered";
  const referred =
    mismatch ||
    unregistered ||
    row.referral_source.trim() === "quote_referral" ||
    row.referral_source.trim() === "manual_phone_referral" ||
    row.referrer_partner_driver_id.trim() !== "";
  return (
    <span
      className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold ring-1 ${
        mismatch || unregistered
          ? "border-amber-200 bg-amber-50 text-amber-800 ring-amber-100"
          : referred
          ? "border-emerald-200 bg-emerald-50 text-emerald-800 ring-emerald-100"
          : "border-slate-200 bg-slate-50 text-slate-600 ring-slate-100"
      }`}
    >
      {mismatch || unregistered ? "추천보류" : referred ? "추천가입" : "일반가입"}
    </span>
  );
}
