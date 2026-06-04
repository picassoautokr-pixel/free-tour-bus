"use client";

// ─────────────────────────────────────────────────────────────────────────────
// ApplicationDetailForms.tsx
// 관리자 수정 폼 컴포넌트: QuoteEditForm, SponsorEditForm
// ─────────────────────────────────────────────────────────────────────────────

import { useState } from "react";
import type {
  AdminGuestQuoteCard,
  AdminMemberQuoteCard,
  AdminSponsorDetail,
} from "@/lib/admin-application-detail-build";

export function QuoteEditForm({
  quote,
  kind,
  busy,
  onSave,
}: {
  quote: AdminMemberQuoteCard | AdminGuestQuoteCard;
  kind: "member" | "guest";
  busy: boolean;
  onSave: (patch: Record<string, unknown>) => void;
}) {
  const [price, setPrice] = useState(String(quote.price ?? ""));
  const [vehicle, setVehicle] = useState(quote.vehicle_type === "—" ? "" : quote.vehicle_type);
  const [time, setTime] = useState(quote.available_time === "—" ? "" : quote.available_time);
  const [message, setMessage] = useState(quote.message);
  const [hidden, setHidden] = useState(quote.status === "admin_hidden");

  const memberQuote = kind === "member" ? (quote as AdminMemberQuoteCard) : null;
  const initialCustomerSupport = memberQuote?.support_rows.find((r) =>
    r.label.includes("고객") && r.label.includes("지원금"),
  )?.value;
  const [customerSupport, setCustomerSupport] = useState(
    String(initialCustomerSupport != null ? initialCustomerSupport : ""),
  );
  const [settlementType, setSettlementType] = useState(
    memberQuote?.support_settlement_label === "기사 우선" ? "driver_priority"
      : memberQuote?.support_settlement_label === "고객 우선" ? "client_priority"
      : "client_priority",
  );

  return (
    <div className="space-y-3">
      <label className="block text-xs font-bold text-slate-600">
        일반견적가
        <input
          type="number"
          value={price}
          onChange={(e) => setPrice(e.target.value)}
          className="mt-1 w-full rounded-lg border px-2 py-2 text-sm"
        />
      </label>
      {kind === "member" ? (
        <>
          <label className="block text-xs font-bold text-slate-600">
            고객 예상 지원금
            <input
              type="number"
              value={customerSupport}
              onChange={(e) => setCustomerSupport(e.target.value)}
              placeholder="비어 있으면 유지"
              className="mt-1 w-full rounded-lg border px-2 py-2 text-sm"
            />
          </label>
          <label className="block text-xs font-bold text-slate-600">
            정산모드
            <select
              value={settlementType}
              onChange={(e) => setSettlementType(e.target.value)}
              className="mt-1 w-full rounded-lg border px-2 py-2 text-sm"
            >
              <option value="client_priority">고객 우선</option>
              <option value="driver_priority">기사 우선</option>
            </select>
          </label>
        </>
      ) : null}
      <label className="block text-xs font-bold text-slate-600">
        차량유형
        <input
          value={vehicle}
          onChange={(e) => setVehicle(e.target.value)}
          className="mt-1 w-full rounded-lg border px-2 py-2 text-sm"
        />
      </label>
      <label className="block text-xs font-bold text-slate-600">
        가능 출발시간
        <input
          value={time}
          onChange={(e) => setTime(e.target.value)}
          className="mt-1 w-full rounded-lg border px-2 py-2 text-sm"
        />
      </label>
      <label className="block text-xs font-bold text-slate-600">
        기사 메모
        <textarea
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          rows={3}
          className="mt-1 w-full rounded-lg border px-2 py-2 text-sm"
        />
      </label>
      <label className="flex items-center gap-2 text-xs font-bold">
        <input
          type="checkbox"
          checked={hidden}
          onChange={(e) => setHidden(e.target.checked)}
        />
        견적 숨김 (status=admin_hidden)
      </label>
      <button
        type="button"
        disabled={busy}
        onClick={() => {
          const patch: Record<string, unknown> = {
            price: price === "" ? null : Number.parseInt(price, 10),
            vehicle_type: vehicle,
            available_time: time,
            message,
            status: hidden ? "admin_hidden" : "submitted",
            quote_kind: kind,
          };
          if (kind === "member") {
            patch.support_settlement_type = settlementType;
            if (customerSupport.trim() !== "") {
              patch.customer_support_amount = Number.parseInt(customerSupport, 10);
            }
          }
          onSave(patch);
        }}
        className="h-10 w-full rounded-xl bg-slate-900 text-sm font-black text-white disabled:opacity-50"
      >
        저장
      </button>
    </div>
  );
}

