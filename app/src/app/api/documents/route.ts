import { NextRequest } from "next/server";
import { randomUUID } from "node:crypto";
import { db, schema } from "@/lib/db";
import { eq } from "drizzle-orm";
import { requireUser, jsonError } from "@/lib/auth/http";
import { saveUpload, saveUploadName } from "@/lib/uploads";
import { ragflow } from "@/lib/ragflow/client";
import { getDepartmentDatasets } from "@/lib/dataset/access";

const MAX_SIZE_MB = 20;

export async function GET(req: NextRequest) {
  try {
    const user = await requireUser(req);
    // 사용자별 자료만 반환 (부서 공용 자료가 아님)
    const docs = await db.query.documents.findMany({
      where: eq(schema.documents.userId, user.id),
      orderBy: (d, { desc }) => [desc(d.createdAt)],
    });
    return Response.json({ documents: docs.map((d) => ({
      id: d.id, filename: d.filename, size: d.size, mimeType: d.mimeType,
      status: d.status, createdAt: d.createdAt,
    })) });
  } catch (e) { return jsonError(e); }
}

export async function POST(req: NextRequest) {
  try {
    const user = await requireUser(req);
    const form = await req.formData().catch(() => null);
    const file = form?.get("file");
    if (!(file instanceof Blob) || file.size === 0 || !file.name) {
      return Response.json({ error: "파일이 필요합니다." }, { status: 400 });
    }
    if (file.size > MAX_SIZE_MB * 1024 * 1024) {
      return Response.json({ error: `${MAX_SIZE_MB}MB 이하 파일만 업로드할 수 있습니다.` }, { status: 400 });
    }
    const buf = Buffer.from(await file.arrayBuffer());
    // 텍스트 계열 파일은 본문을 content로 보관 → 채팅에서 "@파일명" 지정 시 LLM 컨텍스트로 주입
    const isText = /(^text\/)|(\.(txt|md|csv|json|log|xml|ts|tsx|js|jsx|py|sql))$/i.test(file.name);
    const content = isText ? buf.toString("utf-8").slice(0, 100_000) : null;
    const doc = {
      id: randomUUID(),
      userId: user.id,
      departmentId: user.departmentId ?? "claims-planning",
      filename: file.name,
      mimeType: file.type || "application/octet-stream",
      size: buf.length,
      content,
      ragflowDocId: null,
      status: "done" as const,
      createdAt: new Date(),
    };
    // 원본 바이너리도 보존 → "@파일명" 지정 시 파이썬(pandas/openpyxl)으로 엑셀 등 직접 처리
    await saveUpload(doc.id, buf);
    await saveUploadName(doc.id, file.name);
    await db.insert(schema.documents).values({ ...doc, status: doc.status === "done" ? "done" : doc.status });

    // 소속 부서에 RAGFlow 데이터셋이 연결돼 있으면 문서를 RAG에 반영 (비동기, 실패해도 업로드는 성공)
    let ragflowDocId: string | null = null;
    let ragStatus: string = "done";
    try {
      // 소속 부서에 연결된 모든 RAGFlow 데이터셋에 업로드
      const datasetIds = await getDepartmentDatasets(user.departmentId ?? "");
      for (const dsId of datasetIds) {
        const up = await ragflow.uploadDocument(dsId, file.name, new Blob([buf]));
        const docId = up.data?.id ?? null;
        if (docId) {
          await ragflow.parseDocuments(dsId, [docId]).catch(() => {});
          if (!ragflowDocId) ragflowDocId = docId; // 첫 데이터셋 결과를 대표로 기록
          ragStatus = "parsing";
        }
      }
    } catch (e) { console.error("ragflow upload skipped:", e); }

    if (ragflowDocId) {
      await db.update(schema.documents).set({ ragflowDocId, status: ragStatus as any }).where(eq(schema.documents.id, doc.id));
    }

    return Response.json({ document: { id: doc.id, filename: doc.filename, size: doc.size, mimeType: doc.mimeType, status: doc.status, ragflowDocId, createdAt: doc.createdAt } }, { status: 201 });
  } catch (e) { return jsonError(e); }
}
