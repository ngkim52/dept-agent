import { config } from "@/lib/config";

// 웹 검색 클라이언트 — Serper(Google) 우선, TAVILY_API_KEY가 있고 Serper 실패 시 Tavily 폴백.
// 외부 검색 API 키가 전혀 없으면 검색 불가 안내를 반환한다.

export interface WebSearchResult {
  title: string;
  url: string;
  snippet: string;
}

const MAX_RESULTS = 5;
const timeoutMs = 12000;

async function fetchWithTimeout(url: string, init: RequestInit, ms = timeoutMs): Promise<Response> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), ms);
  try {
    return await fetch(url, { ...init, signal: ctrl.signal });
  } finally {
    clearTimeout(timer);
  }
}

/** Serper (Google 검색) — https://serper.dev */
async function searchSerper(query: string): Promise<WebSearchResult[] | null> {
  if (!config.websearch.serperApiKey) return null;
  const res = await fetchWithTimeout("https://google.serper.dev/search", {
    method: "POST",
    headers: {
      "X-API-KEY": config.websearch.serperApiKey,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ q: query, gl: "kr", hl: "ko", num: MAX_RESULTS }),
  });
  if (!res.ok) throw new Error("Serper 검색 실패: HTTP " + res.status);
  const data = await res.json();
  const organic = Array.isArray(data.organic) ? data.organic : [];
  return organic.slice(0, MAX_RESULTS).map((item: any) => ({
    title: String(item.title ?? ""),
    url: String(item.link ?? ""),
    snippet: String(item.snippet ?? ""),
  }));
}

/** Tavily — https://tavily.com (API 키 형식: tvly-) */
async function searchTavily(query: string): Promise<WebSearchResult[] | null> {
  if (!config.websearch.tavilyApiKey) return null;
  const res = await fetchWithTimeout("https://api.tavily.com/search", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ api_key: config.websearch.tavilyApiKey, query, max_results: MAX_RESULTS, search_depth: "basic" }),
  });
  if (!res.ok) throw new Error("Tavily 검색 실패: HTTP " + res.status);
  const data = await res.json();
  const results = Array.isArray(data.results) ? data.results : [];
  return results.slice(0, MAX_RESULTS).map((item: any) => ({
    title: String(item.title ?? ""),
    url: String(item.url ?? ""),
    snippet: String(item.content ?? item.snippet ?? ""),
  }));
}

/** 웹 검색 실행 — Serper → Tavily 폴백, 키 없으면 null */
export async function webSearch(query: string): Promise<{
  ok: boolean;
  results: WebSearchResult[];
  provider: string;
  error?: string;
}> {
  if (!config.websearch.serperApiKey && !config.websearch.tavilyApiKey) {
    return { ok: false, results: [], provider: "none", error: "검색 API 키가 설정되지 않았습니다 (SERPER_API_KEY / TAVILY_API_KEY)." };
  }
  if (config.websearch.serperApiKey) {
    try {
      const r = await searchSerper(query);
      if (r) return { ok: true, results: r, provider: "serper" };
    } catch { /* 폴백 */ }
  }
  if (config.websearch.tavilyApiKey) {
    const r = await searchTavily(query);
    if (r) return { ok: true, results: r, provider: "tavily" };
  }
  return { ok: false, results: [], provider: "none", error: "검색에 실패했습니다." };
}

/** 검색 결과를 에이전트 툴 응답용 텍스트로 변환 */
export function formatSearchResults(query: string, res: { ok: boolean; results: WebSearchResult[]; provider: string }): string {
  if (!res.ok) return "(웹 검색 불가)";
  if (res.results.length === 0) return "(검색 결과 없음)";
  return res.results.map((r, i) =>
    `[웹 ${i + 1}] ${r.title}\n  URL: ${r.url}\n  ${r.snippet}`
  ).join("\n\n");
}
