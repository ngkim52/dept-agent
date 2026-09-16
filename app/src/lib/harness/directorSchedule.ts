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

export async function createDirectorSchedule(input: Partial<NewScheduleItem>, createdBy?: string): Promise<ScheduleItem> {
  const id = randomUUID();
  const t = now();
  const row: NewScheduleItem = {
    id,
    date: input.date ?? "",
    time: input.time ?? null,
    title: input.title ?? "",
    note: input.note ?? null,
    createdBy: createdBy ?? null,
    createdAt: t,
    updatedAt: t,
  };
  await db.insert(schema.directorSchedule).values(row);
  const rows = await db.select().from(schema.directorSchedule).where(eq(schema.directorSchedule.id, id)).limit(1);
  return rows[0];
}

export async function deleteDirectorSchedule(id: string): Promise<boolean> {
  const rows = await db.select({ id: schema.directorSchedule.id }).from(schema.directorSchedule).where(eq(schema.directorSchedule.id, id)).limit(1);
  if (!rows[0]) return false;
  await db.delete(schema.directorSchedule).where(eq(schema.directorSchedule.id, id));
  return true;
}
