// SKILL.md 로딩 + 페르소나 스킬 주입 (pi-agent-core skills 규칙과 동일한 frontmatter 파싱)
//
// 스킬 디렉토리: src/skills/<부서키>/SKILL.md
//   - frontmatter: name (선택, 기본=폴더명), description (필수)
//   - 본문: 모델이 해당 업무를 수행할 때 따르는 지침
import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";

export interface SkillHint {
  name: string;
  description: string;
  content: string;
  filePath: string;
  disabled?: boolean;
  /** 항상 포함(always-on) 행동원칙·사고방식 스킬인지 (기본: _common 또는 frontmatter always:true) */
  always?: boolean;
}

/** 스킬 루트 디렉토리 (프로젝트 루트 기준) */
const _root = path.join(process.cwd(), "src", "skills");
export const SKILLS_DIR = process.env.SKILLS_DIR ?? _root;

/** 부서키(페르소나 키) → 스킬 디렉토리 경로 */
export function personaSkillDir(personaKey: string): string {
  return path.join(SKILLS_DIR, personaKey);
}

/** 공통 스킬 디렉토리 — 모든 부서에 항상 적용되는 행동원칙·사고방식 스킬 */
export function commonSkillsDir(): string {
  return path.join(SKILLS_DIR, "_common");
}

/** frontmatter 간단 파서 (--- 로 둘러싸인 YAML name/description 읽기) */
export function parseSkillFrontmatter(raw: string): { name: string; description: string; body: string; disabled: boolean; always: boolean } {
  const m = raw.match(/^---\s*\n([\s\S]*?)\n---\s*\n([\s\S]*)$/);
  if (!m) return { name: "", description: "", body: raw, disabled: false, always: false };
  const meta = m[1];
  const body = m[2].trim();
  const name = meta.match(/^name:\s*(.+)$/m)?.[1]?.trim() ?? "";
  const description = meta.match(/^description:\s*(.+)$/m)?.[1]?.trim() ?? "";
  const disabled = /^disable-model-invocation:\s*true$/m.test(meta);
  const always = /^always:\s*true$/m.test(meta);
  return { name, description, body, disabled, always };
}

/** SKILL.md 파일들을 재귀 로드 → SkillHint 목록 */
export function loadSkillFiles(dir: string): SkillHint[] {
  const out: SkillHint[] = [];
  if (!existsSafe(dir)) return out;
  let entries: string[];
  try { entries = readdirSync(dir); } catch { return out; }
  for (const e of entries) {
    const full = path.join(dir, e);
    let isDir = false;
    try { isDir = statSync(full).isDirectory(); } catch { continue; }
    if (isDir) { out.push(...loadSkillFiles(full)); continue; }
    if (path.basename(e).toLowerCase() !== "skill.md") continue;
    const raw = readFileSync(full, "utf8");
    const { name, description, body, disabled, always } = parseSkillFrontmatter(raw);
    const skillName = name || path.basename(dir);
    if (!description && !disabled) {
      // description 없는 SKILL.md는 route 문서형 — 스킬 목록에서 제외 (pi-agent-core 규칙 동일)
      continue;
    }
    out.push({ name: skillName, description: description || "(설명 없음)", content: body, filePath: full, disabled, always });
  }
  return out;
}

function existsSafe(p: string): boolean {
  try { return statSync(p).isDirectory(); } catch { return false; }
}

/** 부서 페르소나의 스킬 로드 (없으면 빈 배열) */
export function getPersonaSkills(personaKey: string): SkillHint[] {
  return loadSkillFiles(personaSkillDir(personaKey));
}

/** 공통 스킬 로드 — 모든 부서에 항상 적용되는 행동원칙·사고방식 스킬 */
export function getCommonSkills(): SkillHint[] {
  return loadSkillFiles(commonSkillsDir());
}

/** 부서 페르소나의 '항상 포함' 스킬 (frontmatter always:true → 부서 행동 원칙 등) */
export function getAlwaysOnDeptSkills(personaKey: string): SkillHint[] {
  return loadSkillFiles(personaSkillDir(personaKey)).filter((s) => s.always);
}

