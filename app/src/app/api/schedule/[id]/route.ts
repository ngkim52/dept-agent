import { NextRequest } from "next/server";
import { requireUser, jsonError } from "@/lib/auth/http";
import { deleteDirectorSchedule } from "@/lib/harness/directorSchedule";

// DELETE /api/schedule/[id] — 일정 삭제
export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireUser(req);
    const { id } = await params;
    return Response.json({ ok: await deleteDirectorSchedule(id) });
  } catch (e) { return jsonError(e); }
}
