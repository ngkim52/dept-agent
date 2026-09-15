// 부장 페르소나 판단 로직 + 응답 스타일 주입 블록 (컨셉 §03/§06/§07)
// personas.ts 베이스(역할 한 줄) + Skill 파일 + DB 지식과 함께 systemPrompt를 구성한다.
// 
// ★ 판단 규칙(PERSONA_RULES_BLOCK)과 응답 스타일 지시는 모두
//   src/skills/_common/0-답변스타일/SKILL.md 파일에서 읽어 온다 (Skill 파일로 관리).
import { readFileSync } from "node:fs";
import path from "node:path";

export type ResponseStyle = "coaching" | "conclusion";

const SKILLS_DIR = process.env.SKILLS_DIR ?? path.join(process.cwd(), "src", "skills");
const STYLE_FILE = path.join(SKILLS_DIR, "_modules", "0-답변스타일", "SKILL.md");

/** SKILL.md frontmatter 제거 + 본문 반환 */
function readSkillBody(file: string): string {
  try {
    const raw = readFileSync(file, "utf8");
    const m = raw.match(/^---\s*\n[\s\S]*?\n---\s*\n([\s\S]*)$/);
    return m ? m[1].trim() : raw.trim();
  } catch { return ""; }
}

const STYLE_SKILL_BODY = readSkillBody(STYLE_FILE);

/** 판단 규칙 블록 — skill 파일 본문에서 '# 응답 스타일' 섹션 이전 부분 */
export const PERSONA_RULES_BLOCK = (() => {
  const body = STYLE_SKILL_BODY;
  const cut = body.indexOf("# 응답 스타일");
  return (cut >= 0 ? body.slice(0, cut) : body).trim();
})();

/** 결론형/코칭형 스타일 지시 — skill 파일 본문에서 해당 섹션을 추출 */
export function buildStyleInstruction(style: ResponseStyle, categoryLabel?: string): string {
  const scope = categoryLabel ? "이 대화는 \"" + categoryLabel + "\" 업무 범위 안에서만 답한다." : "";
  const sec = `# 응답 스타일 (${style === "conclusion" ? "결론형" : "코칭형"}${style === "coaching" ? " · 기본" : ""})`;
  const body = STYLE_SKILL_BODY;
  const start = body.indexOf(sec);
  let directive = "";
  if (start >= 0) {
    const seg = body.slice(start + sec.length);
    const end = seg.indexOf("# 응답 스타일");
    directive = (end >= 0 ? seg.slice(0, end) : seg).trim();
  }
  return ["---", `# 응답 스타일: ${style === "conclusion" ? "결론형" : "코칭형"} (${style === "conclusion" ? "coaching 생략" : "기본"})` + (scope ? " " + scope : ""), directive].filter(Boolean).join("\n");
}

export async function buildJudgmentAndStyleBlocks(
  personaKey: string,
  categoryKey?: string | null,
  style: ResponseStyle = "coaching"
): Promise<string> {
  let label: string | undefined;
  try {
    const { getCategory } = await import("@/lib/catalog");
    label = getCategory(personaKey, categoryKey)?.label;
  } catch { /* 카탈로그 로드 실패 시 무시 */ }
  return PERSONA_RULES_BLOCK + "\n" + buildStyleInstruction(style, label);
}
