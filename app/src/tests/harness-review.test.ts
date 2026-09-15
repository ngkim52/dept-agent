import { describe, it, expect, beforeEach } from "vitest";
import { resetDb, withDept } from "./helpers";
import { db, schema } from "@/lib/db";
import { eq } from "drizzle-orm";
import {
  createEpisode, getEpisode, listEpisodes, updateEpisodeStatus,
  createCandidate, listCandidates, resolveCandidate,
  addEdge, listEdges, findPotentialConflicts, applyCandidate, tokenSet, jaccard,
} from "@/lib/harness/review";

beforeEach(async () => { await resetDb(); await withDept(); });

describe("episodes", () => {
  it("createEpisode → get/list + status 전이", async () => {
    const e = await createEpisode({ departmentId: "claims-planning", summary: "손해율 문의", conclusion: "5% 초과 시 원인분석", sourceIds: JSON.stringify(["m1","m2"]), tokenCount: 120 });
    expect(e.status).toBe("draft");
    const got = await getEpisode(e.id);
    expect(got!.summary).toBe("손해율 문의");
    expect(JSON.parse(got!.sourceIds!)).toEqual(["m1","m2"]);
    await updateEpisodeStatus(e.id, "ready");
    expect((await getEpisode(e.id))!.status).toBe("ready");
    expect((await listEpisodes("claims-planning")).length).toBe(1);
  });
});

describe("candidates + apply", () => {
  it("createCandidate → listCandidates(personaKey)", async () => {
    const c = await createCandidate({ personaKey: "claims-planning", sourceKind: "episode", sourceId: "ep1", summary: "손해율 규칙", action: "create_memory", targetTitle: "손해율 원칙", proposedContent: "손해율이 5%를 초과하면 무조건 원인분석을 착수한다.", confidence: 0.9 });
    expect((await listCandidates({ personaKey: "claims-planning" })).length).toBe(1);
    expect(c.status).toBe("pending");
  });

  it("지우기: resolveCandidate로 rejected + adminNote 기록", async () => {
    const c = await createCandidate({ personaKey: "claims-planning", sourceKind: "episode", sourceId: "ep1", action: "create_memory", proposedContent: "x", confidence: 0.5 });
    const r = await resolveCandidate(c.id, { status: "rejected", adminNote: "중복", resolvedBy: "admin-1" });
    expect(r!.status).toBe("rejected");
    expect(r!.adminNote).toBe("중복");
    expect(r!.resolvedBy).toBe("admin-1");
  });

  it("applyCandidate — 메모리 생성 + applied + 버전 + source_of edge + 낮은 신뢰도로 회색지대", async () => {
    const c = await createCandidate({ personaKey: "claims-planning", sourceKind: "episode", sourceId: "ep1", summary: "손해율 규칙", action: "create_memory", targetTitle: "손해율 원칙", proposedContent: "손해율이 5%를 초과하면 원인분석을 착수한다.", confidence: 0.95 });
    const res = await applyCandidate(c.id, "admin-1");
    expect(res.entryType).toBe("memory");
    // 지식 생성 + 버전 기록
    const mem = (await db.select().from(schema.knowledgeMemories).where(eq(schema.knowledgeMemories.id, res.entryId)))[0];
    expect(mem!.content).toContain("5%");
    expect(mem!.origin).toBe("review");
    expect((await db.select().from(schema.knowledgeVersions).where(eq(schema.knowledgeVersions.entryId, res.entryId))).length).toBe(1);
    // applied 상태
    expect(res.candidate!.status).toBe("applied");
    // source_of edge
    const edges = await listEdges("episode", "ep1");
    expect(edges.some((e) => e.rel === "source_of" && e.toId === res.entryId)).toBe(true);
  });

  it("applyCandidate — 이미 처리된 후보는 거부", async () => {
    const c = await createCandidate({ personaKey: "claims-planning", sourceKind: "admin_chat", sourceId: "c1", action: "create_prompt", proposedContent: "요약을 끝에 배치", confidence: 0.9 });
    await applyCandidate(c.id, "admin-1");
    await expect(applyCandidate(c.id, "admin-1")).rejects.toThrow("이미 처리된");
  });
});

describe("edges + conflict heuristic", () => {
  it("addEdge/listEdges 왕복", async () => {
    const e = await addEdge({ fromType: "episode", fromId: "ep1", toType: "memory", toId: "m1", rel: "source_of" });
    expect(e.id).toBeTruthy();
    expect((await listEdges("episode", "ep1")).length).toBe(1);
  });
  it("tokenSet/jaccard", () => {
    expect(jaccard("손해율 5% 초과", "손해율 5% 초과 원인분석")).toBeGreaterThan(0.5);
    expect(jaccard("a b c", "x y z")).toBe(0);
  });
  it("findPotentialConflicts — 겹치는 활성 지식 반환", async () => {
    const { createMemory } = await import("@/lib/harness/store");
    await createMemory({ personaKey: "claims-planning", kind: "fact", content: "손해율이 5%를 초과하면 원인분석을 착수한다." });
    const conflicts = await findPotentialConflicts("claims-planning", "손해율이 5%를 초과하면 원인분석을 착수한다.");
    expect(conflicts.length).toBeGreaterThanOrEqual(1);
  });
});

