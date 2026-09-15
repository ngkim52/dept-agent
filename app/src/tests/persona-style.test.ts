
import { describe, it, expect, beforeEach } from "vitest";
import { resetDb } from "./helpers";
import { getCategories, getCategory, categoryAuthority, CLAIMS_CATEGORIES } from "@/lib/catalog";
import { buildJudgmentAndStyleBlocks, PERSONA_RULES_BLOCK } from "@/lib/agent/judgment";
import { buildPersonaSystemPromptWithHarness } from "@/lib/agent/skills";

describe("카탈로그 (업무 카드 1~6 + 기타)", () => {
  it("claims-planning은 7개 카테고리 (1~6 + 기타)", () => {
    expect(CLAIMS_CATEGORIES).toHaveLength(7);
    expect(CLAIMS_CATEGORIES.map((c) => c.no)).toEqual([1,2,3,4,5,6,0]);
  });
  it("6번 카드 사업계획·KPI 존재", () => {
    const c = getCategory("claims-planning", "claims6");
    expect(c?.label).toContain("사업계획");
    expect(c?.skill).toBe("사업계획KPI");
  });
  it("권한 범위: 신상품(claims5)=협의, 나머지=단독", () => {
    expect(categoryAuthority("claims5")).toBe("deliberation");
    for (const k of ["claims1","claims2","claims3","claims4","claims6"]) expect(categoryAuthority(k)).toBe("own");
  });
});

describe("판단 로직 블록 (지식 3레이어·지식공백·판단5단계·표준포맷·권한범위)", () => {
  it("PERSONA_RULES_BLOCK에 필수 절이 모두 포함", () => {
    for (const kw of ["지식 레이어 3단", "지식 공백", "권한 범위", "판단 5단계", "표준 응답 포맷 5단계", "우선순위 판단 사다리"]) {
      expect(PERSONA_RULES_BLOCK).toContain(kw);
    }
  });
  it("결론형 블록: 결론 선제 + 스코프 문구 포함", async () => {
    const b = await buildJudgmentAndStyleBlocks("claims-planning", "claims5", "conclusion");
    expect(b).toContain("응답 스타일: 결론형");
    expect(b).toContain("신상품 리스크 검토");
    expect(b).toContain("결론 + 핵심 근거");
    // 협의 권한 명시
    expect(b).toContain("협의 필요");
  });
  it("코칭형 블록: 되묻기 명시, 기본값", async () => {
    const b = await buildJudgmentAndStyleBlocks("claims-planning");
    expect(b).toContain("응답 스타일: 코칭형");
    expect(b).toContain("되물으며");
  });
  it("카테고리 미지정 시 스코프 없음(자유 대화)", async () => {
    const b = await buildJudgmentAndStyleBlocks("claims-planning", null, "conclusion");
    expect(b).not.toContain("업무 범위 안에서만");
  });
  it("buildPersonaSystemPromptWithHarness에 판단/스타일 블록 합성", async () => {
    const p = await buildPersonaSystemPromptWithHarness("claims-planning", "BASE", { categoryKey: "claims6", style: "conclusion" });
    expect(p).toContain("지식 레이어 3단");
    expect(p).toContain("응답 스타일: 결론형");
    expect(p).toContain("사업계획KPI"); // 6번 스킬 포함
  });
});

describe("responseStyle 저장 (me PATCH)", () => {
  beforeEach(async () => { await resetDb(); });
  it("코칭→결론 저장 후 me에 반영", async () => {
    const { withUser, withDept } = await import("./helpers");
    await withDept();
    const { db, schema } = await import("@/lib/db");
    const { eq } = await import("drizzle-orm");
    const u = await withUser({ role: "user" });
    await db.update(schema.users).set({ responseStyle: "conclusion" }).where(eq(schema.users.id, u.id));
    const after = await db.query.users.findFirst({ where: eq(schema.users.id, u.id) });
    expect(after?.responseStyle).toBe("conclusion");
    const fresh = { ...u, responseStyle: after?.responseStyle };
    expect(fresh.responseStyle).toBe("conclusion");
  });
});
