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

export async function getSetting(key: string): Promise<unknown | null> {
  const row = await db.query.appSettings.findFirst({ where: eq(schema.appSettings.key, key) });
  if (!row) return null;
  try {
    return JSON.parse(row.value);
  } catch { return null; }
}

export async function setSetting(key: string, value: unknown): Promise<void> {
  await db.insert(schema.appSettings)
    .values({ key, value: JSON.stringify(value), updatedAt: new Date() })
    .onConflictDoUpdate({ target: schema.appSettings.key, set: { value: JSON.stringify(value), updatedAt: new Date() } });
}

export interface ModelSelection {
  model: string;
  gateway: string; // "openrouter" | "litellm" | ...
}

// 용도별 모델 선택 조회 — DB 설정 우선, env fallback, 최종 fallback 기본 모델(기본 게이트웨이)
export async function getModelForPurpose(purpose: ModelPurpose): Promise<ModelSelection> {
  const key = MODEL_PURPOSES[purpose].key;
  const { config } = await import("@/lib/config");
  const dbVal = await getSetting(key);
  if (dbVal && typeof dbVal === "object") {
    const parsed = dbVal as any;
    if (parsed && parsed.model) {
      return { model: String(parsed.model), gateway: String(parsed.gateway ?? "litellm") };
    }
  } else if (typeof dbVal === "string" && dbVal) {
    return { model: dbVal, gateway: "litellm" }; // 구버전 저장 값 호환
  }
  const envMap: Record<ModelPurpose, string> = {
    response: config.llm.modelResponse,
    simple: config.llm.modelSimple,
    bulk: config.llm.modelBulk,
    compact: config.llm.modelCompact,
  };
  return { model: envMap[purpose] || config.llm.model, gateway: "litellm" };
}

// 현재 용도별 모델 선택 전체 조회 (UI 표시용) — DB 값만
export async function getAllModelConfig(): Promise<Record<string, ModelSelection | null>> {
  const out: Record<string, ModelSelection | null> = {};
  for (const p of Object.keys(MODEL_PURPOSES) as ModelPurpose[]) {
    const key = MODEL_PURPOSES[p].key;
    const v = await getSetting(key);
    if (!v) { out[p] = null; continue; }
    if (typeof v === "object") {
      const parsed = v as any;
      out[p] = parsed && parsed.model ? { model: String(parsed.model), gateway: String(parsed.gateway ?? "litellm") } : null;
    } else if (typeof v === "string" && v) {
      out[p] = { model: v, gateway: "litellm" };
    } else { out[p] = null; }
  }
  return out;
}
