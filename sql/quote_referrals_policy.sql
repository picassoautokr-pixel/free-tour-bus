-- STEP 8: 동료기사 견적요청 추천 운영정책 보강
-- 같은 콜(application_id)을 같은 휴대폰번호(referred_phone)에 중복 전달하지 않도록 막습니다.
-- 신규 발송분은 referred_phone을 숫자만 남긴 010xxxxxxxx 형식으로 저장합니다.

create unique index if not exists quote_referrals_application_phone_unique
  on public.quote_referrals(application_id, referred_phone);

-- 선택 권장: 하루 발송량 집계를 정확히 하려면 생성시각 컬럼을 추가해 두세요.
-- 현재 애플리케이션은 expires_at(생성시각 + 7일)을 기준으로 오늘 발송량을 계산합니다.
-- alter table public.quote_referrals
--   add column if not exists created_at timestamptz not null default now();

comment on index public.quote_referrals_application_phone_unique is
  '동일 견적요청을 동일 휴대폰번호에 중복 전달하지 않도록 제한';
