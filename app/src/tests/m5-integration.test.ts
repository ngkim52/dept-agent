
import { describe, it, expect, beforeEach } from "vitest";
import { NextRequest } from "next/server";
import { resetDb } from "./helpers";

describe("M5 통합 검증 — 카테고리/판단/브리핑/보고서/확인함 연동", () => {
  beforeEach(async () => { await resetDb(); });

  async function seed() {
    const { withDept, withUser } = await import("./helpers");
    await withDept();
    const u = await withUser({ role: "admin" });
    const { createSession } = await import("@/lib/auth/session");
    const { token } = await createSession(u.id);
    const cookie = `dept_session=${token}`;
    return { u, cookie };
  }

  it("GET /api/categories → claims-planning 업무 카드 + 기타 반환", async () => {
    const { cookie } = await seed();
    const { GET } = await import("@/app/api/categories/route");
    const req = new NextRequest("http://x/api/categories?personaKey=claims-planning", { headers: { cookie } });
    const res = await GET(req);
    const d = await res.json();
    expect(res.status).toBe(200);
    expect(Array.isArray(d.categories)).toBe(true);
    const cats = d.categories;
    expect(cats.some((c: any) => c.key === "claims6" && String(c.label).includes("사업계획"))).toBe(true);
    expect(cats.some((c: any) => c.key === "claims5")).toBe(true);
  });

  it("GET /api/categories → 미인증 차단(401)", async () => {
    const { GET } = await import("@/app/api/categories/route");
    const req = new NextRequest("http://x/api/categories");
    const res = await GET(req);
    expect(res.status).toBe(401);
  });

  it("POST /api/report → 대화 기반 보고서 초안 생성", async () => {
    const { u, cookie } = await seed();
    const { db, schema } = await import("@/lib/db");
    await db.insert(schema.conversations).values({ id: "c1", userId: u.id, departmentId: u.departmentId, categoryKey: "claims5", title: "신상품 검토", createdAt: new Date() });
    await db.insert(schema.messages).values([
      { id: "m1", conversationId: "c1", role: "user", content: "신상품 자동심사 대상 확대 검토해줘", createdAt: new Date() },
      { id: "m2", conversationId: "c1", role: "assistant", content: "역선택 리스크와 협의 절차를 제안합니다.", createdAt: new Date(1) },
    ]);
    const { POST } = await import("@/app/api/report/route");
    const req = new NextRequest("http://x/api/report", { method: "POST", headers: { cookie, "Content-Type": "application/json" }, body: JSON.stringify({ conversationId: "c1" }) });
    const res = await POST(req);
    const d = await res.json();
    expect(res.status).toBe(200);
    expect(d.draft.sections.map((s: any) => s.id)).toEqual(["상황", "분석", "평가·결론", "권고안", "후속조치"]);
    expect(d.draft.title).toContain("신상품");
    expect(d.draft.sourceCount).toBe(1);
  });

  it("판단 블록: 신상품(claims5)=협의·제안까지, 시스템(claims2)=단독·결론까지", async () => {
    const { buildJudgmentAndStyleBlocks } = await import("@/lib/agent/judgment");
    const b5 = await buildJudgmentAndStyleBlocks("claims-planning", "claims5", "conclusion");
    expect(b5).toContain("협의 필요");
    expect(b5).toContain("제안");
    const b2 = await buildJudgmentAndStyleBlocks("claims-planning", "claims2", "conclusion");
    expect(b2).toContain("단독");
  });
});
