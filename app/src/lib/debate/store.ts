// 토론방 저장소 — 세션/발언/커스텀 페르소나 DB 경계 (019)
import { randomUUID } from "node:crypto";
import { and, asc, desc, eq, gt, sql } from "drizzle-orm";
import { db, schema } from "@/lib/db";
import { getDebatePersona, getBuiltinSeed, buildDebatePersona, BUILTIN_PERSONA_SEEDS, CONCLUSION_PERSONA_KEY } from "./personas";
import type { DebatePersonaSeed } from "./personas";
import type { DebateMessage, DebateMessageKind, DebateParticipant, DebatePersona, DebateSession, DebateStatus } from "./types";

type SessionRow = typeof schema.debateSessions.$inferSelect;
type PersonaRow = typeof schema.debatePersonas.$inferSelect;

function iso(d: Date | number | null | undefined): string | null {
  if (d === null || d === undefined) return null;
  return new Date(d).toISOString();
}

function parseParticipantKeys(json: string): string[] {
  try {
    const a = JSON.parse(json);
    return Array.isArray(a) ? a.map(String) : [];
  } catch { return []; }
}

function toParticipant(key: string, personas?: DebatePersona[]): DebateParticipant | null {
  const p = (personas ? personas.find((x) => x.key === key) : undefined) ?? getDebatePersona(key);
  if (!p) return null;
  return { key: p.key, name: p.name, emoji: p.emoji, color: p.color, role: p.role, kind: p.kind };
}

export function sessionToDto(row: SessionRow, personas?: DebatePersona[]): DebateSession {
  const participantKeys = parseParticipantKeys(row.participantKeys);
  const participants = participantKeys.map((k) => toParticipant(k, personas)).filter((p): p is DebateParticipant => !!p);
  return {
    id: row.id,
    title: row.title,
    brief: row.brief,
    attachmentName: row.attachmentName ?? null,
    status: row.status as DebateStatus,
    durationSec: row.durationSec,
    participantKeys,
    participants,
    round: row.round,
    turnCount: row.turnCount,
    maxTurns: row.maxTurns,
    verdict: row.verdict ?? null,
    reportPath: row.reportPath ?? null,
    hasReport: !!row.reportPath,
    createdBy: row.createdBy ?? null,
    startedAt: iso(row.startedAt),
    endedAt: iso(row.endedAt),
    createdAt: iso(row.createdAt)!,
    updatedAt: iso(row.updatedAt)!,
  };
}

export function messageToDto(row: typeof schema.debateMessages.$inferSelect): DebateMessage {
  return {
    id: row.id,
    sessionId: row.sessionId,
    seq: row.seq,
    personaKey: row.personaKey,
    personaName: row.personaName,
    personaEmoji: row.personaEmoji,
    personaColor: row.personaColor,
    kind: row.kind as DebateMessageKind,
    round: row.round,
    content: row.content,
    emotion: (row.emotion ?? "") as DebateMessage["emotion"],
    satisfaction: row.satisfaction ?? null,
    stance: (row.stance ?? "") as DebateMessage["stance"],
    innerThought: row.innerThought ?? "",
    createdAt: iso(row.createdAt)!,
  };
}

export async function createSession(input: {
  id: string;
  title: string;
  brief?: string;
  attachmentName?: string | null;
  durationSec?: number;
  participantKeys: string[];
  createdBy?: string | null;
  maxTurns?: number;
}): Promise<DebateSession> {
  const now = new Date();
  await db.insert(schema.debateSessions).values({
    id: input.id,
    title: input.title,
    brief: input.brief ?? "",
    attachmentName: input.attachmentName ?? null,
    status: "draft",
    durationSec: input.durationSec ?? 180,
    participantKeys: JSON.stringify(input.participantKeys),
    round: 0,
    turnCount: 0,
    maxTurns: input.maxTurns ?? 80,
    createdBy: input.createdBy ?? null,
    createdAt: now,
    updatedAt: now,
  });
  const row = await db.query.debateSessions.findFirst({ where: eq(schema.debateSessions.id, input.id) });
  if (!row) throw new Error("토론 세션 생성에 실패했습니다.");
  return sessionToDto(row, await listAllPersonas());
}

export async function getSession(id: string): Promise<DebateSession | null> {
  const row = await db.query.debateSessions.findFirst({ where: eq(schema.debateSessions.id, id) });
  if (!row) return null;
  // 참가자 이름/색은 커스텀 페르소나도 반영되도록 DB 페르소나 목록에서 해석한다.
  return sessionToDto(row, await listAllPersonas());
}

