import { describe, it, expect } from "vitest";
import { buildDashboardData } from "@/lib/dashboard/dashboardData";
import { buildReviewPrompt, parseReviews } from "@/lib/dashboard/sectionReview";
import { buildMonitorOpinionPrompt } from "@/lib/dashboard/monitorOpinions";

describe("부서장 의견 생성 — 실적 + RAG 지식 융합", () => {
  const dash = buildDashboardData();

  it("KPI/처리흐름 리뷰 프롬프트: RAG 참고 지식이 있으면 포함", () => {
    const p = buildReviewPrompt(dash, "손해율 83.1%로 목표(79%)를 4.1%p 초과함. 고위험군 심사강화 및 자동심사 확대가 필요함.");
    expect(p).toContain("[참고 지식(RAG)]");
    expect(p).toContain("손해율 83.1%");
    expect(p).toContain("구체적인 의견과 지시");
  });

  it("KPI/처리흐름 리뷰 프롬프트: RAG 참고 지식이 없으면 섹션 생략", () => {
    const p = buildReviewPrompt(dash, "");
    expect(p).not.toContain("[참고 지식(RAG)]");
    expect(p).toContain("핵심 KPI");
    expect(p).toContain("지급보험금 처리 흐름");
  });

  it("일감별 모니터링 프롬프트에도 실적 요약이 참고로 포함 가능", () => {
    const p = buildMonitorOpinionPrompt([], [{ date: "2026-09-18", title: "심사 회의" }], "지급 손해율: 83.1%");
    expect(p).toContain("[현재 실적(참고)]");
    expect(p).toContain("지급 손해율: 83.1%");
  });

  it("parseReviews: 부서장 말투 opinion 필드 추출", () => {
    const r = parseReviews(JSON.stringify({ reviews: [
      { key: "kpi", opinion: "여러분, 손해율이 83.1%로 목표를 크게 넘었습니다. 이번 주 안에 고위험군 심사강화를 바로 착수하세요.", summary: "손해율 초과", actions: ["심사강화 착수"] }
    ] }));
    expect(r).not.toBeNull();
    expect(r![0].opinion).toContain("여러분");
    expect(r![0].summary).toBe("손해율 초과");
  });
});
