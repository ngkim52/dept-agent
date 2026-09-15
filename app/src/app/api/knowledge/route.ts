import { NextRequest } from "next/server";
import { requireUser, jsonError } from "@/lib/auth/http";
import { RagflowClient } from "@/lib/ragflow/client";
import { db, schema } from "@/lib/db";

// GET /api/knowledge — 지식베이스 개요: RAGFlow 데이터셋 + 로컬 지식 저장소 규모
export async function GET(req: NextRequest) {
  try {
    const user = await requireUser(req);
    let datasets: { id: string; name: string; docs?: number }[] = [];
    try { datasets = await new RagflowClient().listDatasets(); } catch { datasets = []; }
    const [prompts, skills, memories, candidates] = await Promise.all([
      db.select().from(schema.knowledgePrompts),
      db.select().from(schema.knowledgeSkills),
      db.select().from(schema.knowledgeMemories),
      db.select().from(schema.improvementCandidates),
    ]);
    return Response.json({
      datasets,
      local: {
        prompts: prompts.length, skills: skills.length, memories: memories.length,
        pendingCandidates: candidates.filter(c => c.status === "pending").length,
      },
      isAdmin: user.role === "admin",
    });
  } catch (e) { return jsonError(e); }
}
