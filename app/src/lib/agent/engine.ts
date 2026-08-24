import { ragflow } from "@/lib/ragflow/client";
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
  source: string;
  similarity: number;
}

/** pi-ai Models의 streamSimple 부분 (테스트 대체용 슬림 인터페이스) */
import type { AssistantMessageEventStream } from "@earendil-works/pi-ai";
export type StreamFnLike = StreamFn;

// 부서 RAGFlow 데이터셋에서 검색 (부서 = 데이터셋 = 권한 경계)
export async function retrieveDepartmentChunks(
  question: string,
  datasetId: string | null | undefined
): Promise<RagHint[]> {
  if (!datasetId) return [];
  requireRagConfig();
  const chunks = await ragflow.retrieve(question, [datasetId]);
  return chunks.map((c) => ({
    content: c.content,
    source: c.document_name ?? c.document_id ?? "",
    similarity: c.similarity,
  }));
}

export interface StreamCallbacks {
  onTextDelta: (delta: string) => void;
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
      const sub = new Agent({
        streamFn,
        initialState: {
          systemPrompt: subPersonaPrompt,
          model,
          thinkingLevel: opts.thinkingLevel ?? "off",
          tools: [],
          messages: [],
        },
      });
      let output = "";
      sub.subscribe((ev) => {
        if (ev.type === "message_update" && ev.assistantMessageEvent?.type === "text_delta") {
          output += ev.assistantMessageEvent.delta;
        }
      });
      await sub.prompt({ role: "user", content: (params as SubAgentParams).question, timestamp: Date.now() });
      const text = output.trim() || "(서브에이전트 응답 없음)";
      const result: AgentToolResult<{ department: SubAgentDepartment }> = { content: [{ type: "text", text }], details: { department: (params as SubAgentParams).department } };
      return result;
    },
  };
  return tool;
}

/** RAG 검색 툴 — 상위 에이전트가 필요 시 부서 데이터셋에서 직접 검색 (RAGFlow 검색 툴 노출) */
export function makeRagSearchTool(datasetId: string): AgentTool<any, { query: string }> {
  return {
    name: "search",
    label: "부서 자료 검색",
    description: "부서 데이터셋(RAGFlow)에서 업무 자료를 검색해 관련 내용을 찾습니다. 근거가 모호하거나 특정 문서 확인이 필요할 때 사용하세요.",
    parameters: Type.Object({ query: Type.String({ description: "검색할 질문/키워드" }) }),
    async execute(toolCallId: string, params: any, _signal?: AbortSignal) {
      if (!datasetId) {
        return { content: [{ type: "text", text: "(검색 가능한 부서 데이터셋이 없습니다)" }], details: { query: params?.query } } as AgentToolResult<{ query: string }>;
      }
      requireRagConfig();
      const chunks = await ragflow.retrieve(String(params?.query ?? ""), [datasetId]);
      const text = chunks.length
        ? chunks.map((c, i) => "[근거 " + (i + 1) + "] (출처: " + (c.document_name ?? c.document_id ?? "알수없음") + ", 유사도 " + Math.round(c.similarity * 1000) / 1000 + ")\n" + c.content).join("\n\n")
        : "(검색 결과 없음)";
      return { content: [{ type: "text", text }], details: { query: params?.query, count: chunks.length } } as AgentToolResult<{ query: string }>;
    },
  };
}

/** 상위 PI 에이전트 생성 — 페르소나 + 서브에이전트 위임 + RAG 검색 툴 + hooks + 스킬 */
export function buildPiAgent(persona: Persona, streamFn: StreamFn, model: any, history: PiMessage[] = [], opts: AgentOptions = {}, ragDatasetId?: string) {
  const systemPrompt = buildPersonaSystemPromptWithSkills(persona.systemPrompt, getPersonaSkills(persona.key));
  const tools: AgentTool<any>[] = [makeSubAgentDelegateTool(streamFn, model, opts)];
  if (ragDatasetId) tools.push(makeRagSearchTool(ragDatasetId));
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
): Promise<{ text: string }> {
  const { models, model } = await getLlmModel();
  const streamFn = models.streamSimple.bind(models);

  // 자동 압축(compact): 히스토리+RAG 부하가 컨텍스트 60% 초과 시 이전 대화를 요약으로 대체
  const contextWindow = (model as any)?.contextWindow ?? 32768;
  const load = estimateContextLoad(history, ragChunks, contextWindow);
  let compactSummary: string | null = null;
  if (shouldAutoCompact(load)) {
    try {
      compactSummary = await summarizePiHistory(history.slice(0, Math.max(0, history.length - 2)), models, model, Math.floor(contextWindow * 0.2));
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
  const transformContext: AgentOptions["transformContext"] | undefined = hasResults
    ? async (messages) => {
        const systemRag = {
          role: "user",
          content: `[업무 자료/검색 결과]\n${ragBlock}`,
          timestamp: Date.now() - 2000,
        } as AgentMessage;
        return [systemRag, ...messages];
      }
    : undefined;
  const agent = buildPiAgent(persona, streamFn, model, historyForAgent, { ...opts, transformContext });

  let text = "";
  const unsubscribe = agent.subscribe((ev) => {
    if (ev.type === "message_update" && ev.assistantMessageEvent?.type === "text_delta") {
      const delta = ev.assistantMessageEvent.delta;
      text += delta;
      cb.onTextDelta(delta);
    }
  });

  await agent.prompt(
    `[질문/업무 내용]\n${userMessage}`
  );

  unsubscribe();
  return { text };
}
