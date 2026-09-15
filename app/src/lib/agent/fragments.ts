// 베이스 시스템 프롬프트를 파편화 → 동적 컨텍스트 조각으로 노출
// 단일 거대 프롬프트를 업무/상황 단위('#' Heading)로 쪼개 분류·관리·조립 가능하게 한다.
// 런타임 조립은 buildPersonaSystemPromptWithHarness가 전체(베이스+스킬+학습지식)를 그대로 구성하므로 행동 변화 없음.
import { getPersona } from "./personas";

export interface PromptFragment {
  id: string;
  title: string;
  content: string;
}

/** 시스템 프롬프트를 '#' Heading 단위로 파편화 */
export function fragmentSystemPrompt(systemPrompt: string): PromptFragment[] {
  const lines = systemPrompt.split("\n");
  const fragments: PromptFragment[] = [];
  let cur: PromptFragment | null = null;
  for (const l of lines) {
    if (/^# /.test(l)) {
      cur = { id: `frag:${fragments.length}`, title: l.replace(/^# /, "").trim(), content: l };
      fragments.push(cur);
    } else if (cur) {
      cur.content += "\n" + l;
    }
  }
  return fragments.map((f) => ({ ...f, content: f.content.trim() }));
}

/** 부서 페르소나의 파편화된 기본 프롬프트 조각 목록 */
export function listPersonaPromptFragments(personaKey: string): PromptFragment[] {
  const p = getPersona(personaKey);
  if (!p) return [];
  return fragmentSystemPrompt(p.systemPrompt).map((f, i) => ({
    ...f,
    id: `base:prompt:${personaKey}:${i}`,
    title: f.title,
  }));
}
