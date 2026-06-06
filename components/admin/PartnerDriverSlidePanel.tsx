"use client";

import { useEffect, useRef, useState } from "react";

import type { PartnerDriverDetail } from "@/lib/partner-drivers-admin";
import {
  PartnerPasswordResetButton,
  PartnerResendInviteButton,
  PartnerSmsTempAccountSection,
} from "./PartnerDriverActionButtons";
import {
  PartnerEmailDisplay,
  PartnerReferralBadge,
  PartnerStatusBadge,
} from "./PartnerDriverBadges";
import {
  PartnerStatusSection,
  PartnerWorkflowButtons,
} from "./PartnerDriverStatusSection";
import {
  formatCreatedAt,
  referralPhoneMatchLabel,
  referralSourceLabel,
  referralStatusLabel,
  type PartnerStatusValue,
} from "./partner-drivers-admin-types";

function DetailField({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
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

export function PartnerDriverSlidePanel({
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
  const isCorporateBus = row.business_type.trim() === "법인 회사";

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
                <span className="text-slate-400">사업자등록증 미첨부</span>
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
                ) : isCorporateBus ? (
                  <span className="inline-flex rounded-xl bg-emerald-50 px-3 py-2 text-sm font-bold text-emerald-800 ring-1 ring-emerald-100">
                    법인 버스 신청 — 사업자등록증 미첨부 허용
                  </span>
                ) : (
                  <span className="text-sm text-slate-400">
                    사업자등록증 미첨부
                  </span>
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
                <DetailField label="추천인 연락처">
                  {row.referral_phone.trim() !== ""
                    ? row.referral_phone
                    : row.referrer_phone.trim() === ""
                      ? "—"
                      : row.referrer_phone}
                </DetailField>
                <DetailField label="전화번호 일치 여부">
                  {referralPhoneMatchLabel(row)}
                </DetailField>
                {row.referral_source.trim() === "quote_referral_phone_mismatch" ? (
                  <DetailField label="추천 링크 전화번호 불일치">
                    <span className="whitespace-pre-wrap text-amber-800">
                      추천 링크의 수신번호와 가입 휴대폰번호가 달라 추천인 자동등록은 보류되었습니다.
                    </span>
                  </DetailField>
                ) : null}
                {row.referral_source.trim() === "manual_phone_referral_unregistered" ? (
                  <>
                    <DetailField label="추천인 미가입 문자 발송 여부">
                      {row.referral_sms_sent_at != null && row.referral_sms_sent_at !== ""
                        ? `발송됨 · ${formatCreatedAt(row.referral_sms_sent_at)}`
                        : row.referral_sms_error.trim() !== ""
                          ? "발송 실패"
                          : "미발송"}
                    </DetailField>
                    {row.referral_sms_error.trim() !== "" ? (
                      <DetailField label="추천인 미가입 문자 실패 사유">
                        <span className="whitespace-pre-wrap text-red-700">
                          {row.referral_sms_error}
                        </span>
                      </DetailField>
                    ) : null}
                  </>
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
            {row.password_changed_at != null && row.password_changed_at !== "" ? (
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
