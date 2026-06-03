-- 비회원 견적 제출 후 회원 전환 재견적 연결

alter table public.driver_quotes
  add column if not exists estimated_support_amount bigint default 0,
  add column if not exists support_discount_amount bigint default 0,
  add column if not exists member_price bigint,
  add column if not exists is_member_quote boolean default false,
  add column if not exists converted_from_guest_quote_id uuid references public.guest_driver_quotes(id) on delete set null;

alter table public.guest_driver_quotes
  add column if not exists converted_to_member_quote_id uuid references public.driver_quotes(id) on delete set null,
  add column if not exists converted_at timestamptz;

comment on column public.driver_quotes.estimated_support_amount is
  '신청 인원수 기반 예상 지원금(인원수 x 20000원, 최대 800000원)';

comment on column public.driver_quotes.support_discount_amount is
  '기사가 고객가에 반영한 지원금 액수';

comment on column public.driver_quotes.member_price is
  '회원 견적의 고객 제시 지원금 적용가(price - support_discount_amount)';

comment on column public.driver_quotes.converted_from_guest_quote_id is
  '동일 전화번호 비회원 견적에서 회원 재견적으로 전환된 경우 원본 비회원 견적 ID';

comment on column public.guest_driver_quotes.converted_to_member_quote_id is
  '회원 재견적으로 전환된 driver_quotes ID';

comment on column public.guest_driver_quotes.converted_at is
  '비회원 견적이 회원 견적으로 전환된 시각';
