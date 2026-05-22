-- 고객 견적 신청: 희망 견적 유형 (다중 선택)
-- Supabase SQL Editor에서 실행 후, (site) 신청 폼이 preferred_quote_types를 저장합니다.
-- 컬럼이 없으면 insert 시 해당 필드를 제외하거나, 아래를 먼저 적용하세요.

alter table applications
  add column if not exists preferred_quote_types text[] default array['normal','support'];

comment on column applications.preferred_quote_types is
  '희망 견적 유형: normal=일반견적, support=할인견적(지원금)';
