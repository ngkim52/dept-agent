import { NextRequest } from "next/server";
import { requireUser, requireAdmin, jsonError } from "@/lib/auth/http";
import { db, schema } from "@/lib/db";

// GET /api/admin/harness/count — 대기(pending) 하네스 제안 개수 (관리자) — 사이드바 배지용
// 배지 숫자가 실제 큐 크기와 어긋나지 않도록, 조회 시점에 정리(유효기간 경과 + 상한 50 초과분)를 먼저 수행한다.
export async function GET(req: NextRequest) {
  try {
    const user = await requireUser(req); requireAdmin(user);
    const { pruneStaleCandidates, MAX_PENDING_CANDIDATES } = await import("@/lib/harness/review");
    await pruneStaleCandidates();
    const rows = await db.select().from(schema.improvementCandidates);
    const count = Math.min(rows.filter((x) => x.status === "pending").length, MAX_PENDING_CANDIDATES);
    return Response.json({ count });
  } catch (e) { return jsonError(e); }
}
