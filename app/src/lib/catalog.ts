// 부서 업무 카탈로그 — QnA 업무 카드(컨셉 §05) 정의
// 카테고리 선택 → 스코프 내 대화, 스킬 연동, 전략연결 태그 소스.

export type Category = {
  key: string;          // categoryKey 저장값 (conversations.categoryKey)
  no: number;           // 표시 순번 (1~6, 0=기타)
  label: string;        // 카드 이름
  labelShort?: string;   // 짧은 라벨
  skill?: string;        // 스킬 이름 (프롬프트 라우팅 힌트) — claims-planning 스킬과 정렬
  scope: string;        // 대화 범위 설명 (스코프 제한용)
  stratTag?: string;     // 전략연결 기본 태그 대상 (회사/그룹/부서)
  deep?: boolean;       // 시연 딥 대상
  trigger?: string;     // 양방향/관리 신호 트리거 요약
};

// 권한 범위 (컨셉 §06) — ①②③④⑥=단독 판단, ⑤=협의 필요(제안+근거)
export type Authority = "own" | "deliberation";
export const CATEGORY_AUTHORITY: Record<string, Authority> = {
  claims1: "own",
  claims2: "own",
  claims3: "own",
  claims4: "own",
  claims5: "deliberation",   // 신상품 리스크 — 최종결정권은 상품라운드테이블·상품전략위원회
  claims6: "own",
};

export const CLAIMS_CATEGORIES: Category[] = [
  { key: "claims1", no: 1, label: "지급보험금 관리", skill: "지급보험금 건전성 관리", scope: "지급보험금 건전성·손해율·이상징후(계획대비 5% 트리거) 판단", stratTag: "부서", deep: false, trigger: "계획 대비 5% 이상 편차 시" },
  { key: "claims2", no: 2, label: "보험금 시스템 관리", skill: "업무 자동화·효율화", scope: "청구 접수·지급심사 자동화, 즉시지급 제외 규칙, 룰 협의체 사전검토", stratTag: "부서", deep: true },
  { key: "claims3", no: 3, label: "고객편의성 제고", skill: "고객편의성 제고", scope: "청구·지급 프로세스 편의 개선, 민원 대응·예방, 소비자보호", stratTag: "그룹", deep: true },
  { key: "claims4", no: 4, label: "보험금품질적정성관리", skill: "보험금 품질·적정성 점검", scope: "지급완료 보험금 사후 점검, 오류 유형 판정·피드백", stratTag: "부서", deep: false },
  { key: "claims5", no: 5, label: "신상품 리스크 검토", skill: "신상품 리스크 검토", scope: "신상품 출시 전 손해율 상승 요인·역선택·의료 트렌드, 자동심사 확대 시뮬레이션", stratTag: "회사", deep: true },
  { key: "claims6", no: 6, label: "부서 사업계획 및 KPI 관리", skill: "사업계획KPI", scope: "연간 사업계획·KPI 목표(도전적), 월/분기 진척, 전월 대비 추세 악화, 우선순위·자원배분", stratTag: "부서", deep: false },
  { key: "claims0", no: 0, label: "기타", labelShort: "기타", scope: "위 영역에 속하지 않는 일반 질문", stratTag: "부서", deep: false },
];

export function getCategories(personaKey: string): Category[] {
  if (personaKey === "actuarial") return ACTUARIAL_CATEGORIES;
  return CLAIMS_CATEGORIES;
}
export function getCategory(personaKey: string, key?: string | null): Category | undefined {
  if (!key) return undefined;
  return getCategories(personaKey).find((c) => c.key === key);
}
export function categoryAuthority(key: string): Authority {
  return CATEGORY_AUTHORITY[key] ?? "own";
}

export const ACTUARIAL_CATEGORIES: Category[] = [
  { key: "act1", no: 1, label: "신계약 CSM 모니터링", scope: "신계약 CSM·할인율·VNB·업계배수", stratTag: "회사" },
  { key: "act2", no: 2, label: "준비금 산출", scope: "계리적 준비금·적립기준", stratTag: "회사" },
  { key: "act3", no: 3, label: "요율 산출·적정성", scope: "보험요율 검증·요율 리스크", stratTag: "회사" },
  { key: "act4", no: 4, label: "재무건전성", scope: "K-ICS·지급여력·재무건전성", stratTag: "회사" },
  { key: "act5", no: 5, label: "경험통계·장기", scope: "경험통계 산출·장기 리스크", stratTag: "회사" },
  { key: "act0", no: 0, label: "기타", labelShort: "기타", scope: "위 영역 외 일반", stratTag: "회사" },
];
