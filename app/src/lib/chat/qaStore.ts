// ============================================================================
// 멀티턴 통합 Q/A 저장 · 검색 (지식그래프 노드 + RAGFlow 벡터 인덱스)
// ----------------------------------------------------------------------------
//  - qa_consolidations / qa_links  (SQLite, 지식그래프 노드·엣지)
//  - RAGFlow 데이터셋 "채팅_복수턴_통합답변" (질문 임베딩 벡터 재검색)
// ============================================================================
import { randomUUID } from "node:crypto";
import { db, schema } from "@/lib/db";
import { eq } from "drizzle-orm";
import { ragflow } from "@/lib/ragflow/client";
import { queryCoverage, type ConsolidatedQA } from "./consolidate";

export const QA_DATASET_NAME = "채팅_복수턴_통합답변";

// 전역 통합답변 데이터셋 id (재사용. app_settings에 캐시, 없으면 RAGFlow에서 찾거나 생성)
let _datasetCache: string | null = null;
export async function ensureQaDataset(): Promise<string | null> {
  if (_datasetCache) return _datasetCache;
  try {
    const cached = db.select({ value: schema.appSettings.value })
      .from(schema.appSettings)
      .where(eq(schema.appSettings.key, "qa_consolidation_dataset_id"))
      .all();
    if (cached[0]?.value) { _datasetCache = cached[0].value; return _datasetCache; }
    const list = await ragflow.listDatasets();
    const found = list.find((d) => d.name === QA_DATASET_NAME);
    const id = found ? found.id : await ragflow.createDataset(QA_DATASET_NAME);
    db.insert(schema.appSettings).values({ key: "qa_consolidation_dataset_id", value: id, updatedAt: new Date() }).onConflictDoNothing().run();
    _datasetCache = id;
    return id;
  } catch (e) { console.error("[qaStore] RAGFlow 통합답변 데이터셋 준비 실패:", e); return null; }
}

// verified 통합 Q/A를 DB 노드로 저장
export async function saveConsolidation(qa: ConsolidatedQA, opts: { status?: string; sourceConversationId?: string } = {}): Promise<string> {
  const id = randomUUID();
  const now = new Date();
  await db.insert(schema.qaConsolidations).values({
    id,
    canonicalQuestion: qa.canonicalQuestion,
    intent: qa.intent || null,
    mergedAnswer: qa.mergedAnswer,
    summary: qa.summary || null,
    entities: JSON.stringify(qa.entities ?? []),
    sourceConversationId: opts.sourceConversationId ?? null,
    status: opts.status ?? "draft",
    confidence: qa.confidence,
    turns: qa.turns,
    usedCount: 0,
    ragDocumentId: null,
    createdAt: now,
    updatedAt: now,
  }).onConflictDoNothing();
  return id;
}

// verified 답변을 RAGFlow 데이터셋에 문서로 적재 → 신규 질문 벡터 검색 시 재사용
export async function uploadConsolidation(id: string): Promise<void> {
  const row = db.select().from(schema.qaConsolidations).where(eq(schema.qaConsolidations.id, id)).all()[0];
  if (!row || row.ragDocumentId) return;
  const dsId = await ensureQaDataset();
  if (!dsId) return;
  const filename = `${row.canonicalQuestion.slice(0, 60)}.md`;
  const meta = `의도(intent): ${row.intent ?? ""}\n엔티티: ${row.entities ?? "[]"}\n\n`;
  const blob = new Blob([meta + row.mergedAnswer], { type: "text/markdown" });
  try {
    const up = await ragflow.uploadDocument(dsId, filename, blob);
    const docId = up?.data?.id;
    if (docId) await ragflow.parseDocuments(dsId, [docId]).catch(() => {});
    await db.update(schema.qaConsolidations).set({ ragDocumentId: docId ?? null, updatedAt: new Date() }).where(eq(schema.qaConsolidations.id, id)).run();
  } catch (e) { console.error("[qaStore] 통합답변 RAGFlow 적재 실패:", e); }
}

// 새 질문에 대한 가장 적합한 통합 답변 1개를 찾는다 (RAGFlow 벡터 + 로컬 유사도 폴백)
export async function findConsolidatedAnswer(query: string, threshold = 0.3): Promise<{ answer: string; similarity: number; canonicalQuestion: string } | null> {
  // 1) 로컬 verified 노드 (빅램 유사도, 빠르고 확실) — 우선
  const pool = db.select().from(schema.qaConsolidations).where(eq(schema.qaConsolidations.status, "verified")).all();
  let best: { row: typeof pool[number]; score: number } | null = null;
  for (const r of pool) {
    const s = Math.max(
      queryCoverage(query, r.canonicalQuestion + " " + (r.intent ?? "")),
      queryCoverage(query, r.summary ?? "")
    );
    if (!best || s > best.score) best = { row: r, score: s };
  }
  if (best && best.score >= threshold) {
    const row = best.row;
    db.update(schema.qaConsolidations).set({ usedCount: row.usedCount + 1, updatedAt: new Date() }).where(eq(schema.qaConsolidations.id, row.id)).run();
    return { answer: row.mergedAnswer, similarity: best.score, canonicalQuestion: row.canonicalQuestion };
  }
  // 2) RAGFlow 벡터 검색 (없으면 null) — 추가 보강
  const dsId = await ensureQaDataset();
  if (dsId) {
    try {
      const chunks = await ragflow.retrieve(query, [dsId], 3, threshold);
      if (chunks.length > 0) {
        return { answer: chunks[0].content, similarity: chunks[0].similarity, canonicalQuestion: chunks[0].document_name ?? query };
      }
    } catch { /* 폴백 무시 */ }
  }
  return null;
}


// 대화가 여러 턴으로 완성된 경우 → 단일 Q/A로 통합해 draft로 저장 (자동 반영 아님, 검증 후 verified)
export async function consolidateRecent(conversationId: string, maxTurns = 20): Promise<{ id: string | null; turns: number }> {
  try {
    const rows = db.select().from(schema.messages)
      .where(eq(schema.messages.conversationId, conversationId))
      .orderBy((m) => [m.createdAt]).all();
    if (rows.length < 4) return { id: null, turns: 0 }; // 최소 유저+답변 몇 턴 필요
    const turns = rows.slice(-maxTurns);
    const assistantCount = turns.filter((t) => t.role === "assistant").length;
    if (assistantCount < 2) return { id: null, turns: assistantCount }; // 멀티턴 아님
    const firstUser = turns.find((t) => t.role === "user");
    const { consolidateThread } = await import("./consolidate");
    const qa = await consolidateThread(firstUser?.content ?? "", turns.map((t) => ({ role: t.role as "user" | "assistant", content: t.content })));
    if (!qa) return { id: null, turns: assistantCount };
    const id = await saveConsolidation(qa, { status: "draft", sourceConversationId: conversationId });
    return { id, turns: assistantCount };
  } catch (e) { console.error("[qaStore] 멀티턴 통합 실패:", e); return { id: null, turns: 0 }; }
}
