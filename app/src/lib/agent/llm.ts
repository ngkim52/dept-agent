import { createModels, createProvider, envApiKeyAuth, InMemoryCredentialStore, InMemoryModelsStore } from "@earendil-works/pi-ai";
import { openAICompletionsApi } from "@earendil-works/pi-ai/api/openai-completions.lazy";
import { requireLlmConfig } from "@/lib/config";

// LiteLLM/OpenAI 호환 게이트웨이(OpenRouter 포함) → pi-ai 커스텀 프로바이더 등록
// 특정 모델 ID를 받아 해당 모델만 프로바이더에 등록한다.
export function buildModels(modelId?: string) {
  const c = requireLlmConfig();
  modelId = modelId ?? c.llm.model;
  const provider = createProvider({
    id: "litellm",
    name: "LiteLLM",
    baseUrl: c.llm.baseUrl,
    auth: { apiKey: envApiKeyAuth("LiteLLM", ["LLM_API_KEY"]) },
    models: [
      {
        id: modelId,
        name: modelId,
        api: "openai-completions",
        provider: "litellm",
        baseUrl: c.llm.baseUrl,
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
  const c = requireLlmConfig();
  const modelId = await getModelForPurpose(purpose);
  if (!modelId) throw new Error(`용도별 모델 미설정: ${purpose}`);
  const models = buildModels(modelId);
  const model = models.getModel("litellm", modelId);
  if (!model) throw new Error(`모델 없음: ${modelId} (용도: ${purpose})`);
  return { models, model };
}
