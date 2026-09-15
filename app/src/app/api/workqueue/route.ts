import { NextRequest } from "next/server";
import { requireUser, jsonError, HttpError } from "@/lib/auth/http";
import { listWorkTasks, createWorkTask, taskStats } from "@/lib/harness/workQueue";

// GET /api/workqueue?personaKey=&status= — 부서 워크큐 목록 + 집계
export async function GET(req: NextRequest) {
  try {
    const user = await requireUser(req);
    const personaKey = req.nextUrl.searchParams.get("personaKey") ?? undefined;
    const status = (req.nextUrl.searchParams.get("status") ?? undefined) as any;
    const tasks = await listWorkTasks({ personaKey, status });
    const stats = await taskStats(personaKey);
    return Response.json({ tasks, stats });
  } catch (e) { return jsonError(e); }
}

// POST /api/workqueue — 일감 생성 (부서원 직접 or 부서장 의견에서 등록)
export async function POST(req: NextRequest) {
  try {
    const user = await requireUser(req);
    const body = await req.json().catch(() => ({}));
    if (!body.title) throw new HttpError(400, "title 필요");
    const task = await createWorkTask({
      personaKey: String(body.personaKey ?? user.departmentId ?? "claims-planning"),
      title: String(body.title),
      assignee: body.assignee ? String(body.assignee) : undefined,
      category: body.category ? String(body.category) : undefined,
      dueDate: body.dueDate ? String(body.dueDate) : undefined,
      source: body.source ?? "direct",
      directorNoteRef: body.directorNoteRef ? String(body.directorNoteRef) : undefined,
      content: body.content ? String(body.content) : undefined,
    }, user.id);
    return Response.json({ task });
  } catch (e) { return jsonError(e); }
}
