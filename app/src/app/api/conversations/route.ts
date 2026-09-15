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
    return Response.json({ conversations: list.map(c => ({ id: c.id, title: c.title, departmentId: c.departmentId, categoryKey: c.categoryKey, categoryLabel: c.categoryLabel, createdAt: c.createdAt, lastMessage: c.messages?.[0]?.content ?? null })) });
  } catch (e) { return jsonError(e); }
}

export async function POST(req: NextRequest) {
  try {
    const user = await requireUser(req);
    const body = await req.json().catch(() => ({}));
    // 보안(P2-B6): 비관리자는 반드시 서버의 user.departmentId를 사용. null이면 차단.
    const departmentId = user.role === "admin"
      ? String(body.departmentId ?? "")
      : user.departmentId;
    if (user.role !== "admin" && !departmentId) {
      return Response.json({ error: "부서 정보가 없습니다. 관리자에게 문의하세요." }, { status: 400 });
    }
    if (!departmentId) return Response.json({ error: "부서가 필요합니다." }, { status: 400 });
    const title = String(body.title ?? "새 대화");
    // 업무 카드 스코프 (컨셉 §05) — 검증은 클라이언트 카탈로그와 서버 공통 로직으로
    let catKey: string | null = null;
    let catLabel: string | null = null;
    try {
      const ck = String(body.categoryKey ?? "").trim() || null;
      if (ck) {
        const { getCategory } = await import("@/lib/catalog");
        const cat = getCategory(departmentId, ck);
        if (cat) { catKey = ck; catLabel = cat.label; }
      }
    } catch { /* 카탈로그 로드 실패 시 카테고리 미사용 */ }
    const conv = { id: randomUUID(), userId: user.id, departmentId, title, categoryKey: catKey, categoryLabel: catLabel, createdAt: new Date() };
    await db.insert(schema.conversations).values(conv);
    return Response.json({ conversation: conv }, { status: 201 });
  } catch (e) { return jsonError(e); }
}
