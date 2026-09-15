import { describe, it, expect } from "vitest";
import {
  parseConsolidated, answerCoversTurns, similarityScore, findBestConsolidated,
  type ConsolidatedQA, type ChatTurn,
} from "@/lib/chat/consolidate";

const qa: ConsolidatedQA = {
  canonicalQuestion: "실손보험 손해율이 왜 상승하는지 원인은?",
  intent: "실손_손해율_상승원인",
  mergedAnswer: "# 실손 손해율 상승 원인\n- 청구 건수 급증 (실손·상해 증가)\n- 병원·설계사 연루 사기 의심 증가\n- 손해율 목표 79.0% 대비 +4.1%p 초과",
  summary: "실손 손해율은 청구 급증과 사기 의심 증가로 목표를 초과했다.",
  entities: ["실손보험", "손해율", "청구", "사기", "목표"],
  turns: 3,
  confidence: 0.9,
};

describe("통합 답변 파싱", () => {
  it("JSON만 추출해 파싱", () => {
    const parsed = parseConsolidated('```json\n{"canonicalQuestion":"질문","mergedAnswer":"답변 텍스트","intent":"i","entities":["a","b"],"confidence":0.8}\n```');
    expect(parsed?.canonicalQuestion).toBe("질문");
    expect(parsed?.mergedAnswer).toBe("답변 텍스트");
    expect(parsed?.confidence).toBe(0.8);
    expect(parsed?.entities).toEqual(["a", "b"]);
  });
  it("잘못된 입력이면 null", () => {
    expect(parseConsolidated("없음")).toBeNull();
  });
});

describe("검증(확인) — 답변이 원본 턴을 빠뜨리지 않는지", () => {
  const turns: ChatTurn[] = [
    { role: "user", content: "손해율 왜 높아?" },
    { role: "assistant", content: "실손 상해 보험 청구 건수 급증, 병원 설계사 연루 사기 의심 증가가 손해율 상승의 주된 원인입니다." },
    { role: "assistant", content: "그 결과 목표 손해율 대비 초과로 이어졌습니다." },
  ];
  it("핵심 사실을 모두 포함하면 true", () => {
    expect(answerCoversTurns(qa, turns)).toBe(true);
  });
  it("답변이 한 턴의 핵심을 빼면 false", () => {
    const partial: ConsolidatedQA = { ...qa, mergedAnswer: "# x\n- 청구 건수가 급증했습니다." };
    expect(answerCoversTurns(partial, turns)).toBe(false);
  });
});

describe("유사 질문 재검색 → 단일 답변 매칭", () => {
  const pool = [qa];
  it("유사 질문에 통합 답변 매칭", () => {
    const hit = findBestConsolidated("실손보험 손해율 상승 원인이 뭐야?", pool);
    expect(hit?.canonicalQuestion).toBe(qa.canonicalQuestion);
  });
  it("유사도 점수 범위", () => {
    expect(similarityScore("실손 손해율 상승 원인", qa.canonicalQuestion)).toBeGreaterThan(0.4);
    expect(similarityScore("고양이 사료 추천", qa.canonicalQuestion)).toBeLessThan(0.05);
  });
});
