import { ragflow } from "@/lib/ragflow/client";
import { webSearch, formatSearchResults } from "@/lib/agent/websearch";
import { execPython } from "@/lib/agent/pyexec";
import { getDepartmentToolNames } from "@/agent-tools";
import { requireRagConfig, config } from "@/lib/config";
import { getLlmModel } from "@/lib/agent/llm";
import { getPersona, type Persona } from "@/lib/agent/personas";
import { buildPersonaSystemPromptWithSkills, getPersonaSkills } from "@/lib/agent/skills";
import type { Message as DbMessage } from "@/lib/db/schema";
import { Agent, type AgentTool, type AgentToolResult, type StreamFn } from "@earendil-works/pi-agent-core";
import { generateSummaryWithUsage, type AgentMessage } from "@earendil-works/pi-agent-core";
import { Type } from "typebox";
import type { Model, Message as PiMessage } from "@earendil-works/pi-ai";

export interface RagHint {
  content: string;
  source: string;      // 표시용 문서명 (확장자 제거)
  documentId?: string; // RAGFlow 문서 id
  similarity: number;
}

/** pi-ai Models의 streamSimple 부분 (테스트 대체용 슬림 인터페이스) */
import type { AssistantMessageEventStream } from "@earendil-works/pi-ai";
export type StreamFnLike = StreamFn;

// 부서 RAGFlow 데이터셋에서 검색 (부서 = 데이터셋 = 권한 경계)
export async function retrieveDepartmentChunks(
  question: string,
  datasetIds: (string | null | undefined)[]
): Promise<RagHint[]> {
  const ids = (datasetIds ?? []).filter(Boolean) as string[];
  if (ids.length === 0) return [];
  requireRagConfig();
  const chunks = await ragflow.retrieve(question, ids);
  return chunks.map((c) => ({
    content: c.content,
    source: (c.document_name ?? c.document_id ?? "").replace(/\.[a-z0-9]{1,6}$/i, ""), // 확장자 제거
    documentId: c.document_id,
    similarity: c.similarity,
  }));
}

export type ProgressEvent =
  | { type: "thinking"; detail?: string }
  | { type: "tool_start"; toolName: string; args?: unknown }
  | { type: "tool_end"; toolName: string; ok: boolean }
  | { type: "done" };

export interface StreamCallbacks {
  onTextDelta: (delta: string) => void;
  onProgress?: (ev: ProgressEvent) => void;
}

// DB 히스토리를 pi-ai 메시지 형식으로 변환
export function toPiHistory(history: Pick<DbMessage, "role" | "content" | "createdAt">[], maxMessages = 10): PiMessage[] {
  return history
    .filter((m) => m.role !== "system")
    .slice(-maxMessages)
    .map((m): PiMessage => {
      const timestamp = m.createdAt.getTime();
      if (m.role === "user") {
        return { role: "user", content: m.content, timestamp };
      }
      return {
        role: "assistant",
        content: [{ type: "text", text: m.content }],
        api: "openai-completions",
        provider: "litellm",
        model: config.llm.model,
        usage: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, totalTokens: 0, cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 } },
        stopReason: "stop",
        timestamp,
      };
    });
}

export type SubAgentDepartment = "claims-planning" | "actuarial";
export interface SubAgentParams {
  department: SubAgentDepartment;
  question: string;
}

/**
 * 부서 서브에이전트 위임 툴.
 * 상위 PI 에이전트가 이 툴을 호출하면 지정 부서의 하위 Agent를 스폰해
 * 실행하고 결과 텍스트를 상위 에이전트에 반환한다.
 */
export interface AgentOptions {
  thinkingLevel?: "off" | "minimal" | "low" | "medium" | "high" | "xhigh" | "max";
  maxHistoryMessages?: number;
  onToolLog?: (ev: { phase: "before" | "after"; toolName: string; args: unknown; ok: boolean }) => void;
  /** 각 턴 시작 전 시스템 메시지에 RAG 컨텍스트/요약을 주입하는 transformContext 훅 */
  transformContext?: (messages: AgentMessage[], signal?: AbortSignal) => Promise<AgentMessage[]>;
  /** "@파일명" 으로 지정된 업로드 파일 정보 (경로·이름) — python_data 툴이 직접 읽어 엑셀/CSV 처리 */
  uploadFiles?: { id: string; filename: string; filePath: string }[];
  /** 웹서치 결과가 있을 때 근거로 수집하기 위한 콜백 */
  onWebCitation?: (c: { title: string; url: string; snippet: string }) => void;
}

