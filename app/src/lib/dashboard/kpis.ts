// 대시보드 KPI 정의 + 현황 데이터 계약 — 컨셈§09 8개 지표 + 2단계(월별추이→카드)
export type Kpi = {
  key: string;
  label: string;          // KPI 이름
  unit: string;           // 단위(%)
  value: number;          // 실적(최신월)
  target: number;         // 목표
  baseline: number;       // 전월(직전월) 값 — 전월대비 배지 계산용
  goodWhen: "up" | "down";
  direction: "관리" | "대응";      // 컨셈§09 관리·대응 필요 방향
  linkedCategory: string;  // 연동 업무 카드 key (2단계 진입)
  dept: string;          // 담당 부서
  note: string;          // 현황 설명
  trend: number[];        // 최근 6개월 시계열 (오름차순, 마지막=value)
};

export const kpiCatalog: Kpi[] = [
  { key: "auto_rate", label: "자동화율", unit: "%", value: 63, target: 70, baseline: 58, goodWhen: "up", direction: "관리", linkedCategory: "claims2", dept: "청구기획", note: "자동심사 전환 확대 여지. 즉시지급 제외 규칙·룰 협의체 사전검토 연동.", trend: [50, 52, 55, 58, 61, 63] },
  { key: "digital_rate", label: "디지털 처리율", unit: "%", value: 81, target: 85, baseline: 79, goodWhen: "up", direction: "관리", linkedCategory: "claims2", dept: "청구기획", note: "비대면 청구 전환율 상승 중.", trend: [74, 76, 76, 78, 79, 81] },
  { key: "claim_days", label: "보험금 처리기일", unit: "일", value: 5.8, target: 7.0, baseline: 6.0, goodWhen: "down", direction: "관리", linkedCategory: "claims3", dept: "청구기획", note: "처리기일 단축, 목표 충족 지속.", trend: [6.8, 6.6, 6.5, 6.3, 6.0, 5.8] },
  { key: "instant_rate", label: "즉시지급률", unit: "%", value: 72, target: 75, baseline: 70, goodWhen: "up", direction: "관리", linkedCategory: "claims3", dept: "청구기획", note: "즉시지급 확대, 목표 근접.", trend: [66, 67, 68, 69, 70, 72] },
  { key: "paperless_rate", label: "서류없는 청구 이용율", unit: "%", value: 68, target: 70, baseline: 66, goodWhen: "up", direction: "관리", linkedCategory: "claims3", dept: "청구기획", note: "서류없는 청구 이용 확산, 목표 70% 근접.", trend: [61, 62, 64, 65, 66, 68] },
  { key: "delay_rate", label: "지급지연율", unit: "%", value: 4.2, target: 3.0, baseline: 3.4, goodWhen: "down", direction: "대응", linkedCategory: "claims1", dept: "보험금 QA", note: "지연율 3.4→4.2% 악화(3개월째). 구조적 요인 점검 필요.", trend: [2.8, 3.1, 3.4, 3.6, 3.9, 4.2] },
  { key: "quality_check_rate", label: "품질점검 시행율", unit: "%", value: 13, target: 13, baseline: 11, goodWhen: "up", direction: "대응", linkedCategory: "claims4", dept: "보험금 QA", note: "품질점검 시행 13% 목표 도달(컨셈 기준 13%). 확대 시행 단계.", trend: [9, 10, 10, 11, 12, 13] },
  { key: "error_rate", label: "오류율", unit: "%", value: 2.1, target: 1.8, baseline: 1.9, goodWhen: "down", direction: "대응", linkedCategory: "claims4", dept: "보험금 QA", note: "오류율 2.1%로 목표 초과, 유형별 사후점검 필요.", trend: [1.6, 1.7, 1.7, 1.8, 1.9, 2.1] },
];

export type KpiBadge = "양호" | "미달" | "악화" | "유지";
export type TrendContext = {
  months: number;         // n개월째 지속
  structural: boolean;    // 개별 vs 구조적 (지속 편차 ≥3개월 → 구조적)
  badge: KpiBadge;
  deltaFromBaseline: number;
};

/** 전월대비 배지 + 개별/구조 분류 (컨셈§09 2단계)
 * - months: 목표에서 멀어지는 방향(악화)으로 연속된 개월 수
 * - structural: 악화가 3개월 이상 지속 → 구조적(추세·제도/기준) 문제로 분류
 * - badge: 양호(목표 충족) / 미달(미충족+개선 중) / 악화(미충족+악화 중) / 유지
 */
export function kpiTrendContext(k: Kpi): TrendContext {
  const t = k.trend.length >= 2 ? k.trend : [k.baseline, k.value];
  const last = t[t.length - 1];
  const badDir = k.goodWhen === "down" ? (v: number) => v > k.target : (v: number) => v < k.target;
  const worsen = k.goodWhen === "down"
    ? (a: number, b: number) => b > a
    : (a: number, b: number) => b < a;
  let months = 0;
  for (let i = t.length - 1; i >= 1; i--) { if (worsen(t[i - 1], t[i])) months++; else break; }
  const structural = months >= 3;
  const delta = Math.round((last - k.baseline) * 10) / 10;
  const meets = !badDir(last);
  const improving = k.goodWhen === "up" ? last > k.baseline : last < k.baseline;
  let badge: KpiBadge;
  if (meets) badge = improving || delta === 0 ? "양호" : "유지";
  else badge = improving ? "미달" : "악화";
  return { months, structural, badge, deltaFromBaseline: delta };
}
