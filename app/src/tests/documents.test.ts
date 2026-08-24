import { describe, it, expect, beforeEach, vi } from "vitest";
import { NextRequest } from "next/server";
import { randomUUID } from "node:crypto";
import { resetDb, withDept, withUser } from "./helpers";
import { db, schema } from "@/lib/db";
import { createSession } from "@/lib/auth/session";

const mocks = vi.hoisted(() => ({ listDocsFn: vi.fn() }));
vi.mock("@/lib/ragflow/client", () => ({
  ragflow: { listDatasetDocuments: mocks.listDocsFn },
}));

describe("GET /api/documents", () => {
  beforeEach(async () => {
    await resetDb();
    await withDept();
    mocks.listDocsFn.mockReset();
  });

  it("파싱 완료 문서는 done으로 상태 갱신되어 반환", async () => {
    const u = await withUser({});
    const { token } = await createSession(u.id);
    const docId = randomUUID();
    await db.insert(schema.documents).values({
      id: docId, userId: u.id, departmentId: u.departmentId as string,
      filename: "중기전략.pdf", ragflowDocId: "rag-1", status: "uploaded", createdAt: new Date(),
    });
    mocks.listDocsFn.mockResolvedValue([{ id: "rag-1", name: "중기전략.pdf", runStatus: "DONE", progress: 1 }]);

    const { GET } = await import("@/app/api/documents/route");
    const res = await GET(new NextRequest("http://localhost/api/documents", { headers: { Cookie: `dept_session=${token}` } }));
    const data = await res.json();
    expect(data.documents).toHaveLength(1);
    expect(data.documents[0].status).toBe("done");

    const saved = await db.query.documents.findFirst({ where: (d, { eq }) => eq(d.id, docId) });
    expect(saved?.status).toBe("done");
  });

  it("RUNNING이면 parsing 상태 유지", async () => {
    const u = await withUser({});
    const { token } = await createSession(u.id);
    await db.insert(schema.documents).values({
      id: randomUUID(), userId: u.id, departmentId: u.departmentId as string,
      filename: "a.pdf", ragflowDocId: "rag-2", status: "parsing", createdAt: new Date(),
    });
    mocks.listDocsFn.mockResolvedValue([{ id: "rag-2", name: "a.pdf", runStatus: "RUNNING", progress: 0.5 }]);
    const { GET } = await import("@/app/api/documents/route");
    const res = await GET(new NextRequest("http://localhost/api/documents", { headers: { Cookie: `dept_session=${token}` } }));
    const data = await res.json();
    expect(data.documents[0].status).toBe("parsing");
  });

  it("ragflowDocId 없는 문서는 동기화하지 않고 uploaded 유지", async () => {
    const u = await withUser({});
    const { token } = await createSession(u.id);
    await db.insert(schema.documents).values({
      id: randomUUID(), userId: u.id, departmentId: u.departmentId as string,
      filename: "a.pdf", ragflowDocId: null, status: "uploaded", createdAt: new Date(),
    });
    const { GET } = await import("@/app/api/documents/route");
    const res = await GET(new NextRequest("http://localhost/api/documents", { headers: { Cookie: `dept_session=${token}` } }));
    const data = await res.json();
    expect(data.documents[0].status).toBe("uploaded");
    expect(mocks.listDocsFn).not.toHaveBeenCalled();
  });
});
