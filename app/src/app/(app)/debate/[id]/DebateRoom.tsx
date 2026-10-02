"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { mergeIncoming, maxSeqOf } from "@/lib/debate/merge";
import DebateStage, { type StageMessage, type StageParticipant } from "./DebateStage";
import EmotionPanel from "./EmotionPanel";
import ReportView from "./ReportView";

type SessionDto = {
  id: string; title: string; brief: string; attachmentName: string | null; status: string; durationSec: number;
  participants: StageParticipant[]; round: number; turnCount: number;
  verdict: string | null; hasReport: boolean; startedAt: string | null; endedAt: string | null;
};

const ENDED = ["finished", "stopped", "failed"];
const STATUS_LABEL: Record<string, string> = { draft: "준비", running: "토론 중", finished: "완료", stopped: "중단", failed: "실패" };

function mmss(sec: number): string {
  const s = Math.max(0, sec);
  return `${String(Math.floor(s / 60)).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`;
}

// 다음 발언자 추정 — 엔진과 같은 규칙(옵저버 먼저, 이후 등록 순서)
function nextSpeakerKey(participants: StageParticipant[], turnCount: number): string | null {
  const order = [...participants.filter((p) => p.kind === "observer"), ...participants.filter((p) => p.kind !== "observer")];
  if (!order.length) return null;
  return order[turnCount % order.length]?.key ?? null;
}

