/** 제휴기사 전화번호 로그인용 내부 Auth 이메일 도메인 */
export const PARTNER_PHONE_EMAIL_DOMAIN = "phone.free-bus.co.kr";

/** 010xxxxxxxx 형태만 허용 */
export function digitsOnlyKoreanMobile(raw: string): string | null {
  const d = raw.replace(/\D/g, "");
  if (/^010\d{8}$/.test(d)) return d;
  if (/^8210\d{8}$/.test(d)) return `0${d.slice(2)}`;
  return null;
}

export function syntheticEmailFromPhoneDigits(digits: string): string {
  return `${digits}@${PARTNER_PHONE_EMAIL_DOMAIN}`;
}

function isEmailLike(s: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s.trim());
}

/**
 * 로그인 입력(이메일 또는 휴대폰) → Supabase signInWithPassword용 이메일 문자열.
 */
export function resolvePartnerLoginEmail(input: string): string {
  const t = input.trim();
  if (t === "") return "";
  if (isEmailLike(t)) return t.toLowerCase();
  const d = digitsOnlyKoreanMobile(t);
  if (d) return syntheticEmailFromPhoneDigits(d);
  return t.toLowerCase();
}
