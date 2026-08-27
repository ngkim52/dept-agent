---
name: meta-prompt-refiner
description: 기존 프롬프트와 목표·실패 사례를 넣으면 프롬프트를 반복 개선(목표 규칙·오류 방지 강화)하는 멱등 루프를 실행합니다. 프롬프트가 목표를 충족하지 못할 때 개선하고 싶을 때 사용합니다.
---

# Meta Prompt Refiner

기존 프롬프트에 목표와 실패 사례를 주입(자동강화)하고, 중복을 방지하는 멱등 적용.

## 직접 호출
```python
from meta_prompt_refiner import run
await run("당신은 부서장이다.", goal="지급보험 직접 처리", failures="계리 위임; 오위임")
```

## 출력
- 적용된 강화(목표 규칙, 오류 방지) + 최종 프롬프트
- 재호출 시 중복 주입 없음(멱등)
