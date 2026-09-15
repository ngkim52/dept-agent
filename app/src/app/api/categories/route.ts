import { NextRequest } from "next/server";
import { requireUser, jsonError } from "@/lib/auth/http";
import { getCategories } from "@/lib/catalog";

export async function GET(req: NextRequest) {
  try {
    const user = await requireUser(req);
    const personaKey = user.departmentId ?? "claims-planning";
    const cats = getCategories(personaKey)
      .filter(c => c.no !== 0) // 기타 카드 제외 (자유 대화 = 기본)
      .map(c => ({ key: c.key, label: c.no ? `${c.no}. ${c.label}` : c.label, no: c.no, labelShort: c.label }));
    return Response.json({ categories: cats });
  } catch (e) { return jsonError(e); }
}
