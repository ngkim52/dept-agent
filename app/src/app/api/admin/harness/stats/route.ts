import { NextRequest } from "next/server";
import { requireUser, requireAdmin, jsonError } from "@/lib/auth/http";
import { db, schema } from "@/lib/db";

// GET /api/admin/harness/stats — 하네스 파이프라인 스테이지별 집계
export async function GET(req: NextRequest) {
  try {
    const user = await requireUser(req); requireAdmin(user);
    const counts = async (t: any, wh?: (row: any, { eq }: any) => any) => (await db.select().from(t)).length;
    const candidates = await db.select().from(schema.improvementCandidates);
    const prompts = await db.select().from(schema.knowledgePrompts);
    const skills = await db.select().from(schema.knowledgeSkills);
    const memories = await db.select().from(schema.knowledgeMemories);
    const episodes = await db.select().from(schema.episodes);
    const edges = await db.select().from(schema.knowledgeEdges);
    const versions = await db.select().from(schema.knowledgeVersions);
    const p = (arr: any[], k: string) => arr.filter(x => x.status === k).length;
    const active = (arr: any[]) => arr.filter(x => x.active !== false).length;
    return Response.json({
      pipeline: [
        { stage: "수집", label: "에피소드", key: "episode", value: episodes.length },
        { stage: "후보", label: "후보", key: "candidate", value: candidates.length, pending: p(candidates, "pending"), applied: p(candidates, "applied"), rejected: p(candidates, "rejected") },
        { stage: "승인·적용", label: "적용된 지식", key: "applied", value: p(candidates, "applied") },
        { stage: "주입", label: "활성 프롬프트", key: "prompt", value: active(prompts) },
        { stage: "주입", label: "활성 스킬", key: "skill", value: active(skills) },
        { stage: "주입", label: "활성 메모리", key: "memory", value: active(memories) },
      ],
      edges: edges.length,
      versions: versions.length,
      pendingCandidates: p(candidates, "pending"),
    });
  } catch (e) { return jsonError(e); }
}
