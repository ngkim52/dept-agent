import { describe, it, expect, beforeEach } from "vitest";
import { NextRequest } from "next/server";
import { resetDb, withUser, withDept } from "./helpers";
import { createSession } from "@/lib/auth/session";
import { db, schema } from "@/lib/db";
import { eq } from "drizzle-orm";
import { createPrompt } from "@/lib/harness/store";

beforeEach(async () => { await resetDb(); await withDept(); });

async function session(u: { id: string }) { return createSession(u.id).then(r => r.token); }
const req = (url: string, init?: any) => new NextRequest("http://localhost" + url, init);

describe("GET /api/admin/harness", () => {
  it("관리자: 타입별 지식 목록 반환", async () => {
    const admin = await withUser({ role: "admin" });
    await createPrompt({ personaKey: "claims-planning", title: "T", content: "c" });
    const { GET } = await import("@/app/api/admin/harness/route");
    const res = await GET(req("/api/admin/harness?type=prompt", { headers: { Cookie: "dept_session=" + await session(admin) } }));
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.type).toBe("prompt");
    // 병합 인벤토리: 기본(base)·학습(learned) 모두 포함
    expect(data.merged).toBe(true);
    expect(data.items.some((it: any) => it.source === "base")).toBe(true);
    const learned = data.items.find((it: any) => it.source === "learned");
    expect(learned).toBeTruthy();
    expect(learned.content).toBe("c");
  });

  it("비관리자 403 / type 누락 400", async () => {
    const u = await withUser({ role: "user" });
    const { GET } = await import("@/app/api/admin/harness/route");
    const res = await GET(req("/api/admin/harness?type=prompt", { headers: { Cookie: "dept_session=" + await session(u) } }));
    expect(res.status).toBe(403);
    const admin = await withUser({ role: "admin" });
    const res2 = await GET(req("/api/admin/harness", { headers: { Cookie: "dept_session=" + await session(admin) } }));
    expect(res2.status).toBe(400);
  });
});

describe("POST /api/admin/harness (생성)", () => {
  it("관리자: 메모리 생성 + 201 + 버전 create 기록", async () => {
    const admin = await withUser({ role: "admin" });
    const { POST } = await import("@/app/api/admin/harness/route");
    const res = await POST(req("/api/admin/harness?type=memory", {
      method: "POST", headers: { "Content-Type": "application/json", Cookie: "dept_session=" + await session(admin) },
      body: JSON.stringify({ personaKey: "claims-planning", kind: "decision", content: "손해율 5% 초과 시 원인 분석", tags: ["손해율"] }),
    }));
    expect(res.status).toBe(201);
    const { item } = await res.json();
    expect(item.kind).toBe("decision");
    const vs = await db.select().from(schema.knowledgeVersions).where(eq(schema.knowledgeVersions.entryId, item.id));
    expect(vs[0].action).toBe("create");
  });

  it("content 없으면 400", async () => {
    const admin = await withUser({ role: "admin" });
    const { POST } = await import("@/app/api/admin/harness/route");
    const res = await POST(req("/api/admin/harness?type=prompt", {
      method: "POST", headers: { "Content-Type": "application/json", Cookie: "dept_session=" + await session(admin) },
      body: JSON.stringify({ personaKey: "claims-planning" }),
    }));
    expect(res.status).toBe(400);
  });
});

