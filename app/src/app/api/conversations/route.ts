import { NextRequest } from "next/server";
import { randomUUID } from "node:crypto";
import { db, schema } from "@/lib/db";
import { eq } from "drizzle-orm";
import { requireUser, jsonError } from "@/lib/auth/http";

export async function GET(req: NextRequest) {
  try {
    const user = await requireUser(req);
    const list = await db.query.conversations.findMany({
      where: eq(schema.conversations.userId, user.id),
      orderBy: (c, { desc }) => [desc(c.createdAt)],
      with: { messages: { orderBy: (m, { desc }) => [desc(m.createdAt)], limit: 1 } },
    });
    return Response.json({ conversations: list.map(c => ({ id: c.id, title: c.title, departmentId: c.departmentId, createdAt: c.createdAt, lastMessage: c.messages?.[0]?.content ?? null })) });
  } catch (e) { return jsonError(e); }
}

export async function POST(req: NextRequest) {
  try {
    const user = await requireUser(req);
    const body = await req.json().catch(() => ({}));
    // 일반 사용자는 가입 부서를 자동 사용, 관리자는 로그인 시 선택한 부서를 명시적으로 사용
    const departmentId = user.role === "admin"
      ? String(body.departmentId ?? "")
      : (user.departmentId ?? String(body.departmentId ?? ""));
    if (!departmentId) return Response.json({ error: "부서가 필요합니다." }, { status: 400 });
    const title = String(body.title ?? "새 대화");
    const conv = { id: randomUUID(), userId: user.id, departmentId, title, createdAt: new Date() };
    await db.insert(schema.conversations).values(conv);
    return Response.json({ conversation: conv }, { status: 201 });
  } catch (e) { return jsonError(e); }
}
