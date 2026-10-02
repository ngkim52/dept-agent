// 토론 최종 보고서 — 합성 JSON → 결정적 MD 템플릿 (019)
import { parseJsonLoose } from "@/lib/util/jsonLoose";
import { ROUND_PHASES } from "./rounds";
import type { DebateMessage, DebateSession, DebateSynthesis } from "./types";

export const REPORT_SECTIONS = [
  "## 1. 결론",
  "## 2. 라운드별 흐름",
  "## 3. 합의된 사항",
  "## 4. 조건부 합의",
  "## 5. 쟁점",
  "## 6. 참가자별 입장",
  "## 7. 남은 리스크·미해결",
  "## 8. 미해결 질문",
  "## 9. 의사결정 근거",
  "## 10. 권고 액션",
  "## 부록 A. 참가자 감정·속마음",
] as const;

/** 발언 로그 → 참가자별 감정/만족도 변화 (결정적 생성) */
export function buildEmotionFlow(messages: DebateMessage[]): { persona: string; series: number[]; emotions: string[]; lastThought: string; stance: string }[] {
  const byPersona = new Map<string, DebateMessage[]>();
  for (const m of messages) {
    if (m.kind !== "member" && m.kind !== "observer") continue;
    const arr = byPersona.get(m.personaName) ?? [];
    arr.push(m);
    byPersona.set(m.personaName, arr);
  }
  return [...byPersona.entries()].map(([persona, msgs]) => {
    const last = msgs[msgs.length - 1];
    return {
      persona,
      series: msgs.filter((m) => typeof m.satisfaction === "number").map((m) => m.satisfaction as number),
      emotions: msgs.map((m) => m.emotion).filter(Boolean) as string[],
      lastThought: [...msgs].reverse().find((m) => m.innerThought)?.innerThought ?? "",
      stance: last.stance || "",
    };
  });
}

function str(v: unknown): string { return typeof v === "string" ? v.trim() : v === null || v === undefined ? "" : String(v); }
function strList(v: unknown): string[] { return Array.isArray(v) ? v.map(str).filter(Boolean) : []; }
function objList(v: unknown): Record<string, unknown>[] {
  return Array.isArray(v) ? v.filter((x): x is Record<string, unknown> => !!x && typeof x === "object" && !Array.isArray(x)) : [];
}

/** 발언 로그 → 라운드별 흐름(결정적 생성) */
export function buildRoundFlow(messages: DebateMessage[]): { round: number; label: string; gist: string }[] {
  const spoken = messages.filter((m) => m.kind !== "system" && m.kind !== "conclusion");
  const byRound = new Map<number, DebateMessage[]>();
  for (const m of spoken) {
    const arr = byRound.get(m.round) ?? [];
    arr.push(m);
    byRound.set(m.round, arr);
  }
  return [...byRound.entries()].sort((a, b) => a[0] - b[0]).map(([round, msgs]) => {
    const label = ROUND_PHASES[Math.min(round - 1, ROUND_PHASES.length - 1)]?.label ?? "추가 논의";
    const first = msgs[0];
    const heads = msgs.slice(0, 3).map((m) => `${m.personaName}: ${m.content.replace(/\s+/g, " ").slice(0, 70)}`).join(" / ");
    return { round, label, gist: first ? `${msgs.length}명 발언 — ${heads}` : "" };
  });
}

/** LLM 합성 응답 → DebateSynthesis (관용 파싱 + 방어적 정규화). 못 읽으면 null. */
export function parseSynthesis(raw: string): DebateSynthesis | null {
  const data = parseJsonLoose<Record<string, unknown>>(raw);
  if (!data || typeof data !== "object" || Array.isArray(data)) return null;
  const verdict = str(data.verdict);
  const summary = str(data.summary);
  if (!verdict && !summary) return null;

  const disputes = objList(data.disputes).map((d) => ({ issue: str(d.issue), pro: str(d.pro), con: str(d.con) })).filter((d) => d.issue || d.pro || d.con);
  const actions = objList(data.actions).map((a) => ({ what: str(a.what), owner: str(a.owner), due: str(a.due) })).filter((a) => a.what);
  const positions = objList(data.positions).map((p) => ({ persona: str(p.persona), stance: str(p.stance), keyPoint: str(p.keyPoint) }))
    .filter((p) => p.persona || p.keyPoint);
  const roundFlow = objList(data.roundFlow).map((r) => ({ round: Number(r.round) || 0, label: str(r.label), gist: str(r.gist) })).filter((r) => r.gist);

  return {
    verdict: verdict || "결론 미도출",
    summary,
    roundFlow,
    agreements: strList(data.agreements),
    conditions: strList(data.conditions),
    disputes,
    risks: strList(data.risks),
    actions,
    positions,
    openQuestions: strList(data.openQuestions),
    decisionBasis: strList(data.decisionBasis),
  };
}

/** 합성 실패 시 로그 기반 최소 보고서 */
export function fallbackSynthesis(session: DebateSession, messages: DebateMessage[]): DebateSynthesis {
  const spoken = messages.filter((m) => m.kind !== "system");
  const speakers = Array.from(new Set(spoken.map((m) => m.personaName)));
  const last = [...spoken].reverse().find((m) => m.kind !== "conclusion");
  return {
    verdict: "정리 보류(자동 요약)",
    summary: `${session.title} 안건으로 ${spoken.length}건의 발언이 있었습니다. 요약 모델 응답을 해석하지 못해 발언 로그를 그대로 첨부합니다.`,
    roundFlow: [],
    agreements: [],
    conditions: [],
    disputes: [],
    risks: [],
    actions: [],
    positions: speakers.map((name) => ({ persona: name, stance: "", keyPoint: last && last.personaName === name ? last.content.slice(0, 120) : "" })),
    openQuestions: [],
    decisionBasis: [],
  };
}

