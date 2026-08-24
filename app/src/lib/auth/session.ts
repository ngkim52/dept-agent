import { createHash, randomBytes, randomUUID } from "node:crypto";
import { db, schema } from "@/lib/db";
import { eq, and, gt, lt } from "drizzle-orm";
import type { User } from "@/lib/db/schema";
import { config } from "@/lib/config";

export async function createSession(userId: string): Promise<{ token: string; expiresAt: Date }> {
  const token = randomBytes(32).toString("base64url");
  const expiresAt = new Date(Date.now() + config.sessionTtlMs);
  // 만료 세션 게으른 정리 (테이블 무한 증가 방지)
  await db.delete(schema.sessions).where(lt(schema.sessions.expiresAt, new Date()));
  await db.insert(schema.sessions).values({
    id: randomUUID(),
    tokenHash: sha256(token),
    userId,
    expiresAt,
    createdAt: new Date(),
  });
  return { token, expiresAt };
}

export async function destroySession(token: string): Promise<void> {
  await db.delete(schema.sessions).where(eq(schema.sessions.tokenHash, sha256(token)));
}

export async function getUserBySessionToken(token: string | undefined | null): Promise<User | null> {
  if (!token) return null;
  const s = await db.query.sessions.findFirst({
    where: and(
      eq(schema.sessions.tokenHash, sha256(token)),
      gt(schema.sessions.expiresAt, new Date())
    ),
  });
  if (!s) return null;
  const user = await db.query.users.findFirst({ where: eq(schema.users.id, s.userId) });
  return user && user.status === "active" ? user : null;
}

export function sha256(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}
