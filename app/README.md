

---

# dept-agent (보험사 부서별 AI 에이전트)

보험금심사기획팀(claims-planning)·계리팀(actuarial) 등 **부서별 AI 에이전트**를 제공하는 Next.js 앱입니다.
각 부서는 고유한 페르소나·스킬·도구를 가집니다.

## 부서(에이전트) 구조

| 항목 | 위치 | 역할 |
|------|------|------|
| 페르소나(시스템 프롬프트) | `src/lib/agent/personas.ts` | 부서장 역할·검증 절차 |
| 스킬(SKILL.md) | `src/skills/<부서키>/SKILL.md` | 부서별 지식/절차 문서 |
| 도구 목록 | `src/agent-tools/<부서키>.ts` | 부서가 사용할 도구 지정 |

현재 부서:
- `claims-planning` — 보험금심사기획 부서장
- `actuarial` — 계리 부서장

## 부서별 도구 구성

각 부서는 `src/agent-tools/<부서키>.ts`에서 `departmentToolNames` 배열로 도구를 선택합니다.

```ts
// src/agent-tools/claims-planning.ts
export const departmentToolNames = ["delegate", "rag_search", "websearch", "python_data"];
```

사용 가능한 도구:
- `delegate` — 하위 에이전트(전문가)에게 작업 위임
- `rag_search` — RAG 데이터셋 검색(내부 자료)
- `websearch` — 웹 검색(Serper→Tavily 폴백)
- `python_data` — 파이썬(pandas/openpyxl)으로 CSV·엑셀 데이터 처리

`buildPiAgent`(`src/lib/agent/engine.ts`)가 `getDepartmentToolNames(persona.key)`를 읽어
해당 부서에 속한 도구만 에이전트에 주입합니다.

## 새 부서 추가

1. `src/lib/agent/personas.ts`에 페르소나 등록
2. `src/skills/<부서키>/SKILL.md` 생성 (YAML frontmatter: name/description)
3. `src/agent-tools/<부서키>.ts` 생성 후 `departmentToolNames` 지정
4. `src/agent-tools/index.ts`에 키 매핑 등록

## 새 도구 추가

1. `src/lib/agent/`에 도구 구현 (예: `makeXxxTool`)
2. `src/lib/agent/engine.ts`의 `buildPiAgent`에서 `toolNames.includes("...")` 조건으로 push
3. `src/agent-tools/<부서키>.ts`의 `departmentToolNames`에 이름 추가

## 파이썬 데이터 처리

`python_data` 도구는 전용 Python 가상환경(`~/.local/share/dept-agent-py`)에서 실행됩니다.
업로드한 파일을 `@파일명`으로 지정하면 에이전트가 원본 파일 경로를 파이썬 스크립트에 전달해
pandas로 직접 읽고 집계할 수 있습니다 (시각화, 표 변환, 검증에 활용).
