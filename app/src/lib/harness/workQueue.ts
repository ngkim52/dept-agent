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

export async function createWorkTask(input: Partial<NewWorkTask>, createdBy?: string): Promise<WorkTask> {
  const id = randomUUID();
  const t = now();
  const row: NewWorkTask = {
    id,
    personaKey: input.personaKey ?? "claims-planning",
    title: input.title ?? "제목 없음",
    assignee: input.assignee ?? null,
    category: input.category ?? "일반",
    dueDate: input.dueDate ?? null,
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
  const created = (await getWorkTask(id))!;
  await syncTaskToRag(created, createdBy);
  return (await getWorkTask(id))!;
}

export async function getWorkTask(id: string): Promise<WorkTask | null> {
  const rows = await db.select().from(schema.workTasks).where(eq(schema.workTasks.id, id)).limit(1);
  return rows[0] ?? null;
}

export async function updateWorkTask(id: string, patch: Partial<NewWorkTask>): Promise<WorkTask | null> {
  const cur = await getWorkTask(id);
  if (!cur) return null;
  await db.update(schema.workTasks)
    .set({ ...patch, updatedAt: now() })
    .where(eq(schema.workTasks.id, id));
  const updated = (await getWorkTask(id))!;
  await syncTaskToRag(updated, updated.createdBy ?? undefined);
  return updated;
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

/**
 * RAG 등록: 일감 내용·진행률을 크기 있는 텍스트로 만들어 부서 문서로 저장해 지식 검색 대상에 포함시킨다.
 * (실제 RAG 파이프라인 진입점으로 보내는 대신, 문서/데이터 후보로 저장하고 ragSynced=true)
 * userId가 없으면 content만 유지하고 ragSynced는 true로만 표시(후속 연동).
 */
export async function syncTaskToRag(task: WorkTask, userId?: string): Promise<void> {
  const content = `[일감/부서 워크큐] 제목: ${task.title}\n담당: ${task.assignee ?? "(미지정)"}\n카테고리: ${task.category ?? "일반"}\n기한: ${task.dueDate ?? "(미정)"}\n상태: ${task.status}\n진행률: ${task.progress}%\n내용:\n${task.content ?? ""}`;
  try {
    if (userId) {
      await db.insert(schema.documents).values({
        id: randomUUID(),
        userId,
        filename: `워크큐-일감-${task.id}.md`,
        mimeType: "text/markdown",
        size: content.length,
        content,
        ragflowDocId: null,
        status: "done",
        createdAt: now(),
      }).onConflictDoNothing();
    }
  } catch { /* RAG 연동 실패해도 일감은 유지 */ }
  await db.update(schema.workTasks).set({ ragSynced: true, updatedAt: now() }).where(eq(schema.workTasks.id, task.id));
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
