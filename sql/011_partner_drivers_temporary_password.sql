-- 제휴기사 임시 비밀번호 문자 발급 시각 (평문 비밀번호는 저장하지 않음)
alter table public.partner_drivers
  add column if not exists temporary_password_issued_at timestamptz;

alter table public.partner_drivers
  add column if not exists password_changed_at timestamptz;

alter table public.partner_drivers
  add column if not exists last_sms_error text;

comment on column public.partner_drivers.temporary_password_issued_at is
  '관리자가 임시 비밀번호를 문자로 발급한 시각';

comment on column public.partner_drivers.password_changed_at is
  '기사가 임시 비밀번호 발급 후 직접 비밀번호를 변경한 시각';

comment on column public.partner_drivers.last_sms_error is
  '최근 임시 계정 문자 발송 실패 메시지';
