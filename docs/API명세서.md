# 청구리 API 명세서 (v0.2)

현재 구현 기준 명세입니다. 자동 스키마는 `/openapi.json`, 실행 가능한 문서는 `/docs`에서 제공합니다.
로컬 기본 주소는 `http://localhost:8000`입니다. Python 3.12에서 검증했습니다.
기존 PDF/HTML 명세는 최초 기획 스냅샷입니다.

## 현재 범위와 데이터 처리

- 규칙에 따른 **예상 안내**이며 보험사의 지급 심사를 대체하지 않습니다.
- 실제 특보 데이터는 미연동입니다. 일반 모드에서 샘플을 실제 관측으로 사용하지 않습니다.
- 날짜·시군·질병코드·조건은 서버로 전송하지만 저장하지 않습니다.
- 이름·연락처·계좌·가족과 진료 건별 기록은 브라우저에만 보관합니다.
- 요약서는 공식 청구서의 대체물이 아니며, 서명·동의·증빙 준비와 실제 접수는 별도입니다.

## 엔드포인트

| 메서드 | 경로 | 현재 기능 |
|---|---|---|
| GET | `/api/health` | 서비스 상태와 버전 |
| GET | `/api/coverages` | 보장표, 출처, 감염병 선택 목록 (`infections`) |
| GET | `/api/alerts` | 샘플과 데이터 확인 상태. 실시간 조회 아님 |
| POST | `/api/eligibility` | 예상 항목, 확인 대기, 서류와 계산상 기한 |
| POST | `/api/doctor-card` | 사용자가 입력한 진료 상황 카드 |
| GET | `/api/claim-channels` | 2026년 공식 청구 채널 안내 |

OCR, 자동 알림 구독, 기관용 API는 개발 예정이며 현재 제공하지 않습니다.

## GET /api/alerts

쿼리: `sigungu` (기본 부천시), `on` (선택, YYYY-MM-DD).

```json
{
  "sigungu": "고양시",
  "date": "2026-08-05",
  "alerts": [],
  "source": "sample",
  "status": "unknown",
  "verified": false,
  "notice": "기상청 실시간·과거 특보와 연결되지 않은 시연용 데이터입니다. 데이터가 없어도 특보가 없었다는 뜻은 아닙니다."
}
```

`status=sample_match`는 예시가 있다는 뜻이며 실제 특보 확인을 의미하지 않습니다.
`status=unknown`도 실제 특보가 없다는 뜻이 아닙니다. 현재 모든 응답은 `verified=false`입니다.

## POST /api/eligibility

| 필드 | 타입 / 기본값 | 의미 |
|---|---|---|
| event_date | date, 필수 | 진료·사고일. 일반 모드 미래 날짜는 422 |
| sigungu | string / 부천시 | 사고·진료 발생 시군. 거주지와 별도로 입력 |
| resident_on_event | boolean 또는 null / null | 사고 당일 가입 대상 여부의 사용자 확인 |
| diagnosis_codes | string[] / [] | 예: T67, T67.0, T34.1. 공백 제거·대문자 정규화, 잘못된 형식은 422 |
| infection | string 또는 null | 안내된 특정 감염병 이름 |
| diagnosis_already_paid | boolean / false | 현재 입력한 온열·한랭 진단비의 보험기간 내 기지급 여부 |
| er_visit | boolean / false | 관련 응급실 진료 여부 |
| hospital_days | integer >= 0 / 0 | 온열·한랭질환 입원 일수 |
| vulnerable | boolean / false | 방문건강관리사업 대상 또는 임산부 |
| clinic_visits_on_alert_days | integer >= 0 / 0 | 특보일 통원 횟수. 각 날짜·지역의 특보 확인 필요 |
| disaster_injury_weeks | integer >= 0 / 0 | 기후재해 상해 진단 주수 |
| disaster_related | boolean 또는 null / null | 해당 기상현상으로 인한 사고인지 사용자 확인 |
| death | boolean / false | 관련 사망으로 인한 유족 청구 |
| age | integer 0~130 또는 null | 사고 당시 나이 |
| demo_mode | boolean / false | 샘플 특보와 미래 사례를 허용하는 가상 시연. 응답에도 반드시 표시 |

