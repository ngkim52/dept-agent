
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


import { baseSystemPrompt } from "@/lib/agent/personas";

describe("시점(시간) 정합성 — 회의록·과거 자료를 진행 중으로 오인하지 않도록", () => {
  it("기본 시스템 프롬프트에 시점 정합성 규칙이 포함 (회의록 과거=그 시점 기록 / 오늘 날짜)", () => {
    const p = baseSystemPrompt("보험금기획팀장");
    expect(p).toContain("시점(시간) 정합성");
    expect(p).toContain("오늘 날짜");
    expect(p).toContain("진행 중");
    expect(p).toContain("종료");
    expect(p).toContain("그 시점");
  });
  it("완료 여부 없으면 그 시점 기준 답변 + 너무 오래된 과거면 종료로 판단 + 모르면 확인 요청 지침", () => {
    const p = baseSystemPrompt("계리 부서장");
    for (const kw of ["완료·종료·확정·마감", "그 시점 기준", "최신 계획·일정·진척", "종료(완료)된 것으로", "확인을 요청합니다"]) {
      expect(p).toContain(kw);
    }
  });
  it("buildPersonaSystemPromptWithHarness 결과에도 시점 정합성 규칙 전달", async () => {
    const p = await buildPersonaSystemPromptWithHarness("claims-planning", baseSystemPrompt("보험금기획팀장"), { question: "작년 결산 KPI는?", style: "conclusion" });
    expect(p).toContain("시점(시간) 정합성");
    expect(p).toContain("오늘 날짜");
  });
});

describe("질문 의도 명확화 — 짧고 모호한 질문 시 확인 질문 (최대 5회)", () => {
  it("기본 시스템 프롬프트에 규칙 블록이 포함", () => {
    const p = baseSystemPrompt("보험금기획팀장");
    expect(p).toContain("질문 의도 명확화");
    expect(p).toContain("짧은 확인 질문");
    expect(p).toContain("최대 5회");
    expect(p).toContain("가장 합리적인 가정");
  });
  it("하네스 합성 프롬프트에도 질문 의도 명확화 규칙이 전달", async () => {
    const p = await buildPersonaSystemPromptWithHarness("claims-planning", baseSystemPrompt("보험금기획팀장"), { question: "손해율 알려줘", style: "coaching" });
    expect(p).toContain("질문 의도 명확화");
    expect(p).toContain("최대 5회");
    expect(p).toContain("가장 합리적인 가정");
  });
});