/** 베이스 systemPrompt + Skill(행동원칙·사고방식·업무 절차) 목록을 합친 프롬프트 */
export function buildPersonaSystemPromptWithSkills(base: string, skills: SkillHint[]): string {
  if (!skills.length) return base;
  const header =
    "\n\n---\n[Skill · 행동원칙·사고방식·업무 절차] 아래 스킬은 행동 원칙과 사고 방식(항상 적용) 또는 업무 절차(해당 업무 수행 시)입니다. " +
    "관련 상황에서 스킬 본문의 기준과 절차를 따라 답변합니다. 구체적인 업무 내용(실적·기준·사실)은 [DB 지식]이 제공합니다.\n";
  const blocks = skills.map((s, i) => `### Skill ${i + 1}: ${s.name} (${s.description})\n${s.content}`);
  return `${base}${header}\n${blocks.join("\n\n")}`;
}

/** dispatch/delegate 툴 파라미터용 부서 목록 */

import type { KnowledgePrompt, KnowledgeSkill, KnowledgeMemory } from "@/lib/db/schema";

export interface HarnessBundle {
  prompts: KnowledgePrompt[];
  skills: KnowledgeSkill[];
  memories: KnowledgeMemory[];
}

export async function loadPersonaHarness(personaKey: string): Promise<HarnessBundle> {
  const { listPrompts, listSkills, listMemories } = await import("@/lib/harness/store");
  const [prompts, skills, memories] = await Promise.all([
    listPrompts(personaKey),
    listSkills(personaKey),
    listMemories(personaKey),
  ]);
  return {
    prompts: prompts.filter((p) => p.active),
    skills: skills.filter((s) => s.active),
    memories: memories.filter((m) => m.active),
  };
}

function buildPromptBlocks(prompts: KnowledgePrompt[]): string {
  if (!prompts.length) return "";
  const blocks = prompts.map((p, i) => `### 지식 규칙 ${i + 1}: ${p.title} (${p.kind})
${p.content}`);
  return `\n\n---\n[DB 지식 · 업무 내용(지식 규칙)] 아래는 부서의 업무 내용·지식 규칙입니다. Skill(행동원칙·절차)과 함께 상황에 적용합니다.\n${blocks.join("\n\n")}`;
}

function buildDbSkillBlocks(skills: KnowledgeSkill[]): string {
  if (!skills.length) return "";
  const blocks = skills.map((s) => `### Skill: ${s.name} (${s.description})
${s.content}`);
  return `\n\n---\n[DB 지식 · 추가 스킬] 아래는 DB에 저장된 추가 스킬(행동원칙·사고방식)입니다. 해당 업무를 수행할 때 참고하세요.\n${blocks.join("\n\n")}`;
}

function buildMemoryBlocks(memories: KnowledgeMemory[]): string {
  if (!memories.length) return "";
  const lines = memories.map((m) => {
    const conf = m.confidence != null && m.confidence < 1 ? ` (신뢰도 ${Math.round(m.confidence * 100)}%)` : "";
    return `- [${m.kind}] ${m.content}${conf}`;
  });
  return `\n\n---\n[DB 지식 · 메모리(업무 내용)] 아래 메모리는 업무의 근거·선호·결정 축적 지식입니다. 관련 상황에서 참고하세요.\n${lines.join("\n")}`;
}

/** 베이스 + 파일 스킬 + DB 지식(프롬프트/스킬/메모리) 병합 — 순서 보장, 비활성 제외 */
export function mergeWithHarness(base: string, fileSkills: SkillHint[], harness: HarnessBundle): string {
  let out = buildPersonaSystemPromptWithSkills(base, fileSkills);
  out += buildPromptBlocks(harness.prompts);
  out += buildDbSkillBlocks(harness.skills);
  out += buildMemoryBlocks(harness.memories);
  return out;
}

export interface PromptBuildOptions {
  categoryKey?: string | null;
  style?: "coaching" | "conclusion";
  /** 현재 질문 — 이 값이 있으면 질문 의도/카테고리에 맞는 스킬·모듈만 조합 */
  question?: string | null;
  /** 명시적으로 선택한 스킬 (질문 대신 직접 지정) */
  selectedSkills?: SkillHint[];
}

