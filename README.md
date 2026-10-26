# 받을권리 — 경기 기후보험 '받을 권리' 청구 에이전트

자동가입된 경기 기후보험, **받을 권리까지** 챙겨주는 청구 도우미입니다.
기상특보를 계기로 보장 대상인지 감지하고, 진료 전 안내부터 보장 판정·서류 준비·청구서 작성까지 함께합니다.

2026 가톨릭대학교 컴퓨터정보공학부 학술제 CLUE DAY 출품작

## 바로 실행하기 (1분)

```bash
cd backend
python -m pip install -r requirements.txt
python -m uvicorn app.main:app --port 8000
```

- 화면: http://localhost:8000/ (시연용 예시 상태: http://localhost:8000/?demo=1#result)
- API 문서(Swagger): http://localhost:8000/docs
- 테스트: `backend` 폴더에서 `python -m pytest -q`

프론트엔드만 따로 띄울 때는 `frontend` 폴더에서 `python -m http.server 5500` 후 http://localhost:5500 (백엔드는 8000번 포트).

## 구성

| 폴더 | 내용 |
|---|---|
| `backend/` | FastAPI 서버. 보장표(`app/coverage.py`), 판정 규칙(`app/eligibility.py`), 기상특보(`app/alerts.py`, 1차는 샘플 데이터) |
| `frontend/` | 모바일 웹. 홈·진료 카드·보험금 확인·판정 결과·청구서·가족 6개 화면 (`index.html`, `app.js`, `styles.css`) |
| `docs/` | 서비스 기획안, API 명세서, UI/UX 시안 (PDF·원본), `openapi.json` |
| `tools/build_docs.py` | 문서 Markdown → PDF 변환 |

## API 요약

| 메서드 | 경로 | 설명 |
|---|---|---|
| GET | `/api/health` | 서버 상태 |
| GET | `/api/coverages` | 2026 경기 기후보험 보장 항목 |
| GET | `/api/alerts?sigungu=부천시&on=2026-12-16` | 시군 기상특보 (1차: 샘플) |
| POST | `/api/eligibility` | 받을 수 있는 보험금·근거·필요 서류·청구 기한 판정 |
| POST | `/api/doctor-card` | 진료 전 상황 전달 카드 |
| GET | `/api/claim-channels` | 청구 접수 채널 |

자세한 내용은 [docs/API명세서.md](docs/API명세서.md)

## 개인정보·윤리 원칙

- 서버는 이름·주민번호·연락처·계좌·진단서 원본을 **받지 않고**, 판정 요청도 **저장하지 않습니다.**
- 청구서에 들어가는 개인정보와 가족 정보는 사용자 기기에만 저장됩니다.
- 진료 카드는 노출 상황을 전달하고 청구용 서류 발급을 요청할 뿐, **특정 질병코드를 요구하지 않습니다** (테스트로 검증).
- 판정은 예상치이며 최종 지급은 보험사 심사로 결정됩니다.

## 데이터 출처

- 경기도 기후보험 안내: https://www.gg.go.kr/gg_insure (보험기간 2026.4.11 ~ 2027.4.10)
- 기상특보: 1차 제출본은 시연용 샘플, 2차에서 기상청 특보 오픈API로 교체 예정
