import { NextRequest } from "next/server";
import { requireUser, jsonError } from "@/lib/auth/http";
import { consolidateThread, answerCoversTurns, type ChatTurn } from "@/lib/chat/consolidate";

// POST /api/chat/consolidate  { firstQuery, turns }
// 한 세션에서 여러 턴(assistant)에 걸쳐 완성된 답변을 하나의 질문→답변으로 통합해 반환.
// 검증(answerCoversTurns) 결과도 함께 제공한다. 저장·스킬화 연동은 설계서(docs/) 참조.
export async function POST(req: NextRequest) {
  try {
    await requireUser(req);
    const body = await req.json().catch(() => ({}));
    const firstQuery = String(body?.firstQuery ?? "");
    const turns: ChatTurn[] = Array.isArray(body?.turns) ? body.turns : [];
    const assistantTurns = turns.filter((t) => t.role === "assistant");
    if (!firstQuery || assistantTurns.length < 2) {
      return Response.json({ error: "멀티턴 통합이 필요합니다. assistant 턴이 2개 이상이어야 합니다." }, { status: 400 });
    }
    const qa = await consolidateThread(firstQuery, turns);
    if (!qa) return Response.json({ error: "통합 답변을 생성하지 못했습니다." }, { status: 502 });
    const verified = answerCoversTurns(qa, turns);
    return Response.json({ ok: true, qa, verified, turns: turns.length });
  } catch (e) { return jsonError(e); }
}
