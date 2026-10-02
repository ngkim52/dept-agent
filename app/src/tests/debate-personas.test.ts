import { describe, it, expect } from "vitest";
import { BUILTIN_DEBATE_PERSONAS, BUILTIN_PERSONA_SEEDS, getDebatePersona, getBuiltinSeed, isConclusionPersona, debateModePersonas, defaultParticipantKeys, buildPersonaSystemPrompt, buildDebatePersona, CONCLUSION_PERSONA_KEY, DEBATE_COMMON_RULES } from "@/lib/debate/personas";

describe("기본 페르소나 카탈로그", () => {
  it("요구된 10종이 모두 있다", () => {
    const names = BUILTIN_DEBATE_PERSONAS.map((p) => p.name);
    for (const n of ["보험금기획팀장", "보험금심사팀장", "그룹장님", "인사", "재무", "IT개발", "금감원", "긍정적 에이전트", "냉철한 비판가 에이전트", "최종 결론 에이전트"]) {
      expect(names).toContain(n);
    }
    expect(BUILTIN_DEBATE_PERSONAS.length).toBe(10);
  });

  it("key 는 중복 없고 최종 결론 에이전트는 kind=conclusion 이다", () => {
    const keys = BUILTIN_DEBATE_PERSONAS.map((p) => p.key);
    expect(new Set(keys).size).toBe(keys.length);
    const c = getDebatePersona(CONCLUSION_PERSONA_KEY);
    expect(c?.kind).toBe("conclusion");
    expect(isConclusionPersona(c!)).toBe(true);
    expect(BUILTIN_DEBATE_PERSONAS.filter((p) => p.kind === "conclusion").length).toBe(1);
  });

  it("토론 발언자 목록은 결론 에이전트를 제외한다", () => {
    expect(debateModePersonas().some((p) => p.kind === "conclusion")).toBe(false);
    expect(debateModePersonas().length).toBe(9);
  });

  it("기본 참가자는 2명 이상이며 모두 실재하는 key 다", () => {
    const keys = defaultParticipantKeys();
    expect(keys.length).toBeGreaterThanOrEqual(2);
    for (const k of keys) expect(getDebatePersona(k)).toBeDefined();
  });

  it("금감원은 옵저버 kind 다", () => {
    expect(getDebatePersona("fss")?.kind).toBe("observer");
  });
});

describe("페르소나 프로필(풍부한 필드)", () => {
  it("모든 기본 페르소나가 역할·입장·전문영역·목표·양보선·말투를 갖는다", () => {
    for (const p of BUILTIN_DEBATE_PERSONAS) {
      expect(p.role.length).toBeGreaterThan(2);
      expect(p.stance.length).toBeGreaterThan(5);
      expect(p.expertise.length).toBeGreaterThan(5);
      expect(p.goal.length).toBeGreaterThan(3);
      expect(p.redLine.length).toBeGreaterThan(3);
      expect(p.tone.length).toBeGreaterThan(1);
      expect(p.emoji.length).toBeGreaterThan(0);
      expect(p.color).toMatch(/^#[0-9A-Fa-f]{6}$/);
      expect(p.systemPrompt.length).toBeGreaterThan(120);
    }
  });

  it("시스템 프롬프트에 프로필 필드와 공통 토론 규칙이 모두 들어간다", () => {
    const p = getDebatePersona("finance")!;
    expect(p.systemPrompt).toContain("재무팀");
    expect(p.systemPrompt).toContain(p.expertise);
    expect(p.systemPrompt).toContain(p.redLine);
    expect(p.systemPrompt).toContain("토론 규칙");
    expect(p.systemPrompt).toContain("반복하지 않는다");
  });

  it("buildPersonaSystemPrompt 는 결론 에이전트를 다르게 만든다", () => {
    const md = buildPersonaSystemPrompt({ name: "X", role: "r", stance: "s", expertise: "e", goal: "g", redLine: "rl", tone: "t" });
    expect(md).toContain("토론 참가자");
    const conc = buildPersonaSystemPrompt({ name: "X", role: "r", stance: "s", expertise: "e", goal: "g", redLine: "rl", tone: "t", kind: "conclusion" });
    expect(conc).toContain("최종 결론 에이전트");
    expect(conc).not.toContain("[토론 규칙");
  });

  it("추가 지침(note)이 프롬프트에 붙는다", () => {
    const p = buildDebatePersona(BUILTIN_PERSONA_SEEDS[0], { note: "항상 손해율 수치를 먼저 말한다" });
    expect(p.systemPrompt).toContain("항상 손해율 수치를 먼저 말한다");
    expect(DEBATE_COMMON_RULES).toContain("새 근거");
  });

  it("빌트인 시드를 key 로 찾을 수 있다(수정 기능의 기반)", () => {
    expect(getBuiltinSeed("critic")?.name).toBe("냉철한 비판가 에이전트");
    expect(getBuiltinSeed("nope")).toBeUndefined();
  });
});
