import { describe, it, expect, beforeEach, vi } from "vitest";
import { resetDb } from "./helpers";
import { createAssistantMessageEventStream } from "@earendil-works/pi-ai";
import { toPiHistory, runPersonaAgent, makeWebSearchTool, makePythonDataTool, makeSubAgentDelegateTool } from "@/lib/agent/engine";
import { execPython } from "@/lib/agent/pyexec";
import { webSearch, formatSearchResults } from "@/lib/agent/websearch";
import { getPersona } from "@/lib/agent/personas";
import type { Message as DbMessage } from "@/lib/db/schema";

const mocks = vi.hoisted(() => ({ streamFn: vi.fn() }));
vi.mock("@/lib/agent/llm", () => ({
  getLlmModel: vi.fn(async () => ({
    models: { streamSimple: mocks.streamFn },
    model: { id: "deepseek-v4-flash" },
  })),
}));
vi.mock("@/lib/ragflow/client", () => ({
  ragflow: { retrieve: vi.fn(async () => []) },
}));

function mk(role: DbMessage["role"], content: string, createdAt = new Date("2026-08-20T00:00:00Z")) {
  return { role, content, createdAt } as Pick<DbMessage, "role" | "content" | "createdAt">;
}

describe("toPiHistory", () => {
  it("system 제외 + user/assistant 변환", () => {
    const h = toPiHistory([mk("system", "무시"), mk("user", "질문"), mk("assistant", "답변")]);
    expect(h.map((m) => m.role)).toEqual(["user", "assistant"]);
    expect(h[1]).toMatchObject({ role: "assistant" });
    expect((h[1].content as Array<{ type: string; text: string }>)[0].text).toBe("답변");
  });

  it("최근 10건만 유지", () => {
    const h = toPiHistory(Array.from({ length: 13 }, (_, i) => mk("user", `m${i}`)));
    expect(h.length).toBe(10);
  });
});

describe("runPersonaAgent", () => {
  beforeEach(async () => {
    await resetDb();
    mocks.streamFn.mockReset();
    mocks.streamFn.mockImplementation(() => {
      const s = createAssistantMessageEventStream();
      s.push({ type: "start", partial: { role: "assistant", content: [], api: "openai-completions", provider: "litellm", model: "deepseek-v4-flash", stopReason: "in_progress", timestamp: Date.now() } as any });
      s.push({ type: "text_delta", contentIndex: 0, delta: "안녕", partial: { role: "assistant", content: [{ type: "text", text: "안녕" }], api: "openai-completions", provider: "litellm", model: "deepseek-v4-flash", stopReason: "in_progress", timestamp: Date.now() } as any });
      s.end({ role: "assistant", content: [{ type: "text", text: "안녕" }], api: "openai-completions", provider: "litellm", model: "deepseek-v4-flash", stopReason: "stop", timestamp: Date.now() } as any);
      return s;
    });
  });

  it("히스토리 + 현재 질문(한 번) + RAG 청크(transformContext로 주입)", async () => {
    const persona = getPersona("claims-planning")!;
    let text = "";
    await runPersonaAgent(
      persona,
      "지금 질문입니다",
      [mk("user", "이전 질문"), mk("assistant", "이전 답변")],
      [{ content: "근거내용", source: "문서A.pdf", similarity: 0.9 }],
      { onTextDelta: (d) => { text += d; } }
    );
    expect(text).toBe("안녕");
    expect(mocks.streamFn).toHaveBeenCalled();
    const ctx = mocks.streamFn.mock.calls[0][1] as { systemPrompt: string; messages: Array<{ role: string; content: string }> };
    expect(ctx.systemPrompt).toContain("신한라이프 보험금기획팀장");
    const msgs = ctx.messages;
    // RAG(user) + 이전 질문(user) + 현재 질문(user) = user 3건
    const userContents = msgs.filter((m) => m.role === "user").map((m) => {
      const c = m.content as any;
      return typeof c === "string" ? c : (Array.isArray(c) ? c.map((x: any) => x.text ?? "").join("") : String(c));
    });
    // RAG 컨텍스트가 transformContext로 주입됨
    expect(userContents.some((u) => u.includes("<<<RAG_CONTEXT>>>") && u.includes("문서A.pdf"))).toBe(true);
    // 현재 질문은 정확히 1번
    const q = userContents.filter((u) => u.includes("[질문/업무 내용]\n지금 질문입니다"));
    expect(q).toHaveLength(1);
  });
});