### 일반 요청 예시

```json
{
  "event_date": "2026-08-05",
  "sigungu": "부천시",
  "resident_on_event": true,
  "diagnosis_codes": ["T67.0"],
  "er_visit": true
}
```

응답에는 예상 항목 합계 `total_amount=250000`, `status=estimated`, `demo_mode=false`가 포함됩니다.
특보가 필요 없는 진단비와 관련 응급실 보장은 입력 조건으로 안내할 수 있습니다.

### 응답의 상태

| 필드 | 해석 |
|---|---|
| status | `demo`, `needs_confirmation`, `estimated`, `not_covered`, `no_match` |
| eligible | 입력 조건으로 계산 가능한 예상 항목이 있는지. 지급 자격 확정 아님 |
| items | 현재 입력으로 계산한 항목 |
| pending_items | 추가 확인할 항목의 id·이름·이유. **미대상 확정이 아님** |
| total_amount | items 합계. pending_items는 제외 |
| can_prepare_summary | 가입 대상 확인·기간 등의 조건상 준비 요약서를 만들 수 있는지 |
| weather | 샘플 출처·확인 상태. 일반 모드에 실제 특보로 반영하지 않음 |
| alerts_on_event_date | 일반 모드는 빈 배열. 명시적 시연에서만 샘플 반환 |
| required_docs | 현재 예상 항목의 준비 서류 |
| claim_deadline / deadline_passed | 사고일 + 3년 계산 결과와 경과 여부 |
| notes / disclaimer | 가정·지원 범위·확인 필요 사항 |

### 주요 판정 경계

- 가입 대상이 아니라고 입력하거나 청구기한 경과·지원 기간 밖이면 금액을 합산하지 않습니다.
- 가입 대상이 미확인이면 조건부 예상만 안내하며 요약서 생성은 보류합니다.
- 일반 모드에서 특보가 필요한 통원비·상해 위로금 등은 `pending_items`로 반환합니다.
- 시연에서도 대응 샘플이 없으면 특보를 임의로 추정하지 않습니다.
- 일반 상해 위로금 4주, 취약계층 2주 조건을 구분합니다. 응급실 보장 자체에 4주 조건을 적용하지 않습니다.
- 입력한 진단비가 이미 지급됐으면 해당 진단비를 제외합니다. 나머지 한도·병급은 보험사 확인이 필요합니다.
- 나이 없는 사망위로금은 확인 대기입니다.
- 2025년 사고는 온열·한랭 진단비만 안내하며, 나머지 보장과 당시 접수처 확인을 요청합니다.

### 시연 사례

`demo_mode=true`, 2026-12-16 부천시 샘플 한파, 가입 대상·취약계층, T68, 응급실, 입원 2일,
별도 통원 1회, 나이 72를 가정하면 15만+10만+20만+2만=47만 원입니다.
실제 각 항목의 증빙과 병급 가능 여부를 검증한 지급 확정액이 아닙니다.
프론트엔드 시연 모드는 개인 기록을 읽거나 저장하지 않습니다.

## POST /api/doctor-card

`weather` (`폭염`/`한파`/`기타`), `exposure` (빈 문자열 불가), `hours` (0 초과~24)는 필수입니다.
`symptoms`는 선택 배열입니다. 기본 증상·활동·노출 시간을 만들어 넣지 않습니다.
호환용 `alert_type`을 받아도 검증되지 않은 특보 발령을 카드에 단정해서 쓰지 않습니다.
사용자가 입력한 상황과 서류 발급 요청을 반환하며 특정 진단코드를 요청하지 않습니다.

## 검증

- 서버: 프로젝트 루트 또는 backend에서 `python -m pytest -q` (33개).
- 화면 상태 분리: `node --test tests/frontend-state.test.cjs` (7개).
- 실행 후 일반 모드·가상 시연, 사람/진료 건 전환, 감염병 입력, 진료 카드와 준비 요약서를 확인합니다.
