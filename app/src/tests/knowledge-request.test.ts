
import { describe, it, expect, beforeEach } from "vitest";
import { NextRequest } from "next/server";
import { resetDb, withDept, withUser } from "./helpers";
import { createSession } from "@/lib/auth/session";
import { db, schema } from "@/lib/db";
import { eq } from "drizzle-orm";
import { randomUUID } from "node:crypto";

async function call(handler: any, body: unknown, token: string) {
  return handler(new NextRequest("http://localhost/api/knowledge/request", { method: "POST", headers: { "Content-Type": "application/json", Cookie: `dept_session=${token}` }, body: JSON.stringify(body) }));
}
async function makeConv(userId: string) {
  const id = randomUUID();
  await db.insert(schema.conversations).values({ id, userId, departmentId: "claims-planning", title: "새 대화", createdAt: new Date() });
  await db.insert(schema.messages).values({ id: randomUUID(), conversationId: id, role: "user", content: "보험사기 임계값이 어떻게 되나요?", createdAt: new Date() });
  await db.insert(schema.messages).values({ id: randomUUID(), conversationId: id, role: "assistant", content: "[지식 공백] 이 영역의 임계값은 시스템 데이터에 없어 부장님 확인이 필요합니다.", createdAt: new Date() });
  return id;
}

describe("지식 축적 경로 A (직원 지식공백 확인 요청)", () => {
  beforeEach(async () => { await resetDb(); await withDept(); });
  it("대화 맥락 포함 candidate 생성 + 요청자=user + requestType=knowledge_gap", async () => {
    const u = await withUser({ role: "user" });
    const token = (await createSession(u.id)).token;
    const convId = await makeConv(u.id);
    const { POST } = await import("@/app/api/knowledge/request/route");
    const res = await call(POST, { mode: "gap", conversationId: convId }, token);
    expect(res.status).toBe(201);
    const { candidate } = await res.json();
    expect(candidate.requestType).toBe("knowledge_gap");
    expect(candidate.proposedByRole).toBe("user");
    expect(candidate.sourceConversationId).toBe(convId);
    expect(candidate.status).toBe("pending");
    expect(candidate.proposedContent).toContain("보험사기 임계값");
    expect(candidate.proposedContent).toContain("Q: 보험사기 임계값");
  });
  it("부장(admin) 확인함 큐에서 승인 가능 (rejected→approved 적용)", async () => {
    const u = await withUser({ role: "user" });
    const token = (await createSession(u.id)).token;
    const convId = await makeConv(u.id);
    const { POST } = await import("@/app/api/knowledge/request/route");
    const res = await call(POST, { mode: "gap", conversationId: convId }, token);
    const { candidate } = await res.json();
    const { resolveCandidate } = await import("@/lib/harness/review");
    const r = await resolveCandidate(candidate.id, { status: "rejected", adminNote: "내부정보다 담당자에게 확인", resolvedBy: "admin-1" });
    expect(r!.status).toBe("rejected");
    expect(r!.adminNote).toBe("내부정보다 담당자에게 확인");
  });
});

describe("지식 축적 경로 B (부장 판단기준 저장)", () => {
  beforeEach(async () => { await resetDb(); await withDept(); });
  it("admin만 가능 + pending candidate + requestType=judgment_rule", async () => {
    const admin = await withUser({ role: "admin" });
    const convId = await makeConv(admin.id);
    const token = (await createSession(admin.id)).token;
    const { POST } = await import("@/app/api/knowledge/request/route");
    const res = await call(POST, { mode: "rule", conversationId: convId, title: "보험사기 임계", content: "IF 보험사기 의심신호(동일병원 집중·단기재입원) 후속 검증 안 된 상태 THEN 즉시 담당자 회수 검토" }, token);
    expect(res.status).toBe(201);
    const { candidate } = await res.json();
    expect(candidate.requestType).toBe("judgment_rule");
    expect(candidate.proposedByRole).toBe("admin");
    expect(candidate.status).toBe("pending");
    expect(candidate.proposedContent).toContain("IF");
  });
  it("직원(user)은 경로 B(rule) 차단", async () => {
    const u = await withUser({ role: "user" });
    const convId = await makeConv(u.id);
    const token = (await createSession(u.id)).token;
    const { POST } = await import("@/app/api/knowledge/request/route");
    const res = await call(POST, { mode: "rule", conversationId: convId, content: "가짜" }, token);
    expect(res.status).toBe(403);
  });
});

describe("주간 지식공백 리포트 (T15)", () => {
  beforeEach(async () => { await resetDb(); await withDept(); });
  it("기간 내 경로A/B 후보 집계 + pending/resolved 구분", async () => {
    const { createCandidate, getKnowledgeGapReport } = await import("@/lib/harness/review");
    await createCandidate({ personaKey: "claims-planning", sourceKind: "knowledge_gap", sourceId: "c1", requestType: "knowledge_gap", proposedByRole: "user", sourceConversationId: "c1", action: "create_prompt", summary: "갭1", proposedContent: "x", confidence: 0.5 });
    const c2 = await createCandidate({ personaKey: "claims-planning", sourceKind: "judgment_rule", sourceId: "c2", requestType: "judgment_rule", proposedByRole: "admin", action: "create_prompt", summary: "룰2", proposedContent: "IF..THEN", confidence: 1 });
    const { resolveCandidate } = await import("@/lib/harness/review");
    await resolveCandidate(c2.id, { status: "rejected", adminNote: "보류", resolvedBy: "admin-1" });
    // 과거(7일 이전) 항목은 제외
    const old = await createCandidate({ personaKey: "claims-planning", sourceKind: "knowledge_gap", sourceId: "c3", requestType: "knowledge_gap", proposedByRole: "user", sourceConversationId: "c3", action: "create_prompt", summary: "갭-오래됨", proposedContent: "y", confidence: 0.5 });
    await import("@/lib/db").then(async ({ db, schema }) => {
      const { eq } = await import("drizzle-orm");
      await db.update(schema.improvementCandidates).set({ createdAt: new Date(Date.now() - 10 * 24 * 3600 * 1000) }).where(eq(schema.improvementCandidates.id, old.id));
    });
    const report = await getKnowledgeGapReport("claims-planning");
    expect(report.total).toBe(2);
    expect(report.pending).toBe(1);
    expect(report.resolved).toBe(1);
    expect(report.items.map((i) => i.requestType).sort()).toEqual(["judgment_rule", "knowledge_gap"].sort());
    expect(report.items.some((i) => i.summary === "갭-오래됨")).toBe(false);
  });
});
