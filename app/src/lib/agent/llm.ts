import { createModels, createProvider, envApiKeyAuth, InMemoryCredentialStore, InMemoryModelsStore } from "@earendil-works/pi-ai";
import { openAICompletionsApi } from "@earendil-works/pi-ai/api/openai-completions.lazy";
import { requireLlmConfig } from "@/lib/config";

// LiteLLM 게이트웨이(OpenAI 호환) → pi-ai 커스텀 프로바이더 등록
export function buildModels() {
  const c = requireLlmConfig();
  const modelId = c.llm.model;
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

export async function getLlmModel() {
  const c = requireLlmConfig();
  const models = buildModels();
  const model = models.getModel("litellm", c.llm.model);
  if (!model) throw new Error(`모델 없음: ${c.llm.model}`);
  return { models, model };
}
