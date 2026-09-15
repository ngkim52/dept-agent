import { NextRequest } from "next/server";
import { requireUser, requireAdmin, jsonError } from "@/lib/auth/http";
import { getDryrunQuestionBank } from "@/lib/harness/dryrun";

// 업무별 드라이런 평가 질문 목록
export async function GET(req: NextRequest) {
  try {
    const user = await requireUser(req); requireAdmin(user);
    return Response.json({ categories: getDryrunQuestionBank() });
  } catch (e) { return jsonError(e); }
}
