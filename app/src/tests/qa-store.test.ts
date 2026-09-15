import { describe, it, expect, afterAll } from "vitest";
import { db, schema } from "@/lib/db";
import { eq, like } from "drizzle-orm";
import { saveConsolidation, findConsolidatedAnswer, consolidateRecent } from "@/lib/chat/qaStore";

describe("멀티턴 통합 Q/A 저장·재사용", () => {
  afterAll(async () => {
    await db.delete(schema.qaConsolidations).where(like(schema.qaConsolidations.canonicalQuestion, "테스트%")).run();
  });

  it("verified 통합 답변을 저장하고 유사 질문에 재사용", async () => {
    const id = await saveConsolidation({
      canonicalQuestion: "테스트 실손 손해율 상승 원인은 무엇인가?",
      intent: "실손_손해율_상승원인",
      mergedAnswer: "# 통합 답변\n- 실손·상해 청구 건수 급증과 병원·설계사 연루 보험사기 증가가 원인입니다.\n- 목표 79.0% 대비 초과 상태입니다.",
      summary: "실손 손해율 상승 원인과 현황",
      entities: ["실손", "손해율"],
      turns: 3,
      confidence: 0.9,
    }, { status: "verified" });
    expect(id).toBeTruthy();

    const hit = await findConsolidatedAnswer("테스트 실손 손해율이 왜 높아진 원인?", 0.3);
    expect(hit).not.toBeNull();
    expect(hit!.answer).toContain("통합 답변");
  });

  it("무관 질문에는 통합 답변을 재사용하지 않는다", async () => {
    const hit = await findConsolidatedAnswer("고양이 사료 추천해줘", 0.35);
    // 로컬 매칭 없음 → null (RAGFlow 벡터는 무관해도 낮은 점수라 기본적으로 못 찾음)
    expect(hit).toBeNull();
  });
});
