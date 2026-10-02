"use client";
import { useState } from "react";
import type { StageMessage, StageParticipant } from "./DebateStage";

// 감정/만족도/입장/속마음 — 대화창과 분리된 별도 섹션
const EMOTION_UI: Record<string, { emoji: string; cls: string }> = {
  "기대": { emoji: "🌤", cls: "bg-pale-green text-pale-green-text" },
  "만족": { emoji: "😌", cls: "bg-pale-green text-pale-green-text" },
  "중립": { emoji: "😐", cls: "bg-canvas text-ink-soft" },
  "우려": { emoji: "⚠️", cls: "bg-pale-amber text-pale-amber-text" },
  "불만": { emoji: "😤", cls: "bg-pale-red text-pale-red-text" },
  "단호": { emoji: "🧱", cls: "bg-canvas text-ink" },
};
const STANCE_UI: Record<string, string> = {
  "찬성": "bg-pale-green-text/15 text-pale-green-text",
  "조건부": "bg-pale-amber-text/15 text-pale-amber-text",
  "반대": "bg-pale-red-text/15 text-pale-red-text",
  "유보": "bg-canvas text-ink-faint",
};

function satColor(v: number): string {
  if (v >= 70) return "var(--color-pale-green-text, #346538)";
  if (v >= 45) return "var(--color-pale-amber-text, #8A6116)";
  return "var(--color-pale-red-text, #A03A3A)";
}

function Sparkline({ values }: { values: number[] }) {
  if (values.length < 2) return null;
  const w = 96, h = 22;
  const pts = values.map((v, i) => {
    const x = (i / (values.length - 1)) * w;
    const y = h - (Math.max(0, Math.min(100, v)) / 100) * h;
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  }).join(" ");
  return (
    <svg width={w} height={h} className="shrink-0" aria-hidden>
      <polyline points={pts} fill="none" stroke={satColor(values[values.length - 1])} strokeWidth="1.6" strokeLinejoin="round" />
    </svg>
  );
}

export default function EmotionPanel({
  participants, messages, status,
}: {
  participants: StageParticipant[];
  messages: StageMessage[];
  status: string;
}) {
  const [openHistory, setOpenHistory] = useState<string | null>(null);

  const spoken = messages.filter((m) => m.kind === "member" || m.kind === "observer");
  const rows = participants.filter((p) => p.kind !== "conclusion").map((p) => {
    const mine = spoken.filter((m) => m.personaKey === p.key);
    const withSat = mine.filter((m) => typeof m.satisfaction === "number") as (StageMessage & { satisfaction: number })[];
    const last = mine[mine.length - 1];
    return {
      p,
      count: mine.length,
      emotion: last?.emotion ?? "",
      satisfaction: typeof last?.satisfaction === "number" ? last.satisfaction : null,
      stance: last?.stance ?? "",
      inner: last?.innerThought ?? "",
      series: withSat.map((m) => m.satisfaction),
      past: [...mine].reverse(),
    };
  });

  return (
    <section className="flex h-[68vh] min-h-[420px] flex-col rounded-2xl border border-line bg-surface p-4 lg:h-[72vh] lg:min-h-[560px]">
      <div className="flex shrink-0 items-center justify-between border-b border-line pb-2">
        <h2 className="font-serif text-base font-semibold text-ink">참가자 감정 · 속마음</h2>
        <span className="font-mono text-[10px] text-ink-faint">{status === "running" ? "실시간" : "요약"}</span>
      </div>
      <p className="mt-2 shrink-0 text-[11px] leading-relaxed text-ink-faint">
        발언에는 드러나지 않은 각 참가자의 감정·만족도·입장·속마음입니다. (대화창과 별도 표시)
      </p>

      <div className="debate-scroll mt-3 min-h-0 flex-1 space-y-2.5 overflow-y-auto pr-1">
        {rows.map(({ p, count, emotion, satisfaction, stance, inner, series, past }) => {
          const emo = EMOTION_UI[emotion];
          const open = openHistory === p.key;
          return (
            <div key={p.key} className="rounded-xl border border-line bg-canvas p-3">
              <div className="flex items-center gap-2">
                <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg text-base" style={{ background: p.color + "22" }}>{p.emoji}</span>
                <span className="min-w-0 flex-1 truncate text-[13px] font-semibold text-ink">{p.name}</span>
                {emo && <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${emo.cls}`}>{emo.emoji} {emotion}</span>}
                {stance && <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${STANCE_UI[stance] ?? "bg-canvas text-ink-soft"}`}>{stance}</span>}
              </div>

              {/* 만족도 */}
              <div className="mt-2 flex items-center gap-2">
                <span className="w-14 shrink-0 font-mono text-[10px] text-ink-faint">만족도</span>
                <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-line">
                  {satisfaction !== null && (
                    <div className="h-full rounded-full transition-[width] duration-700"
                      style={{ width: `${satisfaction}%`, background: satColor(satisfaction) }} />
                  )}
                </div>
                <span className="w-8 shrink-0 text-right font-mono text-[11px] font-bold" style={{ color: satisfaction !== null ? satColor(satisfaction) : undefined }}>
                  {satisfaction !== null ? satisfaction : "—"}
                </span>
                <Sparkline values={series} />
              </div>

              {/* 속마음 */}
              <div className="mt-2 flex items-start gap-2">
                <span className="w-14 shrink-0 font-mono text-[10px] text-ink-faint">속마음</span>
                <p className="min-w-0 flex-1 text-[11.5px] leading-relaxed text-ink-soft">
                  {inner ? `“${inner}”` : <span className="text-ink-faint">아직 없음</span>}
                </p>
              </div>

              <div className="mt-1.5 flex items-center justify-between">
                <span className="font-mono text-[10px] text-ink-faint">{count}발언</span>
                {count > 1 && (
                  <button onClick={() => setOpenHistory(open ? null : p.key)}
                    className="font-mono text-[10px] text-accent transition-colors hover:text-accent-deep">
                    {open ? "이전 속마음 닫기" : "이전 속마음 보기"}
                  </button>
                )}
              </div>

              {open && (
                <div className="mt-2 space-y-1 border-t border-line pt-2">
                  {past.filter((m) => m.innerThought).slice(0, 6).map((m) => (
                    <p key={m.id} className="text-[11px] leading-relaxed text-ink-soft">
                      <span className="mr-1 font-mono text-[10px] text-ink-faint">R{m.round}</span>
                      {m.emotion && <span className="mr-1">{EMOTION_UI[m.emotion]?.emoji ?? ""}{m.emotion}</span>}
                      <span className="text-ink-faint">·</span> {m.innerThought}
                    </p>
                  ))}
                  {past.filter((m) => m.innerThought).length === 0 && <p className="text-[11px] text-ink-faint">기록된 속마음이 없습니다.</p>}
                </div>
              )}
            </div>
          );
        })}
        {rows.length === 0 && <p className="py-6 text-center text-xs text-ink-faint">참가자 정보를 불러오는 중…</p>}
      </div>
    </section>
  );
}
