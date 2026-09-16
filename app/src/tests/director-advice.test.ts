import { describe, it, expect } from "vitest";
import { buildDirectorAdvicePrompt, generateDirectorAdvice, DIRECTOR_ADVICE_HEADING } from "@/lib/chat/directorAdvice";

describe("채팅 부장님 의견", () => {
  it("프롬프트에 질문·RAG 지식·일정이 포함된다", () => {
    const prompt = buildDirectorAdvicePrompt(
      { question: "신규 보험상품 손해율 리스크를 어떻게 검토하나요?", ragContent: "역선택 리스크는 고위험군 심사강화로 관리합니다." },
      "2026-09-18 14:00 - 심사 회의"
    );
    expect(prompt).toContain("신규 보험상품");
    expect(prompt).toContain("역선택 리스크");
    expect(prompt).toContain("2026-09-18");
    expect(prompt).toContain("일감");
  });

  it("generateDirectorAdvice: call 주입 시 결과를 정리해 반환", async () => {
    const opinion = await generateDirectorAdvice(
      { question: "손해율이 목표를 넘었어요." },
      { call: async () => "여러분, 이번 손해율 83.1%는 목표를 크게 넘었습니다. 관련자들과 회의를 잡고 개선안을 일감으로 등록해 바로 진행하세요.\n" }
    );
    expect(opinion).toContain("여러분");
    expect(opinion).toContain("일감");
  });
});

describe("부장님 의견 헤더 상수", () => {
  it("route.ts에서 사용하는 헤더 문자열 보장", () => {
    expect(DIRECTOR_ADVICE_HEADING).toContain("부장님 의견");
  });
});
