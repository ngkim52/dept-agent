import { describe, it, expect, beforeEach, vi } from "vitest";
import { resetDb } from "./helpers";
import { toPiHistory, runPersonaAgent } from "@/lib/agent/engine";
import { getPersona } from "@/lib/agent/personas";
import type { Message as DbMessage } from "@/lib/db/schema";

const mocks = vi.hoisted(() => ({ streamFn: vi.fn() }));
vi.mock("@/lib/agent/llm", () => ({
  getLlmModel: vi.fn(async () => ({
    models: { stream: mocks.streamFn },
    model: { id: "deepseek-v4-flash" },
    modelsStore: { getProvider: () => undefined },
  })),
}));
vi.mock("@/lib/ragflow/client", () => ({
  ragflow: { retrieve: vi.fn(async () => []) },
}));

function mk(role: DbMessage["role"], content: string, createdAt = new Date("2026-08-20T00:00:00Z")) {
  return { role, content, createdAt } as Pick<DbMessage, "role" | "content" | "createdAt">;
}

describe("toPiHistory", () => {
  it("system 제외 + user/assistant 변환", () => {
    const h = toPiHistory([mk("system", "무시"), mk("user", "질문"), mk("assistant", "답변")]);
    expect(h.map((m) => m.role)).toEqual(["user", "assistant"]);
    expect(h[1]).toMatchObject({ role: "assistant" });
    expect((h[1].content as Array<{ type: string; text: string }>)[0].text).toBe("답변");
  });

  it("최근 10건만 유지", () => {
    const h = toPiHistory(Array.from({ length: 13 }, (_, i) => mk("user", `m${i}`)));
    expect(h.length).toBe(10);
  });
});

describe("runPersonaAgent", () => {
  beforeEach(async () => {
    await resetDb();
    mocks.streamFn.mockReset();
    mocks.streamFn.mockImplementation(async function* () {
      yield { type: "text_delta", delta: "안녕" };
    });
  });

  it("히스토리 + 현재 질문(한 번) + RAG 청크로 프롬프트 조립", async () => {
    const persona = getPersona("claims-planning")!;
    let text = "";
    await runPersonaAgent(
      persona,
      "지금 질문입니다",
      [mk("user", "이전 질문"), mk("assistant", "이전 답변")],
      [{ content: "근거내용", source: "문서A.pdf", similarity: 0.9 }],
      { onTextDelta: (d) => { text += d; } }
    );
    expect(text).toBe("안녕");
    const ctx = mocks.streamFn.mock.calls[0][1] as { systemPrompt: string; messages: Array<{ role: string; content: unknown }> };
    expect(ctx.systemPrompt).toContain("보험금심사기획 부서장");
    const msgs = ctx.messages;
    // 이전 user + 이전 assistant + 현재 user 정확히 3개, 현재 질문 텍스트는 1번만 등장
    expect(msgs.filter((m) => m.role === "user")).toHaveLength(2);
    const userContents = msgs.filter((m) => m.role === "user").map((m) => String(m.content));
    expect(userContents[0]).toBe("이전 질문");
    expect(userContents[1]).toContain("[질문/업무 내용]\n지금 질문입니다");
    expect(userContents[1]).toContain("<<<RAG_CONTEXT>>>");
    expect(userContents[1]).toContain("문서A.pdf");
  });
});
