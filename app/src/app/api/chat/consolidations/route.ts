import { NextRequest } from "next/server";
import { db, schema } from "@/lib/db";
import { eq, desc } from "drizzle-orm";
import { requireUser, jsonError, HttpError } from "@/lib/auth/http";
import { uploadConsolidation } from "@/lib/chat/qaStore";

// GET /api/chat/consolidations?status=draft|verified  — 멀티턴 통합 후보/검증 목록
export async function GET(req: NextRequest) {
  try {
    await requireUser(req);
    const status = new URL(req.url).searchParams.get("status");
    const rows = db.select().from(schema.qaConsolidations)
      .where(status ? eq(schema.qaConsolidations.status, status) : undefined)
      .orderBy(desc(schema.qaConsolidations.createdAt)).all();
    return Response.json({ items: rows.map((r) => ({
      id: r.id, canonicalQuestion: r.canonicalQuestion, intent: r.intent,
      summary: r.summary, status: r.status, confidence: r.confidence,
      turns: r.turns, usedCount: r.usedCount, ragDocumentId: r.ragDocumentId,
      mergedAnswer: r.mergedAnswer, createdAt: r.createdAt,
    })) });
  } catch (e) { return jsonError(e); }
}

// PATCH /api/chat/consolidations  { id, status: verified|rejected }  — 결과 확인 후 승격/폐기
export async function PATCH(req: NextRequest) {
  try {
    await requireUser(req);
    const body = await req.json().catch(() => ({}));
    const id = String(body?.id ?? "");
    const status = String(body?.status ?? "");
    if (!id || !["verified", "rejected", "draft"].includes(status)) {
      return jsonError(new HttpError(400, "id와 status(verified|rejected|draft)가 필요합니다."));
    }
    await db.update(schema.qaConsolidations).set({ status, updatedAt: new Date() }).where(eq(schema.qaConsolidations.id, id)).run();
    // verified로 승격되면 RAGFlow 벡터 인덱스에도 적재 → 신규 유사 질문 재사용
    if (status === "verified") await uploadConsolidation(id).catch((e) => console.error("[consolidations] RAGFlow 적재 실패:", e));
    return Response.json({ ok: true, id, status });
  } catch (e) { return jsonError(e); }
}
