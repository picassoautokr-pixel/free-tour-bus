-- 견적별 지원금 breakdown 스냅샷 (규칙·금액 고정)
alter table public.driver_quotes
  add column if not exists support_breakdown jsonb;

comment on column public.driver_quotes.support_breakdown is
  '지원금 계산 스냅샷(규칙·예상/확정 금액). 제출·확정 시점 고정, 이후 sponsor_rules 변경과 무관';

create index if not exists driver_quotes_support_breakdown_gin
  on public.driver_quotes using gin (support_breakdown);
