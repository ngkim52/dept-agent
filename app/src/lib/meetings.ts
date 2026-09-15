// 회의록 · MD → DB + RAGFlow 회의록 데이터셋 적재
import { randomUUID } from "node:crypto";
import { ragflow } from "@/lib/ragflow/client";
import { eq, desc } from "drizzle-orm";
import { db, schema } from "@/lib/db";
import { createMemory } from "@/lib/harness/store";
import { addEdge } from "@/lib/harness/review";

export type MinutesJSON = {
  attendees: string;
  agenda: { item: string; note: string }[];
  decisions: string[];
  actions: { what: string; owner: string; due: string }[];
  risk: string[];
};

export type MeetingRow = typeof schema.meetings.$inferSelect;
export type NewMeeting = typeof schema.meetings.$inferInsert;

export function emptyMinutes(): MinutesJSON {
  return { attendees: "", agenda: [], decisions: [], actions: [], risk: [] };
}

/** STT 전사 (플러그형) — 운영 시 음성→텍스트 모델로 대체. 현재는 파일명/본문 기반 더미 또는 입력 그대로. */
export async function transcribeAudio(_audio: Uint8Array, fileName: string): Promise<{ text: string; note?: string }> {
  // .txt/.md 등 텍스트 확장자는 본문 그대로 (테스트/수동 대응). 음성은 STT 미연결 시 빈 값 + 안내.
  if (/\.(txt|md|text)$/i.test(fileName)) {
    // 본문은 route에서 직접 디코딩해 전달 (여기선 못 받음)
    return { text: "", note: "텍스트 파일은 route에서 직접 처리합니다." };
  }
  return { text: "", note: "STT(음성→텍스트) 미설정 — 회의 원문을 직접 붙여넣거나 텍스트 파일을 올려주세요." };
}

/** 녹취 원문 → 회의록 초안 (휴리스틱 파싱 + LLM 여건 시 요약). 테스트에선 결정적. */
export function draftMinutes(rawText: string): { minutes: MinutesJSON; summary: string } {
  const m = emptyMinutes();
  const lines = rawText.split(/\n+/).map((l) => l.trim()).filter(Boolean);
  const participants: string[] = [];
  const agenda: { item: string; note: string }[] = [];
  const decisions: string[] = [];
  const actions: { what: string; owner: string; due: string }[] = [];
  const risk: string[] = [];
  const reAtt = /^(참석|참여|출석|작성)[:：]?\s*(.+)/;
  const reAg = /^안건[:：]?\s*(.+)/;
  const reDe = /^(결정|확정|합의)(?:[:：]|\s+)(.+)/;
  const reAc = /^(액션|할 일|todo|담당)(?:[:：]|\s+)(.+)/;
  const reRisk = /^(리스크|위험|우려)(?:[:：]|\s+)(.+)/;
  for (const l of lines) {
    for (const rx of [reAtt, reAg, reDe, reAc, reRisk]) {
      const g = l.match(rx);
      if (g) {
        if (rx === reAtt) participants.push(g[2]);
        else if (rx === reAg) agenda.push({ item: g[2], note: "" });
        else if (rx === reDe) decisions.push(g[2]);
        else if (rx === reAc) {
          const parts = g[2].split("|").map((x) => x.trim());
          actions.push({ what: parts[0] ?? "", owner: parts[1] ?? "", due: parts[2] ?? "" });
        } else risk.push(g[2]);
        break;
      }
    }
  }
  if (!agenda.length && lines.length) agenda.push({ item: lines[0].slice(0, 60), note: "" });
  m.attendees = participants.join(", ");
  m.agenda = agenda;
  m.decisions = decisions;
  m.actions = actions;
  m.risk = risk;
  const summary = lines.slice(0, 2).join(" · ").slice(0, 120) || "회의록 초안";
  return { minutes: m, summary };
}

