import { NextRequest } from "next/server";
import { db, schema } from "@/lib/db";
import { eq } from "drizzle-orm";
import { jsonError } from "@/lib/auth/http";

// 공개 API: 비로그인(가입 화면)에서도 부서 목록을 조회할 수 있어야 한다.
// 활성 부서만 노출되며 민감 정보는 없다.
export async function GET(req: NextRequest) {
  try {
    const deps = await db.query.departments.findMany({ where: eq(schema.departments.isActive, true) });
    return Response.json({ departments: deps });
  } catch (e) { return jsonError(e); }
}
