-- STEP 8+: 제휴기사 추천가입/직접 추천인 연락처 보강

alter table public.partner_drivers
  add column if not exists referral_phone text;

alter table public.partner_drivers
  add column if not exists referral_sms_error text;

alter table public.partner_drivers
  add column if not exists referral_sms_sent_at timestamptz;

comment on column public.partner_drivers.referral_phone is
  '사이트 직접 가입 시 입력한 추천인 휴대폰번호(숫자만 남긴 010xxxxxxxx 권장)';

comment on column public.partner_drivers.referral_sms_error is
  '미가입 추천인에게 회원가입 권유 문자 발송 실패 사유';

comment on column public.partner_drivers.referral_sms_sent_at is
  '미가입 추천인에게 회원가입 권유 문자를 발송한 시각';
