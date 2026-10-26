"""2026 경기 기후보험 보장 내용과 청구 서류.

출처: 경기도 기후보험 안내 (https://www.gg.go.kr/gg_insure), 보험기간 2026.4.11 ~ 2027.4.10
"""
from datetime import date

POLICY_2026 = (date(2026, 4, 11), date(2027, 4, 10))
POLICY_2025 = (date(2025, 4, 11), date(2026, 4, 10))
CLAIM_YEARS = 3  # 사고일로부터 3년 안에 청구

HEAT_CODES = ["T67"]
COLD_CODES = ["T33", "T34", "T35", "T68", "T69"]
INFECTIONS = ["뎅기열", "웨스트나일열", "쯔쯔가무시", "라임병", "말라리아", "일본뇌염",
              "중증열성혈소판감소증후군", "비브리오패혈증", "치쿤구니야", "지카바이러스"]

COMMON_DOCS = ["보험금 청구서", "개인정보처리동의서",
               "주민등록초본 (외국인: 국내거소신고사실증명서)", "통장사본"]
MINOR_DOCS = ["가족관계증명서 (미성년자)"]

# target: all = 경기도민 전체, vulnerable = 기후취약계층(방문건강관리사업 대상 + 임산부) 특약
COVERAGES = [
    {"id": "heat_diagnosis", "name": "온열질환 진단비", "target": "all", "amount": 150_000,
     "condition": "온열질환(T67) 진단 (연 1회)", "codes": HEAT_CODES, "docs": ["진단서 또는 소견서"]},
    {"id": "cold_diagnosis", "name": "한랭질환 진단비", "target": "all", "amount": 150_000,
     "condition": "한랭질환(T33·T34·T35·T68·T69) 진단 (연 1회)", "codes": COLD_CODES, "docs": ["진단서 또는 소견서"]},
    {"id": "infection_diagnosis", "name": "특정 감염병 진단비", "target": "all", "amount": 200_000,
     "condition": "기후 관련 특정 감염병 10종 진단 (사고당)", "codes": [], "docs": ["진단서 또는 소견서"]},
    {"id": "disaster_injury", "name": "기후재해 사고 위로금", "target": "all", "amount": 300_000,
     "condition": "기후특보 해당일 사고로 4주 이상 진단 (취약계층은 2주 이상)", "codes": [],
     "docs": ["초진기록지", "진단서 또는 소견서"]},
    {"id": "death", "name": "사망위로금", "target": "all", "amount": 3_000_000,
     "condition": "온열·한랭질환 또는 기후재해로 사망 (만 15세 미만 제외)", "codes": [],
     "docs": ["초진기록지", "사망진단서", "상속 관련 증빙서류"]},
    {"id": "er_visit", "name": "응급실 내원비", "target": "all", "amount": 100_000,
     "condition": "온열·한랭질환 또는 기후재해로 응급실 진료 (사고당)", "codes": [],
     "docs": ["응급실기록지", "진단서 또는 소견서"]},
    {"id": "heat_hospital", "name": "온열질환 입원일당", "target": "vulnerable", "amount": 100_000,
     "condition": "온열질환으로 1일 이상 입원 (1일당, 5일 한도)", "codes": HEAT_CODES,
     "docs": ["진단서 또는 소견서", "입원확인서", "방문건강사업대상 확인서 또는 임산부확인서"]},
    {"id": "cold_hospital", "name": "한랭질환 입원일당", "target": "vulnerable", "amount": 100_000,
     "condition": "한랭질환으로 1일 이상 입원 (1일당, 5일 한도)", "codes": COLD_CODES,
     "docs": ["진단서 또는 소견서", "입원확인서", "방문건강사업대상 확인서 또는 임산부확인서"]},
    {"id": "clinic_visit", "name": "의료기관 통원비", "target": "vulnerable", "amount": 20_000,
     "condition": "기상특보 발령일에 진료 목적 방문 (1회당, 5회 한도)", "codes": [],
     "docs": ["진료확인서", "방문건강사업대상 확인서 또는 임산부확인서"]},
]

CLAIM_CHANNELS = {
    "insurer": "메리츠화재 (경기도 계약 보험사)",
    "channels": [
        {"type": "카카오톡", "how": "카카오톡에서 '경기 기후보험' 채널 친구추가 → 보상청구하기 → 서류 사진 업로드"},
        {"type": "이메일", "how": "support@bizinsight.co.kr"},
        {"type": "팩스", "how": "02-313-2277 (앱팩스 070-4170-4040)"},
        {"type": "우편", "how": "서울특별시 서대문구 충정로 7 구세군빌딩 8층 (03737)"},
    ],
    "call_center": "02-2078-4548",
    "payout": "서류 심사 후 3일 이내 지급",
    "source": "https://www.gg.go.kr/gg_insure",
}


def coverage(cid):
    return next(c for c in COVERAGES if c["id"] == cid)
