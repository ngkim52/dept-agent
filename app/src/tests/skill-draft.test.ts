import { describe, it, expect, beforeEach } from "vitest";
import { resetDb, withDept } from "./helpers";
import { listCandidates } from "@/lib/harness/review";
import {
  parseKnowledgeDraft, distillKnowledgeDraft, buildDistillPrompt,
  parseSkillCandidates, buildSkillCandidatePrompt, createSkillCandidatesFromKnowledge,
} from "@/lib/harness/knowledgeDraft";
import { skillAuthoringGuide, NAMING_RULES } from "@/lib/harness/skillGuide";

beforeEach(async () => { await resetDb(); await withDept(); });

describe("skillGuide", () => {
  it("이름·설명 규칙과 스킬 생성기 지침을 담는다", () => {
    const g = skillAuthoringGuide("claims-planning");
    expect(g).toContain(NAMING_RULES);
    expect(g).toContain("스킬 생성기");
  });
});

describe("parseKnowledgeDraft", () => {
  it("skill 초안 파싱", () => {
    const d = parseKnowledgeDraft(JSON.stringify({ kind: "skill", name: "손해율 대응", description: "손해율 초과 시 사용합니다.", content: "# 요구 시점\n- 초과 시" }));
    expect(d?.kind).toBe("skill");
    expect(d?.name).toBe("손해율 대응");
    expect(d?.content).toContain("# 요구 시점");
  });
  it("prompt/memory 초안 파싱 + 코드블록 제거", () => {
    const d = parseKnowledgeDraft("```json\n{\"kind\":\"memory\",\"title\":\"임계값\",\"content\":\"보험사기 의심 임계값은 0.8이다\"}\n```");
    expect(d?.kind).toBe("memory");
    expect(d?.title).toBe("임계값");
  });
  it("skill인데 name/description이 없으면 거부", () => {
    expect(parseKnowledgeDraft('{"kind":"skill","content":"x"}')).toBeNull();
  });
  it("kind가 잘못되면 거부", () => {
    expect(parseKnowledgeDraft('{"kind":"weird","content":"x"}')).toBeNull();
  });
});

describe("buildDistillPrompt", () => {
  it("스킬 생성기 가이드 + 원문 복사 금지 지침 포함", () => {
    const p = buildDistillPrompt({ personaKey: "claims-planning", question: "질문", request: "요청", transcript: "Q: hi\nA: ho" });
    expect(p).toContain(NAMING_RULES);
    expect(p).toContain("대화록은 넣지 않는다");
  });
});

describe("distillKnowledgeDraft", () => {
  it("call 결과를 초안으로 변환", async () => {
    const call = async () => JSON.stringify({ kind: "prompt", title: "응답 말투", content: "항상 결론을 먼저 쓴다." });
    const d = await distillKnowledgeDraft({ personaKey: "claims-planning", question: "q", request: "r" }, call);
    expect(d?.kind).toBe("prompt");
    expect(d?.content).toBe("항상 결론을 먼저 쓴다.");
  });
  it("call 실패 시 null", async () => {
    const d = await distillKnowledgeDraft({ personaKey: "claims-planning", question: "q", request: "r" }, async () => { throw new Error("boom"); });
    expect(d).toBeNull();
  });
});

describe("스킬 후보 생성", () => {
  it("buildSkillCandidatePrompt는 스킬만 고르도록 지시", () => {
    const p = buildSkillCandidatePrompt("claims-planning", [{ content: "절차 A" }]);
    expect(p).toContain(NAMING_RULES);
    expect(p).toContain("스킬로 만들지 마세요");
  });
  it("parseSkillCandidates — 배열만 반환", () => {
    expect(parseSkillCandidates('{"skills":[]}')).toHaveLength(0);
    const ok = parseSkillCandidates('{"skills":[{"name":"N","description":"D","content":"C"}]}');
    expect(ok[0].name).toBe("N");
  });
  it("createSkillCandidatesFromKnowledge — create_skill 후보로 등록", async () => {
    const call = async () => JSON.stringify({ skills: [{ name: "이상징후 대응", description: "이상징후 탐지 시 사용합니다.", content: "# 요구 시점\n- 탐지 시" }] });
    const r = await createSkillCandidatesFromKnowledge("claims-planning", [{ content: "이상징후 탐지 후 조사 절차를 수행한다" }], { sourceKind: "admin_chat", sourceId: "c1", call });
    expect(r.createdCount).toBe(1);
    const cands = await listCandidates({ personaKey: "claims-planning" });
    expect(cands).toHaveLength(1);
    expect(cands[0].action).toBe("create_skill");
    expect(cands[0].targetTitle).toBe("이상징후 대응");
    expect(cands[0].summary).toBe("이상징후 탐지 시 사용합니다.");
    expect(cands[0].status).toBe("pending");
  });
  it("call 없거나 실패 시 후보 없음", async () => {
    const r = await createSkillCandidatesFromKnowledge("claims-planning", [{ content: "x" }], { sourceKind: "admin_chat", sourceId: "c1", call: async () => { throw new Error("no"); } });
    expect(r.createdCount).toBe(0);
    expect(await listCandidates({ personaKey: "claims-planning" })).toHaveLength(0);
  });
});
