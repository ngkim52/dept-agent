import { NextRequest } from "next/server";
import { requireUser, jsonError } from "@/lib/auth/http";
import { getWorkTask, updateWorkTask, listWorkTasks } from "@/lib/harness/workQueue";

// GET /api/workqueue/[id] — 단건 조회
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireUser(req);
    const { id } = await params;
    return Response.json({ task: await getWorkTask(id) });
  } catch (e) { return jsonError(e); }
}

// PATCH /api/workqueue/[id] — 진행률/상태/내용 갱신 (+RAG 동기화)
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireUser(req);
    const { id } = await params;
    const body = await req.json().catch(() => ({}));
    const patch: any = {};
    if (body.status) patch.status = body.status;
    if (typeof body.progress === "number") patch.progress = body.progress;
    if (typeof body.content === "string") patch.content = body.content;
    if (typeof body.assignee !== "undefined") patch.assignee = body.assignee;
    if (typeof body.dueDate !== "undefined") patch.dueDate = body.dueDate;
    const task = await updateWorkTask(id, patch);
    return Response.json({ task });
  } catch (e) { return jsonError(e); }
}