export function makeSubAgentDelegateTool(streamFn: StreamFn, model: any, opts: AgentOptions = {}): AgentTool<any, { department: SubAgentDepartment }> {
  const name = "delegate";
  const label = "부서 서브에이전트 위임";
  const description =
    "전문 부서(보험금심사기획/계리)의 서브에이전트에게 질문을 위임합니다. 계리·요율·준비금은 actuarial, 보험금 심사 절차·규정은 claims-planning을 선택하세요.";
  const parameters = Type.Object({
    department: Type.Union([Type.Literal("claims-planning"), Type.Literal("actuarial")]),
    question: Type.String(),
  });
  const tool = {
    name,
    label,
    description,
    parameters,
    async execute(toolCallId: string, params: any, _signal?: AbortSignal) {
      const subPersona = getPersona((params as SubAgentParams).department);
      if (!subPersona) throw new Error(`알 수 없는 부서: ${params.department}`);
      const subPersonaPrompt = buildPersonaSystemPromptWithSkills(subPersona.systemPrompt, getPersonaSkills((params as SubAgentParams).department));
      // 서브에이전트는 전용 모델("simple") 사용 — UI 설정 가능, 실패 시 메인 모델 fallback
      let subModel = model;
      try {
        const sl = await getLlmModel("simple");
        subModel = sl.model;
      } catch { /* simple 전용 모델 미설정 시 메인 모델 사용 */ }
      const sub = new Agent({
        streamFn,
        initialState: {
          systemPrompt: subPersonaPrompt,
          model: subModel,
          thinkingLevel: opts.thinkingLevel ?? "off",
          tools: [],
          messages: [],
        },
      });
      opts.onToolLog?.({ phase: "before", toolName: "delegate", args: { department: (params as SubAgentParams).department }, ok: true });
      let output = "";
      sub.subscribe((ev) => {
        if (ev.type === "message_update" && ev.assistantMessageEvent?.type === "text_delta") {
          output += ev.assistantMessageEvent.delta;
        }
      });
      await sub.prompt({ role: "user", content: (params as SubAgentParams).question, timestamp: Date.now() });
      opts.onToolLog?.({ phase: "after", toolName: "delegate", args: { department: (params as SubAgentParams).department }, ok: true });
      const text = output.trim() || "(서브에이전트 응답 없음)";
      const result: AgentToolResult<{ department: SubAgentDepartment }> = { content: [{ type: "text", text }], details: { department: (params as SubAgentParams).department } };
      return result;
    },
  };
  return tool;
}

/** RAG 검색 툴 — 상위 에이전트가 필요 시 부서 데이터셋에서 직접 검색 (RAGFlow 검색 툴 노출) */
export function makeRagSearchTool(datasetIds: string[]): AgentTool<any, { query: string }> {
  const ids = (datasetIds ?? []).filter(Boolean);
  return {
    name: "search",
    label: "부서 자료 검색",
    description: "부서 데이터셋(RagFlow)에서 업무 자료를 검색해 관련 내용을 찾습니다. 근거가 모호하거나 특정 문서 확인이 필요할 때 사용하세요.",
    parameters: Type.Object({ query: Type.String({ description: "검색할 질문/키워드" }) }),
    async execute(toolCallId: string, params: any, _signal?: AbortSignal) {
      if (ids.length === 0) {
        return { content: [{ type: "text", text: "(검색 가능한 부서 데이터셋이 없습니다)" }], details: { query: params?.query } } as AgentToolResult<{ query: string }>;
      }
      requireRagConfig();
      const chunks = await ragflow.retrieve(String(params?.query ?? ""), ids);
      const text = chunks.length
        ? chunks.map((c, i) => "[근거 " + (i + 1) + "] (출처: " + (c.document_name ?? c.document_id ?? "알수없음") + ", 유사도 " + Math.round(c.similarity * 1000) / 1000 + ")\n" + c.content).join("\n\n")
        : "(검색 결과 없음)";
      return { content: [{ type: "text", text }], details: { query: params?.query, count: chunks.length } } as AgentToolResult<{ query: string }>;
    },
  };
}

