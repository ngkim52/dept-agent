import { NextRequest } from "next/server";
import { getUserBySessionToken } from "@/lib/auth/session";
import type { User } from "@/lib/db/schema";
import { config } from "@/lib/config";

export async function requireUser(req: NextRequest): Promise<User> {
  const token = req.cookies.get(config.sessionCookieName)?.value;
  const user = await getUserBySessionToken(token);
  if (!user) throw new HttpError(401, "로그인이 필요합니다.");
  return user;
}

export function requireAdmin(user: User): void {
  if (user.role !== "admin") throw new HttpError(403, "관리자 권한이 필요합니다.");
}

export class HttpError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

export function jsonError(e: unknown) {
  if (e instanceof HttpError) {
    return Response.json({ error: e.message }, { status: e.status });
  }
  console.error("handler error:", e);
  return Response.json({ error: "서버 오류가 발생했습니다." }, { status: 500 });
}
