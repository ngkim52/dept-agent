// 앱 설정 (app_settings 테이블) — 키별 JSON 값 저장/조회
// 모델 설정은 DB에 저장하되, 환경변수(LLM_MODEL_*)를 fallback으로 사용한다.
import { db, schema } from "@/lib/db";
import { eq } from "drizzle-orm";

export const MODEL_PURPOSES = {
  response: { label: "부서장 응답·종합 의견", key: "model_response" },
  simple: { label: "간단 응답", key: "model_simple" },
  bulk: { label: "RAG·대량 데이터", key: "model_bulk" },
  compact: { label: "컨텍스트 압축", key: "model_compact" },
} as const;

export type ModelPurpose = keyof typeof MODEL_PURPOSES;

export async function getSetting(key: string): Promise<string | null> {
  const row = await db.query.appSettings.findFirst({ where: eq(schema.appSettings.key, key) });
  if (!row) return null;
  try {
    const v = JSON.parse(row.value);
    return typeof v === "string" ? v : null;
  } catch { return null; }
}

export async function setSetting(key: string, value: unknown): Promise<void> {
  await db.insert(schema.appSettings)
    .values({ key, value: JSON.stringify(value), updatedAt: new Date() })
    .onConflictDoUpdate({ target: schema.appSettings.key, set: { value: JSON.stringify(value), updatedAt: new Date() } });
}

// 용도별 모델 ID 조회 — DB 설정 우선, env fallback, 최종 fallback 기본 모델
export async function getModelForPurpose(purpose: ModelPurpose): Promise<string> {
  const key = MODEL_PURPOSES[purpose].key;
  if (purpose === "response") {
    const v = await getSetting(key);
    if (v) return v;
    const { config } = await import("@/lib/config");
    return config.llm.modelResponse || config.llm.model;
  }
  if (purpose === "simple") {
    const v = await getSetting(key);
    if (v) return v;
    const { config } = await import("@/lib/config");
    return config.llm.modelSimple || config.llm.model;
  }
  if (purpose === "bulk") {
    const v = await getSetting(key);
    if (v) return v;
    const { config } = await import("@/lib/config");
    return config.llm.modelBulk || config.llm.model;
  }
  const v = await getSetting(key);
  if (v) return v;
  const { config } = await import("@/lib/config");
  return config.llm.modelCompact || config.llm.model;
}

// 현재 용도별 모델 설정 전체 조회 (UI 표시용)
export async function getAllModelConfig() {
  const out: Record<string, string | null> = {};
  for (const p of Object.keys(MODEL_PURPOSES) as ModelPurpose[]) {
    out[p] = await getSetting(MODEL_PURPOSES[p].key);
  }
  return out;
}
