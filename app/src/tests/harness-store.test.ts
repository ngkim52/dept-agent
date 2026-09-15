import { describe, it, expect, beforeEach } from "vitest";
import { resetDb, withDept } from "./helpers";
import {
  createPrompt, createSkill, createMemory,
  listPrompts, listSkills, listMemories,
  updatePrompt, updateSkill, updateMemory, setActive, getEntry,
  recordVersion, listVersions, restoreVersion, parseTags,
} from "@/lib/harness/store";

beforeEach(async () => { await resetDb(); await withDept(); });

describe("harness store CRUD (프롬프트/스킬/메모리)", () => {
  it("createPrompt → listPrompts(personaKey) 포함", async () => {
    const p = await createPrompt({ personaKey: "claims-planning", kind: "rule", title: "전월 대비 필수", content: "보고 시 전월 대비를 포함한다." }, "admin-1");
    const list = await listPrompts("claims-planning");
    expect(list).toHaveLength(1);
    expect(list[0].id).toBe(p.id);
    expect(list[0].kind).toBe("rule");
    expect(list[0].active).toBe(true);
    expect(list[0].origin).toBe("manual");
  });

  it("createSkill/createMemory → list + 기본값", async () => {
    const s = await createSkill({ personaKey: "claims-planning", name: "신상품리스크", description: "신상품 리스크 점검", content: "9개월 모니터링" });
    const m = await createMemory({ personaKey: "claims-planning", kind: "preference", content: "분기 보고에 전월 대비 포함", tags: ["보고", "손해율"] });
    expect(await listSkills("claims-planning")).toHaveLength(1);
    const mems = await listMemories("claims-planning");
    expect(mems).toHaveLength(1);
    expect(mems[0].id).toBe(m.id);
    expect(parseTags(mems[0])).toEqual(["보고", "손해율"]);
    expect(s.content).toBe("9개월 모니터링");
  });

  it("updatePrompt/updateSkill/updateMemory — 값 갱신", async () => {
    const p = await createPrompt({ personaKey: "claims-planning", title: "T", content: "v1" });
    const upd = await updatePrompt(p.id, { content: "v2", title: "T2" }, "admin-1");
    expect(upd.content).toBe("v2");
    expect((await getEntry("prompt", p.id))!.content).toBe("v2");
    const m = await createMemory({ personaKey: "claims-planning", content: "m1" });
    const mu = await updateMemory(m.id, { kind: "decision", tags: ["a"] });
    expect(mu.kind).toBe("decision");
    expect(parseTags(await getEntry("memory", m.id) as any)).toEqual(["a"]);
  });

  it("setActive — 비활성(disable)/활성(activate) + 이력 action 기록", async () => {
    const p = await createPrompt({ personaKey: "claims-planning", title: "T", content: "c" });
    await setActive("prompt", p.id, false, "admin-1");
    expect((await getEntry("prompt", p.id))!.active).toBe(false);
    const vs = await listVersions("prompt", p.id);
    const actions = vs.map((v) => v.action);
    expect(actions).toContain("create");
    expect(actions).toContain("disable");
    await setActive("prompt", p.id, true, "admin-1");
    expect((await getEntry("prompt", p.id))!.active).toBe(true);
    expect((await listVersions("prompt", p.id)).map((v) => v.action)).toContain("activate");
  });

  it("버전 이력 — 생성/수정 기록, restoreVersion 롤백", async () => {
    const p = await createPrompt({ personaKey: "claims-planning", title: "T", content: "v1" });
    await updatePrompt(p.id, { content: "v2" }, "admin-1");
    await updatePrompt(p.id, { content: "v3" }, "admin-1");
    const vs = await listVersions("prompt", p.id);
    expect(vs.map((v) => v.action)).toEqual(["create", "update", "update"]);
    // v2 버전(contentAfter="v2")으로 복원
    const v2 = vs.find((v) => v.action === "update" && JSON.parse(v.contentAfter!).content === "v2")!;
    const restored = await restoreVersion(v2.id, "admin-1");
    expect((restored as any).content).toBe("v2");
    expect((await getEntry("prompt", p.id))!.content).toBe("v2");
    expect((await listVersions("prompt", p.id)).map((v) => v.action)).toContain("restore");
  });

  it("getEntry 없는 항목 — null", async () => {
    expect(await getEntry("prompt", "none")).toBeNull();
  });
});
