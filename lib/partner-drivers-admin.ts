/**
 * 관리자 화면용 partner_drivers 행 정규화.
 * `admin_memo`는 DB 문자열 컬럼으로 저장되며, null·공백은 빈 문자열로 표시합니다.
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
  auth_user_id: string;
  /** 컬럼 없으면 null */
  approved_at: string | null;
  /** 컬럼 없으면 null — 평문 비밀번호는 저장하지 않음 */
  temporary_password_issued_at: string | null;
  /** 임시 계정 문자 발송 실패 메시지 */
  last_sms_error: string;
  /** 기사가 임시 비밀번호에서 실제 비밀번호로 변경한 시각 */
  password_changed_at: string | null;
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

    const adminMemo = safeText(r.admin_memo, "");

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

    let temporaryPasswordIssuedAt: string | null = null;
    if (
      "temporary_password_issued_at" in r &&
      r.temporary_password_issued_at != null
    ) {
      const s = String(r.temporary_password_issued_at).trim();
      temporaryPasswordIssuedAt = s === "" ? null : s;
    }

    let passwordChangedAt: string | null = null;
    if ("password_changed_at" in r && r.password_changed_at != null) {
      const s = String(r.password_changed_at).trim();
      passwordChangedAt = s === "" ? null : s;
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
      temporary_password_issued_at: temporaryPasswordIssuedAt,
      last_sms_error: safeText(r.last_sms_error, ""),
      password_changed_at: passwordChangedAt,
    };
  });
}
