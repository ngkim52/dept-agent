"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import PersonaManager, { type PersonaOption } from "./PersonaManager";

type DebateParticipant = { key: string; name: string; emoji: string; color: string; role: string; kind: string };
type DebateSession = {
  id: string; title: string; brief: string; attachmentName: string | null; status: string; durationSec: number;
  participants: DebateParticipant[]; round: number; turnCount: number; verdict: string | null;
  hasReport: boolean; createdAt: string;
};

const STATUS_UI: Record<string, { label: string; cls: string }> = {
  draft: { label: "준비", cls: "bg-canvas text-ink-soft" },
  running: { label: "토론 중", cls: "bg-pale-amber text-pale-amber-text" },
  finished: { label: "완료", cls: "bg-pale-green text-pale-green-text" },
  stopped: { label: "중단", cls: "bg-canvas text-ink-soft" },
  failed: { label: "실패", cls: "bg-pale-red text-pale-red-text" },
};

const DURATIONS: { sec: number; label: string }[] = [
  { sec: 60, label: "1분" }, { sec: 180, label: "3분" }, { sec: 300, label: "5분" }, { sec: 600, label: "10분" }, { sec: 900, label: "15분" },
];
const DEFAULT_KEYS = ["claims-planning-lead", "claims-review-lead", "group-head", "critic", "optimist"];

