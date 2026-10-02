import { describe, it, expect, beforeEach, vi } from "vitest";
import { resetDb } from "./helpers";
import { createSession, getSession, listMessages, setSessionStatus, upsertPersona } from "@/lib/debate/store";
import { pickNextSpeaker, speakingOrder, buildTurnPrompt, buildSynthesisPrompt, runDebate, concludeDebate, parseTurnOutput } from "@/lib/debate/engine";
import { getDebatePersona } from "@/lib/debate/personas";
import { readDebateReportMd } from "@/lib/debate/storage";

const P = (k: string) => getDebatePersona(k)!;

beforeEach(async () => { await resetDb(); });

const SYNTH = JSON.stringify({
  verdict: "조건부 추진", summary: "요약입니다.", agreements: ["a1"], disputes: [{ issue: "비용", pro: "p", con: "c" }],
  risks: ["r1"], actions: [{ what: "파일럿", owner: "보험금기획", due: "2주" }], positions: [{ persona: "비판가", keyPoint: "가정 부족" }],
});
const isSynthPrompt = (p: string) => p.includes("최종 결론 에이전트") && p.includes("verdict");

describe("발언 순서", () => {
  it("옵저버가 먼저, 이후 일반 멤버 순서를 유지한다", () => {
    expect(speakingOrder([P("claims-planning-lead"), P("fss"), P("critic")]).map((p) => p.key))
      .toEqual(["fss", "claims-planning-lead", "critic"]);
  });

  it("한 바퀴 돌면 라운드가 증가한다", () => {
    const parts = [P("critic"), P("optimist")];
    expect(pickNextSpeaker({ participants: parts, turnIndex: 0, round: 1 }).persona.key).toBe("critic");
    expect(pickNextSpeaker({ participants: parts, turnIndex: 1, round: 1 }).persona.key).toBe("optimist");
    const third = pickNextSpeaker({ participants: parts, turnIndex: 2, round: 1 });
    expect(third.persona.key).toBe("critic");
    expect(third.round).toBe(2);
  });
});

describe("프롬프트", () => {
  const session = {
    id: "s1", title: "AI 자동심사 확대", brief: "300만원 이하 자동심사 확대 검토", status: "running", durationSec: 180,
    participantKeys: [], participants: [], round: 1, turnCount: 1, maxTurns: 80, verdict: null, reportPath: null, hasReport: false,
    createdBy: null, startedAt: null, endedAt: null, createdAt: "2026-10-01T00:00:00.000Z", updatedAt: "2026-10-01T00:00:00.000Z",
  } as any;
  const transcript = [{
    id: "m1", sessionId: "s1", seq: 1, personaKey: "critic", personaName: "냉철한 비판가 에이전트", personaEmoji: "🧊",
    personaColor: "#333", kind: "member" as const, round: 1, content: "가정이 약합니다",
    emotion: "우려" as const, satisfaction: 40, stance: "조건부" as const, innerThought: "근거가 약하다",
    createdAt: "2026-10-01T00:00:00.000Z",
  }];

  it("발언 프롬프트에 안건·페르소나·직전 발언·남은 시간이 들어간다", () => {
    const prompt = buildTurnPrompt({ session, persona: P("optimist"), transcript, round: 1, remainingSec: 120 });
    expect(prompt).toContain("AI 자동심사 확대");
    expect(prompt).toContain("긍정적 에이전트");
    expect(prompt).toContain("가정이 약합니다");
    expect(prompt).toContain("남은 토론 시간: 120초");
  });

  it("라운드 단계 지침이 프롬프트에 들어간다", () => {
    expect(buildTurnPrompt({ session, persona: P("optimist"), transcript, round: 1, remainingSec: 100 })).toContain("입장 개진");
    expect(buildTurnPrompt({ session, persona: P("optimist"), transcript, round: 2, remainingSec: 100 })).toContain("반박·공방");
    expect(buildTurnPrompt({ session, persona: P("optimist"), transcript, round: 3, remainingSec: 100 })).toContain("조건·대안");
    expect(buildTurnPrompt({ session, persona: P("optimist"), transcript, round: 5, remainingSec: 100 })).toContain("쟁점 좁히기");
  });

  it("직전 발언자를 지목하라고 지시한다", () => {
    const prompt = buildTurnPrompt({ session, persona: P("optimist"), transcript, round: 1, remainingSec: 100 });
    expect(prompt).toContain("냉철한 비판가 에이전트");
    expect(prompt).toContain("반복하면 감점");
  });

  it("수정된 페르소나 프롬프트가 실제 발언에 쓰인다", async () => {
    await upsertPersona({ key: "critic", name: "원가 지킴이", role: "원가팀", stance: "비용 우선", expertise: "원가 구조", goal: "예산 방어", redLine: "무근거 증액", tone: "건조" });
    await createSession({ id: "s-edit", title: "T", brief: "B", durationSec: 3, participantKeys: ["critic", "optimist"], createdBy: null });
    const prompts: string[] = [];
    let clock = 0;
    const call = vi.fn(async (p: string) => { prompts.push(p); return isSynthPrompt(p) ? SYNTH : "발언"; });
    await runDebate("s-edit", { call, now: () => clock, sleep: async (ms) => { clock += ms; } });
    const turnPrompt = prompts.find((p) => !isSynthPrompt(p))!;
    expect(turnPrompt).toContain("원가 지킴이");
    expect(turnPrompt).toContain("원가 구조");
  });

  it("턴마다 마무리 방식과 문장 리듬이 달라진다(같은 패턴 반복 방지)", () => {
    const a = buildTurnPrompt({ session, persona: P("optimist"), transcript, round: 1, remainingSec: 100 });
    const b = buildTurnPrompt({ session, persona: P("optimist"), transcript: [...transcript, { ...transcript[0], seq: 2, id: "m2", content: "두번째" }], round: 1, remainingSec: 100 });
    expect(a).toContain("[이번 턴 마무리]");
    expect(a).toContain("[문장 리듬]");
    expect(a).toMatch(/마무리\] (질문|단정|조건 제시|사실 지적|대안 제안|감정 토로)/);
    // 발언 순번이 다르면 마무리 방식이 달라진다
    const closingOf = (p: string) =>
      (p.split("\n").find((l) => l.startsWith("[이번 턴 마무리] ")) ?? "").replace("[이번 턴 마무리] ", "").split(" —")[0];
    expect(closingOf(a)).not.toBe(closingOf(b));
    // 상투적 질문 남발 금지 + JSON 출력 형식 안내
    expect(a).toContain("상투적 질문으로 매번 끝내면 안 된다");
    expect(a).toContain("innerThought");
    expect(a).toContain("satisfaction");
  });

  it("결론 프롬프트에 전체 로그와 필드 설명이 들어간다", () => {
    const prompt = buildSynthesisPrompt(session, transcript);
    expect(prompt).toContain("최종 결론 에이전트");
    expect(prompt).toContain("가정이 약합니다");
    expect(prompt).toContain("verdict");
    expect(prompt).toContain("actions");
  });
});

