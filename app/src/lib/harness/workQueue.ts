// 부서 워크큐 — 일감 CRUD · 진행률(주간/월간 업무) · RAG 등록 · 지연 서면보고 (018-B)
import { randomUUID } from "node:crypto";
import { db, schema } from "@/lib/db";
import { eq, desc, and } from "drizzle-orm";

export type WorkTask = schema.WorkTask;
export type NewWorkTask = schema.NewWorkTask;

export type WorkTaskStatus = "todo" | "doing" | "done" | "delayed";

function now() { return new Date(); }

export async function listWorkTasks(opts?: { personaKey?: string; status?: WorkTaskStatus }): Promise<WorkTask[]> {
  const q = db.select().from(schema.workTasks);
  if (opts?.personaKey) {
    const rows = opts.status
      ? await db.select().from(schema.workTasks).where(and(eq(schema.workTasks.personaKey, opts.personaKey), eq(schema.workTasks.status, opts.status)))
      : await db.select().from(schema.workTasks).where(eq(schema.workTasks.personaKey, opts.personaKey));
    return rows;
  }
  const rows = opts?.status
    ? await db.select().from(schema.workTasks).where(eq(schema.workTasks.status, opts.status))
    : await db.select().from(schema.workTasks);
  return rows;
}

export async function findWorkTaskByTitle(personaKey: string, title: string): Promise<WorkTask | null> {
  const rows = await db.select().from(schema.workTasks)
    .where(and(eq(schema.workTasks.personaKey, personaKey), eq(schema.workTasks.title, title)))
    .limit(1);
  return rows[0] ?? null;
}

export async function createWorkTask(input: Partial<NewWorkTask>, createdBy?: string): Promise<WorkTask> {
  // 부서장 의견 항목칩에서 등록한 일감은 같은 항목(제목)이 이미 있으면 새로 만들지 않음(무한 생성 방지)
  if (input.source === "director_note" && input.title) {
    const existing = await findWorkTaskByTitle(input.personaKey ?? "claims-planning", input.title);
    if (existing) return existing;
  }
  const id = randomUUID();
  const t = now();
  const row: NewWorkTask = {
    id,
    personaKey: input.personaKey ?? "claims-planning",
    title: input.title ?? "제목 없음",
    assignee: input.assignee ?? null,
    category: input.category ?? "일반",
    dueDate: normalizeDate(input.dueDate),
    status: input.status ?? "todo",
    progress: input.progress ?? 0,
    source: input.source ?? "direct",
    directorNoteRef: input.directorNoteRef ?? null,
    content: input.content ?? null,
    ragSynced: false,
    createdBy: createdBy ?? input.createdBy ?? null,
    createdAt: t,
    updatedAt: t,
  };
  await db.insert(schema.workTasks).values(row);
  // 진행내용은 RAG가 아닌 DB(work_tasks.content)에 저장 — 주간/월간 업무에서 조회해 갱신
  return (await getWorkTask(id))!;
}

export async function getWorkTask(id: string): Promise<WorkTask | null> {
  const rows = await db.select().from(schema.workTasks).where(eq(schema.workTasks.id, id)).limit(1);
  return rows[0] ?? null;
}

export async function updateWorkTask(id: string, patch: Partial<NewWorkTask>): Promise<WorkTask | null> {
  const cur = await getWorkTask(id);
  if (!cur) return null;
  if ("dueDate" in patch) patch = { ...patch, dueDate: normalizeDate(patch.dueDate) };
  await db.update(schema.workTasks)
    .set({ ...patch, updatedAt: now() })
    .where(eq(schema.workTasks.id, id));
  return (await getWorkTask(id))!;
}

export async function deleteWorkTask(id: string): Promise<boolean> {
  const cur = await getWorkTask(id);
  if (!cur) return false;
  await db.delete(schema.workTasks).where(eq(schema.workTasks.id, id));
  return true;
}

/**
 * 지연/마감 임박 일감: 담당자에게 부서장에게 서면보고하도록 지시 문구 생성.
 * (실제 알림은 메시지 전달 계층에서 처리 — 여기서는 derived 지시 문자열 반환)
 */
export function reportNotice(task: WorkTask): string | null {
  if (task.status === "delayed") {
    return `일감「${task.title}」가 지연 상태입니다. 담당자 ${task.assignee ?? "(지정 없음)"}는 사유를 부서장에게 서면 보고하세요.`;
  }
  return null;
}

/** 진행률 집계(모니터링용): 전체/완료/지연 수 */
export async function taskStats(personaKey?: string): Promise<{ total: number; done: number; doing: number; todo: number; delayed: number; avgProgress: number }> {
  const rows = await listWorkTasks({ personaKey });
  const total = rows.length;
  const done = rows.filter((r) => r.status === "done").length;
  const doing = rows.filter((r) => r.status === "doing").length;
  const todo = rows.filter((r) => r.status === "todo").length;
  const delayed = rows.filter((r) => r.status === "delayed").length;
  const avgProgress = total ? Math.round(rows.reduce((a, r) => a + (r.progress ?? 0), 0) / total) : 0;
  return { total, done, doing, todo, delayed, avgProgress };
}

import { normalizeDate } from "@/lib/dashboard/deadlines";
export { dueWithinDays, normalizeDate } from "@/lib/dashboard/deadlines";