// ── CRUD ──
type MeetingCreate = Omit<NewMeeting, "createdAt" | "updatedAt" | "knowledgeApplied">;
export async function createMeeting(input: MeetingCreate): Promise<MeetingRow> {
  const row: MeetingCreate & { createdAt: Date; updatedAt: Date; knowledgeApplied: boolean } =
    { ...input, id: input.id ?? randomUUID(), createdAt: new Date(), updatedAt: new Date(), knowledgeApplied: false };
  await db.insert(schema.meetings).values(row as NewMeeting);
  return row as unknown as MeetingRow;
}

export async function getMeeting(id: string): Promise<MeetingRow | null> {
  return (await db.select().from(schema.meetings).where(eq(schema.meetings.id, id)))[0] ?? null;
}

export async function listMeetings(departmentId: string): Promise<MeetingRow[]> {
  return db.select().from(schema.meetings).where(eq(schema.meetings.departmentId, departmentId)).orderBy(desc(schema.meetings.createdAt));
}

export async function updateMeeting(id: string, patch: Partial<Pick<MeetingRow, "title" | "rawText" | "minutesJson" | "categoryKey" | "sourceName">>): Promise<MeetingRow> {
  await db.update(schema.meetings).set({ ...patch, updatedAt: new Date() }).where(eq(schema.meetings.id, id));
  return (await getMeeting(id)) as MeetingRow;
}

/** 회의록 → 지식(메모리) 적재 + 그래프 엣지 연결 */
export async function applyMeetingAsKnowledge(meeting: MeetingRow, changedBy?: string): Promise<{ memoryId: string }> {
  const minutes = safeParse(meeting.minutesJson);
  const content = [
    `[회의록 적재] ${meeting.title}`,
    `참석: ${minutes?.attendees ?? ""}`,
    `안건: ${(minutes?.agenda ?? []).map((a) => a.item).join(" / ")}`,
    `결정: ${(minutes?.decisions ?? []).join(" / ") || "없음"}`,
    `액션: ${(minutes?.actions ?? []).map((a) => `${a.what}${a.owner ? "(" + a.owner + ")" : ""}`).join(" / ") || "없음"}`,
  ].filter(Boolean).join("\n");
  const memory = await createMemory({
    personaKey: meeting.departmentId === "actuarial" ? "actuarial" : "claims-planning",
    kind: "decision",
    content,
    tags: ["회의록", meeting.categoryKey ?? undefined].filter(Boolean) as string[],
    origin: "auto",
    confidence: 1,
  }, changedBy);
  await addEdge({ fromType: "meeting", fromId: meeting.id, toType: "memory", toId: memory.id, rel: "source_of" });
  await updateMeeting(meeting.id, { title: meeting.title });
  await db.update(schema.meetings).set({ knowledgeApplied: true }).where(eq(schema.meetings.id, meeting.id));
  return { memoryId: memory.id };
}

/** 회의 원문 → 회의록 양식 MD (LLM 정리). LLM 실패 시 휴리스틱 폴백. */
const REFINE_SYSTEM = `당신은 신한라이프 보험 금융 업무 회의록 작성 비서입니다.
회의 원문·녹취·필기 내용을 받아 정돈된 회의록으로 재구성해 주세요.
원문의 사실(참석자, 논의 주제, 결정, 액션, 담당, 마감, 리스크)은 절대 빼거나 지어내지 말고 모두 보존하세요.
구어체·두서없는 표현은 요점 중심의 회의록 문장으로 다듬되, 번호/순서 없는 흐름은 의미 단위로 묶어 정리하세요.
반드시 아래 Markdown 회의록 양식을 그대로 따르고, 그 외 문구나 마크다운 코드 펜스는 붙이지 마세요.

# 제목

- 날짜: (원문에 있으면 유지, 없으면 생략)
- 참석: (원문의 참석/참여 인원 정리)

## 논의 내용
- (주요 논의 안건/내용을 항목으로)

## 결정 사항
- (결정/합의/확정된 사항 항목으로. 없으면 생략)

## 후속 조치
- (할 일 | 담당: ... | 마감: ...  ← 담당/마감이 있으면 포함)

## 리스크
- (위험·우려·미결 이슈 항목으로. 없으면 생략)
`;

