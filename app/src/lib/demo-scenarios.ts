// 시연 딥 3영역 시나리오 (컨셈§시연우선순위) — 카드5(신상품)·카드3(고객편의성)·카드2(시스템관리)
export type DemoScenario = {
  id: string;
  categoryKey: string;
  categoryLabel: string;
  title: string;
  prompt: string;       // 시연용 대표 질문
  expect: { authority: string; knowledge: string[] };  // 값검증 기대치
};

export const DEMO_SCENARIOS: DemoScenario[] = [
  {
    id: "demo5", categoryKey: "claims5", categoryLabel: "신상품 리스크 검토",
    title: "카드5 — 신상품(자동심사 확대 시뮬레이션)",
    prompt: "저금리 환경에서 자동심사 대상을 5천만원까지 확대하려 합니다. 역선택 리스크를 파악하고 상품라운드테이블 협의 절차로 제안해 주세요.",
    expect: { authority: "deliberation", knowledge: ["역선택", "협의", "제안"] },
  },
  {
    id: "demo3", categoryKey: "claims3", categoryLabel: "고객편의성",
    title: "카드3 — 고객편의성(민원예방)",
    prompt: "고객 편의성 향상을 위해 서류없는 청구 이용률을 높이면서 민원을 예방하려면 어떤 안내와 심사 기준이 필요한지 제안해 주세요.",
    expect: { authority: "own", knowledge: ["민원", "편의", "서류"] },
  },
  {
    id: "demo2", categoryKey: "claims2", categoryLabel: "시스템관리",
    title: "카드2 — 시스템관리(룰 협의체 사전검토)",
    prompt: "자동심사 자동화 룰 변경 전, 룰 협의체에 사전 검토로 올릴 안건을 정리해 주세요.",
    expect: { authority: "own", knowledge: ["룰 협의체", "자동심사"] },
  },
];

export function getDemoScenario(id: string): DemoScenario | undefined {
  return DEMO_SCENARIOS.find((s) => s.id === id);
}
