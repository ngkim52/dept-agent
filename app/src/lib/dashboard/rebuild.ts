// 대시보드 배치 스냅샷 구성/저장 로직
// - "오늘자 스냅샷"을 app_settings(key='dashboard_snapshot')에 JSON으로 저장
// - GET 시 날짜가 오늘이 아니면(= 매일 아침 첫 조회) 자동으로 새로 구성(rebuild)
// - 관리자는 POST /api/admin/dashboard/rebuild 로 수동 갱신 가능
import { db, schema } from "@/lib/db";
import { eq } from "drizzle-orm";
import { kpiCatalog } from "./kpis";
import { analyzeKpis } from "./analyze";
import { getNews } from "@/lib/news";
import { kstDateStr } from "@/lib/dates";
import { listCandidates } from "@/lib/harness/review";

export type DashboardSnapshot = {
  date: string;            // 구성 기준일 (YYYY-MM-DD)
  builtAt: number;        // ms
  kpis: typeof kpiCatalog;
  analysis: Awaited<ReturnType<typeof analyzeKpis>>;
  news: Awaited<ReturnType<typeof getNews>>;
  todos: { id: string; personaKey: string; summary: string; proposedContent: string; confidence: number }[];
};

const KEY = "dashboard_snapshot";

export function todayStr(d = new Date()) {
  return kstDateStr(d); // KST 기준 — UTC가 아닌 KST 날짜로 오늘/어제 구분
}

export async function buildSnapshot(): Promise<DashboardSnapshot> {
  const kpis = kpiCatalog;
  const analysis = await analyzeKpis(kpis);
  const news = await getNews();
  const cands = await listCandidates({ status: "pending" });
  const todos = cands.map(c => ({ id: c.id, personaKey: c.personaKey, summary: c.summary ?? "", proposedContent: c.proposedContent ?? "", confidence: c.confidence }));
  return { date: todayStr(), builtAt: Date.now(), kpis, analysis, news, todos };
}

export async function persistSnapshot(snap: DashboardSnapshot) {
  await db.insert(schema.appSettings).values({ key: KEY, value: JSON.stringify(snap), updatedAt: new Date() })
    .onConflictDoUpdate({ target: schema.appSettings.key, set: { value: JSON.stringify(snap), updatedAt: new Date() } });
}

export async function readSnapshot(): Promise<DashboardSnapshot | null> {
  const row = await db.query.appSettings.findFirst({ where: eq(schema.appSettings.key, KEY) });
  if (!row?.value) return null;
  try { return JSON.parse(row.value) as DashboardSnapshot; } catch { return null; }
}

// 오늘자 스냅샷을 보장 (없거나 어제자면 재구성) — 매일 배치 갱신 역할
export async function getTodaySnapshot(reuseToday = true): Promise<DashboardSnapshot> {
  const snap = await readSnapshot();
  if (snap && snap.date === todayStr()) return snap;
  const rebuilt = await buildSnapshot();
  await persistSnapshot(rebuilt);
  return rebuilt;
}