function cell(s: string): string { return s.replace(/\|/g, "\\|").replace(/\n+/g, " ").trim(); }
function clip(s: string, n = 200): string { const t = s.replace(/\s+/g, " ").trim(); return t.length <= n ? t : t.slice(0, n) + "…"; }
function bullet(list: string[], empty: string): string { return list.length ? list.map((x) => `- ${x}`).join("\n") : `- ${empty}`; }

export function buildDebateReportMarkdown(input: { session: DebateSession; messages: DebateMessage[]; synthesis: DebateSynthesis }): string {
  const { session, messages, synthesis } = input;
  const spoken = messages.filter((m) => m.kind !== "system");
  const names = session.participants.map((p) => `${p.emoji} ${p.name}`).join(", ") || "-";
  const started = session.startedAt ? new Date(session.startedAt).toLocaleString("ko-KR") : "-";
  const ended = session.endedAt ? new Date(session.endedAt).toLocaleString("ko-KR") : "-";
  const elapsed = session.startedAt && session.endedAt
    ? Math.max(0, Math.round((new Date(session.endedAt).getTime() - new Date(session.startedAt).getTime()) / 1000))
    : null;
  const roundFlow = synthesis.roundFlow.length ? synthesis.roundFlow : buildRoundFlow(messages);

  const L: string[] = [];
  L.push(`# 토론 최종 보고서 — ${session.title}`);
  L.push("");
  L.push(`- 작성: 최종 결론 에이전트 (Debate Room 자동 생성)`);
  L.push(`- 일시: ${started} ~ ${ended}${elapsed !== null ? ` (${elapsed}초)` : ""}`);
  L.push(`- 참가자: ${names}`);
  L.push(`- 발언: ${spoken.length}건 · 라운드 ${session.round}회`);
  if (session.brief) {
    L.push("");
    L.push(`> 기획안 요약: ${clip(session.brief, 300)}`);
  }
  L.push("");
  L.push(`## 1. 결론 (판정: ${synthesis.verdict})`);
  L.push("");
  L.push(synthesis.summary || "(요약 없음)");
  L.push("");
  L.push("## 2. 라운드별 흐름");
  L.push("");
  if (roundFlow.length) {
    for (const r of roundFlow) L.push(`- **R${r.round} (${r.label || "논의"})**: ${r.gist}`);
  } else {
    L.push("- (라운드 정보 없음)");
  }
  L.push("");
  L.push("## 3. 합의된 사항");
  L.push("");
  L.push(bullet(synthesis.agreements, "명시적 합의 사항은 없습니다."));
  L.push("");
  L.push("## 4. 조건부 합의");
  L.push("");
  L.push(bullet(synthesis.conditions, "조건부 합의로 정리된 항목이 없습니다."));
  L.push("");
  L.push("## 5. 쟁점");
  L.push("");
  if (synthesis.disputes.length) {
    L.push("| 쟁점 | 찬성 논거 | 반대 논거 |");
    L.push("| --- | --- | --- |");
    for (const d of synthesis.disputes) L.push(`| ${cell(d.issue)} | ${cell(d.pro)} | ${cell(d.con)} |`);
  } else {
    L.push("- 뚜렷한 대립 쟁점이 정리되지 않았습니다.");
  }
  L.push("");
  L.push("## 6. 참가자별 입장");
  L.push("");
  if (synthesis.positions.length) {
    L.push("| 참가자 | 입장 | 핵심 주장 |");
    L.push("| --- | --- | --- |");
    for (const p of synthesis.positions) L.push(`| ${cell(p.persona)} | ${cell(p.stance || "-")} | ${cell(p.keyPoint || "-")} |`);
  } else {
    L.push("- (정리 없음)");
  }
  L.push("");
  L.push("## 7. 남은 리스크·미해결");
  L.push("");
  L.push(bullet(synthesis.risks, "정리된 잔여 리스크가 없습니다."));
  L.push("");
  L.push("## 8. 미해결 질문");
  L.push("");
  L.push(bullet(synthesis.openQuestions, "미해결 질문이 정리되지 않았습니다."));
  L.push("");
  L.push("## 9. 의사결정 근거");
  L.push("");
  L.push(bullet(synthesis.decisionBasis, "근거가 정리되지 않았습니다."));
  L.push("");
  L.push("## 10. 권고 액션");
  L.push("");
  if (synthesis.actions.length) {
    L.push("| 할 일 | 담당 | 기한 |");
    L.push("| --- | --- | --- |");
    for (const a of synthesis.actions) L.push(`| ${cell(a.what)} | ${cell(a.owner)} | ${cell(a.due)} |`);
  } else {
    L.push("- 권고 액션이 도출되지 않았습니다.");
  }
  L.push("");
  // 발언 로그는 넣지 않는다 — 관전 탭(타임라인)에서 전체 대화를 볼 수 있다.
  L.push("## 부록 A. 참가자 감정·속마음");
  L.push("");
  const flow = buildEmotionFlow(messages);
  if (flow.length) {
    L.push("| 참가자 | 최종 입장 | 만족도 변화 | 감정 흐름 | 마지막 속마음 |");
    L.push("| --- | --- | --- | --- | --- |");
    for (const f of flow) {
      const series = f.series.length ? f.series.join(" → ") : "-";
      const emotions = f.emotions.length ? Array.from(new Set(f.emotions)).join(" · ") : "-";
      L.push(`| ${cell(f.persona)} | ${cell(f.stance || "-")} | ${cell(series)} | ${cell(emotions)} | ${cell(f.lastThought || "-")} |`);
    }
  } else {
    L.push("- (감정 기록 없음)");
  }
  L.push("");
  return L.join("\n");
}