describe("PATCH / DELETE / restorable", () => {
  it("관리자: 수정 → 이력 → 롤백 → 비활성", async () => {
    const admin = await withUser({ role: "admin" });
    const p = await createPrompt({ personaKey: "claims-planning", title: "T", content: "v1" });

    const { PATCH } = await import("@/app/api/admin/harness/[id]/route");
    const upd = await PATCH(req(`/api/admin/harness/${p.id}?type=prompt`, {
      method: "PATCH", headers: { "Content-Type": "application/json", Cookie: "dept_session=" + await session(admin) },
      body: JSON.stringify({ content: "v2" }),
    }), { params: Promise.resolve({ id: p.id }) });
    expect((await upd.json()).item.content).toBe("v2");

    // 롤백 v1
    const vs = await db.select().from(schema.knowledgeVersions).where(eq(schema.knowledgeVersions.entryId, p.id));
    const createVersion = vs.find(v => v.action === "create")!;
    const { POST } = await import("@/app/api/admin/harness/[id]/restore/route");
    const rest = await POST(req(`/api/admin/harness/${createVersion.id}/restore`, { method: "POST", headers: { Cookie: "dept_session=" + await session(admin) } }), { params: Promise.resolve({ id: createVersion.id }) });
    const { item } = await rest.json();
    expect(item.content).toBe("v1");

    // 비활성 (소프트 disable)
    const del = await (await import("@/app/api/admin/harness/[id]/route")).DELETE(req(`/api/admin/harness/${p.id}?type=prompt&active=false`, { method: "DELETE", headers: { Cookie: "dept_session=" + await session(admin) } }), { params: Promise.resolve({ id: p.id }) });
    expect((await del.json()).item.active).toBe(false);
  });

  it("항목 GET — 상세 + versions", async () => {
    const admin = await withUser({ role: "admin" });
    const p = await createPrompt({ personaKey: "claims-planning", title: "T", content: "c" });
    const { GET } = await import("@/app/api/admin/harness/[id]/route");
    const res = await GET(req(`/api/admin/harness/${p.id}?type=prompt`, { headers: { Cookie: "dept_session=" + await session(admin) } }), { params: Promise.resolve({ id: p.id }) });
    const data = await res.json();
    expect(data.item.id).toBe(p.id);
    expect(data.versions.length).toBeGreaterThanOrEqual(1);
  });

  it("관리자: ?hard=1 하드 삭제 — 행 제거 + 버전 delete 기록", async () => {
    const admin = await withUser({ role: "admin" });
    const sk = await (await import("@/lib/harness/store")).createSkill({ personaKey: "claims-planning", name: "S", content: "c" });
    assertExists(sk.id);
    const { DELETE } = await import("@/app/api/admin/harness/[id]/route");
    const res = await DELETE(req(`/api/admin/harness/${sk.id}?type=skill&hard=1`, { method: "DELETE", headers: { Cookie: "dept_session=" + await session(admin) } }), { params: Promise.resolve({ id: sk.id }) });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.deleted).toBe(true);
    // 행이 실제 삭제됨
    const rows = await db.select().from(schema.knowledgeSkills).where(eq(schema.knowledgeSkills.id, sk.id));
    expect(rows.length).toBe(0);
    // 삭제 버전 기록
    const vs = await db.select().from(schema.knowledgeVersions).where(eq(schema.knowledgeVersions.entryId, sk.id));
    const del = vs.find(v => v.action === "delete");
    expect(del).toBeTruthy();
  });

  it("관리자: 수정(PATCH) 후 내용/이름/설명 갱신", async () => {
    const admin = await withUser({ role: "admin" });
    const sk = await (await import("@/lib/harness/store")).createSkill({ personaKey: "claims-planning", name: "기존", description: "old", content: "c1" });
    const { PATCH } = await import("@/app/api/admin/harness/[id]/route");
    const res = await PATCH(req(`/api/admin/harness/${sk.id}?type=skill`, {
      method: "PATCH", headers: { "Content-Type": "application/json", Cookie: "dept_session=" + await session(admin) },
      body: JSON.stringify({ name: "신규", description: "new", content: "c2" }),
    }), { params: Promise.resolve({ id: sk.id }) });
    expect(res.status).toBe(200);
    const { item } = await res.json();
    expect(item.name).toBe("신규");
    expect(item.description).toBe("new");
    expect(item.content).toBe("c2");
  });
});

function assertExists(v: unknown) { expect(v).toBeTruthy(); }
