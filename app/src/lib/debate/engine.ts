// 토론방 엔진 — 발언 순서/프롬프트/턴 루프/결론 생성 (019)
import { CONCLUSION_PERSONA_KEY } from "./personas";
import { roundPhase } from "./rounds";
import { closingStyleFor, rhythmHintFor } from "./style";
import { appendMessage, appendSystemMessage, getSession, isStopped, listAllPersonas, listMessages, setSessionStatus, updateProgressIfRunning, updateSession } from "./store";
import { buildDebateReportMarkdown, buildRoundFlow, fallbackSynthesis, parseSynthesis } from "./report";
import { saveDebateReportMd } from "./storage";
import { resolvePersonaModel } from "./models";
import type { DebateMessage, DebateParticipant, DebatePersona, DebateSession, DebateStatus, DebateSynthesis } from "./types";
import { parseJsonLoose } from "@/lib/util/jsonLoose";

/** 발언 사이 지연 — 메신저처럼 순차 등장 (테스트에서는 sleep 주입으로 즉시) */
export const TURN_DELAY_MS = 900;
/** 컨텍스트로 넘길 최근 발언 수 (토큰 보호) */
export const TRANSCRIPT_LIMIT = 18;
/** 연속 실패 허용 횟수 */
export const MAX_CONSECUTIVE_ERRORS = 3;

export function toParticipant(p: DebatePersona): DebateParticipant {
  return { key: p.key, name: p.name, emoji: p.emoji, color: p.color, role: p.role, kind: p.kind };
}

/** 발언 순서 — 옵저버(금감원 등)를 라운드 첫 발언으로, 이후 일반 멤버 순서 유지 */
export function speakingOrder(participants: DebatePersona[]): DebatePersona[] {
  const observers = participants.filter((p) => p.kind === "observer");
  const members = participants.filter((p) => p.kind !== "observer");
  return [...observers, ...members];
}

/**
 * turnIndex 기준 다음 발언자와 라운드 계산 (전원 1회 발언 = 1라운드).
 * 주의: round 는 "기준 라운드"이며 보통 1을 넘긴다. 반환값을 다시 기준으로 넣으면 라운드가 누적돼
 * 부풀려지므로(예: 7명일 때 9턴에 R3 이 아니라 R2), 호출부는 항상 기준값을 고정해 사용한다.
 */
export function pickNextSpeaker(input: { participants: DebatePersona[]; turnIndex: number; round: number }): { persona: DebatePersona; round: number } {
  const order = speakingOrder(input.participants);
  const persona = order[input.turnIndex % order.length];
  const round = input.round + Math.floor(input.turnIndex / order.length);
  return { persona, round };
}

/** turnIndex 기준 라운드 (기준 라운드 1 고정) */
export function roundOfTurn(turnIndex: number, participantCount: number): number {
  return 1 + Math.floor(turnIndex / Math.max(1, participantCount));
}

/** 발언 1건 프롬프트 — 안건·기획안·라운드 단계·직전 발언·남은 시간 */
export function buildTurnPrompt(input: { session: DebateSession; persona: DebatePersona; transcript: DebateMessage[]; round: number; remainingSec: number }): string {
  const spoken = input.transcript.filter((m) => m.kind !== "system");
  const recent = spoken.slice(-TRANSCRIPT_LIMIT)
    .map((m) => `[${m.seq}] ${m.personaName}: ${m.content}`)
    .join("\n") || "(아직 발언 없음 — 첫 발언입니다)";
  const lastSpeaker = [...spoken].reverse().find((m) => m.personaKey !== input.persona.key);
  const phase = roundPhase(input.round);
  const elapsedTurns = spoken.length;
  const closing = closingStyleFor(elapsedTurns);
  const recentEndings = [...spoken].slice(-3).map((m) => `"${m.content.replace(/\s+/g, " ").slice(-24)}"`).join(" / ");
  return `${input.persona.systemPrompt}

[토론 안건] ${input.session.title}
[기획안/배경] ${input.session.brief || "(별도 배경 없음)"}
[라운드] ${input.round} — ${phase.label}  [남은 토론 시간: ${input.remainingSec}초]  [지금까지 ${elapsedTurns}발언]

[이번 발언 지침]
${phase.directive}
${lastSpeaker ? `- 반드시 "${lastSpeaker.personaName}"의 발언 중 하나를 지목해 반응하세요.` : "- 첫 발언이므로 다른 참가자가 놓칠 기준을 제시하세요."}
- 앞서 나온 주장을 반복하면 감점입니다. 반드시 이전에 없던 근거(수치·규정·사례)를 추가하세요.
[이번 턴 마무리] ${closing.label} — ${closing.hint}
[문장 리듬] ${rhythmHintFor(elapsedTurns)}
${recentEndings ? `- 직전 발언들의 끝맺음: ${recentEndings} — 이와 비슷한 마무리는 피하세요.` : ""}

[감정·입장 자기평가]
- emotion: 지금 내 감정 (기대/만족/중립/우려/불만/단호)
- satisfaction: 이 안건에 대한 현재 수용도 0~100 (논의가 진행되며 변하면 반영)
- stance: 현재 입장 (찬성/조건부/반대/유보)
- innerThought: 발언에는 드러내지 않은 속마음 한 문장

[지금까지의 발언]
${recent}

위 흐름을 읽고 ${input.persona.name}(${input.persona.role})으로서 다음 발언을 하세요.

반드시 아래 항목을 가진 JSON 객체 하나만, 마크다운·설명 없이 출력하세요:
- speech: 문자열 (실제 발언문. 위 말투·마무리 지침을 따른다)
- emotion: "기대"|"만족"|"중립"|"우려"|"불만"|"단호" 중 하나
- satisfaction: 0~100 정수
- stance: "찬성"|"조건부"|"반대"|"유보" 중 하나
- innerThought: 문자열 한 문장 (상대에게 말하지 않은 속마음)`;
}

