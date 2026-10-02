"use client";
import { useState } from "react";

export type PersonaOption = {
  key: string; name: string; emoji: string; role: string; stance: string; expertise: string;
  goal: string; redLine: string; tone: string; color: string; kind: string; builtin: boolean; overridden?: boolean; note?: string;
};

type Draft = {
  key?: string; name: string; emoji: string; role: string; stance: string; expertise: string;
  goal: string; redLine: string; tone: string; color: string; note: string;
};

const EMPTY: Draft = { name: "", emoji: "🙂", role: "", stance: "", expertise: "", goal: "", redLine: "", tone: "", color: "#1F6C9F", note: "" };

function toDraft(p: PersonaOption): Draft {
  return {
    key: p.key, name: p.name, emoji: p.emoji, role: p.role, stance: p.stance, expertise: p.expertise,
    goal: p.goal, redLine: p.redLine, tone: p.tone, color: p.color, note: p.note ?? "",
  };
}

const FIELDS: { k: keyof Draft; label: string; hint: string; long?: boolean }[] = [
  { k: "name", label: "이름", hint: "예: 원가 지킴이" },
  { k: "role", label: "직함·소속", hint: "예: 재무팀 담당" },
  { k: "stance", label: "기본 입장", hint: "이 사람이 토론에서 기본적으로 취하는 관점", long: true },
  { k: "expertise", label: "근거로 삼는 영역", hint: "수치·규정·사례 등 어떤 근거를 들고 오는가", long: true },
  { k: "goal", label: "토론에서 얻으려는 것", hint: "이 사람이 관철하려는 목적", long: true },
  { k: "redLine", label: "양보할 수 없는 선", hint: "절대 수용하지 않는 조건", long: true },
  { k: "tone", label: "말투", hint: "예: 냉소적 검증자, 숫자 중심" },
];

