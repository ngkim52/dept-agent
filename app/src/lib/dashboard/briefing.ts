// 업계동향 브리핑 (재설계) — 실시간 웹검색 + LLM 요약
//  - 생명보험회사 / 손해보험회사 / 보험업계(감독·규제) / 보험업계(정책·금융위) 뉴스를 실제 검색
//  - 우리 회사가 참고·검토할 내용을 LLM이 정리(실패 시 휴리스틱 fallback)
//  - 참고한 뉴스는 제목+링크로 하단 제공
import { webSearch } from "@/lib/agent/websearch";
import { getLlmModel } from "@/lib/agent/llm";

export type BriefingSource = { id: string; title: string; url: string; source: string; snippet: string; category: string };
export type BriefAction = { topic: string; summary: string; category: string; sources: string[] };
export type CorporateBriefing = {
  date: string;
  categories: string[];
  executiveSummary: string;
  actions: BriefAction[];
  sources: BriefingSource[];
  flags: { engine: string; sourceCount: number; llm: boolean };
};

export const BRIEFING_QUERIES: { category: string; queries: string[] }[] = [
  { category: "생명보험회사", queries: ["생명보험회사 최근 뉴스", "생명보험업계 동향 뉴스"] },
  { category: "손해보험회사", queries: ["손해보험회사 최근 뉴스", "손해보험업계 동향 뉴스"] },
  { category: "보험업계 · 감독/규제", queries: ["보험업계 뉴스 금융감독원", "보험 감독 규제 개선 뉴스"] },
  { category: "보험업계 · 정책/금융위", queries: ["보험업계 뉴스 금융위원회", "보험산업 정책 뉴스"] },
];

/** URL 기준 중복 제거 — 순서 유지, 카테고리당 상한 */
export function dedupSources(list: BriefingSource[], perCategory = 6): BriefingSource[] {
  const seen = new Set<string>();
  const per = new Map<string, number>();
  const out: BriefingSource[] = [];
  for (const s of list) {
    if (!s.url) continue;
    if (seen.has(s.url)) continue;
    const c = per.get(s.category) ?? 0;
    if (c >= perCategory) continue;
    seen.add(s.url); per.set(s.category, c + 1); out.push(s);
  }
  return out;
}

export function sourceNameOf(url: string): string {
  try { return new URL(url).hostname.replace(/^www\./, ""); } catch { return ""; }
}

/** 웹검색 실행 → 카테고리별 소스 수집 */
export async function searchBriefingSources(): Promise<BriefingSource[]> {
  const all: BriefingSource[] = [];
  let id = 0;
  const jobs = BRIEFING_QUERIES.flatMap((cat) =>
    cat.queries.map((q) => webSearch(q).then((r) => ({ category: cat.category, r })))
  );
  const results = await Promise.all(jobs);
  for (const { category, r } of results) {
    if (!r.ok) continue;
    for (const x of r.results) {
      if (!x.url) continue;
      all.push({ id: "s" + id++, title: x.title, url: x.url, source: sourceNameOf(x.url), snippet: x.snippet, category });
    }
  }
  return dedupSources(all);
}

function buildPrompt(sources: BriefingSource[]): string {
  const srcList = sources.map((s) => `- ${s.id} [${s.category}] ${s.title} | ${s.url} | ${(s.snippet ?? "").slice(0, 120)}`).join("\n");
  return `당신은 보험금기획팀 부서장입니다. 아래는 최근 보험업계 뉴스 웹검색 결과입니다.

${srcList}

우리 회사(생명보험회사의 보험금 심사/지급 조직)가 참고하거나 검토해야 할 내용을 골라 정리하세요.
- executiveSummary: 전체 동향을 2~3문장으로.
- actions: 3~5개. 각 항목은 검토해야 할 주제(topic), 짧은 요약(summary), 해당 뉴스 소스 id 목록(sources, 최대 3개).

반드시 아래 JSON만 마크다운 없이 출력하세요:
{"executiveSummary":"...",
 "actions":[{"topic":"...","summary":"...","sources":["s0","s3"]}]}`;
}

export function parseBriefingJson(text: string): { executiveSummary: string; actions: BriefAction[] } | null {
  try {
    const m = text.replace(/```json|```/g, "").match(/{[\s\S]*}/);
    if (!m) return null;
    const data = JSON.parse(m[0]);
    type Act = { topic?: string; summary?: string; sources?: string[] };
    const actions: BriefAction[] = (Array.isArray(data.actions) ? data.actions : []).filter((a: Act) => a && typeof a.topic === "string" && typeof a.summary === "string")
      .map((a: Act) => ({ topic: a.topic as string, summary: a.summary as string, category: "", sources: (Array.isArray(a.sources) ? a.sources : []).map(String) }));
    return { executiveSummary: String(data.executiveSummary ?? ""), actions };
  } catch { return null; }
}

/** LLM 실패 시 휴리스틱 fallback 브리핑 */
export function buildBriefingFromSources(sources: BriefingSource[]): CorporateBriefing {
  const categories = BRIEFING_QUERIES.map((c) => c.category);
  const actions: BriefAction[] = categories.map((cat) => {
    const items = sources.filter((s) => s.category === cat);
    const topic = items.length ? items[0].title : `${cat} 동향`;
    return {
      topic,
      summary: items.length
        ? `${cat} 최근 동향 ${items.length}건을 수집했습니다. 부서의 심사·지급·손해율 관리 관점에서 검토가 필요합니다.`
        : `${cat} 관련 수집된 최신 뉴스가 없습니다.`,
      category: cat,
      sources: items.map((s) => s.id),
    };
  });
  return {
    date: new Date().toISOString(),
    categories,
    executiveSummary: `생명·손해보험회사 및 보험업계(금감원·금융위)의 최근 동향을 ${sources.length}건 수집했습니다. 아래에서 우리 부서가 참고·검토해야 할 내용을 정리했습니다. (LLM 요약 비활성 시 자동 정리)`,
    actions,
    sources,
    flags: { engine: "fallback", sourceCount: sources.length, llm: false },
  };
}

/** 실검색 + LLM 브리핑 — 실패 시 fallback */
export async function buildLiveBriefing(): Promise<CorporateBriefing> {
  const sources = await searchBriefingSources();
  const categories = BRIEFING_QUERIES.map((c) => c.category);
  if (sources.length === 0) {
    return { date: new Date().toISOString(), categories, executiveSummary: "최근 뉴스를 조회하지 못했습니다.", actions: [], sources, flags: { engine: "none", sourceCount: 0, llm: false } };
  }
  try {
    const { models, model } = await getLlmModel("simple");
    const res = await models.completeSimple(model, { messages: [{ role: "user" as const, content: buildPrompt(sources), timestamp: Date.now() }] });
    const text = (res?.content ?? []).filter((t) => t?.type === "text").map((t) => t.text).join("");
    const parsed = parseBriefingJson(text);
    if (parsed && parsed.actions.length > 0) {
      const byId = new Map(sources.map((s) => [s.id, s]));
      const actions = parsed.actions.map((a) => ({
        topic: a.topic, summary: a.summary,
        category: (a.sources.map((id: string) => byId.get(id)?.category).find(Boolean)) ?? "",
        sources: a.sources.slice(0, 3),
      }));
      return {
        date: new Date().toISOString(), categories,
        executiveSummary: parsed.executiveSummary, actions, sources,
        flags: { engine: "llm", sourceCount: sources.length, llm: true },
      };
    }
    return buildBriefingFromSources(sources);
  } catch (e) {
    console.error("브리핑 LLM 실패, fallback:", (e as Error).message);
    return buildBriefingFromSources(sources);
  }
}
