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
}

/** 스킬 루트 디렉토리 (프로젝트 루트 기준) */
const _root = path.join(process.cwd(), "src", "skills");
export const SKILLS_DIR = process.env.SKILLS_DIR ?? _root;

/** 부서키(페르소나 키) → 스킬 디렉토리 경로 */
export function personaSkillDir(personaKey: string): string {
  return path.join(SKILLS_DIR, personaKey);
}

/** frontmatter 간단 파서 (--- 로 둘러싸인 YAML name/description 읽기) */
export function parseSkillFrontmatter(raw: string): { name: string; description: string; body: string; disabled: boolean } {
  const m = raw.match(/^---\s*\n([\s\S]*?)\n---\s*\n([\s\S]*)$/);
  if (!m) return { name: "", description: "", body: raw, disabled: false };
  const meta = m[1];
  const body = m[2].trim();
  const name = meta.match(/^name:\s*(.+)$/m)?.[1]?.trim() ?? "";
  const description = meta.match(/^description:\s*(.+)$/m)?.[1]?.trim() ?? "";
  const disabled = /^disable-model-invocation:\s*true$/m.test(meta);
  return { name, description, body, disabled };
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
    const { name, description, body, disabled } = parseSkillFrontmatter(raw);
    const skillName = name || path.basename(dir);
    if (!description && !disabled) {
      // description 없는 SKILL.md는 route 문서형 — 스킬 목록에서 제외 (pi-agent-core 규칙 동일)
      continue;
    }
    out.push({ name: skillName, description: description || "(설명 없음)", content: body, filePath: full, disabled });
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

/** 베이스 systemPrompt + 활성 스킬 목록/지침을 합친 프롬프트 */
export function buildPersonaSystemPromptWithSkills(base: string, skills: SkillHint[]): string {
  if (!skills.length) return base;
  const header =
    "\n\n---\n[보유 업무 스킬] 아래 스킬은 해당 업무를 수행할 때만 참고하세요. " +
    "관련 없는 질문에는 적용하지 마세요. 필요하면 스킬 본문의 절차를 따라 답변합니다.\n";
  const blocks = skills.map((s, i) => `### Skill ${i + 1}: ${s.name} (${s.description})\n${s.content}`);
  return `${base}${header}\n${blocks.join("\n\n")}`;
}

/** dispatch/delegate 툴 파라미터용 부서 목록 */
export const SUB_AGENT_DEPARTMENTS = ["claims-planning", "actuarial"] as const;
