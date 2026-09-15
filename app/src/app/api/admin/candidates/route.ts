import { NextRequest } from "next/server";
import { requireUser, requireAdmin, jsonError, HttpError } from "@/lib/auth/http";
import { listCandidates, createCandidate, pruneStaleCandidates, findRelatedItems } from "@/lib/harness/review";

// LLM 판정용 call — 실패 시 undefined → 휴리스틱 폴백
// 테스트/오프라인 환경에서 LLM 판정을 끄고 휴리스틱 폴백(결정적·빠름) 사용
async function makeJudgeCall(): Promise<((p: string) => Promise<string>) | undefined> {
  if (process.env.DRYRUN_JUDGE_DISABLED === "1") return undefined;
  try {
    const { getLlmModel } = await import("@/lib/agent/llm");
    const { models, model } = await getLlmModel("compact");
    return async (p: string) => {
      const res = await models.completeSimple(model, { systemPrompt: "당신은 지식 유사성 판정자입니다.", messages: [{ role: "user" as const, content: p, timestamp: Date.now() }] });
      return (res?.content ?? []).filter((t: any) => t?.type === "text").map((t: any) => t.text).join("");
    };
  } catch { return undefined; }
}

const ACTIONS = new Set(["create_skill","update_skill","create_prompt","update_prompt","create_memory","update_memory"]);

export async function GET(req: NextRequest) {
  try {
    const user = await requireUser(req); requireAdmin(user);
    await pruneStaleCandidates(); // 1주일 지난 미결정 후보 정리
    const personaKey = req.nextUrl.searchParams.get("personaKey") ?? undefined;
    const status = (req.nextUrl.searchParams.get("status") ?? undefined) as any;
    const candidates = await listCandidates({ personaKey, status });
    // 각 후보에 연관/유사 기존 항목을 실시간 계산해 함께 반환 (수정/교체 선택지 제공)
    // 연관 판단: LLM이 기존 지식(메모리·규칙·스킬)을 검색해 진짜 유사한 것만 선택 (실패 시 휴리스틱 폴백)
    const call = await makeJudgeCall();
    const withRelated = await Promise.all(candidates.map(async (c) => ({
      ...c,
      related: c.status === "pending" && c.proposedContent ? await findRelatedItems(c.personaKey, c.proposedContent, 0.45, 5, call) : [],
    })));
    return Response.json({ candidates: withRelated, pruned: true });
  } catch (e) { return jsonError(e); }
}

export async function POST(req: NextRequest) {
  try {
    const user = await requireUser(req); requireAdmin(user);
    const body = await req.json().catch(() => ({}));
    if (!body.proposedContent) throw new HttpError(400, "proposedContent 필요");
    if (!ACTIONS.has(body.action)) throw new HttpError(400, "action 필요");
    await pruneStaleCandidates();
    const cand = await createCandidate({
      personaKey: String(body.personaKey ?? "claims-planning"),
      sourceKind: body.sourceKind ?? "admin_chat", sourceId: String(body.sourceId ?? "manual"),
      summary: body.summary, action: body.action, targetTitle: body.targetTitle,
      proposedContent: String(body.proposedContent), confidence: typeof body.confidence === "number" ? body.confidence : 0.9,
    });
    return Response.json({ candidate: cand }, { status: 201 });
  } catch (e) { return jsonError(e); }
}
