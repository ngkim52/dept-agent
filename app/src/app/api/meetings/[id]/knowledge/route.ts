import { NextRequest } from "next/server";
import { requireUser, jsonError, HttpError } from "@/lib/auth/http";
import { getMeeting, applyMeetingToRagflow } from "@/lib/meetings";

/** POST /api/meetings/:id/knowledge — 회의록(MD)을 RAGFlow <회의록> 데이터셋에 적재 + 파싱
 *  이후 대화에서 "언제 어떤 논의·결정"을 RAG 검색으로 조회할 수 있다. */
export async function POST(req: NextRequest) {
  try {
    const user = await requireUser(req);
    const id = req.nextUrl.pathname.split("/").filter(Boolean).slice(-2, -1)[0] || "";
    if (!id) return jsonError(new HttpError(400, "meeting id 필요"));
    const meeting = await getMeeting(id);
    if (!meeting) return jsonError(new HttpError(404, "회의록을 찾을 수 없습니다"));
    if (meeting.createdBy && meeting.createdBy !== user.id && user.role !== "admin")
      return jsonError(new HttpError(403, "권한이 없습니다"));
    if (meeting.knowledgeApplied) return Response.json({ ok: true, already: true });
    const { datasetId, docId, filename } = await applyMeetingToRagflow(meeting);
    return Response.json({ ok: true, datasetId, docId, filename });
  } catch (e) { return jsonError(e); }
}
