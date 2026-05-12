-- 회원 기사 지원금 견적 필드

alter table public.driver_quotes
  add column if not exists sponsor_support_amount bigint default 0,
  add column if not exists sponsor_discounted_price bigint,
  add column if not exists sponsor_quote_enabled boolean default false;

comment on column public.driver_quotes.sponsor_support_amount is
  '회원 기사 견적 제출 시 인원수 기반으로 계산한 예상 지원금';

comment on column public.driver_quotes.sponsor_discounted_price is
  '예상 지원금 적용 후 고객 체감가';

comment on column public.driver_quotes.sponsor_quote_enabled is
  '지원금 적용 예상가를 함께 제시하는 회원 견적 여부';
