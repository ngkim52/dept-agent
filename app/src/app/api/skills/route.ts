import { NextRequest } from "next/server";
import { getPersonaSkills } from "@/lib/agent/skills";
import { requireUser, jsonError } from "@/lib/auth/http";

// 슬래시 커맨드용: 사용 가능한 스킬 + 기능 목록 (요구 6)
export async function GET(req: NextRequest) {
  try {
    const user = await requireUser(req);
    const departmentId = user.role === "admin" ? null : user.departmentId;
    const skills = departmentId ? getPersonaSkills(departmentId) : [
      ...getPersonaSkills("claims-planning"),
      ...getPersonaSkills("actuarial"),
    ];
    return Response.json({
      skills: skills.map((s) => ({ name: s.name, description: s.description })),
      features: [
        { name: "/웹검색", description: "웹에서 최신 정보 검색 (옵션: 검색할 내용)" },
        { name: "/자료", description: "내 자료 관리 화면 열기" },
        { name: "/새대화", description: "새 대화 시작" },
        { name: "/생각", description: "추론 수준 변경 (off/minimal/low/medium/high)" },
      ],
    });
  } catch (e) { return jsonError(e); }
}
