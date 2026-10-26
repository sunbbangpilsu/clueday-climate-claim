from fastapi.testclient import TestClient

from app.main import app

client = TestClient(app)


def test_health():
    assert client.get("/api/health").json()["status"] == "ok"


def test_heat_diagnosis_and_er():
    r = client.post("/api/eligibility", json={
        "event_date": "2026-08-05", "sigungu": "부천시", "diagnosis_codes": ["T67.0"], "er_visit": True}).json()
    ids = {i["id"] for i in r["items"]}
    assert ids == {"heat_diagnosis", "er_visit"}
    assert r["total_amount"] == 250_000
    assert r["claim_deadline"] == "2029-08-05"
    assert "응급실기록지" in r["required_docs"]


def test_vulnerable_clinic_visit_needs_alert():
    body = {"event_date": "2026-08-05", "sigungu": "부천시", "vulnerable": True,
            "clinic_visits_on_alert_days": 7}
    r = client.post("/api/eligibility", json=body).json()
    visit = next(i for i in r["items"] if i["id"] == "clinic_visit")
    assert visit["count"] == 5 and visit["amount"] == 100_000  # 5회 한도
    body["event_date"] = "2026-10-01"  # 특보 없는 날
    r = client.post("/api/eligibility", json=body).json()
    assert not any(i["id"] == "clinic_visit" for i in r["items"])


def test_2025_policy_uses_old_amount():
    r = client.post("/api/eligibility", json={"event_date": "2025-08-01", "diagnosis_codes": ["T67"]}).json()
    assert r["policy_year"] == "2025" and r["total_amount"] == 100_000


def test_doctor_card_does_not_request_code():
    r = client.post("/api/doctor-card", json={"weather": "한파", "exposure": "야외 작업", "hours": 3}).json()
    assert "T6" not in r["request"] and "특정 질병코드를 요청하지 않습니다" in r["notice"]
