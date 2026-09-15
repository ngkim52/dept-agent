// 지식하네스 유효 인벤토리 — 기본(base, 코드에 정의) + 학습(learned, DB 오버레이) 병합 조회
// 하네스 관리의 프롬프트/스킬/메모리 목록이 "기본값도 보이도록" 하기 위함
//
// - base: personas.ts 의 systemPrompt(프롬프트) + src/skills/<부서>/SKILL.md (스킬)
//         → 코드에 이미 정의된 기본 계층 (읽기 전용 표시)
// - learned: knowledge_* 테이블(DB)에 저장된 학습 오버레이 (수정/비활성 가능)
import { listPrompts, listSkills, listMemories } from "./store";
import { getPersona } from "@/lib/agent/personas";
import { loadSkillFiles } from "@/lib/agent/skills";
import { listPersonaPromptFragments } from "@/lib/agent/fragments";
import type { HarnessEntryType } from "./store";

// UI에서 사용할 부서(페르소나) 선택지
export const PERSONA_OPTIONS = ["claims-planning", "actuarial"] as const;
export const PERSONA_NAMES: Record<string, string> = {
  "claims-planning": "보험금심사기획",
  actuarial: "계리",
};

export type EffectiveItem = {
  source: "base" | "learned";
  id: string;
  personaKey: string;
  active: boolean;
  origin: string;
  confidence: number;
  /** 기본(base) 항목이 어떤 원본을 가리키는지 — 사본(base_copied overlay) 연결용 */
  baseRef?: string;
  kind?: string;
  title?: string;
  content: string;
  name?: string;
  description?: string;
};

/** base 프롬프트(시스템 프롬프트) → 파편화된 조각 단위 EffectiveItem[] */
function basePrompts(personaKey: string): EffectiveItem[] {
  const p = getPersona(personaKey);
  if (!p) return [];
  return listPersonaPromptFragments(personaKey).map((f) => ({
    source: "base" as const, id: f.id, baseRef: f.id, personaKey,
    name: "기본 프롬프트 · " + f.title, title: f.title,
    content: f.content, active: true, origin: "base", confidence: 1, kind: "base",
  }));
}

/** base 스킬(SKILL.md) → EffectiveItem[] */
function baseSkills(personaKey: string): EffectiveItem[] {
  const hints = loadSkillFiles(personaSkillDirSafe(personaKey));
  return hints.map((h) => {
    const baseRef = `base:skill:${personaKey}:${h.name || "스킬"}`;
    return {
      source: "base" as const, id: baseRef, baseRef,
      personaKey, name: h.name || "스킬", description: h.description ?? "",
      content: h.content, active: true, origin: "base", confidence: 1, kind: "base",
    };
  });
}

import { personaSkillDir } from "@/lib/agent/skills";
function personaSkillDirSafe(k: string) { try { return personaSkillDir(k); } catch { return ""; } }

/**
 * 기본(base) 항목을 사본으로 덮어쓴(편집한) 학습 오버레이 key 목록.
 * origin="base_copied" 이고 sourceType="base" + sourceId=baseRef 인 사본이 존재/활성 상태면
 * 해당 기본 항목은 숨기고, 사본(learned)이 유효 편집본으로 노출된다.
 */
async function baseCopiedRefs(type: "prompt" | "skill", personaKey?: string): Promise<Set<string>> {
  const listFn = type === "prompt" ? listPrompts : listSkills;
  const rows = await listFn(personaKey);
  const refs = new Set<string>();
  for (const r of rows) {
    if (r.origin === "base_copied" && r.sourceType === "base" && r.sourceId && r.active) refs.add(r.sourceId);
  }
  return refs;
}

/** type+personaKey → 유효 인벤토리 (base 먼저, learned 뒤) */
export async function listEffective(type: HarnessEntryType, personaKey?: string): Promise<EffectiveItem[]> {
  if (type === "prompt" || type === "skill") {
    const keys = personaKey ? [personaKey] : (PERSONA_OPTIONS as readonly string[]);
    const baseFn = type === "prompt" ? basePrompts : baseSkills;
    const covered = await baseCopiedRefs(type, personaKey);
    const out: EffectiveItem[] = [];
    for (const k of keys) {
      for (const b of baseFn(k)) {
        if (b.baseRef && covered.has(b.baseRef)) {
          // 사본이 있는 기본 항목 → 유효 목록에서 숨김 (사본이 대신 표기됨)
          continue;
        }
        out.push(b);
      }
    }
    const learned = (type === "prompt" ? await listPrompts(personaKey) : await listSkills(personaKey)) as any[];
    out.push(...learned.map((r) => ({ ...r, source: "learned" as const })));
    return out;
  }
  const learned = ((await listMemories(personaKey)) as any[]).map((r) => ({ ...r, source: "learned" as const }));
  return learned;
}
