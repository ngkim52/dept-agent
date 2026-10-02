// 토론 라운드 단계 — 라운드가 올라갈수록 논의를 수렴시킨다 (019)
export type RoundPhase = { label: string; directive: string };

export const ROUND_PHASES: RoundPhase[] = [
  {
    label: "입장 개진",
    directive: "1라운드입니다. 반박보다 내 입장과 그 근거를 분명히 밝히세요. 이 안건에서 내가 가장 중요하게 보는 기준 1가지를 제시하세요.",
  },
  {
    label: "반박·공방",
    directive: "2라운드입니다. 앞선 발언의 허점이나 근거 부족을 구체적으로 반박하고, 상대가 놓친 사실·수치를 제시하세요.",
  },
  {
    label: "조건·대안",
    directive: "3라운드입니다. 단순 반대는 그만두고, 내가 수용할 수 있는 조건 또는 대안(범위·일정·안전장치)을 구체적으로 제시하세요.",
  },
  {
    label: "쟁점 좁히기",
    directive: "4라운드 이후입니다. 남은 쟁점을 좁히세요. 동의하는 부분을 명시하고, 끝까지 반대하는 지점과 그 이유를 한 문장으로 압축하세요.",
  },
];

export function roundPhase(round: number): RoundPhase {
  if (round <= 1) return ROUND_PHASES[0];
  return ROUND_PHASES[Math.min(round - 1, ROUND_PHASES.length - 1)];
}
