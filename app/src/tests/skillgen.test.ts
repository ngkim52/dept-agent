import { describe, it, expect, vi, beforeEach } from "vitest";

// LLM/웹검색 목 — 순수 함수도 함께 테스트
vi.mock("@/lib/agent/llm", () => ({
  getLlmModel: async () => ({
    models: { completeSimple: async () => ({ content: [{ type: "text", text: JSON.stringify({
      name: "신규 판단 스킬",
      description: "손해율 초과 원인 분석 시 사용. 품질·자동화 문의는 제외.",
      content: "# 요구 시점\n- 손해율 초과 시\n## 판단 기준\n- 5% 초과 시 원인 분석\n## 출력\n[요약] → [권고]",
    }) }] }) },
    model: {},
  }),
}));

vi.mock("@/lib/agent/websearch", () => ({
  webSearch: async () => ({ ok: true, results: [{ title: "보험업계 손해율 기준", snippet: "손해율 5% 초과 시 원인 분석 권고" }], provider: "serper" }),
}));

import { parseSkillDraft, buildSkillBuilderPrompt, findRelatedSkills, generateSkillDraft } from "@/lib/harness/skillgen";

describe("skillgen 파서/헬퍼", () => {
  it("parseSkillDraft — 코드블록·JSON에서 name/description/content 추출", () => {
    const d = parseSkillDraft("```json\n{\"name\": \"A\", \"description\": \"D\", \"content\": \"C\"}\n```");
    expect(d.name).toBe("A");
    expect(d.description).toBe("D");
    expect(d.content).toBe("C");
  });

  it("buildSkillBuilderPrompt — 주제·참조 데이터 포함", () => {
    const p = buildSkillBuilderPrompt("손해율", "claims-planning", [{ type: "memory", label: "[fact] m", text: "5% 기준" }], ["웹자료"]);
    expect(p).toContain("손해율");
    expect(p).toContain("[fact] m");
    expect(p).toContain("웹자료");
  });

  it("findRelatedSkills — 주제와 매칭되는 기존 스킬 반환", () => {
    const r = findRelatedSkills("claims-planning", "지급보험금");
    expect(Array.isArray(r)).toBe(true);
    expect(r.some((x) => x.matched)).toBe(true);
  });
});

describe("generateSkillDraft 통합 (LLM/웹 목)", () => {
  beforeEach(() => { vi.restoreAllMocks(); });

  it("컨텍스트 수집 + 웹검색 보강 + 초안 + 관련 스킬 + webUsed", async () => {
    const draft = await generateSkillDraft("손해율 초과 원인 분석", "claims-planning", { useWeb: true });
    expect(draft.name).toBe("신규 판단 스킬");
    expect(draft.description.length).toBeGreaterThan(0);
    expect(draft.content).toContain("요구 시점");
    expect(Array.isArray(draft.relatedSkills)).toBe(true);
    expect(draft.webUsed).toBe(true);
  });
});

import { NextRequest } from "next/server";
import { resetDb, withUser, withDept } from "./helpers";
import { createSession } from "@/lib/auth/session";

describe("POST /api/admin/skills/generate", () => {
  beforeEach(async () => { await resetDb(); await withDept(); });
  it("관리자: topic → 스킬 초안 반환", async () => {
    const admin = await withUser({ role: "admin" });
    const token = await createSession(admin.id).then((r) => r.token);
    const { POST } = await import("@/app/api/admin/skills/generate/route");
    const req = new NextRequest("http://localhost/api/admin/skills/generate?personaKey=claims-planning", {
      method: "POST", headers: { "Content-Type": "application/json", Cookie: "dept_session=" + token },
      body: JSON.stringify({ topic: "보험금 심사 지연 점검", useWeb: true }),
    });
    const res = await POST(req);
    expect(res.status).toBe(200);
    const d = await res.json();
    expect(d.draft.name.length).toBeGreaterThan(0);
    expect(d.draft.content).toContain("요구 시점");
  });
  it("비관리자 403 / topic없음 400", async () => {
    const u = await withUser({ role: "user" });
    const token = await createSession(u.id).then((r) => r.token);
    const { POST } = await import("@/app/api/admin/skills/generate/route");
    const r1 = await POST(new NextRequest("http://localhost/api/admin/skills/generate?personaKey=claims-planning", {
      method: "POST", headers: { Cookie: "dept_session=" + token }, body: JSON.stringify({ topic: "x" }),
    }));
    expect(r1.status).toBe(403);
    const admin = await withUser({ role: "admin" });
    const at = await createSession(admin.id).then((r) => r.token);
    const r2 = await POST(new NextRequest("http://localhost/api/admin/skills/generate?personaKey=claims-planning", {
      method: "POST", headers: { Cookie: "dept_session=" + at }, body: JSON.stringify({}),
    }));
    expect(r2.status).toBe(400);
  });
});
