import { NextRequest } from "next/server";
import { requireUser, requireAdmin, jsonError, HttpError } from "@/lib/auth/http";
import { runDryrunEvaluation } from "@/lib/harness/dryrun";

// 드라이런 평가 실행 — 부서장 에이전트에 질문 후 LLM-as-judge 평가
export async function POST(req: NextRequest) {
  try {
    const user = await requireUser(req); requireAdmin(user);
    const body = await req.json().catch(() => ({}));
    const personaKey = String(body.personaKey ?? "claims-planning");
    const question = String(body.question ?? "").trim();
    if (!question) throw new HttpError(400, "question 필요");
    const result = await runDryrunEvaluation({ personaKey, question });
    return Response.json({ result });
  } catch (e) { return jsonError(e); }
}
