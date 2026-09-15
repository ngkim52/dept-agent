import { NextRequest } from "next/server";
import { requireUser, requireAdmin, jsonError, HttpError } from "@/lib/auth/http";
import { resolveCandidate, applyCandidate, getCandidate, findRelatedByLLM, setCandidateRelated } from "@/lib/harness/review";

// 온디맨드 LLM 정밀 연관 판정: 단건 후보에 대해서만 LLM으로 진짜 유사한 기존 지식 선택
// (목록에서는 호출하지 않아 로딩이 막히지 않도록, 여기서만 LLM 사용 / 실패 시 휴리스틱 폴백)
async function makeJudgeCall(): Promise<((p: string) => Promise<string>) | undefined> {
  if (process.env.DRYRUN_JUDGE_DISABLED === "1") return undefined;
  try {
    const { getLlmModel } = await import("@/lib/agent/llm");
    const { models, model } = await getLlmModel("compact");
    return async (prompt: string) => {
      const res = await models.completeSimple(model, { systemPrompt: "당신은 지식 유사성 판정자입니다.", messages: [{ role: "user" as const, content: prompt, timestamp: Date.now() }] });
      return (res?.content ?? []).filter((t: any) => t?.type === "text").map((t: any) => t.text).join("");
    };
  } catch { return undefined; }
}

// PATCH /api/admin/candidates/[id]  body: { decision: "reject"|"apply"|"edited", adminNote?, overrides? }
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireUser(req); requireAdmin(user);
    const { id } = await params;
    const body = await req.json().catch(() => ({}));
    const decision = body.decision;
    if (decision === "reject") {
      const cand = await resolveCandidate(id, { status: "rejected", adminNote: body.adminNote, resolvedBy: user.id });
      return Response.json({ candidate: cand });
    }
    if (decision === "apply" || decision === "edited") {
      const result = await applyCandidate(id, user.id, body.overrides);
      return Response.json(result);
    }
    throw new HttpError(400, "decision 필요 (reject|apply|edited)");
  } catch (e) { return jsonError(e); }
}

// GET ?related=1 → 후보 반환 + LLM 정밀 연관 항목(온디맨드)
// 그 외 → 후보 단건 기본 조회
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireUser(req); requireAdmin(user);
    const { id } = await params;
    const candidate = await getCandidate(id);
    if (!candidate) throw new HttpError(404, "후보가 없습니다.");
    if (req.nextUrl.searchParams.get("related") === "1") {
      // 온디맨드 LLM 정밀 재판정: 진짜 유사 항목만 골라 저장된 관계를 갱신한다.
      // (유사 없으면 related:[ ]로 해제 → 목록에서 단건만 표시 / 실패 시 stored 관련 유지)
      const call = await makeJudgeCall();
      let related: any[] = [];
      if (candidate.status === "pending" && candidate.proposedContent && call) {
        related = await findRelatedByLLM(candidate.personaKey, candidate.proposedContent, call, 5);
      } else if (candidate.status === "pending" && candidate.relatedType && candidate.relatedId) {
        const { getEntry } = await import("@/lib/harness/store");
        const entry = await getEntry(candidate.relatedType as any, candidate.relatedId);
        if (entry) related = [{ type: candidate.relatedType, id: candidate.relatedId, title: (entry as any).title ?? (entry as any).name ?? "항목", content: entry.content, score: 1 }];
      }
      if (call && candidate.proposedContent) {
        await setCandidateRelated(id, related[0] ? { type: related[0].type, id: related[0].id, title: related[0].title } : null);
      }
      return Response.json({ candidate: await getCandidate(id), related });
    }
    return Response.json({ candidate });
  } catch (e) { return jsonError(e); }
}
