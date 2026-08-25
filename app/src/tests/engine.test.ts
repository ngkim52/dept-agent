import { describe, it, expect, beforeEach, vi } from "vitest";
import { resetDb } from "./helpers";
import { createAssistantMessageEventStream } from "@earendil-works/pi-ai";
import { toPiHistory, runPersonaAgent, makeWebSearchTool } from "@/lib/agent/engine";
import { webSearch, formatSearchResults } from "@/lib/agent/websearch";
import { getPersona } from "@/lib/agent/personas";
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
    mocks.streamFn.mockImplementation(() => {
      const s = createAssistantMessageEventStream();
      s.push({ type: "start", partial: { role: "assistant", content: [], api: "openai-completions", provider: "litellm", model: "deepseek-v4-flash", stopReason: "in_progress", timestamp: Date.now() } as any });
      s.push({ type: "text_delta", contentIndex: 0, delta: "안녕", partial: { role: "assistant", content: [{ type: "text", text: "안녕" }], api: "openai-completions", provider: "litellm", model: "deepseek-v4-flash", stopReason: "in_progress", timestamp: Date.now() } as any });
      s.end({ role: "assistant", content: [{ type: "text", text: "안녕" }], api: "openai-completions", provider: "litellm", model: "deepseek-v4-flash", stopReason: "stop", timestamp: Date.now() } as any);
      return s;
    });
  });

  it("히스토리 + 현재 질문(한 번) + RAG 청크(transformContext로 주입)", async () => {
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
    expect(mocks.streamFn).toHaveBeenCalled();
    const ctx = mocks.streamFn.mock.calls[0][1] as { systemPrompt: string; messages: Array<{ role: string; content: string }> };
    expect(ctx.systemPrompt).toContain("보험금심사기획 부서장");
    const msgs = ctx.messages;
    // RAG(user) + 이전 질문(user) + 현재 질문(user) = user 3건
    const userContents = msgs.filter((m) => m.role === "user").map((m) => {
      const c = m.content as any;
      return typeof c === "string" ? c : (Array.isArray(c) ? c.map((x: any) => x.text ?? "").join("") : String(c));
    });
    // RAG 컨텍스트가 transformContext로 주입됨
    expect(userContents.some((u) => u.includes("<<<RAG_CONTEXT>>>") && u.includes("문서A.pdf"))).toBe(true);
    // 현재 질문은 정확히 1번
    const q = userContents.filter((u) => u.includes("[질문/업무 내용]\n지금 질문입니다"));
    expect(q).toHaveLength(1);
  });
});

describe("웹서치 툴", () => {
  it("툴 정의 — name/label/parameters", () => {
    const tool = makeWebSearchTool();
    expect(tool.name).toBe("websearch");
    expect(tool.label).toBe("웹 검색");
    expect(tool.description).toContain("검색");
    expect(tool.parameters as any).toBeDefined();
  });

  it("formatSearchResults — 결과 텍스트 변환/빈 결과", () => {
    expect(formatSearchResults("q", { ok: true, provider: "serper", results: [
      { title: "금융위", url: "https://fsc.go.kr", snippet: "보험업 감독규정 개정" },
    ] })).toContain("[웹 1] 금융위");
    expect(formatSearchResults("q", { ok: false, provider: "none", results: [] })).toBe("(웹 검색 불가)");
    expect(formatSearchResults("q", { ok: true, provider: "serper", results: [] })).toBe("(검색 결과 없음)");
  });

  it("webSearch — 키 없으면 ok:false + 안내", async () => {
    const { config } = await import("@/lib/config");
    const serper = config.websearch.serperApiKey;
    const tavily = config.websearch.tavilyApiKey;
    (config as any).websearch = { serperApiKey: "", tavilyApiKey: "" };
    const res = await webSearch("테스트");
    expect(res.ok).toBe(false);
    expect(res.error).toContain("검색 API 키");
    (config as any).websearch = { serperApiKey: serper, tavilyApiKey: tavily };
  });
});
