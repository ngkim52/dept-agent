import { describe, it, expect, beforeEach } from "vitest";
import { NextRequest } from "next/server";
import { resetDb, withUser, withDept } from "./helpers";
import { createSession } from "@/lib/auth/session";
import { db, schema } from "@/lib/db";
import { eq } from "drizzle-orm";
import { createCandidate } from "@/lib/harness/review";
import { createCandidatesFromHarvest } from "@/lib/harness/harvest";
import { createMemory as cm } from "@/lib/harness/store";

async function authed(user: any) {
  const token = await createSession(user.id).then((r) => r.token);
  return { Cookie: "dept_session=" + token, "Content-Type": "application/json" };
}

describe("POST /api/admin/candidates — 처리", () => {
  beforeEach(async () => { process.env.DRYRUN_JUDGE_DISABLED = "1"; await resetDb(); await withDept(); });

  it("GET: 생성 시 LLM 판정으로 저장된 관련 항목만 related로 반환", async () => {
    const admin = await withUser({ role: "admin" });
    const mem = await cm({ personaKey: "claims-planning", content: "손해율 5% 초과 시 원인분석 착수, 보험금 심사 기준", confidence: 0.9 });
    const call = async () => JSON.stringify({ items: [{ id: mem.id, reason: "손해율 원인분석 주제 일치", score: 92 }] });
    await createCandidatesFromHarvest("claims-planning", "c1", [{ kind: "rule", content: "손해율이 5%를 초과하면 보험금 심사 기준으로 원인분석을 착수한다", confidence: 0.9 }], call);
    const headers = await authed(admin);
    const { GET } = await import("@/app/api/admin/candidates/route");
    const res = await GET(new NextRequest("http://localhost/api/admin/candidates?personaKey=claims-planning", { headers }));
    const d = await res.json();
    expect(res.status).toBe(200);
    expect(d.candidates.length).toBe(1);
    expect(Array.isArray(d.candidates[0].related)).toBe(true);
    expect(d.candidates[0].related.length).toBe(1);
    expect(d.candidates[0].related[0].type).toBe("memory");
    expect(d.candidates[0].related[0].id).toBe(mem.id);
  });

  it("GET: 유사 없으면(LLM 저장 안 함) related:[]로 단건만 표시", async () => {
    const admin = await withUser({ role: "admin" });
    const call = async () => JSON.stringify({ items: [] });
    await createCandidatesFromHarvest("claims-planning", "c1", [{ kind: "rule", content: "주간 팀 회식 장소 협의", confidence: 0.9 }], call);
    const headers = await authed(admin);
    const { GET } = await import("@/app/api/admin/candidates/route");
    const res = await GET(new NextRequest("http://localhost/api/admin/candidates?personaKey=claims-planning", { headers }));
    const d = await res.json();
    expect(res.status).toBe(200);
    expect(d.candidates.length).toBe(1);
    expect(d.candidates[0].related).toEqual([]);
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

describe("A2 — pending 후보 신뢰도 상위 50건 제한", () => {
  beforeEach(async () => { process.env.DRYRUN_JUDGE_DISABLED = "1"; await resetDb(); await withDept(); });

  it("pending 55건 → GET 시 상위 신뢰도 50건만, 내림차순 정렬 보장", async () => {
    const admin = await withUser({ role: "admin" });
    const confs = Array.from({ length: 55 }, (_, i) => i / 100); // 0.00 ~ 0.54
    for (const conf of confs) {
      await createCandidate({ personaKey: "claims-planning", sourceKind: "admin_chat", sourceId: "c", action: "create_memory", proposedContent: `후보 ${conf}`, confidence: conf });
    }
    const headers = await authed(admin);
    const { GET } = await import("@/app/api/admin/candidates/route");
    const res = await GET(new NextRequest("http://localhost/api/admin/candidates?personaKey=claims-planning&status=pending", { headers }));
    const d = await res.json();
    expect(d.candidates.length).toBe(50);
    const got = d.candidates.map((c: any) => c.confidence);
    const desc = [...got].sort((a: number, b: number) => b - a);
    expect(got).toEqual(desc);
    // 신뢰도 하위 5건(0.00~0.04)은 잘려야 함
    expect(got[49]).toBe(0.05);
    expect(got.some((v: number) => v < 0.05)).toBe(false);
  });
});

describe("GET /api/admin/candidates/[id]?related=1 — 온디맨드 LLM 정밀 연관", () => {
  beforeEach(async () => { process.env.DRYRUN_JUDGE_DISABLED = "1"; await resetDb(); await withDept(); });

  it("DRYRUN(판정 비활성)에서는 저장된 관련 항목만 반환", async () => {
    const admin = await withUser({ role: "admin" });
    const mem = await cm({ personaKey: "claims-planning", content: "손해율 5% 초과 시 원인분석 착수, 보험금 심사 기준", confidence: 0.9 });
    const call = async () => JSON.stringify({ items: [{ id: mem.id, reason: "유사", score: 95 }] });
    await createCandidatesFromHarvest("claims-planning", "c1", [{ kind: "rule", content: "손해율 5% 초과 시 보험금 심사 원인분석 착수", confidence: 0.9 }], call);
    const cand = (await (await import("@/lib/harness/review")).listCandidates({ personaKey: "claims-planning" }))[0];
    const headers = await authed(admin);
    const { GET } = await import("@/app/api/admin/candidates/[id]/route");
    const res = await GET(new NextRequest(`http://localhost/api/admin/candidates/${cand.id}?related=1`, { headers }), { params: Promise.resolve({ id: cand.id }) });
    const d = await res.json();
    expect(res.status).toBe(200);
    expect(d.candidate.id).toBe(cand.id);
    expect(Array.isArray(d.related)).toBe(true);
    expect(d.related.length).toBe(1);
    expect(d.related[0].id).toBe(mem.id);
  });
});
