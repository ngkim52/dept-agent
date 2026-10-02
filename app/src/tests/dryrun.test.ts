import { describe, it, expect, beforeEach, vi } from "vitest";
import { resetDb, withDept } from "./helpers";
import { runDryrunEvaluation, DRYRUN_CATEGORIES } from "@/lib/harness/dryrun";

// defaultAsk의 실제 부서장 호출을 가로채 추론 수준/빈 답변 처리를 검증한다.
const engineMock = vi.hoisted(() => ({ runPersonaAgent: vi.fn() }));
vi.mock("@/lib/agent/engine", () => ({
  retrieveDepartmentChunks: vi.fn(async () => []),
  runPersonaAgent: engineMock.runPersonaAgent,
}));

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

  it("판정 JSON에 콤마 누락·trailing comma가 있어도 관용 파싱 (500 방지)", async () => {
    const broken = [
      "{",
      '  "dimensions": [',
      '    {"key":"relevance","score":80,"reason":"적절"}',
      '    {"key":"groundedness","score":70,"reason":"근거 보통"},',
      '    {"key":"knowledge_gap","score":60,"reason":"일부 공백"},',
      '    {"key":"temporal","score":90,"reason":"시점 명확"},',
      '    {"key":"completeness","score":75,"reason":"완결"},',
      "  ],",
      '  "findings": [{"level":"info","text":"양호"}]',
      "}",
    ].join("\n");
    const r = await runDryrunEvaluation({ personaKey: "claims-planning", question: "q", ask: async () => ({ text: "a", retrieved: [] }), call: async () => broken });
    expect(r.dimensions.map((d) => d.score)).toEqual([80, 70, 60, 90, 75]);
  });

  it("판정 JSON이 잘려도 예외 없이 5개 차원 반환", async () => {
    const truncated = '{"dimensions":[{"key":"relevance","score":88,"reason":"좋음"},{"key":"groundedness","score":66';
    const r = await runDryrunEvaluation({ personaKey: "claims-planning", question: "q", ask: async () => ({ text: "a", retrieved: [] }), call: async () => truncated });
    expect(r.dimensions).toHaveLength(5);
    expect(r.dimensions[0].score).toBe(88);
    expect(r.dimensions[1].score).toBe(66);
  });

  it("JSON이 전혀 없으면 예외 대신 0점·경고 지적으로 저하", async () => {
    const r = await runDryrunEvaluation({ personaKey: "claims-planning", question: "q", ask: async () => ({ text: "a", retrieved: [] }), call: async () => "판정 결과를 텍스트로만 설명합니다." });
    expect(r.dimensions).toHaveLength(5);
    expect(r.dimensions.every((d) => d.score === 0)).toBe(true);
    expect(r.findings.length).toBeGreaterThan(0);
  });
});

describe("defaultAsk — 추론 수준과 빈 답변 처리", () => {
  it("thinkingLevel을 off로 두지 않는다 (추론 필수 모델의 400 'Reasoning is mandatory' 방지)", async () => {
    engineMock.runPersonaAgent.mockImplementation(async (_p: unknown, _q: unknown, _h: unknown, _c: unknown, cb: { onTextDelta: (d: string) => void }) => {
      cb.onTextDelta("답변 본문");
      return { text: "답변 본문", webCitations: [] };
    });
    const { defaultAsk } = await import("@/lib/harness/dryrun");
    const r = await defaultAsk("claims-planning", "질문");
    expect(r.text).toBe("답변 본문");
    const opts = engineMock.runPersonaAgent.mock.calls.at(-1)![5] as { thinkingLevel?: string };
    expect(opts.thinkingLevel).not.toBe("off");
  });

  it("에이전트가 빈 답변을 반환하면 조용히 통과하지 않고 오류로 알린다", async () => {
    engineMock.runPersonaAgent.mockImplementation(async () => ({ text: "", webCitations: [] }));
    const { defaultAsk } = await import("@/lib/harness/dryrun");
    await expect(defaultAsk("claims-planning", "질문")).rejects.toThrow(/빈 답변/);
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
