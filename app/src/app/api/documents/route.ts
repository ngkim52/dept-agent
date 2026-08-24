import { NextRequest } from "next/server";
import { randomUUID } from "node:crypto";
import { db, schema } from "@/lib/db";
import { eq } from "drizzle-orm";
import { requireUser, jsonError } from "@/lib/auth/http";

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
    await db.insert(schema.documents).values(doc);
    return Response.json({ document: { id: doc.id, filename: doc.filename, size: doc.size, mimeType: doc.mimeType, status: doc.status, createdAt: doc.createdAt } }, { status: 201 });
  } catch (e) { return jsonError(e); }
}
