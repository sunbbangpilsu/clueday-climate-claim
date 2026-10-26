from datetime import date, timedelta

import pytest
from fastapi.testclient import TestClient

from app.main import app, EligibilityRequest
from app.eligibility import evaluate

client = TestClient(app)


def check(**values):
    body = {"event_date": "2026-08-05", "sigungu": "부천시", "resident_on_event": True}
    body.update(values)
    response = client.post("/api/eligibility", json=body)
    assert response.status_code == 200, response.text
    return response.json()


def test_health_and_catalog():
    assert client.get("/api/health").json()["status"] == "ok"
    catalog = client.get("/api/coverages").json()
    assert len(catalog["infections"]) == 10
    assert any(c["id"] == "disaster_injury" for c in catalog["items"])


def test_heat_diagnosis_and_er_without_weather_requirement():
    result = check(diagnosis_codes=["T67.0"], er_visit=True)
    assert {i["id"] for i in result["items"]} == {"heat_diagnosis", "er_visit"}
    assert result["total_amount"] == 250_000
    assert result["claim_deadline"] == "2029-08-05"
    assert result["can_prepare_summary"]
    assert "응급실기록지" in result["required_docs"]
    assert result["alerts_on_event_date"] == []


@pytest.mark.parametrize("region", ["부천시", "고양시", "지역 미확인"])
def test_no_sample_weather_can_reject_or_approve_real_clinic_claim(region):
    result = check(sigungu=region, vulnerable=True, clinic_visits_on_alert_days=1)
    assert not result["eligible"]
    assert result["status"] == "needs_confirmation"
    assert result["pending_items"][0]["id"] == "clinic_visit"
    assert not result["weather"]["verified"]


def test_weather_api_explicitly_marks_unknown_instead_of_no_alert():
    result = client.get("/api/alerts", params={"sigungu": "고양시", "on": "2026-08-05"}).json()
    assert result["status"] == "unknown" and result["source"] == "sample"
    assert result["verified"] is False


def test_demo_47_man_is_explicitly_provisional():
    result = check(event_date="2026-12-16", diagnosis_codes=["T68"], er_visit=True,
                   hospital_days=2, vulnerable=True, clinic_visits_on_alert_days=1, age=72,
                   demo_mode=True)
    assert result["total_amount"] == 470_000
    assert result["status"] == "demo" and result["demo_mode"]
    assert "가상 사례" in result["notes"][0]


def test_demo_clinic_visit_caps_at_five():
    result = check(vulnerable=True, clinic_visits_on_alert_days=7, demo_mode=True)
    visit = next(i for i in result["items"] if i["id"] == "clinic_visit")
    assert visit["count"] == 5 and visit["amount"] == 100_000


def test_demo_missing_sample_still_requires_confirmation():
    result = check(sigungu="고양시", vulnerable=True, clinic_visits_on_alert_days=1, demo_mode=True)
    assert not result["items"] and result["pending_items"]


def test_2025_policy_does_not_apply_new_er_amount():
    result = check(event_date="2025-08-01", diagnosis_codes=["T67"], er_visit=True)
    assert result["policy_year"] == "2025" and result["total_amount"] == 100_000
    assert "2025년 보험" in " ".join(result["notes"])


@pytest.mark.parametrize("code", ["T670000_INVALID", "T670", "T67abc", "<script>", "T67.00000"])
def test_malformed_codes_are_rejected(code):
    response = client.post("/api/eligibility", json={"event_date": "2026-08-05", "diagnosis_codes": [code]})
    assert response.status_code == 422


@pytest.mark.parametrize("code", ["t67.0", " T67.0 ", "T34.1"])
def test_valid_subcodes_are_normalized_and_recognized(code):
    assert check(diagnosis_codes=[code])["total_amount"] == 150_000


def test_future_visit_is_rejected_outside_demo():
    response = client.post("/api/eligibility", json={
        "event_date": (date.today() + timedelta(days=1)).isoformat(), "diagnosis_codes": ["T67"]})
    assert response.status_code == 422
    assert "미래 진료일" in response.text


def test_residency_false_blocks_amount_and_summary():
    result = check(diagnosis_codes=["T67"], resident_on_event=False)
    assert not result["items"] and not result["can_prepare_summary"]
    assert result["status"] == "not_covered"


def test_unknown_residency_is_conditional_and_cannot_generate_summary():
    result = check(diagnosis_codes=["T67"], resident_on_event=None)
    assert result["status"] == "needs_confirmation"
    assert not result["can_prepare_summary"]


def test_prior_diagnosis_payment_is_excluded_but_er_can_remain():
    result = check(diagnosis_codes=["T67"], diagnosis_already_paid=True, er_visit=True)
    assert [i["id"] for i in result["items"]] == ["er_visit"]
    assert result["total_amount"] == 100_000


def test_disaster_and_er_are_pending_without_verified_weather():
    result = check(disaster_injury_weeks=4, disaster_related=True, er_visit=True)
    assert not result["items"]
    assert {i["id"] for i in result["pending_items"]} == {"disaster_injury", "er_visit"}


def test_demo_requires_weather_causation_before_disaster_amount():
    result = check(disaster_injury_weeks=4, disaster_related=False, demo_mode=True)
    assert not result["items"] and not result["pending_items"]


def test_disaster_er_does_not_require_four_week_injury_for_er_benefit():
    result = check(disaster_related=True, er_visit=True, demo_mode=True)
    assert [i["id"] for i in result["items"]] == ["er_visit"]
    assert result["total_amount"] == 100_000


def test_disaster_er_without_verified_weather_is_pending_even_without_weeks():
    result = check(disaster_related=True, er_visit=True)
    assert not result["items"]
    assert result["pending_items"][0]["id"] == "er_visit"


@pytest.mark.parametrize("vulnerable,weeks,amount", [(False, 3, 0), (False, 4, 300000), (True, 2, 300000)])
def test_disaster_thresholds_in_explicit_demo(vulnerable, weeks, amount):
    result = check(vulnerable=vulnerable, disaster_injury_weeks=weeks,
                   disaster_related=True, demo_mode=True)
    assert result["total_amount"] == amount


def test_infection_is_accessible_without_heat_code():
    result = check(infection="말라리아")
    assert result["items"][0]["id"] == "infection_diagnosis"
    assert result["total_amount"] == 200_000


def test_death_with_missing_age_is_deferred_not_awarded():
    result = check(diagnosis_codes=["T68"], death=True)
    assert not any(i["id"] == "death" for i in result["items"])
    assert any(i["id"] == "death" for i in result["pending_items"])


def test_expired_case_cannot_produce_claim_summary():
    request = EligibilityRequest(event_date=date(2026, 8, 5), diagnosis_codes=["T67"], resident_on_event=True)
    result = evaluate(request, today=date(2030, 8, 6))
    assert result["deadline_passed"] and not result["eligible"]
    assert not result["can_prepare_summary"]


def test_doctor_card_requires_user_input_and_never_invents_alert():
    assert client.post("/api/doctor-card", json={}).status_code == 422
    assert client.post("/api/doctor-card", json={"weather":"한파", "exposure":"  ", "hours":2}).status_code == 422
    response = client.post("/api/doctor-card", json={"weather":"한파", "exposure":"야외 작업", "hours":3})
    result = response.json()
    assert "T6" not in result["request"] and "특정 질병코드를 요청하지 않습니다" in result["notice"]
    assert "발령" not in " ".join(result["lines"])
    assert not any("증상:" in line for line in result["lines"])
