// 대시보드 섹션별 "부서장 의견" 생성 — 반드시 LLM(Agent)이 작성.
// - 핵심KPI / 처리흐름 / 모니터링 각각: 검토사항(summary) + 할 일(actions)
// - 부서장의견 요약을 바탕으로 시스템·기획·품질점검 파트별 할 일(teams)도 구성
//   (할 일이 없는 파트는 생략) + 회의가 필요하면 회의안 초본(meetingDraft, MD) 제공
// - 정적 fallback 금지: LLM이 실패하면 빈 배열 반환(부실한 고정 데이터를 보여주지 않음)
import { db, schema } from "@/lib/db";
import { eq } from "drizzle-orm";
import { getLlmModel } from "@/lib/agent/llm";
import { kstDateStr } from "@/lib/dates";
import { ragflow } from "@/lib/ragflow/client";
import { getDepartmentDatasets } from "@/lib/dataset/access";
import type { ClaimDashboard } from "./dashboardData";

export type SectionReview = {
  key: string; title: string; summary: string; actions: string[];
  opinion?: string;                 // 부서장이 직접 말하는 의견·지시 (실적+RAG 근거, 부서장 말투)
  teams?: Record<string, string[]>;   // 파트별 할 일: 시스템/기획/품질점검 (할 일 없는 파트 생략)
  needsMeeting?: boolean;             // 회의 필요 여부
  meetingDraft?: string;             // 회의안 초본(MD) — 일정·참석자는 사용자가 작성
};

type Cache = { date: string; reviews: SectionReview[] };

const KEY = "dashboard_section_reviews";
const KOR_PARTS = ["시스템", "기획", "품질점검"];

function todayStr(d = new Date()) { return kstDateStr(d); }

/** 어제(기준) 실적이 속한 달 라벨 예: "9월" */
function monthLabel(dash: ClaimDashboard): string {
  const claims = dash.kpis.find((k) => k.key === "claims_aug");
  const m = claims?.label?.match(/^(\d+)/)?.[1];
  return m ? `${m}월` : "이번 달";
}

export function sectionTitles(dash: ClaimDashboard) {
  return {
    kpi: `핵심 KPI · ${monthLabel(dash)} 실적`,
    pipeline: "지급보험금 처리 흐름",
    monitor: "업무 진도 · 모니터링",
  };
}

export function buildReviewPrompt(dash: ClaimDashboard, ragContext = ""): string {
  const titles = sectionTitles(dash);
  const kpi = dash.kpis.map((k) => `- ${k.label}: ${k.big}${k.unit} (${k.tag.text})`).join("\n");
  const pipe = dash.pipeline.map((p) => `- ${p.label}: ${p.num}${p.unit}`).join("\n");
  const mon = dash.monitors.map((m) => `- ${m.title}: ${m.big}${m.bigUnit} (${m.gaugeLabel} ${m.gaugePct}%)`).join("\n");
  const rag = ragContext && ragContext.trim()
    ? `\n[참고 지식(RAG)]\n${ragContext.trim()}\n`
    : "";
  return `당신은 보험금기획팀 부서장입니다. 아래 대시보드 섹션 데이터와 참고 지식(RAG)을 보고, 진짜 부서장이 부서원에게 직접 말하듯 구체적인 의견과 지시를 내리세요.

각 섹션마다:
- "opinion": 부서장이 실제로 말하는 어조의 의견·지시(2~3문장). 실적 수치와 RAG 지식을 근거로, '지시·재촉·칭찬·경고'처럼 직접 호소(직원을 '여러분/담당'이라 부르며)하는 말투로 작성. 단순 요약 금지.
- "summary": 해당 섹션 상황을 1~2문장으로 간결히 요약.
- "actions": 부서원이 해야 할 구체적인 할 일 3개(각 최대 20자).

[${titles.kpi}]
${kpi}
[${titles.pipeline}]
${pipe}
[${titles.monitor}]
${mon}${rag}
추가 지침:
- 각 섹션의 summary(1~2문장)를 바탕으로, 파트별 할 일(teams)을 구성하세요. 파트는 정확히 3개 키 중에서만 사용: "시스템", "기획", "품질점검". 할 일이 전혀 없는 파트는 teams에 포함하지 마세요(빈 배열 금지). 각 파트는 할 일 1~3개(각 최대 25자).
- 특정 섹션에 회의가 필요하다고 판단되면 needsMeeting: true 로 하고, meetingDraft에 회의안 초본을 마크다운으로 작성하세요. 회의안 형식: # 제목 / - 목적: / ## 안건 (각 1~2문장) / ## 결정 필요 사항. 일정·참석자는 사용자가 직접 채우므로 비워두세요.

반드시 아래 JSON만 마크다운 없이 출력하세요:
{"reviews":[{"key":"kpi","opinion":"부서장 말투 의견·지시 2~3문장","summary":"검토사항 1~2문장","actions":["할일 3개"],"teams":{"시스템":[".."],"기획":[".."],"품질점검":[".."]},"needsMeeting":true,"meetingDraft":"# 회의안\n...\n- 목적:..."},{"key":"pipeline","opinion":"부서장 말투 의견·지시","summary":"...","actions":[".."],"teams":{"..":[".."]}},{"key":"monitor","opinion":"부서장 말투 의견·지시","summary":"...","actions":[".."]}]}
summary는 1~2문장, actions는 3개 항목(각 최대 20자). 필요한 섹션에만 teams/needsMeeting/meetingDraft를 넣고, 불필요하면 생략해도 됩니다.`;
}

