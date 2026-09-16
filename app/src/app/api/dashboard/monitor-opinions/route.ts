import { NextRequest } from "next/server";
import { requireUser, jsonError } from "@/lib/auth/http";
import { generateMonitorOpinions } from "@/lib/dashboard/monitorOpinions";

// GET /api/dashboard/monitor-opinions — 일감별 부서장 의견(+종료 일감 보고 시간 추천)
// LLM 호출은 1회 배치(일감 전체를 한 프롬프트로) — 행마다 LLM 호출 없음.
export async function GET(req: NextRequest) {
  try {
    const user = await requireUser(req);
    const opinions = await generateMonitorOpinions().catch(() => []);
    return Response.json({ source: "monitor-llm", opinions });
  } catch (e) { return jsonError(e); }
}
