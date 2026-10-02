// 토론 말투 다양화 — 턴마다 마무리 방식을 바꿔 "…할 의향이 있습니까?" 같은 동일 패턴 반복을 막는다 (019 v3)
export type ClosingStyle = { label: string; hint: string };

export const CLOSING_STYLES: ClosingStyle[] = [
  { label: "질문", hint: "상대 1명에게 구체적인 질문으로 끝낸다. 단 '~할 의향이 있습니까?' 같은 상투적 표현은 쓰지 말고, 답할 수 있는 사실을 물어라." },
  { label: "단정", hint: "질문 없이 내 결론을 한 문장으로 단정하며 끝낸다. 예: '이 조건이 빠지면 저는 반대합니다.'" },
  { label: "조건 제시", hint: "'~한다면 수용하겠습니다' 형태로 내가 요구하는 조건을 한 문장으로 못 박으며 끝낸다." },
  { label: "사실 지적", hint: "앞선 주장에서 확인되지 않은 수치·가정을 짚고, 확인이 필요한 항목을 담담히 나열하며 끝낸다." },
  { label: "대안 제안", hint: "범위·일정·안전장치 중 하나를 골라 구체적인 대안을 제안하며 끝낸다." },
  { label: "감정 토로", hint: "지금 내가 느끼는 우려나 답답함을 솔직하게 한 문장으로 표현하며 끝낸다. 단 상대를 인신공격하지 않는다." },
];

/** 발언 순번으로 마무리 방식을 순환 배정(같은 방식이 연속되지 않게) */
export function closingStyleFor(turnSeq: number): ClosingStyle {
  return CLOSING_STYLES[Math.abs(turnSeq) % CLOSING_STYLES.length];
}

/** 발언 리듬 — 문장 길이와 어투를 턴마다 바꾼다 */
export const RHYTHM_HINTS = [
  "짧게 끊어 말하듯 3문장 이내로.",
  "한 번은 단호하게, 한 번은 완곡하게 섞어서.",
  "숫자를 앞세워 건조하게.",
  "현장 사례를 하나 들어가며 구어체로.",
  "질문을 던지듯 다소 도전적으로.",
];

export function rhythmHintFor(turnSeq: number): string {
  return RHYTHM_HINTS[Math.abs(turnSeq) % RHYTHM_HINTS.length];
}
