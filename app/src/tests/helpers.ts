// 테스트 공용 헬퍼: 테이블 초기화
import { db, schema } from "@/lib/db";
import { randomUUID } from "node:crypto";

export async function resetDb() {
  await db.delete(schema.messages);
  await db.delete(schema.sessions);
  await db.delete(schema.conversations);
  await db.delete(schema.documents);
  await db.delete(schema.appSettings);
  await db.delete(schema.users);
  await db.delete(schema.departments);
}

export function newUserId() {
  return randomUUID();
}

// 라우트 호출용 헬퍼
export async function withUser(opts: {
  email?: string; name?: string; role?: "user" | "admin"; status?: "active" | "pending" | "rejected";
  departmentId?: string | null;
}) {
  const id = newUserId();
  const email = opts.email ?? `u${id.slice(0, 8)}@shinhan.com`;
  const user = {
    id,
    email,
    name: opts.name ?? "테스터",
    passwordHash: "x",
    role: (opts.role ?? "user") as "user" | "admin",
    status: (opts.status ?? "active") as "active" | "pending" | "rejected",
    departmentId: opts.departmentId ?? "claims-planning",
    createdAt: new Date(),
  };
  await db.insert(schema.users).values(user);
  return user;
}

export async function withDept() {
  const d = {
    id: "claims-planning",
    name: "보험금심사기획",
    personaKey: "claims-planning",
    ragflowDatasetId: "ds-test",
    isActive: true,
    createdAt: new Date(),
  };
  await db.insert(schema.departments).values(d).onConflictDoNothing();
  return d;
}
