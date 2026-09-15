// 지식 하네스 저장소 — 프롬프트·스킬·메모리 CRUD + 버전(감사·롤백) 기록 (Phase 1)
import { randomUUID } from "node:crypto";
import { db, schema } from "@/lib/db";
import type { KnowledgePrompt, KnowledgeSkill, KnowledgeMemory, KnowledgeVersion } from "@/lib/db/schema";
import { and, eq, asc } from "drizzle-orm";

type AnyEntry = KnowledgePrompt | KnowledgeSkill | KnowledgeMemory;

export type HarnessEntryType = "prompt" | "skill" | "memory";
export type VersionAction = "create" | "update" | "disable" | "activate" | "restore" | "delete";

const TABLE_BY_TYPE = {
  prompt: schema.knowledgePrompts,
  skill: schema.knowledgeSkills,
  memory: schema.knowledgeMemories,
} as const;

function now() { return new Date(); }

function json(v: unknown): string | null {
  return v == null ? null : JSON.stringify(v);
}

// ── 버전 기록 ──
export async function recordVersion(
  entryType: HarnessEntryType,
  entryId: string,
  before: AnyEntry | null,
  after: AnyEntry | null,
  action: VersionAction,
  changedBy?: string
): Promise<KnowledgeVersion> {
  const v: KnowledgeVersion = {
    id: randomUUID(),
    entryType,
    entryId,
    contentBefore: json(before),
    contentAfter: json(after),
    action,
    changedBy: changedBy ?? null,
    createdAt: new Date(),
  };
  await db.insert(schema.knowledgeVersions).values(v);
  return v;
}

export async function listVersions(entryType: HarnessEntryType, entryId: string): Promise<KnowledgeVersion[]> {
  const rows = await db.select().from(schema.knowledgeVersions)
    .where(and(eq(schema.knowledgeVersions.entryType, entryType), eq(schema.knowledgeVersions.entryId, entryId)))
    .orderBy(asc(schema.knowledgeVersions.createdAt));
  return rows;
}

// ── 조회 ──
export async function listPrompts(personaKey?: string): Promise<KnowledgePrompt[]> {
  const q = db.select().from(schema.knowledgePrompts);
  const rows = personaKey ? await q.where(eq(schema.knowledgePrompts.personaKey, personaKey)) : await q;
  return rows.sort((a, b) => a.orderIdx - b.orderIdx);
}
export async function listSkills(personaKey?: string): Promise<KnowledgeSkill[]> {
  const q = db.select().from(schema.knowledgeSkills);
  const rows = personaKey ? await q.where(eq(schema.knowledgeSkills.personaKey, personaKey)) : await q;
  return rows.sort((a, b) => a.orderIdx - b.orderIdx);
}
export async function listMemories(personaKey?: string): Promise<KnowledgeMemory[]> {
  const q = db.select().from(schema.knowledgeMemories);
  const rows = personaKey ? await q.where(eq(schema.knowledgeMemories.personaKey, personaKey)) : await q;
  return rows.sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());
}

export async function getEntry(entryType: HarnessEntryType, id: string): Promise<AnyEntry | null> {
  const table = TABLE_BY_TYPE[entryType];
  const rows = await db.select().from(table).where(eq((table as any).id, id));
  return (rows[0] as AnyEntry) ?? null;
}

// ── 생성 ──
export type PromptInput = { personaKey: string; kind?: KnowledgePrompt["kind"]; title: string; content: string; origin?: KnowledgePrompt["origin"]; confidence?: number; sourceType?: string; sourceId?: string; orderIdx?: number };
export async function createPrompt(input: PromptInput, changedBy?: string): Promise<KnowledgePrompt> {
  const t = now();
  const entry: KnowledgePrompt = {
    id: randomUUID(), personaKey: input.personaKey,
    kind: input.kind ?? "addendum", title: input.title, content: input.content,
    active: true, origin: input.origin ?? "manual", confidence: input.confidence ?? 1,
    sourceType: input.sourceType ?? null, sourceId: input.sourceId ?? null,
    orderIdx: input.orderIdx ?? 0, hitCount: 0, createdAt: t, updatedAt: t,
  };
  await db.insert(schema.knowledgePrompts).values(entry);
  await recordVersion("prompt", entry.id, null, entry, "create", changedBy);
  return entry;
}

