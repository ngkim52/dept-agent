import { describe, it, expect, beforeEach, vi } from "vitest";
import { NextRequest } from "next/server";
import { randomUUID } from "node:crypto";
import { resetDb, withDept, withUser } from "./helpers";
import { createAssistantMessageEventStream } from "@earendil-works/pi-ai";
import { db, schema } from "@/lib/db";
import { createSession } from "@/lib/auth/session";

const mocks = vi.hoisted(() => ({
  streamFn: vi.fn(),
  retrieveFn: vi.fn(),
}));

// LLM/RAG는 목으로 대체 — engine의 실제 메시지 조립 로직을 그대로 검증
vi.mock("@/lib/agent/llm", () => ({
  getLlmModel: vi.fn(async () => ({
    models: { streamSimple: mocks.streamFn },
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
    mocks.streamFn.mockImplementation(() => {
      const s = createAssistantMessageEventStream();
      s.push({ type: "start", partial: { role: "assistant", content: [], api: "openai-completions", provider: "litellm", model: "deepseek-v4-flash", stopReason: "in_progress", timestamp: Date.now() } as any });
      s.push({ type: "text_delta", contentIndex: 0, delta: "부서장", partial: { role: "assistant", content: [{ type: "text", text: "부서장" }], api: "openai-completions", provider: "litellm", model: "deepseek-v4-flash", stopReason: "in_progress", timestamp: Date.now() } as any });
      s.push({ type: "text_delta", contentIndex: 0, delta: " 답변입니다", partial: { role: "assistant", content: [{ type: "text", text: "부서장 답변입니다" }], api: "openai-completions", provider: "litellm", model: "deepseek-v4-flash", stopReason: "in_progress", timestamp: Date.now() } as any });
      s.end({ role: "assistant", content: [{ type: "text", text: "부서장 답변입니다" }], api: "openai-completions", provider: "litellm", model: "deepseek-v4-flash", stopReason: "stop", timestamp: Date.now() } as any);
      return s;
    });
    mocks.retrieveFn.mockResolvedValue([]);
  });

  it("fileIds로 지정한 내 자료 본문이 RAG 컨텍스트에 주입되어 citations로 전달", async () => {
    const u = await withUser({});
    const { token } = await createSession(u.id);
    const convId = randomUUID();
    await db.insert(schema.conversations).values({ id: convId, userId: u.id, departmentId: u.departmentId, title: "새 대화", createdAt: new Date() });
    const docId = randomUUID();
    await db.insert(schema.documents).values({
      id: docId, userId: u.id, departmentId: u.departmentId, filename: "기준.txt",
      content: "청구금액 100만원 초과 시 추가 심사 필요", ragflowDocId: null, status: "done", createdAt: new Date(),
    });

    const { POST } = await import("@/app/api/chat/stream/route");
    const res = await POST(new NextRequest("http://localhost/api/chat/stream", {
      method: "POST",
      headers: { "Content-Type": "application/json", Cookie: `dept_session=${token}` },
      body: JSON.stringify({ conversationId: convId, message: "기준.txt 내용 요약", fileIds: [docId] }),
    }));
    expect(res.status).toBe(200);
    const body = await res.text();
    expect(body).toContain("내 자료: 기준.txt");
    expect(body).toContain("청구금액 100만원 초과 시 추가 심사 필요");
  });

  it("타 사용자 문서 id는 무시 (자기 소유만 주입)", async () => {
    const u = await withUser({});
    const { token } = await createSession(u.id);
    const convId = randomUUID();
    await db.insert(schema.conversations).values({ id: convId, userId: u.id, departmentId: u.departmentId, title: "새 대화", createdAt: new Date() });
    const other = await withUser({ email: "other2@shinhan.com" });
    const otherDoc = randomUUID();
    await db.insert(schema.documents).values({
      id: otherDoc, userId: other.id, departmentId: other.departmentId ?? "actuarial", filename: "타인.txt",
      content: "남의 비밀", ragflowDocId: null, status: "done", createdAt: new Date(),
    });

    const { POST } = await import("@/app/api/chat/stream/route");
    const res = await POST(new NextRequest("http://localhost/api/chat/stream", {
      method: "POST",
      headers: { "Content-Type": "application/json", Cookie: `dept_session=${token}` },
      body: JSON.stringify({ conversationId: convId, message: "아무거나", fileIds: [otherDoc] }),
    }));
    const body = await res.text();
    expect(body).not.toContain("남의 비밀");
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

    // 진행 패널: 부서 RAG 조회가 도구 단계로 노출되는지 (툴 사용 0개 문제 회귀 방지)
    expect(body).toContain("RAG 자료 검색");
    expect(body).toContain("event: progress");

    // LLM에게 전달된 메시지 검증
    const ctx = mocks.streamFn.mock.calls[0][1] as { systemPrompt: string; messages: Array<{ role: string; content: unknown }> };
    const msgs = ctx.messages;
    const userMsgs = msgs.filter((m) => m.role === "user");
    // 현재 질문 텍스트는 정확히 1번만 (과거 중복 버그 회귀 방지)
    expect(userMsgs).toHaveLength(1);
    const uc = userMsgs[0].content as any;
    const userText = typeof uc === "string" ? uc : (Array.isArray(uc) ? uc.map((x: any) => x.text ?? "").join("") : String(uc));
    expect(userText).toContain("[질문/업무 내용]\n심사 프로세스 검토해줘");
    expect(ctx.systemPrompt).toContain("신한라이프 보험금기획팀장");

    // DB: user 메시지 1건 + assistant 메시지 1건 저장
    const saved = await db.query.messages.findMany({ where: (m, { eq }) => eq(m.conversationId, convId) });
    const roles = saved.map((m) => m.role).sort();
    expect(roles).toEqual(["assistant", "user"]);
    expect(saved.find((m) => m.role === "assistant")?.content).toBe("부서장 답변입니다");
  });
});
