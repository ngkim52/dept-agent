"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";

type Doc = { id: string; filename: string; status: string; uploadedBy: string | null; ragflowDocId: string | null; createdAt: string; size?: number };

const STATUS_UI: Record<string, { label: string; cls: string; pulse?: boolean }> = {
  done: { label: "검색 가능", cls: "bg-pale-green text-pale-green-text" },
  parsing: { label: "파싱 중…", cls: "bg-pale-amber text-pale-amber-text", pulse: true },
  uploaded: { label: "대기", cls: "bg-pale-amber text-pale-amber-text", pulse: true },
  failed: { label: "실패", cls: "bg-pale-red text-pale-red-text" },
};

const ACCEPT = ".pdf,.doc,.docx,.ppt,.pptx,.xls,.xlsx,.txt,.md";
const MAX_SIZE_MB = 20;

function fmtDate(iso: string) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleString("ko-KR", { year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" });
}

export default function DocumentsPage() {
  const router = useRouter();
  const [docs, setDocs] = useState<Doc[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState("");
  const [dragOver, setDragOver] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const hasPending = useMemo(() => docs.some((d) => d.status === "uploaded" || d.status === "parsing"), [docs]);

  async function load() {
    try {
      const d = await (await fetch("/api/documents")).json();
      setDocs(d.documents ?? []);
      setError("");
    } catch {
      setError("문서 목록을 불러오지 못했습니다.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    fetch("/api/auth/me").then((r) => r.json()).then((d) => {
      if (!d.user) { router.replace("/"); return; }
      load();
    });
  }, [router]);

  // 파싱 진행 중이면 주기적으로 상태 재조회
  useEffect(() => {
    if (!hasPending) return;
    const t = setInterval(load, 4000);
    return () => clearInterval(t);
  }, [hasPending]);

  // 요구 4·8: 삭제 (사용자별 소유 문서만)
  async function deleteDoc(id: string) {
    if (!confirm("이 문서를 삭제할까요?")) return;
    setError("");
    const res = await fetch(`/api/documents/${id}`, { method: "DELETE" });
    if (!res.ok) { setError("삭제에 실패했습니다."); return; }
    await load();
  }

  async function uploadFile(file: File) {
    setError("");
    if (file.size > MAX_SIZE_MB * 1024 * 1024) { setError(`${MAX_SIZE_MB}MB 이하 파일만 업로드할 수 있습니다.`); return; }
    setUploading(true);
    const form = new FormData();
    form.append("file", file);
    try {
      const res = await fetch("/api/documents", { method: "POST", body: form });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) { setError(data.error ?? "업로드 실패"); return; }
      await load();
    } catch {
      setError("네트워크 오류로 업로드에 실패했습니다.");
    } finally {
      setUploading(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  }

  function onPick(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    if (f) void uploadFile(f);
  }

  function onDrop(e: React.DragEvent) {
    e.preventDefault();
    setDragOver(false);
    const f = e.dataTransfer.files?.[0];
    if (f) void uploadFile(f);
  }

  return (
    <main className="min-h-screen bg-canvas">
      <div className="mx-auto max-w-4xl px-6 py-12">
        {/* 헤더 */}
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="font-mono text-xs uppercase tracking-[0.25em] text-ink-faint">자료 · 문서</p>
            <h1 className="mt-2 font-serif text-3xl font-semibold tracking-tight text-ink">내 자료</h1>
            <p className="mt-1 text-sm text-ink-soft">업로드한 자료는 회원 본인에게만 보이며, 삭제할 수 있습니다.</p>
          </div>
          <div className="flex items-center gap-2">
            {hasPending && (
              <span className="flex items-center gap-1.5 rounded-md bg-pale-amber px-2.5 py-1.5 font-mono text-[11px] text-pale-amber-text">
                <span className="inline-block h-1.5 w-1.5 animate-pulse rounded-full bg-pale-amber-text" /> 파싱 진행 중
              </span>
            )}
            <button onClick={() => router.replace("/chat")}
              className="lift flex items-center gap-1.5 rounded-md border border-line-strong bg-surface px-3 py-2 text-sm font-medium text-ink transition-colors hover:bg-accent-soft hover:text-accent">
              채팅으로 가기
              <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12h14M13 6l6 6-6 6" /></svg>
            </button>
          </div>
        </div>

        {/* 업로드 영역 */}
        <div
          onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
          onDragLeave={() => setDragOver(false)}
          onDrop={onDrop}
          onClick={() => !uploading && inputRef.current?.click()}
          className={`rise mt-8 flex cursor-pointer flex-col items-center justify-center gap-2 rounded-xl border border-dashed px-6 py-10 text-center transition-colors ${dragOver ? "border-accent bg-accent-soft" : "border-line-strong bg-surface hover:bg-canvas"}`}>
          <input ref={inputRef} type="file" accept={ACCEPT} className="hidden" onChange={onPick} disabled={uploading} />
          {uploading ? (
            <>
              <span className="inline-block h-4 w-4 animate-spin rounded-full border-2 border-accent border-t-transparent" />
              <p className="text-sm font-medium text-ink">업로드 중…</p>
            </>
          ) : (
            <>
              <p className="text-sm font-medium text-ink">{dragOver ? "여기에 놓아 업로드" : "자료를 업로드하세요"}</p>
              <p className="font-mono text-[11px] text-ink-faint">클릭 또는 드래그 · PDF·Office·TXT·MD · {MAX_SIZE_MB}MB 이하</p>
            </>
          )}
        </div>

        {/* 목록 */}
        <div className="mt-6 overflow-hidden rounded-xl border border-line bg-surface">
          <div className="border-b border-line px-5 py-3">
            <p className="font-mono text-[11px] font-medium uppercase tracking-[0.15em] text-ink-faint">{docs.length}건</p>
          </div>
          {loading ? (
            <div className="px-5 py-10 text-center text-sm text-ink-faint">불러오는 중…</div>
          ) : docs.length === 0 ? (
            <div className="px-5 py-14 text-center text-sm text-ink-soft">
              아직 업로드한 자료가 없습니다.
            </div>
          ) : (
            <ul className="divide-y divide-line">
              {docs.map((d) => {
                const st = STATUS_UI[d.status] ?? STATUS_UI.uploaded;
                return (
                  <li key={d.id} className="flex items-center gap-3 px-5 py-3">
                    <span className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-md font-mono text-xs font-semibold ${d.status === "failed" ? "bg-pale-red text-pale-red-text" : "bg-accent-soft text-accent"}`}>
                      {d.status === "failed" ? "!" : "D"}
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium text-ink">{d.filename}</p>
                      <p className="font-mono text-[11px] text-ink-faint">
                        {d.uploadedBy ?? "—"} · {fmtDate(d.createdAt)}
                      </p>
                    </div>
                    <span className={`flex shrink-0 items-center gap-1.5 rounded-full px-2.5 py-1 font-mono text-[11px] ${st.cls}`}>
                      {st.pulse && <span className="inline-block h-1.5 w-1.5 animate-pulse rounded-full bg-current" />}
                      {st.label}
                    </span>
                    <button onClick={() => void deleteDoc(d.id)}
                      title="문서 삭제"
                      className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-ink-faint transition-colors hover:bg-pale-red hover:text-pale-red-text">
                      <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3" /></svg>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>

        {error && <p role="alert" className="mt-4 rounded-md bg-pale-red px-3 py-2 text-xs leading-relaxed text-pale-red-text">{error}</p>}
      </div>
    </main>
  );
}
