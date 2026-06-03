"use client";

import { SERVICE_REGIONS, type ServiceRegion } from "@/lib/regions";

const tapStyle = { WebkitTapHighlightColor: "transparent" } as const;

export function PartnerServiceRegionSection({
  serviceRegions,
  savedServiceRegions,
  serviceRegionBusy,
  serviceRegionMessage,
  onToggle,
  onSave,
  onSetAll,
}: {
  serviceRegions: ServiceRegion[];
  savedServiceRegions: ServiceRegion[];
  serviceRegionBusy: boolean;
  serviceRegionMessage: string | null;
  onToggle: (region: ServiceRegion) => void;
  onSave: () => void;
  onSetAll: (regions: ServiceRegion[]) => void;
}) {
  const serviceRegionsChanged =
    serviceRegions.join("|") !== savedServiceRegions.join("|");

  return (
    <section className="mt-6 rounded-2xl border border-slate-200 bg-slate-50 p-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h2 className="text-sm font-black text-slate-900">
            견적요청 수신지역 설정
          </h2>
          <p className="mt-1 text-xs font-semibold leading-5 text-slate-500">
            선택한 지역의 출발 콜만 표시됩니다. 비워두면 모든 지역 콜을
            표시합니다.
          </p>
        </div>
        <button
          type="button"
          onClick={onSave}
          disabled={serviceRegionBusy || !serviceRegionsChanged}
          className="inline-flex min-h-10 items-center justify-center rounded-xl bg-slate-950 px-4 text-sm font-black text-white shadow-sm transition hover:bg-slate-900 disabled:opacity-50"
          style={tapStyle}
        >
          {serviceRegionBusy ? "저장 중…" : "수신지역 저장"}
        </button>
      </div>
      <div className="mt-4">
        <button
          type="button"
          onClick={() => {
            if (serviceRegions.length === SERVICE_REGIONS.length) {
              onSetAll([]);
            } else {
              onSetAll([...SERVICE_REGIONS]);
            }
          }}
          className="mb-3 text-xs font-bold text-blue-600 hover:text-blue-700"
          style={tapStyle}
        >
          {serviceRegions.length === SERVICE_REGIONS.length
            ? "전체해제"
            : "전체선택"}
        </button>
        <div className="flex flex-wrap gap-2">
          {SERVICE_REGIONS.map((region) => {
            const selected = serviceRegions.includes(region);
            return (
              <button
                key={region}
                type="button"
                onClick={() => onToggle(region)}
                className={`min-h-9 rounded-full border px-3 text-xs font-black transition ${
                  selected
                    ? "border-blue-600 bg-blue-600 text-white shadow-sm"
                    : "border-slate-200 bg-white text-slate-700 hover:bg-slate-50"
                }`}
                style={tapStyle}
              >
                {region}
              </button>
            );
          })}
        </div>
      </div>
      {serviceRegions.length === 0 ? (
        <p className="mt-3 rounded-xl bg-amber-50 px-3 py-2 text-xs font-bold leading-5 text-amber-900 ring-1 ring-amber-100">
          수신지역이 설정되지 않아 모든 지역 콜이 표시됩니다.
        </p>
      ) : null}
      {serviceRegionMessage ? (
        <p className="mt-3 rounded-xl bg-white px-3 py-2 text-xs font-bold leading-5 text-slate-700 ring-1 ring-slate-200">
          {serviceRegionMessage}
        </p>
      ) : null}
    </section>
  );
}
