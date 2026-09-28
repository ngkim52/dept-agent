import { NextRequest } from "next/server";
import { db, schema } from "@/lib/db";
import { eq } from "drizzle-orm";
import { requireUser, jsonError, HttpError } from "@/lib/auth/http";
import { createCandidate } from "@/lib/harness/review";
import { distillKnowledgeDraft, type KnowledgeDraft } from "@/lib/harness/knowledgeDraft";

/**
 * 지식 축적 경로 A/B (컨셉 §04)
 * - 경로 A (mode=gap, 직원): 답변의 [지식 공백] → "부장님께 확인 요청" → 후보 생성
 * - 경로 B (mode=rule, 부장/admin): "판단기준으로 저장해줘" → IF-THEN 초안 → 후보 생성
 * 두 경로 모두 pending(대기중)으로만 생성되고, 부장(admin)의 승인/수정승인/반려는 기존 하네스 확인함 큐에서 처리한다.
 *
 * 후보 내용은 대화 원문이 아니라, 「스킬 생성기」 기반 가이드로 증류한 지식 초안이다.
 * (원문 대화는 source_conversation_id 로만 참조한다. LLM 증류 실패 시 안전한 폴백을 쓴다.)
 */

/** 증류 결과 → 후보 필드 매핑 */
function draftToCandidateFields(draft: KnowledgeDraft, fallbackTitle: string, fallbackSummary: string) {
  if (draft.kind === "skill") {
    return {
      action: "create_skill" as const,
      targetTitle: draft.name,
      summary: draft.description,
      proposedContent: draft.content,
    };
  }
  return {
    action: draft.kind === "memory" ? ("create_memory" as const) : ("create_prompt" as const),
    targetTitle: (draft.title || fallbackTitle).slice(0, 40),
    summary: fallbackSummary,
    proposedContent: draft.content,
  };
}

export async function POST(req: NextRequest) {
  try {
    const user = await requireUser(req);
    const body = await req.json().catch(() => ({}));
    const mode = String(body.mode ?? "gap");
    const conversationId = String(body.conversationId ?? "");
    if (!conversationId) return jsonError(new HttpError(400, "conversationId 필요"));

    const conv = await db.query.conversations.findFirst({
      where: eq(schema.conversations.id, conversationId),
      with: { department: true },
    });
    if (!conv) return jsonError(new HttpError(404, "대화를 찾을 수 없습니다"));
    if (conv.userId !== user.id && user.role !== "admin") return jsonError(new HttpError(403, "권한이 없습니다"));
    const personaKey = conv.department?.personaKey ?? conv.departmentId ?? "claims-planning";

    // 대화 맥락(전체 turn)과 원본 질문 로드 — 증류 참고용 (원문은 후보에 저장하지 않음)
    const msgs = await db.query.messages.findMany({
      where: eq(schema.messages.conversationId, conversationId),
      orderBy: (m, { asc }) => [asc(m.createdAt)],
      limit: 40,
    });
    const firstUser = msgs.find((m) => m.role === "user")?.content ?? "";
    const transcript = msgs
      .filter((m) => m.role !== "system")
      .map((m) => `${m.role === "user" ? "Q" : "A"}: ${m.content}`)
      .join("\n\n")
      .slice(0, 6000);

    if (mode === "rule") {
      // 경로 B — 부장(admin)만
      if (user.role !== "admin") return jsonError(new HttpError(403, "판단기준 저장은 부장(관리자)만 가능합니다"));
      const title = String(body.title ?? "").trim();
      const content = String(body.content ?? "").trim();
      if (!content) return jsonError(new HttpError(400, "저장할 판단기준 내용이 필요합니다"));
      const draft = await distillKnowledgeDraft({ personaKey, question: title || firstUser, request: content, transcript });
      const fields = draft
        ? draftToCandidateFields(draft, title || content.slice(0, 24), title || content.slice(0, 40))
        : { action: "create_prompt" as const, targetTitle: title || content.slice(0, 24), summary: title || content.slice(0, 40), proposedContent: content };
      const cand = await createCandidate({
        personaKey,
        sourceKind: "judgment_rule",
        sourceId: conversationId,
        requestType: "judgment_rule",
        proposedByRole: "admin",
        sourceConversationId: conversationId,
        ...fields,
        confidence: 1,
      });
      return Response.json({ candidate: cand }, { status: 201 });
    }

    // 경로 A — 직원의 지식 공백 확인 요청
    const gapContent = String(body.content ?? "").trim();
    const question = firstUser || gapContent || "지식공백";
    const draft = await distillKnowledgeDraft({ personaKey, question, request: gapContent || firstUser, transcript });
    const fallbackSummary = `지식공백 요청: ${question.slice(0, 40)}`;
    const fields = draft
      ? draftToCandidateFields(draft, question.slice(0, 24), fallbackSummary)
      // LLM 증류 실패 시에도 대화 원문은 넣지 않는다(요청 본문만).
      : { action: "create_prompt" as const, targetTitle: question.slice(0, 24), summary: fallbackSummary, proposedContent: gapContent || question };
    const cand = await createCandidate({
      personaKey,
      sourceKind: "knowledge_gap",
      sourceId: conversationId,
      requestType: "knowledge_gap",
      proposedByRole: "user",
      sourceConversationId: conversationId,
      ...fields,
      confidence: 0.5,
    });
    return Response.json({ candidate: cand }, { status: 201 });
  } catch (e) { return jsonError(e); }
}