describe("runDebate", () => {
  it("시간이 지나면 종료하고 최종 보고서를 만든다", async () => {
    await createSession({ id: "s-run", title: "자동심사 확대", brief: "B", durationSec: 30, participantKeys: ["critic", "optimist"], createdBy: null });
    let clock = 0;
    const call = vi.fn(async (p: string) => (isSynthPrompt(p) ? SYNTH : "발언입니다"));
    const res = await runDebate("s-run", { call, now: () => clock, sleep: async (ms) => { clock += ms; } });

    expect(res.status).toBe("finished");
    expect(res.turns).toBeGreaterThan(0);
    const s = await getSession("s-run");
    expect(s?.status).toBe("finished");
    expect(s?.verdict).toBe("조건부 추진");
    expect(s?.hasReport).toBe(true);
    expect(s?.endedAt).not.toBeNull();
    const md = (await readDebateReportMd("s-run")) ?? "";
    expect(md).toContain("# 토론 최종 보고서");
    expect(md).toContain("발언:");
    expect(md).not.toContain("~ -"); // 종료 시각이 비어 있으면 안 된다
  });

  it("발언은 라운드 로빈으로 순서대로 저장되고 시스템 안내가 앞에 붙는다", async () => {
    await createSession({ id: "s-order", title: "T", brief: "B", durationSec: 3, participantKeys: ["critic", "optimist"], createdBy: null });
    let clock = 0;
    const call = vi.fn(async (p: string) => (isSynthPrompt(p) ? SYNTH : "발언"));
    await runDebate("s-order", { call, now: () => clock, sleep: async (ms) => { clock += ms; } });
    const msgs = await listMessages("s-order", 0);
    expect(msgs[0].kind).toBe("system");
    const speakers = msgs.filter((m) => m.kind === "member").map((m) => m.personaKey);
    expect(speakers.slice(0, 4)).toEqual(["critic", "optimist", "critic", "optimist"]);
  });

  it("라운드는 참가자 수만큼 발언할 때마다 1씩만 증가한다", async () => {
    await createSession({ id: "s-round", title: "T", brief: "B", durationSec: 600, maxTurns: 5, participantKeys: ["critic", "optimist"], createdBy: null });
    const call = vi.fn(async (p: string) => (isSynthPrompt(p) ? SYNTH : "발언"));
    await runDebate("s-round", { call, now: () => 0, sleep: async () => {} });
    const msgs = await listMessages("s-round", 0);
    expect(msgs.filter((m) => m.kind === "member").map((m) => m.round)).toEqual([1, 1, 2, 2, 3]);
    expect((await getSession("s-round"))?.round).toBe(3);
  });

  it("중단 요청이 있으면 즉시 멈추고 보고서를 만든다", async () => {
    await createSession({ id: "s-stop", title: "T", brief: "B", durationSec: 600, participantKeys: ["critic", "optimist"], createdBy: null });
    let calls = 0;
    const call = vi.fn(async (p: string) => {
      if (isSynthPrompt(p)) return SYNTH;
      calls++;
      if (calls === 2) await setSessionStatus("s-stop", "stopped");
      return "발언";
    });
    const res = await runDebate("s-stop", { call, now: () => 0, sleep: async () => {} });
    expect(res.status).toBe("stopped");
    const s = await getSession("s-stop");
    expect(s?.status).toBe("stopped");
    expect(s?.hasReport).toBe(true);
  });

  it("연속 모델 오류가 3회면 종료하고 보고서를 만든다", async () => {
    await createSession({ id: "s-err", title: "T", brief: "B", durationSec: 600, participantKeys: ["critic", "optimist"], createdBy: null });
    const call = vi.fn(async (p: string) => {
      if (isSynthPrompt(p)) return SYNTH;
      throw new Error("model down");
    });
    const res = await runDebate("s-err", { call, now: () => 0, sleep: async () => {} });
    expect(res.turns).toBe(0);
    expect((await getSession("s-err"))?.hasReport).toBe(true);
  });

  it("참가자가 2명 미만이면 거부한다", async () => {
    await createSession({ id: "s-one", title: "T", brief: "B", durationSec: 30, participantKeys: ["critic"], createdBy: null });
    await expect(runDebate("s-one", { call: async () => "x", now: () => 0, sleep: async () => {} })).rejects.toThrow(/2명 이상/);
  });
});