/** 최종 결론 프롬프트 — 전체 로그 → 합성 JSON */
export function buildSynthesisPrompt(session: DebateSession, messages: DebateMessage[]): string {
  const log = messages.filter((m) => m.kind !== "system")
    .map((m) => `[${m.seq}] (${m.personaName}) ${m.content}`)
    .join("\n") || "(발언 없음)";
  return `당신은 이 토론의 최종 결론 에이전트입니다. 아래 전체 발언을 읽고 결과를 정리하세요.

[안건] ${session.title}
[배경/기획안] ${session.brief || "(없음)"}

[전체 발언]
${log}

작성 규칙:
- 발언에 없는 사실·수치를 지어내지 마세요. 모든 정리는 실제 발언에 근거해야 합니다.
- 합의된 것 / 조건부 합의 / 아직 쟁점인 것을 구분하세요. 합의되지 않은 것을 합의로 포장하면 안 됩니다.
- 반대 의견이 끝까지 남았다면 risks 가 아니라 disputes 와 openQuestions 에 남기세요.
- summary 에는 (1) 무엇으로 합의됐는지 (2) 무엇이 막혔는지 (3) 그래서 무엇을 하기로 했는지가 들어가야 합니다.
- 권고 액션은 담당(owner)과 기한(due)을 붙여 실행 가능하게 쓰세요. 담당은 참가자 역할명으로 쓰세요.
- 판정(verdict)은 "추진 / 조건부 추진 / 보류 / 중단" 중 하나로 명확히 쓰세요.

반드시 아래 항목을 가진 JSON 객체 하나만, 마크다운·설명 없이 출력하세요:
- verdict: 문자열 (한 줄 판정)
- summary: 문자열 (4~6문장 결론 요약)
- agreements: 문자열 배열 (조건 없이 합의된 사항)
- conditions: 문자열 배열 (조건부 합의 — "~하면 수용" 형태)
- disputes: 배열. 각 원소는 issue(쟁점), pro(찬성 논거), con(반대 논거)
- risks: 문자열 배열 (남은 리스크·미해결)
- actions: 배열. 각 원소는 what(할 일), owner(담당), due(기한)
- positions: 배열. 각 원소는 persona(발언자 이름), stance(찬성/반대/조건부), keyPoint(핵심 주장 한 줄)
- openQuestions: 문자열 배열 (결론을 내리지 못한 질문)
- decisionBasis: 문자열 배열 (이 판정에 결정적이었던 근거 2~4개)`;
}

/** 발언 1건의 구조화 출력 — speech + 감정/만족도/입장/속마음 */
export type TurnOutput = {
  speech: string;
  emotion: DebateMessage["emotion"];
  satisfaction: number | null;
  stance: DebateMessage["stance"];
  innerThought: string;
};

const EMOTIONS = ["기대", "만족", "중립", "우려", "불만", "단호"] as const;
const STANCES = ["찬성", "조건부", "반대", "유보"] as const;