describe("웹서치 툴", () => {
  it("툴 정의 — name/label/parameters", () => {
    const tool = makeWebSearchTool();
    expect(tool.name).toBe("websearch");
    expect(tool.label).toBe("웹 검색");
    expect(tool.description).toContain("검색");
    expect(tool.parameters as any).toBeDefined();
  });

  it("formatSearchResults — 결과 텍스트 변환/빈 결과", () => {
    expect(formatSearchResults("q", { ok: true, provider: "serper", results: [
      { title: "금융위", url: "https://fsc.go.kr", snippet: "보험업 감독규정 개정" },
    ] })).toContain("[웹 1] 금융위");
    expect(formatSearchResults("q", { ok: false, provider: "none", results: [] })).toBe("(웹 검색 불가)");
    expect(formatSearchResults("q", { ok: true, provider: "serper", results: [] })).toBe("(검색 결과 없음)");
  });

  it("webSearch — 키 없으면 ok:false + 안내", async () => {
    const { config } = await import("@/lib/config");
    const serper = config.websearch.serperApiKey;
    const tavily = config.websearch.tavilyApiKey;
    (config as any).websearch = { serperApiKey: "", tavilyApiKey: "" };
    const res = await webSearch("테스트");
    expect(res.ok).toBe(false);
    expect(res.error).toContain("검색 API 키");
    (config as any).websearch = { serperApiKey: serper, tavilyApiKey: tavily };
  });
});

describe("파이썬 데이터 처리 툴", () => {
  it("execPython — CSV 데이터를 pandas로 집계", async () => {
    const r = await execPython({
      script: 'print(df.groupby("등급")["금액"].sum().to_string())',
      inputData: "등급,건수,금액\nA,10,1000000\nB,20,2500000\nA,5,500000\n",
    });
    expect(r.ok).toBe(true);
    expect(r.stdout).toContain("A");
    expect(r.stdout).toContain("1500000");
  });

  it("execPython — 오류 스크립트는 stderr 반환", async () => {
    const r = await execPython({ script: "raise ValueError('boom')" });
    expect(r.ok).toBe(false);
    expect(r.stderr).toContain("boom");
  });

  it("makePythonDataTool — name/label/parameters", () => {
    const tool = makePythonDataTool();
    expect(tool.name).toBe("python_data");
    expect(tool.label).toContain("파이썬");
    expect(tool.description).toContain("pandas");
    expect(tool.parameters as any).toBeDefined();
  });
});

describe("파이썬 업로드 파일 처리", () => {
  it("execPython — xlsx 파일을 pandas로 처리 (openpyxl)", async () => {
    // 임시 xlsx 파일 생성 (openpyxl 사용)
    const py = "/home/ngkim52/.local/share/dept-agent-py/bin/python";
    const { execFileSync } = await import("node:child_process");
    const os = await import("node:os");
    const path = await import("node:path");
    const tmp = path.join(os.tmpdir(), `dept-py-xlsx-${Date.now()}.xlsx`);
    execFileSync(py, ["-c", `
import openpyxl
wb = openpyxl.Workbook()
ws = wb.active
ws.append(["등급", "건수", "금액"])
ws.append(["A", 10, 1000000])
ws.append(["B", 20, 2500000])
ws.append(["A", 5, 500000])
wb.save(${JSON.stringify(tmp)})
`]);
    const r = await execPython({
      script: 'print(df.to_string())\nprint("SUM_A=", df[df["등급"]=="A"]["금액"].sum())',
      filePath: tmp,
    });
    expect(r.ok).toBe(true);
    expect(r.stdout).toContain("SUM_A= 1500000");
  });
});

describe("python_data 툴 보안(업로드 경로 신뢰 경계)", () => {
  const allowedPath = "/data/uploads/doc-abc/file";
  it("허용된 업로드 경로면 실행 시도(ok 분기 진입)", async () => {
    const tool = makePythonDataTool([{ id: "doc-1", filename: "유량표.xlsx", filePath: allowedPath }]);
    const r = await tool.execute("t", { script: "print('hi')", filePath: allowedPath }, undefined as any);
    // 경로가 허용 목록에 있으므로 파이썬 실행(실패여부 무관) — ok 호출이 아닌 경로차단이 아닌지 확인
    expect(r.details).toBeDefined();
  });

  it("허용 목록에 없는 filePath는 차단(민감 파일 경로 방지)", async () => {
    const tool = makePythonDataTool([{ id: "doc-1", filename: "a.csv", filePath: "/data/uploads/doc-1/file" }]);
    const r = await tool.execute("t2", { script: "print(open('/etc/passwd').read())", filePath: "/etc/passwd" }, undefined);
    // 외부 경로를 LLM이 넣으면 실행이 아니라 차단 메시지
    const content = (r.content?.[0] as any)?.text ?? "";
    expect(content).toContain("지정한 파일");
  });

  it("filePath 미지정(데이터 문자열만)은 여전히 동작", async () => {
    const tool = makePythonDataTool();
    const r = await tool.execute("t3", { script: "print('ok')", data: "a,b\n1,2" }, undefined);
    expect(r.details).toBeDefined();
  });
});


describe("delegate 서브에이전트 위임 — 부서 매핑", () => {
  it("claims-planning이 지급보험금·손해율 영역을 담당함을 description에 명시 (오위임 방지)", () => {
    const tool = makeSubAgentDelegateTool({} as any, {} as any);
    const desc = tool.description;
    expect(desc).toContain("claims-planning(보험금기획팀)");
    expect(desc).toContain("지급보험금 건전성·손해율 모니터링");
    expect(desc).toContain("보험수리·요율 산출·준비금"); // actuarial 전용 영역
    expect(desc).toContain("actuarial로 오위임하지 마세요");
  });
});
