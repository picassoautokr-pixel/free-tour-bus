"use client";

/**
 * components/sponsor/SponsorCustomerDetailModal.tsx
 *
 * 후원업체 대시보드 — 고객/기사 정보 모달
 */

import { LABEL } from "@/lib/sponsor-dashboard-labels";
import type { SponsorCallRow } from "@/lib/sponsor-call-view-model";

interface SponsorCustomerDetailModalProps {
  call: SponsorCallRow;
  onClose: () => void;
}

export function SponsorCustomerDetailModal({
  call,
  onClose,
}: SponsorCustomerDetailModalProps) {
  return (
    <div
      className="fixed inset-0 z-[120] flex items-center justify-center px-4 py-8"
      role="dialog"
      aria-modal="true"
    >
      <button
        type="button"
        className="absolute inset-0 bg-slate-900/50 backdrop-blur-[2px]"
        aria-label="닫기"
        onClick={onClose}
      />
      <div className="relative w-full max-w-md rounded-[1.75rem] bg-white p-6 shadow-2xl ring-1 ring-slate-200">
        <h2 className="text-lg font-black text-slate-950">{LABEL.customerInfoTitle}</h2>
        <dl className="mt-4 space-y-3 text-sm">
          <div className="rounded-xl bg-emerald-50 p-3 ring-1 ring-emerald-100">
            <dt className="text-[11px] font-bold text-emerald-700">{LABEL.customer}</dt>
            <dd className="mt-1 font-black">
              {call.debug_contact_lookup?.popup_customer_name ||
                call.popup_customer_name ||
                call.customer_name ||
                LABEL.dash}
            </dd>
            <dd className="mt-1 font-semibold">
              {call.debug_contact_lookup?.popup_customer_phone ||
                call.popup_customer_phone ||
                call.customer_phone ||
                LABEL.dash}
            </dd>
          </div>
          <div className="rounded-xl bg-blue-50 p-3 ring-1 ring-blue-100">
            <dt className="text-[11px] font-bold text-blue-700">{LABEL.driverInfo}</dt>
            {call.popup_driver_company ||
            call.driver_company ||
            call.driver_company_name ? (
              <dd className="mt-1 text-xs font-bold text-blue-800">
                {call.debug_contact_lookup?.popup_driver_company ||
                  call.popup_driver_company ||
                  call.driver_company ||
                  call.driver_company_name}
              </dd>
            ) : null}
            <dd className="mt-1 font-black">
              {call.debug_contact_lookup?.popup_driver_name ||
                call.popup_driver_name ||
                call.driver_name ||
                LABEL.dash}
            </dd>
            <dd className="mt-1 font-semibold">
              {call.debug_contact_lookup?.popup_driver_phone ||
                call.popup_driver_phone ||
                call.driver_phone ||
                LABEL.dash}
            </dd>
          </div>
        </dl>
        <button
          type="button"
          className="mt-6 min-h-12 w-full rounded-2xl bg-slate-900 text-sm font-black text-white"
          onClick={onClose}
        >
          닫기
        </button>
      </div>
    </div>
  );
}
