import { describe, it, expect, beforeEach } from "vitest";
import { NextRequest } from "next/server";
import { resetDb, withUser, withDept } from "./helpers";
import { createSession } from "@/lib/auth/session";
import { addEdge, listEdges } from "@/lib/harness/review";

beforeEach(async () => { await resetDb(); await withDept(); });

async function session(u: { id: string }) { return createSession(u.id).then(r => r.token); }
const req = (url: string, init?: any) => new NextRequest("http://localhost" + url, init);

describe("지식 연결 그래프 (/api/admin/harness/graph)", () => {
  it("관리자: 엣지 목록을 반환한다", async () => {
    const admin = await withUser({ role: "admin" });
    await addEdge({ fromType: "memory", fromId: "mem-1", toType: "prompt", toId: "prm-1", rel: "related" });
    await addEdge({ fromType: "episode", fromId: "ep-1", toType: "candidate", toId: "cand-1", rel: "source_of" });
    const { GET } = await import("@/app/api/admin/harness/graph/route");
    const res = await GET(req("/api/admin/harness/graph", { headers: { Cookie: "dept_session=" + await session(admin) } }));
    expect(res.status).toBe(200);
    const data = await res.json();
    const rels = data.edges.map((e: any) => e.rel).sort();
    expect(rels).toEqual(["related", "source_of"]);
  });

  it("노드 라벨(nodes)을 함께 반환 — 원시 id 아닌 읽을 수 있는 이름", async () => {
    const admin = await withUser({ role: "admin" });
    await addEdge({ fromType: "memory", fromId: "mem-1", toType: "prompt", toId: "prm-1", rel: "related" });
    const { GET } = await import("@/app/api/admin/harness/graph/route");
    const res = await GET(req("/api/admin/harness/graph", { headers: { Cookie: "dept_session=" + await session(admin) } }));
    const data = await res.json();
    expect(data.nodes).toBeTruthy();
    expect(data.nodes["memory:mem-1"]).toBeTruthy();
    expect(data.nodes["memory:mem-1"].kindLabel).toBe("메모리");
    // types 범례 포함
    expect(data.types).toMatchObject({ memory: "메모리", prompt: "규칙", skill: "스킬" });
  });

  it("fromType/fromId 필터가 동작한다", async () => {
    const admin = await withUser({ role: "admin" });
    await addEdge({ fromType: "memory", fromId: "mem-1", toType: "prompt", toId: "prm-1", rel: "related" });
    await addEdge({ fromType: "episode", fromId: "ep-1", toType: "candidate", toId: "cand-1", rel: "source_of" });
    const { GET } = await import("@/app/api/admin/harness/graph/route");
    const res = await GET(req("/api/admin/harness/graph?fromType=memory&fromId=mem-1", { headers: { Cookie: "dept_session=" + await session(admin) } }));
    const data = await res.json();
    expect(data.edges.length).toBe(1);
    expect(data.edges[0].fromId).toBe("mem-1");
  });

  it("비관리자는 403", async () => {
    const u = await withUser({ role: "user" });
    const { GET } = await import("@/app/api/admin/harness/graph/route");
    const res = await GET(req("/api/admin/harness/graph", { headers: { Cookie: "dept_session=" + await session(u) } }));
    expect(res.status).toBe(403);
  });
});
