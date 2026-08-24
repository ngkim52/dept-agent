import { ragflow } from "@/lib/ragflow/client";
import { requireRagConfig, config } from "@/lib/config";
import { getLlmModel } from "@/lib/agent/llm";
import { getPersona, type Persona } from "@/lib/agent/personas";
import type { Message as DbMessage } from "@/lib/db/schema";
import { Agent, type AgentTool, type AgentToolResult, type StreamFn } from "@earendil-works/pi-agent-core";
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
export function toPiHistory(history: Pick<DbMessage, "role" | "content" | "createdAt">[]): PiMessage[] {
  return history
    .filter((m) => m.role !== "system")
    .slice(-10)
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
export function makeSubAgentDelegateTool(streamFn: StreamFn, model: any): AgentTool<any, { department: SubAgentDepartment }> {
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
      const sub = new Agent({
        streamFn,
        initialState: {
          systemPrompt: subPersona.systemPrompt,
          model,
          thinkingLevel: "off",
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

/** 상위 PI 에이전트 생성 — 부서 페르소나(부서장) 역할 + 서브에이전트 위임 툴 포함 */
export function buildPiAgent(persona: Persona, streamFn: StreamFn, model: any, history: PiMessage[] = []) {
  return new Agent({
    streamFn,
    initialState: {
      systemPrompt: persona.systemPrompt,
      model,
      thinkingLevel: "off",
      tools: [makeSubAgentDelegateTool(streamFn, model)],
      messages: history,
    },
  });
}

// 부서장 페르소나 PI 에이전트 실행 - SSE 스트리밍 호출부
export async function runPersonaAgent(
  persona: Persona,
  userMessage: string,
  history: Pick<DbMessage, "role" | "content" | "createdAt">[],
  ragChunks: RagHint[],
  cb: StreamCallbacks
): Promise<{ text: string }> {
  const { models, model } = await getLlmModel();
  const streamFn = models.streamSimple.bind(models);

  const ragBlock = ragChunks.length
    ? `<<<RAG_CONTEXT>>>\n${ragChunks
        .map((c, i) => `[근거 ${i + 1}] (출처: ${c.source || "알수없음"})\n${c.content}`)
        .join("\n\n")}\n<<<END_RAG_CONTEXT>>>`
    : "<<<RAG_CONTEXT>>> (검색된 자료 없음)\n<<<END_RAG_CONTEXT>>>";

  // 상위 PI 에이전트 (부서장) — 히스토리 주입
  const agent = buildPiAgent(persona, streamFn, model, toPiHistory(history));

  let text = "";
  const unsubscribe = agent.subscribe((ev) => {
    if (ev.type === "message_update" && ev.assistantMessageEvent?.type === "text_delta") {
      const delta = ev.assistantMessageEvent.delta;
      text += delta;
      cb.onTextDelta(delta);
    }
  });

  await agent.prompt(
    `[업무 자료/검색 결과]\n${ragBlock}\n\n[질문/업무 내용]\n${userMessage}`
  );

  unsubscribe();
  return { text };
}
