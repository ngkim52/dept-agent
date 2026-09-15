// 대시보드 일일 자동 재구성 스케줄러 — 매일 1회(날짜 변경 시) 스냅샷 + 섹션 리뷰 갱신
import { buildSnapshot, persistSnapshot, readSnapshot, todayStr } from "./rebuild";
import { claimDashboard } from "./dashboardData";
import { getSectionReviews } from "./sectionReview";

export async function runDailyRebuildIfNeeded() {
  const now = todayStr();
  const snap = await readSnapshot();
  if (snap && snap.date === now) return; // 오늘자 스냅샷 이미 존재 → 매일 1회 보장
  console.log(`[daily] 대시보드 일일 재구성 시작 (${now})`);
  const rebuilt = await buildSnapshot();
  await persistSnapshot(rebuilt);
  await getSectionReviews(claimDashboard, true); // 부서장 의견도 당일 갱신
  console.log(`[daily] 대시보드 재구성 완료 (${now})`);
}
