// 서버 환경변수 설정 (중앙화)
export const config = {
  allowedEmailDomains: (process.env.ALLOWED_EMAIL_DOMAINS ?? "shinhan.com,shinhanlife.co.kr")
    .split(",").map((s) => s.trim().toLowerCase()).filter(Boolean),
  sessionCookieName: process.env.SESSION_COOKIE_NAME ?? "dept_session",
  sessionTtlMs: Number(process.env.SESSION_TTL_MS ?? "604800000"), // 7일 (환경변수)
  ragflow: {
    baseUrl: process.env.RAGFLOW_BASE_URL ?? "",
    apiKey: process.env.RAGFLOW_API_KEY ?? "",
  },
  llm: {
    baseUrl: process.env.LLM_BASE_URL ?? "",
    apiKey: process.env.LLM_API_KEY ?? "",
    model: process.env.LLM_MODEL ?? "deepseek-v4-flash",
    // 용도별 모델 (UI 설정 시 DB 값이 우선, env는 fallback)
    modelResponse: process.env.LLM_MODEL_RESPONSE ?? "",
    modelSimple: process.env.LLM_MODEL_SIMPLE ?? "",
    modelBulk: process.env.LLM_MODEL_BULK ?? "",
    modelCompact: process.env.LLM_MODEL_COMPACT ?? "",
  },
  // 멀티 게이트웨이 — OpenRouter / LiteLLM 등 OpenAI 호환 엔드포인트 추가 가능
  llmGateways: {
    openrouter: {
      label: "OpenRouter",
      baseUrl: process.env.OPENROUTER_BASE_URL ?? "https://openrouter.ai/api/v1",
      apiKey: process.env.OPENROUTER_API_KEY ?? "",
    },
    litellm: {
      label: "LiteLLM",
      baseUrl: process.env.LLM_BASE_URL ?? "",
      apiKey: process.env.LLM_API_KEY ?? "",
    },
  },
  websearch: {
    serperApiKey: process.env.SERPER_API_KEY ?? "",
    tavilyApiKey: process.env.TAVILY_API_KEY ?? "",
  },
  rag: {
    topK: Number(process.env.RAG_TOP_K ?? "5"),
    similarityThreshold: Number(process.env.RAG_SIMILARITY_THRESHOLD ?? "0.2"),
  },
} as const;

export function requireLlmConfig() {
  if (!config.llm.baseUrl || !config.llm.apiKey) {
    throw new Error("LLM_BASE_URL / LLM_API_KEY 미설정");
  }
  return config;
}

export function requireRagConfig() {
  if (!config.ragflow.baseUrl || !config.ragflow.apiKey) {
    throw new Error("RAGFLOW_BASE_URL / RAGFLOW_API_KEY 미설정");
  }
  return config;
}
