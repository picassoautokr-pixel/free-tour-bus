export function formatAdminCreatedAt(iso: string | null): string {
  if (!iso || iso.trim() === "") return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString("ko-KR", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function formatAdminDateOnly(value: string | null): string {
  if (!value || value.trim() === "") return "—";
  const v = value.trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(v)) return v;
  const d = new Date(v);
  if (Number.isNaN(d.getTime())) return v;
  return d.toISOString().slice(0, 10);
}

export function formatAdminWon(value: number | null | undefined): string {
  if (value == null) return "—";
  return `${value.toLocaleString("ko-KR")}원`;
}

export function displayAdminApplicationType(raw: string): string {
  const map: Record<string, string> = {
    "기계약 전세버스 지원금 신청": "이미 예약을 완료하신 경우",
    "전세버스 신규 신청": "신규로 예약이 필요하신 경우",
  };
  const t = raw.trim();
  return map[t] ?? (t === "" || t === "—" ? "—" : t);
}

export function formatAdminDepartureDateTime(
  date: string | null,
  time: string,
): string {
  const d = formatAdminDateOnly(date);
  const t = time.trim();
  if (d === "—" && t === "") return "—";
  if (t === "" || t === "—") return d;
  return `${d} ${t}`;
}

export function phoneDialHref(phone: string): string {
  const digits = phone.replace(/\D/g, "");
  return digits ? `tel:${digits}` : "#";
}

export function phoneSmsHref(phone: string): string {
  const digits = phone.replace(/\D/g, "");
  return digits ? `sms:${digits}` : "#";
}
