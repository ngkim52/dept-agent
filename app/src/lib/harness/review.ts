// 지식 하네스 — 검토 큐(episodes) / 적용 후보(candidates) / 지식 그래프(edges)
import { randomUUID } from "node:crypto";
import { eq, and } from "drizzle-orm";
import { db, schema } from "@/lib/db";
import type {
  Episode, NewEpisode, ImprovementCandidate, NewImprovementCandidate, KnowledgeEdge, NewKnowledgeEdge,
} from "@/lib/db/schema";

const now = () => new Date();

/* ---------- episodes ---------- */
export async function createEpisode(input: Omit<NewEpisode, "id" | "createdAt">): Promise<Episode> {
  const row: NewEpisode = { ...input, id: randomUUID(), createdAt: now() };
  await db.insert(schema.episodes).values(row);
  return (await getEpisode(row.id))!;
}
export async function getEpisode(id: string): Promise<Episode | null> {
  const rows = await db.select().from(schema.episodes).where(eq(schema.episodes.id, id)).limit(1);
  return rows[0] ?? null;
}
export async function listEpisodes(departmentId?: string): Promise<Episode[]> {
  const rows = departmentId
    ? await db.select().from(schema.episodes).where(eq(schema.episodes.departmentId, departmentId))
    : await db.select().from(schema.episodes);
  return rows.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
}
export async function updateEpisodeStatus(id: string, status: Episode["status"]): Promise<Episode | null> {
  await db.update(schema.episodes).set({ status }).where(eq(schema.episodes.id, id));
  return getEpisode(id);
}

/* ---------- improvement_candidates ---------- */
export async function createCandidate(input: Omit<NewImprovementCandidate, "id" | "createdAt">): Promise<ImprovementCandidate> {
  const row: NewImprovementCandidate = { ...input, id: randomUUID(), createdAt: now() };
  await db.insert(schema.improvementCandidates).values(row);
  return (await getCandidate(row.id))!;
}
export async function getCandidate(id: string): Promise<ImprovementCandidate | null> {
  const rows = await db.select().from(schema.improvementCandidates).where(eq(schema.improvementCandidates.id, id)).limit(1);
  return rows[0] ?? null;
}
export async function listCandidates(opts?: { personaKey?: string; status?: ImprovementCandidate["status"] }): Promise<ImprovementCandidate[]> {
  let rows = await db.select().from(schema.improvementCandidates);
  if (opts?.personaKey) rows = rows.filter((r) => r.personaKey === opts.personaKey);
  if (opts?.status) rows = rows.filter((r) => r.status === opts.status);
  return rows.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
}

/**
 * 후보 상태 확정(부서장 의사결정 기록).
 * status: rejected | applied(적용 완료 후) — applyCandidate가 사용.
 * 그 외 단순 상태 변경(거절 등)용.
 */
export async function resolveCandidate(
  id: string,
  decision: { status: "rejected"; adminNote?: string; resolvedBy?: string },
): Promise<ImprovementCandidate | null> {
  const before = await getCandidate(id);
  if (!before) throw new Error("후보를 찾을 수 없습니다.");
  const updated: Partial<ImprovementCandidate> = { status: decision.status, resolvedAt: now() };
  if (decision.adminNote !== undefined) updated.adminNote = decision.adminNote;
  if (decision.resolvedBy) updated.resolvedBy = decision.resolvedBy;
  await db.update(schema.improvementCandidates).set(updated as any).where(eq(schema.improvementCandidates.id, id));
  return getCandidate(id);
}

/* ---------- knowledge_edges ---------- */
export async function addEdge(input: Omit<NewKnowledgeEdge, "id" | "createdAt">): Promise<KnowledgeEdge> {
  const row: NewKnowledgeEdge = { ...input, id: randomUUID(), createdAt: now() };
  await db.insert(schema.knowledgeEdges).values(row);
  return row;
}
export async function listEdges(fromType?: string, fromId?: string): Promise<KnowledgeEdge[]> {
  let rows = await db.select().from(schema.knowledgeEdges);
  if (fromType && fromId) rows = rows.filter((r) => r.fromType === fromType && r.fromId === fromId);
  return rows;
}