/** 원문 → 회의록 양식 MD (LLM 정리) + 제목. 실패/미설정 시 결정적 휴리스틱 폴백. */
export async function refineMinutes(rawText: string, title?: string): Promise<{ md: string; title: string }> {
  const fallback = (): { md: string; title: string } => ({ md: mdFromRawText(rawText, title), title: title?.trim() || "회의록" });
  let text = "";
  try {
    const { getLlmModel } = await import("@/lib/agent/llm");
    const { models, model } = await getLlmModel("simple");
    const res = await models.completeSimple(model, {
      messages: [
        { role: "user" as const, content: `${REFINE_SYSTEM}\n\n===== 회의 원문 =====\n${rawText}`, timestamp: Date.now() },
      ],
    });
    text = (res?.content ?? []).filter((t) => t?.type === "text").map((t) => t.text).join("").trim();
    text = text.replace(/^```(?:md|markdown)?\s*/i, "").replace(/\s*```\s*$/, "").trim();
  } catch (e) { console.error("회의록 정리 LLM 실패, 폴백 사용:", (e as Error).message); }
  if (!text || text.length < 20) return fallback();
  const t = (text.match(/^#\s+(.+)/m) ?? [])[1]?.trim() || title?.trim() || rawText.split(/\n+/)[0]?.slice(0, 40) || "회의록";
  return { md: text, title: t };
}

/** 원문 → 회의록 양식 MD (휴리스틱, 결정적) — LLM 폴백/테스트용 */
export function mdFromRawText(rawText: string, title?: string): string {
  const { minutes } = draftMinutes(rawText);
  return minutesToMarkdown(minutes, { title: title?.trim() || "회의록" });
}

function safeParse(json: string | null): MinutesJSON | null {  if (!json) return null;
  try { return JSON.parse(json); } catch { return null; }
}

// ── MD 회의록 + RAGFlow 적재 (재설계) ──────────────────────────────
const MEETINGS_DATASET = "회의록";

/** MinutesJSON → 회의록 Markdown (RAGFlow 적재용 · 조회 최적화) */
export function minutesToMarkdown(mm: MinutesJSON, meta: { title?: string; date?: string; attendees?: string } = {}): string {
  const title = meta.title || "회의록";
  const date = meta.date || "";
  const attendees = mm.attendees || meta.attendees || "";
  const lines: string[] = [];
  lines.push(`# ${title}`);
  if (date) lines.push(`- 날짜: ${date}`);
  if (attendees) lines.push(`- 참석: ${attendees}`);
  lines.push("");
  if (mm.agenda?.length) {
    lines.push("## 논의 내용");
    for (const a of mm.agenda) lines.push(`- ${a.item}${a.note ? ": " + a.note : ""}`);
    lines.push("");
  }
  if (mm.decisions?.length) {
    lines.push("## 결정 사항");
    for (const d of mm.decisions) lines.push(`- ${d}`);
    lines.push("");
  }
  if (mm.actions?.length) {
    lines.push("## 후속 조치");
    for (const a of mm.actions) lines.push(`- ${a.what}${a.owner ? " | 담당: " + a.owner : ""}${a.due ? " | 마감: " + a.due : ""}`);
    lines.push("");
  }
  if (mm.risk?.length) {
    lines.push("## 리스크");
    for (const r of mm.risk) lines.push(`- ${r}`);
  }
  return lines.join("\n").trim();
}

/** 회의록 Markdown → (title, date, attendees, Minutes) 파싱 */
export function parseMinutesMarkdown(md: string): { title: string; date: string; attendees: string; minutes: MinutesJSON } {
  const m = emptyMinutes();
  const title = (md.match(/^#\s+(.+)/m) ?? [])[1] ?? "회의록";
  const date = (md.match(/^-\s*(?:날짜|회의일|일자)[:：]?\s*(.+)/m) ?? [])[1] ?? "";
  const attendees = (md.match(/^-\s*참석[:：]?\s*(.+)/m) ?? [])[1] ?? "";
  m.attendees = attendees;
  // 섹션 분리
  const lines = md.split(/\r?\n/);
  let section = "";
  const sections: Record<string, string[]> = { 논의: [], 결정: [], 조치: [], 리스크: [] };
  for (const raw of lines) {
    const l = raw.trim();
    const h = l.match(/^##\s+(.+)/);
    if (h) { section = h[1]; continue; }
    if (!section || !l.startsWith("-")) continue;
    if (/논의|안건/.test(section)) sections["논의"].push(l.replace(/^-\s*/, ""));
    else if (/결정|합의|확정/.test(section)) sections["결정"].push(l.replace(/^-\s*/, ""));
    else if (/조치|액션|할\s?일|todo/i.test(section)) sections["조치"].push(l.replace(/^-\s*/, ""));
    else if (/리스크|위험|우려/.test(section)) sections["리스크"].push(l.replace(/^-\s*/, ""));
  }
  m.agenda = sections["논의"].map((x) => ({ item: x, note: "" }));
  m.decisions = sections["결정"];
  m.actions = sections["조치"].map((x) => {
    const what = (x.split("\| 담당")[0] ?? x).split("\|")[0]?.trim() ?? "";
    const owner = (x.match(/담당[:：]?\s*(.+?)(\s*\| 마감|$)/) ?? [])[1]?.trim() ?? "";
    const due = (x.match(/마감[:：]?\s*(.+)/) ?? [])[1]?.trim() ?? "";
    return { what, owner, due };
  });
  m.risk = sections["리스크"];
  return { title, date, attendees, minutes: m };
}

function meetingDateOf(md: string, createdAt: Date): string {
  const d = parseMinutesMarkdown(md).date;
  if (d) return d;
  return createdAt.toISOString().slice(0, 10);
}

async function ensureMeetingsDataset(): Promise<string> {
  const ds = await ragflow.listDatasets();
  const hit = ds.find((x) => x.name === MEETINGS_DATASET);
  if (hit) return hit.id;
  return ragflow.createDataset(MEETINGS_DATASET);
}

/** 회의록(MD) → RAGFlow 회의록 데이터셋에 업로드 + 파싱 + 적재 플래그 */
export async function applyMeetingToRagflow(meeting: MeetingRow): Promise<{ datasetId: string; docId: string; filename: string }> {
  const minutes = safeParse(meeting.minutesJson) ?? draftMinutes(meeting.rawText).minutes;
  const md = minutesToMarkdown(minutes, {
    title: meeting.title,
    date: meetingDateOf(meeting.rawText, new Date(meeting.createdAt)),
    attendees: minutes.attendees,
  });
  const datasetId = await ensureMeetingsDataset();
  const safe = (meeting.title || "회의록").replace(/[/\\:]/g, "").trim();
  const filename = `${meetingDateOf(meeting.rawText, new Date(meeting.createdAt))}-${safe}.md`;
  const blob = new Blob([md], { type: "text/markdown" });
  const up = await ragflow.uploadDocument(datasetId, filename, blob);
  const data = (up.data ?? {}) as { id?: string } | { id?: string }[];
  const docId = Array.isArray(data) ? (data[0]?.id ?? "") : String((data as { id?: string }).id ?? "");
  if (!docId) throw new Error("RAGFlow 문서 id를 받지 못했습니다");
  await ragflow.parseDocuments(datasetId, [docId]);
  await db.update(schema.meetings).set({ knowledgeApplied: true, sourceName: meeting.sourceName ?? filename }).where(eq(schema.meetings.id, meeting.id));
  return { datasetId, docId, filename };
}

/** 회의록을 RAGFlow 적재 가능한 MD로 반환 (미적재 전 스키마/조회용) */
export function meetingMarkdown(meeting: MeetingRow): string {
  const minutes = safeParse(meeting.minutesJson) ?? draftMinutes(meeting.rawText).minutes;
  return minutesToMarkdown(minutes, {
    title: meeting.title,
    date: meetingDateOf(meeting.rawText, new Date(meeting.createdAt)),
    attendees: minutes.attendees,
  });
}
