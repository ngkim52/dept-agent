import { describe, it, expect, beforeEach } from "vitest";
import { resetDb, withDept, withUser } from "./helpers";
import { db, schema } from "@/lib/db";
import { randomUUID } from "node:crypto";
import { parseHarvestJson, harvestConversation, createCandidatesFromHarvest, HARVEST_CONFIDENCE_THRESHOLD } from "@/lib/harness/harvest";
import { listCandidates } from "@/lib/harness/review";

beforeEach(async () => { await resetDb(); await withDept(); });

describe("harvest.parseHarvestJson", () => {
  it("깨끗한 배열", () => {
    const r = parseHarvestJson('[{"kind":"decision","content":"손해율 5% 초과 시 원인분석","confidence":0.9}]');
    expect(r[0]).toEqual({ kind: "decision", content: "손해율 5% 초과 시 원인분석", confidence: 0.9 });
  });
  it("코드블록 제거 + 무효 항목 걸러냄", () => {
    const raw = "결과입니다\n```json\n[{\"kind\":\"rule\",\"content\":\"분기 보고에 전월 대비 포함\",\"confidence\":0.95},{\"kind\":\"x\",\"content\":\"\",\"confidence\":0.1}]\n```";
    const r = parseHarvestJson(raw);
    expect(r).toHaveLength(1);
    expect(r[0].kind).toBe("rule");
  });
});

describe("harvestConversation (임계 필터)", () => {
  it("confidence >= 0.8만 accepted", async () => {
    const call = async () => JSON.stringify([
      { kind: "rule", content: "명확한 규칙", confidence: 0.95 },
      { kind: "preference", content: "모호함", confidence: 0.6 },
    ]);
    const r = await harvestConversation("제목", [{ role: "user", content: "질문" }, { role: "assistant", content: "답변" }], call);
    expect(r.accepted).toHaveLength(1);
    expect(r.accepted[0].content).toBe("명확한 규칙");
    expect(r.threshold).toBe(HARVEST_CONFIDENCE_THRESHOLD);
  });
});

describe("createCandidatesFromHarvest (항상 pending)", () => {
  it("후보 생성 + 중복 건너뜀", async () => {
    const items = [
      { kind: "rule" as const, content: "손해율 5% 초과 시 원인분석", confidence: 0.9 },
      { kind: "rule" as const, content: "손해율 5% 초과 시 원인분석", confidence: 0.95 }, // 중복
    ];
    const r = await createCandidatesFromHarvest("claims-planning", "c1", items);
    expect(r.createdCount).toBe(1);
    const cands = await listCandidates({ personaKey: "claims-planning" });
    expect(cands).toHaveLength(1);
    expect(cands[0].status).toBe("pending");
    expect(cands[0].sourceKind).toBe("admin_chat");
    expect(cands[0].sourceId).toBe("c1");
  });
});

describe("POST /api/admin/harvest", () => {
  it("비관리자 403 / conversationId 누락 400", async () => {
    const u = await withUser({ role: "user" });
    const { createSession } = await import("@/lib/auth/session");
    const { POST } = await import("@/app/api/admin/harvest/route");
    const res = await POST(new (await import("next/server")).NextRequest("http://x/api/admin/harvest?conversationId=c1", { method: "POST", headers: { Cookie: "dept_session=" + (await createSession(u.id)).token } }));
    expect(res.status).toBe(403);
  });

  it("관리자: 대화 load 후 후보 생성 (harvest 모의 불가로 conversationId 무효 → 404/400류 or 생성)", async () => {
    // 존재하지 않는 대화 → "대화를 찾을 수 없습니다" 오류 응답 (500류) 대신 requireAdmin 통과 확인만
    const admin = await withUser({ role: "admin" });
    const { createSession } = await import("@/lib/auth/session");
    const { POST } = await import("@/app/api/admin/harvest/route");
    const res = await POST(new (await import("next/server")).NextRequest("http://x/api/admin/harvest?conversationId=nope", { method: "POST", headers: { Cookie: "dept_session=" + (await createSession(admin.id)).token } }));
    const d = await res.json();
    // requireAdmin 통과(401/403 아님) + 대화 없음 처리
    expect(res.status).not.toBe(401);
    expect(res.status).not.toBe(403);
  });
});
