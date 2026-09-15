import { describe, it, expect, beforeEach } from "vitest";
import { NextRequest } from "next/server";
import { resetDb, withUser, withDept } from "./helpers";
import { createSession } from "@/lib/auth/session";
import { db, schema } from "@/lib/db";
import { eq } from "drizzle-orm";
import { createCandidate } from "@/lib/harness/review";
import { createMemory as cm } from "@/lib/harness/store";

async function authed(user: any) {
  const token = await createSession(user.id).then((r) => r.token);
  return { Cookie: "dept_session=" + token, "Content-Type": "application/json" };
}

describe("POST /api/admin/candidates — 처리", () => {
  beforeEach(async () => { process.env.DRYRUN_JUDGE_DISABLED = "1"; await resetDb(); await withDept(); });

  it("GET: 대기 후보에 연관 항목(related) 포함", async () => {
    const admin = await withUser({ role: "admin" });
    await cm({ personaKey: "claims-planning", content: "손해율 5% 초과 시 원인분석 착수, 보험금 심사 기준", confidence: 0.9 });
    await createCandidate({ personaKey: "claims-planning", sourceKind: "admin_chat", sourceId: "c1", action: "create_memory", proposedContent: "손해율이 5%를 초과하면 보험금 심사 기준으로 원인분석을 착수한다", confidence: 0.9 });
    const headers = await authed(admin);
    const { GET } = await import("@/app/api/admin/candidates/route");
    const res = await GET(new NextRequest("http://localhost/api/admin/candidates?personaKey=claims-planning", { headers }));
    const d = await res.json();
    expect(res.status).toBe(200);
    expect(d.candidates.length).toBe(1);
    expect(Array.isArray(d.candidates[0].related)).toBe(true);
    expect(d.candidates[0].related.length).toBeGreaterThan(0);
  });

  it("GET: 1주일 지난 미결정 후보는 자동 정리", async () => {
    const admin = await withUser({ role: "admin" });
    const old = await createCandidate({ personaKey: "claims-planning", sourceKind: "admin_chat", sourceId: "c1", action: "create_memory", proposedContent: "오래된 후보", confidence: 0.5 });
    await db.update(schema.improvementCandidates).set({ createdAt: new Date(Date.now() - 8 * 24 * 60 * 60 * 1000) }).where(eq(schema.improvementCandidates.id, old.id));
    const headers = await authed(admin);
    const { GET } = await import("@/app/api/admin/candidates/route");
    const res = await GET(new NextRequest("http://localhost/api/admin/candidates?personaKey=claims-planning", { headers }));
    const d = await res.json();
    expect(d.candidates.length).toBe(0);
  });
});

describe("GET /api/admin/candidates/[id]?related=1 — 온디맨드 LLM 정밀 연관", () => {
  beforeEach(async () => { process.env.DRYRUN_JUDGE_DISABLED = "1"; await resetDb(); await withDept(); });

  it("단건 후보에 대한 연관 항목만 온디맨드로 반환", async () => {
    const admin = await withUser({ role: "admin" });
    await cm({ personaKey: "claims-planning", content: "손해율 5% 초과 시 원인분석 착수, 보험금 심사 기준", confidence: 0.9 });
    const cand = await createCandidate({ personaKey: "claims-planning", sourceKind: "admin_chat", sourceId: "c1", action: "create_memory", proposedContent: "손해율이 5%를 초과하면 보험금 심사 기준으로 원인분석을 착수한다", confidence: 0.9 });
    const headers = await authed(admin);
    const { GET } = await import("@/app/api/admin/candidates/[id]/route");
    const res = await GET(new NextRequest(`http://localhost/api/admin/candidates/${cand.id}?related=1`, { headers }), { params: Promise.resolve({ id: cand.id }) });
    const d = await res.json();
    expect(res.status).toBe(200);
    expect(d.candidate.id).toBe(cand.id);
    expect(Array.isArray(d.related)).toBe(true);
    expect(d.related.length).toBeGreaterThan(0);
  });
});
