---
name: skill-trigger-optimizer
description: 여러 SKILL.md 스킬의 description·본문을 분석해 발동(trigger) 품질을 진단하고 개선 문구를 제안합니다. 스킬이 잘 발동하지 않는 문제, 새 스킬 작성, 기존 스킬 발동조건 점검이 필요할 때 사용합니다.
---

# Skill Trigger Optimizer

여러 스킬 목록을 입력받아 각 스킬의 description이 잘 발동하는지(when 트리거, what 수행, scope 배제, 길이) 진단하고 개선 문구를 제안한다.

## 사용법
```python
from skill_trigger_optimizer import run
run("""SKILL: 지급보험금건전성
description: 지급보험금 실적·추이를 검토하고 원인 분석할 때
body: 5% 초과 기준 등
""")
```
입력 형식: 각 스킬을 `SKILL:` / `description:` / `body:` 블록으로.

## 진단 기준
- when 트리거(언제) / what 수행(무엇) / scope 배제(오발동 방지) / 길이(20~200자)
- 상태: PASS / WARN / FAIL + 개선 제안

## 스킬 최적화 시
아래 claims-planning 스킬 목록으로 실행 가능.
