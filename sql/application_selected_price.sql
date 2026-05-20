-- 고객 매칭 시 선택한 견적가 종류·금액 (UTF-8)
alter table public.applications
  add column if not exists selected_price_type text,
  add column if not exists selected_price_label text,
  add column if not exists selected_price bigint;

comment on column public.applications.selected_price_type is
  '고객 선택 견적가 종류: normal | support_planned | support_confirmed';
comment on column public.applications.selected_price_label is
  '고객 선택 견적가 표시명 (예: 일반견적가, 지원금 할인 적용가)';
comment on column public.applications.selected_price is
  '고객이 매칭 확정한 견적 금액(원)';
