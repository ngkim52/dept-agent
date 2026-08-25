import { NextRequest } from "next/server";
import { db, schema } from "@/lib/db";
import { and, eq } from "drizzle-orm";
import { requireUser, jsonError, HttpError } from "@/lib/auth/http";
import { deleteUpload } from "@/lib/uploads";

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireUser(req);
    const { id } = await params;
    const doc = await db.query.documents.findFirst({ where: and(eq(schema.documents.id, id), eq(schema.documents.userId, user.id)) });
    if (!doc) throw new HttpError(404, "문서가 없습니다.");
    await db.delete(schema.documents).where(eq(schema.documents.id, id));
    await deleteUpload(id);
    return Response.json({ ok: true });
  } catch (e) { return jsonError(e); }
}
