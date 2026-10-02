import { NextRequest } from "next/server";
import { requireUser, jsonError, HttpError } from "@/lib/auth/http";
import { getSession, updateSession } from "@/lib/debate/store";

// POST /api/debate/[id]/stop — 중단 요청 (실행 루프가 다음 검사에서 멈추고 보고서를 만든다)
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    await requireUser(req);
    const { id } = await params;
    const session = await getSession(id);
    if (!session) throw new HttpError(404, "토론 세션을 찾을 수 없습니다.");
    if (session.status === "running" || session.status === "draft") {
      await updateSession(id, { status: "stopped" });
    }
    const updated = await getSession(id);
    return Response.json({ status: updated?.status ?? session.status });
  } catch (e) { return jsonError(e); }
}
