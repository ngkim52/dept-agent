"use client";
import { useState } from "react";

type Related = { name: string; description: string; matched: boolean };
type Draft = { name: string; description: string; content: string; relatedSkills: Related[] };

export default function SkillAutoCreate({ personaKey, onSaved, flash }: {
  personaKey: string;
  onSaved: () => void;
  flash: (ok: boolean, text: string) => void;
}) {
  const [topic, setTopic] = useState("");
  const [useWeb, setUseWeb] = useState(true);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [draft, setDraft] = useState<Draft | null>(null);
  const [webUsed, setWebUsed] = useState(false);
  const [saving, setSaving] = useState(false);

  async function generate() {
    if (!topic.trim()) { setError("만들고 싶은 스킬의 목적을 먼저 입력해 주세요."); return; }
    setLoading(true); setError("");
    try {
      const res = await fetch(`/api/admin/skills/generate?personaKey=${encodeURIComponent(personaKey)}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ topic: topic.trim(), useWeb }),
      });
      const d = await res.json();
      if (!res.ok) { setError(d.error ?? "스킬 생성 실패"); return; }
      setDraft(d.draft);
      setWebUsed(d.draft?.webUsed === true);
    } catch { setError("스킬 생성 중 오류가 발생했습니다."); }
    finally { setLoading(false); }
  }

  async function save() {
    if (!draft) return;
    setSaving(true); setError("");
    try {
      const res = await fetch(`/api/admin/harness?type=skill`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ personaKey, name: draft.name, description: draft.description, content: draft.content, origin: "manual", confidence: 0.9 }),
      });
      const d = await res.json();
      if (!res.ok) { setError(d.error ?? "저장 실패"); return; }
      flash(true, "스킬을 저장했습니다 — 해당 부서 페르소나에 반영됩니다");
      setDraft(null); setTopic(""); setError(""); onSaved();
    } catch { setError("저장 중 오류가 발생했습니다."); }
    finally { setSaving(false); }
  }

  return (
    <div className="rounded-xl border border-accent/40 bg-canvas p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <p className="text-xs font-semibold text-ink">✨ 자동 스킬 생성</p>
          <p className="mt-0.5 text-[11px] text-ink-soft">만들고 싶은 스킬의 목적을 알려주면, 과거 대화·메모리·기존 스킬·문서를 참조하고(부족하면 웹검색 보강) 스킬 초안을 만들어 드립니다.</p>
        </div>
        <label className="flex items-center gap-1.5 text-[11px] text-ink-soft">
          <input type="checkbox" checked={useWeb} onChange={e => setUseWeb(e.target.checked)} className="h-3.5 w-3.5 accent-[#2b2b28]" />
          웹검색 보강 사용
        </label>
      </div>

      <div className="mt-3 flex flex-wrap gap-2">
        <input value={topic} onChange={e => setTopic(e.target.value)}
          onKeyDown={e => { if (e.key === "Enter") generate(); }}
          placeholder="예: '보험금 지급 심사 시기·지연 사유 자동 점검 스킬'"
          className="min-w-0 flex-1 rounded-md border border-line-strong bg-surface px-3 py-2 text-sm text-ink outline-none transition-colors focus:border-accent" />
        <button onClick={generate} disabled={loading}
          className="lift rounded-md bg-accent px-4 py-2 text-sm font-semibold text-white transition-colors hover:opacity-90 disabled:opacity-50">
          {loading ? "생성 중…" : "스킬 만들기"}
        </button>
      </div>

      {error && <p role="alert" className="mt-3 rounded-md bg-pale-red px-3 py-2 text-xs leading-relaxed text-pale-red-text">{error}</p>}

      {draft && (
        <div className="mt-4 rounded-lg border border-line bg-surface p-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-xs font-semibold text-ink">스킬 초안 {webUsed && <span className="ml-1 rounded-full bg-pale-amber px-1.5 py-0.5 text-[10px] text-pale-amber-text">웹검색 보강됨</span>}</p>
            <div className="flex gap-2">
              <button onClick={generate} disabled={loading} className="rounded-md border border-line-strong bg-surface px-2.5 py-1 text-xs text-ink-soft">다시 생성</button>
              <button onClick={save} disabled={saving} className="lift rounded-md bg-ink px-3 py-1 text-xs font-semibold text-white disabled:opacity-50">
                {saving ? "저장 중…" : "저장"}
              </button>
            </div>
          </div>
          <div className="mt-3 space-y-2">
            <label className="block">
              <span className="font-mono text-[10px] uppercase tracking-[0.12em] text-ink-faint">스킬 이름</span>
              <input value={draft.name} onChange={e => setDraft({ ...draft, name: e.target.value })}
                className="mt-1 w-full rounded-md border border-line-strong bg-surface px-2.5 py-1.5 text-sm text-ink" />
            </label>
            <label className="block">
              <span className="font-mono text-[10px] uppercase tracking-[0.12em] text-ink-faint">설명 / 라우팅 조건</span>
              <textarea value={draft.description} onChange={e => setDraft({ ...draft, description: e.target.value })}
                className="mt-1 w-full rounded-md border border-line-strong bg-surface px-3 py-2 text-xs text-ink" rows={2} />
            </label>
            <label className="block">
              <span className="font-mono text-[10px] uppercase tracking-[0.12em] text-ink-faint">스킬 본문 (SKILL.md)</span>
              <textarea value={draft.content} onChange={e => setDraft({ ...draft, content: e.target.value })}
                className="mt-1 min-h-48 w-full rounded-md border border-line-strong bg-surface px-3 py-2 font-mono text-xs leading-relaxed text-ink" />
            </label>
          </div>
          {draft.relatedSkills && draft.relatedSkills.length > 0 && (
            <div className="mt-3">
              <p className="font-mono text-[10px] uppercase tracking-[0.12em] text-ink-faint">관련 기존 스킬</p>
              <ul className="mt-1 flex flex-wrap gap-1.5">
                {draft.relatedSkills.map((r) => (
                  <li key={r.name} className="rounded-full bg-accent-soft px-2 py-0.5 text-[11px] text-accent">{r.name}</li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
