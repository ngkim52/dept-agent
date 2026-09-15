import { describe, it, expect, beforeEach } from "vitest";
import { resetDb, withDept } from "./helpers";
import { runDryrunEvaluation, DRYRUN_CATEGORIES } from "@/lib/harness/dryrun";

beforeEach(async () => { await resetDb(); await withDept(); });

describe("드라이런 질문 은행 (업무별)", () => {
  it("업무별 카테고리를 반환 (보험금심사·배치·보고·부서운영 등)", () => {
    const keys = DRYRUN_CATEGORIES.map((c) => c.key);
    expect(keys).toContain("claims");
    expect(keys.length).toBeGreaterThanOrEqual(3);
    for (const c of DRYRUN_CATEGORIES) expect(c.questions.length).toBeGreaterThan(0);
  });
});

describe("runDryrunEvaluation — LLM-as-judge 드라이런 평가", () => {
  it("주입 ask/call로 평가 → 5개 차원·verdict·findings·latency 산출 (빠르고 결정적)", async () => {
    const judge = {
      dimensions: [
        { key: "relevance", score: 90, reason: "질문을 정확히 다룸" },
        { key: "groundedness", score: 45, reason: "출처 없는 단정" },
        { key: "knowledge_gap", score: 60, reason: "일부 공백" },
        { key: "temporal", score: 30, reason: "종료된 회의 이벤트를 현재로 오인" },
        { key: "completeness", score: 70, reason: "대체로 완결" },
      ],
      findings: [
        { level: "risk", text: "작년 결산 종료 사례를 현재 진행 중으로 설명함" },
        { level: "warn", text: "수치 근거 없이 단정함" },
      ],
    };
    const t0 = Date.now();
    const result = await runDryrunEvaluation({
      personaKey: "claims-planning",
      question: "작년 결산기 교훈을 올해 어떻게 반영하나요?",
      ask: async () => ({ text: "작년 결산 때 손해율이 올라 원인분석을 했고 지금도 개선 중입니다.", retrieved: ["참조1"] }),
      call: async () => JSON.stringify(judge),
    });
    expect(result.latencyMs).toBeLessThan(3000); // 오래 걸리지 않음
    expect(result.dimensions.length).toBe(5);
    expect(result.dimensions[0].key).toBe("relevance");
    expect(result.dimensions[3].key).toBe("temporal");
    expect(result.dimensions[3].score).toBe(30);
    expect(result.totalScore).toBe(Math.round((90 + 45 + 60 + 30 + 70) / 5));
    expect(result.verdict).toBe("위험");
    expect(result.findings.some((f) => f.level === "risk")).toBe(true);
    expect(result.answer).toContain("손해율");
  });

  it("낮은 점수면 '보완필요/위험', 높으면 '양호'", async () => {
    const good = async () => JSON.stringify({
      dimensions: DRYRUN_DIMENSIONS_GOOD(),
      findings: [],
    });
    const r = await runDryrunEvaluation({ personaKey: "claims-planning", question: "q", ask: async () => ({ text: "a", retrieved: [] }), call: good });
    expect(r.verdict).toBe("양호");
  });
});

function DRYRUN_DIMENSIONS_GOOD() {
  return [
    { key: "relevance", score: 95, reason: "좋음" },
    { key: "groundedness", score: 95, reason: "출처 명시" },
    { key: "knowledge_gap", score: 90, reason: "공백 없음" },
    { key: "temporal", score: 95, reason: "현재 시점 명확" },
    { key: "completeness", score: 90, reason: "완결" },
  ];
}
