import { NextRequest } from "next/server";
import { randomUUID } from "node:crypto";
import { requireUser, jsonError, HttpError } from "@/lib/auth/http";
import { createMeeting, parseMinutesMarkdown } from "@/lib/meetings";

// POST /api/meetings/md — 회의록 Markdown 저장 (MD 파싱 → DB). RAGFlow 적재는 /api/meetings/:id/knowledge
export async function POST(req: NextRequest) {
  try {
    const user = await requireUser(req);
    const body = await req.json().catch(() => ({}));
    const md = String(body.md ?? "").trim();
    if (!md) return jsonError(new HttpError(400, "회의록(MD)이 필요합니다"));
    const parsed = parseMinutesMarkdown(md);
    const title = String(body.title ?? "").trim() || parsed.title || `회의록 ${new Date().toLocaleDateString("ko-KR")}`;
    // DB minutesJson 은 parseMinutesMarkdown 결과로 통일
    const meeting = await createMeeting({
      id: randomUUID(),
      departmentId: String(user.departmentId ?? "claims-planning"),
      title,
      categoryKey: body.categoryKey ? String(body.categoryKey) : null,
      rawText: md,
      minutesJson: JSON.stringify(parsed.minutes),
      sourceName: body.sourceName ? String(body.sourceName) : null,
      createdBy: user.id,
    });
    return Response.json({ meeting });
  } catch (e) { return jsonError(e); }
}