/**
 * 모델 출력 → TurnOutput.
 * JSON 이 아니거나 깨져 있으면 전체 텍스트를 발언문으로 쓰고 상태는 비운다(파이프라인은 계속 진행).
 */
export function parseTurnOutput(raw: string): TurnOutput {
  const text = (raw ?? "").trim();
  const j = parseJsonLoose<Record<string, unknown>>(text);
  const empty: TurnOutput = { speech: "", emotion: "", satisfaction: null, stance: "", innerThought: "" };
  if (!j || typeof j !== "object" || Array.isArray(j)) return { ...empty, speech: text };

  const speech = typeof j.speech === "string" ? j.speech.trim() : "";
  if (!speech) {
    // speech 키가 없으면 본문 텍스트 필드를 찾아본다(모델이 스키마를 살짝 벗어난 경우)
    const alt = ["content", "text", "발언", "message"].map((k) => j[k]).find((v) => typeof v === "string" && v.trim());
    if (typeof alt === "string") return { ...empty, speech: alt.trim() };
    return { ...empty, speech: text };
  }

  const emotionRaw = String(j.emotion ?? "").trim();
  const stanceRaw = String(j.stance ?? "").trim();
  const satRaw = Number(j.satisfaction);
  return {
    speech,
    emotion: (EMOTIONS as readonly string[]).includes(emotionRaw) ? (emotionRaw as DebateMessage["emotion"]) : "",
    satisfaction: Number.isFinite(satRaw) ? Math.max(0, Math.min(100, Math.round(satRaw))) : null,
    stance: (STANCES as readonly string[]).includes(stanceRaw) ? (stanceRaw as DebateMessage["stance"]) : "",
    innerThought: String(j.innerThought ?? "").trim().slice(0, 300),
  };
}

export type DebateLlmCall = (prompt: string, personaKey: string) => Promise<string>;
export type RunDebateDeps = {
  call?: DebateLlmCall;
  conclusionCall?: DebateLlmCall;
  now?: () => number;
  sleep?: (ms: number) => Promise<void>;
};

/** 기본 LLM 호출 — 페르소나별 모델 설정(설정 화면)을 반영한다 */
async function defaultCall(prompt: string, personaKey: string): Promise<string> {
  const { models, model } = await resolvePersonaModel(personaKey);
  const res = await models.completeSimple(model, {
    messages: [{ role: "user" as const, content: prompt, timestamp: Date.now() }],
  });
  return ((res?.content ?? []) as Array<{ type?: string; text?: string }>)
    .filter((t) => t?.type === "text")
    .map((t) => String(t?.text ?? ""))
    .join("");
}

/** 최종 결론 — 전체 로그 요약 → MD 저장 → 세션에 판정/경로 기록 */
export async function concludeDebate(sessionId: string, deps: RunDebateDeps = {}): Promise<{ reportPath: string; synthesis: DebateSynthesis }> {
  const call = deps.conclusionCall ?? deps.call ?? defaultCall;
  const session = await getSession(sessionId);
  if (!session) throw new Error("토론 세션을 찾을 수 없습니다.");
  const messages = await listMessages(sessionId, 0);

  let synthesis: DebateSynthesis | null = null;
  try {
    const raw = await call(buildSynthesisPrompt(session, messages), CONCLUSION_PERSONA_KEY);
    synthesis = parseSynthesis(raw);
  } catch (e) {
    console.error("[debate] 결론 생성 실패:", (e as Error).message);
  }
  if (!synthesis) synthesis = fallbackSynthesis(session, messages);
  // 라운드별 흐름은 LLM 이 아니라 발언 로그에서 결정적으로 만든다(사실 왜곡 방지).
  synthesis = { ...synthesis, roundFlow: buildRoundFlow(messages) };

  // 보고서 헤더의 "일시 ~ 종료"가 비지 않도록 종료 시각을 미리 확정해 함께 쓴다.
  const endedAt = session.endedAt ? new Date(session.endedAt) : new Date(deps.now ? deps.now() : Date.now());
  const sessionForReport: DebateSession = { ...session, endedAt: endedAt.toISOString() };
  const md = buildDebateReportMarkdown({ session: sessionForReport, messages, synthesis });
  const reportPath = await saveDebateReportMd(sessionId, md);

  const personaList = await listAllPersonas();
  const conclusionPersona = personaList.find((p) => p.key === CONCLUSION_PERSONA_KEY) ?? personaList.find((p) => p.kind === "conclusion");
  if (conclusionPersona) {
    await appendMessage({
      sessionId,
      persona: toParticipant(conclusionPersona),
      content: `[최종 결론: ${synthesis.verdict}]\n${synthesis.summary}`,
      round: session.round,
      kind: "conclusion",
    });
  }

  await updateSession(sessionId, { verdict: synthesis.verdict, reportPath, endedAt });
  return { reportPath, synthesis };
}