/** 부서 페르소나 전체 시스템 프롬프트 (베이스 + 파일 스킬 + DB 활성 지식 + 판단/스타일 블록) */
export async function buildPersonaSystemPromptWithHarness(
  personaKey: string,
  base: string,
  opts: PromptBuildOptions = {}
): Promise<string> {
  // ── Skill 계층: 항상 적용(공통+부서 행동원칙) + 질문·카테고리별 선택(업무 절차) ──
  // 항상 포함되는 스킬: _common(공통 행동원칙·사고방식) + frontmatter always:true(부서 행동 원칙)
  const commonSkills = getCommonSkills();
  const alwaysOnDept = getAlwaysOnDeptSkills(personaKey);
  const alwaysOn = [...commonSkills, ...alwaysOnDept];
  const alwaysOnNames = new Set(alwaysOn.map((sk) => sk.name));
  const domainPool = getPersonaSkills(personaKey).filter((sk) => !alwaysOnNames.has(sk.name));

  // 업무 절차 스킬 조합: 명시 선택 > 질문 분류 > 전체
  let domainSkills: SkillHint[] = domainPool;
  if (opts.selectedSkills?.length) {
    domainSkills = opts.selectedSkills.filter((sk) => !alwaysOnNames.has(sk.name));
  } else if (opts.question) {
    try {
      const { selectFileSkills } = await import("@/lib/agent/promptModules");
      domainSkills = selectFileSkills(domainPool, personaKey, opts.question, opts.categoryKey ?? null);
    } catch { /* 분류 실패 시 전체 유지 */ }
  }
  // 명칭 중복 제거 후 항상 스킬 → 선택된 업무 스킬 순으로 병합 (블록 순서 보장)
  const fileSkills: SkillHint[] = [];
  const seen = new Set<string>();
  for (const sk of [...alwaysOn, ...domainSkills]) {
    if (seen.has(sk.name)) continue;
    seen.add(sk.name);
    fileSkills.push(sk);
  }
  const harness = await loadPersonaHarness(personaKey);
  // 질문·상황에 맞는 DB 지식만 선택(관련 없는 활성 지식은 제외) — 질문 없으면 전체(하위호환)
  let usedHarness = harness;
  if (opts.question) {
    try {
      const { selectHarnessKnowledge } = await import("@/lib/agent/promptModules");
      usedHarness = selectHarnessKnowledge(harness, opts.question, opts.categoryKey ?? null, { keepMin: 2 });
    } catch { /* 선택 실패 시 전체 유지 */ }
  }
  let out = mergeWithHarness(base, fileSkills, usedHarness);
  // 조건부 운용 모듈: 질문 분류에 따라 웹검색/데이터 질문 규칙 조합
  try {
    const { classifyQuestion, MODULE_WEBSEARCH, MODULE_DATA_QUESTION } = await import("@/lib/agent/promptModules");
    const int = classifyQuestion(personaKey, opts.question ?? null, opts.categoryKey ?? null);
    if (!int.trivial) out += "\n\n---\n" + MODULE_WEBSEARCH;
    if (int.modules.includes("dataQuestion")) out += "\n\n---\n" + MODULE_DATA_QUESTION;
  } catch { /* 모듈 실패 시 스킬 조합만 */ }
  if (isClaimsPersona(personaKey)) {
    try {
      const { buildJudgmentAndStyleBlocks } = await import("@/lib/agent/judgment");
      out += await buildJudgmentAndStyleBlocks(personaKey, opts.categoryKey ?? null, opts.style ?? "coaching");
    } catch { /* 판단/스타일 블록 실패 시 기본 프롬프트 유지 */ }
  }
  return out;
}

function isClaimsPersona(personaKey: string): boolean {
  return personaKey === "claims-planning" || personaKey === "actuarial";
}


export const SUB_AGENT_DEPARTMENTS = ["claims-planning", "actuarial"] as const;
