-- 어드민 신청 상세 — 자주 쓰는 조회 경로 인덱스 (이미 있으면 skip)

create index if not exists applications_receipt_number_idx
  on public.applications (receipt_number);

create index if not exists driver_quotes_application_id_created_at_idx
  on public.driver_quotes (application_id, created_at desc);

create index if not exists guest_driver_quotes_application_id_created_at_idx
  on public.guest_driver_quotes (application_id, created_at desc);

create index if not exists sponsor_preapprovals_application_id_created_at_idx
  on public.sponsor_preapprovals (application_id, created_at desc);

create index if not exists notification_logs_application_id_created_at_idx
  on public.notification_logs (application_id, created_at desc);

comment on index public.driver_quotes_application_id_created_at_idx is
  '어드민 견적종합 — 신청별 기사 견적 목록';
