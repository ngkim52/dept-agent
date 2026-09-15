import { NextRequest } from "next/server";
import { requireUser, requireAdmin, jsonError } from "@/lib/auth/http";
import { db, schema } from "@/lib/db";

// GET /api/admin/harness/count — 대기(pending) 하네스 제안 개수 (관리자) — 사이드바 배지용
export async function GET(req: NextRequest) {
  try {
    const user = await requireUser(req); requireAdmin(user);
    const rows = await db.select().from(schema.improvementCandidates);
    const count = rows.filter((x) => x.status === "pending").length;
    return Response.json({ count });
  } catch (e) { return jsonError(e); }
}
