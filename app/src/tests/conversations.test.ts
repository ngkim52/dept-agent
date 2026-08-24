import { describe, it, expect, beforeEach } from "vitest";
import { NextRequest } from "next/server";
import { randomUUID } from "node:crypto";
import { resetDb, withDept, withUser } from "./helpers";
import { db, schema } from "@/lib/db";
import { createSession } from "@/lib/auth/session";

describe("conversations list", () => {
  beforeEach(async () => { await resetDb(); await withDept(); });

  it("lastMessage는 가장 최근 메시지 (desc 정렬)", async () => {
    const u = await withUser({});
    const { token } = await createSession(u.id);
    const convId = randomUUID();
    await db.insert(schema.conversations).values({ id: convId, userId: u.id, departmentId: u.departmentId, title: "새 대화", createdAt: new Date() });
    await db.insert(schema.messages).values([
      { id: randomUUID(), conversationId: convId, role: "user", content: "첫 질문", createdAt: new Date(Date.now() - 5000) },
      { id: randomUUID(), conversationId: convId, role: "assistant", content: "첫 답변", createdAt: new Date(Date.now() - 3000) },
      { id: randomUUID(), conversationId: convId, role: "assistant", content: "최신 답변", createdAt: new Date(Date.now() - 1000) },
    ]);
    const { GET } = await import("@/app/api/conversations/route");
    const res = await GET(new NextRequest("http://localhost/api/conversations", { headers: { Cookie: `dept_session=${token}` } }));
    const data = await res.json();
    expect(data.conversations).toHaveLength(1);
    expect(data.conversations[0].lastMessage).toBe("최신 답변");
  });
});

describe("conversations department routing (부서 자동/선택)", () => {
  beforeEach(async () => { await resetDb(); await withDept(); });

  it("일반 사용자는 가입 부서(departmentId)로 자동 대화 생성", async () => {
    const u = await withUser({ role: "user", departmentId: "claims-planning" });
    const { token } = await createSession(u.id);
    const { POST } = await import("@/app/api/conversations/route");
    const res = await POST(new NextRequest("http://localhost/api/conversations", {
      method: "POST",
      headers: { "Content-Type": "application/json", Cookie: `dept_session=${token}` },
      body: JSON.stringify({}),
    }));
    const data = await res.json();
    expect(data.conversation).toBeTruthy();
    expect(data.conversation.departmentId).toBe("claims-planning");
  });

  it("관리자는 body.departmentId로 부서를 선택해 대화 생성", async () => {
    const u = await withUser({ role: "admin", departmentId: null });
    const { token } = await createSession(u.id);
    const { POST } = await import("@/app/api/conversations/route");
    const res = await POST(new NextRequest("http://localhost/api/conversations", {
      method: "POST",
      headers: { "Content-Type": "application/json", Cookie: `dept_session=${token}` },
      body: JSON.stringify({ departmentId: "claims-planning" }),
    }));
    const data = await res.json();
    expect(data.conversation.departmentId).toBe("claims-planning");
  });

  it("관리자가 부서 미지정 시 400", async () => {
    const u = await withUser({ role: "admin", departmentId: null });
    const { token } = await createSession(u.id);
    const { POST } = await import("@/app/api/conversations/route");
    const res = await POST(new NextRequest("http://localhost/api/conversations", {
      method: "POST",
      headers: { "Content-Type": "application/json", Cookie: `dept_session=${token}` },
      body: JSON.stringify({}),
    }));
    expect(res.status).toBe(400);
  });
});