export async function listSessions(opts: { limit?: number; status?: DebateStatus } = {}): Promise<DebateSession[]> {
  const limit = Math.min(Math.max(opts.limit ?? 30, 1), 100);
  const rows = opts.status
    ? await db.query.debateSessions.findMany({ where: eq(schema.debateSessions.status, opts.status), orderBy: [desc(schema.debateSessions.createdAt)], limit })
    : await db.query.debateSessions.findMany({ orderBy: [desc(schema.debateSessions.createdAt)], limit });
  const personas = await listAllPersonas();
  return rows.map((r) => sessionToDto(r, personas));
}

export async function updateSession(
  id: string,
  patch: Partial<{
    status: DebateStatus;
    round: number;
    turnCount: number;
    verdict: string | null;
    reportPath: string | null;
    startedAt: Date | null;
    endedAt: Date | null;
  }>,
): Promise<void> {
  await db.update(schema.debateSessions)
    .set({ ...patch, updatedAt: new Date() })
    .where(eq(schema.debateSessions.id, id));
}

export async function setSessionStatus(
  id: string,
  status: DebateStatus,
  patch: Partial<{ round: number; turnCount: number; startedAt: Date; endedAt: Date; verdict: string | null; reportPath: string | null }> = {},
): Promise<void> {
  await updateSession(id, { status, ...patch });
}

/** 진행 상황 갱신 — 중단/종료 요청을 덮어쓰지 않도록 running 상태일 때만 반영한다 */
export async function updateProgressIfRunning(id: string, patch: { round?: number; turnCount?: number }): Promise<void> {
  await db.update(schema.debateSessions)
    .set({
      ...(patch.round !== undefined ? { round: patch.round } : {}),
      ...(patch.turnCount !== undefined ? { turnCount: patch.turnCount } : {}),
      updatedAt: new Date(),
    })
    .where(and(eq(schema.debateSessions.id, id), eq(schema.debateSessions.status, "running")));
}

/** 다음 발언 seq (1부터) */
export async function nextSeq(sessionId: string): Promise<number> {
  const rows = await db.select({ m: sql<number | null>`max(${schema.debateMessages.seq})` })
    .from(schema.debateMessages)
    .where(eq(schema.debateMessages.sessionId, sessionId));
  const max = rows[0]?.m ?? 0;
  return Number(max ?? 0) + 1;
}

export type MessageState = {
  emotion?: DebateMessage["emotion"];
  satisfaction?: number | null;
  stance?: DebateMessage["stance"];
  innerThought?: string;
};

export async function appendMessage(input: {
  sessionId: string;
  persona: DebateParticipant;
  content: string;
  round: number;
  kind?: DebateMessageKind;
  state?: MessageState;
}): Promise<DebateMessage> {
  const seq = await nextSeq(input.sessionId);
  const s = input.state ?? {};
  const row = {
    id: randomUUID(),
    sessionId: input.sessionId,
    seq,
    personaKey: input.persona.key,
    personaName: input.persona.name,
    personaEmoji: input.persona.emoji,
    personaColor: input.persona.color,
    kind: (input.kind ?? (input.persona.kind === "conclusion" ? "conclusion" : input.persona.kind)) as DebateMessageKind,
    round: input.round,
    content: input.content,
    emotion: s.emotion ? String(s.emotion) : null,
    satisfaction: typeof s.satisfaction === "number" && Number.isFinite(s.satisfaction) ? Math.round(s.satisfaction) : null,
    stance: s.stance ? String(s.stance) : null,
    innerThought: s.innerThought ? String(s.innerThought).slice(0, 300) : null,
    createdAt: new Date(),
  };
  await db.insert(schema.debateMessages).values(row);
  return messageToDto(row as typeof schema.debateMessages.$inferSelect);
}

/** 시스템 안내 메시지(토론 시작/종료 등) */
export async function appendSystemMessage(sessionId: string, content: string, round = 0): Promise<DebateMessage> {
  return appendMessage({
    sessionId,
    persona: { key: "system", name: "진행", emoji: "•", color: "#8A8A8A", role: "", kind: "member" },
    content,
    round,
    kind: "system",
  });
}

export async function listMessages(sessionId: string, sinceSeq = 0): Promise<DebateMessage[]> {
  const rows = await db.query.debateMessages.findMany({
    where: sinceSeq > 0
      ? and(eq(schema.debateMessages.sessionId, sessionId), gt(schema.debateMessages.seq, sinceSeq))
      : eq(schema.debateMessages.sessionId, sessionId),
    orderBy: [asc(schema.debateMessages.seq)],
  });
  return rows.map(messageToDto);
}

export async function countMessages(sessionId: string): Promise<number> {
  const rows = await db.select({ c: sql<number>`count(*)` })
    .from(schema.debateMessages)
    .where(eq(schema.debateMessages.sessionId, sessionId));
  return Number(rows[0]?.c ?? 0);
}

