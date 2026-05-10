/**
 * 제휴 기사 초대·매직링크용 redirectTo.
 * NEXT_PUBLIC_SITE_URL 이 이미 `/partner/login` 까지 포함하면 그대로 사용하고,
 * 아니면 `{SITE}/partner/login` 형태로 만듭니다.
 *
 * 예: NEXT_PUBLIC_SITE_URL=https://www.free-bus.co.kr
 *   → https://www.free-bus.co.kr/partner/login
 */
export function getPartnerLoginRedirectTo(): string {
  const raw = process.env.NEXT_PUBLIC_SITE_URL?.trim();
  if (!raw) return "";
  const normalized = raw.replace(/\/$/, "");
  if (/partner\/login/i.test(raw)) {
    return normalized;
  }
  return `${normalized}/partner/login`;
}