/* ---------- 충돌/연관 휴리스틱 (MVP) ---------- */
export function tokenSet(content: string): Set<string> {
  return new Set(content.split(/[\s,.;:()'"\[\]{}!?]+/).map((w) => w.trim()).filter(Boolean));
}
export function jaccard(a: string, b: string): number {
  const sa = tokenSet(a); const sb = tokenSet(b);
  if (!sa.size && !sb.size) return 0;
  let inter = 0;
  for (const w of sa) if (sb.has(w)) inter++;
  return inter / (sa.size + sb.size - inter);
}
export interface KnowledgeConflict {
  id: string; type: "memory" | "prompt"; content: string; score: number;
}
/** 같은 페르소나의 활성 메모리·프롬프트 중 후보와 겹치는(연관/중복 가능성) 항목 반환 */
export async function findPotentialConflicts(
  personaKey: string,
  content: string,
  threshold = 0.5,
  exclude?: { type: string; id: string },
): Promise<KnowledgeConflict[]> {
  const [mems, proms] = await Promise.all([
    db.select({ id: schema.knowledgeMemories.id, content: schema.knowledgeMemories.content, active: schema.knowledgeMemories.active })
      .from(schema.knowledgeMemories).where(eq(schema.knowledgeMemories.personaKey, personaKey)),
    db.select({ id: schema.knowledgePrompts.id, content: schema.knowledgePrompts.content, active: schema.knowledgePrompts.active })
      .from(schema.knowledgePrompts).where(eq(schema.knowledgePrompts.personaKey, personaKey)),
  ]);
  const active: KnowledgeConflict[] = [
    ...mems.filter((m) => m.active).map((m) => ({ id: m.id, type: "memory" as const, content: String(m.content ?? ""), score: 0 })),
    ...proms.filter((p) => p.active).map((p) => ({ id: p.id, type: "prompt" as const, content: String(p.content ?? ""), score: 0 })),
  ];
  return active
    .filter((x) => !(exclude && x.type === exclude.type && x.id === exclude.id))
    .map((x) => ({ id: x.id, type: x.type, content: x.content, score: jaccard(x.content, content) }))
    .filter((x) => x.score >= threshold)
    .sort((a, b) => b.score - a.score);
}

/* ---------- 적용(apply) ---------- */
export interface ApplyResult {
  entryType: "prompt" | "skill" | "memory";
  entryId: string;
  candidate: ImprovementCandidate | null;
  sourceEdges: KnowledgeEdge[];
  conflicts: { id: string; type: string; content: string; score: number }[];
}

/** 후보를 실제 지식 항목으로 생성(or 수정)하고 출처 edge + 버전 기록 후 applied 처리 */
export async function applyCandidate(
  id: string,
  resolvedBy: string,
  overrides?: { content?: string; title?: string; name?: string; description?: string; kind?: string },
): Promise<ApplyResult> {
  const cand = await getCandidate(id);
  if (!cand) throw new Error("후보를 찾을 수 없습니다.");
  if (cand.status === "applied" || cand.status === "edited") throw new Error("이미 처리된 후보입니다.");

  const {
    createPrompt, createSkill, createMemory,
  } = await import("@/lib/harness/store");

  const content = overrides?.content ?? cand.proposedContent ?? "";
  if (!content) throw new Error("적용할 내용이 없습니다.");

  let entryType: ApplyResult["entryType"];
  let entryId: string;
  if (cand.action === "create_prompt") {
    const e = await createPrompt({
      personaKey: cand.personaKey, kind: (overrides?.kind as any) ?? "addendum",
      title: overrides?.title ?? cand.targetTitle ?? "검토 적용 지식",
      content, origin: "review", confidence: cand.confidence,
      sourceType: cand.sourceKind, sourceId: cand.sourceId,
    }, resolvedBy);
    entryType = "prompt"; entryId = e.id;
  } else if (cand.action === "create_skill") {
    const e = await createSkill({
      personaKey: cand.personaKey, name: overrides?.name ?? cand.targetTitle ?? "검토 지식",
      description: overrides?.description ?? cand.summary ?? "",
      content, origin: "review", confidence: cand.confidence,
      sourceType: cand.sourceKind, sourceId: cand.sourceId,
    }, resolvedBy);
    entryType = "skill"; entryId = e.id;
  } else {
    const e = await createMemory({
      personaKey: cand.personaKey, kind: (overrides?.kind as any) ?? "lesson",
      content, tags: undefined, origin: "review", confidence: cand.confidence,
      sourceConversationId: cand.sourceKind === "admin_chat" ? cand.sourceId : undefined,
    }, resolvedBy);
    entryType = "memory"; entryId = e.id;
  }

  // 충돌/연관 감지 → 관련 edge (방금 생성된 항목 자신은 제외)
  const conflicts = await findPotentialConflicts(cand.personaKey, content, 0.5, { type: entryType, id: entryId });
  const sourceEdges: KnowledgeEdge[] = [];
  if (cand.sourceKind === "episode") {
    sourceEdges.push(await addEdge({ fromType: "episode", fromId: cand.sourceId, toType: entryType, toId: entryId, rel: "source_of" }));
  } else if (cand.sourceKind === "admin_chat") {
    sourceEdges.push(await addEdge({ fromType: "conversation", fromId: cand.sourceId, toType: entryType, toId: entryId, rel: "source_of" }));
  }
  for (const c of conflicts.slice(0, 3)) {
    sourceEdges.push(await addEdge({ fromType: entryType, fromId: entryId, toType: c.type, toId: c.id, rel: "related" }));
  }

  await db.update(schema.improvementCandidates).set({ status: "applied", resolvedBy, resolvedAt: now() }).where(eq(schema.improvementCandidates.id, id));
  const candidate = await getCandidate(id);
  return { entryType, entryId, candidate, sourceEdges, conflicts };
}


/* ---------- 부서원 QA → episode 생성 압축 파이프라인 ---------- */
export async function recentEpisodeQa(departmentId: string, limit = 30) {
  const rows = await db
    .select({
      messageId: schema.messages.id,
      role: schema.messages.role,
      content: schema.messages.content,
      createdAt: schema.messages.createdAt,
      conversationId: schema.messages.conversationId,
    })
    .from(schema.messages)
    .innerJoin(schema.conversations, eq(schema.messages.conversationId, schema.conversations.id))
    .where(eq(schema.conversations.departmentId, departmentId))
    .orderBy(schema.messages.createdAt)
    .limit(limit);
  return rows.filter((r) => r.role === "user" || r.role === "assistant") as {
    messageId: string; role: "user" | "assistant"; content: string; createdAt: Date; conversationId: string;
  }[];
}

export interface GeneratedEpisode {
  episode: Episode;
  candidates: ImprovementCandidate[];
}

/** 부서원 최근 QA를 압축해 episode + 후보 후보군 생성 (status ready) */
export async function generateEpisodeForDepartment(
  departmentId: string,
  departName: string,
  call?: (prompt: string) => Promise<string>,
): Promise<GeneratedEpisode> {
  const { extractEpisode, realCompactCall } = await import("@/lib/harness/compact");
  const qas = await recentEpisodeQa(departmentId);
  if (!qas.length) throw new Error("압축할 대화가 없습니다.");
  const deptRows = await db.select().from(schema.departments).where(eq(schema.departments.id, departmentId)).limit(1);
  const personaKey = deptRows[0]?.personaKey ?? departmentId;
  const extraction = await extractEpisode(qas, departName, call ?? realCompactCall);
  const episode = await createEpisode({
    departmentId,
    summary: extraction.summary || "요약 없음",
    conclusion: extraction.conclusion,
    sourceIds: JSON.stringify(qas.map((q) => q.messageId)),
    tokenCount: qas.reduce((n, q) => n + q.content.length, 0),
    status: "ready",
  });
  const candidates: ImprovementCandidate[] = [];
  const rules = (extraction.reusable_rules?.length ? extraction.reusable_rules : extraction.conclusion ? [extraction.conclusion] : []).filter(Boolean);
  for (const rule of rules.slice(0, 8)) {
    candidates.push(await createCandidate({
      personaKey,
      sourceKind: "episode", sourceId: episode.id,
      summary: extraction.summary,
      action: "create_memory", targetTitle: extraction.summary.slice(0, 30) || "검토 지식",
      proposedContent: rule, confidence: 0.85,
    }));
  }
  return { episode, candidates };
}


/**
 * 주간 지식공백 리포트 (경로A/B 후보 집계, 컨셉 §04 "주간 배치 리뷰")
 * 기간 내 knowledge_gap(직원 확인요청) + judgment_rule(부장 저장) 후보를 요약한다.
 */
export async function getKnowledgeGapReport(personaKey: string, sinceMs: number = Date.now() - 7 * 24 * 3600 * 1000): Promise<{
  period: { from: string; to: string };
  total: number; pending: number; resolved: number;
  items: { id: string; summary: string; proposedByRole: string; status: string; createdAt: string; sourceConversationId: string | null; requestType: string }[];
}> {
  const rows = await listCandidates({ personaKey });
  const items = rows
    .filter((r) => ["knowledge_gap", "judgment_rule"].includes(r.requestType))
    .filter((r) => r.createdAt.getTime() >= sinceMs)
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
    .map((r) => ({
      id: r.id, summary: r.summary ?? "", proposedByRole: r.proposedByRole, status: r.status,
      createdAt: r.createdAt.toISOString(), sourceConversationId: r.sourceConversationId,
      requestType: r.requestType,
    }));
  return {
    period: { from: new Date(sinceMs).toISOString(), to: new Date().toISOString() },
    total: items.length,
    pending: items.filter((i) => i.status === "pending").length,
    resolved: items.filter((i) => i.status !== "pending").length,
    items,
  };
}
