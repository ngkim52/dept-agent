import { NextRequest } from "next/server";
import { requireUser, requireAdmin, jsonError, HttpError } from "@/lib/auth/http";
import { harvestForConversation } from "@/lib/harness/harvest";

// POST /api/admin/harvest?conversationId= — 부서장 채팅 자동 지식 선별 + 후보 생성
export async function POST(req: NextRequest) {
  try {
    const user = await requireUser(req); requireAdmin(user);
    const conversationId = req.nextUrl.searchParams.get("conversationId");
    if (!conversationId) throw new HttpError(400, "conversationId 필요");
    const result = await harvestForConversation(conversationId);
    return Response.json({
      accepted: result.accepted,
      createdCount: result.createdCount,
    });
  } catch (e) { return jsonError(e); }
}
