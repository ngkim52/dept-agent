
import { describe, it, expect } from "vitest";
import { DEMO_SCENARIOS, getDemoScenario } from "@/lib/demo-scenarios";
import { categoryAuthority } from "@/lib/catalog";
import { buildJudgmentAndStyleBlocks } from "@/lib/agent/judgment";

describe("시연 딥 3영역 (카드5/3/2)", () => {
  it("3개 시나리오 존재 + 카테고리 연결", () => {
    expect(DEMO_SCENARIOS).toHaveLength(3);
    expect(DEMO_SCENARIOS.map((s) => s.categoryKey).sort()).toEqual(["claims2", "claims3", "claims5"].sort());
  });
  it("카드별 권한 기대치 일치 (5=협의, 3/2=단독)", () => {
    expect(getDemoScenario("demo5")?.expect.authority).toBe(categoryAuthority("claims5"));
    expect(getDemoScenario("demo3")?.expect.authority).toBe(categoryAuthority("claims3"));
    expect(getDemoScenario("demo2")?.expect.authority).toBe(categoryAuthority("claims2"));
  });
  it("카드5 신상품 프롬프트 → '협의 필요' + '제안' 지침 포함", async () => {
    const b = await buildJudgmentAndStyleBlocks("claims-planning", "claims5", "conclusion");
    expect(b).toContain("협의 필요");
    expect(b).toContain("제안");
  });
  it("시나리오 대표 질문에 기대 지식 키워드 포함", () => {
    for (const s of DEMO_SCENARIOS) {
      for (const k of s.expect.knowledge) expect(s.prompt).toContain(k);
    }
  });
});
