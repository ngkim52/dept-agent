import { describe, it, expect, vi, beforeEach } from "vitest";
import { estimateContextLoad, shouldAutoCompact, summarizePiHistory } from "@/lib/agent/engine";
import type { Message as DbMessage } from "@/lib/db/schema";

const mocks = vi.hoisted(() => ({
  summaryFn: vi.fn(),
}));

// pi-agent-core의 generateSummaryWithUsage는 목으로 대체
vi.mock("@earendil-works/pi-agent-core", () => ({
  Agent: class Agent {},
  generateSummaryWithUsage: () => mocks.summaryFn(),
  Type: { Object: (x: any) => x, String: "string", Union: (x: any) => x, Literal: (x: any) => x },
}));

function mk(role: DbMessage["role"], content: string, createdAt = new Date("2026-08-20T00:00:00Z")) {
  return { role, content, createdAt } as Pick<DbMessage, "role" | "content" | "createdAt">;
}

describe("compact (컨텍스트 자동 압축)", () => {
  beforeEach(() => mocks.summaryFn.mockReset());

  it("estimateContextLoad: 히스토리 + RAG 길이 기반 추정치 반환", () => {
    const msgs = [mk("user", "한글 10자"), mk("assistant", "네 답변입니다")];
    const load = estimateContextLoad(msgs, [{ content: "RAG 근거", source: "s", similarity: 0.9 }], 8192);
    expect(load.tokens).toBeGreaterThan(0);
    expect(load.estimatedHistoryTokens).toBeGreaterThan(0);
    expect(load.contextWindow).toBe(8192);
    expect(load.ratio).toBeCloseTo(load.tokens / 8192, 5);
  });

  it("shouldAutoCompact: 임계비율(기본 0.6) 초과 시 true", () => {
    const load = { tokens: 210, estimatedHistoryTokens: 200, estimatedRagTokens: 0, contextWindow: 100, ratio: 2.1 };
    expect(shouldAutoCompact(load, 0.6)).toBe(true);
    expect(shouldAutoCompact(load, 0.9)).toBe(true);
  });

  it("shouldAutoCompact: 임계비율 미만이면 false", () => {
    const load = { tokens: 50, estimatedHistoryTokens: 50, estimatedRagTokens: 0, contextWindow: 100, ratio: 0.5 };
    expect(shouldAutoCompact(load, 0.6)).toBe(false);
  });

  it("summarizePiHistory: generateSummaryWithUsage 목으로 요약 텍스트 반환", async () => {
    mocks.summaryFn.mockResolvedValue({ ok: true, value: { text: "이전 대화 요약: 보험금 심사 절차 검토.", usage: {} } });
    const models = { completeSimple: vi.fn() } as any;
    const model = { id: "deepseek-v4-flash", maxTokens: 4096, reasoning: false } as any;
    const summary = await summarizePiHistory(
      [mk("user", "이전 긴 대화"), mk("assistant", "답 1")],
      models,
      model,
      2000
    );
    expect(summary).toContain("요약");
    expect(mocks.summaryFn).toHaveBeenCalledTimes(1);
  });
});
