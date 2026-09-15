import { NextRequest } from "next/server";
import { requireUser, requireAdmin, jsonError, HttpError } from "@/lib/auth/http";
import { listCandidates, createCandidate, pruneStaleCandidates, findRelatedByLLM, setCandidateRelated } from "@/lib/harness/review";
import type { HarnessEntryType } from "@/lib/db/schema";

// LLM 판정용 call — 실패 시 undefined → 휴리스틱 폴백.
// 온디맨드 정밀 판정(GET /api/admin/candidates/[id]?related=1)과
// POST 생성 시 유사 저장에서만 사용. 목록에서는 LLM을 호출하지 않는다.
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

/** 생성 시점에 LLM으로 진짜 유사 1건을 판정·저장 (call 없으면 저장 안 함 → 비유사) */
async function judgeAndSaveRelated(candidate: Awaited<ReturnType<typeof createCandidate>>, call?: (p: string) => Promise<string>) {
  if (call && candidate.proposedContent) {
    const related = await findRelatedByLLM(candidate.personaKey, candidate.proposedContent, call, 1);
    await setCandidateRelated(candidate.id, related[0] ? { type: related[0].type, id: related[0].id, title: related[0].title } : null);
  }
}

/** 저장된 관련Type/Id로 제목을 채워 1건의 related 배열 반환 (없으면 []) */
async function relatedFromStored(c: Awaited<ReturnType<typeof listCandidates>>[number]): Promise<any[]> {
  if (!c.relatedType || !c.relatedId) return [];
  try {
    const { getEntry } = await import("@/lib/harness/store");
    const entry = await getEntry(c.relatedType as HarnessEntryType, c.relatedId);
    if (!entry) return [];
    const title = (entry as any).title ?? (entry as any).name ?? "항목";
    return [{ type: c.relatedType, id: c.relatedId, title, content: entry.content, score: 1 }];
  } catch {
    return [];
  }
}

const ACTIONS = new Set(["create_skill","update_skill","create_prompt","update_prompt","create_memory","update_memory"]);

const TOP_PENDING = 50; // 대기(pending) 후보 신뢰도 상위 50건 유지

export async function GET(req: NextRequest) {
  try {
    const user = await requireUser(req); requireAdmin(user);
    await pruneStaleCandidates(); // 1주일 지난 미결정 후보 정리
    const personaKey = req.nextUrl.searchParams.get("personaKey") ?? undefined;
    const status = (req.nextUrl.searchParams.get("status") ?? undefined) as any;
    const candidates = await listCandidates({ personaKey, status });
    // 목록은 저장된 관련Type/Id만 노출한다(LLM 일괄 호출 금지, 휴리스틱 금지).
    // 대기(pending) 후보는 신뢰도 높은 순 상위 50건으로 제한.
    const pending = candidates
      .filter((c) => c.status === "pending")
      .sort((a, b) => (b.confidence ?? 0) - (a.confidence ?? 0))
      .slice(0, TOP_PENDING);
    const resolved = candidates
      .filter((c) => c.status !== "pending")
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
    const limited = [...pending, ...resolved];
    const withRelated = await Promise.all(limited.map(async (c) => ({
      ...c,
      related: await relatedFromStored(c),
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
    await judgeAndSaveRelated(cand, await makeJudgeCall()); // 생성 시점 동일 연관 저장
    return Response.json({ candidate: cand }, { status: 201 });
  } catch (e) { return jsonError(e); }
}