export function SponsorEditForm({
  detail,
  busy,
  onSave,
  onCancel,
}: {
  detail: AdminSponsorDetail;
  busy: boolean;
  onSave: (patch: Record<string, unknown>) => void;
  onCancel: () => void;
}) {
  const [estimated, setEstimated] = useState(
    String(detail.estimated_support_amount ?? ""),
  );
  const [approved, setApproved] = useState(
    String(detail.approved_support_amount ?? ""),
  );
  const [supportKind, setSupportKind] = useState(detail.support_kind ?? "");
  const [supportCondition, setSupportCondition] = useState(detail.support_condition ?? "");
  const [supportType, setSupportType] = useState(detail.support_type ?? "");

  return (
    <div className="space-y-3">
      <p className="rounded-lg bg-amber-50 px-3 py-2 text-xs font-semibold text-amber-900 ring-1 ring-amber-200">
        수정 후 파트너 견적의 확정 지원금 스냅샷이 자동 재계산됩니다.
      </p>
      <label className="block text-xs font-bold text-slate-600">
        예상 지원금
        <input
          type="number"
          value={estimated}
          onChange={(e) => setEstimated(e.target.value)}
          className="mt-1 w-full rounded-lg border px-2 py-2 text-sm"
        />
      </label>
      <label className="block text-xs font-bold text-slate-600">
        확정 지원금
        <input
          type="number"
          value={approved}
          onChange={(e) => setApproved(e.target.value)}
          className="mt-1 w-full rounded-lg border px-2 py-2 text-sm"
        />
      </label>
      <label className="block text-xs font-bold text-slate-600">
        지원종류
        <input
          value={supportKind}
          onChange={(e) => setSupportKind(e.target.value)}
          className="mt-1 w-full rounded-lg border px-2 py-2 text-sm"
        />
      </label>
      <label className="block text-xs font-bold text-slate-600">
        지원조건
        <input
          value={supportCondition}
          onChange={(e) => setSupportCondition(e.target.value)}
          className="mt-1 w-full rounded-lg border px-2 py-2 text-sm"
        />
      </label>
      <label className="block text-xs font-bold text-slate-600">
        지원유형
        <input
          value={supportType}
          onChange={(e) => setSupportType(e.target.value)}
          className="mt-1 w-full rounded-lg border px-2 py-2 text-sm"
        />
      </label>
      <div className="flex gap-2">
        <button
          type="button"
          disabled={busy}
          onClick={() =>
            onSave({
              estimated_support_amount:
                estimated.trim() !== "" ? Number.parseInt(estimated, 10) : undefined,
              approved_support_amount:
                approved.trim() !== "" ? Number.parseInt(approved, 10) : undefined,
              support_kind: supportKind,
              support_condition: supportCondition,
              support_type: supportType,
            })
          }
          className="h-10 flex-1 rounded-xl bg-violet-700 text-sm font-black text-white disabled:opacity-50"
        >
          {busy ? "저장 중…" : "저장"}
        </button>
        <button
          type="button"
          disabled={busy}
          onClick={onCancel}
          className="h-10 rounded-xl border border-slate-300 bg-white px-4 text-sm font-bold text-slate-700 disabled:opacity-50"
        >
          취소
        </button>
      </div>
    </div>
  );
}
