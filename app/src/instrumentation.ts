// instrumentation.ts — 서버 시작 시 1회 실행. 대시보드를 매일 1회 자동 재구성한다.
// (Next.js 서버 프로세스가 상시 구동되는 환경에서 동작하며, 미동작 시 GET /api/dashboard의 지연 재구성이 보완한다.)
export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  const { runDailyRebuildIfNeeded } = await import("./lib/dashboard/daily");
  const run = () => runDailyRebuildIfNeeded().catch((e) => console.error("[daily] 재구성 실패:", (e as Error).message));
  // 시작 직후 + 6시간 간격 체크 (날짜가 바뀌었을 때만 실제로 1회 수행)
  setTimeout(run, 5000);
  const timer = setInterval(run, 6 * 60 * 60 * 1000);
  timer.unref?.();
}
