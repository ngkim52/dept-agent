// 프롬프트 모듈 시스템 — 질문에 따라 필요한 프롬프트·스킬만 조합
// - 기본(base) 프롬프트: 페르소나 역할 (personas.ts)
// - 운용 모듈(modules): 상황별 규칙 (예: websearch 원칙, 데이터 질문 처리)
// - 스킬(skills): 업무 영역별 상세 기준 — 질문/카테고리로 필요한 것만 선택
import { getCategories, type Category } from "@/lib/catalog";
import type { SkillHint } from "@/lib/agent/skills";

import { readFileSync } from "node:fs";
import path from "node:path";

// ★ 운용 모듈(웹검색·데이터질문) 본문은 src/skills/_common/*.md 파일에서 읽어 온다 (Skill 파일로 관리).
function readSkillBody(rel: string): string {
  const dir = process.env.SKILLS_DIR ?? path.join(process.cwd(), "src", "skills");
  try {
    const raw = readFileSync(path.join(dir, rel), "utf8");
    const m = raw.match(/^---\s*\n[\s\S]*?\n---\s*\n([\s\S]*)$/);
    return m ? m[1].trim() : raw.trim();
  } catch { return ""; }
}


export type PromptModuleId =
  | "role"            // 역할 · 사고원칙 · 우선순위 · 협업 · 행동규칙 (항상)
  | "intent"          // 질문 의도 분류(A/B/C)
  | "style"           // 답변 스타일 유형별 표준
  | "process"         // 판단 6 STEP
  | "domains"         // 업무 영역별 5대 업무 안내
  | "baseProcess"     // 5대 영역 외 질문 공통 처리
  | "hitl"           // 유형 C 복수 선택지 질문 형식
  | "websearch"       // 근거 보완: 웹 검색 원칙 (조건부)
  | "dataQuestion"    // "~데이터 있어?" 처리 (조건부)
  | "delegate";       // 서브에이전트 위임 기준

export interface QuestionIntent {
  modules: PromptModuleId[];      // 포함할 운용 모듈
  categoryKeys: string[];         // 매칭된 업무 카드
  generic: boolean;               // 일반(5대 영역 외) 질문인지
  trivial: boolean;              // 인사·단순 확인 등 (스킬 불필요)
}

// ---- claims-planning 카테고리 키워드 분류 ----
const CLAIMS_KW: Record<string, string[]> = {
  claims1: ["손해율", "지급보험금", "건전성", "이상징후", "지급", "보험사기", "부정청구"],
  claims2: ["자동심사", "자동화", "시스템", "즉시지급", "룰", "심사"],
  claims3: ["편의", "편의성", "민원", "소비자", "서류", "고객"],
  claims4: ["품질", "오류", "점검", "샘플링", "적정성", "피드백"],
  claims5: ["신상품", "역선택", "출시", "보장", "신규상품", "리스크"],
  claims6: ["사업계획", "kpi", "진척", "목표", "지표", "성과"],
};
const ACTUARIAL_KW: Record<string, string[]> = {
  act1: ["신계약", "csm", "vnb", "할인율", "신계약가치"],
  act2: ["준비금", "가정", "부채", "적립"],
  act3: ["요율", "보험료", "위험률"],
  act4: ["재무건전성", "k-ics", "rbc", "지급여력", "alM"],
  act5: ["경험통계", "장기", "연금", "해지율", "사망률"],
};

function kwHit(text: string, kws: string[]): boolean {
  const t = text.toLowerCase();
  return kws.some((k) => t.includes(k.toLowerCase()));
}

/** 질문 → 카테고리 키 자동 분류 (기본 처리/카드 기반) */
export function classifyQuestion(personaKey: string, question?: string | null, categoryKey?: string | null): QuestionIntent {
  const int: QuestionIntent = { modules: ["role", "intent", "style", "process", "domains", "baseProcess", "hitl", "delegate", "websearch"], categoryKeys: [], generic: true, trivial: false };
  const q = (question ?? "").trim();
  const kw = personaKey === "actuarial" ? ACTUARIAL_KW : CLAIMS_KW;

  // 명시 카테고리 우선
  if (categoryKey && categoryKey in kw) {
    if (categoryKey !== (personaKey === "actuarial" ? "act0" : "claims0")) int.categoryKeys.push(categoryKey);
    int.generic = categoryKey === "claims0" || categoryKey === "act0";
  } else if (q) {
    // 단순(trivial) 질문: 스킬·정보 모듈 생략
    if (kwHit(q, ["안녕", "고마워", "감사", "누구야", "뭐야", "안내해", "방법"])) int.trivial = true;
    for (const [k, kws] of Object.entries(kw)) {
      if (kwHit(q, kws)) int.categoryKeys.push(k);
    }
    if (int.categoryKeys.length) int.generic = false;
  }

  // 조건부 모듈: "데이터 있어?" 류 질문 → 데이터 질문 처리 모듈 추가
  if (q && kwHit(q, ["데이터 있어", "자료 있", "데이터 있", "자료가 있", "확인해줘", "찾아봐"])) {
    int.modules.push("dataQuestion");
  }
  // trivial/일반 질문은 무거운 판단·스킬 생략(웹검색은 유지 — 외부 안내 가능성)
  if (int.trivial) {
    int.modules = int.modules.filter((m) => m !== "process" && m !== "domains" && m !== "baseProcess");
  }
  return int;
}

