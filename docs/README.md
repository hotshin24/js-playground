# 문서 안내

현재 정식 과정은 **10트랙 157레슨 505단계**다. T0에는 종합 문제 15개가 있고, T1~T9도 같은 형식으로 확장 중이다. 문서는 목적에 따라 현재 문서와 역사 기록으로 나뉜다.

## 현재 기준

| 문서 | 역할 |
|---|---|
| [`CURRICULUM.md`](CURRICULUM.md) | T0~T9의 학습 순서, 설명 원칙, 레슨 목록 |
| [`SPEC.md`](SPEC.md) | 현재 앱과 실행 엔진의 동작 |
| [`../README.md`](../README.md) | 사용법, 현재 규모, 알려진 제약 |
| [`../lessons/README.md`](../lessons/README.md) | 정식 레슨 데이터와 검사 방법 |

현재 수치가 서로 다르면 `lessons/index.json`과 `node scripts/audit-lessons.mjs`의 결과를 기준으로 한다.

## 역사 기록

| 문서 | 역할 |
|---|---|
| [`PRD.md`](PRD.md) | 이전 9트랙·113레슨 제품을 만들 당시의 요구와 결정 |
| [`FINDINGS.md`](FINDINGS.md) | 이전 과정과 실행 엔진을 개발하며 남긴 실측 기록 |
| [`CURRICULUM-MIGRATION.md`](CURRICULUM-MIGRATION.md) | 이전 113레슨을 현재 과정의 기반인 133개 개념 레슨으로 바꾼 이주 판정 |

역사 기록 안의 레슨 번호·레슨 수·단계 수는 당시 상태를 뜻한다. 현재 과정의 사양으로 해석하거나 현재 수치로 일괄 치환하지 않는다.
