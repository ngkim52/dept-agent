import { describe, it, expect, beforeEach, vi } from "vitest";
import { NextRequest } from "next/server";
import { resetDb, withUser, withDept } from "./helpers";
import { db, schema } from "@/lib/db";
import { createSession } from "@/lib/auth/session";

const mocks = vi.hoisted(() => ({ listDatasetsFn: vi.fn() }));
vi.mock("@/lib/ragflow/client", () => ({
  ragflow: { listDatasets: mocks.listDatasetsFn },
}));

async function session(u: { id: string }) {
  const { token } = await createSession(u.id);
  return token;
}

const COOKIE = (u: { id: string }) => ({ headers: { Cookie: "dept_session=" + session ? "" : "" } });

describe("GET /api/admin/departments", () => {
  beforeEach(async () => { await resetDb(); await withDept(); mocks.listDatasetsFn.mockReset(); });

  it("관리자: 부서 목록 + RAGFlow 데이터셋 목록 반환", async () => {
    const admin = await withUser({ role: "admin" });
    mocks.listDatasetsFn.mockResolvedValue([{ id: "ds-1", name: "손해율 관리" }]);
    const { GET } = await import("@/app/api/admin/departments/route");
    const res = await GET(new NextRequest("http://localhost/api/admin/departments",
      { headers: { Cookie: "dept_session=" + (await session(admin)) } }));
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.departments).toBeDefined();
    expect(data.datasets).toEqual([{ id: "ds-1", name: "손해율 관리" }]);
  });

  it("비관리자는 403 거부", async () => {
    const u = await withUser({ role: "user" });
    const { GET } = await import("@/app/api/admin/departments/route");
    const res = await GET(new NextRequest("http://localhost/api/admin/departments",
      { headers: { Cookie: "dept_session=" + (await session(u)) } }));
    expect(res.status).toBe(403);
  });
});

describe("PUT /api/admin/departments (데이터셋 연결)", () => {
  beforeEach(async () => { await resetDb(); await withDept(); mocks.listDatasetsFn.mockReset(); });

  it("관리자: 부서에 여러 RAGFlow 데이터셋(배열) 저장", async () => {
    const admin = await withUser({ role: "admin" });
    const { PUT } = await import("@/app/api/admin/departments/route");
    const res = await PUT(new NextRequest("http://localhost/api/admin/departments", {
      method: "PUT",
      headers: { "Content-Type": "application/json", Cookie: "dept_session=" + (await session(admin)) },
      body: JSON.stringify({ departmentId: "claims-planning", datasetIds: ["ds-9", "ds-10", "ds-11"] }),
    }));
    expect(res.status).toBe(200);
    const rows = await db.query.departmentDatasets.findMany({
      where: (t, { eq }) => eq(t.departmentId, "claims-planning"),
    });
    expect(rows.map(r => r.datasetId).sort()).toEqual(["ds-10", "ds-11", "ds-9"]);
  });

  it("관리자: 빈 배열로 전체 연결 해제", async () => {
    const admin = await withUser({ role: "admin" });
    const { PUT } = await import("@/app/api/admin/departments/route");
    await PUT(new NextRequest("http://localhost/api/admin/departments", {
      method: "PUT",
      headers: { "Content-Type": "application/json", Cookie: "dept_session=" + (await session(admin)) },
      body: JSON.stringify({ departmentId: "claims-planning", datasetIds: ["ds-1"] }),
    }));
    const res2 = await PUT(new NextRequest("http://localhost/api/admin/departments", {
      method: "PUT",
      headers: { "Content-Type": "application/json", Cookie: "dept_session=" + (await session(admin)) },
      body: JSON.stringify({ departmentId: "claims-planning", datasetIds: [] }),
    }));
    expect(res2.status).toBe(200);
    const rows = await db.query.departmentDatasets.findMany({ where: (t, { eq }) => eq(t.departmentId, "claims-planning") });
    expect(rows).toHaveLength(0);
  });


  it("비관리자는 403", async () => {
    const u = await withUser({ role: "user" });
    const { PUT } = await import("@/app/api/admin/departments/route");
    const res = await PUT(new NextRequest("http://localhost/api/admin/departments", {
      method: "PUT", headers: { "Content-Type": "application/json", Cookie: "dept_session=" + (await session(u)) },
      body: JSON.stringify({ departmentId: "x", datasetId: "ds" }),
    }));
    expect(res.status).toBe(403);
  });
});
