-- 고객 신청 경유지 목록

alter table public.applications
  add column if not exists stopovers text[];
