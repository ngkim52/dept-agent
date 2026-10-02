// 업계동향 브리핑 (재설계 v2) — 실시간 웹검색 + LLM 요약
//  - 생명보험회사 / 손해보험회사 / 보험업계(감독·규제) / 보험업계(정책·금융위) 뉴스를 실제 검색
//  - 대외 동향을 그대로 요약하는 것이 아니라, 신한라이프생명이 그 동향에 "무엇을 대비·준비해야 하는지"를 도출
//  - 참고한 뉴스는 제목+링크로 하단 제공 (LLM 실패 시 휴리스틱 fallback)
import { webSearch } from "@/lib/agent/websearch";
import { getLlmModel } from "@/lib/agent/llm";
import { parseJsonLoose } from "@/lib/util/jsonLoose";

export type BriefingSource = { id: string; title: string; url: string; source: string; snippet: string; category: string };
export type BriefUrgency = "즉시" | "단기" | "중기" | "";
export type BriefAction = {
  /** 대비 과제 제목 */
  topic: string;
  /** 근거가 된 외부 동향 (사실 위주) */
  summary: string;
  /** 신한라이프에 미치는 영향 (기회/위험) */
  impact: string;
  /** 우리가 준비·대응할 일 (구체적 행동·산출물) */
  action: string;
  /** 대응 주체 (부서/팀 관점) */
  owner: string;
  /** 시급도 */
  urgency: BriefUrgency;
  category: string;
  sources: string[];
};
export type CorporateBriefing = {
  date: string;
  categories: string[];
  executiveSummary: string;
  actions: BriefAction[];
  sources: BriefingSource[];
  flags: { engine: string; sourceCount: number; llm: boolean };
};

export const BRIEFING_QUERIES: { category: string; queries: string[] }[] = [
  { category: "생명보험회사", queries: ["생명보험회사 최근 뉴스", "생명보험업계 동향 뉴스", "신한라이프 생명보험 뉴스"] },
  { category: "손해보험회사", queries: ["손해보험회사 최근 뉴스", "손해보험업계 동향 뉴스"] },
  { category: "보험업계 · 감독/규제", queries: ["보험업계 뉴스 금융감독원", "보험 감독 규제 개선 뉴스"] },
  { category: "보험업계 · 정책/금융위", queries: ["보험업계 뉴스 금융위원회", "보험산업 정책 뉴스"] },
];

const URGENCIES: BriefUrgency[] = ["즉시", "단기", "중기"];

function normalizeUrgency(v: unknown): BriefUrgency {
  const s = String(v ?? "").trim();
  return URGENCIES.includes(s as BriefUrgency) ? (s as BriefUrgency) : "";
}

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

/** 브리핑 생성 프롬프트 — 대외 동향 → 신한라이프의 대비·준비 과제 도출 */
export function buildBriefingPrompt(sources: BriefingSource[]): string {
  const srcList = sources.map((s) => `- ${s.id} [${s.category}] ${s.title} | ${s.url} | ${(s.snippet ?? "").slice(0, 140)}`).join("\n");
  return `당신은 신한라이프생명 보험금기획팀 부서장입니다. 아래는 오늘 수집한 보험업계 외부 동향(뉴스 검색 결과)입니다.

${srcList}

대외 브리핑을 그대로 요약하지 마세요. 우리 회사(신한라이프생명)가 이 동향에 "무엇을 대비하고 준비해야 하는지"를 도출하는 것이 목적입니다.

작성 규칙:
- 뉴스에 없는 사실·수치를 지어내지 말고, 각 항목을 반드시 아래 소스 id에 근거시키세요.
- '신한라이프'가 직접 언급된 소스가 있으면 우선 반영하세요.
- "검토가 필요하다" 같은 일반론 금지. 누가(주체) 무엇을 어떤 산출물로 준비할지 구체적으로 쓰세요.
- 생명보험의 보험금 심사·지급·손해율·상품·규제/감독 대응 관점에서 쓰세요.

출력 항목:
- executiveSummary: 2~3문장. 첫 문장은 외부 동향의 핵심, 이후 문장은 신한라이프가 대비해야 할 방향.
- actions: 3~5개. 각 원소의 필드:
  - topic: 대비 과제 제목 (짧게, 25자 이내)
  - summary: 근거가 된 외부 동향 사실 (1~2문장, 가능하면 수치 포함)
  - impact: 신한라이프에 미치는 영향 (기회 또는 위험, 1문장)
  - action: 우리가 지금 준비·대응할 일 (구체적 행동·산출물, 1~2문장)
  - owner: 대응 주체 (예: 보험금심사기획, 상품개발, 리스크관리, 준법감시, IT)
  - urgency: "즉시" 또는 "단기" 또는 "중기" 중 하나
  - sources: 근거 소스 id 배열 (최대 3개)

반드시 아래 항목을 가진 JSON 객체 하나만, 마크다운·설명 없이 출력하세요:
- executiveSummary: 문자열
- actions: 배열. 각 원소는 topic(문자열), summary(문자열), impact(문자열), action(문자열), owner(문자열), urgency(문자열), sources(문자열 배열).`;
}

