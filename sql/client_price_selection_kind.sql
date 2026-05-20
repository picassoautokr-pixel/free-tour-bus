-- 고객 매칭 시 선택한 견적가 종류
alter table public.applications
  add column if not exists client_price_selection_kind text;

comment on column public.applications.client_price_selection_kind is
  '고객 매칭 견적가 선택: normal_price_selected | support_price_selected';