describe("parseTurnOutput", () => {
  it("speech + 감정/만족도/입장/속마음을 파싱한다", () => {
    const out = parseTurnOutput('{"speech":"근거가 부족합니다.","emotion":"우려","satisfaction":35,"stance":"조건부","innerThought":"이대로면 반대할 생각이다"}');
    expect(out.speech).toBe("근거가 부족합니다.");
    expect(out.emotion).toBe("우려");
    expect(out.satisfaction).toBe(35);
    expect(out.stance).toBe("조건부");
    expect(out.innerThought).toBe("이대로면 반대할 생각이다");
  });

  it("잘린 JSON 도 복원하고, 범위를 벗어난 값은 정규화한다", () => {
    const out = parseTurnOutput('{"speech":"일부만","emotion":"짜증","satisfaction":180,"stance":"몰라"');
    expect(out.speech).toBe("일부만");
    expect(out.emotion).toBe("");          // 허용 목록 밖
    expect(out.satisfaction).toBe(100);    // 0~100 클램프
    expect(out.stance).toBe("");
  });

  it("JSON 이 아니면 전체 텍스트를 발언문으로 쓰고 상태는 비운다", () => {
    const out = parseTurnOutput("그냥 발언문입니다");
    expect(out.speech).toBe("그냥 발언문입니다");
    expect(out.emotion).toBe("");
    expect(out.satisfaction).toBeNull();
    expect(out.innerThought).toBe("");
  });
});

describe("concludeDebate", () => {
  it("합성 JSON 을 해석해 판정·경로를 세션에 기록한다", async () => {
    await createSession({ id: "s-conc", title: "T", brief: "B", durationSec: 30, participantKeys: ["critic", "optimist"], createdBy: null });
    const { reportPath, synthesis } = await concludeDebate("s-conc", { call: async () => SYNTH });
    expect(synthesis.verdict).toBe("조건부 추진");
    expect(reportPath).toContain("s-conc");
    const s = await getSession("s-conc");
    expect(s?.verdict).toBe("조건부 추진");
    expect(s?.reportPath).toBe(reportPath);
    const msgs = await listMessages("s-conc", 0);
    expect(msgs[msgs.length - 1].kind).toBe("conclusion");
  });

  it("합성 응답이 망가져도 fallback 으로 보고서를 만든다", async () => {
    await createSession({ id: "s-fb", title: "T", brief: "B", durationSec: 30, participantKeys: ["critic", "optimist"], createdBy: null });
    const { synthesis } = await concludeDebate("s-fb", { call: async () => "JSON 아님" });
    expect(synthesis.verdict).toContain("보류");
    expect(await readDebateReportMd("s-fb")).toContain("# 토론 최종 보고서");
  });
});
