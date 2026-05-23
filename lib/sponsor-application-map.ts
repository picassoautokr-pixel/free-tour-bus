/**
 * 스폰서 대시보드 — application·preapproval 필드 매핑 (UTF-8)
 */

import { normalizeStringArray } from "@/lib/sponsor";
import { normalizeCustomerOrganizationType } from "@/lib/organization-types";

function safeText(value: unknown, fallback = ""): string {
  if (value == null) return fallback;
  const s = String(value).trim();
  return s === "" || s === "—" || s === "-" ? fallback : s;
}

function parseInteger(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return Math.trunc(value);
  if (typeof value === "string" && value.trim() !== "") {
    const n = Number.parseInt(value.replace(/[^\d]/g, ""), 10);
    if (Number.isFinite(n)) return n;
  }
  return null;
}

function pickFirstText(row: Record<string, unknown>, keys: string[]): string {
  for (const key of keys) {
    const v = safeText(row[key]);
    if (v) return v;
  }
  return "";
}

function pickStopovers(row: Record<string, unknown>): string[] {
  const raw =
    row.stopovers ?? row.stopover ?? row.waypoints ?? row.waypoint ?? row.via_stops;
  return normalizeStringArray(raw);
}

export type SponsorApplicationTripFields = {
  departure_region: string;
  departure: string;
  destination: string;
  stopovers: string[];
  departure_date: string;
  departure_time: string;
  passenger_count: number | null;
  trip_type: string;
  bus_grade: string;
  group_type: string;
  organization_name: string;
  quote_deadline_at: string;
  quote_limit_count: number | null;
  quote_status: string;
};

/** application + preapproval + rule → 카드 표시용 기본정보 */
export function mapSponsorApplicationTripFields(
  application: Record<string, unknown>,
  preapproval: Record<string, unknown>,
  rule: Record<string, unknown> = {},
): SponsorApplicationTripFields {
  const merged = { ...application, ...preapproval };

  const departureDate = pickFirstText(merged, [
    "departure_date",
    "departure_datetime",
    "start_at",
    "start_date",
  ]);
  let departureTime = pickFirstText(merged, ["departure_time", "departure_time_slot"]);
  if (!departureTime && departureDate.includes(" ")) {
    const parts = departureDate.split(/\s+/);
    if (parts.length > 1) departureTime = parts.slice(1).join(" ");
  }

  const groupType =
    pickFirstText(application, [
      "group_type",
      "organization_type",
      "customer_group_type",
      "application_type",
    ]) ||
    pickFirstText(preapproval, ["group_type", "organization_type"]) ||
    safeText(rule.target_group);

  return {
    departure_region: pickFirstText(merged, [
      "departure_region",
      "start_region",
      "region",
      "matched_region",
    ]),
    departure: pickFirstText(merged, [
      "departure",
      "departure_place",
      "start_location",
      "pickup_location",
      "pickup_place",
    ]),
    destination: pickFirstText(merged, [
      "destination",
      "arrival_place",
      "end_location",
      "dropoff_location",
    ]),
    stopovers: pickStopovers(merged),
    departure_date: departureDate.split(/\s+/)[0] || departureDate,
    departure_time: departureTime,
    passenger_count:
      parseInteger(preapproval.passenger_count) ??
      parseInteger(application.passenger_count) ??
      parseInteger(merged.passengers) ??
      parseInteger(merged.people_count),
    trip_type: pickFirstText(merged, ["trip_type", "direction_type", "operation_type"]),
    bus_grade: pickFirstText(merged, [
      "bus_grade",
      "vehicle_type",
      "bus_type",
      "grade",
      "vehicle_grade",
    ]),
    group_type: normalizeCustomerOrganizationType(groupType),
    organization_name: pickFirstText(application, [
      "organization_name",
      "applicant_name",
      "group_name",
    ]),
    quote_deadline_at: pickFirstText(application, ["quote_deadline_at", "quote_deadline"]),
    quote_limit_count: parseInteger(application.quote_limit_count),
    quote_status: safeText(application.quote_status, "collecting"),
  };
}