export type SkillInput = { personaKey: string; name: string; description?: string; content: string; origin?: KnowledgeSkill["origin"]; confidence?: number; sourceType?: string; sourceId?: string; orderIdx?: number };
export async function createSkill(input: SkillInput, changedBy?: string): Promise<KnowledgeSkill> {
  const t = now();
  const entry: KnowledgeSkill = {
    id: randomUUID(), personaKey: input.personaKey, name: input.name,
    description: input.description ?? "", content: input.content,
    active: true, origin: input.origin ?? "manual", confidence: input.confidence ?? 1,
    sourceType: input.sourceType ?? null, sourceId: input.sourceId ?? null,
    orderIdx: input.orderIdx ?? 0, hitCount: 0, createdAt: t, updatedAt: t,
  };
  await db.insert(schema.knowledgeSkills).values(entry);
  await recordVersion("skill", entry.id, null, entry, "create", changedBy);
  return entry;
}

export type MemoryInput = { personaKey: string; kind?: KnowledgeMemory["kind"]; content: string; tags?: string[]; origin?: KnowledgeMemory["origin"]; confidence?: number; sourceConversationId?: string; sourceMessageId?: string };
export async function createMemory(input: MemoryInput, changedBy?: string): Promise<KnowledgeMemory> {
  const t = now();
  const entry: KnowledgeMemory = {
    id: randomUUID(), personaKey: input.personaKey, kind: input.kind ?? "fact", content: input.content,
    tags: input.tags && input.tags.length ? JSON.stringify(input.tags) : null,
    active: true, origin: input.origin ?? "manual", confidence: input.confidence ?? 1,
    hitCount: 0, sourceConversationId: input.sourceConversationId ?? null, sourceMessageId: input.sourceMessageId ?? null,
    createdAt: t, updatedAt: t,
  };
  await db.insert(schema.knowledgeMemories).values(entry);
  await recordVersion("memory", entry.id, null, entry, "create", changedBy);
  return entry;
}

// ── 수정 / 활성 토글 ──
export async function updatePrompt(id: string, patch: Partial<Omit<PromptInput, "personaKey">>, changedBy?: string): Promise<KnowledgePrompt> {
  const before = await getEntry("prompt", id) as KnowledgePrompt | null;
  if (!before) throw new Error("프롬프트 항목을 찾을 수 없습니다.");
  const after: KnowledgePrompt = {
    ...before,
    kind: patch.kind ?? before.kind, title: patch.title ?? before.title, content: patch.content ?? before.content,
    origin: patch.origin ?? before.origin, confidence: patch.confidence ?? before.confidence,
    sourceType: patch.sourceType !== undefined ? patch.sourceType : before.sourceType,
    sourceId: patch.sourceId !== undefined ? patch.sourceId : before.sourceId,
    orderIdx: patch.orderIdx ?? before.orderIdx, updatedAt: new Date(),
  };
  await db.update(schema.knowledgePrompts).set({ ...after, updatedAt: after.updatedAt }).where(eq(schema.knowledgePrompts.id, id));
  await recordVersion("prompt", id, before, after, "update", changedBy);
  return after;
}

export async function updateSkill(id: string, patch: Partial<Omit<SkillInput, "personaKey">>, changedBy?: string): Promise<KnowledgeSkill> {
  const before = await getEntry("skill", id) as KnowledgeSkill | null;
  if (!before) throw new Error("스킬 항목을 찾을 수 없습니다.");
  const after: KnowledgeSkill = {
    ...before,
    name: patch.name ?? before.name, description: patch.description !== undefined ? patch.description : before.description,
    content: patch.content ?? before.content, origin: patch.origin ?? before.origin, confidence: patch.confidence ?? before.confidence,
    sourceType: patch.sourceType !== undefined ? patch.sourceType : before.sourceType,
    sourceId: patch.sourceId !== undefined ? patch.sourceId : before.sourceId,
    orderIdx: patch.orderIdx ?? before.orderIdx, updatedAt: new Date(),
  };
  await db.update(schema.knowledgeSkills).set({ ...after, updatedAt: after.updatedAt }).where(eq(schema.knowledgeSkills.id, id));
  await recordVersion("skill", id, before, after, "update", changedBy);
  return after;
}

