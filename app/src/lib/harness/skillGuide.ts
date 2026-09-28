// 지식(프롬프트·스킬) 생성 공통 가이드.
// 부서의 「스킬 생성기」 스킬(SKILL.md)을 기준으로,
// 생성되는 스킬·프롬프트가 명료하고 찾기 쉬운 이름/설명을 갖도록 규칙을 제공한다.
import { getPersonaSkills } from "@/lib/agent/skills";

export const SKILL_MAKER_NAME = "스킬 생성기";

/** 부서 「스킬 생성기」 SKILL.md (없으면 undefined) */
export function getSkillMakerSkill(personaKey: string) {
  return getPersonaSkills(personaKey).find((s) => s.name === SKILL_MAKER_NAME);
}

/** 이름·설명 규칙 — 생성/수정되는 모든 스킬·프롬프트에 적용 */
export const NAMING_RULES = `[이름·설명 규칙 — 반드시 지킬 것]
- name(스킬 제목): 2~5단어의 명사형. 업무 영역이 바로 드러나는 핵심 키워드를 넣는다.
  · 부서명(예: 보험금기획팀)·"부서"라는 말·내부 식별자(예: claims-planning)·괄호 부연은 넣지 않는다.
  · 나쁜 예: "보험금기획팀 부서 행동 원칙" → 좋은 예: "부서 행동 원칙"
  · 나쁜 예: "보험금기획(claims-planning) 관련 처리" → 좋은 예: "지급보험금 건전성 관리"
- description: 1~2문장(120자 이내). "~할 때 사용합니다" 형태로 발동(라우팅) 조건을 쓰고,
  겹치는 다른 스킬과의 범위 배제 문구를 넣는다. 부서명·내부 식별자는 넣지 않는다.
- 검색되도록: 사용자가 실제로 쓸 법한 업무 키워드(예: 손해율, 자동심사, KPI, 민원)를 포함한다.`;

const DEFAULT_GUIDE = `# 스킬 구조 (SKILL.md)
# 요구 시점
- 이 스킬이 필요한 구체적 상황
## 판단 기준
- 정량·정성 판단 기준과 원칙
## 데이터 사용
- 내부 RAG/집계와 외부 웹검색 구분
## 출력
[요약] → [현황] → [판단·원인] → [권고] → [다음 단계] → [추가 확인]
- 한 스킬에 여러 업무를 몰아넣지 말고 목적이 명확한 단위로 1개씩 만든다.`;

/** 부서 스킬 생성기 지침 + 이름 규칙을 합친 작성 가이드 */
export function skillAuthoringGuide(personaKey: string): string {
  const maker = getSkillMakerSkill(personaKey);
  const base = (maker?.content ?? "").trim() || DEFAULT_GUIDE;
  return `${NAMING_RULES}\n\n[스킬 생성기 지침]\n${base}`;
}
