# 청구리 API 명세서 (v0.2)

**2026 CLUE DAY 1차 제출 / 한라봉귤흑돼지 / 2026.10.26 / 프로그램 기준 cdc97da**

로컬 기본 주소는 `http://localhost:8000`입니다. 자동 문서는 `/docs`, 스키마는 `/openapi.json`에서 제공합니다. PDF·HTML·Markdown은 같은 원본으로 생성합니다.

## 1. 현재 범위와 엔드포인트

- 규칙 기반의 **예상 안내**입니다. 실제 특보·OCR·푸시·기관 API는 개발 예정입니다.
- 날짜·시군·질병코드·조건과 입력한 진료 상황은 서버에서 처리하지만 저장하지 않습니다. 이름·계좌·가족·진료 건별 기록은 브라우저에만 보관합니다.
- 준비 요약서가 공식 청구서·서명·동의·증빙 준비와 보험사 접수를 대체하지 않습니다.

| 메서드 | 경로 | 현재 기능 |
|---|---|---|
| GET | /api/health | 서비스 상태·버전 |
| GET | /api/coverages | 보장표·감염병 목록·출처 |
| GET | /api/alerts | 샘플 특보와 미검증 상태 |
| POST | /api/doctor-card | 입력한 상황으로 카드 생성 |
| GET | /api/claim-channels | 2026년 공식 접수 채널 안내 |
| POST | /api/eligibility | 예상 항목·확인 대기·서류·계산상 기한 |

### GET /api/health

필수 쿼리·본문 없음. 응답 200:

```json
{"status":"ok", "service":"청구리", "version":"0.2.0"}
```

### GET /api/coverages

선택 쿼리 `target`: `all`은 전 도민 항목, `vulnerable`은 취약계층 전용 항목입니다. 생략하면 전체 항목, 잘못된 값은 422를 반환합니다.

| 응답 필드 | 형식 | 의미 |
|---|---|---|
| policy_period | string | 적용 보험기간 |
| items | object[] | id, name, target, amount, condition, codes, docs |
| infections | string[] | 입력 화면에서 사용할 감염병 10종 |
| source | string | 보장표의 공식 출처 URL |

금액은 원 단위 정수입니다. 보장표 목록 자체가 개인의 지급 자격을 확정하지 않습니다.

<div class="page-break"></div>

## 2. 특보·진료 카드·접수 안내

### GET /api/alerts

쿼리: `sigungu` (기본 부천시), `on` (선택, YYYY-MM-DD). 아래는 응답 200의 예입니다.

```json
{
  "sigungu": "고양시", "date": "2026-08-05",
  "alerts": [], "source": "sample",
  "status": "unknown", "verified": false,
  "notice": "기상청 실시간·과거 특보와 연결되지 않은 시연용 데이터입니다. 데이터가 없어도 특보가 없었다는 뜻은 아닙니다."
}
```

`sample_match`는 예시가 있다는 뜻이고, `unknown`은 자료를 확인할 수 없다는 뜻입니다. 모두 실제 특보 확인 결과가 아닙니다. 현재 응답은 `verified=false`이며, 일반 모드의 특보 의존 항목을 확정하는 데 사용하지 않습니다.

### POST /api/doctor-card

필수: `weather` (`폭염`/`한파`/`기타`), `exposure` (빈 문자열 불가), `hours` (0 초과~24).
선택: `symptoms` (string[]). 호환용 `alert_type`을 받아도 특보 발령을 단정해 쓰지 않습니다.

```json
{"weather":"한파", "exposure":"야외 산책", "hours":1.5, "symptoms":["손발 저림"]}
```

응답 200: `title` (string), `lines` (입력한 상황 문장 배열), `request` (서류 발급 요청), `notice` (의사 판단·특정 진단코드 미요청 안내). 필수 입력 누락·범위 오류는 422입니다. 증상·활동·시간의 임의 기본값을 생성하지 않습니다.

### GET /api/claim-channels

필수 쿼리·본문 없음. 응답 200은 2026년 공식 안내 기준의 접수 채널입니다.

| 응답 필드 | 형식 | 의미 |
|---|---|---|
| insurer | string | 계약 보험사 안내 |
| channels | object[] | type (카카오톡/이메일/팩스/우편), how (이용 방법) |
| call_center | string | 문의 전화 |
| payout | string | 공식 안내의 처리 기간 설명. 개별 지급일 보장 아님 |
| source | string | 공식 안내 URL |

자동 접수는 수행하지 않습니다. 2025년 사고는 당시 약관과 접수처를 별도로 확인해야 합니다.

<div class="page-break"></div>

## 3. POST /api/eligibility - 요청

진료·사고 조건으로 예상 보장과 확인 대기를 안내합니다. 형식 오류·필수값 누락은 FastAPI의 `detail` 배열을 포함한 422 응답입니다.

