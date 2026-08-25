import { createModels, createProvider, envApiKeyAuth, InMemoryCredentialStore, InMemoryModelsStore } from "@earendil-works/pi-ai";
import { openAICompletionsApi } from "@earendil-works/pi-ai/api/openai-completions.lazy";
import { requireLlmConfig } from "@/lib/config";

// OpenAI 호환 게이트웨이(OpenRouter/LiteLLM) → pi-ai 커스텀 프로바이더 등록
// gateway: "openrouter" | "litellm" — config.llmGateways에서 baseUrl/키를 찾는다.
export function buildModels(modelId?: string, gateway: string = "litellm") {
  const c = requireLlmConfig();
  modelId = modelId ?? c.llm.model;
  const gw = (c as any).llmGateways?.[gateway] ?? c.llmGateways?.litellm;
  if (!gw || !gw.baseUrl) throw new Error(`게이트웨이 미설정: ${gateway}`);
  const apiKeyEnv = gateway === "openrouter" ? "OPENROUTER_API_KEY" : "LLM_API_KEY";
  const provider = createProvider({
    id: gateway,
    name: gw.label ?? gateway,
    baseUrl: gw.baseUrl,
    auth: { apiKey: envApiKeyAuth(gw.label ?? gateway, [apiKeyEnv]) },
    models: [
      {
        id: modelId,
        name: modelId,
        api: "openai-completions",
        provider: gateway,
        baseUrl: gw.baseUrl,
        reasoning: false,
        input: ["text"],
        cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
        contextWindow: 32768,
        maxTokens: 8192,
      },
    ],
    api: openAICompletionsApi(),
  });
  const models = createModels({
    credentials: new InMemoryCredentialStore(),
    modelsStore: new InMemoryModelsStore(),
  });
  models.setProvider(provider);
  return models;
}

export type ModelPurpose = "response" | "simple" | "bulk" | "compact";

/** 용도별 모델 조회 — DB(UI 설정) 우선, env fallback */
export async function getLlmModel(purpose: ModelPurpose = "response") {
  const { getModelForPurpose } = await import("@/lib/settings");
  const sel = await getModelForPurpose(purpose);
  if (!sel.model) throw new Error(`용도별 모델 미설정: ${purpose}`);
  const models = buildModels(sel.model, sel.gateway);
  const model = models.getModel(sel.gateway, sel.model);
  if (!model) throw new Error(`모델 없음: ${sel.model} (용도: ${purpose}, 게이트웨이: ${sel.gateway})`);
  return { models, model };
}
