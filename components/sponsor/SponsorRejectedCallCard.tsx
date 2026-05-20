"use client";

import { LABEL } from "@/lib/sponsor-dashboard-labels";
import { formatDepartureAt, type SponsorCallRow } from "@/lib/sponsor-call-view-model";
import {
  NORMAL_MATCH_SPONSOR_REASON,
  resolveSelectedPriceLabel,
} from "@/lib/selected-price-display";
import { formatRouteWithStopovers, formatStopovers } from "@/lib/stopovers";

const tapStyle = { WebkitTapHighlightColor: "transparent" } as const;

export function SponsorRejectedCallCard({
  call,
  expanded,
  onToggleExpand,
}: {
  call: SponsorCallRow;
  expanded: boolean;
  onToggleExpand: () => void;
}) {
  const route = formatRouteWithStopovers(call.departure, call.stopovers, call.destination);
  const rejectReason =
    call.matched_reason?.trim() ||
    NORMAL_MATCH_SPONSOR_REASON ||
    resolveSelectedPriceLabel(call);

  return (
    <article className="overflow-hidden rounded-2xl bg-white shadow-sm ring-1 ring-red-100">
      <button
        type="button"
        onClick={onToggleExpand}
        className="w-full px-3 py-3 text-left"
        style={tapStyle}
      >
        <p className="text-sm font-black text-slate-950">{route}</p>
        <p className="mt-1 text-[11px] font-semibold text-red-700">
          {LABEL.rejectReason}: {rejectReason}
        </p>
        <span className="mt-2 inline-block text-xs font-black text-slate-500">
          {expanded ? LABEL.collapse : LABEL.expand}
        </span>
      </button>
      {expanded ? (
        <dl className="grid gap-2 border-t border-slate-100 px-3 pb-3 pt-2 text-xs sm:grid-cols-2">
          <div>
            <dt className="font-bold text-slate-400">{LABEL.departure}</dt>
            <dd className="mt-0.5 font-black">{call.departure || LABEL.dash}</dd>
          </div>
          <div>
            <dt className="font-bold text-slate-400">{LABEL.waypoint}</dt>
            <dd className="mt-0.5 font-black">{formatStopovers(call.stopovers) || LABEL.dash}</dd>
          </div>
          <div>
            <dt className="font-bold text-slate-400">{LABEL.destination}</dt>
            <dd className="mt-0.5 font-black">{call.destination || LABEL.dash}</dd>
          </div>
          <div>
            <dt className="font-bold text-slate-400">{LABEL.departureAt}</dt>
            <dd className="mt-0.5 font-black">{formatDepartureAt(call)}</dd>
          </div>
          <div>
            <dt className="font-bold text-slate-400">{LABEL.passengers}</dt>
            <dd className="mt-0.5 font-black">{call.passenger_count ?? LABEL.dash}</dd>
          </div>
          <div>
            <dt className="font-bold text-slate-400">{LABEL.tripType}</dt>
            <dd className="mt-0.5 font-black">{call.trip_type || LABEL.dash}</dd>
          </div>
          <div>
            <dt className="font-bold text-slate-400">{LABEL.busGrade}</dt>
            <dd className="mt-0.5 font-black">{call.bus_grade || LABEL.dash}</dd>
          </div>
          <div>
            <dt className="font-bold text-slate-400">{LABEL.groupName}</dt>
            <dd className="mt-0.5 font-black">{call.organization_name || LABEL.dash}</dd>
          </div>
          <div>
            <dt className="font-bold text-slate-400">{LABEL.groupType}</dt>
            <dd className="mt-0.5 font-black">{call.group_type || LABEL.dash}</dd>
          </div>
          <div className="sm:col-span-2">
            <dt className="font-bold text-slate-400">{LABEL.rejectReason}</dt>
            <dd className="mt-0.5 font-black text-red-800">{rejectReason}</dd>
          </div>
        </dl>
      ) : null}
    </article>
  );
}
