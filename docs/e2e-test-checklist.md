# E2E 테스트 체크리스트

> 클라이언트 신청 → 스폰서 지원검토/확정 → 파트너 견적제출 → 클라이언트 매칭완료 → 어드민 확인

---

## 사전 준비

- [ ] 개발/스테이징 서버 접속 확인
- [ ] 클라이언트 테스트 계정 준비
- [ ] 스폰서 테스트 계정 준비 (status = approved, 지원종류 + 지역 설정 완료)
- [ ] 파트너 테스트 계정 준비 (수신지역 설정 완료)
- [ ] 어드민 계정 준비
- [ ] DB 직접 조회 가능 (Supabase Dashboard 또는 스크립트)

---

## STEP 1 — 클라이언트: 신규 견적요청 생성

### 수동 체크

| # | 항목 | 기대값 | 결과 |
|---|------|--------|------|
| 1-1 | 홈화면 "신규 견적요청" 폼 접근 | 폼 렌더링 정상 | ☐ |
| 1-2 | 단체유형 = "공공기관" 선택 | DB에 `group_type = "공공기관"` 저장 | ☐ |
| 1-3 | 단체유형 = "협회" 선택 | DB에 `group_type = "협회"` 저장 | ☐ |
| 1-4 | 출발지 선택 (예: 서울) | `departure_region = "서울"` | ☐ |
| 1-5 | 희망견적유형 = "일반견적, 할인견적" 선택 | `selected_price_type_options` 저장 | ☐ |
| 1-6 | 일반견적 목표가 입력 (예: 500,000) | `target_normal_price = 500000` | ☐ |
| 1-7 | 할인견적 목표가 입력 (예: 50,000) | `target_member_price = 50000` | ☐ |
| 1-8 | 제출 후 클라이언트 대시보드 "견적요청중" 탭에 표시 | 카드 1건 | ☐ |

### DB 확인 쿼리

```sql
SELECT id, group_type, departure_region, target_normal_price, target_member_price,
       application_type, quote_status, sponsor_support_status
FROM applications
ORDER BY created_at DESC
LIMIT 5;
```

**실패 시 확인 필드:** `applications.group_type`, `applications.departure_region`

---

## STEP 2 — 스폰서 대시보드: 지원검토 / 지원확정

### 수동 체크

| # | 항목 | 기대값 | 결과 |
|---|------|--------|------|
| 2-1 | 스폰서 대시보드 > 설정 > 지원종류 | 지역 설정 UI 존재 | ☐ |
| 2-2 | 지원지역에 "서울" 포함하여 저장 | `sponsor_rules.service_regions` 배열에 "서울" 포함 | ☐ |
| 2-3 | 서울 출발 신청이 "지원검토" 탭에 표시 | 1건 이상 표시 | ☐ |
| 2-4 | 단체유형 필터 조건 일치 확인 | 공공기관/협회 등 지원 대상에 포함 | ☐ |
| 2-5 | 지원확정 버튼 클릭 후 지원금액 입력 (예: 300,000) | `approved_support_amount = 300000` | ☐ |
| 2-6 | 확정 후 "지원완료" 탭으로 이동 | 탭 이동 정상 | ☐ |
| 2-7 | 파트너 대시보드에 "지원확정" 배지 표시 | 해당 신청에 "지원확정" 표시 | ☐ |

### DB 확인 쿼리

```sql
-- 가승인 상태 확인
SELECT id, status, application_id, estimated_support_amount, approved_support_amount,
       sponsor_rule_id
FROM sponsor_preapprovals
WHERE application_id = '<APPLICATION_ID>'
ORDER BY created_at DESC;

-- 스폰서 규칙 지역 설정 확인
SELECT id, title, service_regions, target_groups
FROM sponsor_rules
WHERE status = 'active'
ORDER BY created_at DESC
LIMIT 5;

-- 신청 스폰서 상태 확인
SELECT id, sponsor_support_status, sponsor_approved_count, sponsor_approved_support_amount
FROM applications
WHERE id = '<APPLICATION_ID>';
```

**실패 시 확인 필드:**
- `sponsor_preapprovals.status` (preapproved / approved)
- `sponsor_preapprovals.approved_support_amount`
- `sponsor_rules.service_regions`
- `applications.sponsor_support_status`

---

## STEP 3 — 파트너 대시보드: 견적 제출

### 수동 체크

