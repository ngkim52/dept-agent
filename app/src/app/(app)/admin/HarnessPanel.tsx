"use client";
import { useCallback, useEffect, useState } from "react";
import SkillAutoCreate from "@/components/SkillAutoCreate";

type Kind = "prompt" | "skill" | "memory";
type Item = {
  id: string; personaKey: string; active: boolean; origin: string; confidence: number;
  orderIdx?: number; hitCount?: number; updatedAt?: string;
  kind?: string; title?: string; content: string;
  name?: string; description?: string; tags?: string | null;
  sourceType?: string | null; sourceId?: string | null;
  source?: "base" | "learned";
};

const TYPE_LABEL: Record<Kind, string> = { prompt: "프롬프트 지식", skill: "스킬", memory: "메모리" };
const KIND_LABEL: Record<string, string> = {
  addendum: "보강", rule: "행동규칙", role: "역할", correction: "오류정정",
  fact: "사실", preference: "선호", decision: "결정", lesson: "교훈", precedent: "선례",
};

const empty: Item = { id: "", personaKey: "claims-planning", active: true, origin: "manual", confidence: 1, content: "" };

export default function HarnessPanel() {
  const [type, setType] = useState<Kind>("prompt");
  const [personaKey, setPersonaKey] = useState("claims-planning");
  const [items, setItems] = useState<Item[]>([]);
  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [draft, setDraft] = useState<Item>({ ...empty });
  const [editing, setEditing] = useState<string | null>(null);
  const [versions, setVersions] = useState<Record<string, any[]>>({});
  const [draftVersion, setDraftVersion] = useState(0);

  const flash = (ok: boolean, text: string) => { setMsg({ ok, text }); setTimeout(() => setMsg(null), 3000); };
  const authHeaders = { "Content-Type": "application/json" };

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const d = await (await fetch(`/api/admin/harness?type=${type}&personaKey=${personaKey}`)).json();
      setItems(d.items ?? []);
    } catch { setItems([]); }
    setLoading(false);
  }, [type, personaKey]);

  useEffect(() => { load(); }, [load]);

  async function create() {
    if (!draft.content.trim()) return;
    const body: any = { personaKey: draft.personaKey, content: draft.content, origin: "manual", confidence: 1 };
    const res = await fetch(`/api/admin/harness?type=${type}`, { method: "POST", headers: authHeaders,
      body: JSON.stringify(type === "skill"
        ? { ...body, name: (draft.title || draft.name || "새 스킬"), description: draft.description ?? "" }
        : type === "memory"
        ? { ...body, kind: draft.kind || "fact" }
        : { ...body, kind: draft.kind || "addendum", title: draft.title || "제목 없음", orderIdx: draft.orderIdx ?? 0 }) });
    const d = await res.json();
    if (!res.ok) { flash(false, d.error ?? "저장 실패"); return; }
    flash(true, "생성 완료 — 해당 부서 페르소나에 즉시 반영됩니다");
    setDraft({ ...empty, personaKey });
    load();
  }

  async function save(id: string, patch: any) {
    const res = await fetch(`/api/admin/harness/${id}?type=${type}`, { method: "PATCH", headers: authHeaders, body: JSON.stringify(patch) });
    const d = await res.json();
    if (!res.ok) { flash(false, d.error ?? "수정 실패"); return; }
    flash(true, "수정 완료");
    setEditing(null);
    load();
  }

  async function toggle(item: Item, active: boolean) {
    await fetch(`/api/admin/harness/${item.id}?type=${type}&active=${active}`, { method: "DELETE", headers: authHeaders });
    load();
  }

  async function remove(item: Item) {
    const name = type === "skill" ? item.name : item.title ?? "";
    if (!window.confirm(`「${name || "이 항목"}」을 영구 삭제할까요? (변경 이력에는 삭제로 남습니다)`)) return;
    setEditing(null);
    const res = await fetch(`/api/admin/harness/${item.id}?type=${type}&hard=1`, { method: "DELETE", headers: authHeaders });
    const d = await res.json();
    if (!res.ok) { flash(false, d.error ?? "삭제 실패"); return; }
    flash(true, "영구 삭제 완료");
    load();
  }

  async function showVersions(item: Item) {
    if (versions[item.id]) { setVersions(v => { const n = { ...v }; delete n[item.id]; return n; }); return; }
    const d = await (await fetch(`/api/admin/harness/${item.id}?type=${type}`)).json();
    setVersions(v => ({ ...v, [item.id]: d.versions ?? [] }));
  }

  async function restore(item: Item, versionId: string) {
    const d = await (await fetch(`/api/admin/harness/${versionId}/restore`, { method: "POST", headers: authHeaders })).json();
    if (d.error) { flash(false, d.error); return; }
    flash(true, "복원 완료");
    load();
  }

  const renderContent = (item: Item) => {
    if (editing === item.id) {
      const meta = type === "skill"
        ? (<div className="grid gap-2 sm:grid-cols-2">
            <input value={item.name ?? ""} onChange={e => setItem(item, { name: e.target.value })}
              className="rounded-md border border-line-strong bg-surface px-2.5 py-1.5 text-xs" placeholder="스킬 이름" />
            <input value={item.description ?? ""} onChange={e => setItem(item, { description: e.target.value })}
              className="rounded-md border border-line-strong bg-surface px-2.5 py-1.5 text-xs" placeholder="설명" />
          </div>)
        : type === "memory"
        ? <input value={item.kind ?? ""} onChange={e => setItem(item, { kind: e.target.value })}
            className="mb-2 rounded-md border border-line-strong bg-surface px-2.5 py-1.5 text-xs" placeholder="종류 (fact/preference/decision/lesson/precedent)" />
        : <div className="grid gap-2 sm:grid-cols-[1fr_auto]">
            <input value={item.title ?? ""} onChange={e => setItem(item, { title: e.target.value })}
              className="rounded-md border border-line-strong bg-surface px-2.5 py-1.5 text-xs" placeholder="제목" />
            <input value={item.kind ?? ""} onChange={e => setItem(item, { kind: e.target.value })}
              className="rounded-md border border-line-strong bg-surface px-2.5 py-1.5 text-xs" placeholder="kind" />
          </div>;
      return (
        <div>
          {meta}
          <textarea value={item.content}
            onChange={e => setItem(item, { content: e.target.value })}
            className="mt-2 min-h-24 w-full rounded-md border border-line-strong bg-surface px-3 py-2 font-mono text-xs leading-relaxed text-ink" />
          <div className="mt-2 flex gap-2">
            <button onClick={() => save(item.id, type === "skill"
              ? { name: item.name, description: item.description, content: item.content }
              : { title: item.title, kind: item.kind, content: item.content })}
              className="rounded-md bg-ink px-3 py-1.5 text-xs font-semibold text-white">저장</button>
            <button onClick={() => setEditing(null)} className="rounded-md border border-line-strong bg-surface px-3 py-1.5 text-xs text-ink-soft">취소</button>
          </div>
        </div>
      );
    }
    const meta = type === "skill"
      ? `${item.name ?? "스킬"}${item.description ? " · " + item.description : ""}`
      : `${item.title ?? ""}${item.kind ? " · " + (KIND_LABEL[item.kind] ?? item.kind) : ""}`;
    return (
      <div>
        <p className="text-xs font-semibold text-ink">{meta}</p>
        <pre className="mt-1 whitespace-pre-wrap font-mono text-[11px] leading-relaxed text-ink-soft">{item.content}</pre>
        <div className="mt-1 flex flex-wrap items-center gap-2 font-mono text-[10px] text-ink-faint">
          <span>신뢰도 {Math.round((item.confidence ?? 1) * 100)}%</span>
          <span>{item.origin}</span>
          {typeof item.hitCount === "number" && <span>사용 {item.hitCount}회</span>}
        </div>
      </div>
    );
  };

  function setItem(item: Item, patch: Partial<Item>) {
    if (editing !== item.id) return;
    setItems(l => l.map(i => i.id === item.id ? { ...i, ...patch } : i));
  }

  return (
    <div className="rounded-2xl border border-line bg-surface p-4 sm:p-6">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-line pb-4">
        <div>
          <h3 className="font-serif text-lg font-semibold tracking-tight text-ink">스킬 편집</h3>
          <p className="mt-0.5 text-xs text-ink-soft">부서 페르소나에 주입되는 프롬프트·스킬·메모리를 보고 직접 편집합니다. (Skill = 행동원칙·사고방식, DB 지식 = 업무 내용)</p>
        </div>
        <button onClick={load} className="lift rounded-md border border-line-strong bg-surface px-3 py-2 text-sm font-medium text-ink hover:bg-accent-soft hover:text-accent">
          새로고침
        </button>
      </div>

      {/* 타입 + 부서 선택 */}
      <div className="mt-4 flex flex-wrap items-center gap-2">
        {(Object.keys(TYPE_LABEL) as Kind[]).map(k => (
          <button key={k} onClick={() => { setType(k); setEditing(null); }}
            className={`rounded-md border px-3 py-1.5 text-xs font-semibold transition-colors ${type === k ? "border-ink bg-ink text-white" : "border-line-strong bg-surface text-ink-soft hover:bg-canvas hover:text-ink"}`}>
            {TYPE_LABEL[k]}
          </button>
        ))}
        <span className="mx-1 h-4 w-px bg-line" />
        {["claims-planning", "actuarial"].map(k => (
          <button key={k} onClick={() => { setPersonaKey(k); setEditing(null); setDraftVersion(v => v + 1); }}
            className={`rounded-md border px-3 py-1.5 text-xs font-semibold transition-colors ${personaKey === k ? "border-ink bg-ink text-white" : "border-line-strong bg-surface text-ink-soft hover:bg-canvas hover:text-ink"}`}>
            {k === "claims-planning" ? "보험금심사기획" : "계리"}
          </button>
        ))}
      </div>

      {msg && <p className={`mt-4 rounded-md px-3 py-2 text-xs ${msg.ok ? "bg-pale-green text-pale-green-text" : "bg-pale-red text-pale-red-text"}`}>{msg.text}</p>}

      {/* 자동 스킬 생성 (스킬 탭) */}
      {type === "skill" && (
        <div className="mt-4">
          <SkillAutoCreate key={draftVersion} personaKey={personaKey} onSaved={load} flash={flash} />
        </div>
      )}

      {/* 생성 폼 */}
      <div className="mt-4 rounded-xl border border-line bg-surface p-4">
        <p className="text-xs font-semibold text-ink">수동 {TYPE_LABEL[type]} 추가</p>
        <div className="mt-2 grid gap-2 sm:grid-cols-2">
          {type === "prompt" && <input value={draft.title ?? ""} onChange={e => setDraft(d => ({ ...d, title: e.target.value }))} placeholder="제목" className="rounded-md border border-line-strong bg-surface px-2.5 py-1.5 text-xs" />}
          {type === "skill" && <input value={draft.name ?? ""} onChange={e => setDraft(d => ({ ...d, name: e.target.value }))} placeholder="스킬 이름" className="rounded-md border border-line-strong bg-surface px-2.5 py-1.5 text-xs" />}
          <select value={draft.kind ?? ""} onChange={e => setDraft(d => ({ ...d, kind: e.target.value }))} className="rounded-md border border-line-strong bg-surface px-2.5 py-1.5 text-xs text-ink">
            <option value="">종류 선택</option>
            {(type === "memory"
              ? ["fact", "preference", "decision", "lesson", "precedent"]
              : ["addendum", "rule", "role", "correction"]).map(k => <option key={k} value={k}>{KIND_LABEL[k] ?? k}</option>)}
          </select>
        </div>
        <textarea value={draft.content} onChange={e => setDraft(d => ({ ...d, content: e.target.value }))}
          placeholder="내용을 입력하세요" className="mt-2 min-h-20 w-full rounded-md border border-line-strong bg-surface px-3 py-2 font-mono text-xs leading-relaxed text-ink" />
        <button onClick={create} className="lift mt-2 rounded-md bg-ink px-4 py-2 text-xs font-semibold text-white hover:bg-[#33312E]">추가</button>
      </div>

      {/* 목록 */}
      <div className="mt-4 space-y-3">
        {loading ? <div className="px-5 py-8 text-center text-sm text-ink-faint">불러오는 중…</div>
          : items.length === 0 ? <div className="rounded-xl border border-dashed border-line px-5 py-10 text-center text-sm text-ink-faint">아직 저장된 지식이 없습니다.</div>
          : items.map(item => (
            <div key={item.id} className={`rounded-xl border bg-surface p-4 ${item.active ? "border-line" : "border-line opacity-60"} ${item.source === "base" ? "border-dashed" : ""}`}>
              {item.source === "base" && (
                <span className="mb-2 inline-flex items-center rounded-full bg-accent-soft px-2 py-0.5 text-[10px] font-bold text-accent">기본 (코드 정의)</span>
              )}
              {renderContent(item)}
              {item.source === "base" ? (
                <p className="mt-2 text-[11px] text-ink-faint">기본 지식은 시스템에 내장된 값이며 읽기 전용입니다. 이 항목을 개선하려면 검토 큐에서 승인한 학습 후보로 갱신됩니다.</p>
              ) : (
              <div className="mt-2 flex flex-wrap items-center gap-2">
                {editing !== item.id && <button onClick={() => setEditing(item.id)} className="rounded-md border border-line-strong bg-surface px-2.5 py-1 text-xs text-ink">편집</button>}
                <button onClick={() => toggle(item, !item.active)} className="rounded-md border border-line-strong bg-surface px-2.5 py-1 text-xs text-ink-soft">{item.active ? "비활성" : "재활성"}</button>
                <button onClick={() => showVersions(item)} className="rounded-md border border-line-strong bg-surface px-2.5 py-1 text-xs text-ink-soft">이력</button>
                <button onClick={() => remove(item)} className="rounded-md border border-line-strong bg-surface px-2.5 py-1 text-xs text-pale-red-text hover:bg-pale-red">삭제</button>
                {versions[item.id] && (
                  <div className="w-full rounded-md bg-canvas p-3">
                    <p className="font-mono text-[10px] uppercase text-ink-faint">변경 이력</p>
                    <ul className="mt-1 space-y-1">
                      {versions[item.id].map((v: any) => (
                        <li key={v.id} className="flex flex-wrap items-center gap-2 font-mono text-[11px] text-ink-soft">
                          <span className="rounded-full bg-surface px-1.5 py-0.5 text-[10px]">{v.action}</span>
                          <span className="text-ink-faint">{v.changedBy ? new Date(v.createdAt).toLocaleString() : "자동"}</span>
                          <button onClick={() => restore(item, v.id)} className="ml-auto text-accent hover:underline">복원</button>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
              )}
            </div>
          ))}
      </div>
    </div>
  );
}
