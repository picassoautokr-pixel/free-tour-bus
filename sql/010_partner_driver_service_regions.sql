alter table public.partner_drivers
  add column if not exists service_regions text[] default '{}';

comment on column public.partner_drivers.service_regions is
  '제휴기사 대시보드에서 선택한 콜 수신지역. 비어 있으면 전체 지역 수신.';
