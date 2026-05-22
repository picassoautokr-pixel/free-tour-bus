-- 담당자 담당지역 다중 선택 (service_regions 와 동일 용도, 명시 컬럼)
alter table public.sponsor_staff
  add column if not exists assigned_regions text[];

comment on column public.sponsor_staff.assigned_regions is
  '담당 지역 다중 선택 (견적 출발지역 필터용)';

update public.sponsor_staff
set assigned_regions = service_regions
where assigned_regions is null
  and service_regions is not null
  and cardinality(service_regions) > 0;
