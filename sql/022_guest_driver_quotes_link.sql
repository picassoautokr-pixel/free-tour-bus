-- 비회원 견적을 회원 제휴기사 계정과 연결(선택)
-- 컬럼이 없어도 앱은 guest_phone ↔ partner_drivers.phone 매칭으로 동작합니다.

alter table public.guest_driver_quotes
  add column if not exists linked_partner_driver_id uuid references public.partner_drivers(id) on delete set null;

alter table public.guest_driver_quotes
  add column if not exists linked_auth_user_id uuid;

comment on column public.guest_driver_quotes.linked_partner_driver_id is
  '동일 휴대폰으로 회원 전환된 제휴기사 ID(선택 백필)';

comment on column public.guest_driver_quotes.linked_auth_user_id is
  '연결된 Supabase Auth 사용자 ID(선택)';
