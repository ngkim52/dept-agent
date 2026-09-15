import { describe, it, expect, beforeEach, vi } from "vitest";
import { resetDb, withDept } from "./helpers";
import { createAssistantMessageEventStream } from "@earendil-works/pi-ai";
import { runPersonaAgent } from "@/lib/agent/engine";
import { getPersona } from "@/lib/agent/personas";
import { createPrompt, createSkill, createMemory } from "@/lib/harness/store";
import { eq } from "drizzle-orm";
import type { Message as DbMessage } from "@/lib/db/schema";

const mocks = vi.hoisted(() => ({ streamFn: vi.fn() }));
vi.mock("@/lib/agent/llm", () => ({
  getLlmModel: vi.fn(async () => ({
    models: { streamSimple: mocks.streamFn },
    model: { id: "deepseek-v4-flash" },
  })),
}));
vi.mock("@/lib/ragflow/client", () => ({
  ragflow: { retrieve: vi.fn(async () => []) },
}));

function fakeStream() {
  const s = createAssistantMessageEventStream();
  s.push({ type: "start", partial: { role: "assistant", content: [], api: "openai-completions", provider: "litellm", model: "deepseek-v4-flash", stopReason: "in_progress", timestamp: Date.now() } as any });
  s.push({ type: "text_delta", contentIndex: 0, delta: "안녕", partial: { role: "assistant", content: [{ type: "text", text: "안녕" }], api: "openai-completions", provider: "litellm", model: "deepseek-v4-flash", stopReason: "in_progress", timestamp: Date.now() } as any });
  s.end({ role: "assistant", content: [{ type: "text", text: "안녕" }], api: "openai-completions", provider: "litellm", model: "deepseek-v4-flash", stopReason: "stop", timestamp: Date.now() } as any);
  return s;
}

describe("지식 항목 hitCount 집계 (프롬프트에 포함된 항목만 카운트)", () => {
  beforeEach(async () => {
    await resetDb();
    await withDept();
    mocks.streamFn.mockReset();
    mocks.streamFn.mockImplementation(fakeStream);
  });

  it("에이전트 실행 시 실제 주입된 메모리/스킬/프롬프트 hitCount 증가", async () => {
    const { db, schema } = await import("@/lib/db");
    const persona = getPersona("claims-planning")!;

    const prompt = await createPrompt({ personaKey: "claims-planning", title: "심사 규정", content: "손해율 지급 기준을 확인한다.", kind: "addendum" });
    const skill = await createSkill({ personaKey: "claims-planning", name: "손해율 분석", content: "손해율을 계산한다." });
    const memory = await createMemory({ personaKey: "claims-planning", kind: "fact", content: "팀 목표는 손해율 90% 이하 유지" });

    // 설계상 '손해율' 질문 → 손해율 스킬 포함되도록 질문 지정
    await runPersonaAgent(
      persona,
      "손해율 분석 부탁해",
      [] as Pick<DbMessage, "role" | "content" | "createdAt">[],
      [],
      { onTextDelta: () => {} }
    );

    const pRow = await db.query.knowledgePrompts.findFirst({ where: eq(schema.knowledgePrompts.id, prompt.id) });
    const sRow = await db.query.knowledgeSkills.findFirst({ where: eq(schema.knowledgeSkills.id, skill.id) });
    const mRow = await db.query.knowledgeMemories.findFirst({ where: eq(schema.knowledgeMemories.id, memory.id) });

    expect(pRow?.hitCount).toBe(1);
    expect(sRow?.hitCount).toBe(1);
    expect(mRow?.hitCount).toBe(1);
  });

  it("여러 항목이 각각 카운트되고 두 번 실행하면 2회로 누적", async () => {
    const { db, schema } = await import("@/lib/db");
    const persona = getPersona("claims-planning")!;
    const promptA = await createPrompt({ personaKey: "claims-planning", title: "규칙 A", content: "A 지침", kind: "addendum" });
    const promptB = await createPrompt({ personaKey: "claims-planning", title: "규칙 B", content: "B 지침", kind: "addendum" });

    for (let i = 0; i < 2; i++) {
      await runPersonaAgent(persona, "규칙 알려줘", [], [], { onTextDelta: () => {} });
    }
    const a = await db.query.knowledgePrompts.findFirst({ where: eq(schema.knowledgePrompts.id, promptA.id) });
    const b = await db.query.knowledgePrompts.findFirst({ where: eq(schema.knowledgePrompts.id, promptB.id) });
    expect(a?.hitCount).toBe(2);
    expect(b?.hitCount).toBe(2);
  });
});