/** 웹 검색 툴 — 보험·규제·시장 정보 등 최신 외부 정보가 필요할 때 웹에서 검색 (Serper/Tavily) */
export function makeWebSearchTool(opts: AgentOptions = {}): AgentTool<any, { query: string }> {
  return {
    name: "websearch",
    label: "웹 검색",
    description:
      "인터넷에서 최신 정보를 검색합니다. 보험 규제 변경, 시장 동향, 금융감독원/국민연금 등 외부 최신 소식이 필요할 때 사용하세요. 세부 브라우저에서 답을 찾지 못했을 때 활용합니다.",
    parameters: Type.Object({ query: Type.String({ description: "검색할 질문/키워드" }) }),
    async execute(toolCallId: string, params: any, _signal?: AbortSignal) {
      const q = String(params?.query ?? "").trim();
      const res = await webSearch(q || "대한민국 보험 규제 동향");
      // 웹 검색 결과를 근거로 수집 (외부 링크 표시용)
      if (res.ok && res.results.length && opts.onWebCitation) {
        for (const r of res.results) {
          opts.onWebCitation({ title: r.title, url: r.url, snippet: r.snippet });
        }
      }
      const text = formatSearchResults(q, res);
      return { content: [{ type: "text", text }], details: { query: q, provider: res.provider, count: res.results.length } } as AgentToolResult<{ query: string }>;
    },
  };
}

/** 파이썬 데이터 처리 툴 — 업로드/데이터(엑셀·CSV 등)를 pandas로 집계·가공. 코드는 서버가 생성한 검증된 스크립트를 실행 */
export function makePythonDataTool(
  uploadFiles: AgentOptions["uploadFiles"] = []
): AgentTool<any, { script: string; data?: string; filePath?: string; description?: string }> {
  return {
    name: "python_data",
    label: "데이터 처리 (파이썬)",
    description:
      "부서 업무 데이터(보험금 청구 내역, 요율표, 엑셀/CSV 등)를 pandas로 집계·가공·분석합니다. df(pandas DataFrame)와 input_data(원본 문자열)가 로드된 상태로 스크립트가 실행됩니다. filePath에 업로드 파일 경로(엑셀 .xlsx 등)를 주면 그 파일을 df로 엽니다. script에 파이썬 코드를 넣고 print()로 결과를 출력해야 합니다.",
    parameters: Type.Object({
      script: Type.String({ description: "실행할 파이썬 코드. df(pandas DataFrame), input_data(문자열), file_path(문자열) 변수를 사용할 수 있고 print()로 결과 출력." }),
      data: Type.Optional(Type.String({ description: "분석할 원본 데이터 (CSV/표/텍스트). filePath가 있으면 무시" })),
      filePath: Type.Optional(Type.String({ description: "업로드 파일 절대 경로 (엑셀/CSV를 직접 열 때). 데이터 문자열 대신 사용" })),
      description: Type.Optional(Type.String({ description: "수행 중인 작업 설명 (로깅용)" })),
    }),
    async execute(toolCallId: string, params: any) {
      const script = String(params?.script ?? "").trim();
      const data = String(params?.data ?? "").slice(0, 200_000);
      const filePath = String(params?.filePath ?? "").trim();
      if (!script) {
        return { content: [{ type: "text", text: "스크립트가 비어 있습니다." }], details: { ok: false } } as AgentToolResult<any>;
      }
      // 보안: 업로드 파일만 접근 — LLM이 외부/시스템 경로를 지목하면 차단
      if (filePath) {
        const allowed = (uploadFiles ?? []).map((f) => f.filePath);
        const ok = allowed.some((p) => p === filePath);
        if (!ok) {
          return { content: [{ type: "text", text: "요청한 filePath는 이 대화에서 지정한 업로드 파일이 아닙니다. '@파일명'으로 지정한 파일의 경로만 사용할 수 있습니다." }], details: { ok: false, blocked: true } } as AgentToolResult<any>;
        }
      }
      const r = await execPython({ script, inputData: data, filePath: filePath || undefined });
      const text = r.ok ? r.stdout : "데이터 처리 실패:\n" + (r.stderr || "");
      return { content: [{ type: "text", text }], details: { description: params?.description, ok: r.ok } } as AgentToolResult<any>;
    },
  };
}

