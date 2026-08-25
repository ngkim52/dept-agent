"use client";
import { Fragment, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";

type User = { id: string; email: string; name: string; role: string; departmentId: string };
type Conv = { id: string; title: string; departmentId: string; createdAt: string };
type Citation = { source?: string; content?: string; similarity?: number };
type ChatMsg = { id: string; role: "user" | "assistant"; content: string; citations?: Citation[]; createdAt: string };
export type Progress = { phase: "thinking" | "tool" | "tool_done" | "done"; detail?: string; toolName?: string; ok?: boolean; args?: unknown };

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
  const renderTable = (rows: string[][], align: boolean[]) => {
    out.push(
      <div key={key++} className="my-2 overflow-x-auto rounded-lg border border-line">
        <table className="w-full border-collapse text-xs">
          <tbody>
            {rows.map((row, ri) => (
              <tr key={ri} className={ri === 0 ? "bg-canvas" : "border-t border-line"}>
                {row.map((cell, ci) => (
                  <td key={ci} className="px-3 py-1.5 align-top text-ink" dangerouslySetInnerHTML={{ __html: inline(cell) }} />
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    );
  };
  for (let idx = 0; idx < lines.length; idx++) {
    const raw = lines[idx];
    const t = raw.trim();
    if (!t) { flush(); continue; }
    // 테이블: "|" 라인 + 다음 라인에 구분자(|---|) 가 있으면 하나의 표로 수집
    if (t.startsWith("|")) {
      const rows: string[][] = []; let align: boolean[] = []; let consumed = 0;
      const parseRow = (s: string) => {
        const cells = s.split("|").slice(1, -1).map(c => c.trim());
        align = cells.map(() => true);
        return cells;
      };
      const isSep = (s: string) => s.startsWith("|") && /^\|?[\s:\-|]+\|?$/.test(s) && s.includes("-");
      let r0 = parseRow(t);
      let sepIdx = idx + 1;
      if (sepIdx < lines.length && isSep(lines[sepIdx].trim())) {
        rows.push(r0); // header
        consumed = 1;
        let r = sepIdx + 1;
        while (r < lines.length && lines[r].trim().startsWith("|")) {
          rows.push(parseRow(lines[r].trim()));
          consumed++;
          r++;
        }
        idx += consumed + 1;
        flush();
        renderTable(rows, align);
        idx--; // for 루프가 다시 +1
        continue;
      }
    }
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
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [progress, setProgress] = useState<Progress[]>([]);
  const [progressOpen, setProgressOpen] = useState(true);
  const [expandedIdx, setExpandedIdx] = useState(-1);
  const [thinkingLevel, setThinkingLevel] = useState<"off" | "minimal" | "low" | "medium" | "high" | "xhigh" | "max">("high");
  const [slashOpen, setSlashOpen] = useState(false);
  const [slashIdx, setSlashIdx] = useState(0);
  const [slashItems, setSlashItems] = useState<{ name: string; description: string }[]>([]);
  const [mentionOpen, setMentionOpen] = useState(false); // "@" 파일 멘션 팔레트
  const [mentionIdx, setMentionIdx] = useState(0);
  const [mentionQuery, setMentionQuery] = useState("");
  const [myDocs, setMyDocs] = useState<{ id: string; filename: string; mimeType: string; size: number }[]>([]);
  const [fileIds, setFileIds] = useState<string[]>([]); // 전송 시 함께 보낼 지정 파일
  const [dragOver, setDragOver] = useState(false);
  const endRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    fetch("/api/auth/me").then(r => r.json()).then(d => {
      if (!d.user) { router.replace("/"); return; }
      setUser(d.user);
      setActiveDepartmentId(d.user.role === "admin" ? "claims-planning" : (d.user.departmentId ?? ""));
      loadConvs();
    });
    fetch("/api/skills").then(r => r.json()).then(d => {
      setSlashItems([...(d.skills ?? []), ...(d.features ?? [])]);
    }).catch(() => {});
    fetch("/api/documents").then(r => r.json()).then(d => {
      setMyDocs(d.documents ?? []);
    }).catch(() => {});
  }, [router]);

  // 요구 1: 사이드바 자동 숨김 (모바일 등 좁은 화면에서 기본 닫힘)
  useEffect(() => {
    const mq = window.matchMedia("(max-width: 900px)");
    setSidebarOpen(!mq.matches);
    const fn = (e: MediaQueryListEvent) => setSidebarOpen(!e.matches);
    mq.addEventListener("change", fn);
    return () => mq.removeEventListener("change", fn);
  }, []);

  async function loadConvs() {
    const d = await (await fetch("/api/conversations")).json();
    setConvs(d.conversations ?? []);
  }

  // 대화 생성 헬퍼 — 새 대화 버튼 / 첫 메시지 자동 생성에서 함께 사용
  async function makeConversation(): Promise<string | null> {
    const isAdmin = user?.role === "admin";
    if (isAdmin && !activeDepartmentId) return null;
    const body = isAdmin ? { departmentId: activeDepartmentId } : {};
    const d = await (await fetch("/api/conversations", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) })).json();
    if (!d.conversation) return null;
    setConvs(prev => [d.conversation, ...prev]);
    setActiveConvDeptId(d.conversation.departmentId ?? "");
    setActiveId(d.conversation.id);
    await openConv(d.conversation.id);
    return d.conversation.id as string;
  }

  async function newConversation() {
    if (streaming) return;
    await makeConversation();
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

  // 요구 2: 대화 삭제
  async function deleteConv(c: Conv) {
    if (!confirm(`"${c.title || "새 대화"}" 대화를 삭제할까요?`)) return;
    await fetch(`/api/conversations/${c.id}`, { method: "DELETE" });
    setConvs(prev => prev.filter(x => x.id !== c.id));
    if (activeId === c.id) { setActiveId(null); setMsgs([]); setStreamText(""); }
  }

  // 요구 8: 파일 업로드 (클릭/드래그) — 사용자별 자료 관리로 저장
  async function uploadFiles(files: FileList | null) {
    if (!files || files.length === 0) return;
    for (const file of Array.from(files)) {
      const fd = new FormData();
      fd.append("file", file);
      const res = await fetch("/api/documents", { method: "POST", body: fd });
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        setError(d.error ?? `"${file.name}" 업로드 실패`);
      }
    }
    if (fileRef.current) fileRef.current.value = "";
  }

  useEffect(() => { endRef.current?.scrollIntoView({ behavior: "smooth" }); }, [msgs, streamText]);

  async function send(textOverride?: string) {
    let text = (textOverride ?? input).trim();
    if (!text || streaming) return;
    // "/스킬명 옵션값" → 스킬명을 명령으로 인식하고 나머지를 실제 질문으로 사용
    const slashMatch = text.match(/^\/([\p{L}\p{N}_-]+)\s*([\s\S]*)$/u);
    if (slashMatch) {
      const cmd = slashMatch[1];
      const rest = slashMatch[2].trim();
      const isFeature = ["웹검색", "자료", "새대화", "생각"].includes(cmd);
      // features(기능 명령)는 스킬로 취급하지 않는다 → /생각 등이 쿼리로 오인되지 않게
      const isSkill = !isFeature && slashItems.some(s => s.name.replace(/^\//, "") === cmd);
      if (isSkill) {
        text = rest || `/${cmd} 절차를 검토해 주세요.`;
      } else if (cmd === "자료") { router.push("/documents"); return; }
      else if (cmd === "새대화") { await newConversation(); return; }
      else if (cmd === "생각") {
        // "/생각 <레벨>" → 추론 수준 변경(쿼리 전송 없음). 레벨 뒤에 질문이 붙으면 그 질문만 전송한다.
        const m2 = rest.match(/^(off|minimal|low|medium|high|xhigh|max)(?:\s+([\s\S]*))?$/i);
        if (m2) {
          setThinkingLevel(m2[1].toLowerCase() as typeof thinkingLevel);
          const q = (m2[2] ?? "").trim();
          if (q) {
            text = q; // 레벨 변경 + 질문 동시 전송
          } else {
            // 순수 설정 명령: 쿼리로 보내지 않고 안내만 표시한다.
            const announceId = `sys-${Date.now()}`;
            setMsgs(prev => [...prev, { id: announceId, role: "assistant", createdAt: new Date().toISOString(), content: `추론 수준을 ${m2[1].toLowerCase()}로 변경했습니다. 이제부터 이 수준으로 생각합니다.` }]);
            setInput(""); setStreaming(false); setError("");
            requestAnimationFrame(() => { inputRef.current?.focus(); resizeInput(); });
            return;
          }
        } else {
          text = rest ? `생각 수준을 ${rest}으로 설정해 주세요.` : "생각 수준을 안내해 주세요. (off/minimal/low/medium/high)";
        }
      }
      else if (cmd === "웹검색") { text = rest || "최신 웹 정보를 검색해 주세요."; }
      else if (isFeature) { /* 알려진 기능이면 그대로 전송 */ }
      // 그 외 미지의 "/..." 는 일반 질문으로 전송
    }
    if (!text) return;
    // 대화가 열려 있지 않으면(로그인 직후/부서 팝업 없이 진입) 자동으로 새 대화를 만든 뒤 전송한다.
    let convId = activeId;
    if (!convId) {
      const c = await makeConversation();
      if (!c) { setError("대화를 시작할 수 없습니다. 부서를 선택해 주세요."); return; }
      convId = c;
    }
    setInput(""); setStreaming(true); setError(""); setStreamText(""); setPendingCitations([]);
    setProgress([{ phase: "thinking", detail: "요청을 받았습니다" }]); setProgressOpen(true);
    const userMsg: ChatMsg = { id: `u-${Date.now()}`, role: "user", content: text, createdAt: new Date().toISOString() };
    setMsgs(prev => [...prev, userMsg]);

    try {
      const res = await fetch("/api/chat/stream", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ conversationId: convId, message: text, fileIds, thinkingLevel }),
      });
      // 전송 시 지정한 파일 참조는 일회성으로 사용 (컨텍스트 중복 방지)
      setFileIds([]);
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
          } else if (eventName === "progress") {
            // 진행 상황 (thinking/tool) — args까지 보존해 확장 시 상세 표시. 완료(done) 후에도 패널은 남긴다.
            const p: Progress = data.phase === "tool"
              ? { phase: "tool", toolName: data.toolName ?? "", args: data.args ?? undefined, detail: data.args ? undefined : `도구 실행: ${data.toolName}` }
              : data.phase === "tool_done" ? { phase: "tool_done", toolName: data.toolName ?? "", ok: data.ok ?? true }
              : data.phase === "done" ? { phase: "done" }
              : { phase: "thinking", detail: data.detail ?? "생각하는 중입니다" };
            
            setProgress(prev => {
              // thinking 은 최신 상태로 제자리 갱신(중복 방지), 도구/완료 항목은 append
              if (p.phase === "thinking") {
                const idx = prev.map(x => x.phase).lastIndexOf("thinking");
                if (idx >= 0) { const copy = [...prev]; copy[idx] = p; return copy; }
              }
              return [...prev, p];
            });
          } else if (eventName === "done") {
            finalText = data.content ?? finalText;
            setMsgs(prev => [...prev, { id: data.messageId, role: "assistant", content: finalText, citations: pendingCitations, createdAt: new Date().toISOString() }]);
            setStreamText(""); setPendingCitations([]);
            // 완료 표시는 남기되 패널을 강제로 닫지 않는다 (사용자가 확장/확인 가능)
            setProgress(prev => [...prev, { phase: "done" }]);
            loadConvs();
          } else if (eventName === "error") {
            throw new Error(data.error ?? "에이전트 오류");
          }
        }
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "요청 실패");
      setStreamText("");
      setProgress(prev => [...prev, { phase: "done" }]);
    } finally {
      setStreaming(false);
    }
  }

  // 요구 6: "/" 슬래시 커맨드 + 요구 7: 입력창 자동 확장 (최대 170px → 스크롤)
  function resizeInput() {
    const el = inputRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = Math.min(el.scrollHeight, 170) + "px";
  }
  // "@" 파일 멘션 선택: 커서/입력의 마지막 "@쿼리" 부분을 "@파일명 " 으로 치환 + fileIds 기록
  function chooseMention(doc: { id: string; filename: string }) {
    const cur = inputRef.current?.value ?? input;
    const at = cur.lastIndexOf("@");
    if (at >= 0) {
      // "@" 다음 공백/줄바꿈 전까지가 현재 쿼리 토큰 → 이를 파일명으로 교체
      const nextSpace = cur.slice(at + 1).search(/\s/);
      const prev = cur.slice(0, at);
      const tail = nextSpace >= 0 ? cur.slice(at + 1 + nextSpace) : "";
      setInput(`${prev}@${doc.filename} ${tail}`.replace(/\s+/g, " "));
    }
    setMentionOpen(false); setMentionIdx(0); setMentionQuery("");
    setFileIds(prev => prev.includes(doc.id) ? prev : [...prev, doc.id]);
    requestAnimationFrame(() => { inputRef.current?.focus(); resizeInput(); });
  }

  function applySlashItem(name: string) {
    setSlashOpen(false); setSlashIdx(0);
    if (name === "/자료") { router.push("/documents"); return; }
    if (name === "/새대화") { void newConversation(); return; }
    // "/생각" 은 옵션 값(off/minimal/low/medium/high)을 뒤에 붙이도록 안내 + "/생각 " 삽입
    if (name === "/생각") {
      const curLevel = thinkingLevel; // 현재 수준을 기본값으로 삽입
      setInput(`/생각 ${curLevel}`);
      setSlashOpen(false);
      requestAnimationFrame(() => {
        const el = inputRef.current;
        if (el) { el.focus(); el.setSelectionRange(`/생각 `.length, `/생각 ${curLevel}`.length); resizeInput(); }
      });
      return;
    }
    // 스킬/명령이 "/스킬명 " 형태로 입력창에 삽입된다 → 사용자가 뒤에 옵션 값을 이어 입력
    // name이 이미 "/"로 시작하면(features) 그대로, 스킬 이름이면 "/"를 붙인다
    const cur = inputRef.current?.value ?? input;
    const rest = cur.replace(/^\/[\p{L}\p{N}_-]*\s*/u, ""); // 기존 "/..." 잔여 제거
    const cmd = name.startsWith("/") ? name : `/${name}`;
    setInput(`${cmd} ${rest}`);
    requestAnimationFrame(() => { inputRef.current?.focus(); resizeInput(); });
  }
  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    const mentionList = myDocs.filter(d => d.filename.toLowerCase().includes(mentionQuery.toLowerCase()));
    if (mentionOpen && mentionList.length > 0) {
      if (e.key === "ArrowDown") { e.preventDefault(); setMentionIdx(i => (i + 1) % mentionList.length); return; }
      if (e.key === "ArrowUp") { e.preventDefault(); setMentionIdx(i => (i - 1 + mentionList.length) % mentionList.length); return; }
      if (e.key === "Tab" || e.key === "Enter") {
        e.preventDefault();
        const sel = mentionList[mentionIdx] ?? mentionList[0];
        if (sel) chooseMention(sel);
        return;
      }
      if (e.key === "Escape") { setMentionOpen(false); setMentionIdx(0); return; }
    }
    if (slashOpen && slashItems.length > 0) {
      if (e.key === "ArrowDown") { e.preventDefault(); setSlashIdx(i => (i + 1) % slashItems.length); return; }
      if (e.key === "ArrowUp") { e.preventDefault(); setSlashIdx(i => (i - 1 + slashItems.length) % slashItems.length); return; }
      if (e.key === "Tab") {
        e.preventDefault();
        const item = slashItems[slashIdx] ?? slashItems[0];
        if (item) applySlashItem(item.name);
        return;
      }
      if (e.key === "Enter" && slashItems.length === 1) {
        e.preventDefault();
        applySlashItem(slashItems[0].name);
        return;
      }
      if (e.key === "Enter" && slashItems.length > 1) {
        // 후보가 여러 개면 Enter로 선택, 그 외에는 일반 전송
        e.preventDefault();
        const item = slashItems[slashIdx] ?? slashItems[0];
        applySlashItem(item.name);
        return;
      }
      if (e.key === "Escape") { setSlashOpen(false); setSlashIdx(0); return; }
    }
    if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); setSlashOpen(false); send(); return; }
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
    <div
      className="relative flex h-screen overflow-hidden bg-canvas"
      onDragOver={e => { if (e.dataTransfer.types.includes("Files")) { e.preventDefault(); setDragOver(true); } }}
      onDragLeave={() => setDragOver(false)}
      onDrop={e => { if (e.dataTransfer.types.includes("Files")) { e.preventDefault(); setDragOver(false); void uploadFiles(e.dataTransfer.files); } }}
    >
      {/* 드래그오버 가이드 (요구 8) */}
      {dragOver && (
        <div className="pointer-events-none fixed inset-0 z-50 flex items-center justify-center bg-canvas/80 backdrop-blur-sm">
          <div className="round rounded-2xl border-2 border-dashed border-accent bg-surface px-10 py-8 text-center">
            <p className="font-serif text-lg font-semibold text-ink">내 자료로 업로드</p>
            <p className="mt-1 text-xs text-ink-soft">개인 자료 목록에 저장됩니다 · 최대 20MB</p>
          </div>
        </div>
      )}

      {!sidebarOpen && (
        <button
          onClick={() => setSidebarOpen(true)}
          title="사이드바 열기"
          className="absolute left-3 top-3 z-40 flex h-9 w-9 items-center justify-center rounded-lg border border-line bg-surface text-ink-soft shadow-sm transition-colors hover:text-ink"
        >
          <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"><path d="M4 5h16v14H4zM9 5v14" /></svg>
        </button>
      )}

      {/* ── 사이드바 ── */}
      {sidebarOpen && (
      <aside className="flex w-72 shrink-0 flex-col border-r border-line bg-surface">
        <div className="border-b border-line px-5 py-4">
          <div className="flex items-center justify-between gap-2">
            <img src="/shinhan-life-logo.png" alt="신한라이프" className="h-6 w-auto object-contain" />
            <button onClick={() => setSidebarOpen(false)} title="사이드바 접기"
              className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md text-ink-faint transition-colors hover:bg-canvas hover:text-ink">
              <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M4 5h16v14H4zM9 5v14" /></svg>
            </button>
          </div>
          <div className="mt-3 flex items-center justify-between">
            <div>
              <p className="font-serif text-lg font-semibold leading-tight">부서장</p>
              <p className="text-xs text-ink-soft">페르소나 에이전트</p>
            </div>
            <button onClick={logout} title="로그아웃"
              className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md text-ink-faint transition-colors hover:bg-canvas hover:text-ink">
              {I.logout}
            </button>
          </div>
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
              <button key={key} onClick={() => { setActiveDepartmentId(key); setActiveConvDeptId(""); setSlashOpen(false); }}
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
            <div key={c.id} onClick={() => openConv(c.id)}
              className={`group mb-1 flex cursor-pointer items-center rounded-lg transition-colors ${
                c.id === activeId ? "bg-accent-soft" : "hover:bg-canvas"
              }`}>
              <span className={`flex-1 truncate py-2 pl-4 pr-2 text-sm ${c.id === activeId ? "font-medium text-accent" : "text-ink-soft group-hover:text-ink"}`}>
                {c.title || "새 대화"}
              </span>
              <button onClick={(e) => { e.stopPropagation(); void deleteConv(c); }}
                title="대화 삭제"
                className="mr-1.5 flex h-6 w-6 shrink-0 items-center justify-center rounded text-ink-faint opacity-0 transition-opacity hover:bg-pale-red hover:text-pale-red-text group-hover:opacity-100">
                <svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3" /></svg>
              </button>
            </div>
          ))}
        </div>

        <div className="border-t border-line px-5 py-3">
          <p className="truncate text-xs font-medium text-ink">{user?.email ?? ""}</p>
          <p className="font-mono text-[11px] text-ink-faint">{user?.role === "admin" ? "관리자" : "구성원"}</p>
        </div>
      </aside>
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
          <span className="flex items-center gap-1.5 rounded-md bg-canvas px-2 py-1 font-mono text-[11px] text-ink-soft">
            <span className="inline-block h-1.5 w-1.5 rounded-full bg-accent" /> 생각 · {thinkingLevel}
          </span>
        </header>

        {/* 메시지 영역 */}
        <div className="flex-1 overflow-y-auto px-4 py-6">
          <div className="mx-auto max-w-7xl space-y-6">
            {msgs.length === 0 && !streaming && (
              <div className="rise mx-auto max-w-2xl pt-8">
                <span className="flex h-11 w-11 items-center justify-center rounded-lg border border-line bg-surface text-ink-faint">{I.chat}</span>
                <h2 className="mt-4 font-serif text-2xl font-semibold tracking-tight text-ink">
                  무슨 일을 검토받고 싶으신가요?
                </h2>
                <p className="mt-2 text-sm leading-relaxed text-ink-soft">
                  작성한 자료나 계획을 첨부 없이도 업무 질문만으로 부서장의 의견을 받을 수 있습니다.
                  내부 기준 자료가 필요하면 안내해 드립니다.
                </p>
                <div className="mt-6 grid gap-2 sm:grid-cols-2">
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

            {msgs.map((m, i) => (
              <Fragment key={m.id}>
                {i === msgs.length - 1 && progress.length > 0 && (
                    <div className="rise mx-auto max-w-2xl overflow-hidden rounded-xl border border-line bg-surface">
                <button onClick={() => setProgressOpen(o => !o)}
                  className="flex w-full items-center gap-2 px-4 py-2 text-left text-xs font-medium text-ink-soft transition-colors hover:bg-canvas">
                  <span className={`text-ink-faint transition-transform ${progressOpen ? "" : "-rotate-90"}`}>
                    <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M6 9l6 6 6-6" /></svg>
                  </span>
                  <span className="flex h-2 w-2 items-center justify-center">
                    <span className="h-2 w-2 animate-pulse rounded-full bg-accent" />
                  </span>
                  부서장 진행 상황
                  <span className="font-mono text-[10px] text-ink-faint">· {progress.filter(p => p.phase === "tool").length}개 도구</span>
                </button>
                {progressOpen && (
                  <div className="space-y-1.5 border-t border-line px-4 py-3">
                    {progress.map((p, i) => {
                      const label = p.phase === "thinking" ? ((p.detail ?? "생각하는 중입니다").slice(0, 60) + ((p.detail?.length ?? 0) > 60 ? "…" : ""))
                        : p.phase === "tool" ? (p.detail ?? `도구 실행: ${p.toolName}`)
                        : p.phase === "tool_done" ? `도구 완료: ${p.toolName}${p.ok === false ? " (실패)" : ""}`
                        : "응답 완료";
                      const hasDetail = p.phase === "thinking" ? (p.detail != null && p.detail.length > 0)
                        : (p.args !== undefined && p.args !== null);
                      const isOpen = expandedIdx === i;
                      return (
                        <div key={i} className="flex flex-col gap-1">
                          <div className="flex items-center gap-2 text-xs">
                            {p.phase === "done" ? (
                              <span className="inline-block h-1.5 w-1.5 rounded-full bg-pale-green-text" />
                            ) : (
                              <span className="inline-block h-1.5 w-1.5 animate-pulse rounded-full bg-accent" />
                            )}
                            {hasDetail && (
                              <button
                                onClick={() => setExpandedIdx(isOpen ? -1 : i)}
                                className="flex h-4 w-4 items-center justify-center rounded text-ink-faint transition-colors hover:bg-canvas hover:text-ink"
                                title={isOpen ? "접기" : "상세 보기"}
                              >
                                <svg viewBox="0 0 24 24" width="11" height="11" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" className={`transition-transform ${isOpen ? "rotate-180" : ""}`}>
                                  <path d="M6 9l6 6 6-6" />
                                </svg>
                              </button>
                            )}
                            <span className="font-medium text-ink-soft">{label}</span>
                            {hasDetail && !isOpen && (
                              <button onClick={() => setExpandedIdx(i)} className="ml-auto rounded border border-line px-1.5 py-0.5 text-[10px] text-ink-faint transition-colors hover:bg-canvas hover:text-ink">
                                상세
                              </button>
                            )}
                          </div>
                          {hasDetail && isOpen && (
                            <pre className="overflow-x-auto whitespace-pre-wrap break-all rounded-lg border border-line bg-canvas px-3 py-2 font-mono text-[11px] leading-relaxed text-ink-soft">
                              {p.phase === "thinking" ? p.detail : (typeof p.args === "string" ? p.args : JSON.stringify(p.args, null, 2))}
                            </pre>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
                  )}
                  {m.role === "user" ? (
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
              )}
              </Fragment>
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

        {/* ── 입력 (요구 5·6·7·8) ── */}
        <div className="border-t border-line bg-surface px-4 py-4">
          <div className="relative mx-auto max-w-7xl">
            {/* 요구 3: "@" 내 자료 팔레트 */}
            {mentionOpen && myDocs.filter(d => d.filename.toLowerCase().includes(mentionQuery.toLowerCase())).length > 0 && (
              <div className="absolute bottom-full left-0 z-30 mb-2 w-full max-w-md overflow-hidden rounded-xl border border-line bg-surface shadow-lg">
                <p className="flex items-center justify-between border-b border-line px-3 py-1.5 font-mono text-[10px] uppercase tracking-[0.18em] text-ink-faint">
                  <span>내 자료 — @파일명 지정</span>
                  <span className="normal-case tracking-normal text-ink-faint/70">Enter 선택 · Esc 닫기</span>
                </p>
                <div className="max-h-64 overflow-y-auto p-1">
                  {myDocs.filter(d => d.filename.toLowerCase().includes(mentionQuery.toLowerCase())).map((doc, i) => (
                    <button key={doc.id} onClick={() => chooseMention(doc)}
                      onMouseEnter={() => setMentionIdx(i)}
                      className={`flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left transition-colors ${i === mentionIdx ? "bg-accent-soft" : "hover:bg-canvas"}`}>
                      <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded bg-pale-green font-mono text-xs text-pale-green-text">@</span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-xs font-semibold text-ink">{doc.filename}</span>
                        <span className="block truncate text-[11px] text-ink-soft">{doc.mimeType || "파일"} · {(doc.size / 1024).toFixed(1)} KB</span>
                      </span>
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* 요구 6: 슬래시 팔레트 */}
            {slashOpen && slashItems.length > 0 && (
              <div className="absolute bottom-full left-0 z-30 mb-2 w-full max-w-md overflow-hidden rounded-xl border border-line bg-surface shadow-lg">
                <p className="border-b border-line px-3 py-1.5 font-mono text-[10px] uppercase tracking-[0.18em] text-ink-faint">명령 · 사용 가능한 스킬</p>
                <div className="max-h-64 overflow-y-auto p-1">
                  {slashItems.map((item, i) => (
                    <button key={item.name} onClick={() => applySlashItem(item.name)}
                      onMouseEnter={() => setSlashIdx(i)}
                      className={`flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left transition-colors ${i === slashIdx ? "bg-accent-soft" : "hover:bg-canvas"}`}>
                      <span className={`flex h-6 w-6 shrink-0 items-center justify-center rounded font-mono text-xs ${item.name.startsWith("/") ? "bg-accent-soft text-accent" : "bg-pale-green text-pale-green-text"}`}>
                        {item.name.startsWith("/") ? "/" : "S"}
                      </span>
                      <span className="min-w-0">
                        <span className="block truncate text-xs font-semibold text-ink">{item.name}</span>
                        <span className="block truncate text-[11px] text-ink-soft">{item.description}</span>
                      </span>
                    </button>
                  ))}
                </div>
              </div>
            )}

            {fileIds.length > 0 && (
              <div className="mb-2 flex flex-wrap items-center gap-1.5">
                {fileIds.map(fid => {
                  const doc = myDocs.find(d => d.id === fid);
                  if (!doc) return null;
                  return (
                    <span key={fid} className="flex items-center gap-1 rounded-md border border-line bg-canvas px-2 py-1 text-[11px] text-ink-soft">
                      <span className="font-semibold text-accent">@</span>
                      <span className="max-w-[12rem] truncate">{doc.filename}</span>
                      <button title="제거" onClick={() => setFileIds(prev => prev.filter(x => x !== fid))}
                        className="ml-0.5 rounded text-ink-faint transition-colors hover:text-pale-red-text">✕</button>
                    </span>
                  );
                })}
              </div>
            )}
            <div className="flex items-end gap-2 rounded-xl border border-line-strong bg-surface px-3 py-2 transition-colors focus-within:border-accent">
              <input
                ref={fileRef}
                type="file"
                multiple
                className="hidden"
                onChange={e => { void uploadFiles(e.target.files); }}
              />
              <button
                onClick={() => fileRef.current?.click()}
                title="파일 업로드 (내 자료로 저장)"
                disabled={streaming}
                className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-ink-faint transition-colors hover:bg-canvas hover:text-accent disabled:opacity-35"
              >
                <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M20 12.5 12.6 20a5 5 0 0 1-7.1-7.1l7.9-7.9a3.5 3.5 0 1 1 5 5l-8 8a2 2 0 0 1-2.8-2.8l7.3-7.3" /></svg>
              </button>
              <textarea
                ref={inputRef}
                value={input}
                onChange={e => {
                  const v = e.target.value;
                  setInput(v);
                  // "@" 멘션 감지: 마지막 @ 이후 공백 전까지를 쿼리로 사용
                  const at = v.lastIndexOf("@");
                  const after = at >= 0 ? v.slice(at + 1) : "";
                  const isMention = at >= 0 && !after.includes(" ") && !after.includes("\n") && after !== "";
                  setMentionOpen(isMention);
                  setMentionQuery(isMention ? after : "");
                  if (isMention) setMentionIdx(0);
                  // "/"로 시작하는 입력(단독 "/" 또는 "/명령 " 형태)일 때만 팔레트 표시, 이후 옵션 타이핑 시 자동 닫힘
                  const isSlashCmd = /^\/\w*\s*$/.test(v) || v === "/";
                  setSlashOpen(slashOpen || (isSlashCmd && !isMention));
                  if (v && !isSlashCmd && !isMention) setSlashOpen(false);
                }}
                onKeyDown={handleKeyDown}
                onInput={resizeInput}
                placeholder="/ 명령 · @ 내 자료 지정 · 파일 드래그 업로드"
                rows={1}
                className="max-h-[10.5rem] min-h-[2.25rem] flex-1 resize-none overflow-y-auto bg-transparent py-1.5 text-sm leading-relaxed text-ink outline-none placeholder:text-ink-faint"
              />
              <button onClick={() => send()} disabled={streaming || !input.trim()}
                title="보내기"
                className="lift flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-ink text-white transition-colors hover:bg-[#33312E] disabled:cursor-not-allowed disabled:opacity-35">
                {I.arrow}
              </button>
            </div>
            <p className="mt-2 font-mono text-[11px] text-ink-faint">
              답변은 자동 생성됩니다. 업무 판단 전에 내부 기준과 대조해 주세요. · 업로드 파일은 내 자료로 저장됩니다.
            </p>
          </div>
        </div>
      </main>
    </div>
  );
}
