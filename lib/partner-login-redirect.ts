/**
 * 제휴 기사 로그인 화면 URL (redirectTo 용 아님 — 초대는 set-password 사용).
 * NEXT_PUBLIC_SITE_URL 이 이미 `/partner/login` 까지 포함하면 그대로 사용합니다.
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

/**
 * 초대메일 inviteUserByEmail 의 redirectTo — 비밀번호 최초 설정 화면.
 * 예: NEXT_PUBLIC_SITE_URL=https://www.free-bus.co.kr
 *   → https://www.free-bus.co.kr/partner/set-password
 */
export function getPartnerSetPasswordRedirectTo(): string {
  const raw = process.env.NEXT_PUBLIC_SITE_URL?.trim();
  if (!raw) return "";
  const normalized = raw.replace(/\/$/, "");
  if (/partner\/set-password/i.test(raw)) {
    return normalized;
  }
  return `${normalized}/partner/set-password`;
}
