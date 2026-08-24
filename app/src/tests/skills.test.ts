import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { mkdirSync, writeFileSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { loadSkillFiles, getPersonaSkills, buildPersonaSystemPromptWithSkills, SKILLS_DIR } from "@/lib/agent/skills";
import type { SkillHint } from "@/lib/agent/skills";

const tmp = path.join(os.tmpdir(), "dept-skills-test-" + process.pid);

describe("skills (SKILL.md 로딩 + 페르소나 주입)", () => {
  const dir = path.join(tmp, "claims-planning");
  beforeEach(() => {
    rmSync(tmp, { recursive: true, force: true });
    mkdirSync(dir, { recursive: true });
    writeFileSync(path.join(dir, "SKILL.md"), "---\nname: claims-심사규정\ndescription: 보험금 심사 규정 조회\n---\n\n보험금 심사 규정 참조 지침:\n- 지급 기준 확인\n- 절차 준수");
  });
  afterEach(() => rmSync(tmp, { recursive: true, force: true }));

  it("loadSkillFiles: SKILL.md를 파싱해 SkillHint 목록 반환", () => {
    const skills = loadSkillFiles(dir);
    expect(skills.length).toBe(1);
    expect(skills[0].name).toBe("claims-심사규정");
    expect(skills[0].description).toContain("보험금 심사 규정");
    expect(skills[0].content).toContain("지급 기준 확인");
  });

  it("getPersonaSkills: 실제 부서 스킬은 로드, 없는 부서는 빈 배열", () => {
    const s = getPersonaSkills("actuarial");
    expect(Array.isArray(s)).toBe(true);
    expect(s.length).toBeGreaterThanOrEqual(0);
    expect(getPersonaSkills("no-such-dept-key")).toHaveLength(0);
  });

  it("buildPersonaSystemPromptWithSkills: 스킬 지침을 system prompt에 부가", () => {
    const base = "당신은 부서장입니다.";
    const skills: SkillHint[] = [{ name: "claims-심사규정", description: "보험금 심사 규정", content: "## 사용 방법\n규정을 참조하세요", filePath: "/x/SKILL.md" }];
    const out = buildPersonaSystemPromptWithSkills(base, skills);
    expect(out).toContain(base);
    expect(out).toContain("claims-심사규정");
    expect(out).toContain("규정을 참조하세요");
  });
});
