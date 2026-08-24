import { NextRequest } from "next/server";
import { randomUUID } from "node:crypto";
import { db, schema } from "@/lib/db";
import { and, eq } from "drizzle-orm";
import { requireUser, jsonError, HttpError } from "@/lib/auth/http";
import { getPersona } from "@/lib/agent/personas";
import { retrieveDepartmentChunks, runPersonaAgent } from "@/lib/agent/engine";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// SSE 데이터 프레임 인코더
function sse(event: string, data: unknown): Uint8Array {
  return new TextEncoder().encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
}

export async function POST(req: NextRequest) {
  const user = await requireUser(req).catch(() => null);
  if (!user) return jsonError(new HttpError(401, "로그인이 필요합니다."));

  const body = await req.json().catch(() => ({}));
  const conversationId = String(body.conversationId ?? "");
  const message = String(body.message ?? "").trim();
  if (!conversationId || !message) return jsonError(new HttpError(400, "conversationId/message 필요"));

  let conversation;
  try {
    conversation = await db.query.conversations.findFirst({
      where: and(eq(schema.conversations.id, conversationId), eq(schema.conversations.userId, user.id)),
      with: { department: true },
    });
  } catch (e) {
    return jsonError(e);
  }
  if (!conversation || !conversation.department) {
    return jsonError(new HttpError(404, "대화 또는 부서를 찾을 수 없습니다."));
  }
  const persona = getPersona(conversation.department.personaKey);
  if (!persona) return jsonError(new HttpError(500, "페르소나가 정의되지 않았습니다."));

  // 이전 메시지 로드 (현재 질문 이전 히스토리만. 저장 전에 읽어 현재 질문이 중복 삽입되지 않게 함)
  const history = await db.query.messages.findMany({
    where: eq(schema.messages.conversationId, conversationId),
    orderBy: (m, { asc }) => [asc(m.createdAt)],
  });

  // 사용자 메시지 저장
  await db.insert(schema.messages).values({
    id: randomUUID(), conversationId, role: "user", content: message, createdAt: new Date(),
  });

  // RAGFlow 검색 (부서 데이터셋만)
  const chunks = await retrieveDepartmentChunks(message, conversation.department.ragflowDatasetId);

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const send = (ev: string, data: unknown) => controller.enqueue(sse(ev, data));
      let assistantText = "";
      try {
        if (chunks.length === 0) {
          await new Promise((r) => setTimeout(r, 300)); // RAG 검색 시간치(추적용)
        }
        send("start", { conversationId });
        send("citations", { chunks: chunks.map(c => ({ content: c.content.slice(0, 120), source: c.source, similarity: Math.round(c.similarity * 1000) / 1000 })) });
        const thinkingLevel = ["off", "minimal", "low", "medium", "high", "xhigh", "max"].includes(body.thinkingLevel)
          ? body.thinkingLevel
          : "off";
        await runPersonaAgent(persona, message, history, chunks, {
          onTextDelta(delta) { assistantText += delta; send("text_delta", { delta }); },
        }, { thinkingLevel });
        const assistantMessageId = randomUUID();
        await db.insert(schema.messages).values({
          id: assistantMessageId,
          conversationId,
          role: "assistant",
          content: assistantText,
          citations: JSON.stringify(chunks),
          createdAt: new Date(),
        });
        // 대화 제목(최초 대화면 질문 요약)
        if (conversation.title === "새 대화") {
          await db.update(schema.conversations)
            .set({ title: message.length > 30 ? message.slice(0, 30) + "…" : message })
            .where(eq(schema.conversations.id, conversationId));
        }
        send("done", { messageId: assistantMessageId, content: assistantText });
      } catch (e) {
        console.error("chat stream error:", e);
        send("error", { error: "부서장 에이전트 처리 중 오류가 발생했습니다." });
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    },
  });
}
