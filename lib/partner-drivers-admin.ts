/**
 * 관리자 화면용 partner_drivers 행 정규화.
 * `admin_memo` 컬럼은 선택 사항 — 없으면 빈 문자열로 처리.
 */

function safeText(value: unknown, emptyLabel = "—"): string {
  if (value == null) return emptyLabel;
  const s = String(value).trim();
  return s === "" ? emptyLabel : s;
}

export type PartnerDriverDetail = {
  id: string;
  created_at: string | null;
  company_name: string;
  manager_name: string;
  phone: string;
  email: string;
  region: string;
  business_type: string;
  bus_types: string[];
  vehicle_model: string;
  vehicle_number: string;
  passenger_capacity: number | null;
  business_license_url: string;
  business_license_name: string;
  memo: string;
  status: string;
  admin_memo: string;
  /** 컬럼 없으면 빈 문자열 */
  auth_user_id: string;
  /** 컬럼 없으면 null */
  approved_at: string | null;
};

function parseBusTypes(raw: unknown): string[] {
  if (raw == null) return [];
  if (Array.isArray(raw)) {
    return raw.filter((v): v is string => typeof v === "string").map((s) => s.trim()).filter(Boolean);
  }
  if (typeof raw === "string") {
    const t = raw.trim();
    if (!t) return [];
    try {
      const j = JSON.parse(t) as unknown;
      if (Array.isArray(j)) {
        return j.filter((v): v is string => typeof v === "string").map((s) => s.trim()).filter(Boolean);
      }
    } catch {
      return t.split(/[,，]/).map((s) => s.trim()).filter(Boolean);
    }
  }
  return [];
}

export function normalizePartnerDrivers(data: unknown): PartnerDriverDetail[] {
  if (data == null) return [];
  if (!Array.isArray(data)) return [];

  return data.map((raw, index) => {
    const r = raw as Record<string, unknown>;
    const idRaw = r.id;
    const id =
      idRaw != null && String(idRaw).trim() !== ""
        ? String(idRaw)
        : `idx-partner-${index}`;

    const created =
      r.created_at != null && String(r.created_at).trim() !== ""
        ? String(r.created_at)
        : null;

    const pc = r.passenger_capacity;
    let passengerCapacity: number | null = null;
    if (typeof pc === "number" && Number.isFinite(pc)) passengerCapacity = pc;
    else if (typeof pc === "string" && pc.trim() !== "") {
      const n = Number.parseInt(pc, 10);
      if (Number.isFinite(n)) passengerCapacity = n;
    }

    const adminMemo =
      "admin_memo" in r ? safeText(r.admin_memo, "") : "";

    let authUserId = "";
    if ("auth_user_id" in r && r.auth_user_id != null) {
      const s = String(r.auth_user_id).trim();
      if (s !== "") authUserId = s;
    }

    let approvedAt: string | null = null;
    if ("approved_at" in r && r.approved_at != null) {
      const s = String(r.approved_at).trim();
      approvedAt = s === "" ? null : s;
    }

    return {
      id,
      created_at: created,
      company_name: safeText(r.company_name),
      manager_name: safeText(r.manager_name),
      phone: safeText(r.phone),
      email: safeText(r.email),
      region: safeText(r.region),
      business_type: safeText(r.business_type),
      bus_types: parseBusTypes(r.bus_types),
      vehicle_model: safeText(r.vehicle_model),
      vehicle_number: safeText(r.vehicle_number),
      passenger_capacity: passengerCapacity,
      business_license_url: safeText(r.business_license_url, ""),
      business_license_name: safeText(r.business_license_name, ""),
      memo: safeText(r.memo, ""),
      status: safeText(r.status, ""),
      admin_memo: adminMemo,
      auth_user_id: authUserId,
      approved_at: approvedAt,
    };
  });
}
