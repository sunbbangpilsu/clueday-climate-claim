"""청구리 API: 경기 기후보험 '받을 권리' 청구 도우미.

실행: uvicorn app.main:app --reload   (backend 폴더에서)
문서: http://localhost:8000/docs
"""
from datetime import date
from pathlib import Path
from typing import Literal

from fastapi import FastAPI, Query
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel, Field

from .alerts import alerts_for, alerts_on
from .coverage import CLAIM_CHANNELS, COVERAGES, INFECTIONS
from .eligibility import evaluate

app = FastAPI(
    title="청구리 API",
    version="0.1.0",
    description="경기 기후보험 보장 판정·서류 안내 API. 이름·주민번호·진단서 원본은 받지 않습니다.",
)
# 1차 시연용: 로컬 프론트엔드에서 호출할 수 있게 연다. 배포 시 프론트 도메인만 허용한다.
app.add_middleware(CORSMiddleware, allow_origins=["*"], allow_methods=["GET", "POST"], allow_headers=["*"])


class EligibilityRequest(BaseModel):
    event_date: date = Field(..., description="진료·사고 날짜", examples=["2026-08-05"])
    sigungu: str = Field("부천시", description="사고가 난 시군 (기상특보 확인용)")
    diagnosis_codes: list[str] = Field(default_factory=list, description="진단서·소견서의 질병코드",
                                       examples=[["T67.0"]])
    infection: str | None = Field(None, description=f"감염병 이름 ({', '.join(INFECTIONS)})")
    er_visit: bool = Field(False, description="응급실 진료 여부")
    hospital_days: int = Field(0, ge=0, description="입원 일수")
    clinic_visits_on_alert_days: int = Field(0, ge=0, description="기상특보 발령일 통원 횟수 (취약계층)")
    disaster_injury_weeks: int = Field(0, ge=0, description="기후재해 사고 진단 주수")
    death: bool = Field(False, description="사망 여부 (유족 청구)")
    age: int | None = Field(None, ge=0, le=130, description="나이 (미성년자 서류·사망위로금 판정용)")
    vulnerable: bool = Field(False, description="기후취약계층 여부 (방문건강관리사업 대상 또는 임산부)")


class DoctorCardRequest(BaseModel):
    weather: Literal["폭염", "한파"] = "폭염"
    exposure: str = Field("야외 작업", description="노출 상황", examples=["야외 작업", "난방 없는 실내"])
    hours: float = Field(2, ge=0, le=24, description="노출 시간")
    symptoms: list[str] = Field(default_factory=list, examples=[["어지러움", "두통", "구역질"]])
    alert_type: str | None = Field(None, description="당일 발령된 특보 (예: 폭염경보)")


@app.get("/api/health", tags=["시스템"], summary="서버 상태 확인")
def health():
    return {"status": "ok", "service": "청구리", "version": app.version}


@app.get("/api/coverages", tags=["보장"], summary="2026 경기 기후보험 보장 항목 목록")
def coverages(target: Literal["all", "vulnerable"] | None = Query(None, description="all=도민 전체, vulnerable=취약계층 특약")):
    items = [c for c in COVERAGES if target is None or c["target"] == target]
    return {"policy_period": "2026-04-11 ~ 2027-04-10", "items": items, "source": "https://www.gg.go.kr/gg_insure"}


@app.get("/api/alerts", tags=["기상특보"], summary="시군의 기상특보 조회")
def alerts(sigungu: str = Query("부천시", description="시군 이름"),
           on: date | None = Query(None, description="이 날짜에 발령 중인 특보만 (YYYY-MM-DD)")):
    data = alerts_on(sigungu, on) if on else alerts_for(sigungu)
    return {"sigungu": sigungu, "date": on.isoformat() if on else None, "alerts": data, "source": "sample"}


@app.post("/api/eligibility", tags=["판정"], summary="받을 수 있는 보험금과 필요 서류 판정")
def eligibility(req: EligibilityRequest):
    return evaluate(req)


@app.post("/api/doctor-card", tags=["진료 전 안내"], summary="진료 때 의사에게 보여줄 상황 전달 카드")
def doctor_card(req: DoctorCardRequest):
    when = f"오늘 {req.alert_type} 발령 중에" if req.alert_type else f"오늘 {req.weather} 속에서"
    lines = [f"{when} {req.exposure}을(를) 약 {req.hours:g}시간 했습니다."]
    if req.symptoms:
        lines.append("증상: " + ", ".join(req.symptoms))
    return {
        "title": "진료 전에 보여주세요",
        "lines": lines,
        "request": "경기 기후보험 청구를 위해, 진료 후 질병명과 질병분류코드가 기재된 진단서(또는 소견서) 발급을 부탁드립니다.",
        "notice": "이 카드는 노출 상황을 전달하기 위한 것입니다. 진단은 의사의 판단이며 특정 질병코드를 요청하지 않습니다.",
    }


@app.get("/api/claim-channels", tags=["청구"], summary="보험금 청구 접수 채널 안내")
def claim_channels():
    return CLAIM_CHANNELS


# 같은 레포의 frontend 폴더가 있으면 http://localhost:8000/ 에서 화면도 함께 보여준다 (시연·심사 편의)
FRONTEND = Path(__file__).resolve().parents[2] / "frontend"
if FRONTEND.is_dir():
    app.mount("/", StaticFiles(directory=FRONTEND, html=True), name="frontend")
