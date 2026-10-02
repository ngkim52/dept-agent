import { describe, it, expect, beforeEach } from "vitest";
import { resetDb, withUser, withDept } from "./helpers";
import { createSession, getSession, listSessions, appendMessage, appendSystemMessage, listMessages, setSessionStatus, countMessages, isStopped, createCustomPersona, listAllPersonas, upsertPersona, resetPersona } from "@/lib/debate/store";

beforeEach(async () => { await resetDb(); await withDept(); });

async function mk(id = "s1") {
  const u = await withUser({ role: "user" });
  return createSession({ id, title: "신규 기획안", brief: "AI 자동심사 확대", durationSec: 180, participantKeys: ["critic", "optimist"], createdBy: u.id });
}

const critic = { key: "critic", name: "냉철한 비판가 에이전트", emoji: "🧊", color: "#3A3A3A", role: "리스크 비판", kind: "member" as const };

describe("debate store", () => {
  it("세션 생성/조회: 참가자 정보가 해석되어 내려온다", async () => {
    const s = await mk();
    expect(s.status).toBe("draft");
    expect(s.participants.map((p) => p.key)).toEqual(["critic", "optimist"]);
    expect(s.participants[0].name).toBe("냉철한 비판가 에이전트");
    expect(s.hasReport).toBe(false);
    const got = await getSession("s1");
    expect(got?.title).toBe("신규 기획안");
  });

  it("발언 append 는 seq 를 1부터 증가시킨다", async () => {
    await mk();
    const a = await appendMessage({ sessionId: "s1", persona: critic, content: "가정이 틀렸습니다.", round: 1 });
    const b = await appendMessage({ sessionId: "s1", persona: critic, content: "비용이 과소평가됐습니다.", round: 1 });
    expect(a.seq).toBe(1); expect(b.seq).toBe(2);
    expect((await listMessages("s1", 1)).map((m) => m.seq)).toEqual([2]);
    expect(await countMessages("s1")).toBe(2);
  });

  it("발언에 감정·만족도·입장·속마음이 함께 저장된다", async () => {
    await mk();
    const m = await appendMessage({
      sessionId: "s1", persona: critic, content: "조건이 필요합니다.", round: 1,
      state: { emotion: "우려", satisfaction: 42, stance: "조건부", innerThought: "이대로면 반대한다" },
    });
    expect(m.emotion).toBe("우려");
    expect(m.satisfaction).toBe(42);
    expect(m.stance).toBe("조건부");
    expect(m.innerThought).toBe("이대로면 반대한다");
    const again = (await listMessages("s1"))[0];
    expect(again.emotion).toBe("우려");
    expect(again.satisfaction).toBe(42);
  });

  it("상태를 주지 않은 발언은 빈 값으로 저장된다", async () => {
    await mk();
    const m = await appendMessage({ sessionId: "s1", persona: critic, content: "그냥 발언", round: 1 });
    expect(m.emotion).toBe("");
    expect(m.satisfaction).toBeNull();
    expect(m.stance).toBe("");
    expect(m.innerThought).toBe("");
  });

  it("상태 전환/시스템 메시지/중단 판정", async () => {
    await mk();
    await setSessionStatus("s1", "running", { startedAt: new Date() });
    let s = (await listSessions())[0];
    expect(s.status).toBe("running");
    expect(s.startedAt).not.toBeNull();
    expect(await isStopped("s1")).toBe(false);
    const sys = await appendSystemMessage("s1", "토론을 시작합니다.");
    expect(sys.kind).toBe("system");
    await setSessionStatus("s1", "stopped");
    expect(await isStopped("s1")).toBe(true);
  });

  it("커스텀 페르소나가 기본 목록 뒤에 추가된다", async () => {
    const u = await withUser({ role: "user" });
    await createCustomPersona({ name: "고객대표", role: "고객 관점", stance: "고객 불편 최소화", expertise: "민원 사례", goal: "고객 불편 최소화", redLine: "고객 비용 전가", tone: "따박따박", createdBy: u.id });
    const all = await listAllPersonas();
    expect(all.length).toBe(11);
    const custom = all.find((p) => p.name === "고객대표");
    expect(custom?.builtin).toBe(false);
    expect(custom?.key.startsWith("custom-")).toBe(true);
    expect(custom?.systemPrompt).toContain("고객 불편 최소화");
  });

  it("기본 페르소나를 수정하면 목록에 반영되고, 되돌리면 기본값으로 복원된다", async () => {
    const before = (await listAllPersonas()).find((p) => p.key === "critic")!;
    expect(before.overridden).toBe(false);
    expect(before.name).toBe("냉철한 비판가 에이전트");

    await upsertPersona({
      key: "critic", name: "매출 지킴이", emoji: "🐯", role: "영업지원팀",
      stance: "매출이 줄면 안 된다", expertise: "채널 실적", goal: "무리한 기준 변경 저지", redLine: "영업 현장 무시", tone: "직설적",
    });
    const edited = (await listAllPersonas()).find((p) => p.key === "critic")!;
    expect(edited.overridden).toBe(true);
    expect(edited.name).toBe("매출 지킴이");
    expect(edited.role).toBe("영업지원팀");
    expect(edited.builtin).toBe(true);         // 기본 페르소나 자리를 유지한다
    expect(edited.systemPrompt).toContain("매출이 줄면 안 된다");
    expect(edited.systemPrompt).toContain("영업지원팀");

    await resetPersona("critic");
    const restored = (await listAllPersonas()).find((p) => p.key === "critic")!;
    expect(restored.name).toBe("냉철한 비판가 에이전트");
    expect(restored.overridden).toBe(false);
  });

  it("수정한 기본 페르소나가 세션 참가자 정보에도 반영된다", async () => {
    await upsertPersona({ key: "optimist", name: "성장 드라이버", role: "전략팀", stance: "s", expertise: "e", goal: "g", redLine: "r", tone: "t" });
    await createSession({ id: "sp", title: "T", brief: "", durationSec: 60, participantKeys: ["optimist", "critic"], createdBy: null });
    const s = await getSession("sp");
    expect(s?.participants.find((p) => p.key === "optimist")?.name).toBe("성장 드라이버");
  });
});
