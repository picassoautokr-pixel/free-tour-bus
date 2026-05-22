-- 지원종류: 지원단체 다중 선택 (sponsor_rules)
-- Supabase SQL Editor에서 실행 후 스폰서 설정 > 지원종류에서 다중 선택이 저장됩니다.

alter table public.sponsor_rules
  add column if not exists target_groups text[];

comment on column public.sponsor_rules.target_groups is
  '지원단체 다중 선택 (회사원/직장인, 학생, 종교 등)';
