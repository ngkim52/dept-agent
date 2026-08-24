"use client";
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";

type User = { id: string; email: string; name: string; role: string; departmentId: string };
type Conv = { id: string; title: string; departmentId: string; createdAt: string };
type Citation = { source?: string; content?: string; similarity?: number };
type ChatMsg = { id: string; role: "user" | "assistant"; content: string; citations?: Citation[]; createdAt: string };

/* ---- 부서(페르소나) 표현 ---- */
const PERSONAS: Record<string, { name: string; mono: string }> = {
  "claims-planning": { name: "보험금심사기획 부서장", mono: "심" },
  actuarial: { name: "계리 부서장", mono: "계" },
};
const PERSONA_DEFAULT = { name: "부서장", mono: "부" };

function personaOf(departmentId?: string | null) {
  return PERSONAS[departmentId ?? ""] ?? PERSONA_DEFAULT;
}

/* ---- 아주 작은 마크다운 렌더러 (HTML 이스케이프 후 태그 삽입) ---- */
function esc(s: string) {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}
function inline(s: string) {
  return esc(s)
    .replace(/`([^`]+)`/g, '<code class="rounded bg-canvas px-1 py-0.5 font-mono text-[0.9em] text-accent">$1</code>')
    .replace(/\*\*([^*]+)\*\*/g, '<strong class="font-semibold">$1</strong>');
}
function Markdown({ text }: { text: string }) {
  const lines = text.split("\n");
  const out: React.ReactNode[] = [];
  let key = 0;
  let list: { type: "ul" | "ol"; items: string[] } | null = null;
  const flush = () => {
    if (list) {
      const Tag = list.type === "ul" ? "ul" : "ol";
      const cls = list.type === "ul" ? "mt-1.5 list-disc space-y-1 pl-5" : "mt-1.5 list-decimal space-y-1 pl-5";
      out.push(<Tag key={key++} className={cls}>{list.items.map((it, i) => (
        <li key={i} dangerouslySetInnerHTML={{ __html: inline(it) }} />
      ))}</Tag>);
      list = null;
    }
  };
  for (const raw of lines) {
    const t = raw.trim();
    if (!t) { flush(); continue; }
    const h = t.match(/^(#{1,6})\s+(.*)$/);
    if (h) {
      flush();
      const lvl = h[1].length;
      const cls = lvl === 1 ? "text-lg font-bold" : lvl === 2 ? "text-base font-bold" : "text-sm font-bold";
      out.push(<p key={key++} className={cls} dangerouslySetInnerHTML={{ __html: inline(h[2]) }} />);
      continue;
    }
    if (/^(-{3,}|\*{3,})\s*$/.test(t)) { flush(); out.push(<hr key={key++} className="my-3 border-line" />); continue; }
    const bullet = t.match(/^[-*]\s+(.*)$/);
    if (bullet) { (list ??= { type: "ul", items: [] }).items.push(bullet[1]); continue; }
    const num = t.match(/^(\d+)[.)、:]\s+(.*)$/);
    if (num) { (list ??= { type: "ol", items: [] }).items.push(num[2]); continue; }
    flush();
    out.push(<p key={key++} className="leading-relaxed" dangerouslySetInnerHTML={{ __html: inline(t) }} />);
  }
  flush();
  return <div className="space-y-2">{out}</div>;
}

function fmtTime(iso: string) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleTimeString("ko-KR", { hour: "2-digit", minute: "2-digit" });
}

/* ---- 아이콘 (인라인 SVG, 획 1.8) ---- */
const I = {
  plus: (
    <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"><path d="M12 5v14M5 12h14" /></svg>
  ),
  arrow: (
    <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12h14M13 6l6 6-6 6" /></svg>
  ),
  logout: (
    <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M15 4h4a1 1 0 0 1 1 1v14a1 1 0 0 1-1 1h-4M9 16l-4-4 4-4M5 12h11" /></svg>
  ),
  chat: (
    <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M8 10h8M8 14h5M12 3a9 9 0 0 1 9 9c0 4.42-3.58 8-8 8-1 0-2-.2-2.9-.6L4 20l1.3-3.5A8.9 8.9 0 0 1 3 12a9 9 0 0 1 9-9Z" /></svg>
  ),
  shield: (
    <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M12 3l7 3v6c0 4.4-3 7.6-7 9-4-1.4-7-4.6-7-9V6l7-3Z" /></svg>
  ),
  folder: (
    <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V7Z" /></svg>
  ),
};

export default function ChatPage() {
  const router = useRouter();
  const [user, setUser] = useState<User | null>(null);
  const [convs, setConvs] = useState<Conv[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [msgs, setMsgs] = useState<ChatMsg[]>([]);
  const [input, setInput] = useState("");
  const [streaming, setStreaming] = useState(false);
  const [error, setError] = useState("");
  const [streamText, setStreamText] = useState("");
  const [pendingCitations, setPendingCitations] = useState<Citation[]>([]);
  const [activeDepartmentId, setActiveDepartmentId] = useState<string>("claims-planning");
  const [activeConvDeptId, setActiveConvDeptId] = useState<string>("");
  const [showDeptPicker, setShowDeptPicker] = useState(false);
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    fetch("/api/auth/me").then(r => r.json()).then(d => {
      if (!d.user) { router.replace("/"); return; }
      setUser(d.user);
      setActiveDepartmentId(d.user.role === "admin" ? "claims-planning" : (d.user.departmentId ?? ""));
      if (d.user.role === "admin") setShowDeptPicker(true);
      loadConvs();
    });
  }, [router]);

  async function loadConvs() {
    const d = await (await fetch("/api/conversations")).json();
    setConvs(d.conversations ?? []);
  }

  async function newConversation() {
    const isAdmin = user?.role === "admin";
    if (isAdmin && !activeDepartmentId) { setShowDeptPicker(true); return; }
    const body = isAdmin ? { departmentId: activeDepartmentId } : {};
    const d = await (await fetch("/api/conversations", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) })).json();
    if (d.conversation) { setConvs(prev => [d.conversation, ...prev]); setActiveConvDeptId(d.conversation.departmentId ?? ""); await openConv(d.conversation.id); }
  }

  async function openConv(id: string) {
    setActiveId(id);
    if (!activeConvDeptId) {
      const cv = convs.find(c => c.id === id);
      if (cv?.departmentId) setActiveConvDeptId(cv.departmentId);
    }
    const d = (await (await fetch(`/api/conversations/${id}`)).json()) as { messages: Array<{ id: string; role: "user" | "assistant"; content: string; citations?: string; createdAt: string }> };
    setMsgs(d.messages.map(m => ({ id: m.id, role: m.role, content: m.content, citations: m.citations ? JSON.parse(m.citations) as Citation[] : [], createdAt: m.createdAt })));
    setStreamText(""); setPendingCitations([]);
  }

  useEffect(() => { endRef.current?.scrollIntoView({ behavior: "smooth" }); }, [msgs, streamText]);

  async function send(textOverride?: string) {
    const text = (textOverride ?? input).trim();
    if (!text || streaming || !activeId) return;
    setInput(""); setStreaming(true); setError(""); setStreamText(""); setPendingCitations([]);
    const userMsg: ChatMsg = { id: `u-${Date.now()}`, role: "user", content: text, createdAt: new Date().toISOString() };
    setMsgs(prev => [...prev, userMsg]);

    try {
      const res = await fetch("/api/chat/stream", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ conversationId: activeId, message: text }),
      });
      if (!res.ok || !res.body) {
        const d = await res.json().catch(() => ({}));
        throw new Error(d.error ?? "스트림 연결 실패");
      }
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      let finalText = "";
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const events = buffer.split("\n\n");
        buffer = events.pop() ?? "";
        for (const ev of events) {
          const [evLine, ...dataLines] = ev.split("\n");
          if (!evLine.startsWith("event:")) continue;
          const eventName = evLine.slice(6).trim();
          const data = JSON.parse(dataLines.filter(l => l.startsWith("data:")).map(l => l.slice(5).trim()).join("\n") || "{}");
          if (eventName === "text_delta") {
            finalText += data.delta ?? "";
            setStreamText(finalText);
          } else if (eventName === "citations") {
            setPendingCitations(data.chunks ?? []);
          } else if (eventName === "done") {
            finalText = data.content ?? finalText;
            setMsgs(prev => [...prev, { id: data.messageId, role: "assistant", content: finalText, citations: pendingCitations, createdAt: new Date().toISOString() }]);
            setStreamText(""); setPendingCitations([]);
            loadConvs();
          } else if (eventName === "error") {
            throw new Error(data.error ?? "에이전트 오류");
          }
        }
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "요청 실패");
      setStreamText("");
    } finally {
      setStreaming(false);
    }
  }

  async function logout() {
    await fetch("/api/auth/logout", { method: "POST" });
    router.replace("/");
  }

  const effectiveDeptId = activeConvDeptId || (user?.role === "admin" ? activeDepartmentId : user?.departmentId);
  const persona = personaOf(effectiveDeptId);

  const isActuarial = persona === personaOf("actuarial");
  const examples = isActuarial ? [
    "준비금 산출 가정(이율·해지율) 검증안을 검토해 주세요",
    "신상품 요율 산출 시 리스크를 짚어 주세요",
    "재무건전성(RBC) 분석 방안을 제안해 주세요",
  ] : [
    "보험금 심사 프로세스 개선안 초안을 검토해 주세요",
    "AI 자동 심사 도입 시 리스크를 짚어 주세요",
    "심사 지연 사유 분석 방안을 제안해 주세요",
  ];

  return (
    <div className="flex h-screen overflow-hidden bg-canvas">
      {/* ── 사이드바 ── */}
      <aside className="flex w-72 shrink-0 flex-col border-r border-line bg-surface">
        <div className="flex items-center justify-between border-b border-line px-5 py-4">
          <div>
            <p className="font-serif text-lg font-semibold leading-tight">부서장</p>
            <p className="text-xs text-ink-soft">페르소나 에이전트</p>
          </div>
          <button onClick={logout} title="로그아웃"
            className="flex h-8 w-8 items-center justify-center rounded-md text-ink-faint transition-colors hover:bg-canvas hover:text-ink">
            {I.logout}
          </button>
        </div>

        {/* 페르소나 칩 */}
        <div className="px-4 pt-4">
          <div className="flex items-center gap-2.5 rounded-lg border border-line bg-canvas px-3 py-2.5">
            <span className="flex h-7 w-7 items-center justify-center rounded-md bg-accent-soft font-serif text-sm font-semibold text-accent">
              {persona.mono}
            </span>
            <div className="min-w-0">
              <p className="truncate text-xs font-semibold text-ink">{persona.name}</p>
              <p className="flex items-center gap-1 text-[11px] text-ink-faint">
                <span className="inline-block h-1.5 w-1.5 rounded-full bg-pale-green-text" />
                {user?.name ?? ""}
              </p>
            </div>
          </div>
        </div>

        {user?.role === "admin" && (
          <div className="flex gap-1.5 rounded-lg border border-line bg-canvas p-1.5 mx-4 mt-4">
            {Object.entries(PERSONAS).map(([key, p]) => (
              <button key={key} onClick={() => { setActiveDepartmentId(key); setActiveConvDeptId(""); setShowDeptPicker(false); }}
                className={`flex flex-1 items-center justify-center gap-1.5 rounded-md py-1.5 text-xs font-semibold transition-colors ${
                  activeDepartmentId === key ? "bg-ink text-white" : "text-ink-soft hover:bg-accent-soft hover:text-accent"
                }`}>
                <span className={`flex h-5 w-5 items-center justify-center rounded font-serif text-[11px] ${activeDepartmentId === key ? "bg-white/20 text-white" : "bg-accent-soft text-accent"}`}>
                  {p.mono}
                </span>
                {p.name.replace(" 부서장", "")}
              </button>
            ))}
          </div>
        )}

        <button onClick={newConversation}
          className="lift mx-4 mt-3 flex items-center justify-center gap-2 rounded-md bg-ink py-2.5 text-sm font-semibold text-white transition-colors hover:bg-[#33312E]">
          {I.plus} 새 대화
        </button>
        <button onClick={() => router.push("/documents")}
          className="lift mx-4 mt-2 flex items-center justify-center gap-2 rounded-md border border-line-strong bg-surface py-2.5 text-sm font-medium text-ink transition-colors hover:bg-accent-soft hover:text-accent">
          {I.folder} 자료 관리
        </button>

        <div className="mt-3 flex-1 overflow-y-auto px-3 pb-4">
          {convs.map(c => (
            <button key={c.id} onClick={() => openConv(c.id)}
              className={`group relative mb-1 block w-full truncate rounded-lg py-2 pl-4 pr-3 text-left text-sm transition-colors ${
                c.id === activeId ? "bg-accent-soft font-medium text-accent" : "text-ink-soft hover:bg-canvas hover:text-ink"
              }`}>
              {c.id === activeId && <span className="absolute left-1 top-1/2 h-4 w-[3px] -translate-y-1/2 rounded-full bg-accent" />}
              {c.title || "새 대화"}
            </button>
          ))}
        </div>

        <div className="border-t border-line px-5 py-3">
          <p className="truncate text-xs font-medium text-ink">{user?.email ?? ""}</p>
          <p className="font-mono text-[11px] text-ink-faint">{user?.role === "admin" ? "관리자" : "구성원"}</p>
        </div>
      </aside>

      {/* ── 부서 선택 오버레이 (관리자 로그인 시) ── */}
      {showDeptPicker && user?.role === "admin" && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-canvas/80 p-6 backdrop-blur-sm">
          <div className="rise w-full max-w-md rounded-2xl border border-line bg-surface p-8 shadow-2xl">
            <p className="font-mono text-xs uppercase tracking-[0.25em] text-ink-faint">Admin · 부서 선택</p>
            <h2 className="mt-2 font-serif text-2xl font-semibold tracking-tight text-ink">
              어느 부서 에이전트를 사용할까요?
            </h2>
            <p className="mt-2 text-sm leading-relaxed text-ink-soft">
              관리자는 로그인 시 담당 부서를 선택할 수 있습니다. 선택한 부서의 부서장 에이전트가 답변합니다.
            </p>
            <div className="mt-6 space-y-3">
              {Object.entries(PERSONAS).map(([key, p]) => (
                <button key={key}
                  onClick={async () => {
                    setActiveDepartmentId(key);
                    setShowDeptPicker(false);
                    const isAdmin = true;
                    const d = await (await fetch("/api/conversations", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ departmentId: key }) })).json();
                    if (d.conversation) { setConvs(prev => [d.conversation, ...prev]); setActiveConvDeptId(d.conversation.departmentId ?? ""); await openConv(d.conversation.id); }
                  }}
                  className="lift flex w-full items-center gap-4 rounded-xl border border-line bg-canvas px-5 py-4 text-left transition-colors hover:border-accent hover:bg-accent-soft">
                  <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-accent-soft font-serif text-base font-semibold text-accent">{p.mono}</span>
                  <span>
                    <span className="block text-sm font-semibold text-ink">{p.name}</span>
                    <span className="block text-xs text-ink-soft">{key === "actuarial" ? "보험수리·준비금·요율·건전성" : "심사 절차·지급 기준·사기 리스크"}</span>
                  </span>
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* ── 본문 ── */}
      <main className="flex min-w-0 flex-1 flex-col">
        {/* 스레드 헤더 */}
        <header className="flex items-center gap-3 border-b border-line bg-surface/70 px-6 py-3 backdrop-blur">
          <span className="flex h-8 w-8 items-center justify-center rounded-md bg-accent-soft font-serif text-sm font-semibold text-accent">
            {persona.mono}
          </span>
          <div>
            <p className="text-sm font-semibold text-ink">{persona.name}</p>
            <p className="text-[11px] text-ink-faint">검증 → 조언 → 아이디어 순으로 답변합니다</p>
          </div>
          <span className="ml-auto flex items-center gap-1.5 rounded-md bg-pale-green px-2 py-1 font-mono text-[11px] text-pale-green-text">
            <span className="inline-block h-1.5 w-1.5 rounded-full bg-pale-green-text" /> 자료 근거 기반
          </span>
          <span className="flex items-center gap-1.5 rounded-md bg-accent-soft px-2 py-1 font-mono text-[11px] text-accent">
            <span className="inline-block h-1.5 w-1.5 rounded-full bg-accent" /> 업무 스킬 · 자동 압축
          </span>
        </header>

        {/* 메시지 영역 */}
        <div className="flex-1 overflow-y-auto px-4 py-6">
          <div className="mx-auto max-w-3xl space-y-6">
            {msgs.length === 0 && !streaming && (
              <div className="rise mx-auto max-w-xl pt-8">
                <span className="flex h-11 w-11 items-center justify-center rounded-lg border border-line bg-surface text-ink-faint">{I.chat}</span>
                <h2 className="mt-4 font-serif text-2xl font-semibold tracking-tight text-ink">
                  무슨 일을 검토받고 싶으신가요?
                </h2>
                <p className="mt-2 text-sm leading-relaxed text-ink-soft">
                  작성한 자료나 계획을 첨부 없이도 업무 질문만으로 부서장의 의견을 받을 수 있습니다.
                  내부 기준 자료가 필요하면 안내해 드립니다.
                </p>
                <div className="mt-6 space-y-2">
                  {examples.map((ex) => (
                    <button key={ex} onClick={() => send(ex)}
                      className="lift flex w-full items-center justify-between gap-3 rounded-lg border border-line bg-surface px-4 py-3 text-left text-sm text-ink-soft transition-colors hover:bg-accent-soft hover:text-accent">
                      {ex}
                      <span className="text-ink-faint">{I.arrow}</span>
                    </button>
                  ))}
                </div>
              </div>
            )}

            {msgs.map(m => (
              m.role === "user" ? (
                <div key={m.id} className="rise flex justify-end">
                  <div className="max-w-[75%] rounded-xl rounded-br-sm bg-ink px-4 py-2.5 text-sm leading-relaxed text-white">
                    {m.content}
                  </div>
                </div>
              ) : (
                <div key={m.id} className="rise flex items-start gap-3">
                  <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-accent-soft font-serif text-sm font-semibold text-accent">
                    {persona.mono}
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="mb-1 flex items-baseline gap-2 px-1">
                      <span className="text-xs font-semibold text-ink">{persona.name}</span>
                      <span className="font-mono text-[11px] text-ink-faint">{fmtTime(m.createdAt)}</span>
                    </div>
                    <div className="rounded-xl rounded-tl-sm border border-line border-l-[3px] border-l-accent bg-surface px-4 py-3 text-sm text-ink">
                      <Markdown text={m.content} />
                      {m.citations && m.citations.length > 0 && (
                        <div className="mt-3 border-t border-line pt-2.5">
                          <p className="font-mono text-[11px] uppercase tracking-[0.15em] text-ink-faint">참고 자료 · {m.citations.length}</p>
                          <ul className="mt-1.5 space-y-1">
                            {m.citations.map((c, i) => (
                              <li key={i} className="flex items-center gap-2 rounded-md bg-canvas px-2.5 py-1.5 text-xs text-ink-soft">
                                <span className="inline-block h-1.5 w-1.5 shrink-0 rounded-full bg-accent" />
                                <span className="truncate">{c.source || "출처 알 수 없음"}</span>
                                <span className="ml-auto shrink-0 font-mono text-[11px] text-ink-faint">{c.similarity ? `${Math.round(c.similarity * 100)}%` : ""}</span>
                              </li>
                            ))}
                          </ul>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              )
            ))}

            {streamText && (
              <div className="rise flex items-start gap-3">
                <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-accent-soft font-serif text-sm font-semibold text-accent">
                  {persona.mono}
                </span>
                <div className="min-w-0 flex-1">
                  <div className="mb-1 px-1 font-mono text-[11px] text-ink-faint">부서장 작성 중…</div>
                  <div className="rounded-xl rounded-tl-sm border border-line border-l-[3px] border-l-accent bg-surface px-4 py-3 text-sm text-ink">
                    <Markdown text={streamText} />
                    <span className="mt-0.5 inline-block h-4 w-[3px] translate-y-0.5 rounded-full bg-accent cursor-blink" />
                  </div>
                </div>
              </div>
            )}

            {error && (
              <p role="alert" className="mx-auto max-w-xl rounded-md bg-pale-red px-3 py-2 text-xs leading-relaxed text-pale-red-text">
                {error}
              </p>
            )}
            <div ref={endRef} className="h-1" />
          </div>
        </div>

        {/* ── 입력 ── */}
        <div className="border-t border-line bg-surface px-4 py-4">
          <div className="mx-auto flex max-w-3xl items-end gap-2 rounded-xl border border-line-strong bg-surface px-3 py-2 transition-colors focus-within:border-accent">
            <textarea
              value={input}
              onChange={e => setInput(e.target.value)}
              onKeyDown={e => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(); } }}
              placeholder="부서장에게 물어보세요… (Enter 전송)"
              rows={1}
              className="max-h-40 min-h-[2.25rem] flex-1 resize-none bg-transparent py-1.5 text-sm leading-relaxed text-ink outline-none placeholder:text-ink-faint"
            />
            <button onClick={() => send()} disabled={streaming || !input.trim()}
              title="보내기"
              className="lift flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-ink text-white transition-colors hover:bg-[#33312E] disabled:cursor-not-allowed disabled:opacity-35">
              {I.arrow}
            </button>
          </div>
          <p className="mx-auto mt-2 max-w-3xl font-mono text-[11px] text-ink-faint">
            답변은 자동 생성됩니다. 업무 판단 전에 내부 기준과 대조해 주세요.
          </p>
        </div>
      </main>
    </div>
  );
}