| 필드 | 타입 / 기본값 | 의미 |
|---|---|---|
| event_date | date, 필수 | 진료·사고일. 일반 모드 미래 날짜는 422 |
| sigungu | string / 부천시 | 사고·진료 발생 시군. 거주지와 별도로 입력 |
| resident_on_event | boolean 또는 null / null | 사고 당일 가입 대상 여부의 사용자 확인 |
| diagnosis_codes | string[] / [] | T67, T67.0, T34.1 등. 공백 제거·대문자 정규화, 잘못된 형식은 422 |
| infection | string 또는 null | 안내된 특정 감염병 이름 |
| diagnosis_already_paid | boolean / false | 입력한 온열·한랭 진단비의 보험기간 내 기지급 여부 |
| er_visit | boolean / false | 관련 응급실 진료 여부 |
| hospital_days | integer >= 0 / 0 | 온열·한랭질환 입원 일수 |
| vulnerable | boolean / false | 방문건강관리사업 대상 또는 임산부 |
| clinic_visits_on_alert_days | integer >= 0 / 0 | 특보일 통원 횟수. 각 날짜·지역의 실제 특보 확인 필요 |
| disaster_injury_weeks | integer >= 0 / 0 | 기후재해 상해 진단 주수 |
| disaster_related | boolean 또는 null / null | 해당 기상현상으로 인한 사고인지 사용자 확인 |
| death | boolean / false | 관련 사망으로 인한 유족 청구 |
| age | integer 0~130 또는 null | 사고 당시 나이 |
| demo_mode | boolean / false | 샘플 특보·미래 사례를 허용하는 가상 시연. 응답에도 표시 |

### 일반 요청 예시

```json
{
  "event_date": "2026-08-05", "sigungu": "부천시",
  "resident_on_event": true,
  "diagnosis_codes": ["T67.0"], "er_visit": true
}
```

예상 항목 합계는 `total_amount=250000`, 상태는 `estimated`, `demo_mode=false`입니다.
특보가 필요 없는 진단비와 관련 응급실 보장은 입력 조건으로 안내할 수 있습니다.

<div class="page-break"></div>

## 4. 판정 응답·운용 경계·검증

| 응답 필드 | 해석 |
|---|---|
| policy_year / status | 약관 연도 / demo, needs_confirmation, estimated, not_covered, no_match |
| eligible | 입력 조건으로 계산 가능한 예상 항목이 있는지. 지급 자격 확정 아님 |
| items / pending_items | 예상 항목 / 추가 확인할 항목의 id·이름·이유. 대기는 미대상 확정이 아님 |
| total_amount | items 합계. 확인 대기는 제외 |
| can_prepare_summary | 가입 대상·기간 조건상 준비 요약서를 만들 수 있는지 |
| weather / demo_mode | 특보 출처·확인 상태 / 가상 시연 여부 |
| alerts_on_event_date | 일반 모드는 빈 배열. 명시적 시연에서만 샘플 반환 |
| required_docs | 현재 예상 항목에 필요한 서류 |
| claim_deadline / deadline_passed | 사고일 + 3년의 계산상 기한 / 경과 여부 |
| notes / disclaimer / policy_source | 가정·지원 범위·안내 문구 / 공식 출처 |

### 주요 처리 원칙

- 가입 대상이 아니라고 입력하거나 기한 경과·지원 기간 밖이면 금액을 합산하지 않습니다. 가입 대상 미확인은 조건부 예상만 제공하고 요약서는 보류합니다.
- 실제 특보 미확인은 200과 확인 대기를 반환합니다. 시연에서도 샘플이 없으면 특보를 추정하지 않습니다.
- 상해 위로금의 일반 4주·취약계층 2주 조건을 구분합니다. 응급실 보장 자체에는 4주 조건을 적용하지 않습니다.
- 기지급 진단비는 제외합니다. 나이 없는 사망위로금은 확인 대기이며 남은 한도·병급은 보험사 확인이 필요합니다.
- 2025년 사고는 온열·한랭 진단비만 안내하고 그 외 보장·접수처의 확인을 요청합니다.

### 가상 사례

`demo_mode=true`, 2026.12.16 부천시 샘플 한파, 가입 대상·취약계층, T68, 응급실, 입원 2일, 별도 통원 1회, 나이 72를 가정하면 15만+10만+20만+2만=47만 원입니다. 실제 증빙·병급이 검증된 지급 확정액이 아닙니다. 화면 시연 모드는 개인 기록을 읽거나 저장하지 않습니다.

### 운용과 검증

- 현재 공개 안내·추정 API는 인증 없이 로컬 실행합니다. 기관 인증·실제 접수 API는 제공하지 않습니다. 운영 배포 시 허용 출처·요청 제한·로그 정책을 별도로 설정해야 합니다.
- 서버 회귀 테스트: 프로젝트 루트 또는 backend에서 `python -m pytest -q` (33개).
- 화면 상태 분리: `node --test tests/frontend-state.test.cjs` (7개).
- 화면 6개·API 6개, 일반/시연·사람/진료 건 전환·카드·요약서 동작을 확인했습니다.
