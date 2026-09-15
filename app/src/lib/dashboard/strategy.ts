// 전략나침반 (컨셈§10) — 세션 배너 + 마인드맵 + 전략연결태그
export type StrategyNode = { key: string; label: string; children?: StrategyNode[] };
export type StrategyContext = { vision: string; perspectives: StrategyNode[] };

export const STRATEGY: StrategyContext = {
  vision: "‘사람 중심의 자동화’ — 시스템(자동심사) 확대 + 품질점검(인간 검증) 13% + 고객편의(즉시지급/서류없는 청구)를 동시에 끌어올린다.",
  perspectives: [
    { key: "speed", label: "처리속도 향상", children: [
      { key: "auto_rate", label: "자동화율 70%" },
      { key: "instant", label: "즉시지급률 75%" },
      { key: "days", label: "처리기일 7일 이내" },
    ]},
    { key: "quality", label: "품질·신뢰", children: [
      { key: "quality13", label: "품질점검 13%" },
      { key: "error0", label: "오류율 1.8% 이하" },
    ]},
    { key: "cx", label: "고객편의", children: [
      { key: "paperless", label: "서류없는 청구 70%" },
      { key: "digital", label: "디지털처리율 85%" },
    ]},
    { key: "anti", label: "리스크 통제", children: [
      { key: "fraud", label: "부정청구 탐지 강화" },
      { key: "risk", label: "신상품 역선택 리스크 협의" },
    ]},
  ],
};

/** 카테고리/키워드 → 전략 퍼스펙티브 연결 (전략연결태그) */
export function linkStrategy(arg: string | { title?: string; categoryKey?: string; key?: string }): string | undefined {
  if (typeof arg === "string") {
    const t = arg;
    if (t.includes("자동") || t.includes("즉시") || t.includes("기일") || t.includes("처리")) return "speed";
    if (t.includes("품질") || t.includes("오류") || t.includes("검증")) return "quality";
    if (t.includes("편의") || t.includes("서류") || t.includes("디지털") || t.includes("소비자")) return "cx";
    if (t.includes("부정") || t.includes("역선택") || t.includes("리스크") || t.includes("신상품")) return "anti";
    return undefined;
  }
  const key = arg.key ?? arg.categoryKey ?? "";
  if (key.includes("2") || key.includes("auto") || key.includes("instant") || key.includes("days")) return "speed";
  if (key.includes("4") || key.includes("quality") || key.includes("error")) return "quality";
  if (key.includes("3") || key.includes("paperless") || key.includes("cx")) return "cx";
  if (key.includes("5") || key.includes("fraud") || key.includes("risk")) return "anti";
  if (key.includes("1")) return "quality";
  return undefined;
}

/** 마인드맵(관점 트리) — 서버/화면에서 순회 가능 */
export function strategyMindMap(): StrategyContext {
  return STRATEGY;
}

/** 피스펙티브 label 조회 */
export function perspectiveLabel(key?: string): string {
  return STRATEGY.perspectives.find((x) => x.key === key)?.label ?? key ?? "";
}