| # | 항목 | 기대값 | 결과 |
|---|------|--------|------|
| 3-1 | 파트너 대시보드 > 수신지역 설정 | 지역 목록 + 전체선택 버튼 존재 | ☐ |
| 3-2 | "서울" 포함하여 수신지역 저장 | DB에 서울 포함 | ☐ |
| 3-3 | "신규 견적" 탭에 서울 출발 신청 표시 | 카드 1건 이상 | ☐ |
| 3-4 | 카드에 "지원단계" 표시 (지원검토 or 지원확정) | 배지 표시 정상 | ☐ |
| 3-5 | "지원확정" 상태일 때 총 확정 지원금 표시 | 300,000원 | ☐ |
| 3-6 | 견적제출 폼 열기 (일반견적가 입력: 600,000) | 입력 가능 | ☐ |
| 3-7 | 고객 확정 지원금 입력 (200,000) | 입력 가능 | ☐ |
| 3-8 | 기사 확정 지원금 실시간 계산: 300,000 - 200,000 = **100,000** | 100,000원 표시 | ☐ |
| 3-9 | 확정 연장 지원금 실시간 계산 (연장 1회 기준: 100,000 × 20% = **20,000**) | 20,000원 표시 | ☐ |
| 3-10 | 지원금 할인 적용가: 600,000 - 200,000 - 20,000 = **380,000** | 380,000원 표시 | ☐ |
| 3-11 | 지원검토 단계에서 "지원금 확정금액에 따라 변동될 수 있습니다" 안내 표시 | 텍스트 표시 | ☐ |
| 3-12 | 견적 제출 버튼 클릭 후 "제출 견적" 탭으로 이동 | 탭 이동 정상 | ☐ |
| 3-13 | 기존 제출 견적 수정 → 고객 지원금 변경 시 실시간 재계산 | 즉시 반영 | ☐ |
| 3-14 | 수정 저장 후 "제출 견적" 탭에 새 값 반영 | loadCalls 후 갱신 | ☐ |

### DB 확인 쿼리

```sql
SELECT id, price, support_breakdown,
       planned_total_support, planned_customer_support, planned_driver_support,
       planned_discount_price,
       confirmed_total_support, confirmed_customer_support, confirmed_driver_support,
       confirmed_discount_price, confirmed_final_price,
       final_member_price, extension_support_amount,
       sponsor_support_status
FROM driver_quotes
WHERE application_id = '<APPLICATION_ID>'
ORDER BY created_at DESC
LIMIT 3;
```

**실패 시 확인 필드:**
- `driver_quotes.support_breakdown` (JSONB — planned/confirmed 양쪽 포함 여부)
- `driver_quotes.confirmed_discount_price` (extension 차감 후 값인지)
- `driver_quotes.final_member_price`
- `driver_quotes.extension_support_amount`

### support_breakdown 정합성 확인

```sql
-- support_breakdown 주요 필드 추출
SELECT id,
       (support_breakdown->>'planned_discount_price')::int AS sb_planned_discount,
       (support_breakdown->>'confirmed_discount_price')::int AS sb_confirmed_discount,
       (support_breakdown->>'final_discount_price')::int AS sb_final_discount,
       (support_breakdown->>'confirmed_total_support')::int AS sb_confirmed_total,
       support_breakdown->>'capture_phase' AS capture_phase
FROM driver_quotes
WHERE application_id = '<APPLICATION_ID>'
ORDER BY created_at DESC;
```

---

## STEP 4 — 클라이언트 대시보드: 견적 확인 및 매칭완료

### 수동 체크

| # | 항목 | 기대값 | 결과 |
|---|------|--------|------|
| 4-1 | "자동마감" 탭 또는 "견적요청중" 탭에 제휴기사 견적 표시 | 카드 1건 | ☐ |
| 4-2 | 지원검토 단계에서 "지원금 할인 예상가" 표시 | 예상가 금액 | ☐ |
| 4-3 | 지원검토 단계에서 "후원사 확정금액에 따라 변동될 수 있습니다" 안내 | 텍스트 표시 | ☐ |
| 4-4 | 지원확정 단계에서 "지원금 할인 적용가" 표시 | 확정가 금액 | ☐ |
| 4-5 | "일반견적으로 매칭완료" 버튼 클릭 가능 | 클릭 가능 | ☐ |
| 4-6 | "지원금 할인 적용가로 매칭완료" 버튼 클릭 가능 | 클릭 가능 | ☐ |
| 4-7 | 매칭완료 후 "매칭완료" 탭 > "진행중" 서브탭에 표시 | 카드 표시 | ☐ |
| 4-8 | 매칭완료 탭 > "매칭 세부내역" > "선택 견적" 라벨 정확 | "지원금 할인 적용가 XXX원" | ☐ |
| 4-9 | 지원검토 상태에서 매칭 후 스폰서 확정 → "선택 견적" 자동 업데이트 | "지원금 할인 적용가"로 변경 | ☐ |
| 4-10 | 지원검토 + 미확정 매칭 시 "선택 견적" 아래 안내문구 표시 | 텍스트 표시 | ☐ |

### DB 확인 쿼리

```sql
SELECT id,
       selected_price_type,
       selected_price_label,
       selected_price,
       client_price_selection_kind,
       final_selected_quote_id,
       final_selected_quote_source,
       sponsor_support_status
FROM applications
WHERE id = '<APPLICATION_ID>';
```

**기대값:**

| 시나리오 | selected_price_type | selected_price_label |
|---------|--------------------|--------------------|
| 일반견적 매칭 | `normal` | `일반견적가` |
| 지원검토 예상가 매칭 | `support_planned` | `지원금 할인 예상가` |
| 지원확정 적용가 매칭 | `support_confirmed` | `지원금 할인 적용가` |

---

## STEP 5 — 어드민 대시보드: 상태 확인

### 수동 체크

