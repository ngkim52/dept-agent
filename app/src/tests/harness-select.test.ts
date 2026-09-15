
import { describe, it, expect, beforeEach } from "vitest";
import { resetDb, withDept } from "./helpers";
import { buildPersonaSystemPromptWithHarness } from "@/lib/agent/skills";
import { createPrompt } from "@/lib/harness/store";
import { selectHarnessKnowledge, relevanceScore } from "@/lib/agent/promptModules";

beforeEach(async () => { await resetDb(); await withDept(); });

describe("DB 지식 질문·상황 맞춤 선택 (015 보강)", () => {
  it("질문 없이 호출 → 활성 DB 지식 전부 포함 (하위호환)", async () => {
    await createPrompt({ personaKey: "claims-planning", kind: "addendum", title: "A손해율규칙", content: "손해율 5% 초과 시 원인 분석", origin: "review" });
    await createPrompt({ personaKey: "claims-planning", kind: "addendum", title: "B사내복지", content: "사내 카페 운영 시간 9시~18시", origin: "review" });
    const p = await buildPersonaSystemPromptWithHarness("claims-planning", "BASE");
    expect(p).toContain("손해율 5% 초과");
    expect(p).toContain("사내 카페");
  });

  it("관련 없는 활성 지식은 질문에 따라 제외된다 (손해율 질문 시 사내복지 제외)", async () => {
    await createPrompt({ personaKey: "claims-planning", kind: "addendum", title: "손해율 규칙", content: "손해율 계획 대비 5% 초과 시 원인 분석", origin: "review" });
    await createPrompt({ personaKey: "claims-planning", kind: "addendum", title: "사내 복지", content: "사내 카페 운영 시간", origin: "review" });
    const p = await buildPersonaSystemPromptWithHarness("claims-planning", "BASE", { question: "손해율이 계획 대비 올랐는데 원인을 분석해줘", categoryKey: "claims1" });
    expect(p).toContain("손해율 계획 대비 5% 초과");
    expect(p).not.toContain("사내 카페 운영");
  });

  it("사용 빈도 hitCount가 높은 관련 지식이 앞에 온다 (순서 반영)", () => {
    const h: any = {
      prompts: [
        { id: "p1", title: "손해율 규칙", content: "손해율 초과 시 분석", hitCount: 0, updatedAt: new Date() },
        { id: "p2", title: "손해율 규칙", content: "손해율 초과 시 보고", hitCount: 9, updatedAt: new Date() },
      ],
      skills: [], memories: [],
    };
    const out = selectHarnessKnowledge(h, "손해율 초과 시 어떻게 해?", null);
    expect(out.prompts.length).toBe(2);
    expect(out.prompts[0].id).toBe("p2");
    expect(out.prompts[1].id).toBe("p1");
  });
});
