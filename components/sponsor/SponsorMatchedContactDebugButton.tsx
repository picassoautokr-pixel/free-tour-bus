"use client";

import { useState } from "react";

import { isQuoteDebugEnabled } from "@/lib/quote-debug-enable";
import type {
  SponsorCustomerInfoPopup,
  SponsorMatchedContactDebug,
} from "@/lib/sponsor-matched-contact";

const tapStyle = { WebkitTapHighlightColor: "transparent" } as const;

function JsonBlock({ title, data }: { title: string; data: unknown }) {
  return (
    <div className="rounded-lg border border-slate-200 bg-slate-50 p-2">
      <p className="text-[10px] font-black text-slate-600">{title}</p>
      <pre className="mt-1 max-h-48 overflow-auto whitespace-pre-wrap break-all text-[10px] font-mono text-slate-800">
        {data == null ? "null" : JSON.stringify(data, null, 2)}
      </pre>
    </div>
  );
}

export function SponsorMatchedContactDebugButton({
  debug,
  popup,
  className = "",
}: {
  debug: SponsorMatchedContactDebug | null | undefined;
  popup: SponsorCustomerInfoPopup | null | undefined;
  className?: string;
}) {
  const [open, setOpen] = useState(false);

  if (!isQuoteDebugEnabled() || !debug) return null;

  const popupSummary = popup
    ? {
        popup_customer_name: popup.customer_name,
        popup_customer_phone: popup.customer_phone,
        popup_driver_company: popup.driver_company,
        popup_driver_name: popup.driver_name,
        popup_driver_phone: popup.driver_phone,
        data_source: popup.data_source,
      }
    : {
        popup_customer_name: debug.popup_customer_name,
        popup_customer_phone: debug.popup_customer_phone,
        popup_driver_company: debug.popup_driver_company,
        popup_driver_name: debug.popup_driver_name,
        popup_driver_phone: debug.popup_driver_phone,
        data_source: debug.data_source,
      };

  return (
    <div
      className={`relative ${className}`}
      onClick={(e) => e.stopPropagation()}
      onKeyDown={(e) => e.stopPropagation()}
    >
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="rounded-md border border-violet-400 bg-violet-100 px-2 py-1 text-[10px] font-black text-violet-950 ring-1 ring-violet-200 hover:bg-violet-200"
        style={tapStyle}
      >
        {open ? "디버그 닫기" : "디버그 표시"}
      </button>
      {open ? (
        <div className="absolute left-0 top-full z-[130] mt-1 w-[min(calc(100vw-2rem),28rem)] max-h-[70vh] overflow-y-auto rounded-xl border border-violet-200 bg-white p-3 shadow-xl ring-1 ring-violet-100">
          <p className="text-xs font-black text-violet-900">매칭완료 연락처 RAW</p>
          <div className="mt-2 space-y-2">
            <JsonBlock title="final_selected_quote_id" data={debug.final_selected_quote_id} />
            <JsonBlock title="fetched_driver_quote" data={debug.fetched_driver_quote} />
            <JsonBlock title="fetched_partner_driver" data={debug.fetched_partner_driver} />
            <JsonBlock title="fetched_profile" data={debug.fetched_profile} />
            <JsonBlock title="fetched_guest_quote" data={debug.fetched_guest_quote} />
            <JsonBlock title="application" data={debug.application} />
            <JsonBlock title="driver_quote (member)" data={debug.driver_quote} />
            <JsonBlock title="partner_driver" data={debug.partner_driver} />
            <JsonBlock title="profiles" data={debug.profile} />
            <JsonBlock title="guest_driver_quote" data={debug.guest_driver_quote} />
            <JsonBlock title="고객정보 팝업 최종 표시값" data={popupSummary} />
          </div>
        </div>
      ) : null}
    </div>
  );
}
