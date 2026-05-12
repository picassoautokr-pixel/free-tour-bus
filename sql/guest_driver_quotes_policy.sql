-- STEP 9: 비회원 견적 제출 및 실제 추천인 추적 보강

alter table public.partner_drivers
  add column if not exists actual_referrer_phone text;

alter table public.partner_drivers
  add column if not exists actual_referrer_partner_driver_id uuid references public.partner_drivers(id);

alter table public.partner_drivers
  add column if not exists actual_referral_source text;

alter table public.partner_drivers
  add column if not exists actual_referral_sms_sent_at timestamptz;

alter table public.partner_drivers
  add column if not exists actual_referral_sms_error text;

create unique index if not exists guest_driver_quotes_application_phone_unique
  on public.guest_driver_quotes(application_id, guest_phone);

comment on column public.partner_drivers.actual_referrer_phone is
  '가입자가 직접 입력한 실제 추천인 휴대폰번호(숫자만 남긴 010xxxxxxxx 형식)';

comment on column public.partner_drivers.actual_referrer_partner_driver_id is
  'actual_referrer_phone으로 매칭된 실제 추천 제휴기사';

comment on column public.partner_drivers.actual_referral_source is
  '실제 추천인 매칭 출처(manual_actual_referrer, manual_actual_referrer_unregistered 등)';

comment on column public.partner_drivers.actual_referral_sms_sent_at is
  '미가입 실제 추천인에게 회원가입 권유 문자를 발송한 시각';

comment on column public.partner_drivers.actual_referral_sms_error is
  '미가입 실제 추천인 권유 문자 발송 실패 사유';

comment on index public.guest_driver_quotes_application_phone_unique is
  '동일 견적요청에 같은 비회원 휴대폰번호가 중복 견적 제출하지 않도록 제한';
