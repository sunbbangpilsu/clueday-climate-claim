"""Rule-based estimates with explicit missing-data and demonstration states."""
from datetime import date

from .alerts import lookup_alerts
from .coverage import (CLAIM_YEARS, COLD_CODES, COMMON_DOCS, HEAT_CODES, INFECTIONS,
                       MINOR_DOCS, POLICY_2025, POLICY_2026, coverage)


def _claim_deadline(day):
    try:
        return day.replace(year=day.year + CLAIM_YEARS)
    except ValueError:
        return day.replace(year=day.year + CLAIM_YEARS, day=28)


def _has(codes, categories):
    return any(c.split(".", 1)[0] in categories for c in codes)


def evaluate(req, today=None):
    today = today or date.today()
    codes = req.diagnosis_codes
    heat, cold = _has(codes, HEAT_CODES), _has(codes, COLD_CODES)
    weather = lookup_alerts(req.sigungu, req.event_date)
    sample_alerts = weather["alerts"]
    # Samples affect calculations only in an explicitly labelled demonstration.
    weather_usable = weather["verified"] or (req.demo_mode and bool(sample_alerts))
    deadline = _claim_deadline(req.event_date)
    notes, items, pending = [], [], []

    def add(cid, count=1, amount=None, reason=""):
        c = coverage(cid)
        unit = amount if amount is not None else c["amount"]
        items.append({"id": cid, "name": c["name"], "unit_amount": unit, "count": count,
                      "amount": unit * count, "reason": reason, "docs": c["docs"]})

    def defer(cid, reason):
        if not any(p["id"] == cid for p in pending):
            pending.append({"id": cid, "name": coverage(cid)["name"], "reason": reason})

    if POLICY_2025[0] <= req.event_date <= POLICY_2025[1]:
        policy = "2025"
    elif POLICY_2026[0] <= req.event_date <= POLICY_2026[1]:
        policy = "2026"
    else:
        policy = None
        notes.append("현재 지원하는 보험기간은 2025.4.11~2027.4.10입니다. 다른 기간은 보험사에 확인해 주세요.")

    blocked = req.resident_on_event is False or today > deadline or not policy
    if req.resident_on_event is False:
        notes.append("사고 당일 경기도 가입 대상이 아니라고 입력했습니다. 해당 지자체의 보험을 확인해 주세요.")
    elif req.resident_on_event is None:
        notes.append("사고 당일 경기도 가입 대상이었는지 확인이 필요합니다. 아래 금액은 이 조건을 충족한다는 가정입니다.")
    if today > deadline:
        notes.append("계산상 청구기한이 지났습니다. 예외 적용 여부는 보험사에 확인해 주세요.")

    if not blocked:
        if req.diagnosis_already_paid and (heat or cold):
            notes.append("해당 진단비를 이미 지급받았다고 입력해 진단비를 합산하지 않았습니다.")
        else:
            for matches, cid in [(heat, "heat_diagnosis"), (cold, "cold_diagnosis")]:
                if matches:
                    add(cid, amount=100_000 if policy == "2025" else None,
                        reason=f"입력한 진단서 코드에 해당 ({policy}년 약관, 보험기간 내 1회)")

        if policy == "2025":
            notes.append("2025년 보험은 온열·한랭 진단비만 안내합니다. 그 외 보장·서류는 당시 보험사에 확인해 주세요.")
        else:
            if req.infection in INFECTIONS:
                add("infection_diagnosis", reason=f"입력한 감염병({req.infection})이 안내된 목록에 해당")

            need_weeks = 2 if req.vulnerable else 4
            injury = req.disaster_injury_weeks >= need_weeks
            disaster_context = req.disaster_related is True
            disaster = injury and disaster_context and weather_usable
            if disaster:
                add("disaster_injury", reason=f"시연 특보와 관련 사고라는 입력, {req.disaster_injury_weeks}주 진단")
            elif injury and req.disaster_related is not False:
                defer("disaster_injury", "사고 지역·일자의 실제 특보와 기상현상에 의한 사고인지 확인이 필요합니다.")

            for requested, cid in [(req.er_visit, "er_visit"), (req.death, "death")]:
                if not requested:
                    continue
                if cid == "death" and req.age is None:
                    defer(cid, "사망위로금의 나이 조건을 확인해 주세요.")
                elif cid == "death" and req.age < 15:
                    notes.append("사망위로금은 만 15세 미만에게는 지급되지 않습니다.")
                elif heat or cold or (disaster_context and weather_usable):
                    add(cid, reason="온열·한랭질환 또는 관련 기후재해라는 입력을 기준으로 한 예상")
                elif disaster_context or (injury and req.disaster_related is not False):
                    defer(cid, "기후재해 해당 여부를 확인한 뒤 판단할 수 있습니다.")

            if req.vulnerable:
                days = min(req.hospital_days, 5)
                for matches, cid in [(heat, "heat_hospital"), (cold, "cold_hospital")]:
                    if days and matches:
                        add(cid, count=days, reason=f"취약계층이라는 입력, 입원 {days}일 (5일 한도)")
                visits = min(req.clinic_visits_on_alert_days, 5)
                if visits and weather_usable:
                    add("clinic_visit", count=visits, reason=f"시연 특보일 통원이라는 입력 {visits}회 (5회 한도)")
                elif visits:
                    defer("clinic_visit", "통원한 각 날짜·지역의 실제 특보 확인이 필요합니다. 미대상으로 확정하지 않습니다.")

    if req.demo_mode:
        notes.insert(0, "가상 사례 시연입니다. 샘플 특보와 가정한 조건을 사용하며 실제 지급 가능액이 아닙니다.")
    if heat or cold:
        notes.append("온열·한랭 진단비는 보험기간 내 1회 제한입니다. 기존 지급 여부와 남은 한도는 보험사가 확인합니다.")
    if pending:
        notes.append("확인 대기 항목은 합계에서 제외했습니다. 조회되지 않는다는 이유만으로 미대상이라고 판단하지 않습니다.")

    docs = list(COMMON_DOCS) if items else []
    if items and req.age is not None and req.age < 19:
        docs += MINOR_DOCS
    for item in items:
        for doc in item["docs"]:
            if doc not in docs:
                docs.append(doc)

    status = ("demo" if req.demo_mode else "not_covered" if blocked else
              "needs_confirmation" if pending or req.resident_on_event is None else
              "estimated" if items else "no_match")
    return {
        "policy_year": policy, "status": status, "demo_mode": req.demo_mode,
        "eligible": bool(items), "total_amount": sum(i["amount"] for i in items),
        "items": items, "pending_items": pending, "required_docs": docs,
        "weather": weather, "alerts_on_event_date": sample_alerts if req.demo_mode else [],
        "claim_deadline": deadline.isoformat(), "deadline_passed": today > deadline,
        "can_prepare_summary": bool(items) and not blocked and req.resident_on_event is True,
        "notes": notes, "policy_source": "https://www.gg.go.kr/gg_insure",
        "disclaimer": "입력 조건에 따른 예상 안내입니다. 최종 지급 여부·중복 보장·남은 한도는 보험사 심사로 결정됩니다.",
    }
