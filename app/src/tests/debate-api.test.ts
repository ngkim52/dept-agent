import { describe, it, expect, beforeEach, vi } from "vitest";
import { NextRequest } from "next/server";
import { resetDb, withUser, withDept } from "./helpers";
import { createSession } from "@/lib/auth/session";
import { createSession as createDebate, appendMessage, getSession, setSessionStatus } from "@/lib/debate/store";
import { saveDebateReportMd } from "@/lib/debate/storage";

const engineMock = vi.hoisted(() => ({ runDebate: vi.fn(async () => ({ status: "finished", turns: 1 })) }));
vi.mock("@/lib/debate/engine", () => ({ runDebate: engineMock.runDebate }));

async function adminCookie() {
  const u = await withUser({ role: "admin" });
  const { token } = await createSession(u.id);
  return "dept_session=" + token;
}
const req = (url: string, cookie: string, init: { method?: string; body?: string; headers?: Record<string, string> } = {}) =>
  new NextRequest(url, { method: init.method, body: init.body, headers: { ...(init.headers ?? {}), Cookie: cookie } });
const jsonReq = (url: string, cookie: string, body: unknown, method = "POST") =>
  req(url, cookie, { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
const ctx = (id: string) => ({ params: Promise.resolve({ id }) });

beforeEach(async () => { await resetDb(); await withDept(); engineMock.runDebate.mockClear(); });

describe("/api/debate (생성·목록)", () => {
  it("생성 → 201, 참가자/시간이 검증된다", async () => {
    const c = await adminCookie();
    const { POST } = await import("@/app/api/debate/route");
    const res = await POST(jsonReq("http://localhost/api/debate", c, {
      title: "AI 자동심사 확대", brief: "300만원 이하", durationSec: 99999, participantKeys: ["critic", "optimist", "nope", "critic", "synthesizer"],
    }));
    expect(res.status).toBe(201);
    const d = await res.json();
    expect(d.session.participants.map((p: any) => p.key)).toEqual(["critic", "optimist"]);
    expect(d.session.durationSec).toBe(900);
  });

  it("제목 없음/참가자 1명은 400", async () => {
    const c = await adminCookie();
    const { POST } = await import("@/app/api/debate/route");
    expect((await POST(jsonReq("http://localhost/api/debate", c, { title: " " }))).status).toBe(400);
    expect((await POST(jsonReq("http://localhost/api/debate", c, { title: "T", participantKeys: ["critic"] }))).status).toBe(400);
  });

  it("목록 조회", async () => {
    const c = await adminCookie();
    await createDebate({ id: "s1", title: "T1", brief: "", durationSec: 180, participantKeys: ["critic", "optimist"], createdBy: null });
    const { GET } = await import("@/app/api/debate/route");
    const d = await (await GET(req("http://localhost/api/debate", c))).json();
    expect(d.sessions.map((s: any) => s.id)).toEqual(["s1"]);
  });
});

describe("/api/debate/[id] (상세·증분)", () => {
  beforeEach(async () => {
    await createDebate({ id: "d1", title: "T", brief: "B", durationSec: 60, participantKeys: ["critic", "optimist"], createdBy: null });
    await appendMessage({ sessionId: "d1", persona: { key: "critic", name: "비판가", emoji: "🧊", color: "#333", role: "", kind: "member" }, content: "1번", round: 1 });
    await appendMessage({ sessionId: "d1", persona: { key: "optimist", name: "긍정", emoji: "🌤", color: "#B07A16", role: "", kind: "member" }, content: "2번", round: 1 });
  });

  it("상세는 전체 발언을 준다", async () => {
    const c = await adminCookie();
    const { GET } = await import("@/app/api/debate/[id]/route");
    const d = await (await GET(req("http://localhost/api/debate/d1", c), ctx("d1"))).json();
    expect(d.messages.map((m: any) => m.seq)).toEqual([1, 2]);
    expect(d.hasReport).toBe(false);
  });

  it("없는 id 는 404", async () => {
    const c = await adminCookie();
    const { GET } = await import("@/app/api/debate/[id]/route");
    expect((await GET(req("http://localhost/api/debate/none", c), ctx("none"))).status).toBe(404);
  });

  it("stream 은 since 이후 발언만 준다", async () => {
    const c = await adminCookie();
    const { GET } = await import("@/app/api/debate/[id]/stream/route");
    const res = await GET(req("http://localhost/api/debate/d1/stream?since=1", c), ctx("d1"));
    const d = await res.json();
    expect(d.messages.map((m: any) => m.seq)).toEqual([2]);
    expect(d.status).toBe("draft");
    expect(typeof d.remainingSec).toBe("number");
  });
});

describe("/api/debate/[id] (시작·중단)", () => {
  it("start 는 엔진을 백그라운드로 트리거하고 202 를 준다", async () => {
    const c = await adminCookie();
    await createDebate({ id: "d2", title: "T", brief: "", durationSec: 60, participantKeys: ["critic", "optimist"], createdBy: null });
    const { POST } = await import("@/app/api/debate/[id]/start/route");
    const res = await POST(req("http://localhost/api/debate/d2/start", c), ctx("d2"));
    expect(res.status).toBe(202);
    expect((await res.json()).started).toBe(true);
  });

  it("running 중 start 는 already-running", async () => {
    const c = await adminCookie();
    await createDebate({ id: "d3", title: "T", brief: "", durationSec: 60, participantKeys: ["critic", "optimist"], createdBy: null });
    await setSessionStatus("d3", "running");
    const { POST } = await import("@/app/api/debate/[id]/start/route");
    const d = await (await POST(req("http://localhost/api/debate/d3/start", c), ctx("d3"))).json();
    expect(d.started).toBe(false);
    expect(d.reason).toBe("already-running");
  });

  it("stop 은 상태를 stopped 로 바꾼다", async () => {
    const c = await adminCookie();
    await createDebate({ id: "d4", title: "T", brief: "", durationSec: 60, participantKeys: ["critic", "optimist"], createdBy: null });
    await setSessionStatus("d4", "running");
    const { POST } = await import("@/app/api/debate/[id]/stop/route");
    const d = await (await POST(req("http://localhost/api/debate/d4/stop", c), ctx("d4"))).json();
    expect(d.status).toBe("stopped");
    expect((await getSession("d4"))?.status).toBe("stopped");
  });
});

describe("/api/debate/[id]/report", () => {
  it("보고서 없으면 404, 있으면 MD 를 준다", async () => {
    const c = await adminCookie();
    await createDebate({ id: "d5", title: "T", brief: "", durationSec: 60, participantKeys: ["critic", "optimist"], createdBy: null });
    const { GET } = await import("@/app/api/debate/[id]/report/route");
    expect((await GET(req("http://localhost/api/debate/d5/report", c), ctx("d5"))).status).toBe(404);

    const path = await saveDebateReportMd("d5", "# 보고서\n본문");
    const { updateSession } = await import("@/lib/debate/store");
    await updateSession("d5", { reportPath: path, verdict: "추진" });
    const d = await (await GET(req("http://localhost/api/debate/d5/report", c), ctx("d5"))).json();
    expect(d.md).toContain("# 보고서");
    expect(d.verdict).toBe("추진");

    const dl = await GET(req("http://localhost/api/debate/d5/report?download=1", c), ctx("d5"));
    expect(dl.headers.get("Content-Type")).toContain("text/markdown");
    const cd = dl.headers.get("Content-Disposition") ?? "";
    expect(cd).toContain("attachment");
    expect(cd).toContain('filename="debate-d5.md"');      // ASCII 폴백(브라우저가 인라인 표시하지 않도록)
    expect(cd).toContain("filename*=UTF-8''");             // 한글 파일명
    expect(await dl.text()).toContain("# 보고서");
  });
});

describe("/api/debate/personas", () => {
  it("기본 목록 + 커스텀 생성", async () => {
    const c = await adminCookie();
    const { GET, POST } = await import("@/app/api/debate/personas/route");
    const before = await (await GET(req("http://localhost/api/debate/personas", c))).json();
    expect(before.personas.length).toBe(10);

    const res = await POST(jsonReq("http://localhost/api/debate/personas", c, { name: "고객대표", role: "고객 관점", stance: "불편 최소화" }));
    expect(res.status).toBe(201);
    const after = await (await GET(req("http://localhost/api/debate/personas", c))).json();
    expect(after.personas.length).toBe(11);
    expect(after.personas[10].builtin).toBe(false);
  });

  it("이름 없으면 400", async () => {
    const c = await adminCookie();
    const { POST } = await import("@/app/api/debate/personas/route");
    expect((await POST(jsonReq("http://localhost/api/debate/personas", c, { name: "" }))).status).toBe(400);
  });
});

describe("/api/debate/personas (수정·되돌리기)", () => {
  it("PUT 은 기본 페르소나를 수정하고, DELETE 는 기본값으로 되돌린다", async () => {
    const c = await adminCookie();
    const { GET, PUT, DELETE } = await import("@/app/api/debate/personas/route");

    const res = await PUT(jsonReq("http://localhost/api/debate/personas", c, {
      key: "critic", name: "원가 지킴이", emoji: "🐯", role: "원가팀", stance: "비용 우선",
      expertise: "원가 구조", goal: "예산 방어", redLine: "무근거 증액", tone: "건조",
    }, "PUT"));
    expect(res.status).toBe(200);

    const list = await (await GET(req("http://localhost/api/debate/personas", c))).json();
    const critic = list.personas.find((p: any) => p.key === "critic");
    expect(critic.name).toBe("원가 지킴이");
    expect(critic.overridden).toBe(true);
    expect(critic.isBuiltinKey).toBe(true);
    expect(critic.systemPrompt).toContain("원가 구조");

    const del = await DELETE(req("http://localhost/api/debate/personas?key=critic", c, { method: "DELETE" }));
    expect(del.status).toBe(200);
    expect((await del.json()).restored).toBe(true);
    const list2 = await (await GET(req("http://localhost/api/debate/personas", c))).json();
    expect(list2.personas.find((p: any) => p.key === "critic").name).toBe("냉철한 비판가 에이전트");
  });

  it("PUT 은 key 가 없으면 400", async () => {
    const c = await adminCookie();
    const { PUT } = await import("@/app/api/debate/personas/route");
    expect((await PUT(jsonReq("http://localhost/api/debate/personas", c, { name: "x" }, "PUT"))).status).toBe(400);
  });
});

describe("/api/debate/upload (기획안 파일)", () => {
  it("텍스트 파일 → 추출된 기획안 텍스트", async () => {
    const c = await adminCookie();
    const form = new FormData();
    form.append("file", new Blob(["# 기획안\n자동심사 확대"], { type: "text/markdown" }), "plan.md");
    const { POST } = await import("@/app/api/debate/upload/route");
    const res = await POST(new NextRequest("http://localhost/api/debate/upload", {
      method: "POST", headers: { Cookie: c }, body: form as any,
    }));
    expect(res.status).toBe(200);
    const d = await res.json();
    expect(d.filename).toBe("plan.md");
    expect(d.text).toContain("자동심사 확대");
  });

  it("지원하지 않는 형식은 400 + 안내", async () => {
    const c = await adminCookie();
    const form = new FormData();
    form.append("file", new Blob(["x"], { type: "application/pdf" }), "scan.pdf");
    const { POST } = await import("@/app/api/debate/upload/route");
    const res = await POST(new NextRequest("http://localhost/api/debate/upload", {
      method: "POST", headers: { Cookie: c }, body: form as any,
    }));
    expect(res.status).toBe(400);
    expect((await res.json()).error).toContain("pdf");
  });
});

describe("다시 토론 (같은 안건 재시작)", () => {
  it("종료된 세션의 참가자 key(커스텀 포함)로 새 세션을 만들 수 있다", async () => {
    const c = await adminCookie();
    // 커스텀 페르소나 추가
    const { POST: createPersona } = await import("@/app/api/debate/personas/route");
    const pRes = await createPersona(jsonReq("http://localhost/api/debate/personas", c, { name: "고객대표", role: "고객 관점" }));
    const customKey = (await pRes.json()).persona.key as string;

    const { POST: createDebate, GET: listDebate } = await import("@/app/api/debate/route");
    const first = await (await createDebate(jsonReq("http://localhost/api/debate", c, {
      title: "재토론 테스트", brief: "B", durationSec: 60, participantKeys: ["critic", customKey],
    }))).json();
    const sid = first.session.id as string;
    await setSessionStatus(sid, "finished");

    // 관전 화면의 "같은 안건으로 다시 토론" 과 동일한 페이로드 구성
    const detail = await (await (await import("@/app/api/debate/[id]/route")).GET(req(`http://localhost/api/debate/${sid}`, c), ctx(sid))).json();
    const again = await createDebate(jsonReq("http://localhost/api/debate", c, {
      title: detail.session.title, brief: detail.session.brief, attachmentName: detail.session.attachmentName,
      durationSec: detail.session.durationSec, participantKeys: detail.session.participants.map((p: any) => p.key),
    }));
    expect(again.status).toBe(201);
    const second = (await again.json()).session;
    expect(second.id).not.toBe(sid);
    expect(second.participants.map((p: any) => p.key).sort()).toEqual(["critic", customKey].sort());
    const list = await (await listDebate(req("http://localhost/api/debate", c))).json();
    expect(list.sessions.length).toBe(2);
  });
});

describe("/api/debate/[id]/start 중복 실행 방지", () => {
  it("동시에 두 번 start 해도 실행 루프는 한 번만 돈다(중복 발언 방지)", async () => {
    const c = await adminCookie();
    await createDebate({ id: "d6", title: "T", brief: "", durationSec: 60, participantKeys: ["critic", "optimist"], createdBy: null });
    engineMock.runDebate.mockClear();
    engineMock.runDebate.mockImplementation(async () => { await new Promise((r) => setTimeout(r, 30)); return { status: "finished", turns: 1 }; });
    const { POST } = await import("@/app/api/debate/[id]/start/route");
    const [ra, rb] = await Promise.all([
      POST(req("http://localhost/api/debate/d6/start", c), ctx("d6")),
      POST(req("http://localhost/api/debate/d6/start", c), ctx("d6")),
    ]);
    const results = [await ra.json(), await rb.json()];
    expect(results.filter((r) => r.started).length).toBe(1);
    expect(engineMock.runDebate).toHaveBeenCalledTimes(1);
  });
});
