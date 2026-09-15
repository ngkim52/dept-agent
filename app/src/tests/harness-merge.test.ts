import { describe, it, expect, beforeEach } from "vitest";
import { resetDb, withDept } from "./helpers";
import { createPrompt, createSkill, createMemory, listPrompts } from "@/lib/harness/store";
import { mergeWithHarness, loadPersonaHarness, buildPersonaSystemPromptWithHarness } from "@/lib/agent/skills";

beforeEach(async () => { await resetDb(); await withDept(); });

const base = "당신은 보험금기획팀장입니다.";

describe("mergeWithHarness (병합 순서 + 비활성 제외)", () => {
  it("베이스 + 파일스킬 + 프롬프트/스킬/메모리 순서로 병합", async () => {
    await createPrompt({ personaKey: "claims-planning", kind: "rule", title: "전월 대비", content: "반드시 전월 대비 포함" });
    await createSkill({ personaKey: "claims-planning", name: "신상품점검", description: "신상품 리스크", content: "9개월 추적" });
    await createMemory({ personaKey: "claims-planning", kind: "fact", content: "손해율 5% 초과 시 원인 분석" });
    const bundle = await loadPersonaHarness("claims-planning");
    const out = mergeWithHarness(base, [], bundle);
    expect(out).toContain(base);
    expect(out.indexOf("[DB 지식 · 업무 내용(지식 규칙)]")).toBeGreaterThan(out.indexOf(base));
    expect(out).toContain("전월 대비");
    expect(out).toContain("신상품점검");
    expect(out).toContain("[fact] 손해율 5% 초과 시 원인 분석");
  });

  it("비활성 항목은 loadPersonaHarness에서 제외", async () => {
    const p = await createPrompt({ personaKey: "claims-planning", title: "폐기예정", content: "구규칙" });
    const { db, schema } = await import("@/lib/db");
    const { eq } = await import("drizzle-orm");
    await db.update(schema.knowledgePrompts).set({ active: false }).where(eq(schema.knowledgePrompts.id, p.id));
    const bundle = await loadPersonaHarness("claims-planning");
    expect(bundle.prompts).toHaveLength(0);
    const out = mergeWithHarness(base, [], bundle);
    expect(out).not.toContain("구규칙");
  });

  it("빈 하네스면 베이스만 유지", async () => {
    const bundle = await loadPersonaHarness("claims-planning");
    const out = mergeWithHarness(base, [], bundle);
    expect(out).toBe(base);
  });
});

describe("buildPersonaSystemPromptWithHarness (DB 직접)", () => {
  it("베이스 + 활성 지식 병합된 최종 프롬프트 반환", async () => {
    await createMemory({ personaKey: "claims-planning", kind: "preference", content: "항상 권고를 끝에 배치" });
    const out = await buildPersonaSystemPromptWithHarness("claims-planning", base);
    expect(out).toContain(base);
    expect(out).toContain("[DB 지식 · 메모리(업무 내용)]");
    expect(out).toContain("항상 권고를 끝에 배치");
  });
});