export default function DebateRoom({ id, initialTab = "live" }: { id: string; initialTab?: "live" | "report" }) {
  const router = useRouter();

  const [session, setSession] = useState<SessionDto | null>(null);
  const [messages, setMessages] = useState<StageMessage[]>([]);
  const [status, setStatus] = useState("draft");
  const [round, setRound] = useState(0);
  const [turnCount, setTurnCount] = useState(0);
  const [remainingSec, setRemainingSec] = useState(0);
  const [hasReport, setHasReport] = useState(false);
  const [verdict, setVerdict] = useState<string | null>(null);
  const [participants, setParticipants] = useState<StageParticipant[]>([]);

  const [tab, setTab] = useState<"live" | "report">(initialTab);
  const userPickedTab = useRef(false);
  const [md, setMd] = useState<string | null>(null);
  const [mdLoading, setMdLoading] = useState(false);
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);

  const lastSeqRef = useRef(0);
  const readyRef = useRef(false);   // 초기 로드 완료 전에는 폴링하지 않는다(중복 방지)
  const messagesRef = useRef<StageMessage[]>([]);  // 병합 기준이 되는 최신 목록

  const loadReport = useCallback(async () => {
    setMdLoading(true);
    try {
      const r = await fetch(`/api/debate/${id}/report`, { cache: "no-store" });
      if (r.ok) { const d = await r.json(); setMd(d.md ?? null); setVerdict(d.verdict ?? null); setHasReport(true); }
      else { setMd(null); setHasReport(false); }
    } catch { setMd(null); }
    finally { setMdLoading(false); }
  }, [id]);

  // 최초 로드
  useEffect(() => {
    (async () => {
      try {
        const r = await fetch(`/api/debate/${id}`, { cache: "no-store" });
        const d = await r.json();
        if (d.error) { setErr(d.error); return; }
        setSession(d.session);
        const initial: StageMessage[] = d.messages ?? [];
        messagesRef.current = initial;
        setMessages(initial);
        lastSeqRef.current = maxSeqOf(initial);
        readyRef.current = true;
        setStatus(d.session.status);
        setRound(d.session.round);
        setTurnCount(d.session.turnCount);
        setHasReport(d.session.hasReport);
        setVerdict(d.session.verdict);
        setParticipants(d.session.participants ?? []);
        setRemainingSec(d.session.durationSec);
        if (d.session.status !== "draft" && initialTab === "report") { userPickedTab.current = true; void loadReport(); }
      } catch { setErr("토론을 불러오지 못했습니다."); }
    })();
  }, [id, initialTab, loadReport]);

  // 증분 폴링 (관전)
  useEffect(() => {
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | null = null;

    async function tick() {
      // 초기 로드가 끝나기 전에 since=0 으로 전체를 받아 중복 append 되는 것을 막는다.
      if (!readyRef.current) { timer = setTimeout(tick, 300); return; }
      try {
        const r = await fetch(`/api/debate/${id}/stream?since=${lastSeqRef.current}`, { cache: "no-store" });
        const d = await r.json();
        if (cancelled) return;
        if (Array.isArray(d.messages) && d.messages.length) {
          // 중복 방지: 기존 목록(ref)에서 id/seq 를 비교해 "새 것만" 반영한다.
          const merged = mergeIncoming(messagesRef.current, d.messages as StageMessage[], lastSeqRef.current);
          if (merged.added > 0) {
            messagesRef.current = merged.messages;
            lastSeqRef.current = merged.lastSeq;
            setMessages(merged.messages);
          } else {
            lastSeqRef.current = Math.max(lastSeqRef.current, maxSeqOf(d.messages as StageMessage[]));
          }
        }
        setStatus(d.status); setRound(d.round); setTurnCount(d.turnCount);
        setRemainingSec(d.remainingSec); setHasReport(d.hasReport); setVerdict(d.verdict);
        if (Array.isArray(d.participants)) setParticipants(d.participants);
        if (ENDED.includes(d.status)) {
          if (d.hasReport) {
            void loadReport();
            // 토론이 끝나면 렌더링된 보고서(뷰어)를 먼저 보여준다 — 사용자가 탭을 직접 고른 경우는 존중.
            if (!userPickedTab.current) setTab("report");
          }
          return;
        }
        const hidden = typeof document !== "undefined" && document.hidden;
        timer = setTimeout(tick, hidden ? 5000 : 1200);
      } catch {
        if (!cancelled) timer = setTimeout(tick, 3000);
      }
    }
    tick();
    return () => { cancelled = true; if (timer) clearTimeout(timer); };
  }, [id, loadReport]);

  // 남은 시간 카운트다운 (부드러운 표시)
  useEffect(() => {
    if (status !== "running") return;
    const t = setInterval(() => setRemainingSec((s) => Math.max(0, s - 1)), 1000);
    return () => clearInterval(t);
  }, [status]);

  async function stop() {
    setBusy(true);
    try { await fetch(`/api/debate/${id}/stop`, { method: "POST" }); } finally { setBusy(false); }
  }
  async function start() {
    setBusy(true);
    try { await fetch(`/api/debate/${id}/start`, { method: "POST" }); setStatus("running"); } finally { setBusy(false); }
  }
  /** 새 토론 시작 — 목록(작성 폼)으로 돌아간다 */
  function startNew() {
    router.push("/debate");
  }
  /** 같은 안건·같은 참가자·같은 시간으로 새 토론을 만들어 바로 시작 */
  async function restart() {
    if (!session) return;
    setBusy(true); setErr("");
    try {
      const res = await fetch("/api/debate", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: session.title, brief: session.brief, attachmentName: session.attachmentName,
          durationSec: session.durationSec, participantKeys: session.participants.map((p) => p.key),
        }),
      });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) { setErr(d.error ?? "새 토론을 만들지 못했습니다."); return; }
      const newId = d.session.id as string;
      await fetch(`/api/debate/${newId}/start`, { method: "POST" });
      router.push(`/debate/${newId}`);
    } catch { setErr("새 토론을 만들지 못했습니다."); }
    finally { setBusy(false); }
  }

  const currentSpeakerKey = status === "running" ? nextSpeakerKey(participants, turnCount) : null;
  const progress = session ? Math.min(100, Math.round(((session.durationSec - remainingSec) / Math.max(1, session.durationSec)) * 100)) : 0;

  return (
    <div className="mx-auto w-full max-w-[1440px] px-4 py-6 pb-20">
      {/* 상단 고정 영역 — 관전 중에도 목록/새 토론으로 바로 이동할 수 있게 한다 */}
      <div className="sticky top-0 z-20 -mx-4 mb-3 border-b border-line bg-canvas/95 px-4 pb-3 pt-4 backdrop-blur">
      {/* 헤더 */}
      <header className="mb-3">
        <div className="mb-1.5 flex flex-wrap items-center gap-2">
          <button onClick={startNew}
            className="rounded-md border border-line-strong bg-surface px-2.5 py-1.5 text-[11px] font-semibold text-ink-soft transition-colors hover:bg-accent-soft hover:text-accent">
            ← 토론 목록 · 새 토론
          </button>
          <button onClick={restart} disabled={busy || !session}
            className="rounded-md border border-line-strong bg-surface px-2.5 py-1.5 text-[11px] font-semibold text-ink-soft transition-colors hover:bg-accent-soft hover:text-accent disabled:opacity-50">
            ↻ 같은 안건으로 다시 토론
          </button>
          {session && <span className="font-mono text-[10px] text-ink-faint">참가 {session.participants.length}명 · {Math.round(session.durationSec / 60)}분</span>}
        </div>
        <h1 className="font-serif text-2xl font-semibold tracking-tight text-ink">{session?.title ?? "토론 준비 중…"}</h1>
        {session?.attachmentName && <p className="mt-1 font-mono text-[11px] text-ink-faint">📎 {session.attachmentName}</p>}
        {session?.brief && <p className="mt-1 line-clamp-2 text-xs text-ink-soft">{session.brief}</p>}
      </header>

      {err && <p role="alert" className="mb-3 rounded-md bg-pale-red px-3 py-2 text-xs text-pale-red-text">{err}</p>}

      {/* 스테이지 바 */}
      <div className="mb-3 flex flex-wrap items-center gap-3 rounded-2xl border border-line bg-surface px-4 py-3">
        <span className={`rounded-full px-2.5 py-0.5 font-mono text-[10px] font-bold ${
          status === "running" ? "bg-pale-amber text-pale-amber-text"
            : status === "finished" ? "bg-pale-green text-pale-green-text"
            : status === "failed" ? "bg-pale-red text-pale-red-text"
            : "bg-canvas text-ink-soft"
        }`}>{STATUS_LABEL[status] ?? status}</span>
        <span className="font-mono text-sm font-bold text-ink">{mmss(remainingSec)}</span>
        <div className="h-1.5 min-w-[120px] flex-1 overflow-hidden rounded-full bg-canvas">
          <div className="h-full rounded-full bg-accent transition-[width] duration-1000" style={{ width: `${progress}%` }} />
        </div>
        <span className="font-mono text-[11px] text-ink-faint">R{round} · {turnCount}발언</span>
        <div className="flex items-center gap-1">
          {participants.map((p) => (
            <span key={p.key} title={`${p.name}${p.role ? " · " + p.role : ""}`}
              className={`flex h-7 w-7 items-center justify-center rounded-lg text-sm transition-all ${
                p.key === currentSpeakerKey ? "ring-2 ring-accent ring-offset-1 ring-offset-surface" : "opacity-80"
              }`} style={{ background: p.color + "22" }}>
              {p.emoji}
            </span>
          ))}
        </div>
        <div className="ml-auto flex gap-2">
          {status === "draft" && (
            <button onClick={start} disabled={busy} className="lift rounded-md bg-ink px-3.5 py-2 text-xs font-semibold text-white disabled:opacity-50">토론 시작</button>
          )}
          {status === "running" && (
            <button onClick={stop} disabled={busy}
              className="rounded-md border border-line-strong bg-surface px-3.5 py-2 text-xs font-semibold text-ink-soft transition-colors hover:bg-pale-red hover:text-pale-red-text disabled:opacity-50">
              중단하고 결론
            </button>
          )}
        </div>
      </div>
      </div>
      {/* 탭 */}
      <div className="mb-3 flex gap-1.5 rounded-lg border border-line bg-surface p-1.5">
        {([["live", "관전"], ["report", "최종 보고서"]] as const).map(([k, label]) => (
          <button key={k} onClick={() => { userPickedTab.current = true; setTab(k); if (k === "report" && !md) void loadReport(); }}
            className={`flex-1 rounded-md py-1.5 text-xs font-semibold transition-colors ${
              tab === k ? "bg-ink text-white" : "text-ink-soft hover:bg-accent-soft hover:text-accent"
            }`}>
            {label}{k === "report" && hasReport ? " ●" : ""}
          </button>
        ))}
      </div>

      {status === "running" && tab === "live" && (
        <p className="mb-2 animate-pulse text-center font-mono text-[11px] text-ink-faint">에이전트들이 토론 중입니다 — 사람은 관전만 하세요</p>
      )}
      {status === "running" && remainingSec === 0 && (
        <p className="mb-2 animate-pulse text-center font-mono text-[11px] text-accent">토론이 끝났습니다 — 최종 결론 에이전트가 보고서를 작성 중입니다…</p>
      )}
      {status === "stopped" && tab === "live" && (
        <p className="mb-2 text-center font-mono text-[11px] text-ink-faint">토론이 중단되었습니다. 최종 보고서 탭에서 결론을 확인하세요.</p>
      )}

      {tab === "live" ? (
        <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_320px]">
          <div className="min-w-0">
            <DebateStage messages={messages} participants={participants} currentSpeakerKey={currentSpeakerKey} typing={status === "running"} />
          </div>
          {/* 감정·속마음 — 대화창과 분리된 별도 섹션 */}
          <div className="min-w-0">
            <EmotionPanel participants={participants} messages={messages} status={status} />
          </div>
        </div>
      ) : (
        <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_320px]">
          <div className="debate-scroll h-[68vh] min-h-[420px] min-w-0 overflow-y-auto pr-1 lg:h-[72vh] lg:min-h-[560px]">
            {mdLoading && !md && <p className="py-10 text-center text-sm text-ink-faint">보고서를 불러오는 중…</p>}
            <ReportView id={id} md={md} verdict={verdict} onReload={loadReport} />
          </div>
          <div className="min-w-0">
            <EmotionPanel participants={participants} messages={messages} status={status} />
          </div>
        </div>
      )}

      {/* 토론 종료 후 다음 행동 — 새 토론으로 이어가기 */}
      {ENDED.includes(status) && (
        <div className="mt-5 rounded-2xl border border-accent/40 bg-accent-soft/40 p-5">
          <p className="font-serif text-base font-semibold text-ink">
            {status === "stopped" ? "토론이 중단되었습니다." : status === "failed" ? "토론이 중단되었습니다(오류)." : "토론이 끝났습니다."}
          </p>
          <p className="mt-1 text-xs text-ink-soft">결과를 확인했으면 다른 안건으로 새 토론을 시작할 수 있습니다.</p>
          <div className="mt-3 flex flex-wrap gap-2">
            {hasReport && tab === "live" && (
              <button onClick={() => { setTab("report"); if (!md) void loadReport(); }}
                className="lift rounded-md bg-ink px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-[#33312E]">
                최종 보고서 보기
              </button>
            )}
            <button onClick={startNew}
              className="lift rounded-md bg-ink px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-[#33312E]">
              ＋ 새 토론 시작
            </button>
            <button onClick={restart} disabled={busy}
              className="lift rounded-md border border-line-strong bg-surface px-4 py-2 text-sm font-semibold text-ink transition-colors hover:bg-accent-soft hover:text-accent disabled:opacity-50">
              ↻ 같은 안건으로 다시 토론
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
