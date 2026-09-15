"use client";
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import MarkdownViewer from "@/components/MarkdownViewer";

type Meeting = { id: string; title: string; rawText: string; minutesJson: string; knowledgeApplied: boolean; createdAt: string; sourceName?: string };

const TEMPLATE = `# 회의 제목을 여기에 작성하세요

- 날짜: 이번 주 심사기획 회의
- 참석: 김부장, 이과장, 박대리

## 논의 내용
- 손해율 개선 방안 검토
- 자동심사 대상 확대 필요성 논의

## 결정 사항
- 300만 원 이하 실손 자동심사 대상 확대 확정

## 후속 조치
- 대상 목록 정리 | 담당: 이과장 | 마감: 9월 말

## 리스크
- 역선택 증가 우려
`;

const RAW_TEMPLATE = `9월 심사기획 회의
참석: 김부장, 이과장, 박대리, 홍대리

손해율 개선 얘기하다가, 자동심사 대상을 좀 넓히면 어떨까 하는 의견이 나왔어.
300만원 이하 실손 청구는 자동심사로 넘기자고 확정함.
이과장이 대상 목록 정리해서 9월 말까지 제출.
홍대리는 역선택 늘어날까봐 우려하고 있음 — 다음 달 추이 다시 보기로.`;

// MD에서 # 제목 추출
function titleFromMd(md: string): string {
  const m = md.match(/^#\s+(.+)/m);
  return m ? m[1].trim() : "";
}

export default function Meetings() {
  const router = useRouter();
  const [list, setList] = useState<Meeting[]>([]);
  const [err, setErr] = useState("");
  const [ok, setOk] = useState("");
  const [title, setTitle] = useState("");
  const [raw, setRaw] = useState(RAW_TEMPLATE);      // 회의 원문 (LLM 정리 입력)
  const [md, setMd] = useState(TEMPLATE);            // 회의록 MD (최종)
  const [view, setView] = useState<"edit" | "preview">("preview");
  const [busy, setBusy] = useState(false);
  const [applyRag, setApplyRag] = useState(true);    // 저장 시 RAGFlow 회의록 적재 여부
  const rawFileRef = useRef<HTMLInputElement | null>(null);
  const mdFileRef = useRef<HTMLInputElement | null>(null);
  const initialized = useRef(false);

  async function refresh() {
    try {
      const r = await fetch("/api/meetings");
      if (r.status === 401) { router.replace("/login"); return; }
      const d = await r.json();
      setList(d.meetings ?? []);
    } catch { /* ignore */ }
  }
  useEffect(() => {
    if (initialized.current) return;
    initialized.current = true;
    refresh();
  }, [router]);

  function readFile(f: File, into: "raw" | "md") {
    const reader = new FileReader();
    reader.onload = () => {
      const text = String(reader.result ?? "");
      if (into === "raw") { setRaw(text); setOk(`${f.name} 원문으로 불러옴 — [LLM 회의록 생성]을 눌러 정리하세요.`); }
      else { setMd(text); setOk(`${f.name} 회의록(MD)으로 불러옴`); if (!title.trim()) setTitle(f.name.replace(/\.(md|markdown)$/i, "")); }
      setErr("");
    };
    reader.readAsText(f);
  }

  // Step 1: 원문 → LLM 회의록 정리
  async function refine() {
    if (!raw.trim()) { setErr("회의 원문이 비어 있습니다. 붙여넣거나 파일을 올려주세요."); return; }
    setBusy(true); setErr(""); setOk("");
    try {
      const r = await fetch("/api/meetings/refine", { method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ rawText: raw, title: title.trim() || undefined }) });
      const d = await r.json();
      if (d.error) { setErr(d.error); return; }
      setMd(d.md); if (d.title && !title.trim()) setTitle(d.title);
      setView("preview");
      setOk(d.fallback ? "LLM 정리를 사용할 수 없어 규칙 기반 초안으로 만들었습니다 (편집 후 저장 가능)." : "LLM이 회의 원문을 회의록 양식(MD)으로 정리했습니다.");
    } catch { setErr("회의록 정리 실패"); }
    finally { setBusy(false); }
  }

  async function save(apply: boolean) {
    if (!md.trim()) { setErr("회의록(MD) 내용이 비어 있습니다."); return; }
    setBusy(true); setErr(""); setOk("");
    try {
      const t = title.trim() || titleFromMd(md) || `회의록 ${new Date().toLocaleDateString("ko-KR")}`;
      const r = await fetch("/api/meetings/md", { method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ md, title: t }) });
      const d = await r.json();
      if (!d.meeting?.id) { setErr(d.error ?? "저장 실패"); return; }
      const id = d.meeting.id as string;
      if (apply) {
        const kr = await fetch(`/api/meetings/${id}/knowledge`, { method: "POST" });
        const kd = await kr.json();
        if (kd.error) setErr("저장됨, RAGFlow 적재 실패: " + kd.error);
        else setOk("회의록을 저장하고 RAGFlow <회의록> 데이터셋에 적재했습니다.");
      } else {
        setOk("회의록을 저장했습니다.");
      }
      setMd(TEMPLATE); setTitle(""); setRaw(RAW_TEMPLATE); await refresh();
    } catch { setErr("저장 실패"); }
    finally { setBusy(false); }
  }

  async function applyToRag(id: string) {
    setBusy(true); setErr(""); setOk("");
    try { const r = await fetch(`/api/meetings/${id}/knowledge`, { method: "POST" }); const d = await r.json(); if (d.error) setErr(d.error); else setOk("RAGFlow <회의록> 데이터셋에 적재했습니다."); await refresh(); }
    catch { setErr("적재 실패"); } finally { setBusy(false); }
  }

  return (
    <div className="mx-auto max-w-5xl px-6 py-8">
      <header className="mb-6">
        <p className="eyebrow">Meetings · 회의록 적재</p>
        <h1 className="font-serif text-4xl font-semibold tracking-tight text-ink">회의록 적재</h1>
        <p className="mt-1 text-sm text-ink-soft">회의록 <b>파일을 올리거나 내용을 붙여넣으면</b> LLM이 회의록 양식(Markdown)으로 다듬어 미리보기로 보여준 뒤, <b>RAGFlow 회의록 데이터셋</b>에 적재합니다. 나중에 어떤 논의·결정이 있었는지 대화·검색에서 활용됩니다. (녹음 방식은 제거됨)</p>
      </header>
      {err && <p className="mb-3 rounded-lg border border-line bg-canvas px-4 py-3 text-sm text-ink-soft">{err}</p>}
      {ok && <p className="mb-3 rounded-lg bg-pale-green px-4 py-3 text-sm text-pale-green-text">{ok}</p>}

      {/* 01 · 원문 입력 */}
      <div className="rounded-xl border border-line bg-surface p-5">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="font-mono text-xs text-ink-faint">01 · 회의 원문 (파일 업로드 또는 붙여넣기)</p>
          <div className="flex gap-2">
            <button onClick={() => { setRaw(RAW_TEMPLATE); setErr(""); }} className="rounded-lg border border-line bg-canvas px-3 py-1.5 font-mono text-xs text-ink hover:border-accent">예시 채우기</button>
            <button onClick={() => rawFileRef.current?.click()} className="rounded-lg border border-line bg-canvas px-3 py-1.5 font-mono text-xs text-ink hover:border-accent">회의록 파일 올리기</button>
            <input ref={rawFileRef} type="file" accept=".txt,.md,.markdown,.text,text/plain,text/markdown,text/rtf"
              className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) readFile(f, "raw"); e.target.value = ""; }} />
          </div>
        </div>
        <textarea value={raw} onChange={(e) => setRaw(e.target.value)} rows={7} spellCheck={false}
          className="mt-3 w-full resize-y rounded-lg border border-line bg-canvas p-4 font-mono text-[13px] leading-relaxed text-ink outline-none focus:border-accent"
          placeholder="회의 녹취·필기·원문을 여기에 붙여넣거나 파일로 올리세요.&#10;&#10;예) 9월 심사기획 회의 / 참석: 김부장, 이과장 / 손해율 개선 얘기… / 300만원 이하 자동심사 확대 확정…" />
        <div className="mt-3 flex items-center gap-3">
          <button onClick={refine} disabled={busy} className="btn-primary">
            <span>{busy ? "LLM 정리 중…" : "LLM 회의록 생성"}</span><span className="arrow-chip">→</span>
          </button>
        </div>
      </div>

      {/* 02 · 회의록 MD + 미리보기 */}
      <div className="mt-5 rounded-xl border border-line bg-surface p-5">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="font-mono text-xs text-ink-faint">02 · 회의록 (Markdown) — LLM이 정리한 결과. 편집/미리보기</p>
          <div className="flex gap-2">
            <button onClick={() => setMd(TEMPLATE)} className="rounded-lg border border-line bg-canvas px-3 py-1.5 font-mono text-xs text-ink hover:border-accent">템플릿</button>
            <button onClick={() => mdFileRef.current?.click()} className="rounded-lg border border-line bg-canvas px-3 py-1.5 font-mono text-xs text-ink hover:border-accent">.md 불러오기</button>
            <input ref={mdFileRef} type="file" accept=".md,.markdown,text/markdown" className="hidden"
              onChange={(e) => { const f = e.target.files?.[0]; if (f) readFile(f, "md"); e.target.value = ""; }} />
            <div className="flex overflow-hidden rounded-lg border border-line">
              <button onClick={() => setView("edit")} className={`px-3 py-1.5 font-mono text-xs ${view === "edit" ? "bg-ink text-white" : "bg-canvas text-ink-soft hover:text-ink"}`}>편집</button>
              <button onClick={() => setView("preview")} className={`px-3 py-1.5 font-mono text-xs ${view === "preview" ? "bg-ink text-white" : "bg-canvas text-ink-soft hover:text-ink"}`}>미리보기</button>
            </div>
          </div>
        </div>

        <input value={title} onChange={(e) => setTitle(e.target.value)}
          placeholder="회의 제목 (예: 2월 손해율 점검 회의) — 비우면 MD의 # 제목 사용"
          className="input mt-3 w-full" />

        {view === "edit" ? (
          <textarea value={md} onChange={(e) => setMd(e.target.value)} rows={26} spellCheck={false}
            className="mt-3 w-full resize-y rounded-lg border border-line bg-canvas p-4 font-mono text-[13px] leading-relaxed text-ink outline-none focus:border-accent"
            placeholder="# 회의 제목\n\n- 날짜: ...\n- 참석: ...\n\n## 논의 내용\n- ...\n\n## 결정 사항\n- ...\n\n## 후속 조치\n- ... | 담당: ... | 마감: ...\n\n## 리스크\n- ..." />
        ) : (
          <div className="mt-3 max-h-[34rem] overflow-y-auto rounded-lg border border-line bg-canvas p-5">
            <MarkdownViewer content={md} />
          </div>
        )}

        <div className="mt-4 flex flex-wrap items-center gap-3">
          <label className="flex cursor-pointer items-center gap-2 text-sm text-ink-soft">
            <input type="checkbox" checked={applyRag} onChange={(e) => setApplyRag(e.target.checked)} />
            저장 시 RAGFlow <b>회의록</b> 데이터셋에 적재
          </label>
          <button onClick={() => save(applyRag)} disabled={busy} className="btn-primary">
            <span>{busy ? "처리 중…" : (applyRag ? "저장 + 회의록 적재" : "저장")}</span><span className="arrow-chip">{applyRag ? "→ RAGFlow" : "✓"}</span>
          </button>
        </div>
        <p className="mt-2 font-mono text-[11px] text-ink-faint">
          형식: <code># 제목</code> / <code>- 날짜:</code> / <code>- 참석:</code> / <code>## 논의 내용</code>(안건) / <code>## 결정 사항</code> / <code>## 후속 조치</code>(무엇 | 담당: | 마감:) / <code>## 리스크</code>
        </p>
      </div>

      {/* 목록 */}
      {list.length > 0 && (
        <div className="mt-8">
          <p className="eyebrow">저장된 회의록</p>
          <div className="mt-2 space-y-2">
            {list.map((mt) => (
              <div key={mt.id} className="flex items-center justify-between rounded-lg border border-line bg-surface px-4 py-3">
                <div>
                  <p className="text-sm font-medium text-ink">{mt.title || "(제목 없음)"} {mt.knowledgeApplied && <span className="ml-1 font-mono text-xs text-accent">✓ RAGFlow 적재됨</span>}</p>
                  <p className="mt-0.5 font-mono text-[11px] text-ink-faint">{new Date(mt.createdAt).toLocaleString("ko-KR")}{mt.sourceName ? " · " + mt.sourceName : ""}</p>
                </div>
                {!mt.knowledgeApplied && (
                  <button onClick={() => applyToRag(mt.id)} disabled={busy}
                    className="rounded-lg border border-line bg-canvas px-3 py-1.5 font-mono text-xs text-ink hover:border-accent">회의록 적재</button>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
