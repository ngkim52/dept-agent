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
 * 유효 기간이 지난 미결정(대기) 적용 후보를 정리한다.
 * 어떤 선택(적용/거절)도 없이 ttl(기본 1주일)을 넘긴 대기 후보는 큐에서 제거한다.
 */
export async function pruneStaleCandidates(ttlMs = 7 * 24 * 60 * 60 * 1000): Promise<number> {
  const cutoff = new Date(Date.now() - ttlMs).getTime();
  const rows = await db.select().from(schema.improvementCandidates).where(eq(schema.improvementCandidates.status, "pending"));
  const stale = rows.filter((r) => new Date(r.createdAt).getTime() < cutoff);
  for (const r of stale) {
    await db.delete(schema.improvementCandidates).where(eq(schema.improvementCandidates.id, r.id));
  }
  return stale.length;
}

export interface RelatedItem { type: "prompt" | "skill" | "memory"; id: string; title: string; content: string; score: number; }
/** 후보 내용과 연관/유사한 기존 지식 항목(프롬프트·스킬·메모리) 반환 — 신규 생성 대신 수정/교체 선택지로 제공 */
/** LLM이 기존 지식(메모리·규칙·스킬)을 검색·판단해 유사한 항목만 골라 반환 */
export async function findRelatedByLLM(personaKey: string, content: string, call: (p: string) => Promise<string>, limit = 5): Promise<RelatedItem[]> {
  const items = await collectActiveItems(personaKey);
  if (items.length === 0) return [];
  const list = items.map((it) => `${it.id} | ${it.type} | ${clipLine(it.content)}`).join("\n");
  const prompt = [
    "보험금기획팀 검토 후보와 기존 지식 항목의 유사성을 판단해, 진짜로 의미가 겹치거나 충돌하는 항목만 골라 주세요.",
    "무관하거나 단어만 흡사한 항목은 절대 포함하지 마세요. 유사한 항목이 없으면 빈 배열을 반환하세요.",
    "JSON만 반환: {\"items\":[{\"id\":\"항목id\",\"reason\":\"유사 이유\",\"score\":0~100}]} 최대 " + limit + "개",
    "--- 후보 내용 ---\n" + clipLine(content, 900),
    "--- 기존 지식 항목 ---\n" + list,
  ].join("\n");
  const raw = (await call(prompt)).trim();
  const m = raw.match(/```(?:json)?\s*([\s\S]*?)\s*```/);
  const body = (m ? m[1] : raw).replace(/^[^\[{]*/, "").trim();
  let j: any = {};
  try { j = JSON.parse(body); } catch { return []; }
  const byId = new Map(items.map((it) => [it.id, it]));
  const out: RelatedItem[] = [];
  for (const r of (j.items ?? [])) {
    const it = byId.get(r?.id);
    if (!it) continue;
    out.push({ type: it.type, id: it.id, title: it.title, content: it.content, score: clamp01(Number(r.score) / 100) });
  }
  return out.slice(0, limit);
}

function clipLine(s: string, n = 160): string { const t = String(s ?? "").replace(/\s+/g, " "); return t.length <= n ? t : t.slice(0, n) + "…"; }
function clamp01(n: number): number { if (!Number.isFinite(n)) return 0; return Math.max(0, Math.min(1, n)); }

interface ActiveCandidateItem { type: "prompt" | "skill" | "memory"; id: string; title: string; content: string; }
async function collectActiveItems(personaKey: string): Promise<ActiveCandidateItem[]> {
  const store = await import("@/lib/harness/store");
  const [pros, skis, mems] = await Promise.all([store.listPrompts(personaKey), store.listSkills(personaKey), store.listMemories(personaKey)]);
  const act = (x: any) => x.active !== false;
  const out: ActiveCandidateItem[] = [];
  for (const p of pros) if (act(p)) out.push({ type: "prompt", id: p.id, title: p.title || "규칙", content: p.content });
  for (const s of skis) if (act(s)) out.push({ type: "skill", id: s.id, title: s.name || "스킬", content: s.content });
  for (const m of mems) if (act(m)) out.push({ type: "memory", id: m.id, title: "메모리", content: m.content });
  return out;
}

export async function findRelatedItems(personaKey: string, content: string, threshold = 0.45, limit = 5, call?: (p: string) => Promise<string>): Promise<RelatedItem[]> {
  if (call) return findRelatedByLLM(personaKey, content, call, limit);
  const baseScored = await findPotentialConflicts(personaKey, content, threshold);
  const lists = await Promise.all([
    db.select({ id: schema.knowledgeSkills.id, name: schema.knowledgeSkills.name, content: schema.knowledgeSkills.content, active: schema.knowledgeSkills.active })
      .from(schema.knowledgeSkills).where(eq(schema.knowledgeSkills.personaKey, personaKey)),
    db.select({ id: schema.knowledgeMemories.id, content: schema.knowledgeMemories.content, active: schema.knowledgeMemories.active })
      .from(schema.knowledgeMemories).where(eq(schema.knowledgeMemories.personaKey, personaKey)),
    db.select({ id: schema.knowledgePrompts.id, title: schema.knowledgePrompts.title, content: schema.knowledgePrompts.content, active: schema.knowledgePrompts.active })
      .from(schema.knowledgePrompts).where(eq(schema.knowledgePrompts.personaKey, personaKey)),
  ]);
  const items: RelatedItem[] = [];
  for (const s of lists[0]) if (s.active) items.push({ type: "skill", id: s.id, title: s.name || "스킬", content: s.content || "", score: jaccard(s.content || "", content) });
  for (const m of lists[1]) if (m.active) items.push({ type: "memory", id: m.id, title: "메모리", content: m.content || "", score: jaccard(m.content || "", content) });
  for (const p of lists[2]) if (p.active) items.push({ type: "prompt", id: p.id, title: p.title || "프롬프트", content: p.content || "", score: jaccard(p.content || "", content) });
  for (const b of baseScored) items.push({ type: b.type as RelatedItem["type"], id: b.id, title: b.type === "memory" ? "메모리" : "프롬프트", content: b.content, score: b.score });
  const seen = new Set<string>();
  const uniq = items.filter((x) => { if (seen.has(x.id)) return false; seen.add(x.id); return true; });
  return uniq.sort((a, b) => b.score - a.score).slice(0, limit);
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
function candActionEntryType(action: string): ApplyResult["entryType"] {
  if (action === "create_skill" || action === "update_skill") return "skill";
  if (action === "create_prompt" || action === "update_prompt") return "prompt";
  return "memory";
}

export async function applyCandidate(
  id: string,
  resolvedBy: string,
  overrides?: { content?: string; title?: string; name?: string; description?: string; kind?: string; mode?: "create" | "modify" | "replace"; targetType?: string; targetId?: string },
): Promise<ApplyResult> {
  const cand = await getCandidate(id);
  if (!cand) throw new Error("후보를 찾을 수 없습니다.");
  if (cand.status === "applied" || cand.status === "edited") throw new Error("이미 처리된 후보입니다.");

  const store = await import("@/lib/harness/store");
  const { createPrompt, createSkill, createMemory, updatePrompt, updateSkill, updateMemory, setActive } = store;

  const content = overrides?.content ?? cand.proposedContent ?? "";
  if (!content) throw new Error("적용할 내용이 없습니다.");

  // 기본 동작은 신규 생성. 연관/유사 항목이 선택되면 수정(modify)·교체(replace) 가능.
  const mode = overrides?.mode ?? "create";
  const targetType = (overrides?.targetType as ApplyResult["entryType"] | undefined) ?? candActionEntryType(cand.action);
  const targetId = overrides?.targetId ?? undefined;

  let entryType: ApplyResult["entryType"];
  let entryId: string;
  if (mode === "modify" && targetType && targetId) {
    // 기존 항목 수정: 같은 항목에 내용을 덮어쓴다(이력 유지).
    if (targetType === "prompt") { const e = await updatePrompt(targetId, { title: overrides?.title ?? cand.targetTitle ?? undefined, content }, resolvedBy); entryType = "prompt"; entryId = e.id; }
    else if (targetType === "skill") { const e = await updateSkill(targetId, { name: overrides?.name ?? cand.targetTitle ?? undefined, description: overrides?.description ?? cand.summary ?? undefined, content }, resolvedBy); entryType = "skill"; entryId = e.id; }
    else { const e = await updateMemory(targetId, { content, kind: (overrides?.kind as any) ?? undefined }, resolvedBy); entryType = "memory"; entryId = e.id; }
  } else if (mode === "replace" && targetType && targetId) {
    // 기존 항목 교체: 기존 항목을 비활성화하고, 후보 내용으로 새 항목을 생성한다.
    try { await setActive(targetType, targetId, false, resolvedBy); } catch { /* 이미 없는 항목은 무시 */ }
    if (targetType === "prompt") { const e = await createPrompt({ personaKey: cand.personaKey, kind: (overrides?.kind as any) ?? "addendum", title: overrides?.title ?? cand.targetTitle ?? "검토 적용 지식", content, origin: "review", confidence: cand.confidence, sourceType: cand.sourceKind, sourceId: cand.sourceId }, resolvedBy); entryType = "prompt"; entryId = e.id; }
    else if (targetType === "skill") { const e = await createSkill({ personaKey: cand.personaKey, name: overrides?.name ?? cand.targetTitle ?? "검토 지식", description: overrides?.description ?? cand.summary ?? "", content, origin: "review", confidence: cand.confidence, sourceType: cand.sourceKind, sourceId: cand.sourceId }, resolvedBy); entryType = "skill"; entryId = e.id; }
    else { const e = await createMemory({ personaKey: cand.personaKey, kind: (overrides?.kind as any) ?? "lesson", content, tags: undefined, origin: "review", confidence: cand.confidence, sourceConversationId: cand.sourceKind === "admin_chat" ? cand.sourceId : undefined }, resolvedBy); entryType = "memory"; entryId = e.id; }
  } else {
    if (cand.action === "create_prompt") {
      const e = await createPrompt({ personaKey: cand.personaKey, kind: (overrides?.kind as any) ?? "addendum", title: overrides?.title ?? cand.targetTitle ?? "검토 적용 지식", content, origin: "review", confidence: cand.confidence, sourceType: cand.sourceKind, sourceId: cand.sourceId }, resolvedBy);
      entryType = "prompt"; entryId = e.id;
    } else if (cand.action === "create_skill") {
      const e = await createSkill({ personaKey: cand.personaKey, name: overrides?.name ?? cand.targetTitle ?? "검토 지식", description: overrides?.description ?? cand.summary ?? "", content, origin: "review", confidence: cand.confidence, sourceType: cand.sourceKind, sourceId: cand.sourceId }, resolvedBy);
      entryType = "skill"; entryId = e.id;
    } else {
      const e = await createMemory({ personaKey: cand.personaKey, kind: (overrides?.kind as any) ?? "lesson", content, tags: undefined, origin: "review", confidence: cand.confidence, sourceConversationId: cand.sourceKind === "admin_chat" ? cand.sourceId : undefined }, resolvedBy);
      entryType = "memory"; entryId = e.id;
    }
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
/** 에피소드 상세 — 파생 후보 상태까지 함께 (영향 추적) */
export async function getEpisodeDetail(id: string): Promise<{ episode: Awaited<ReturnType<typeof getEpisode>>; candidates: ImprovementCandidate[] }> {
  const episode = await getEpisode(id);
  const cands = await listCandidates();
  const candidates = cands.filter((c) => c.sourceKind === "episode" && c.sourceId === id);
  return { episode, candidates };
}

/** 에피소드의 결론·재사용 규칙을 지식(메모리)으로 즉시 저장 — 에피소드의 목적(대화→지식) 명확화 */
export async function publishEpisodeConclusion(id: string, resolvedBy?: string): Promise<{ memoryId: string } | null> {
  const ep = await getEpisode(id);
  if (!ep) throw new Error("에피소드를 찾을 수 없습니다.");
  const content = ep.conclusion || ep.summary;
  if (!content || !content.trim()) throw new Error("저장할 결론이 없습니다.");
  const { createMemory } = await import("@/lib/harness/store");
  const deptRows = await db.select().from(schema.departments).where(eq(schema.departments.id, ep.departmentId)).limit(1);
  const personaKey = deptRows[0]?.personaKey ?? ep.departmentId;
  const mem = await createMemory({
    personaKey,
    content: content.trim(),
    origin: "review",
    confidence: 0.9,
  }, resolvedBy);
  return { memoryId: mem.id };
}

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