/** 매칭된 카테고리의 스킬 이름 목록 */
export function skillsForCategories(categories: Category[], categoryKeys: string[]): string[] {
  return categories.filter((c) => categoryKeys.includes(c.key) && c.skill).map((c) => c.skill as string);
}

/** 조건부 운용 모듈: 웹 검색 원칙 — 기본(역할) 프롬프트에서 분리, 정보가 필요한 거의 모든 질문에 주입 */
export const MODULE_WEBSEARCH = readSkillBody("_modules/0-웹검색/SKILL.md");
/** 조건부 운용 모듈: "~데이터 있어?" 처리 */
export const MODULE_DATA_QUESTION = readSkillBody("_modules/0-데이터질문/SKILL.md");

export const OPERATING_MODULES: Record<PromptModuleId, string> = { 
  role: "(역할·우선순위·협업·행동규칙 — personas.ts에 정의)",
  intent: "", style: "", process: "", domains: "", baseProcess: "", hitl: "", delegate: "",
  websearch: MODULE_WEBSEARCH,
  dataQuestion: MODULE_DATA_QUESTION,
};

/** 선택된 파일 스킬 — 질문/카테고리에 맞는 것만 (미지정/일반이면 전체 or 기타) */
export function selectFileSkills(skills: SkillHint[], personaKey: string, question?: string | null, categoryKey?: string | null): SkillHint[] {
  // 질문·카테고리가 모두 없으면 전체(하위호환)
  if (!question && !categoryKey) return skills;
  const int = classifyQuestion(personaKey, question, categoryKey);
  if (int.trivial) return skills.filter((s) => s.name.includes("기본") || s.name.includes("처리"));
  const cats = getCategories(personaKey);
  // 카테고리 → 스킬 이름 정규화(카탈로그 skill 필드와 폴더명/이름 매칭)
  const names = new Set<string>();
  for (const k of int.categoryKeys) {
    const c = cats.find((x) => x.key === k);
    if (c?.skill) names.add(c.skill);
  }
  if (!names.size) {
    // 기본 처리 스킬(0)만
    return skills.filter((s) => s.name.includes("기본") || s.name.includes("처리"));
  }
  // 카탈로그 skill 이름과 스킬 name/description 매칭
  const picked = skills.filter((s) => {
    for (const n of names) {
      if (s.name.includes(n.slice(0, 4)) || s.description.includes(n.slice(0, 4))) return true;
    }
    return false;
  });
  return picked.length ? picked : skills;
}


// ---- DB 지식(harmony) 선택·순위 — 질문/상황에 맞는 것만 골라 조합 ----
import type { HarnessBundle } from "@/lib/agent/skills";

type Ranked = { score: number; entry: any };

/** 한글 텍스트 → 토큰(단어 + 2-gram) 집합 */
function tokens(s: string): Set<string> {
  const t = new Set<string>();
  const words = s.toLowerCase().split(/[^가-힣a-z0-9]+/).filter((w) => w.length > 0);
  words.forEach((w) => {
    t.add(w);
    if (w.length > 1) {
      for (let i = 0; i < w.length - 1; i++) t.add(w.slice(i, i + 2));
    }
  });
  return t;
}

/** 질문·상황과 지식 항목의 연관 점수 (0~n) — 포함 여부 결정 */
export function relevanceScore(q: string, entry: any, categoryKey?: string | null): number {
  const qs = tokens(q);
  const text = `${entry.title ?? ""} ${entry.name ?? ""} ${entry.description ?? ""} ${entry.content ?? ""} ${Array.isArray(entry.tags) ? entry.tags.join(" ") : (entry.tags ?? "")}`;
  const es = tokens(text);
  let overlap = 0;
  for (const w of qs) if (es.has(w)) overlap++;
  let score = overlap;
  // 카테고리(상황) 일치 가중치
  if (categoryKey && (text.includes(categoryKey) || (Array.isArray(entry.tags) && entry.tags.includes(categoryKey)))) score += 3;
  return score;
}

/** 포함 후 정렬용 점수 — 사용 빈도·최신성은 '순서'에만 반영 (포함 여부는 아님) */
function orderScore(entry: any, base: number): number {
  let s = base;
  s += Math.min(entry.hitCount ?? 0, 3);
  if (entry.updatedAt) s += new Date(entry.updatedAt).getTime() > Date.now() - 30 * 24 * 3600 * 1000 ? 0.5 : 0;
  return s;
}

/** 활성 DB 지식을 질문·상황에 맞게 정렬·선택 (관련 없는 노이즈 제외) */
export function selectHarnessKnowledge(
  harness: HarnessBundle,
  question?: string | null,
  categoryKey?: string | null,
  opts: { keepMin?: number } = {}
): HarnessBundle {
  const q = (question ?? "").trim();
  // 질문 없으면 전체(하위호환)
  if (!q && !categoryKey) return harness;
  const keepMin = opts.keepMin ?? 3;

  const rank = <T>(list: T[]): T[] => {
    if (!list.length) return list;
    const scored: Ranked[] = list.map((entry) => ({ entry, score: relevanceScore(q, entry as any, categoryKey) }));
    const kept = scored.filter((x) => x.score > 0);
    const pick = kept.length ? kept : scored.slice(0, keepMin);
    pick.sort((a, b) => orderScore(b.entry, b.score) - orderScore(a.entry, a.score));
    return pick.map((x) => x.entry) as T[];
  };

  return {
    prompts: rank(harness.prompts as any[]),
    skills: rank(harness.skills as any[]),
    memories: rank(harness.memories as any[]),
  };
}

