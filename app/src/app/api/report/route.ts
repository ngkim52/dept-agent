import { NextRequest } from "next/server";
import { requireUser, jsonError, HttpError } from "@/lib/auth/http";
import { db, schema } from "@/lib/db";
import { eq, and } from "drizzle-orm";
import { buildReportDraft } from "@/lib/dashboard/report";

export async function POST(req: NextRequest) {
  try {
    const user = await requireUser(req);
    const body = await req.json().catch(() => ({}));
    const conversationId = String(body.conversationId ?? "");
    if (!conversationId) throw new HttpError(400, "conversationId 필요");
    const conv = await db.query.conversations.findFirst({ where: eq(schema.conversations.id, conversationId) });
    if (!conv || conv.userId !== user.id) throw new HttpError(404, "대화를 찾을 수 없습니다.");
    const msgs = await db.query.messages.findMany({ where: eq(schema.messages.conversationId, conversationId) });
    const ordered = [...msgs].sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());
    const draft = buildReportDraft(ordered.map((m) => ({ role: m.role, content: m.content })));
    return Response.json({ draft });
  } catch (e) { return jsonError(e); }
}
