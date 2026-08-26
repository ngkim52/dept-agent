import { NextRequest } from "next/server";
import { db, schema } from "@/lib/db";
import { and, eq } from "drizzle-orm";
import { requireUser, jsonError, HttpError } from "@/lib/auth/http";

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireUser(req);
    const { id } = await params;
    const conv = await db.query.conversations.findFirst({ where: and(eq(schema.conversations.id, id), eq(schema.conversations.userId, user.id)) });
    if (!conv) throw new HttpError(404, "대화가 없습니다.");
    const msgs = await db.query.messages.findMany({ where: eq(schema.messages.conversationId, conv.id), orderBy: (m, { asc }) => [asc(m.createdAt)] });
    return Response.json({ conversation: conv, messages: msgs });
  } catch (e) { return jsonError(e); }
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireUser(req);
    const { id } = await params;
    const conv = await db.query.conversations.findFirst({ where: and(eq(schema.conversations.id, id), eq(schema.conversations.userId, user.id)) });
    if (!conv) throw new HttpError(404, "대화가 없습니다.");
    // 보안(P2-B15): 메시지+대화 삭제를 트랜잭션으로 — 고아 메시지 방지
    await db.transaction(async (tx) => {
      await tx.delete(schema.messages).where(eq(schema.messages.conversationId, conv.id));
      await tx.delete(schema.conversations).where(eq(schema.conversations.id, conv.id));
    });
    return Response.json({ ok: true });
  } catch (e) { return jsonError(e); }
}
