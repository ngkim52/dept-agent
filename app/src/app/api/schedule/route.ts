import { NextRequest } from "next/server";
import { requireUser, jsonError, HttpError } from "@/lib/auth/http";
import { listDirectorSchedule, createDirectorSchedule } from "@/lib/harness/directorSchedule";

// GET /api/schedule — 부서장 일정 전체 조회
export async function GET(req: NextRequest) {
  try {
    const user = await requireUser(req);
    return Response.json({ items: await listDirectorSchedule() });
  } catch (e) { return jsonError(e); }
}

// POST /api/schedule — 부서장 일정 직접 입력
export async function POST(req: NextRequest) {
  try {
    const user = await requireUser(req);
    const body = await req.json().catch(() => ({}));
    if (!body.title || !body.date) throw new HttpError(400, "date/title 필요");
    const item = await createDirectorSchedule({
      date: String(body.date),
      time: body.time ? String(body.time) : undefined,
      title: String(body.title),
      note: body.note ? String(body.note) : undefined,
    }, user.id);
    return Response.json({ item });
  } catch (e) { return jsonError(e); }
}
