"use client";

import { LABEL } from "@/lib/partner-dashboard-labels";
import type { PartnerCall } from "./partner-dashboard-types";

const tapStyle = { WebkitTapHighlightColor: "transparent" } as const;

export function PartnerCustomerDetailModal({
  call,
  onClose,
}: {
  call: PartnerCall | null;
  onClose: () => void;
}) {
  if (call == null) return null;

  return (
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
        onClick={onClose}
      />
      <div className="relative max-h-[90vh] w-full max-w-md overflow-y-auto rounded-[1.75rem] bg-white p-6 shadow-2xl ring-1 ring-slate-200 sm:p-8">
        <h2
          id="partner-customer-detail-title"
          className="text-lg font-black tracking-[-0.04em] text-slate-950"
        >
          {LABEL.customerInfo}
        </h2>
        <dl className="mt-4 space-y-3 text-sm">
          <div className="rounded-xl bg-slate-50 p-3 ring-1 ring-slate-100">
            <dt className="text-[11px] font-bold text-slate-400">
              {LABEL.contractNumber}
            </dt>
            <dd className="mt-1 font-black text-slate-900">
              {call.contract_number?.trim() || call.receipt_number || "—"}
            </dd>
          </div>
          <div className="rounded-xl bg-emerald-50 p-3 ring-1 ring-emerald-100">
            <dt className="text-[11px] font-bold text-emerald-600">
              {LABEL.customerName}
            </dt>
            <dd className="mt-1 font-black text-emerald-950">
              {call.customer_name || "—"}
            </dd>
          </div>
          <div className="rounded-xl bg-emerald-50 p-3 ring-1 ring-emerald-100">
            <dt className="text-[11px] font-bold text-emerald-600">
              {LABEL.customerPhone}
            </dt>
            <dd className="mt-2">
              {call.customer_phone ? (
                <div className="flex flex-col gap-2">
                  <p className="font-black text-emerald-950">
                    {call.customer_phone}
                  </p>
                  <div className="flex gap-2">
                    <a
                      href={`tel:${call.customer_phone}`}
                      className="inline-flex min-h-10 flex-1 items-center justify-center rounded-xl bg-emerald-600 px-3 text-sm font-black text-white"
                      style={tapStyle}
                    >
                      {LABEL.callCustomer}
                    </a>
                    <a
                      href={`sms:${call.customer_phone}`}
                      className="inline-flex min-h-10 flex-1 items-center justify-center rounded-xl border border-emerald-200 bg-white px-3 text-sm font-black text-emerald-900"
                      style={tapStyle}
                    >
                      {LABEL.smsCustomer}
                    </a>
                  </div>
                </div>
              ) : (
                <span className="font-semibold text-slate-400">—</span>
              )}
            </dd>
          </div>
        </dl>
        <button
          type="button"
          className="mt-6 flex min-h-12 w-full items-center justify-center rounded-2xl bg-slate-900 text-sm font-black text-white shadow-sm"
          style={tapStyle}
          onClick={onClose}
        >
          닫기
        </button>
      </div>
    </div>
  );
}
