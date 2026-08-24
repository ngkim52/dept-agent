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

async function session(u: { id: string }) {
  const { token } = await createSession(u.id);
  return token;
}

describe("GET /api/documents (사용자별)", () => {
  beforeEach(async () => { await resetDb(); await withDept(); mocks.listDocsFn.mockReset(); });

  it("본인 문서만 반환 (타 사용자 문서는 제외)", async () => {
    const u = await withUser({});
    const other = await withUser({ email: "other@shinhan.com" });
    await db.insert(schema.documents).values({
      id: randomUUID(), userId: u.id, departmentId: u.departmentId as string,
      filename: "내문서.pdf", ragflowDocId: null, status: "done", createdAt: new Date(),
    });
    await db.insert(schema.documents).values({
      id: randomUUID(), userId: other.id, departmentId: other.departmentId as string,
      filename: "남의문서.pdf", ragflowDocId: null, status: "done", createdAt: new Date(),
    });
    const { GET } = await import("@/app/api/documents/route");
    const res = await GET(new NextRequest("http://localhost/api/documents", { headers: { Cookie: "dept_session=" + (await session(u)) } }));
    const data = await res.json();
    expect(data.documents).toHaveLength(1);
    expect(data.documents[0].filename).toBe("내문서.pdf");
  });

  it("RAGFlow 미설정 상태에서도 오류 없이 목록 반환 (RAGFlow 강제 제거)", async () => {
    const u = await withUser({});
    const { GET } = await import("@/app/api/documents/route");
    const res = await GET(new NextRequest("http://localhost/api/documents", { headers: { Cookie: "dept_session=" + (await session(u)) } }));
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(Array.isArray(data.documents)).toBe(true);
  });
});

describe("POST /api/documents (사용자별 업로드)", () => {
  beforeEach(async () => { await resetDb(); await withDept(); });

  it("FormData 파일 업로드 → userId 소유 문서 저장", async () => {
    const u = await withUser({});
    const form = new FormData();
    form.append("file", new Blob(["업무 자료 내용"], { type: "text/plain" }), "메모.txt");
    const { POST } = await import("@/app/api/documents/route");
    const res = await POST(new NextRequest("http://localhost/api/documents", {
      method: "POST",
      headers: { Cookie: "dept_session=" + (await session(u)) },
      body: form as any,
    }));
    expect(res.status).toBe(201);
    const data = await res.json();
    expect(data.document.filename).toBe("메모.txt");
    const saved = await db.query.documents.findFirst({ where: (d, { eq }) => eq(d.id, data.document.id) });
    expect(saved?.userId).toBe(u.id);
  });

  it("빈 파일/무파일 → 400", async () => {
    const u = await withUser({});
    const { POST } = await import("@/app/api/documents/route");
    const form = new FormData();
    form.append("file", new Blob([""], { type: "text/plain" }), "empty.txt");
    const res = await POST(new NextRequest("http://localhost/api/documents", {
      method: "POST", headers: { Cookie: "dept_session=" + (await session(u)) }, body: form as any,
    }));
    expect(res.status).toBe(400);
  });
});

describe("DELETE /api/documents/[id] (사용자별 삭제)", () => {
  beforeEach(async () => { await resetDb(); await withDept(); });

  it("본인 문서 삭제 가능", async () => {
    const u = await withUser({});
    const docId = randomUUID();
    await db.insert(schema.documents).values({
      id: docId, userId: u.id, departmentId: u.departmentId as string,
      filename: "a.pdf", ragflowDocId: null, status: "done", createdAt: new Date(),
    });
    const { DELETE } = await import("@/app/api/documents/[id]/route");
    const res = await DELETE(new NextRequest("http://localhost/api/documents/" + docId, {
      method: "DELETE", headers: { Cookie: "dept_session=" + (await session(u)) },
    }), { params: Promise.resolve({ id: docId }) });
    expect(res.status).toBe(200);
    const left = await db.query.documents.findFirst({ where: (d, { eq }) => eq(d.id, docId) });
    expect(left).toBeUndefined();
  });

  it("타 사용자 문서 삭제는 404", async () => {
    const u = await withUser({});
    const other = await withUser({ email: "other@shinhan.com" });
    const docId = randomUUID();
    await db.insert(schema.documents).values({
      id: docId, userId: other.id, departmentId: other.departmentId as string,
      filename: "a.pdf", ragflowDocId: null, status: "done", createdAt: new Date(),
    });
    const { DELETE } = await import("@/app/api/documents/[id]/route");
    const res = await DELETE(new NextRequest("http://localhost/api/documents/" + docId, {
      method: "DELETE", headers: { Cookie: "dept_session=" + (await session(u)) },
    }), { params: Promise.resolve({ id: docId }) });
    expect(res.status).toBe(404);
  });
});
