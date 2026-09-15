import { NextRequest } from "next/server";
import { requireUser, requireAdmin, jsonError } from "@/lib/auth/http";
import { buildSnapshot, persistSnapshot, todayStr } from "@/lib/dashboard/rebuild";

// POST /api/admin/dashboard/rebuild — 대시보드 배치 수동 재구성 (관리자)
export async function POST(req: NextRequest) {
  try {
    const user = await requireUser(req); requireAdmin(user);
    const snap = await buildSnapshot();
    await persistSnapshot(snap);
    return Response.json({ ok: true, date: snap.date, todos: snap.todos.length });
  } catch (e) { return jsonError(e); }
}
