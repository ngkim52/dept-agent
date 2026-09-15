"use client";

// 경량 Markdown 미리보기(뷰어) — 회의록/문서 미리보기용.
// HTML을 먼저 이스케이프한 뒤 제한된 마크다운(제목·목록·강조·코드·링크·인용·구분선)을 렌더링한다.
function esc(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function inline(s: string): string {
  let out = esc(s);
  out = out.replace(/`([^`]+)`/g, "<code>$1</code>");
  out = out.replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>");
  out = out.replace(/\*([^*]+)\*/g, "<em>$1</em>");
  out = out.replace(/\[([^\]]+)\]\((https?:\/\/[^)\s]+)\)/g, '<a href="$2" target="_blank" rel="noreferrer">$1</a>');
  return out;
}

function listItem(li: string, ordered: boolean): string {
  return `<li>${inline(li)}</li>`;
}

export default function MarkdownViewer({ content, className = "" }: { content: string; className?: string }) {
  const lines = content.replace(/\r\n/g, "\n").split("\n");
  const out: string[] = [];
  let inCode = false; let codeBuf: string[] = [];
  let inListOrdered: boolean | null = null; let listBuf: string[] = [];
  let para: string[] = [];

  const flushList = () => {
    if (inListOrdered === null) return;
    const tag = inListOrdered ? "ol" : "ul";
    out.push(`<${tag}>${listBuf.join("")}</${tag}>`);
    listBuf = []; inListOrdered = null;
  };
  const flushPara = () => {
    if (para.length) { out.push(`<p>${para.map(inline).join("<br/>")}</p>`); para = []; }
  };

  for (const raw of lines) {
    const l = raw;
    const t = l.trim();
    // code fence
    if (/^```/.test(t)) {
      flushList(); flushPara();
      if (inCode) { out.push(`<pre><code>${esc(codeBuf.join("\n"))}</code></pre>`); codeBuf = []; inCode = false; }
      else inCode = true;
      continue;
    }
    if (inCode) { codeBuf.push(l); continue; }
    if (!t) { flushList(); flushPara(); continue; }
    // headings
    const h = t.match(/^(#{1,4})\s+(.*)/);
    if (h) { flushList(); flushPara(); const lv = h[1].length; out.push(`<h${lv}>${inline(h[2])}</h${lv}>`); continue; }
    // hr
    if (/^(-{3,}|\*{3,}|_{3,})$/.test(t)) { flushList(); flushPara(); out.push("<hr/>"); continue; }
    // blockquote
    if (/^>\s?/.test(t)) { flushList(); flushPara(); out.push(`<blockquote><p>${inline(t.replace(/^>\s?/, ""))}</p></blockquote>`); continue; }
    // lists
    const om = t.match(/^(\d+)\.\s+(.*)/);
    const um = t.match(/^[-*]\s+(.*)/);
    const isOrd = !!om;
    const isList = !!om || !!um;
    if (isList) {
      flushPara();
      const ord = isOrd;
      if (inListOrdered === null) inListOrdered = ord;
      // nested via leading spaces ignored
      listBuf.push(listItem(om ? om[2] : um![1], ord));
      continue;
    }
    // plain paragraph line
    flushList();
    para.push(l.trim());
  }
  flushList(); flushPara();
  if (inCode) out.push(`<pre><code>${esc(codeBuf.join("\n"))}</code></pre>`);

  return (
    <div
      className={`prose-simple ${className}`}
      style={{
        fontFamily: "var(--serif,serif)", fontSize: 14, lineHeight: 1.7, color: "var(--color-ink)",
        whiteSpace: "normal", overflowWrap: "break-word",
      }}
      dangerouslySetInnerHTML={{ __html: out.join("") }}
    />
  );
}
