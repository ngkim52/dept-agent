import { ragflow } from "@/lib/ragflow/client";
import { config, requireRagConfig } from "@/lib/config";
import { getLlmModel } from "@/lib/agent/llm";
import type { Persona } from "@/lib/agent/personas";
import type { Message as DbMessage } from "@/lib/db/schema";
import type { Message as PiMessage} from "@earendil-works/pi-ai";

export interface RagHint {
  content: string;
  source: string;
  similarity: number;
}

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

// 부서장 페르소나 에이전트 실행 - SSE 스트리밍 호출부
export async function runPersonaAgent(
  persona: Persona,
  userMessage: string,
  history: Pick<DbMessage, "role" | "content" | "createdAt">[],
  ragChunks: RagHint[],
  cb: StreamCallbacks
): Promise<{ text: string }> {
  const { models, model } = await getLlmModel();

  const ragBlock = ragChunks.length
    ? `<<<RAG_CONTEXT>>>\n${ragChunks
        .map((c, i) => `[근거 ${i + 1}] (출처: ${c.source || "알수없음"})\n${c.content}`)
        .join("\n\n")}\n<<<END_RAG_CONTEXT>>>`
    : "<<<RAG_CONTEXT>>> (검색된 자료 없음)\n<<<END_RAG_CONTEXT>>>";

  const messages: PiMessage[] = [
    ...toPiHistory(history),
    {
      role: "user",
      content: `[업무 자료/검색 결과]\n${ragBlock}\n\n[질문/업무 내용]\n${userMessage}`,
      timestamp: Date.now(),
    },
  ];

  const stream = models.stream(model, {
    systemPrompt: persona.systemPrompt,
    messages,
  });

  let text = "";
  for await (const event of stream) {
    if (event.type === "text_delta") {
      text += event.delta;
      cb.onTextDelta(event.delta);
    }
  }
  return { text };
}
