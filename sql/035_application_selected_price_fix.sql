-- 선택 견적 저장 안정화 (UTF-8, BOM 없음)
-- source of truth: applications.selected_price_type / selected_price_label / selected_price
-- + 레거시 호환: client_price_selection_kind
--
-- 사전 적용: sql/application_selected_price.sql (컬럼 생성)
-- 본 파일은 그 위에 CHECK 제약·인덱스·라벨 정규화·검증을 적용한다.

-- 1) 컬럼 보강 (멱등). 컬럼이 이미 있으면 무시
alter table public.applications
  add column if not exists selected_price_type text,
  add column if not exists selected_price_label text,
  add column if not exists selected_price bigint,
  add column if not exists client_price_selection_kind text;

comment on column public.applications.selected_price_type is
  '고객 선택 견적가 종류 (source of truth): normal | support_planned | support_confirmed';
comment on column public.applications.selected_price_label is
  '고객 선택 견적가 표시명: 일반견적가 | 지원금 할인 예상가 | 지원금 할인 예정가 | 지원금 할인 적용가';
comment on column public.applications.selected_price is
  '고객이 매칭완료 시점에 선택한 견적 금액(원). 추후 표시 fallback의 1순위';
comment on column public.applications.client_price_selection_kind is
  '레거시 선택 종류 (호환): normal_selected | support_planned_selected | support_confirmed_selected';

-- 2) 라벨 정규화: "예정가" -> "예상가"는 일종의 alias. DB에는 표준 라벨만 저장
--    (코드에서 "예정가" 입력을 수용하더라도 저장 시 표준 라벨로 정규화)
update public.applications
set selected_price_label = '지원금 할인 예상가'
where selected_price_type = 'support_planned'
  and selected_price_label in ('지원금 할인 예정가');

update public.applications
set selected_price_label = '지원금 할인 적용가'
where selected_price_type = 'support_confirmed'
  and selected_price_label in ('지원금 할인 확정가');

update public.applications
set selected_price_label = '일반견적가'
where selected_price_type = 'normal'
  and (selected_price_label is null or selected_price_label = '');

-- 3) client_price_selection_kind 백필 (type 우선)
update public.applications
set client_price_selection_kind = 'normal_selected'
where selected_price_type = 'normal'
  and (client_price_selection_kind is null or client_price_selection_kind = '');

update public.applications
set client_price_selection_kind = 'support_planned_selected'
where selected_price_type = 'support_planned'
  and (client_price_selection_kind is null or client_price_selection_kind = '');

update public.applications
set client_price_selection_kind = 'support_confirmed_selected'
where selected_price_type = 'support_confirmed'
  and (client_price_selection_kind is null or client_price_selection_kind = '');

-- 4) 역방향 백필: selected_price_type이 비어있고 레거시 kind만 있는 경우
update public.applications
set
  selected_price_type = 'normal',
  selected_price_label = coalesce(nullif(selected_price_label, ''), '일반견적가')
where (selected_price_type is null or selected_price_type = '')
  and client_price_selection_kind in ('normal_selected', 'normal_price_selected');

update public.applications
set
  selected_price_type = 'support_planned',
  selected_price_label = coalesce(nullif(selected_price_label, ''), '지원금 할인 예상가')
where (selected_price_type is null or selected_price_type = '')
  and client_price_selection_kind in ('support_planned_selected');

update public.applications
set
  selected_price_type = 'support_confirmed',
  selected_price_label = coalesce(nullif(selected_price_label, ''), '지원금 할인 적용가')
where (selected_price_type is null or selected_price_type = '')
  and client_price_selection_kind in ('support_confirmed_selected', 'support_price_selected');

-- 5) CHECK 제약: selected_price_type 화이트리스트 (NOT VALID로 추가하여 기존 행은 통과)
do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'applications_selected_price_type_check'
  ) then
    alter table public.applications
      add constraint applications_selected_price_type_check
      check (
        selected_price_type is null
        or selected_price_type in ('normal', 'support_planned', 'support_confirmed')
      ) not valid;
  end if;
end $$;

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'applications_client_price_selection_kind_check'
  ) then
    alter table public.applications
      add constraint applications_client_price_selection_kind_check
      check (
        client_price_selection_kind is null
        or client_price_selection_kind in (
          'normal_selected',
          'support_planned_selected',
          'support_confirmed_selected',
          'normal_price_selected',
          'support_price_selected'
        )
      ) not valid;
  end if;
end $$;

-- 6) 부분 인덱스: 매칭 완료된 신청만 빠른 조회
create index if not exists applications_selected_price_type_idx
  on public.applications (selected_price_type)
  where selected_price_type is not null;

-- 7) 검증 질의 (수동 확인용; 실행해도 영향 없음)
--   select count(*) as inconsistent_rows
--   from public.applications
--   where final_selected_quote_id is not null
--     and (
--       selected_price_type is null
--       or selected_price_label is null
--       or selected_price is null
--     );
