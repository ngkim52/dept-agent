// 토론방 — 페르소나별 LLM 모델 설정 (019)
// 설정 화면(관리자 > 모델 설정)에서 페르소나마다 쓸 모델을 따로 지정할 수 있다.
// 해석 순서: 페르소나별 지정 → "simple" 용도 기본 모델.
import { buildModels } from "@/lib/agent/llm";
import { getModelForPurpose, getSetting, setSetting, type ModelSelection } from "@/lib/settings";

export const DEBATE_PERSONA_MODELS_KEY = "debate_persona_models";

export type PersonaModelSource = "persona" | "default";

function normalizeSelection(v: unknown): ModelSelection | null {
  if (!v || typeof v !== "object" || Array.isArray(v)) return null;
  const sel = v as Record<string, unknown>;
  const model = String(sel.model ?? "").trim();
  if (!model) return null;
  const gateway = String(sel.gateway ?? "litellm").trim() || "litellm";
  return { model, gateway };
}

/** 저장된 페르소나별 모델 지정값 (personaKey → 선택) */
export async function getPersonaModelOverrides(): Promise<Record<string, ModelSelection>> {
  const v = await getSetting(DEBATE_PERSONA_MODELS_KEY);
  if (!v || typeof v !== "object" || Array.isArray(v)) return {};
  const out: Record<string, ModelSelection> = {};
  for (const [k, sel] of Object.entries(v as Record<string, unknown>)) {
    const n = normalizeSelection(sel);
    if (n) out[k] = n;
  }
  return out;
}

/** 페르소나별 모델 지정 저장(null/빈 값이면 지정 해제) */
export async function setPersonaModelOverride(personaKey: string, selection: ModelSelection | null): Promise<void> {
  if (!personaKey) throw new Error("personaKey 가 필요합니다.");
  const cur = await getPersonaModelOverrides();
  const n = normalizeSelection(selection);
  if (n) cur[personaKey] = n; else delete cur[personaKey];
  await setSetting(DEBATE_PERSONA_MODELS_KEY, cur);
}

/** 순수 해석 — 지정값이 있으면 그것, 없으면 null (테스트 용이) */
export function pickPersonaModel(personaKey: string, overrides: Record<string, ModelSelection>): ModelSelection | null {
  return overrides[personaKey] ?? null;
}

/** 페르소나 1명의 유효 모델 선택값 (지정 → simple 용도 기본값) */
export async function getPersonaModel(personaKey: string): Promise<{ selection: ModelSelection; source: PersonaModelSource }> {
  const overrides = await getPersonaModelOverrides();
  const picked = pickPersonaModel(personaKey, overrides);
  if (picked) return { selection: picked, source: "persona" };
  return { selection: await getModelForPurpose("simple"), source: "default" };
}

/** 발언 1건에 사용할 모델 인스턴스까지 해석 */
export async function resolvePersonaModel(personaKey: string) {
  const { selection, source } = await getPersonaModel(personaKey);
  const models = buildModels(selection.model, selection.gateway);
  const model = models.getModel(selection.gateway, selection.model);
  if (!model) throw new Error(`모델 없음: ${selection.model} (게이트웨이: ${selection.gateway})`);
  return { models, model, selection, source };
}