/** 상위 PI 에이전트 생성 — 페르소나 + 서브에이전트 위임 + RAG 검색 툴 + 웹 검색 + 파이썬 데이터 + hooks + 스킬 */
export function buildPiAgent(persona: Persona, streamFn: StreamFn, model: any, history: PiMessage[] = [], opts: AgentOptions = {}, datasetIds: (string | null | undefined)[] = []) {
  const systemPrompt = buildPersonaSystemPromptWithSkills(persona.systemPrompt, getPersonaSkills(persona.key));
  // 부서별 도구 구성 (src/agent-tools/<부서키>.ts 에서 지정)
  const toolNames = getDepartmentToolNames(persona.key);
  const tools: AgentTool<any>[] = [];
  if (toolNames.includes("delegate")) tools.push(makeSubAgentDelegateTool(streamFn, model, opts));
  const dsIds = (datasetIds ?? []).filter(Boolean) as string[];
  if (dsIds.length && toolNames.includes("rag_search")) tools.push(makeRagSearchTool(dsIds));
  if (toolNames.includes("websearch")) tools.push(makeWebSearchTool(opts));
  if (toolNames.includes("python_data")) tools.push(makePythonDataTool(opts.uploadFiles));
  return new Agent({
    streamFn,
    transformContext: opts.transformContext,
    beforeToolCall: async (ctx: any) => {
      opts.onToolLog?.({ phase: "before", toolName: ctx.toolCall?.name ?? "", args: ctx.args, ok: true });
      return undefined;
    },
    afterToolCall: async (ctx: any) => {
      const ok = !ctx.result?.isError;
      opts.onToolLog?.({ phase: "after", toolName: ctx.toolCall?.name ?? "", args: ctx.args, ok });
      return undefined;
    },
    initialState: {
      systemPrompt,
      model,
      thinkingLevel: opts.thinkingLevel ?? "off",
      tools,
      messages: history,
    },
  });
}

// ---- compact: 컨텍스트 부하 추정 / 자동 압축 판단 ----
const CHAR_PER_TOKEN = 2.5; // 한글/영문 혼합 보수적 추정

export interface ContextLoad {
  tokens: number;
  estimatedHistoryTokens: number;
  estimatedRagTokens: number;
  contextWindow: number;
  ratio: number;
}

export function estimateContextLoad(
  history: Pick<DbMessage, "role" | "content" | "createdAt">[],
  ragChunks: RagHint[],
  contextWindow: number,
  basePromptTokens = 1200
): ContextLoad {
  const histChars = history.reduce((sum, m) => sum + (typeof m.content === "string" ? m.content.length : 0), 0);
  const ragChars = ragChunks.reduce((sum, c) => sum + c.content.length + c.source.length, 0);
  const tokens = basePromptTokens + Math.ceil(histChars / CHAR_PER_TOKEN) + Math.ceil(ragChars / CHAR_PER_TOKEN);
  return {
    tokens,
    estimatedHistoryTokens: Math.ceil(histChars / CHAR_PER_TOKEN),
    estimatedRagTokens: Math.ceil(ragChars / CHAR_PER_TOKEN),
    contextWindow,
    ratio: tokens / contextWindow,
  };
}

export function shouldAutoCompact(load: ContextLoad, threshold = 0.6): boolean {
  return load.ratio > threshold;
}

/** 이전 대화를 pi-agent-core generateSummaryWithUsage로 요약 (models.completeSimple 사용) */
export async function summarizePiHistory(
  messages: Pick<DbMessage, "role" | "content" | "createdAt">[],
  models: { completeSimple: (...args: any[]) => any },
  model: any,
  reserveTokens: number
): Promise<string | null> {
  const agentMessages = toPiHistory(messages);
  const res = await generateSummaryWithUsage(agentMessages as any, models as any, model, reserveTokens);
  return res.ok ? res.value.text : null;
}

