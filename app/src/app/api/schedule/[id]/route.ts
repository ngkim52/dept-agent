import { NextRequest } from "next/server";
import { requireUser, jsonError, HttpError } from "@/lib/auth/http";
import { deleteDirectorSchedule, updateDirectorSchedule } from "@/lib/harness/directorSchedule";

// PUT /api/schedule/[id] — 일정 수정 (제목·시간·참석자·장소·메모)
export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireUser(req);
    const { id } = await params;
    const body = await req.json().catch(() => ({}));
    const patch: Record<string, string | undefined> = {};
    if (body.date !== undefined) patch.date = String(body.date);
    if (body.time !== undefined) patch.time = body.time ? String(body.time) : undefined;
    if (body.title !== undefined) patch.title = String(body.title);
    if (body.note !== undefined) patch.note = body.note ? String(body.note) : undefined;
    if (body.attendees !== undefined) patch.attendees = body.attendees ? String(body.attendees) : undefined;
    if (body.location !== undefined) patch.location = body.location ? String(body.location) : undefined;
    if (patch.title !== undefined && !patch.title) throw new HttpError(400, "title은 비울 수 없습니다.");
    const item = await updateDirectorSchedule(id, patch);
    if (!item) throw new HttpError(404, "일정을 찾을 수 없습니다.");
    return Response.json({ item });
  } catch (e) { return jsonError(e); }
}

// DELETE /api/schedule/[id] — 일정 삭제
export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireUser(req);
    const { id } = await params;
    return Response.json({ ok: await deleteDirectorSchedule(id) });
  } catch (e) { return jsonError(e); }
}
