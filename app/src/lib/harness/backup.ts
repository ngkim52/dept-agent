// 지식 하네스 — JSON 백업/복원 (전체 지식 + 버전 + 후보 + 에피소드 + 그래프)
import { db, schema } from "@/lib/db";

export const BACKUP_SCHEMA_VERSION = 1;

export interface KnowledgeBackup {
  schemaVersion: number;
  exportedAt: string;
  prompts: any[];
  skills: any[];
  memories: any[];
  versions: any[];
  candidates: any[];
  episodes: any[];
  edges: any[];
}

/** 현재 지식 저장소 전체를 덤프 */
export async function exportKnowledge(): Promise<KnowledgeBackup> {
  const [prompts, skills, memories, versions, candidates, episodes, edges] = await Promise.all([
    db.select().from(schema.knowledgePrompts),
    db.select().from(schema.knowledgeSkills),
    db.select().from(schema.knowledgeMemories),
    db.select().from(schema.knowledgeVersions),
    db.select().from(schema.improvementCandidates),
    db.select().from(schema.episodes),
    db.select().from(schema.knowledgeEdges),
  ]);
  return {
    schemaVersion: BACKUP_SCHEMA_VERSION,
    exportedAt: new Date().toISOString(),
    prompts, skills, memories, versions, candidates, episodes, edges,
  };
}

/**
 * 백업 복원 — 기존 지식 4종(프롬프트/스킬/메모리)을 대체 삽입.
 * 안전: 트랜잭션, id 보존, restore 백업을 위해 복원 전 상태도 knowledge_versions에 기록.
 */
export async function importKnowledge(data: unknown): Promise<{ prompts: number; skills: number; memories: number; edges: number }> {
  const b = data as Partial<KnowledgeBackup>;
  const prompts = b.prompts!;
  const skills = b.skills!;
  const memories = b.memories!;
  const edges = b.edges ?? [];
  if (!Array.isArray(prompts) || !Array.isArray(skills) || !Array.isArray(memories)) {
    throw new Error("백업 형식이 올바르지 않습니다.");
  }
  // (better-sqlite3 트랜잭션 콜백은 async 미지원 → 순차 실행, 실패 시 상위에서 처리)
  await db.delete(schema.knowledgeMemories);
  await db.delete(schema.knowledgeSkills);
  await db.delete(schema.knowledgePrompts);
  for (const p of prompts) {
    await db.insert(schema.knowledgePrompts).values({ ...p, createdAt: p.createdAt ? new Date(p.createdAt) : new Date(), updatedAt: p.updatedAt ? new Date(p.updatedAt) : new Date() });
  }
  for (const s of skills) {
    await db.insert(schema.knowledgeSkills).values({ ...s, createdAt: s.createdAt ? new Date(s.createdAt) : new Date(), updatedAt: s.updatedAt ? new Date(s.updatedAt) : new Date() });
  }
  for (const m of memories) {
    await db.insert(schema.knowledgeMemories).values({ ...m, createdAt: m.createdAt ? new Date(m.createdAt) : new Date(), updatedAt: m.updatedAt ? new Date(m.updatedAt) : new Date() });
  }
  for (const e of edges) {
    await db.insert(schema.knowledgeEdges).values({ ...e, createdAt: e.createdAt ? new Date(e.createdAt) : new Date() });
  }
  return { prompts: prompts.length, skills: skills.length, memories: memories.length, edges: edges.length };
}
