import { describe, it, expect } from "vitest";
import { buildDebateReportMarkdown, parseSynthesis, fallbackSynthesis, buildRoundFlow, REPORT_SECTIONS } from "@/lib/debate/report";
import { saveDebateReportMd, readDebateReportMd, debateReportPath } from "@/lib/debate/storage";

const session = {
  id: "s1", title: "AI 자동심사 확대", brief: "300만원 이하 청구 자동심사 확대", attachmentName: "기획안.docx", status: "finished", durationSec: 180,
  participantKeys: ["critic", "optimist"],
  participants: [
    { key: "critic", name: "냉철한 비판가 에이전트", emoji: "🧊", color: "#3A3A3A", role: "리스크 비판", kind: "member" },
    { key: "optimist", name: "긍정적 에이전트", emoji: "🌤", color: "#B07A16", role: "기회 탐색", kind: "member" },
  ],
  round: 3, turnCount: 12, maxTurns: 80, verdict: "조건부 추진", reportPath: null, hasReport: false,
  createdBy: "u1", startedAt: "2026-10-01T00:00:00.000Z", endedAt: "2026-10-01T00:03:00.000Z",
  createdAt: "2026-10-01T00:00:00.000Z", updatedAt: "2026-10-01T00:03:00.000Z",
} as any;

const msg = (seq: number, name: string, content: string, round = 1) => ({
  id: "m" + seq, sessionId: "s1", seq, personaKey: "critic", personaName: name, personaEmoji: "🧊",
  personaColor: "#333", kind: "member" as const, round, content,
  emotion: "중립" as const, satisfaction: 50, stance: "유보" as const, innerThought: "지켜보는 중",
  createdAt: "2026-10-01T00:00:00.000Z",
});

const SYNTH = {
  verdict: "조건부 추진", summary: "요약", roundFlow: [],
  agreements: ["A"], conditions: ["파일럿 3개월 후 재평가하면 수용"],
  disputes: [{ issue: "비용", pro: "찬성측", con: "반대측" }], risks: ["리스크1"],
  actions: [{ what: "파일럿", owner: "보험금기획", due: "2주" }],
  positions: [{ persona: "비판가", stance: "조건부", keyPoint: "가정 부족" }],
  openQuestions: ["손실 보전 한도는?"], decisionBasis: ["금감원 제재 사례"],
};

describe("최종 보고서 MD", () => {
  it("필수 섹션을 모두 포함한다", () => {
    const md = buildDebateReportMarkdown({ session, messages: [msg(1, "비판가", "가정이 약하다")], synthesis: SYNTH });
    for (const h of REPORT_SECTIONS) expect(md).toContain(h);
    expect(md).toContain("# 토론 최종 보고서");
    expect(md).toContain("조건부 추진");
    expect(md).toContain("| 비용 | 찬성측 | 반대측 |");
    expect(md).toContain("| 파일럿 | 보험금기획 | 2주 |");
    expect(md).toContain("파일럿 3개월 후 재평가하면 수용");
    expect(md).toContain("손실 보전 한도는?");
    expect(md).toContain("기획안 요약");           // 첨부/브리프 요약
  });

  it("발언 로그는 넣지 않는다(관전 탭에서 확인)", () => {
    const md = buildDebateReportMarkdown({ session, messages: [msg(1, "비판가", "가정이 약하다")], synthesis: SYNTH });
    expect(md).not.toContain("발언 로그");
    expect(md).not.toContain("`#1`");                 // 로그 형식(`#seq`)이 없어야 한다
    expect(md.match(/\*\*비판가\*\*: 가정이 약하다/)).toBeNull();  // 발언 원문 나열 없음
    for (const h of REPORT_SECTIONS) expect(md).toContain(h);
    expect(md).toContain("## 부록 A. 참가자 감정·속마음");
  });

  it("합성에 roundFlow 가 없으면 발언 로그에서 라운드 흐름을 만든다", () => {
    const msgs = [msg(1, "A", "1라 발언", 1), msg(2, "B", "2라 발언", 2)];
    const flow = buildRoundFlow(msgs);
    expect(flow.map((f) => f.round)).toEqual([1, 2]);
    expect(flow[0].label).toBe("입장 개진");
    expect(flow[1].label).toBe("반박·공방");
    const md = buildDebateReportMarkdown({ session, messages: msgs, synthesis: { ...SYNTH, roundFlow: [] } });
    expect(md).toContain("R1 (입장 개진)");
    expect(md).toContain("R2 (반박·공방)");
  });

  it("내용이 비어도 섹션/안내문은 유지된다", () => {
    const md = buildDebateReportMarkdown({ session, messages: [], synthesis: { verdict: "보류", summary: "", roundFlow: [], agreements: [], conditions: [], disputes: [], risks: [], actions: [], positions: [], openQuestions: [], decisionBasis: [] } });
    expect(md).toContain("명시적 합의 사항은 없습니다.");
    expect(md).toContain("(감정 기록 없음)");
  });

  it("parseSynthesis 는 코드블록/잘린 JSON 도 복원하고 새 필드를 채운다", () => {
    const raw = '설명\n```json\n{"verdict":"보류","summary":"s","conditions":["c1"],"openQuestions":["q1"],"decisionBasis":["d1"],"positions":[{"persona":"x","stance":"찬성","keyPoint":"k"';
    const j = parseSynthesis(raw);
    expect(j?.verdict).toBe("보류");
    expect(j?.conditions).toEqual(["c1"]);
    expect(j?.openQuestions).toEqual(["q1"]);
    expect(j?.positions[0]).toEqual({ persona: "x", stance: "찬성", keyPoint: "k" });
  });

  it("parseSynthesis 는 JSON 이 없거나 빈 객체면 null", () => {
    expect(parseSynthesis("그냥 텍스트")).toBeNull();
    expect(parseSynthesis("{}")).toBeNull();
  });

  it("fallbackSynthesis 는 새 필드를 빈 값으로 채운다", () => {
    const s = fallbackSynthesis(session, [msg(1, "비판가", "가정이 약하다")]);
    expect(s.positions[0].persona).toBe("비판가");
    expect(s.conditions).toEqual([]);
    expect(s.openQuestions).toEqual([]);
    expect(s.summary.length).toBeGreaterThan(10);
  });

  it("부록 A 에 참가자 감정·속마음 표를 넣는다", () => {
    const md = buildDebateReportMarkdown({ session, messages: [msg(1, "비판가", "가정이 약하다")], synthesis: SYNTH });
    expect(md).toContain("## 부록 A. 참가자 감정·속마음");
    expect(md).toContain("| 참가자 | 최종 입장 | 만족도 변화 | 감정 흐름 | 마지막 속마음 |");
    expect(md).toContain("| 비판가 | 유보 | 50 | 중립 | 지켜보는 중 |");
  });

  it("파일 저장/읽기 왕복", async () => {
    const p = await saveDebateReportMd("sess-test", "# 제목\n본문");
    expect(p).toBe(debateReportPath("sess-test"));
    expect(await readDebateReportMd("sess-test")).toContain("# 제목");
    expect(await readDebateReportMd("no-such-session")).toBeNull();
  });
});
