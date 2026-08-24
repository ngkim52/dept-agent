import { NextRequest } from "next/server";
import { db, schema } from "@/lib/db";
import { eq } from "drizzle-orm";
import { requireUser, jsonError } from "@/lib/auth/http";
import { ragflow } from "@/lib/ragflow/client";
import { mapRagRunStatus, type AppDocStatus } from "@/lib/ragflow/status";

export async function GET(req: NextRequest) {
  try {
    const user = await requireUser(req);
    const docs = await db.query.documents.findMany({
      where: eq(schema.documents.departmentId, user.departmentId ?? ""),
      orderBy: (d, { desc }) => [desc(d.createdAt)],
      with: { user: true },
    });

    // 파싱 미완료 문서는 RAGFlow 런 상태를 조회해 DB 상태 갱신 후 재조회 (스테일 방지)
    await syncParsingStatus(docs);
    const freshDocs = await db.query.documents.findMany({
      where: eq(schema.documents.departmentId, user.departmentId ?? ""),
      orderBy: (d, { desc }) => [desc(d.createdAt)],
      with: { user: true },
    });

    return Response.json({ documents: freshDocs.map((d) => ({
      id: d.id, filename: d.filename, status: d.status,
      uploadedBy: d.user?.name ?? null, ragflowDocId: d.ragflowDocId, createdAt: d.createdAt,
    })) });
  } catch (e) { return jsonError(e); }
}

// RAGFlow 상태 조회로 uploaded/parsing → parsing/done/failed 갱신
async function syncParsingStatus(docs: Array<{ id: string; status: string; ragflowDocId: string | null; departmentId: string }>) {
  const pending = docs.filter((d) => d.status === "uploaded" || d.status === "parsing" || d.status === "failed");
  if (pending.length === 0 || !pending[0].ragflowDocId) return;

  const dept = await db.query.departments.findFirst({ where: eq(schema.departments.id, pending[0].departmentId) });
  if (!dept?.ragflowDatasetId) return;

  let remote;
  try {
    remote = await ragflow.listDatasetDocuments(dept.ragflowDatasetId);
  } catch (e) {
    console.error("문서 상태 동기화 실패", e);
    return;
  }
  const byRemoteId = new Map(remote.map((r) => [r.id, r]));

  // 덮어쓸 상태 산출 (한 번 done/failed가 되면 되돌리지 않음)
  const updates: Array<{ docId: string; status: AppDocStatus }> = [];
  for (const doc of pending) {
    if (!doc.ragflowDocId) continue;
    const r = byRemoteId.get(doc.ragflowDocId);
    if (!r) continue;
    if (doc.status === "done" || doc.status === "parsing") {
      const mapped = mapRagRunStatus(r.runStatus);
      if (mapped !== "parsing" && mapped !== doc.status) updates.push({ docId: doc.id, status: mapped });
    } else if (doc.status === "uploaded" || doc.status === "failed") {
      const mapped = mapRagRunStatus(r.runStatus);
      updates.push({ docId: doc.id, status: mapped });
    }
  }
  for (const u of updates) {
    await db.update(schema.documents)
      .set({ status: u.status })
      .where(eq(schema.documents.id, u.docId));
  }
}

