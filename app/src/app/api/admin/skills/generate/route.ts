import { NextRequest } from "next/server";
import { requireUser, requireAdmin, jsonError, HttpError } from "@/lib/auth/http";
import { generateSkillDraft, findRelatedSkills } from "@/lib/harness/skillgen";

// 자동 스킬 생성 — 사용자가 만들고 싶은 스킬의 목적을 받아
// 참조 데이터(대화·메모리·문서·기존 스킬) + (부족 시) 웹검색을 기반으로 스킬 초안 생성.
// 생성 결과는 초안이며, 저장은 기존 POST /api/admin/harness?type=skill 로 사용자가 확인 후 진행한다.
export async function POST(req: NextRequest) {
  try {
    const user = await requireUser(req); requireAdmin(user);
    const personaKey = (req.nextUrl.searchParams.get("personaKey") ?? "").trim();
    if (!personaKey) throw new HttpError(400, "personaKey 필요");
    const body = await req.json().catch(() => ({}));
    const topic = String(body.topic ?? "").trim();
    if (!topic) throw new HttpError(400, "topic(만들고 싶은 스킬의 목적) 필요");
    const useWeb = body.useWeb === true || body.useWeb === "true";
    const draft = await generateSkillDraft(topic, personaKey, { useWeb });
    const related = findRelatedSkills(personaKey, topic, draft.name).filter((r) => r.matched);
    return Response.json({ draft: { ...draft, relatedSkills: related } });
  } catch (e) { return jsonError(e); }
}
