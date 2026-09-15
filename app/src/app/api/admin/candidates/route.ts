import { NextRequest } from "next/server";
import { requireUser, requireAdmin, jsonError, HttpError } from "@/lib/auth/http";
import { listCandidates, createCandidate, pruneStaleCandidates, findRelatedItems } from "@/lib/harness/review";

const ACTIONS = new Set(["create_skill","update_skill","create_prompt","update_prompt","create_memory","update_memory"]);

export async function GET(req: NextRequest) {
  try {
    const user = await requireUser(req); requireAdmin(user);
    await pruneStaleCandidates(); // 1주일 지난 미결정 후보 정리
    const personaKey = req.nextUrl.searchParams.get("personaKey") ?? undefined;
    const status = (req.nextUrl.searchParams.get("status") ?? undefined) as any;
    const candidates = await listCandidates({ personaKey, status });
    // 각 후보에 연관/유사 기존 항목을 실시간 계산해 함께 반환 (수정/교체 선택지 제공)
    const withRelated = await Promise.all(candidates.map(async (c) => ({
      ...c,
      related: c.status === "pending" && c.proposedContent ? await findRelatedItems(c.personaKey, c.proposedContent, 0.45, 5) : [],
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
