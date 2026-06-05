-- 043_migrate_lookup_password_to_hash.sql
--
-- 목적: applications 테이블의 client_lookup_password 컬럼에 저장된
--       평문(legacy) 값을 SHA-256 hash 값으로 일괄 변환합니다.
--
-- 전제 조건:
--   - PostgreSQL 확장 pgcrypto가 활성화되어 있어야 합니다.
--     (Supabase는 기본 활성화)
--   - 007_client_lookup_password.sql 이 이미 적용되어 있어야 합니다.
--
-- SALT 값:
--   Node.js 코드(lib/lookup-password.ts)의 SALT_PREFIX 와 동일해야 합니다.
--   기본값: 'freetourbus-lookup-v1:'
--   환경변수 LOOKUP_PW_SALT 를 변경한 경우 아래 salt 값을 동일하게 수정하세요.
--
-- 실행 방법:
--   psql $DATABASE_URL -f sql/043_migrate_lookup_password_to_hash.sql
--   또는 Supabase SQL Editor에서 직접 실행
--
-- 안전성:
--   - WHERE 조건으로 평문 레코드(64자 hex가 아닌 값)만 대상으로 합니다.
--   - 이미 hash된 레코드(64자 hex)는 변경하지 않습니다.
--   - 트랜잭션으로 감싸 실패 시 롤백됩니다.

BEGIN;

-- pgcrypto 확장 활성화 (이미 활성화된 경우 무시됨)
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- 평문 레코드를 SHA-256 hash로 업데이트
-- 조건: client_lookup_password 가 NULL이 아니고, 64자 hex 형식이 아닌 경우
UPDATE public.applications
SET
  client_lookup_password = encode(
    digest('freetourbus-lookup-v1:' || client_lookup_password, 'sha256'),
    'hex'
  ),
  client_lookup_password_set_at = COALESCE(
    client_lookup_password_set_at,
    NOW()
  )
WHERE
  client_lookup_password IS NOT NULL
  AND client_lookup_password <> ''
  -- 64자 hex 형식이 아닌 경우만 대상 (이미 hash된 레코드 제외)
  AND NOT (
    LENGTH(client_lookup_password) = 64
    AND client_lookup_password ~ '^[0-9a-f]{64}$'
  );

-- 마이그레이션 결과 확인
DO $$
DECLARE
  updated_count INTEGER;
  legacy_count  INTEGER;
BEGIN
  GET DIAGNOSTICS updated_count = ROW_COUNT;

  SELECT COUNT(*) INTO legacy_count
  FROM public.applications
  WHERE
    client_lookup_password IS NOT NULL
    AND client_lookup_password <> ''
    AND NOT (
      LENGTH(client_lookup_password) = 64
      AND client_lookup_password ~ '^[0-9a-f]{64}$'
    );

  RAISE NOTICE '마이그레이션 완료: % 건 hash 변환됨', updated_count;
  RAISE NOTICE '남은 평문 레코드: % 건 (0이어야 정상)', legacy_count;

  IF legacy_count > 0 THEN
    RAISE WARNING '평문 레코드가 % 건 남아 있습니다. SALT 값을 확인하세요.', legacy_count;
  END IF;
END $$;

COMMIT;
