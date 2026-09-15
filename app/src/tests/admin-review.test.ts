import { describe, it, expect, beforeEach } from "vitest";
import { NextRequest } from "next/server";
import { resetDb, withUser, withDept } from "./helpers";
import { createCandidate, createEpisode } from "@/lib/harness/review";
import { createSession } from "@/lib/auth/session";

async function cookie(user: any) { return { Cookie: "dept_session=" + (await createSession(user.id)).token }; }

beforeEach(async () => { await resetDb(); await withDept(); });

describe("GET /api/admin/episodes", () => {
  it("관리자: 목록 반환, 비관리자 403", async () => {
    const admin = await withUser({ role: "admin" });
    await createEpisode({ departmentId: "claims-planning", summary: "s", conclusion: "c", status: "ready" });
    const { GET } = await import("@/app/api/admin/episodes/route");
    const res = await GET(new NextRequest("http://x/api/admin/episodes?departmentId=claims-planning", { headers: await cookie(admin) }));
    expect((await res.json()).episodes.length).toBe(1);

    const u = await withUser({ role: "user" });
    const res2 = await GET(new NextRequest("http://x/api/admin/episodes", { headers: await cookie(u) }));
    expect(res2.status).toBe(403);
  });
});

describe("POST /api/admin/candidates", () => {
  it("관리자: 후보 생성 + 201", async () => {
    const admin = await withUser({ role: "admin" });
    const { POST } = await import("@/app/api/admin/candidates/route");
    const res = await POST(new NextRequest("http://x/api/admin/candidates", {
      method: "POST", headers: { ...(await cookie(admin)), "Content-Type": "application/json" },
      body: JSON.stringify({ personaKey: "claims-planning", sourceKind: "admin_chat", sourceId: "c1", action: "create_memory", proposedContent: "요약을 끝에 배치", confidence: 0.9 }),
    }));
    expect(res.status).toBe(201);
    expect((await res.json()).candidate.status).toBe("pending");
  });
  it("action 누락 400 / 비관리자 403", async () => {
    const admin = await withUser({ role: "admin" });
    const { POST } = await import("@/app/api/admin/candidates/route");
    const r1 = await POST(new NextRequest("http://x/api/admin/candidates", { method: "POST", headers: { ...(await cookie(admin)), "Content-Type": "application/json" }, body: JSON.stringify({ personaKey: "claims-planning", proposedContent: "x" }) }));
    expect(r1.status).toBe(400);
    const u = await withUser({ role: "user" });
    const r2 = await POST(new NextRequest("http://x/api/admin/candidates", { method: "POST", headers: { ...(await cookie(u)), "Content-Type": "application/json" }, body: JSON.stringify({ proposedContent: "x", action: "create_memory" }) }));
    expect(r2.status).toBe(403);
  });
});

describe("PATCH /api/admin/candidates/[id]", () => {
  it("reject → rejected + adminNote", async () => {
    const admin = await withUser({ role: "admin" });
    const c = await createCandidate({ personaKey: "claims-planning", sourceKind: "episode", sourceId: "e1", action: "create_memory", proposedContent: "x", confidence: 0.5 });
    const { PATCH } = await import("@/app/api/admin/candidates/[id]/route");
    const res = await PATCH(new NextRequest("http://x/api/admin/candidates/x", { method: "PATCH", headers: { ...(await cookie(admin)), "Content-Type": "application/json" }, body: JSON.stringify({ decision: "reject", adminNote: "중복" }) }), { params: Promise.resolve({ id: c.id }) });
    expect((await res.json()).candidate.status).toBe("rejected");
  });

  it("apply → 지식 생성 + applied + source_of edge", async () => {
    const admin = await withUser({ role: "admin" });
    const c = await createCandidate({ personaKey: "claims-planning", sourceKind: "episode", sourceId: "e1", summary: "손해율", action: "create_memory", targetTitle: "원칙", proposedContent: "손해율 5% 초과 시 원인분석", confidence: 0.95 });
    const { PATCH } = await import("@/app/api/admin/candidates/[id]/route");
    const { db, schema } = await import("@/lib/db");
    const { eq } = await import("drizzle-orm");
    const res = await PATCH(new NextRequest("http://x/api/admin/candidates/x", { method: "PATCH", headers: { ...(await cookie(admin)), "Content-Type": "application/json" }, body: JSON.stringify({ decision: "apply" }) }), { params: Promise.resolve({ id: c.id }) });
    const data = await res.json();
    expect(data.entryType).toBe("memory");
    expect(data.candidate.status).toBe("applied");
    const mem = (await db.select().from(schema.knowledgeMemories).where(eq(schema.knowledgeMemories.id, data.entryId)))[0];
    expect(mem!.content).toContain("5%");
    expect(data.sourceEdges.some((e: any) => e.rel === "source_of")).toBe(true);
  });
});

describe("GET /api/admin/harness/graph", () => {
  it("edges 반환", async () => {
    const admin = await withUser({ role: "admin" });
    const { addEdge } = await import("@/lib/harness/review");
    await addEdge({ fromType: "episode", fromId: "e1", toType: "memory", toId: "m1", rel: "source_of" });
    const { GET } = await import("@/app/api/admin/harness/graph/route");
    const res = await GET(new NextRequest("http://x/api/admin/harness/graph", { headers: await cookie(admin) }));
    expect((await res.json()).edges.length).toBe(1);
  });
});
