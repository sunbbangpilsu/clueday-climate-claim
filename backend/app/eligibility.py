"""받을 수 있는 보험금 판정 (규칙 기반).

개인을 식별하는 정보(이름, 주민번호, 진단서 원본)는 받지 않는다.
질병코드·날짜·시군·체크 항목만으로 판정한다. 최종 지급 여부는 보험사 심사로 결정된다.
"""
from datetime import date

from .alerts import alerts_on
from .coverage import (CLAIM_YEARS, COLD_CODES, COMMON_DOCS, HEAT_CODES, INFECTIONS, MINOR_DOCS,
                       POLICY_2025, POLICY_2026, coverage)


def _claim_deadline(day):
    try:
        return day.replace(year=day.year + CLAIM_YEARS)
    except ValueError:  # 2월 29일
        return day.replace(year=day.year + CLAIM_YEARS, day=28)


def _has(codes, prefixes):
    return any(c.startswith(p) for c in codes for p in prefixes)


def evaluate(req, today=None):
    today = today or date.today()
    codes = [c.strip().upper().replace(" ", "") for c in req.diagnosis_codes if c.strip()]
    heat, cold = _has(codes, HEAT_CODES), _has(codes, COLD_CODES)
    alerts = alerts_on(req.sigungu, req.event_date)
    deadline = _claim_deadline(req.event_date)
    notes = []
    items = []

    def add(cid, count=1, amount=None, reason=""):
        c = coverage(cid)
        unit = amount if amount is not None else c["amount"]
        items.append({"id": cid, "name": c["name"], "unit_amount": unit, "count": count,
                      "amount": unit * count, "reason": reason, "docs": c["docs"]})

    if POLICY_2025[0] <= req.event_date <= POLICY_2025[1]:
        policy = "2025"
        if heat or cold:
            add("heat_diagnosis" if heat else "cold_diagnosis", amount=100_000,
                reason="2025년 보험 기간 사고: 진단비 10만 원 적용")
        notes.append("2025년 보험 기간(2025.4.11~2026.4.10) 사고입니다. 진단비 외 항목은 2025년 약관 기준으로 보험사에 확인하세요.")
    elif POLICY_2026[0] <= req.event_date <= POLICY_2026[1]:
        policy = "2026"
        if heat:
            add("heat_diagnosis", reason="진단서의 질병코드가 온열질환(T67)에 해당")
        if cold:
            add("cold_diagnosis", reason="진단서의 질병코드가 한랭질환(T33·T34·T35·T68·T69)에 해당")
        if req.infection in INFECTIONS:
            add("infection_diagnosis", reason=f"{req.infection}은 보장 대상 감염병 10종에 포함")

        need_weeks = 2 if req.vulnerable else 4
        disaster = bool(alerts) and req.disaster_injury_weeks >= need_weeks
        if disaster:
            add("disaster_injury", reason=f"{alerts[0]['type']} 발령일 사고, {req.disaster_injury_weeks}주 진단")
        elif req.disaster_injury_weeks and not alerts:
            notes.append("사고 날짜에 해당 지역의 기후특보가 확인되지 않아 기후재해 사고 위로금은 제외했습니다.")

        if req.er_visit and (heat or cold or disaster):
            add("er_visit", reason="온열·한랭질환 또는 기후재해로 응급실 진료")
        if req.death and (heat or cold or disaster):
            if req.age is not None and req.age < 15:
                notes.append("사망위로금은 만 15세 미만에게는 지급되지 않습니다.")
            else:
                add("death", reason="온열·한랭질환 또는 기후재해로 인한 사망")

        if req.vulnerable:
            days = min(req.hospital_days, 5)
            if days and heat:
                add("heat_hospital", count=days, reason=f"취약계층 특약, 입원 {req.hospital_days}일 (5일 한도)")
            if days and cold:
                add("cold_hospital", count=days, reason=f"취약계층 특약, 입원 {req.hospital_days}일 (5일 한도)")
            visits = min(req.clinic_visits_on_alert_days, 5)
            if visits and alerts:
                add("clinic_visit", count=visits, reason=f"{alerts[0]['type']} 발령일 진료 {visits}회 (5회 한도)")
    else:
        policy = None
        notes.append("경기 기후보험 보험 기간(2025.4.11 이후)에 해당하지 않는 날짜입니다.")

    if not codes and not req.infection:
        notes.append("진단서나 소견서에 적힌 질병코드를 확인하면 더 정확하게 판정할 수 있어요.")
    if (heat or cold) and policy == "2026":
        notes.append("온열·한랭질환 진단비는 보험 기간 중 1회만 지급됩니다.")

    docs = list(COMMON_DOCS)
    if req.age is not None and req.age < 19:
        docs += MINOR_DOCS
    for it in items:
        docs += [d for d in it["docs"] if d not in docs]

    return {
        "policy_year": policy,
        "eligible": bool(items),
        "total_amount": sum(it["amount"] for it in items),
        "items": items,
        "required_docs": docs,
        "alerts_on_event_date": alerts,
        "claim_deadline": deadline.isoformat(),
        "deadline_passed": today > deadline,
        "notes": notes,
        "disclaimer": "예상 판정입니다. 최종 지급 여부와 금액은 보험사(메리츠화재) 서류 심사로 결정됩니다.",
    }
