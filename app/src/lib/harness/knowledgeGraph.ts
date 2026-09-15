// 지식 하네스 — 지식 그래프: LLM이 데이터 간 관계를 판단·저장
// 활성 지식(메모리·규칙·스킬)을 LLM이 보고 연관/지원/충돌/전제 관계를 제안하면
// knowledge_edges에 저장한다. 사람이 직접 연결을 만들 필요가 없다.
// LLM 호출은 테스트에서 call 파라미터로 주입 가능.

export type EdgeRel = "derives" | "refutes" | "supports" | "related" | "source_of";
export const REL_LABEL: Record<string, string> = {
  derives: "파생",
  refutes: "충돌",
  supports: "지지",
  related: "연관",
  source_of: "출처",
};

export interface GraphItem { type: "memory" | "prompt" | "skill"; id: string; label: string; content: string; }
export interface ProposedEdge { fromType: GraphItem["type"]; fromId: string; toType: GraphItem["type"]; toId: string; rel: EdgeRel; reason: string; }

const JSON_FENCE = /```(?:json)?\s*([\s\S]*?)\s*```/;

/** 활성 지식 항목 수집 (메모리·규칙·스킬) */
export async function collectGraphItems(personaKey: string): Promise<GraphItem[]> {
  const { listMemories, listPrompts, listSkills } = await import("@/lib/harness/store");
  const [mems, pros, skis] = await Promise.all([listMemories(personaKey), listPrompts(personaKey), listSkills(personaKey)]);
  const act = (x: any) => x.active !== false;
  const out: GraphItem[] = [];
  for (const m of mems) if (act(m)) out.push({ type: "memory", id: m.id, label: "메모리·" + clip(m.content), content: m.content });
  for (const p of pros) if (act(p)) out.push({ type: "prompt", id: p.id, label: "규칙·" + (p.title || clip(p.content)), content: p.title + "\n" + p.content });
  for (const s of skis) if (act(s)) out.push({ type: "skill", id: s.id, label: "스킬·" + s.name, content: (s.description || "") + "\n" + s.content });
  return out;
}

function clip(s: string, n = 40): string { const t = String(s ?? "").replace(/\s+/g, " "); return t.length <= n ? t : t.slice(0, n) + "…"; }

export async function proposeGraphRelations(personaKey: string, items: GraphItem[], call: (p: string) => Promise<string>): Promise<ProposedEdge[]> {
  const list = items.map((it, i) => `${i} | type=${it.type} id=${it.id} | ${it.label} | 내용: ${clip(it.content, 120)}`).join("\n");
  const prompt = [
    "보험금기획팀 지식 그래프를 구성합니다. 아래 활성 지식 항목 목록을 보고, 의미상 연관되는 쌍만 골라 관계를 제안하세요.",
    "관계 종류: derives(파생/이끌어냄), refutes(충돌/반박), supports(지지/보완), related(연관), source_of(출처가 됨).",
    "무관한 항목끼리는 연결하지 마세요. 최대 12개, 분명한 연관이 없으면 빈 배열을 반환하세요.",
    "JSON만 반환: edges 배열, 원소={fromType, fromId, toType, toId, rel, reason}. 분명한 연관 없으면 빈 배열.",
    "--- 항목 목록 ---\n" + list,
  ].join("\n");
  const raw = (await call(prompt)).trim();
  const m = raw.match(JSON_FENCE);
  const body = (m ? m[1] : raw).replace(/^[^\[{]*/, "").trim();
  const j = JSON.parse(body);
  const ids = new Set(items.map((it) => it.id));
  const valid: EdgeRel[] = ["derives", "refutes", "supports", "related", "source_of"];
  const edges: ProposedEdge[] = [];
  for (const e of (j.edges ?? [])) {
    if (!e?.fromId || !e?.toId || e.fromId === e.toId) continue;
    if (!ids.has(e.fromId) || !ids.has(e.toId)) continue;
    const rel = valid.includes(e.rel) ? e.rel : "related";
    const fromItem = items.find((it) => it.id === e.fromId); const toItem = items.find((it) => it.id === e.toId);
    if (!fromItem || !toItem) continue;
    edges.push({ fromType: fromItem.type, fromId: e.fromId, toType: toItem.type, toId: e.toId, rel, reason: String(e.reason ?? "") });
  }
  return edges;
}

/** LLM 관계 제안 → 지식 그래프에 저장 (기존 미존재 연결만 추가) */
export async function buildGraphWithLLM(personaKey: string, call?: (p: string) => Promise<string>): Promise<{ proposed: number; added: number; edges: ProposedEdge[] }> {
  const items = await collectGraphItems(personaKey);
  if (items.length < 2) return { proposed: 0, added: 0, edges: [] };
  const realCall = call ?? (async (p) => {
    const { getLlmModel } = await import("@/lib/agent/llm");
    const { models, model } = await getLlmModel("compact");
    const res = await models.completeSimple(model, { systemPrompt: "당신은 지식 그래프 설계자입니다.", messages: [{ role: "user" as const, content: p, timestamp: Date.now() }] });
    return (res?.content ?? []).filter((t: any) => t?.type === "text").map((t: any) => t.text).join("");
  });
  const proposed = await proposeGraphRelations(personaKey, items, realCall);
  const { addEdge, listEdges } = await import("@/lib/harness/review");
  const existing = await listEdges();
  const seen = new Set(existing.map((e) => `${e.fromType}:${e.fromId}->${e.toType}:${e.toId}`));
  let added = 0;
  for (const e of proposed) {
    const k = `${e.fromType}:${e.fromId}->${e.toType}:${e.toId}`;
    if (seen.has(k)) continue;
    await addEdge({ fromType: e.fromType, fromId: e.fromId, toType: e.toType, toId: e.toId, rel: e.rel });
    seen.add(k); added++;
  }
  return { proposed: proposed.length, added, edges: proposed };
}
