import { describe, it, expect, beforeEach } from "vitest";
import { NextRequest } from "next/server";
import { resetDb, withUser, withDept } from "./helpers";
import { createSession } from "@/lib/auth/session";
import { createPrompt, createMemory } from "@/lib/harness/store";
import { createCandidate } from "@/lib/harness/review";

async function ck(u: any) { return { Cookie: "dept_session=" + (await createSession(u.id)).token }; }

beforeEach(async () => { await resetDb(); await withDept(); });

describe("GET /api/admin/backup", () => {
  it("관리자: 전체 백업 JSON / 비관리자 403", async () => {
    const admin = await withUser({ role: "admin" });
    await createPrompt({ personaKey: "claims-planning", title: "T", content: "c" });
    const { GET } = await import("@/app/api/admin/backup/route");
    const res = await GET(new NextRequest("http://x/api/admin/backup", { headers: await ck(admin) }));
    const d = await res.json();
    expect(d.prompts.length).toBe(1);
    const u = await withUser({ role: "user" });
    expect((await GET(new NextRequest("http://x/api/admin/backup", { headers: await ck(u) }))).status).toBe(403);
  });
});

describe("GET /api/admin/assess", () => {
  it("후보 큐 드라이런 평가 리포트", async () => {
    const admin = await withUser({ role: "admin" });
    await createCandidate({ personaKey: "claims-planning", sourceKind: "episode", sourceId: "e1", action: "create_memory", proposedContent: "손해율 5% 초과 시 무조건 원인분석 착수", confidence: 0.9 });
    const { GET } = await import("@/app/api/admin/assess/route");
    const res = await GET(new NextRequest("http://x/api/admin/assess?personaKey=claims-planning", { headers: await ck(admin) }));
    const d = await res.json();
    expect(d.total).toBe(1);
    expect(d.pass + d.review + d.reject).toBe(1);
  });
});