export default function DebatePage() {
  const router = useRouter();
  const [personas, setPersonas] = useState<PersonaOption[]>([]);
  const [sessions, setSessions] = useState<DebateSession[]>([]);
  const [loading, setLoading] = useState(true);

  const [title, setTitle] = useState("");
  const [brief, setBrief] = useState("");
  const [attachment, setAttachment] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [uploadNote, setUploadNote] = useState("");
  const [durationSec, setDurationSec] = useState(180);
  const [selected, setSelected] = useState<string[]>(DEFAULT_KEYS);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const fileRef = useRef<HTMLInputElement>(null);

  const loadPersonas = useCallback(async () => {
    try {
      const p = await fetch("/api/debate/personas").then((r) => r.json());
      setPersonas(p.personas ?? []);
    } catch { setErr("페르소나를 불러오지 못했습니다."); }
  }, []);

  const loadSessions = useCallback(async () => {
    try {
      const s = await fetch("/api/debate").then((r) => r.json());
      setSessions(s.sessions ?? []);
    } catch { /* 목록 실패는 치명적이지 않음 */ }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { void loadPersonas(); void loadSessions(); }, [loadPersonas, loadSessions]);

  function toggle(key: string) {
    setSelected((prev) => (prev.includes(key) ? prev.filter((k) => k !== key) : [...prev, key]));
  }

  async function uploadFile(file: File) {
    setUploading(true); setErr(""); setUploadNote("");
    try {
      const form = new FormData();
      form.append("file", file);
      const res = await fetch("/api/debate/upload", { method: "POST", body: form });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) { setErr(d.error ?? "파일을 읽지 못했습니다."); return; }
      setBrief(d.text ?? "");
      setAttachment(d.filename ?? file.name);
      if (d.note) setUploadNote(d.note);
      if (!title.trim()) setTitle(file.name.replace(/\.[^.]+$/, ""));
    } catch { setErr("파일 업로드 실패"); }
    finally { setUploading(false); if (fileRef.current) fileRef.current.value = ""; }
  }

  async function start() {
    setErr("");
    if (!title.trim()) { setErr("토론 주제를 입력해 주세요."); return; }
    if (selected.length < 2) { setErr("참가자를 2명 이상 선택해 주세요."); return; }
    setBusy(true);
    try {
      const res = await fetch("/api/debate", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: title.trim(), brief: brief.trim(), attachmentName: attachment, durationSec, participantKeys: selected }),
      });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) { setErr(d.error ?? "토론 생성 실패"); return; }
      const id = d.session.id as string;
      await fetch(`/api/debate/${id}/start`, { method: "POST" });
      router.push(`/debate/${id}`);
    } catch { setErr("토론 생성 실패"); }
    finally { setBusy(false); }
  }

  const conclusion = personas.find((p) => p.kind === "conclusion");

  return (
    <div className="mx-auto w-full max-w-6xl px-4 py-8 pb-24">
      <header className="mb-6">
        <h1 className="font-serif text-4xl font-semibold tracking-tight text-ink">토론방</h1>
        <p className="mt-1 text-sm text-ink-soft">
          기획안을 올리면 서로 다른 페르소나 에이전트들이 실시간으로 토론합니다. 사람은 관전만 하면 됩니다 —
          시간이 끝나면 최종 결론 에이전트가 합의·쟁점·미해결·실행 계획을 정리한 보고서를 씁니다.
        </p>
      </header>

      {/* 생성 */}
      <section className="doppel rise-in">
        <div className="doppel-inner card-core bg-surface p-6">
          <p className="font-mono text-xs uppercase tracking-[0.25em] text-ink-faint">New Debate</p>

          <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="토론 주제 (예: 300만원 이하 청구 AI 자동심사 확대)"
            className="mt-3 w-full rounded-lg border border-line-strong bg-surface px-3.5 py-2.5 text-sm text-ink outline-none transition-colors focus:border-accent" />

          {/* 기획안 파일 업로드 */}
          <div
            onDragOver={(e) => e.preventDefault()}
            onDrop={(e) => { e.preventDefault(); const f = e.dataTransfer.files?.[0]; if (f) void uploadFile(f); }}
            className="mt-2 flex flex-wrap items-center gap-3 rounded-lg border border-dashed border-line-strong bg-canvas px-3.5 py-3">
            <input ref={fileRef} type="file" accept=".txt,.md,.markdown,.csv,.json,.html,.htm,.docx" className="hidden"
              onChange={(e) => { const f = e.target.files?.[0]; if (f) void uploadFile(f); }} />
            <button onClick={() => fileRef.current?.click()} disabled={uploading}
              className="rounded-md border border-line-strong bg-surface px-3 py-2 text-xs font-semibold text-ink-soft transition-colors hover:bg-accent-soft hover:text-accent disabled:opacity-50">
              {uploading ? "읽는 중…" : "📎 기획안 파일 올리기"}
            </button>
            <span className="font-mono text-[11px] text-ink-faint">txt · md · csv · json · docx (드래그해서 놓아도 됩니다)</span>
            {attachment && (
              <span className="flex items-center gap-1.5 rounded-full bg-accent-soft px-2.5 py-1 text-[11px] font-medium text-accent">
                {attachment}
                <button onClick={() => { setAttachment(null); setBrief(""); setUploadNote(""); }} className="text-accent/70 hover:text-accent">✕</button>
              </span>
            )}
          </div>
          {uploadNote && <p className="mt-1 text-[11px] text-pale-amber-text">{uploadNote}</p>}

          <textarea value={brief} onChange={(e) => setBrief(e.target.value)} rows={6}
            placeholder="기획안/배경을 붙여넣으세요. 파일을 올리면 이곳에 본문이 채워집니다."
            className="mt-2 w-full resize-y rounded-lg border border-line-strong bg-surface px-3.5 py-2.5 text-sm leading-relaxed text-ink outline-none transition-colors focus:border-accent" />

          <div className="mt-5">
            <p className="mb-2 font-mono text-[11px] uppercase tracking-[0.15em] text-ink-faint">참가자 ({selected.length})</p>
            <PersonaManager personas={personas} selected={selected} onToggle={toggle} onChanged={loadPersonas} />
            {conclusion && (
              <p className="mt-2 text-[11px] text-ink-faint">{conclusion.emoji} {conclusion.name}는 토론이 끝난 뒤 보고서를 작성합니다(자동 포함).</p>
            )}
          </div>

          <div className="mt-5 flex flex-wrap items-center gap-3">
            <span className="font-mono text-[11px] uppercase tracking-[0.15em] text-ink-faint">토론 시간</span>
            <div className="flex gap-1.5 rounded-lg border border-line bg-canvas p-1.5">
              {DURATIONS.map((d) => (
                <button key={d.sec} onClick={() => setDurationSec(d.sec)}
                  className={`rounded-md px-3 py-1.5 text-xs font-semibold transition-colors ${
                    durationSec === d.sec ? "bg-ink text-white" : "text-ink-soft hover:bg-accent-soft hover:text-accent"
                  }`}>
                  {d.label}
                </button>
              ))}
            </div>
            <button onClick={start} disabled={busy}
              className="lift ml-auto rounded-md bg-ink px-5 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-[#33312E] disabled:opacity-50">
              {busy ? "준비 중…" : "토론 시작"}
            </button>
          </div>
          {err && <p role="alert" className="mt-3 rounded-md bg-pale-red px-3 py-2 text-xs text-pale-red-text">{err}</p>}
        </div>
      </section>

      {/* 지난 토론 */}
      <section className="mt-8">
        <h2 className="mb-3 border-b border-line pb-2 font-serif text-lg font-semibold text-ink">지난 토론</h2>
        {loading ? (
          <p className="py-8 text-center text-sm text-ink-faint">불러오는 중…</p>
        ) : sessions.length === 0 ? (
          <p className="py-8 text-center text-sm text-ink-faint">아직 토론이 없습니다. 위에서 첫 토론을 시작해 보세요.</p>
        ) : (
          <div className="space-y-2">
            {sessions.map((s) => {
              const st = STATUS_UI[s.status] ?? STATUS_UI.draft;
              return (
                <div key={s.id} className="group flex w-full flex-wrap items-center gap-3 rounded-xl border border-line bg-surface p-3.5 transition-colors hover:border-accent hover:bg-accent/5">
                  <button onClick={() => router.push(`/debate/${s.id}`)} className="flex min-w-0 flex-1 flex-wrap items-center gap-3 text-left">
                  <span className={`rounded-full px-2.5 py-0.5 font-mono text-[10px] font-bold ${st.cls}`}>{st.label}</span>
                  <span className="min-w-0 flex-1 truncate text-sm font-semibold text-ink group-hover:text-accent">{s.title}</span>
                  {s.attachmentName && <span className="font-mono text-[10px] text-ink-faint">📎 {s.attachmentName}</span>}
                  <span className="flex items-center gap-0.5">
                    {s.participants.slice(0, 6).map((p) => (<span key={p.key} title={p.name} className="text-sm">{p.emoji}</span>))}
                  </span>
                  <span className="font-mono text-[11px] text-ink-faint">
                    {s.turnCount}발언 · {Math.round(s.durationSec / 60)}분{s.verdict ? ` · ${s.verdict}` : ""}
                  </span>
                  </button>
                  {s.hasReport && (
                    <button onClick={() => router.push(`/debate/${s.id}?tab=report`)}
                      className="rounded-full bg-accent-soft px-2.5 py-1 font-mono text-[10px] font-semibold text-accent transition-colors hover:bg-accent hover:text-white">
                      보고서 보기
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </section>
    </div>
  );
}
