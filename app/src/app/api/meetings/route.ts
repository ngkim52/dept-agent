import { NextRequest } from "next/server";
import { randomUUID } from "node:crypto";
import { requireUser, jsonError, HttpError } from "@/lib/auth/http";
import { createMeeting, listMeetings, draftMinutes, updateMeeting, getMeeting } from "@/lib/meetings";

// GET /api/meetings?departmentId= — 목록
export async function GET(req: NextRequest) {
  try {
    const user = await requireUser(req);
    const departmentId = req.nextUrl.searchParams.get("departmentId") || user.departmentId || "";
    const items = await listMeetings(String(departmentId));
    return Response.json({ meetings: items });
  } catch (e) { return jsonError(e); }
}

// POST /api/meetings — 회의록 저장 (rawText, minutes, title, categoryKey)
export async function POST(req: NextRequest) {
  try {
    const user = await requireUser(req);
    const body = await req.json().catch(() => ({}));
    const rawText = String(body.rawText ?? "").trim();
    if (!rawText) return jsonError(new HttpError(400, "회의 원문이 필요합니다"));
    const minutes = Array.isArray(body.minutes) ? body.minutes : (draftMinutes(rawText).minutes);
    const title = String(body.title ?? "").trim() || `회의록 ${new Date().toLocaleDateString("ko-KR")}`;
    const meeting = await createMeeting({
      id: randomUUID(),
      departmentId: String(user.departmentId ?? "claims-planning"),
      title,
      categoryKey: body.categoryKey ? String(body.categoryKey) : null,
      rawText,
      minutesJson: JSON.stringify(minutes),
      sourceName: body.sourceName ? String(body.sourceName) : null,
      createdBy: user.id,
    });
    return Response.json({ meeting });
  } catch (e) { return jsonError(e); }
}

// PATCH /api/meetings/:id — 편집
export async function PATCH(req: NextRequest) {
  try {
    const user = await requireUser(req);
    const id = req.nextUrl.pathname.split("/").pop() || "";
    const body = await req.json().catch(() => ({}));
    if (!id) return jsonError(new HttpError(400, "id 필요"));
    const meeting = await updateMeeting(id, {
      title: body.title !== undefined ? String(body.title) : undefined,
      rawText: body.rawText !== undefined ? String(body.rawText) : undefined,
      minutesJson: body.minutes ? JSON.stringify(body.minutes) : undefined,
      categoryKey: body.categoryKey !== undefined ? String(body.categoryKey) : undefined,
      sourceName: body.sourceName !== undefined ? String(body.sourceName) : undefined,
    });
    return Response.json({ meeting });
  } catch (e) { return jsonError(e); }
}
