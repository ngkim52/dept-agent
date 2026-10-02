"use client";
import { useEffect, useMemo, useRef, useState } from "react";

export type StageMessage = {
  id: string; seq: number; personaKey: string; personaName: string; personaEmoji: string; personaColor: string;
  kind: string; round: number; content: string; createdAt: string;
  // 감정/만족도/입장/속마음 — 대화창에는 그리지 않고 별도 '감정·속마음' 섹션에서만 사용한다.
  emotion?: string; satisfaction?: number | null; stance?: string; innerThought?: string;
};
export type StageParticipant = { key: string; name: string; emoji: string; color: string; role: string; kind: string };

// 관전 타임라인 — 말풍선형 메신저 뷰
export default function DebateStage({
  messages, participants, currentSpeakerKey, typing,
}: {
  messages: StageMessage[];
  participants: StageParticipant[];
  currentSpeakerKey: string | null;
  typing: boolean;
}) {
  const boxRef = useRef<HTMLDivElement>(null);
  const atBottomRef = useRef(true);
  const seenRef = useRef(0);
  const [newCount, setNewCount] = useState(0);

  // 안전망: 어떤 경로로든 같은 id 가 두 번 들어와도 렌더 단계에서 중복 키를 만들지 않는다.
  const list = useMemo(() => {
    const seen = new Set<string>();
    return messages.filter((m) => (seen.has(m.id) ? false : (seen.add(m.id), true)));
  }, [messages]);

  function onScroll() {
    const el = boxRef.current;
    if (!el) return;
    atBottomRef.current = el.scrollHeight - el.scrollTop - el.clientHeight < 80;
    if (atBottomRef.current) setNewCount(0);
  }

  // 새 발언이 아래에 쌓일 때: 바닥을 보고 있으면 자동 스크롤, 아니면 "새 발언 N개" 버튼
  useEffect(() => {
    const el = boxRef.current;
    const added = list.length - seenRef.current;
    seenRef.current = list.length;
    if (!el || added <= 0) return;
    if (atBottomRef.current) el.scrollTop = el.scrollHeight;
    else setNewCount((n) => n + added);
  }, [list.length]);

  useEffect(() => {
    const el = boxRef.current;
    if (el && atBottomRef.current) el.scrollTop = el.scrollHeight;
  }, [typing]);

  function jump() {
    const el = boxRef.current;
    if (!el) return;
    atBottomRef.current = true;
    setNewCount(0);
    el.scrollTop = el.scrollHeight;
  }

  const typingPersona = participants.find((p) => p.key === currentSpeakerKey);

  return (
    <div className="relative">
      <div ref={boxRef} onScroll={onScroll}
        className="debate-scroll h-[68vh] min-h-[420px] overflow-y-auto rounded-2xl border border-line bg-canvas px-4 py-4 lg:h-[72vh] lg:min-h-[560px]">
        {list.length === 0 && (
          <p className="py-16 text-center text-sm text-ink-faint">첫 발언을 기다리는 중입니다…</p>
        )}
        <div className="space-y-3">
          {list.map((m) => {
            if (m.kind === "system") {
              return (
                <div key={m.id} className="flex items-center gap-3 py-1">
                  <span className="h-px flex-1 bg-line" />
                  <span className="font-mono text-[11px] text-ink-faint">{m.content}</span>
                  <span className="h-px flex-1 bg-line" />
                </div>
              );
            }
            if (m.kind === "conclusion") {
              return (
                <div key={m.id} className="rise-in rounded-xl border border-accent/40 bg-accent-soft/50 p-4">
                  <p className="font-mono text-[10px] font-bold uppercase tracking-wide text-accent">최종 결론 에이전트</p>
                  <p className="mt-1 whitespace-pre-wrap text-[13px] leading-relaxed text-ink">{m.content}</p>
                </div>
              );
            }
            const isObserver = m.kind === "observer";
            const speaking = m.personaKey === currentSpeakerKey;
            return (
              <div key={m.id} className="rise-in flex gap-3">
                <span className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-xl text-lg"
                  style={{ background: m.personaColor + "22", border: `1px solid ${m.personaColor}55` }}>
                  {m.personaEmoji}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="flex items-center gap-2 text-[11px] text-ink-faint">
                    <span className="font-semibold" style={{ color: m.personaColor }}>{m.personaName}</span>
                    <span className="font-mono">R{m.round}</span>
                    {isObserver && <span className="rounded-full bg-pale-red px-1.5 py-0.5 font-mono text-[10px] text-pale-red-text">감독 관점</span>}
                    {speaking && <span className="rounded-full bg-pale-green px-1.5 py-0.5 font-mono text-[10px] text-pale-green-text">발언 중</span>}
                  </p>
                  <div className={`mt-1 rounded-2xl border px-3.5 py-2.5 text-[13px] leading-relaxed text-ink ${
                    isObserver ? "border-pale-red-text/25 bg-pale-red/40" : "border-line bg-surface"
                  }`}>
                    <span className="whitespace-pre-wrap">{m.content}</span>
                  </div>
                </div>
              </div>
            );
          })}

          {typing && (
            <div className="flex items-center gap-3 opacity-70">
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-surface text-lg"
                style={typingPersona ? { border: `1px solid ${typingPersona.color}55` } : undefined}>
                {typingPersona?.emoji ?? "✍️"}
              </span>
              <span className="flex items-center gap-1 rounded-2xl border border-line bg-surface px-4 py-3">
                {[0, 1, 2].map((i) => (
                  <span key={i} className="h-1.5 w-1.5 animate-bounce rounded-full bg-ink-faint" style={{ animationDelay: `${i * 120}ms` }} />
                ))}
              </span>
              <span className="font-mono text-[11px] text-ink-faint">{typingPersona?.name ?? "다음 발언자"} 입력 중…</span>
            </div>
          )}
        </div>
      </div>

      {newCount > 0 && (
        <button onClick={jump}
          className="absolute bottom-4 left-1/2 -translate-x-1/2 rounded-full bg-ink px-4 py-2 text-xs font-semibold text-white shadow-lg">
          새 발언 {newCount}개 ↓
        </button>
      )}
    </div>
  );
}
