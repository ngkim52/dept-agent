import { describe, it, expect, beforeEach, vi } from "vitest";
import { NextRequest } from "next/server";
import { randomUUID } from "node:crypto";
import { resetDb, withDept, withUser } from "./helpers";
import { db, schema } from "@/lib/db";
import { createSession } from "@/lib/auth/session";

const mocks = vi.hoisted(() => ({
  streamFn: vi.fn(),
  retrieveFn: vi.fn(),
}));

// LLM/RAG는 목으로 대체 — engine의 실제 메시지 조립 로직을 그대로 검증
vi.mock("@/lib/agent/llm", () => ({
  getLlmModel: vi.fn(async () => ({
    models: { stream: mocks.streamFn },
    model: { id: "deepseek-v4-flash" },
  })),
}));
vi.mock("@/lib/ragflow/client", () => ({
  ragflow: { retrieve: mocks.retrieveFn },
}));

describe("POST /api/chat/stream", () => {
  beforeEach(async () => {
    await resetDb();
    await withDept();
    mocks.streamFn.mockReset();
    mocks.retrieveFn.mockReset();
    mocks.streamFn.mockImplementation(async function* () {
      yield { type: "text_delta", delta: "부서장" };
      yield { type: "text_delta", delta: " 답변입니다" };
    });
    mocks.retrieveFn.mockResolvedValue([]);
  });

  it("현재 질문이 LLM 컨텍스트에 중복 없이 1번만 전달되고 SSE로 스트리밍", async () => {
    const u = await withUser({});
    const { token } = await createSession(u.id);
    const convId = randomUUID();
    await db.insert(schema.conversations).values({ id: convId, userId: u.id, departmentId: u.departmentId, title: "새 대화", createdAt: new Date() });

    const { POST } = await import("@/app/api/chat/stream/route");
    const res = await POST(new NextRequest("http://localhost/api/chat/stream", {
      method: "POST",
      headers: { "Content-Type": "application/json", Cookie: `dept_session=${token}` },
      body: JSON.stringify({ conversationId: convId, message: "심사 프로세스 검토해줘" }),
    }));
    expect(res.status).toBe(200);
    const body = await res.text();

    expect(body).toContain("event: text_delta");
    expect(body).toContain("data: {\"delta\":\"부서장");
    expect(body).toContain("event: done");

    // LLM에게 전달된 메시지 검증
    const ctx = mocks.streamFn.mock.calls[0][1] as { systemPrompt: string; messages: Array<{ role: string; content: unknown }> };
    const msgs = ctx.messages;
    const userMsgs = msgs.filter((m) => m.role === "user");
    // 현재 질문 텍스트는 정확히 1번만 (과거 중복 버그 회귀 방지)
    expect(userMsgs).toHaveLength(1);
    expect(String(userMsgs[0].content)).toContain("[질문/업무 내용]\n심사 프로세스 검토해줘");
    expect(ctx.systemPrompt).toContain("보험금심사기획 부서장");

    // DB: user 메시지 1건 + assistant 메시지 1건 저장
    const saved = await db.query.messages.findMany({ where: (m, { eq }) => eq(m.conversationId, convId) });
    const roles = saved.map((m) => m.role).sort();
    expect(roles).toEqual(["assistant", "user"]);
    expect(saved.find((m) => m.role === "assistant")?.content).toBe("부서장 답변입니다");
  });
});