/** LLM 응답 → 브리핑 구조 파싱 (콤마 누락·잘림 등 관용 처리) */
export function parseBriefingJson(text: string): { executiveSummary: string; actions: BriefAction[] } | null {
  const data = parseJsonLoose<{ executiveSummary?: unknown; actions?: unknown }>(text);
  if (!data || typeof data !== "object" || Array.isArray(data)) return null;
  const raw = Array.isArray((data as { actions?: unknown }).actions) ? ((data as { actions: unknown[] }).actions) : [];
  const actions: BriefAction[] = raw
    .filter((a): a is Record<string, unknown> => !!a && typeof a === "object" && !Array.isArray(a))
    .map((a) => ({
      topic: String(a.topic ?? "").trim(),
      summary: String(a.summary ?? "").trim(),
      impact: String(a.impact ?? "").trim(),
      action: String(a.action ?? a.summary ?? "").trim(),
      owner: String(a.owner ?? "").trim(),
      urgency: normalizeUrgency(a.urgency),
      category: "",
      sources: (Array.isArray(a.sources) ? a.sources : []).map(String),
    }))
    .filter((a) => a.topic && (a.action || a.summary));
  return { executiveSummary: String((data as { executiveSummary?: unknown }).executiveSummary ?? "").trim(), actions };
}

/** LLM 실패 시 휴리스틱 fallback 브리핑 */
export function buildBriefingFromSources(sources: BriefingSource[]): CorporateBriefing {
  const categories = BRIEFING_QUERIES.map((c) => c.category);
  const actions: BriefAction[] = categories.map((cat) => {
    const items = sources.filter((s) => s.category === cat);
    return {
      topic: `${cat} 동향 점검`,
      summary: items.length
        ? `${items[0].title} 등 ${cat} 관련 동향 ${items.length}건을 수집했습니다.`
        : `${cat} 관련 수집된 최신 뉴스가 없습니다.`,
      impact: items.length ? "신한라이프의 심사·지급 기준과 규제 대응에 영향을 줄 수 있습니다." : "현재 확인된 영향은 없습니다.",
      action: items.length
        ? "수집된 동향을 담당자가 확인하고, 우리 심사·지급 기준에 미치는 영향을 점검해 대비 방안을 정리합니다."
        : "다음 조회 시 다시 확인합니다.",
      owner: "보험금기획",
      urgency: "",
      category: cat,
      sources: items.map((s) => s.id),
    };
  });
  return {
    date: new Date().toISOString(),
    categories,
    executiveSummary: `생명·손해보험회사 및 보험업계(금감원·금융위)의 최근 동향을 ${sources.length}건 수집했습니다. 아래에서 신한라이프가 대비·준비해야 할 내용을 정리했습니다. (LLM 요약 비활성 시 자동 정리)`,
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
    const res = await models.completeSimple(model, { messages: [{ role: "user" as const, content: buildBriefingPrompt(sources), timestamp: Date.now() }] });
    const text = (res?.content ?? []).filter((t) => t?.type === "text").map((t) => t.text).join("");
    const parsed = parseBriefingJson(text);
    if (parsed && parsed.actions.length > 0) {
      const byId = new Map(sources.map((s) => [s.id, s]));
      const actions = parsed.actions.map((a) => ({
        ...a,
        category: (a.sources.map((id) => byId.get(id)?.category).find(Boolean)) ?? "",
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
