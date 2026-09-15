// 대시보드 RAGFlow 적재 스크립트
// - 항목(섹션)별로 새 데이터셋을 만들고, 각 데이터셋에 다수의 월별/보고 문서를 적재한다.
// - 멱등: 이미 존재하는 데이터셋은 재사용하고 새 문서를 추가한다.
// 실행: npx tsx scripts/seed-dashboard-data.ts  (app 디렉토리에서)
import * as fs from "node:fs";
import * as path from "node:path";

// .env 로드 (스크립트 실행용)
const envPath = path.join(process.cwd(), ".env");
if (fs.existsSync(envPath)) {
  for (const line of fs.readFileSync(envPath, "utf-8").split("\n")) {
    const m = line.match(/^\s*([\w.]+)\s*=\s*(.*)\s*$/);
    if (m && !(m[1] in process.env)) process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
  }
}

import { seedDatasets, claimDashboard, YEAR } from "@/lib/dashboard/dashboardData";
import { RagflowClient } from "@/lib/ragflow/client";
import { db, schema } from "@/lib/db";

const client = new RagflowClient(process.env.RAGFLOW_BASE_URL ?? "", process.env.RAGFLOW_API_KEY ?? "");
const SNAPSHOT_KEY = "dashboard_data_snapshot";

async function ensureDataset(targetName: string): Promise<string> {
  const existing = await client.listDatasets();
  const found = existing.find((d) => d.name === targetName);
  if (found) { console.log(`  [재사용] 데이터셋 "${targetName}" → ${found.id}`); return found.id; }
  const id = await client.createDataset(targetName);
  console.log(`  [신규] 데이터셋 "${targetName}" → ${id}`);
  return id;
}

async function uploadDoc(datasetId: string, filename: string, content: string): Promise<string | null> {
  const res = await client.uploadDocument(datasetId, filename, new Blob([content], { type: "text/markdown" }));
  const data = res?.data as { id?: string } | { id: string }[] | undefined;
  // RAGFlow 생성 응답: data가 {id} 또는 문서 배열 [{id}, ...]
  const docId = Array.isArray(data) ? data[0]?.id : data?.id;
  console.log(`    적재 ${filename} → ${docId ? "OK" : "??"}`);
  return docId ?? null;
}

async function parseAll(datasetId: string) {
  try {
    const docs = await client.listDatasetDocuments(datasetId);
    const ids = docs.map((d) => d.id);
    if (ids.length) { await client.parseDocuments(datasetId, ids); console.log(`    파싱 요청 ${ids.length}건`); }
  } catch (e) { console.log("    파싱 요청 실패(무시)", String(e).slice(0,120)); }
}

async function main() {
  console.log(`\n=== 대시보드 데이터 RAGFlow 적재 시작 (${YEAR}) ===`);
  console.log(`항목 ${seedDatasets.length}개 · 각각 다수 문서 적재`);

  for (const ds of seedDatasets) {
    console.log(`\n[${ds.title}] ${ds.key}`);
    const id = await ensureDataset(ds.datasetName);
    for (const doc of ds.docs) await uploadDoc(id, doc.filename, doc.content);
    await parseAll(id);
  }

  // 스냅샷을 DB에 기록 (적재 완료 트래킹)
  try {
    const payload = JSON.stringify({ updatedAt: new Date().toISOString(), year: YEAR, count: seedDatasets.length, dash: { asOf: claimDashboard.asOf } });
    await db.insert(schema.appSettings).values({ key: SNAPSHOT_KEY, value: payload, updatedAt: new Date() })
      .onConflictDoUpdate({ target: schema.appSettings.key, set: { value: payload, updatedAt: new Date() } });
    console.log("\nDB 스냅샷 기록 완료");
  } catch (e) {
    console.log("DB 기록 스킵:", String(e).slice(0,120));
  }
  console.log("\n=== 완료 ===");
}

main().catch((e) => { console.error("적재 실패:", e); process.exit(1); });
