import { NextRequest } from "next/server";
import { requireUser, jsonError, HttpError } from "@/lib/auth/http";
import { getSession, listMessages } from "@/lib/debate/store";

// GET /api/debate/[id] — 세션 + 전체 발언
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    await requireUser(req);
    const { id } = await params;
    const session = await getSession(id);
    if (!session) throw new HttpError(404, "토론 세션을 찾을 수 없습니다.");
    const messages = await listMessages(id, 0);
    return Response.json({ session, messages, hasReport: session.hasReport });
  } catch (e) { return jsonError(e); }
}
