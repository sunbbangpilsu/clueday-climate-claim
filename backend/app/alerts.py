"""기상특보 조회.

1차 제출본은 시연용 샘플 데이터로 동작한다 (응답의 source가 'sample').
2차에서 기상청 특보 통보문 오픈API(기상자료개방포털·공공데이터포털)로 교체한다.
"""
from datetime import date

# 시연용 샘플: (시군, 특보 종류, 시작일, 종료일)
SAMPLE_ALERTS = [
    ("부천시", "폭염주의보", date(2026, 7, 20), date(2026, 7, 31)),
    ("부천시", "폭염경보", date(2026, 8, 1), date(2026, 8, 12)),
    ("수원시", "폭염경보", date(2026, 8, 2), date(2026, 8, 10)),
    ("부천시", "한파주의보", date(2026, 12, 15), date(2026, 12, 18)),
    ("부천시", "한파경보", date(2027, 1, 8), date(2027, 1, 12)),
]


def alerts_on(sigungu, day):
    return [
        {"sigungu": s, "type": t, "start": a.isoformat(), "end": b.isoformat()}
        for s, t, a, b in SAMPLE_ALERTS
        if s == sigungu and a <= day <= b
    ]


def alerts_for(sigungu):
    return [
        {"sigungu": s, "type": t, "start": a.isoformat(), "end": b.isoformat()}
        for s, t, a, b in SAMPLE_ALERTS
        if s == sigungu
    ]