| # | 항목 | 기대값 | 결과 |
|---|------|--------|------|
| 5-1 | 클라이언트 신청 리스트 "상태" 컬럼 | `견적요청중 / 자동마감 / 매칭완료` 표시 | ☐ |
| 5-2 | 매칭전 신청 상태 컬럼 | `견적요청중` | ☐ |
| 5-3 | 매칭완료 신청 상태 컬럼 | `매칭완료` | ☐ |
| 5-4 | 신규 견적 클릭 → 팝업 열림 | 통일된 상세 팝업 표시 | ☐ |
| 5-5 | 팝업 1. 신청 기본정보 표시 | 출발/도착/인원 등 | ☐ |
| 5-6 | 팝업 2. 진행 상태 (고객단계 / 스폰서단계) | 올바른 단계 표시 | ☐ |
| 5-7 | 팝업 2. 스폰서단계 = 지원확정 시 "지원확정" 표시 | `지원확정` | ☐ |
| 5-8 | 팝업 4. 매칭기사 (미매칭) | "아직 매칭된 기사가 없습니다." | ☐ |
| 5-9 | 팝업 4. 매칭기사 (매칭완료) | 기사명, 연락처 표시 | ☐ |
| 5-10 | 팝업 5. 견적종합 (제출 견적 없음) | "아직 제출된 견적이 없습니다." | ☐ |
| 5-11 | 팝업 5. 견적종합 (제출 견적 있음) | 지원금 breakdown 표시 | ☐ |
| 5-12 | 팝업 6. 문자발송 로그 | 있으면 표시, 없으면 안내문 | ☐ |

---

## 전체 흐름 계산 예시 검증

> **시나리오:** 지원확정 300,000 / 일반견적가 600,000 / 고객 지원금 200,000 / 연장 1회

| 항목 | 계산식 | 기대값 |
|------|--------|--------|
| 기사 확정 지원금 | 300,000 - 200,000 | **100,000원** |
| 확정 연장 지원금 | 100,000 × 20% × 1회 | **20,000원** |
| 지원금 할인 적용가 | 600,000 - 200,000 - 20,000 | **380,000원** |

---

## 자동 검증 스크립트 실행 방법

```bash
# 환경변수 설정 (Windows PowerShell)
$env:NEXT_PUBLIC_SUPABASE_URL = "https://xxxx.supabase.co"
$env:SUPABASE_SERVICE_ROLE_KEY = "your-service-role-key"

# 최근 견적 자동 선택
npm run verify:e2e

# 특정 신청서 지정
$env:E2E_APPLICATION_ID = "your-application-uuid"
npm run verify:e2e
```

---

## 실패 시 빠른 디버깅 쿼리

```sql
-- 1. 신청서 전체 상태 한눈에 보기
SELECT
  id, receipt_number, group_type, departure_region,
  quote_status, sponsor_support_status, final_selected_quote_id,
  selected_price_type, selected_price_label, selected_price,
  target_normal_price, target_member_price,
  created_at
FROM applications
WHERE id = '<APPLICATION_ID>';

-- 2. 스폰서 가승인 상태
SELECT id, status, estimated_support_amount, approved_support_amount,
       sponsor_rule_id, application_id
FROM sponsor_preapprovals
WHERE application_id = '<APPLICATION_ID>';

-- 3. 파트너 견적 지원금 전체
SELECT id, price,
       planned_total_support, planned_customer_support, planned_driver_support,
       confirmed_total_support, confirmed_customer_support, confirmed_driver_support,
       confirmed_discount_price, confirmed_final_price, final_member_price,
       extension_support_amount, support_settlement_type
FROM driver_quotes
WHERE application_id = '<APPLICATION_ID>'
ORDER BY created_at DESC;

-- 4. support_breakdown 상세 (주요 확정 필드)
SELECT id,
  (support_breakdown->>'normal_price')::int,
  (support_breakdown->>'planned_total_support')::int,
  (support_breakdown->>'planned_discount_price')::int,
  (support_breakdown->>'confirmed_total_support')::int,
  (support_breakdown->>'confirmed_discount_price')::int,
  (support_breakdown->>'final_discount_price')::int,
  (support_breakdown->>'extension_support')::int,
  support_breakdown->>'capture_phase',
  support_breakdown->>'support_stage'
FROM driver_quotes
WHERE application_id = '<APPLICATION_ID>'
ORDER BY created_at DESC;

-- 5. 스폰서 규칙 지역 설정
SELECT id, title, service_regions, target_groups, status
FROM sponsor_rules
ORDER BY created_at DESC
LIMIT 10;
```

---

## 알려진 제약사항

| 제약 | 설명 |
|------|------|
| 기존 제출 견적 | 버그 수정 전에 제출된 견적은 재제출 필요 |
| support_breakdown | `support_breakdown` 컬럼이 없는 레거시 DB는 fallback 동작 |
| 연장 재계산 | 스폰서 확정 시점에 `extension_round > 0`인 신청만 연장 지원금 자동 계산 |
| 매칭완료 후 견적 수정 | 고객이 매칭완료한 이후에는 파트너 견적 수정 불가 |
