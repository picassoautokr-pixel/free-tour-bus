-- 제휴기사 임시 비밀번호 문자 발급 시각 (평문 비밀번호는 저장하지 않음)
alter table public.partner_drivers
  add column if not exists temporary_password_issued_at timestamptz;

comment on column public.partner_drivers.temporary_password_issued_at is
  '관리자가 임시 비밀번호를 문자로 발급한 시각';
