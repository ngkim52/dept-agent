import { NextRequest } from "next/server";
import { requireUser, requireAdmin, jsonError } from "@/lib/auth/http";
import { exportKnowledge, importKnowledge } from "@/lib/harness/backup";

// GET → 전체 백업 JSON 다운로드 / POST → 업로드 복원
export async function GET(req: NextRequest) {
  try {
    const user = await requireUser(req); requireAdmin(user);
    const data = await exportKnowledge();
    return Response.json(data);
  } catch (e) { return jsonError(e); }
}
export async function POST(req: NextRequest) {
  try {
    const user = await requireUser(req); requireAdmin(user);
    const body = await req.json().catch(() => ({}));
    const result = await importKnowledge(body);
    return Response.json(result);
  } catch (e) { return jsonError(e); }
}
