-- 지원종류: 기본지원 플래그 (후원사 승인 시 1회 생성)
alter table public.sponsor_rules
  add column if not exists is_default boolean default false;

comment on column public.sponsor_rules.is_default is '후원사 기본지원 종류 (sponsor당 1개)';

create unique index if not exists sponsor_rules_one_default_per_company
  on public.sponsor_rules (sponsor_company_id)
  where (is_default = true);
