// 핵심 KPI 카드 클릭 시 하단 상세 데이터.
// Q2.b 확정: 지금은 가상(시드) 데이터를 RAG(문서/지식) 기반 구조로 제공.
// 나중에 실제 데이터가 생기면 getKpiDetail 내부의 데이터 로딩만 실 데이터 소스로 교체하면 반영된다.

export interface KpiDetail {
  key: string;
  title: string;
  unit: string;
  /** 1월~N월 라벨 */
  months: string[];
  /** 월별 값 (단위: unit) */
  monthly: number[];
  /** 원하면 누적 (없으면 undefined) */
  monthlyCum?: number[];
  /** 하위 분류별 월별 시리즈 (예: 청구사유별 지급보험금) */
  breakdown: { label: string; values: number[] }[];
  summary: string;
}

// --- 가상(시드) 데이터 출처 표시. 실제 데이터 투입 시 이 문자열은 실출처명으로 교체 ---
export const KPI_DETAIL_SOURCE = "rag-virt";

// 청구사유(사망/장해/진단/입원/실손)별 월별 지급보험금(억 원) — 가상 RAG 데이터
const REASONS = ["사망", "장해", "진단", "입원", "실손"];
const BY_REASON = [
  [64, 66, 69, 72, 75, 78, 81, 85, 88],  // 사망
  [58, 60, 63, 65, 67, 69, 72, 75, 78],  // 장해
  [88, 90, 93, 95, 97, 99, 103, 108, 111],// 진단
  [92, 94, 95, 96, 98, 100, 102, 105, 108],// 입원
  [78, 81, 82, 84, 85, 85, 87, 95, 98],   // 실손
];

const MONTHS9 = ["1월","2월","3월","4월","5월","6월","7월","8월","9월"];

// 월별 합계 지급보험금(억 원) — 사유별 합
const MONTHLY_TOTAL = BY_REASON[0].map((_, k) => BY_REASON.reduce((a, row) => a + row[k], 0));

// 월별 누적 지급보험금(억 원) — 1월~9월 누적
const CUM_PAID = MONTHLY_TOTAL.map((v, k) => MONTHLY_TOTAL.slice(0, k + 1).reduce((a, x) => a + x, 0));

function buildDetail(key: string): KpiDetail {
  if (key === "cum_paid") {
    return {
      key, title: "누적 지급보험금", unit: "억 원", months: MONTHS9, monthly: MONTHLY_TOTAL, monthlyCum: CUM_PAID,
      breakdown: REASONS.map((label, ri) => ({ label, values: BY_REASON[ri] })),
      summary: `${MONTHS9[0]}~${MONTHS9[8]} 누적 지급보험금 ${CUM_PAID[8].toLocaleString()}억 원. 청구사유별 비중: 진단·입원 중심, 월별 완만한 상승.`,
    };
  }
  if (key === "loss_ratio") {
    const values = [80.1, 79.6, 79.2, 79.0, 78.8, 79.4, 79.9, 80.3, 79.9]; // 손해율(%)
    return {
      key, title: "지급보험금 손해율", unit: "%", months: MONTHS9, monthly: values,
      breakdown: REASONS.map((label, ri) => ({ label, values: BY_REASON[ri].map((v, k) => Math.round(v / MONTHLY_TOTAL[k] * 1000) / 10) })),
      summary: "목표 79% 대비 0.9%p 초과. 7~8월 상승 후 9월 소폭 개선, 수입보험료 증가에 따른 해석 필요.",
    };
  }
  if (key === "claims_aug") {
    const values = [112400, 114800, 117200, 119600, 121100, 122400, 121050, 128540, 130900]; // 청구 처리 건
    return {
      key, title: "월 청구 처리", unit: "건", months: MONTHS9, monthly: values,
      breakdown: REASONS.map((label, ri) => ({ label, values: BY_REASON[ri].map((v, k) => Math.round(values[k] * (0.16 + ri * 0.02)) ) })),
      summary: "월별 청구 처리량은 8~9월 접수 급증으로 상승. 처리율 97.9% 유지.",
    };
  }
  if (key === "avg_days") {
    const values = [5.1, 4.9, 4.7, 4.4, 4.2, 4.0, 3.5, 3.2, 3.0];
    return {
      key, title: "평균 지급 소요", unit: "일", months: MONTHS9, monthly: values,
      breakdown: REASONS.map((label, ri) => ({ label, values: values.map((v) => Math.round((v + ri * 0.3) * 10) / 10) })),
      summary: "처리 소요일은 지속 단축(5.1→3.0일). 자동심사 확대에 따른 단축 효과.",
    };
  }
  // fraud
  const values = [168, 176, 182, 190, 201, 218, 243, 214, 226];
  return {
    key, title: "보험사기 의심 적발", unit: "건", months: MONTHS9, monthly: values,
    breakdown: ["의심 적발", "고발 전환", "회수"].map((label, ri) => ({ label, values: values.map((v, k) => Math.round(v * (1 - ri * 0.45)) ) })),
    summary: "적발 건수는 보험사기 모형 고도화로 상승, 고발·회수 연계 필요.",
  };
}
export function getKpiDetails(): KpiDetail[] {
  return ["cum_paid", "loss_ratio", "claims_aug", "avg_days", "fraud"].map(buildDetail);
}
