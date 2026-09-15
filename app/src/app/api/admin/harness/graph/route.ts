import { NextRequest } from "next/server";
import { requireUser, requireAdmin, jsonError } from "@/lib/auth/http";
import { listEdges } from "@/lib/harness/review";

// 노드 종류 사람이 읽는 이름
const TYPE_LABEL: Record<string, string> = {
  memory: "메모리",
  prompt: "규칙",
  skill: "스킬",
  episode: "에피소드",
  candidate: "후보",
  conversation: "대화",
};

function clip(s: string, n: number): string {
  return s.replace(/\s+/g, " ").length <= n ? s.replace(/\s+/g, " ") : s.replace(/\s+/g, " ").slice(0, n) + "…";
}

export async function GET(req: NextRequest) {
  try {
    const user = await requireUser(req); requireAdmin(user);
    const fromType = req.nextUrl.searchParams.get("fromType") ?? undefined;
    const fromId = req.nextUrl.searchParams.get("fromId") ?? undefined;
    const edges = await listEdges(fromType, fromId);

    // 노드 라벨 조회: 메모리/규칙/스킬/에피소드/후보 → 사람이 읽는 제목·내용 일부
    const { listPrompts, listSkills, listMemories } = await import("@/lib/harness/store");
    const labelMap = new Map<string, { label: string; kindLabel: string }>();
    const add = (type: string, id: string, name: string, snippet: string) => {
      const key = `${type}:${id}`;
      if (!labelMap.has(key)) labelMap.set(key, { label: clip(snippet || name || id, 22) + (name && name !== snippet ? "" : ""), kindLabel: TYPE_LABEL[type] ?? type });
    };
    const [memories, prompts, skills] = await Promise.all([
      listMemories(), listPrompts(), listSkills(),
    ]);
    for (const m of memories) if (m.active) add("memory", m.id, "", m.content);
    for (const pr of prompts) if (pr.active) add("prompt", pr.id, pr.title || "", pr.content);
    for (const sk of skills) if (sk.active) add("skill", sk.id, sk.name || "", sk.description || "");
    for (const e of edges) {
      if (!labelMap.has(`${e.toType}:${e.toId}`)) add(e.toType, e.toId, "", e.toId);
      if (!labelMap.has(`${e.fromType}:${e.fromId}`)) add(e.fromType, e.fromId, "", e.fromId);
    }

    return Response.json({ edges, types: TYPE_LABEL, nodes: Object.fromEntries(labelMap) });
  } catch (e) { return jsonError(e); }
}
