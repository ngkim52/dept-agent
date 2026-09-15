// KST(+09:00) 기준 날짜/월 유틸 — 대시보드 기준일은 항상 KST "오늘/어제"를 사용한다.
// (기존 toISOString().slice(0,10)은 UTC라 자정~오전 8:59 사이에 날짜가 어긋날 수 있어 대체)

const KST_MS = 9 * 3600 * 1000;
const KOR_WEEKDAYS = ["일", "월", "화", "수", "목", "금", "토"];

/** 주어진 시각을 KST 달력 기준 날짜(자정 UTC로 정규화된 Date)로 반환 */
export function kstDate(d: Date = new Date()): Date {
  const k = new Date(d.getTime() + KST_MS);
  return new Date(Date.UTC(k.getUTCFullYear(), k.getUTCMonth(), k.getUTCDate()));
}

const pad2 = (n: number) => String(n).padStart(2, "0");
/** KST 기준 YYYY-MM-DD */
export function kstDateStr(d: Date = new Date()): string {
  const k = new Date(d.getTime() + KST_MS);
  return `${k.getUTCFullYear()}-${pad2(k.getUTCMonth() + 1)}-${pad2(k.getUTCDate())}`;
}

/** KST 기준 YYYY.M. D (요일) 표기 예: 2026. 9. 15 (화) */
export function kstDocDateStr(d: Date = new Date()): string {
  const k = new Date(d.getTime() + KST_MS);
  const day = new Date(Date.UTC(k.getUTCFullYear(), k.getUTCMonth(), k.getUTCDate()));
  const label = new Date(day.getTime() - KST_MS);
  const wd = KOR_WEEKDAYS[day.getUTCDay()];
  return `${k.getUTCFullYear()}. ${k.getUTCMonth() + 1}. ${day.getUTCDate()} (${wd})`;
}

/** KST 어제 YYYY-MM-DD */
export function yesterdayStr(d: Date = new Date()): string {
  const k = kstDate(d);
  const prev = new Date(k.getTime() - 24 * 3600 * 1000);
  return `${prev.getUTCFullYear()}-${pad2(prev.getUTCMonth() + 1)}-${pad2(prev.getUTCDate())}`;
}

export function addDays(d: Date, n: number): Date {
  const x = new Date(d);
  x.setDate(x.getDate() + n);
  return x;
}

/** KST 기준 연·월(1~12)·일 반환 */
export function kstYmd(d: Date = new Date()): { year: number; month: number; day: number } {
  const k = new Date(d.getTime() + KST_MS);
  return { year: k.getUTCFullYear(), month: k.getUTCMonth() + 1, day: k.getUTCDate() };
}