/** 종료/중단 요청 여부 — running 이 아니면 루프를 멈춘다 */
export async function isStopped(sessionId: string): Promise<boolean> {
  const row = await db.query.debateSessions.findFirst({ where: eq(schema.debateSessions.id, sessionId) });
  if (!row) return true;
  return row.status === "stopped" || row.status === "finished" || row.status === "failed";
}

// ── 페르소나 (기본 + 사용자 수정/추가) ──
type PersonaInput = {
  name: string; emoji?: string; role?: string; stance?: string; expertise?: string; goal?: string;
  redLine?: string; tone?: string; color?: string; note?: string; active?: boolean; createdBy?: string | null;
};

function rowToPersona(row: PersonaRow): DebatePersona {
  const seed = getBuiltinSeed(row.id);
  const base = seed ?? {
    key: row.id, name: row.name, emoji: row.emoji, role: row.role, stance: row.stance,
    expertise: row.expertise ?? "", goal: row.goal ?? "", redLine: row.redLine ?? "",
    tone: row.tone, color: row.color, kind: "member" as const,
  };
  // 빌트인 수정이면 저장된 값으로 덮어쓴다(이름·이모지·역할·입장·전문영역·목표·양보선·말투·색).
  const merged: DebatePersonaSeed = {
    key: row.id,
    name: row.name || base.name,
    emoji: row.emoji || base.emoji,
    role: row.role || base.role,
    stance: row.stance || base.stance,
    expertise: row.expertise || base.expertise,
    goal: row.goal || base.goal,
    redLine: row.redLine || base.redLine,
    tone: row.tone || base.tone,
    color: row.color || base.color,
    kind: base.kind,
  };
  return buildDebatePersona(merged, { builtin: !!seed, overridden: !!seed, note: row.systemPrompt ?? "" });
}

export async function listCustomPersonas(): Promise<PersonaRow[]> {
  return db.query.debatePersonas.findMany({ orderBy: [desc(schema.debatePersonas.createdAt)] });
}

/** 기본 페르소나(수정 반영) + 사용자 추가 페르소나 */
export async function listAllPersonas(): Promise<DebatePersona[]> {
  const rows = (await listCustomPersonas()).filter((r) => r.active);
  const byId = new Map(rows.map((r) => [r.id, r]));
  const out: DebatePersona[] = [];
  for (const seed of BUILTIN_PERSONA_SEEDS) {
    const row = byId.get(seed.key);
    if (row) { out.push(rowToPersona(row)); byId.delete(seed.key); }
    else out.push(buildDebatePersona(seed));
  }
  for (const row of byId.values()) out.push(rowToPersona(row));
  return out;
}

/**
 * 페르소나 생성/수정.
 * - key 가 기본 페르소나 key 면 그 기본값을 덮어쓴다(수정).
 * - key 가 "custom-..." 면 수정, 없으면 새로 만든다.
 */
export async function upsertPersona(input: PersonaInput & { key?: string }): Promise<DebatePersona> {
  const now = new Date();
  const seed = input.key ? getBuiltinSeed(input.key) : undefined;
  const isBuiltin = !!seed;
  const id = input.key && (isBuiltin || input.key.startsWith("custom-")) ? input.key : "custom-" + randomUUID();
  const values = {
    name: input.name,
    emoji: input.emoji ?? "🙂",
    role: input.role ?? "",
    stance: input.stance ?? "",
    expertise: input.expertise ?? "",
    goal: input.goal ?? "",
    redLine: input.redLine ?? "",
    tone: input.tone ?? "",
    color: input.color ?? "#1F6C9F",
    systemPrompt: input.note ?? "",
    active: input.active ?? true,
    createdBy: input.createdBy ?? null,
  };
  const exists = await db.query.debatePersonas.findFirst({ where: eq(schema.debatePersonas.id, id) });
  if (exists) {
    await db.update(schema.debatePersonas).set(values).where(eq(schema.debatePersonas.id, id));
  } else {
    await db.insert(schema.debatePersonas).values({ id, ...values, createdAt: now });
  }
  const row = await db.query.debatePersonas.findFirst({ where: eq(schema.debatePersonas.id, id) });
  if (!row) throw new Error("페르소나 저장에 실패했습니다.");
  return rowToPersona(row);
}

/** 커스텀 페르소나 생성(하위 호환) */
export async function createCustomPersona(input: PersonaInput): Promise<DebatePersona> {
  return upsertPersona(input);
}

/** 수정/추가 되돌리기 — 기본 페르소나는 기본값으로 복원, 커스텀은 삭제 */
export async function resetPersona(key: string): Promise<void> {
  await db.delete(schema.debatePersonas).where(eq(schema.debatePersonas.id, key));
}

export { CONCLUSION_PERSONA_KEY };
