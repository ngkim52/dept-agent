// 부서장 일정 캘린더 — 부서장이 직접 입력하는 일정 CRUD (018-C)
import { randomUUID } from "node:crypto";
import { db, schema } from "@/lib/db";
import { eq, desc } from "drizzle-orm";

function now() { return new Date(); }

export type ScheduleItem = schema.DirectorSchedule;
export type NewScheduleItem = schema.NewDirectorSchedule;

export async function listDirectorSchedule(): Promise<ScheduleItem[]> {
  const rows = await db.select().from(schema.directorSchedule).orderBy(desc(schema.directorSchedule.date));
  return rows;
}

export async function getDirectorSchedule(id: string): Promise<ScheduleItem | null> {
  const rows = await db.select().from(schema.directorSchedule).where(eq(schema.directorSchedule.id, id)).limit(1);
  return rows[0] ?? null;
}

export async function createDirectorSchedule(input: Partial<NewScheduleItem>, createdBy?: string): Promise<ScheduleItem> {
  const id = randomUUID();
  const t = now();
  const row: NewScheduleItem = {
    id,
    date: input.date ?? "",
    time: input.time ?? null,
    title: input.title ?? "",
    note: input.note ?? null,
    attendees: input.attendees ?? null,
    location: input.location ?? null,
    createdBy: createdBy ?? null,
    createdAt: t,
    updatedAt: t,
  };
  await db.insert(schema.directorSchedule).values(row);
  const rows = await db.select().from(schema.directorSchedule).where(eq(schema.directorSchedule.id, id)).limit(1);
  return rows[0];
}

/** 일정 수정 — 전달된 필드만 갱신 (참석자·장소 포함) */
export async function updateDirectorSchedule(id: string, input: Partial<NewScheduleItem>): Promise<ScheduleItem | null> {
  const before = await getDirectorSchedule(id);
  if (!before) return null;
  const patch: Partial<NewScheduleItem> = { updatedAt: now() };
  if (input.date !== undefined) patch.date = input.date;
  if (input.time !== undefined) patch.time = input.time;
  if (input.title !== undefined) patch.title = input.title;
  if (input.note !== undefined) patch.note = input.note;
  if (input.attendees !== undefined) patch.attendees = input.attendees;
  if (input.location !== undefined) patch.location = input.location;
  await db.update(schema.directorSchedule).set(patch).where(eq(schema.directorSchedule.id, id));
  return getDirectorSchedule(id);
}

export async function deleteDirectorSchedule(id: string): Promise<boolean> {
  const rows = await db.select({ id: schema.directorSchedule.id }).from(schema.directorSchedule).where(eq(schema.directorSchedule.id, id)).limit(1);
  if (!rows[0]) return false;
  await db.delete(schema.directorSchedule).where(eq(schema.directorSchedule.id, id));
  return true;
}
