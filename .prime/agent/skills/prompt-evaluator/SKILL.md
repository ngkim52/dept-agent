---
name: prompt-evaluator
description: 시스템 프롬프트 또는 스킬 본문의 품질을 6개 차원(명확성·트리거성·역할·구조·도구연계·안전)으로 0~100 점수화하고 개선점을 도출합니다. 프롬프트 작성·수정 후 품질을 평가하고 싶을 때 사용합니다.
---

# Prompt Evaluator

프롬프트를 품질 매트릭스로 평가. rule-based 키워드 히트로 각 차원 점수와 전체 점수를 계산.

## 사용법
```python
from prompt_evaluator import run
await run("당신은 부서장입니다. 질문이 들어오면 RAG 검색 후 분석해 주세요.", role="claims-planning")
```

## 차원 점수
- 명확성 / 트리거성 / 역할·페르소나 / 구조 / 도구 연계 / 안전·범위
- 45점 이하 차원을 식별해 개선 포인트 제시