export async function updateMemory(id: string, patch: Partial<Omit<MemoryInput, "personaKey">>, changedBy?: string): Promise<KnowledgeMemory> {
  const before = await getEntry("memory", id) as KnowledgeMemory | null;
  if (!before) throw new Error("메모리 항목을 찾을 수 없습니다.");
  const after: KnowledgeMemory = {
    ...before,
    kind: patch.kind ?? before.kind, content: patch.content ?? before.content,
    tags: patch.tags !== undefined ? (patch.tags.length ? JSON.stringify(patch.tags) : null) : before.tags,
    origin: patch.origin ?? before.origin, confidence: patch.confidence ?? before.confidence,
    sourceConversationId: patch.sourceConversationId !== undefined ? patch.sourceConversationId : before.sourceConversationId,
    sourceMessageId: patch.sourceMessageId !== undefined ? patch.sourceMessageId : before.sourceMessageId,
    updatedAt: new Date(),
  };
  await db.update(schema.knowledgeMemories).set({ ...after, updatedAt: after.updatedAt }).where(eq(schema.knowledgeMemories.id, id));
  await recordVersion("memory", id, before, after, "update", changedBy);
  return after;
}

export async function setActive(entryType: HarnessEntryType, id: string, active: boolean, changedBy?: string): Promise<AnyEntry> {
  const before = await getEntry(entryType, id);
  if (!before) throw new Error("항목을 찾을 수 없습니다.");
  const table = TABLE_BY_TYPE[entryType];
  const after: AnyEntry = { ...before, active, updatedAt: new Date() } as AnyEntry;
  await db.update(table).set({ active, updatedAt: after.updatedAt }).where(eq((table as any).id, id));
  await recordVersion(entryType, id, before, after, active ? "activate" : "disable", changedBy);
  return after;
}

// ── 하드 삭제 (수동·관리자 의도적 삭제만 허용. 자동 삭제 금지 원칙 유지) ──
export async function deleteEntry(entryType: HarnessEntryType, id: string, changedBy?: string): Promise<{ deleted: boolean; id: string; entryType: HarnessEntryType }> {
  const before = await getEntry(entryType, id);
  if (!before) throw new Error("항목을 찾을 수 없습니다.");
  const table = TABLE_BY_TYPE[entryType];
  await db.delete(table).where(eq((table as any).id, id));
  await recordVersion(entryType, id, before, null, "delete", changedBy);
  return { deleted: true, id, entryType };
}

// ── 롤백 (특정 버전 이후 상태로 복원) ──
export async function restoreVersion(versionId: string, changedBy?: string): Promise<AnyEntry | null> {
  const rows = await db.select().from(schema.knowledgeVersions).where(eq(schema.knowledgeVersions.id, versionId));
  const v = rows[0];
  if (!v) throw new Error("버전을 찾을 수 없습니다.");
  const before = await getEntry(v.entryType, v.entryId);
  const snapshot = v.contentAfter ? (JSON.parse(v.contentAfter) as AnyEntry) : v.contentBefore ? null : null;
  if (!v.contentAfter || !snapshot) throw new Error("복원할 상태가 없습니다.");
  const table = TABLE_BY_TYPE[v.entryType];
  // 스냅샷(JSON)의 날짜 필드를 Date로 복원
  const restored: AnyEntry = { ...snapshot, createdAt: new Date((snapshot as any).createdAt), updatedAt: new Date() } as AnyEntry;
  await db.update(table).set({ ...restored } as any).where(eq((table as any).id, v.entryId));
  await recordVersion(v.entryType, v.entryId, before, restored, "restore", changedBy);
  return restored;
}

export function parseTags(m: KnowledgeMemory | null): string[] {
  if (!m?.tags) return [];
  try { const t = JSON.parse(m.tags); return Array.isArray(t) ? t.map(String) : []; } catch { return []; }
}

// ── 사용 카운트 (나중 단계 활용) ──
export async function bumpHitCount(entryType: HarnessEntryType, id: string): Promise<void> {
  const e = await getEntry(entryType, id);
  if (!e) return;
  const hit = ((e as any).hitCount ?? 0) + 1;
  const table = TABLE_BY_TYPE[entryType];
  await db.update(table).set({ hitCount: hit, updatedAt: new Date() }).where(eq((table as any).id, id));
}
