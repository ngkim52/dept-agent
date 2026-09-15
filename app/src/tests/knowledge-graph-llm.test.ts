import { describe, it, expect, beforeEach } from "vitest";
import { resetDb, withDept } from "./helpers";
import { createMemory, createPrompt, createSkill } from "@/lib/harness/store";
import { listEdges } from "@/lib/harness/review";
import { buildGraphWithLLM, collectGraphItems } from "@/lib/harness/knowledgeGraph";

beforeEach(async () => { await resetDb(); await withDept(); });

describe("지식 그래프 — LLM 관계 판단·저장", () => {
  it("LLM이 제안한 관계를 knowledge_edges에 저장", async () => {
    const m1 = await createMemory({ personaKey: "claims-planning", content: "손해율 5% 초과 시 원인분석 착수" });
    const m2 = await createMemory({ personaKey: "claims-planning", content: "손해율 상승 시 비상대응 태스크포스 가동" });
    const m3 = await createMemory({ personaKey: "claims-planning", content: "신입 심사자 교육 일정" });
    const call = async () => JSON.stringify({ edges: [
      { fromId: m1.id, toId: m2.id, rel: "supports", reason: "같은 손해율 대응" },
      { fromId: m2.id, toId: m1.id, rel: "related", reason: "상호 연관" },
    ]});
    const res = await buildGraphWithLLM("claims-planning", call);
    expect(res.proposed).toBe(2);
    expect(res.added).toBe(2);
    const edges = await listEdges();
    expect(edges.length).toBe(2);
    expect(edges.some((e) => e.rel === "supports" && e.fromId === m1.id && e.toId === m2.id)).toBe(true);
    // 잘못된 id·자기 참조는 제외
    const call2 = async () => JSON.stringify({ edges: [
      { fromId: m1.id, toId: "not-exist", rel: "supports", reason: "무효" },
      { fromId: m1.id, toId: m1.id, rel: "related", reason: "자기참조" },
      { fromId: m3.id, toId: m1.id, rel: "refutes", reason: "충돌" },
    ]});
    const res2 = await buildGraphWithLLM("claims-planning", call2);
    expect(res2.proposed).toBe(1); // 무효(없는 id·자기참조)는 제외, m3->m1 만 유효
    expect(res2.edges.length).toBe(1);
  });

  it("활성 지식 수집 (메모리·규칙·스킬)", async () => {
    await createMemory({ personaKey: "claims-planning", content: "메모리A" });
    await createPrompt({ personaKey: "claims-planning", title: "규칙", content: "규칙B" });
    const items = await collectGraphItems("claims-planning");
    expect(items.some((i) => i.type === "memory")).toBe(true);
    expect(items.some((i) => i.type === "prompt")).toBe(true);
  });
});
