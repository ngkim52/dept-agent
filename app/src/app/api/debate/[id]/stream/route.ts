import { NextRequest } from "next/server";
import { requireUser, jsonError, HttpError } from "@/lib/auth/http";
import { getSession, listMessages } from "@/lib/debate/store";

export const dynamic = "force-dynamic";

// GET /api/debate/[id]/stream?since=N — 증분 폴링(관전 화면용)
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    await requireUser(req);
    const { id } = await params;
    const session = await getSession(id);
    if (!session) throw new HttpError(404, "토론 세션을 찾을 수 없습니다.");

    const sinceRaw = Number(req.nextUrl.searchParams.get("since") ?? 0);
    const since = Number.isFinite(sinceRaw) && sinceRaw > 0 ? Math.floor(sinceRaw) : 0;
    const messages = await listMessages(id, since);

    const startedAt = session.startedAt ? new Date(session.startedAt).getTime() : null;
    const elapsed = startedAt ? Math.floor((Date.now() - startedAt) / 1000) : 0;
    const remainingSec = session.status === "running" || session.status === "draft"
      ? Math.max(0, session.durationSec - elapsed)
      : 0;

    return Response.json({
      status: session.status,
      round: session.round,
      turnCount: session.turnCount,
      remainingSec,
      durationSec: session.durationSec,
      participants: session.participants,
      hasReport: session.hasReport,
      verdict: session.verdict,
      messages,
    });
  } catch (e) { return jsonError(e); }
}