export function parseReviews(text: string): SectionReview[] | null {
  try {
    const m = text.match(/{[\s\S]*}/);
    if (!m) return null;
    const data = JSON.parse(m[0]);
    if (!Array.isArray(data.reviews)) return null;
    return data.reviews
      .filter((r: { summary?: unknown }) => r && typeof r.summary === "string")
      .map((r: { key?: string; summary?: string; actions?: string[]; opinion?: string; teams?: Record<string, unknown>; needsMeeting?: boolean; meetingDraft?: string }) => ({
        key: String(r.key ?? ""),
        title: String(r.key ?? ""),
        summary: r.summary as string,
        actions: (Array.isArray(r.actions) ? r.actions : []).map(String) as string[],
        opinion: typeof r.opinion === "string" && r.opinion.trim() ? r.opinion.trim() : undefined,
        teams: sanitizeTeams(r.teams),
        needsMeeting: !!r.needsMeeting,
        meetingDraft: typeof r.meetingDraft === "string" ? r.meetingDraft : undefined,
      }));
  } catch { return null; }
}

/** teams 정리: 시스템/기획/품질점검 키만, 빈 배열·빈 파트 제외 */
function sanitizeTeams(teams: Record<string, unknown> | undefined): Record<string, string[]> | undefined {
  if (!teams || typeof teams !== "object") return undefined;
  const out: Record<string, string[]> = {};
  for (const p of KOR_PARTS) {
    const v = teams[p];
    if (Array.isArray(v)) {
      const items = v.map(String).slice(0, 3).filter((x) => x.trim().length > 0);
      if (items.length) out[p] = items;
    }
  }
  return Object.keys(out).length ? out : undefined;
}

async function readCache(): Promise<Cache | null> {
  const row = await db.query.appSettings.findFirst({ where: eq(schema.appSettings.key, KEY) });
  if (!row?.value) return null;
  try { return JSON.parse(row.value) as Cache; } catch { return null; }
}
async function writeCache(cache: Cache) {
  await db.insert(schema.appSettings).values({ key: KEY, value: JSON.stringify(cache), updatedAt: new Date() })
    .onConflictDoUpdate({ target: schema.appSettings.key, set: { value: JSON.stringify(cache), updatedAt: new Date() } });
}

/** 섹션 리뷰 반환.
 *  - 당일 캐시 존재 시 그대로 사용 (일간 1회 생성/보여주기)
 *  - 아니면 반드시 LLM으로 생성. 실패 시 정적 fallback 대신 [] 반환(더미 데이터 금지). */

/** 대시보드 실적 항목과 관련된 부서 RAG 지식을 조회해 참고자료로 반환 (실패·부재 시 빈 문자열) */
export async function buildReviewRagContext(dash: ClaimDashboard): Promise<string> {
  const datasetIds = await getDepartmentDatasets("claims-planning");
  if (!datasetIds.length) return "";
  const loss = dash.kpis.find((k) => k.key === "loss_ratio");
  const days = dash.kpis.find((k) => k.key === "avg_days");
  const auto = dash.monitors.find((m) => m.key === "ai");
  const fraud = dash.kpis.find((k) => k.key === "fraud");
  const queries = [
    loss ? `손해율 ${loss.big}% 목표 초과 개선·심사 기준` : "손해율 개선 방안",
    days ? `지급보험금 평균 소요 ${days.big}일 단축` : "지급 처리 소요일 단축",
    auto ? `자동심사 적용률 ${auto.gaugePct}% 확대` : "자동심사 적용률 확대",
    fraud ? `보험사기 적발 ${fraud.big}건 강화` : "보험사기 적발 강화",
  ];
  const parts: string[] = [];
  for (const q of queries) {
    try {
      const chunks = await ragflow.retrieve(q, datasetIds, 3);
      for (const c of chunks) if (c?.content?.trim()) parts.push(c.content.trim());
    } catch { /* 개별 조회 실패 무시 */ }
  }
  const seen = new Set<string>();
  const uniq = parts.filter((x) => { const k = x.trim(); if (!k || seen.has(k)) return false; seen.add(k); return true; });
  return uniq.slice(0, 12).join("\n");
}

export async function getSectionReviews(dash: ClaimDashboard, force = false): Promise<SectionReview[]> {
  const now = todayStr();
  if (!force) {
    const cache = await readCache();
    if (cache && cache.date === now && cache.reviews.length > 0) return cache.reviews;
  }
  try {
    const { models, model } = await getLlmModel("simple");
    const ragContext = await buildReviewRagContext(dash).catch(() => "");
    const prompt = buildReviewPrompt(dash, ragContext);
    const res = await models.completeSimple(model, { messages: [{ role: "user" as const, content: prompt, timestamp: Date.now() }] });
    const text = (res?.content ?? []).filter((t) => t?.type === "text").map((t) => t.text).join("");
    const parsed = parseReviews(text.replace(/```json|```/g, ""));
    if (parsed && parsed.length > 0) {
      // 섹션 순서/제목은 코드 기준으로 보정
      const titles = sectionTitles(dash);
      for (const r of parsed) r.title = titles[r.key as keyof typeof titles] ?? r.title;
      await writeCache({ date: now, reviews: parsed });
      return parsed;
    }
    console.error("section review LLM 응답 파싱 실패 → 파싱 실패 리뷰 생략");
  } catch (e) { console.error("section review LLM 실패 (빈 결과로 처리, 정적 fallback 금지):", (e as Error).message); }
  return [];
}