// 토론방 참가자 선택 + 페르소나 편집/추가
export default function PersonaManager({
  personas, selected, onToggle, onChanged,
}: {
  personas: PersonaOption[];
  selected: string[];
  onToggle: (key: string) => void;
  onChanged: () => Promise<void> | void;
}) {
  const [editing, setEditing] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [draft, setDraft] = useState<Draft>(EMPTY);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [openManager, setOpenManager] = useState(false);

  const candidates = personas.filter((p) => p.kind !== "conclusion");

  function startEdit(p: PersonaOption) {
    setCreating(false); setErr(""); setEditing(p.key); setDraft(toDraft(p));
  }
  function startCreate() {
    setEditing(null); setErr(""); setCreating(true); setDraft(EMPTY);
  }
  function cancel() { setEditing(null); setCreating(false); setErr(""); }

  async function save() {
    setErr("");
    if (!draft.name.trim()) { setErr("이름을 입력해 주세요."); return; }
    setBusy(true);
    try {
      const res = await fetch("/api/debate/personas", {
        method: creating ? "POST" : "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(draft),
      });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) { setErr(d.error ?? "저장 실패"); return; }
      await onChanged();
      if (creating) onToggle(d.persona.key);
      cancel();
    } catch { setErr("저장 실패"); }
    finally { setBusy(false); }
  }

  async function reset(key: string, builtin: boolean) {
    setErr(""); setBusy(true);
    try {
      const res = await fetch(`/api/debate/personas?key=${encodeURIComponent(key)}`, { method: "DELETE" });
      if (!res.ok) { setErr("되돌리기 실패"); return; }
      await onChanged();
      cancel();
    } finally { setBusy(false); }
  }

  const badge = (p: PersonaOption) => {
    const items: { text: string; cls: string }[] = [];
    if (!p.builtin) items.push({ text: "커스텀", cls: "bg-accent-soft text-accent" });
    else if (p.overridden) items.push({ text: "수정됨", cls: "bg-pale-amber text-pale-amber-text" });
    else items.push({ text: "기본", cls: "bg-canvas text-ink-faint" });
    if (p.kind === "observer") items.push({ text: "옵저버", cls: "bg-canvas text-ink-faint" });
    return items;
  };

  const form = (
    <div className="mt-3 rounded-xl border border-line bg-canvas p-3">
      <div className="grid gap-2 sm:grid-cols-2">
        {FIELDS.map((f) => (
          <label key={f.k} className={f.long ? "sm:col-span-2" : ""}>
            <span className="font-mono text-[10px] uppercase tracking-[0.12em] text-ink-faint">{f.label}</span>
            {f.long ? (
              <textarea value={String(draft[f.k] ?? "")} onChange={(e) => setDraft({ ...draft, [f.k]: e.target.value })}
                rows={2} placeholder={f.hint}
                className="mt-1 w-full resize-y rounded-md border border-line-strong bg-surface px-3 py-2 text-xs leading-relaxed text-ink outline-none focus:border-accent" />
            ) : (
              <input value={String(draft[f.k] ?? "")} onChange={(e) => setDraft({ ...draft, [f.k]: e.target.value })} placeholder={f.hint}
                className="mt-1 w-full rounded-md border border-line-strong bg-surface px-3 py-2 text-xs text-ink outline-none focus:border-accent" />
            )}
          </label>
        ))}
        <label className="sm:col-span-2">
          <span className="font-mono text-[10px] uppercase tracking-[0.12em] text-ink-faint">추가 지침 (선택)</span>
          <textarea value={draft.note} onChange={(e) => setDraft({ ...draft, note: e.target.value })} rows={2}
            placeholder="예: 항상 손해율 수치를 먼저 말한다 / 감정적 표현 금지"
            className="mt-1 w-full resize-y rounded-md border border-line-strong bg-surface px-3 py-2 text-xs leading-relaxed text-ink outline-none focus:border-accent" />
        </label>
        <div className="flex items-center gap-2">
          <input value={draft.emoji} onChange={(e) => setDraft({ ...draft, emoji: e.target.value })} maxLength={2}
            className="w-14 rounded-md border border-line-strong bg-surface px-3 py-2 text-center text-sm text-ink outline-none focus:border-accent" />
          <input type="color" value={draft.color} onChange={(e) => setDraft({ ...draft, color: e.target.value })}
            className="h-9 w-12 cursor-pointer rounded-md border border-line-strong bg-surface" />
          <span className="font-mono text-[11px] text-ink-faint">{draft.color}</span>
        </div>
      </div>
      {err && <p className="mt-2 text-xs text-pale-red-text">{err}</p>}
      <div className="mt-3 flex flex-wrap gap-2">
        <button onClick={save} disabled={busy}
          className="lift rounded-md bg-ink px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-[#33312E] disabled:opacity-50">
          {busy ? "저장 중…" : creating ? "페르소나 추가" : "수정 저장"}
        </button>
        {!creating && draft.key && (
          <button onClick={() => reset(draft.key!, personas.find((p) => p.key === draft.key)?.builtin ?? false)} disabled={busy}
            className="rounded-md border border-line-strong bg-surface px-3 py-2 text-sm text-ink-soft transition-colors hover:bg-pale-red hover:text-pale-red-text disabled:opacity-50">
            {personas.find((p) => p.key === draft.key)?.builtin ? "기본값으로 되돌리기" : "삭제"}
          </button>
        )}
        <button onClick={cancel} className="rounded-md px-3 py-2 text-sm text-ink-faint hover:text-ink">취소</button>
      </div>
    </div>
  );

  return (
    <div>
      {/* 참가자 선택 */}
      <div className="flex flex-wrap gap-2">
        {candidates.map((p) => {
          const on = selected.includes(p.key);
          return (
            <button key={p.key} onClick={() => onToggle(p.key)} title={`${p.stance}\n근거: ${p.expertise}`}
              className={`flex items-center gap-2 rounded-full border px-3 py-1.5 text-xs font-medium transition-colors ${
                on ? "border-ink bg-ink text-white" : "border-line-strong bg-surface text-ink-soft hover:bg-canvas hover:text-ink"
              }`}>
              <span className="text-sm">{p.emoji}</span>
              {p.name}
              {!p.builtin && <span className={`rounded-full px-1.5 py-0.5 font-mono text-[10px] ${on ? "bg-white/20" : "bg-accent-soft text-accent"}`}>커스텀</span>}
              {p.kind === "observer" && <span className={`rounded-full px-1.5 py-0.5 font-mono text-[10px] ${on ? "bg-white/20" : "bg-canvas text-ink-faint"}`}>옵저버</span>}
            </button>
          );
        })}
      </div>

      <div className="mt-2 flex flex-wrap items-center gap-2">
        <button onClick={() => setOpenManager((v) => !v)}
          className="rounded-md border border-line-strong bg-surface px-2.5 py-1.5 text-xs font-medium text-ink-soft transition-colors hover:bg-accent-soft hover:text-accent">
          {openManager ? "페르소나 관리 닫기" : "⚙ 페르소나 관리 · 편집"}
        </button>
        <span className="font-mono text-[11px] text-ink-faint">선택 {selected.length}명 · 페르소나 {candidates.length}명</span>
      </div>

      {openManager && (
        <div className="mt-3 space-y-2 rounded-xl border border-line bg-surface p-3">
          <div className="flex items-center justify-between">
            <p className="text-xs font-semibold text-ink">페르소나 목록 — 역할·입장·전문영역·목표·양보선을 수정할 수 있습니다</p>
            <button onClick={startCreate} className="rounded-md border border-line-strong bg-surface px-2.5 py-1.5 text-xs font-semibold text-ink-soft transition-colors hover:bg-accent-soft hover:text-accent">
              + 새 페르소나
            </button>
          </div>

          {candidates.map((p) => (
            <div key={p.key} className="rounded-lg border border-line bg-canvas px-3 py-2">
              <div className="flex flex-wrap items-center gap-2">
                <span className="flex h-7 w-7 items-center justify-center rounded-md text-base" style={{ background: p.color + "22" }}>{p.emoji}</span>
                <span className="text-sm font-semibold text-ink">{p.name}</span>
                {badge(p).map((b, i) => (
                  <span key={i} className={`rounded-full px-1.5 py-0.5 font-mono text-[10px] ${b.cls}`}>{b.text}</span>
                ))}
                <span className="truncate text-[11px] text-ink-faint">{p.role}</span>
                <button onClick={() => startEdit(p)}
                  className="ml-auto rounded-md border border-line-strong bg-surface px-2 py-1 text-[11px] font-medium text-ink-soft transition-colors hover:bg-accent-soft hover:text-accent">
                  편집
                </button>
              </div>
              <p className="mt-1 line-clamp-2 text-[11px] leading-relaxed text-ink-soft">
                <b className="text-ink-faint">입장</b> {p.stance || "—"} · <b className="text-ink-faint">근거</b> {p.expertise || "—"}
              </p>
              {editing === p.key && form}
            </div>
          ))}
          {creating && form}
        </div>
      )}
    </div>
  );
}
