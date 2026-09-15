import { NextRequest } from "next/server";
import { requireUser, jsonError } from "@/lib/auth/http";
import { buildLiveBriefing, type CorporateBriefing } from "@/lib/dashboard/briefing";
import { db, schema } from "@/lib/db";
import { eq } from "drizzle-orm";
import { kstDateStr } from "@/lib/dates";

const KEY = "dashboard_briefing";

type BriefingCache = { date: string; briefing: CorporateBriefing; at: number };

async function readCache(): Promise<BriefingCache | null> {
  try {
    const row = await db.query.appSettings.findFirst({ where: eq(schema.appSettings.key, KEY) });
    if (!row?.value) return null;
    return JSON.parse(row.value) as BriefingCache;
  } catch { return null; }
}
async function writeCache(c: BriefingCache) {
  await db.insert(schema.appSettings).values({ key: KEY, value: JSON.stringify(c), updatedAt: new Date() })
    .onConflictDoUpdate({ target: schema.appSettings.key, set: { value: JSON.stringify(c), updatedAt: new Date() } });
}

// GET /api/briefing — 업계동향 브리핑 (실제 웹검색 + LLM 요약)
//  - 하루(커밋 기준 KST)에 1회만 새로 생성·저장 후 표시. ?refresh=1 로 같은 날에도 강제 갱신.
//  - 갱신되면 새 데이터로 업데이트해서 보여준다.
export async function GET(req: NextRequest) {
  try {
    await requireUser(req);
    const refresh = req.nextUrl.searchParams.get("refresh") === "1";
    if (!refresh) {
      const cache = await readCache();
      if (cache && cache.date === kstDateStr()) {
        return Response.json({ briefing: cache.briefing, fetchedAt: new Date(cache.at).toISOString(), cached: true });
      }
    }
    const briefing = await buildLiveBriefing();
    const c: BriefingCache = { date: kstDateStr(), briefing, at: Date.now() };
    await writeCache(c);
    return Response.json({ briefing, fetchedAt: new Date(Date.now()).toISOString(), cached: false });
  } catch (e) { return jsonError(e); }
}