describe("generateEpisodeForDepartment (QA→에피소드 압축 파이프라인)", () => {
  it("최근 부서 QA를 압축해 episode(ready) + 후보 생성", async () => {
    const { randomUUID } = await import("node:crypto");
    const user = await (await import("./helpers")).withUser({ role: "user", departmentId: "claims-planning" });
    const conv = { id: randomUUID(), userId: user.id, departmentId: "claims-planning", createdAt: new Date() };
    await db.insert(schema.conversations).values(conv);
    await db.insert(schema.messages).values([
      { id: randomUUID(), conversationId: conv.id, role: "user", content: "손해율이 5% 초과했어", createdAt: new Date() },
      { id: randomUUID(), conversationId: conv.id, role: "assistant", content: "원인분석을 시작하세요.", createdAt: new Date() },
    ]);
    const call = async () => JSON.stringify({ summary: "손해율 초과 문의", conclusion: "5% 초과 시 원인분석 착수", reusable_rules: ["손해율 5% 초과 시 원인분석을 무조건 착수한다."] });
    const { generateEpisodeForDepartment, listCandidates } = await import("@/lib/harness/review");
    const res = await generateEpisodeForDepartment("claims-planning", "보험금기획팀", call);
    expect(res.episode.status).toBe("ready");
    expect(JSON.parse(res.episode.sourceIds!)).toHaveLength(2);
    const cs = await listCandidates({ personaKey: "claims-planning" });
    // candidate personaKey는 department의 personaKey로 결정
    expect(cs.length).toBeGreaterThanOrEqual(1);
    expect(cs[0].sourceKind).toBe("episode");
    expect(cs[0].sourceId).toBe(res.episode.id);
  });
});


describe("findPotentialConflicts — 타입 판별 + 자기참조 제외 (regression)", () => {
  it("memory/prompt 타입을 올바르게 판별", async () => {
    const { createMemory, createPrompt } = await import("@/lib/harness/store");
    await createMemory({ personaKey: "claims-planning", kind: "lesson", content: "손해율이 5%를 초과하면 원인분석을 착수한다." });
    await createPrompt({ personaKey: "claims-planning", kind: "rule", title: "손해율 규칙", content: "손해율이 5%를 초과하면 원인분석을 무조건 착수한다." });
    const conflicts = await findPotentialConflicts("claims-planning", "손해율이 5%를 초과하면 원인분석을 착수한다.");
    const types = new Set(conflicts.map((c) => c.type));
    expect(types.has("memory")).toBe(true);
    expect(types.has("prompt")).toBe(true);
  });

  it("exclude로 방금 생성된 항목 자신은 제외", async () => {
    const { createMemory } = await import("@/lib/harness/store");
    const mem = await createMemory({ personaKey: "claims-planning", kind: "lesson", content: "손해율이 5%를 초과하면 원인분석을 착수한다." });
    const conflicts = await findPotentialConflicts("claims-planning", mem.content, 0.5, { type: "memory", id: mem.id });
    expect(conflicts.some((c) => c.id === mem.id)).toBe(false);
  });
});

describe("applyCandidate — admin_chat source_of + 자기참조 엣지 제거 (regression)", () => {
  it("admin_chat 후보 적용 시 conversation→지식 source_of 엣지 생성", async () => {
    const c = await createCandidate({ personaKey: "claims-planning", sourceKind: "admin_chat", sourceId: "conv-1", action: "create_memory", proposedContent: "손해율 5% 초과 시 원인분석 착수", confidence: 0.9 });
    const res = await applyCandidate(c.id, "admin-1");
    const edges = await listEdges("conversation", "conv-1");
    expect(edges.some((e) => e.rel === "source_of" && e.toId === res.entryId)).toBe(true);
    const selfRel = (await listEdges("memory", res.entryId)).filter((e) => e.rel === "related" && e.toId === res.entryId);
    expect(selfRel.length).toBe(0);
  });

  it("applyCandidate로 만든 지식은 자기 자신을 가리키는 엣지가 없어야 함", async () => {
    const c = await createCandidate({ personaKey: "claims-planning", sourceKind: "admin_chat", sourceId: "conv-2", action: "create_memory", proposedContent: "청구 처리 기간 단축은 우선순위 정의부터 시작한다.", confidence: 0.9 });
    const res = await applyCandidate(c.id, "admin-1");
    const all = (await listEdges()).filter((e) => e.fromId === res.entryId && e.toId === res.entryId);
    expect(all.length).toBe(0);
  });
});