/** 토론 실행 — 시간 종료/사용자 중단까지 발언을 생성하고, 끝나면 결론 보고서를 만든다 */
export async function runDebate(sessionId: string, deps: RunDebateDeps = {}): Promise<{ status: DebateStatus; turns: number }> {
  const call = deps.call ?? defaultCall;
  const now = deps.now ?? (() => Date.now());
  const sleep = deps.sleep ?? ((ms: number) => new Promise<void>((r) => setTimeout(r, ms)));

  const session = await getSession(sessionId);
  if (!session) throw new Error("토론 세션을 찾을 수 없습니다.");
  if (session.status === "running") return { status: "running", turns: session.turnCount };
  if (session.status === "finished" || session.status === "stopped") return { status: session.status, turns: session.turnCount };

  // 참가자 프롬프트는 DB(사용자 수정 반영) 기준으로 해석한다.
  const allPersonas = await listAllPersonas();
  const participants = session.participants
    .map((p) => allPersonas.find((x) => x.key === p.key))
    .filter((p): p is DebatePersona => !!p && p.kind !== "conclusion");
  if (participants.length < 2) throw new Error("토론 참가자가 2명 이상 필요합니다.");

  const startedMs = now();
  await setSessionStatus(sessionId, "running", { startedAt: new Date(startedMs), round: 1, turnCount: 0 });
  await appendSystemMessage(sessionId, `토론을 시작합니다 — 주제: ${session.title} (제한 ${session.durationSec}초, 참가 ${participants.length}명)`);

  let turnIndex = 0;
  let round = 1;
  let turns = 0;
  let errors = 0;

  try {
    while (turns < session.maxTurns) {
      if (await isStopped(sessionId)) break;
      const remainingSec = session.durationSec - Math.floor((now() - startedMs) / 1000);
      if (remainingSec <= 0) break;

      // 기준 라운드는 항상 1 — 누적하면 라운드가 부풀려진다(roundOfTurn 참고).
      const picked = pickNextSpeaker({ participants, turnIndex, round: 1 });
      round = picked.round;
      const persona = picked.persona;

      try {
        const transcript = await listMessages(sessionId, 0);
        const prompt = buildTurnPrompt({ session, persona, transcript, round, remainingSec });
        const out = parseTurnOutput(await call(prompt, persona.key));
        if (out.speech) {
          await appendMessage({
            sessionId, persona: toParticipant(persona), content: out.speech, round,
            state: { emotion: out.emotion, satisfaction: out.satisfaction, stance: out.stance, innerThought: out.innerThought },
          });
          turns++;
          errors = 0;
          // 주의: 진행 갱신은 running 일 때만 — 중단 요청(stopped)을 덮어쓰면 안 된다.
          await updateProgressIfRunning(sessionId, { round, turnCount: turns });
        }
      } catch (e) {
        errors++;
        console.error(`[debate] 발언 생성 실패(${persona.key}):`, (e as Error).message);
        if (errors >= MAX_CONSECUTIVE_ERRORS) {
          await appendSystemMessage(sessionId, "모델 오류가 반복되어 토론을 종료합니다.");
          break;
        }
      }

      turnIndex++;
      await sleep(TURN_DELAY_MS);
    }
  } catch (e) {
    await setSessionStatus(sessionId, "failed", { endedAt: new Date(now()) });
    throw e;
  }

  // 결론 생성이 끝나기 전에는 "finished" 로 바꾸지 않는다 —
  // 관전 화면이 finished 를 보고 곧바로 보고서를 조회했을 때 404 가 나지 않도록.
  const stoppedEarly = await isStopped(sessionId);
  if (!stoppedEarly) await appendSystemMessage(sessionId, "토론이 종료되었습니다 — 최종 결론 에이전트가 보고서를 작성합니다.");
  await concludeDebate(sessionId, deps);
  await setSessionStatus(sessionId, stoppedEarly ? "stopped" : "finished", { endedAt: new Date(now()) });
  return { status: stoppedEarly ? "stopped" : "finished", turns };
}
