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
