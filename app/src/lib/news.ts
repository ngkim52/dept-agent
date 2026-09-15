// 대시보드 뉴스 — 금감원/생명보험 주요 뉴스
// ※ 운영 시 금융감독원 보도자료/생보협회 API 등 실시간 피드로 교체 예정(설계서 013 참고).
export type NewsItem = { id: string; source: string; title: string; date: string; url?: string; tag: string };

export const SAMPLE_NEWS: NewsItem[] = [
  { id: "n1", source: "금융감독원", tag: "감독", date: "2026-02-12", title: "보험금 지급관행 전반 점검…자동심사 확대 권고", url: "https://www.fss.or.kr/fss/bbs/B0000188/list.do" },
  { id: "n2", source: "생명보험협회", tag: "업계", date: "2026-02-10", title: "생보 손해율 상승세, 헬스케어 실손 리스크 주목", url: "https://www.klia.or.kr/klia/am/notice/press/list.do" },
  { id: "n3", source: "금융감독원", tag: "규제", date: "2026-02-07", title: "부정청구 탐지 고도화…데이터 기반 심사 강화 방안", url: "https://www.fss.or.kr/fss/bbs/B0000188/list.do" },
  { id: "n4", source: "생명보험협회", tag: "업계", date: "2026-02-05", title: "자동심사 대상 확대 시 역선택 리스크 관리 필요", url: "https://www.klia.or.kr/klia/am/notice/press/list.do" },
];

// 실시간 피드 시그니처(1시간 재구성용) — 운영 시 외부 API로 교체
const REFRESH_INTERVAL_MS = 60 * 60 * 1000; // 1시간

/** 신선한 뉴스 가져오기. 운영 시 여기서 금감원/생보협회 피드를 호출합니다. */
export async function getNews(_refresh = false): Promise<{ items: NewsItem[]; fetchedAt: string }> {
  // 1시간 캐시 — refresh=true면 강제 재구성
  const fresh = await fetchFreshNews();
  return { items: fresh.items, fetchedAt: new Date(fresh.fetchedAt).toISOString() };
}

let _cache: { items: NewsItem[]; fetchedAt: number } | null = null;
async function fetchFreshNews(): Promise<{ items: NewsItem[]; fetchedAt: number }> {
  const now = Date.now();
  if (_cache && now - _cache.fetchedAt < REFRESH_INTERVAL_MS) return _cache;
  // 운영: 여기서 실시간 피드를 호출 (실패 시 직전 캐시 유지)
  _cache = { items: SAMPLE_NEWS, fetchedAt: now };
  return _cache!;
}

/** 새로 구성(클릭 시) — 무조건 재구성 후 반환 */
export async function refreshNews(): Promise<{ items: NewsItem[]; fetchedAt: string }> {
  _cache = null;
  return getNews(true);
}