// 부서장 페르소나 PI 에이전트 실행 - SSE 스트리밍 호출부
export async function runPersonaAgent(
  persona: Persona,
  userMessage: string,
  history: Pick<DbMessage, "role" | "content" | "createdAt">[],
  ragChunks: RagHint[],
  cb: StreamCallbacks,
  opts: AgentOptions = {}
): Promise<{ text: string; webCitations: { title: string; url: string; snippet: string }[] }> {
  const webCitations: { title: string; url: string; snippet: string }[] = [];
  const { models, model } = await getLlmModel("response");
  const streamFn = models.streamSimple.bind(models);

  // 자동 압축(compact): 히스토리+RAG 부하가 컨텍스트 60% 초과 시 이전 대화를 요약으로 대체
  // 요약은 전용 compact 모델(UI 설정 가능)을 사용해 메인 응답 모델과 분리한다.
  const contextWindow = (model as any)?.contextWindow ?? 32768;
  const load = estimateContextLoad(history, ragChunks, contextWindow);
  let compactSummary: string | null = null;
  if (shouldAutoCompact(load)) {
    try {
      let compactModels = models, compactModel = model;
      try {
        const cl = await getLlmModel("compact");
        compactModels = cl.models; compactModel = cl.model;
      } catch { /* compact 전용 모델 실패 시 메인 모델 fallback */ }
      compactSummary = await summarizePiHistory(history.slice(0, Math.max(0, history.length - 2)), compactModels, compactModel, Math.floor(contextWindow * 0.2));
    } catch {
      compactSummary = null; // 요약 실패 시 전체 히스토리 유지
    }
  }

  const ragBlock = ragChunks.length
    ? `<<<RAG_CONTEXT>>>\n${ragChunks
        .map((c, i) => `[근거 ${i + 1}] (출처: ${c.source || "알수없음"})\n${c.content}`)
        .join("\n\n")}\n<<<END_RAG_CONTEXT>>>`
    : "<<<RAG_CONTEXT>>> (검색된 자료 없음)\n<<<END_RAG_CONTEXT>>>";

  // 요약 시: 요약 + 최근 2개 메시지만 유지, 아니면 최근 N개
  let historyForAgent: PiMessage[];
  if (compactSummary) {
    historyForAgent = [{ role: "user", content: "이전 대화 요약입니다. 이 요약을 이전 대화로 간주하세요:\n" + compactSummary, timestamp: Date.now() - 1000 }];
    historyForAgent.push(...toPiHistory(history.slice(-2)));
  } else {
    historyForAgent = toPiHistory(history, opts.maxHistoryMessages ?? 10);
  }

  // 상위 PI 에이전트 (부서장) — RAG 컨텍스트는 transformContext 훅으로 주입 (검색 결과 없으면 추가 안 함)
  const hasResults = ragChunks.length > 0;
  const uploadFiles = opts.uploadFiles ?? [];
  const transformContext: AgentOptions["transformContext"] | undefined = hasResults || uploadFiles.length > 0
    ? async (messages) => {
        const parts: string[] = [];
        if (ragChunks.length) parts.push(`[업무 자료/검색 결과]\n${ragBlock}`);
        if (uploadFiles.length) {
          parts.push(
            `[지정된 업로드 파일 — 엑셀/CSV 등 원본 바이너리, python_data 도구의 filePath 인자로 사용 가능]\n` +
            uploadFiles.map((f) => `- ${f.filename} (경로: ${f.filePath})`).join("\n")
          );
        }
        const systemRag = {
          role: "user",
          content: parts.join("\n\n"),
          timestamp: Date.now() - 2000,
        } as AgentMessage;
        return [systemRag, ...messages];
      }
    : undefined;
  const agent = buildPiAgent(persona, streamFn, model, historyForAgent, {
    ...opts,
    transformContext,
    onWebCitation: (c) => { webCitations.push(c); opts.onWebCitation?.(c); },
  });

  let text = "";
  let thinkingBuf = "";
  let thinkingStarted = false;
  const unsubscribe = agent.subscribe((ev) => {
    if (ev.type === "message_update" && ev.assistantMessageEvent?.type === "text_delta") {
      const delta = ev.assistantMessageEvent.delta;
      text += delta;
      cb.onTextDelta(delta);
    }
    // 실제 추론(reasoning) 텍스트 수집 → 진행 패널에 노출
    if (ev.type === "message_update" && ev.assistantMessageEvent?.type) {
      const am = ev.assistantMessageEvent as any;
      if (am.type === "thinking_start") { thinkingBuf = ""; thinkingStarted = true; }
      else if (am.type === "thinking_delta") {
        thinkingBuf = (thinkingBuf + (am.delta ?? "")).slice(-100000);
        if (cb.onProgress) cb.onProgress({ type: "thinking", detail: thinkingBuf.trim() || "생각하는 중입니다" });
      }
    }
    const et = ev.type as string;
    if (cb.onProgress && (et === "tool_execution_start" || et === "tool_execution_end" || et === "agent_start" || et === "turn_start" || et === "agent_end")) {
      if (et === "tool_execution_start") {
        cb.onProgress({ type: "tool_start", toolName: (ev as any).toolName, args: (ev as any).args });
        // 도구 실행 직후 한국어 단계 문구 + 직전까지의 추론 스냅샷을 함께 표시
        cb.onProgress({ type: "thinking", detail: (thinkingBuf.trim() || "") + "\n\n[도구 실행] " + ((ev as any).toolName || "") });
      } else if (et === "tool_execution_end") {
        cb.onProgress({ type: "tool_end", toolName: (ev as any).toolName, ok: !(ev as any).isError });
        cb.onProgress({ type: "thinking", detail: thinkingBuf.trim() || "부서장이 업무를 검토하고 있습니다" });
      } else if (et === "agent_start" || et === "turn_start") {
        cb.onProgress({ type: "thinking", detail: thinkingBuf.trim() || "부서장이 질문을 분석하고 있습니다" });
      } else if (et === "agent_end") {
        cb.onProgress({ type: "done" });
      }
    }
  });

  await agent.prompt(
    `[질문/업무 내용]\n${userMessage}`
  );

  unsubscribe();
  return { text, webCitations: [...new Map(webCitations.map((c) => [c.url, c])).values()] };
}
