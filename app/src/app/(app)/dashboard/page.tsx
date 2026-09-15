"use client";
import { Fragment, useEffect, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import type {
  ClaimDashboard, KpiCard, PipeStage, Monitor, FocusItem, NewsItem,
} from "@/lib/dashboard/dashboardData";
import MarkdownViewer from "@/components/MarkdownViewer";

/* ------------------------------------------------------------------ */
/* 아이콘 (목업 data-ic 대응)                                          */
/* ------------------------------------------------------------------ */
const PATHS: Record<string, string> = {
  doc: "M6 3h9l4 4v14H6z M9 3v5h6 M9 12h6 M9 16h6",
  bolt: "M13 2L4 14h6l-1 8 9-12h-6z",
  tri: "M12 3l9 18H3z",
  clock: "M12 21a9 9 0 100-18 9 9 0 000 18zM12 7v5l3 3",
  shield: "M12 3l7 3v5c0 4.5-3 8-7 10-4-2-7-5.5-7-10V6z",
  chk: "M5 13l4 4L19 7",
  search: "M11 19a8 8 0 100-16 8 8 0 000 16zM20 20l-4-4",
  chart: "M4 20V10 M10 20V4 M16 20v-8 M22 20H2",
  news: "M4 5h16v14H4z M8 9h8 M8 13h5",
  chev: "M9 6l6 6-6 6",
  q: "M12 3a9 9 0 100 18 9 9 0 000-18zM9.5 9a2.5 2.5 0 115 0c0 1.5-2.5 2-2.5 3.5M12 16.5h.01",
  send: "M4 12l16-8-6 16-2.5-6zM14 12H8",
  config: "M12 15a3 3 0 100-6 3 3 0 000 6z",
  spark: "M12 3l1.6 4.3L18 9l-4.4 1.7L12 15l-1.6-4.3L6 9l4.4-1.7z",
};
function Ic({ name, size = 14, color = "currentColor" }: { name: string; size?: number; color?: string }) {
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} style={{ display: "block" }} fill="none" stroke={color} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d={PATHS[name] ?? PATHS.doc} />
    </svg>
  );
}

const LEVEL_BG: Record<string, string> = {
  n: "#E7E5E4", b: "#E8F1F9", g: "#EDF3EC", a: "#F9F3E3", r: "#FBE9E9",
};
const LEVEL_FG: Record<string, string> = {
  n: "#78716C", b: "#1F6C9F", g: "#346538", a: "#8A6116", r: "#9F2F2D",
};
const TAG_TONE: Record<string, { bg: string; fg: string }> = {
  n: { bg: "#F5F5F4", fg: "#78716C" },
  b: { bg: "#E8F1F9", fg: "#1F6C9F" },
  g: { bg: "#EDF3EC", fg: "#346538" },
  a: { bg: "#F9F3E3", fg: "#8A6116" },
  r: { bg: "#FBE9E9", fg: "#9F2F2D" },
};
function Tag({ tone = "n", children }: { tone?: string; children: ReactNode }) {
  const t = TAG_TONE[tone] ?? TAG_TONE.n;
  return <span style={tagStyle(t)}>{children}</span>;
}
function tagStyle(t: { bg: string; fg: string }) {
  return { display: "inline-flex", alignItems: "center", gap: 4, padding: "2px 8px", borderRadius: 999, fontSize: 10.5, fontWeight: 600, background: t.bg, color: t.fg, whiteSpace: "nowrap" as const };
}
function Lvl({ tone = "n", size = 26, icon, iconSize = 13 }: { tone?: string; size?: number; icon: string; iconSize?: number }) {
  return (
    <span style={{ display: "inline-flex", alignItems: "center", justifyContent: "center", width: size, height: size, borderRadius: 8, background: LEVEL_BG[tone] ?? LEVEL_BG.n, color: LEVEL_FG[tone] ?? LEVEL_FG.n, flexShrink: 0 }}>
      <Ic name={icon} size={iconSize} color={LEVEL_FG[tone] ?? LEVEL_FG.n} />
    </span>
  );
}
function SectionTitle({ title, note }: { title: string; note?: string }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 10, margin: "30px 0 14px" }}>
      <span style={{ width: 3, height: 16, borderRadius: 3, background: "var(--accent,#1F6C9F)" }} />
      <h2 style={{ fontFamily: "var(--serif,serif)", fontSize: 18, fontWeight: 600, color: "var(--ink,#1C1917)", margin: 0 }}>{title}</h2>
      {note && <span style={{ fontSize: 11.5, color: "#A8A29E", fontFamily: "var(--mono,monospace)", letterSpacing: ".02em" }}>{note}</span>}
    </div>
  );
}
function QBtn({ q, label = "질문", icon = "q" }: { q: string; label?: string; icon?: string }) {
  const router = useRouter();
  return (
    <button onClick={() => router.push(`/chat?q=${encodeURIComponent(q)}`)} title="에이전트에게 질문하기"
      style={{ display: "inline-flex", alignItems: "center", gap: 5, padding: "5px 10px", borderRadius: 8, border: "1px solid #E7E5E4", background: "#fff", color: "#1F6C9F", fontSize: 11.5, fontWeight: 600, cursor: "pointer", transition: "all .15s" }}>
      <Ic name={icon} size={12} color="#1F6C9F" /><span>{label}</span>
    </button>
  );
}

const css = `.dab-root{--canvas:#FAFAF9;--surface:#fff;--ink:#1C1917;--ink-soft:#78716C;--ink-faint:#A8A29E;--line:#E7E5E4;--accent:#1F6C9F;--green:#346538;--amber:#8A6116;--red:#9F2F2D;--serif:"Noto Serif KR","Pretendard Variable",serif;--mono:ui-monospace,"SF Mono",Menlo,monospace;
  background:var(--canvas);color:var(--ink);font-family:"Pretendard Variable",Pretendard,-apple-system,"Apple SD Gothic Neo","Malgun Gothic","Segoe UI",sans-serif;min-height:100vh;}
.dab-wrap{max-width:1180px;margin:0 auto;padding:30px 34px 60px;}
.dab-topbar{display:flex;align-items:flex-start;justify-content:space-between;gap:20px;flex-wrap:wrap;margin-bottom:14px;}
.dab-title .eyebrow{font-family:var(--mono);font-size:10px;letter-spacing:.22em;color:#A8A29E;}
.dab-title h1{font-family:var(--serif);font-size:30px;font-weight:600;margin:8px 0 0;letter-spacing:-.01em;}
.dab-title .sub{margin:6px 0 0;font-size:12.5px;color:var(--ink-soft);}
.dab-chip{display:flex;align-items:center;gap:10px;}
.dab-user{display:flex;align-items:center;gap:9px;padding:7px 12px;background:#fff;border:1px solid var(--line);border-radius:10px;}
.dab-user .ava{width:28px;height:28px;border-radius:8px;background:var(--accent);color:#fff;display:flex;align-items:center;justify-content:center;font-size:13px;font-weight:600;}
.dab-user b{display:block;font-size:12.5px;font-weight:600;}
.dab-user .role{font-size:10px;color:var(--ink-faint);font-family:var(--mono);letter-spacing:.05em;}
.dab-data-note{display:flex;align-items:center;gap:6px;font-family:var(--mono);font-size:10px;color:#1F6C9F;background:#E8F1F9;border-radius:8px;padding:5px 9px;}
.cd{background:#fff;border:1px solid var(--line);border-radius:12px;padding:16px;box-shadow:0 1px 2px rgba(28,25,23,.03);}
.cd-head{display:flex;align-items:center;gap:10px;margin-bottom:12px;}
.cd-head h3{font-size:14px;font-weight:600;margin:0;}
.cmore{margin-left:auto;display:inline-flex;align-items:center;gap:4px;background:none;border:none;color:#1F6C9F;font-size:11.5px;font-weight:600;cursor:pointer;padding:4px;}
.dab-row{display:grid;gap:16px;}
.g4{grid-template-columns:repeat(4,minmax(0,1fr));} .g5{grid-template-columns:repeat(5,minmax(0,1fr));}
.g2{grid-template-columns:1fr 1fr;} 
@media(max-width:980px){.g4,.g5,.g2{grid-template-columns:1fr 1fr}}
@media(max-width:640px){.g4,.g5,.g2{grid-template-columns:1fr}.dab-wrap{padding:22px 16px 50px}}
.kbar{position:relative;height:6px;border-radius:6px;background:#F0EFEE;overflow:hidden;}
.kbar i{position:absolute;left:0;top:0;bottom:0;border-radius:6px;background:#1F6C9F;}
.kbar .tmark{position:absolute;top:-3px;bottom:-3px;width:2px;background:#1C1917;border-radius:2px;opacity:.5;}
.fitem{display:flex;flex-direction:column;gap:10px;background:#fff;border:1px solid var(--line);border-radius:12px;padding:14px 15px;}
.fitem .row1{display:flex;gap:11px;}
.fitem h4{font-size:13.5px;margin:0;font-weight:600;}
.fitem p{margin:4px 0 0;font-size:11.5px;color:var(--ink-soft);line-height:1.5;}
.fitem .meta{display:flex;align-items:center;justify-content:space-between;gap:8px;}
.qbtn{display:inline-flex;align-items:center;gap:5px;padding:5px 10px;border-radius:8px;border:1px solid var(--line);background:#fff;color:#1F6C9F;font-size:11px;font-weight:600;cursor:pointer;}
.qbtn:hover{border-color:#1F6C9F;}
.kpi{position:relative;display:flex;flex-direction:column;gap:8px;background:#fff;border:1px solid var(--line);border-radius:12px;padding:14px 15px;}
.kpi .khead{display:flex;align-items:center;gap:9px;}
.kpi .khead h3{font-size:12px;font-weight:600;margin:0;color:var(--ink);}
.kpi .num{font-family:var(--serif);font-size:27px;font-weight:600;line-height:1;color:var(--ink);}
.kpi .unit{font-size:11px;color:var(--ink-soft);margin-left:4px;}
.kpi .kbody{display:flex;align-items:baseline;gap:6px;}
.spark{width:100%;height:22px;}
.kpi .kfoot{display:flex;align-items:center;justify-content:space-between;gap:8px;font-size:10.5px;color:var(--ink-soft);}
.kq{position:absolute;right:10px;top:10px;width:24px;height:24px;border-radius:7px;border:none;background:transparent;color:#A8A29E;cursor:pointer;display:flex;align-items:center;justify-content:center;}
.kq:hover{background:#EEF4FA;color:#1F6C9F;}
.pipe-title{display:flex;align-items:baseline;justify-content:space-between;gap:12px;margin-bottom:12px;flex-wrap:wrap;}
.pipe-title h3{font-family:var(--serif);font-size:15px;font-weight:600;margin:0;}
.pipe-title p{margin:0;font-size:11.5px;color:var(--ink-soft);}
.pipeflow{display:grid;grid-template-columns:1fr 28px 1fr 28px 1fr 28px 1fr 28px 1fr;align-items:stretch;}
@media(max-width:980px){.pipeflow{grid-template-columns:1fr 24px 1fr;}}
.pcard{background:#fff;border:1px solid var(--line);border-radius:12px;padding:13px 14px;display:flex;flex-direction:column;gap:7px;position:relative;}
.pcard .ph{display:flex;align-items:center;gap:8px;font-size:12px;font-weight:600;}
.pn{font-family:var(--serif);font-size:24px;font-weight:600;}
.pd{font-size:10.5px;color:var(--ink-soft);line-height:1.5;}
.parrow{display:flex;align-items:center;justify-content:center;color:#C4C9CE;}
.pflownote{display:flex;align-items:center;justify-content:space-between;gap:12px;gap:12px;margin-top:12px;padding:10px 14px;background:#F5F5F4;border:1px dashed var(--line-strong,#D6D3D1);border-radius:10px;font-size:11.5px;color:var(--ink-soft);flex-wrap:wrap;}
.legend{display:flex;gap:14px;flex-wrap:wrap;font-size:10.5px;color:var(--ink-soft);margin:0 0 10px;}
.legend i{display:inline-block;width:12px;height:3px;border-radius:2px;margin-right:5px;vertical-align:middle;}
.legend .dot{display:inline-block;width:7px;height:7px;border-radius:50%;margin-right:5px;vertical-align:middle;}
.chartbox{width:100%;height:180px;}
.qtable{width:100%;border-collapse:collapse;font-size:11.5px;}
.qtable th{text-align:left;font-weight:600;font-size:10px;letter-spacing:.04em;color:var(--ink-faint);padding:5px 4px;border-bottom:1px solid var(--line);}
.qtable td{padding:7px 4px;border-bottom:1px solid #F5F5F4;color:var(--ink);}
.qtable .cnt{font-family:var(--serif);font-weight:600;}
.qtable .bar{position:relative;height:5px;background:#F0EFEE;border-radius:5px;overflow:hidden;}
.qtable .bar i{position:absolute;left:0;top:0;bottom:0;background:#1F6C9F;border-radius:5px;}
.qtable .bar i.over{position:absolute;background:#9F2F2D;}
.planline{display:flex;align-items:center;justify-content:space-between;gap:10px;flex-wrap:wrap;margin-top:10px;font-size:11px;color:var(--ink-soft);}
.ddlist{display:flex;flex-direction:column;gap:8px;margin-top:8px;}
.dd{display:flex;align-items:center;gap:10px;padding:8px 9px;background:#FAFAF9;border:1px solid var(--line);border-radius:10px;}
.dday{min-width:44px;text-align:center;border-right:1px solid var(--line);padding-right:10px;margin-right:2px;}
.dday b{display:block;font-family:var(--serif);font-size:14px;font-weight:600;}
.dday span{font-size:9.5px;color:var(--ink-faint);}
.dt{flex:1;}
.dt h4{font-size:11.5px;margin:0;font-weight:600;}
.dt p{font-size:10px;margin:2px 0 0;color:var(--ink-soft);}
.metricrow{display:flex;align-items:center;gap:14px;}
.gauge{flex:1;}
.gv .big-num{font-family:var(--serif);font-size:32px;font-weight:600;font-variant-numeric:tabular-nums;}
.gv small{font-size:12px;color:var(--ink-soft);margin-left:2px;}
.mlist{display:flex;flex-direction:column;gap:8px;margin-top:12px;}
.mitem{display:flex;gap:9px;font-size:11px;line-height:1.55;color:var(--ink);}
.mb{width:5px;height:5px;border-radius:50%;margin-top:5px;flex-shrink:0;}
.news-tabs{display:flex;gap:4px;margin-left:auto;background:#F5F5F4;border-radius:8px;padding:3px;}
.news-tabs button{border:none;background:transparent;padding:4px 9px;border-radius:6px;font-size:11px;color:var(--ink-soft);cursor:pointer;}
.news-tabs button.on{background:#fff;color:var(--ink);box-shadow:0 1px 2px rgba(0,0,0,.05);font-weight:600;}
.nlist{display:flex;flex-direction:column;}
.nitem{display:flex;gap:12px;padding:9px 2px;border-bottom:1px solid #F5F5F4;align-items:flex-start;}
.nitem:last-child{border-bottom:none;}
.ndate{font-family:var(--mono);font-size:11px;color:var(--ink-faint);padding-top:2px;min-width:34px;}
.nc h4{font-size:12px;margin:0;font-weight:600;line-height:1.4;}
.nc p{font-size:10.5px;margin:3px 0 0;color:var(--ink-soft);}
.sug-row{display:flex;gap:8px;flex-wrap:wrap;margin-top:12px;}
.sug{border:1px solid var(--line);background:#fff;color:var(--ink);font-size:11px;padding:6px 11px;border-radius:999px;cursor:pointer;}
.sug:hover{border-color:#1F6C9F;color:#1F6C9F;}
.chatpanel{display:flex;flex-direction:column;height:100%;background:#fff;border:1px solid var(--line);border-radius:12px;overflow:hidden;}
.cp-head{display:flex;align-items:center;gap:10px;padding:12px 14px;border-bottom:1px solid var(--line);}
.pchip{display:flex;align-items:center;gap:9px;}
.pchip .ava{width:30px;height:30px;border-radius:9px;background:var(--accent);color:#fff;display:flex;align-items:center;justify-content:center;font-size:14px;font-weight:600;}
.pchip b{display:block;font-size:12.5px;}
.pchip span{font-size:10px;color:var(--ink-faint);}
.ctxbar{display:flex;align-items:center;gap:6px;flex-wrap:wrap;padding:8px 14px;background:#FAFAF9;border-bottom:1px solid var(--line);font-size:10.5px;color:var(--ink-soft);}
.cp-msgs{display:flex;flex-direction:column;gap:12px;padding:14px;flex:1;font-size:12px;}
.msg .who{display:block;font-size:10px;color:var(--ink-faint);margin-bottom:4px;}
.msg .bubble{background:#FAFAF9;border:1px solid var(--line);border-radius:10px;border-top-left-radius:2px;padding:9px 11px;line-height:1.6;color:var(--ink);}
.msg.user .bubble{background:#E8F1F9;border-color:#D9E7F3;border-top-left-radius:10px;border-top-right-radius:2px;}
.refs{display:flex;gap:6px;margin-top:6px;flex-wrap:wrap;}
.ref{font-size:9.5px;color:#1F6C9F;background:#E8F1F9;border-radius:6px;padding:2px 7px;}
.cp-in{display:flex;align-items:flex-end;gap:8px;padding:10px 14px;border-top:1px solid var(--line);}
.cp-in textarea{flex:1;border:1px solid var(--line);border-radius:10px;padding:8px 10px;font-size:12px;resize:none;outline:none;font-family:inherit;min-height:34px;}
.cp-in textarea:focus{border-color:#1F6C9F;}
.sendbtn{width:34px;height:34px;border-radius:10px;border:none;background:#1F6C9F;color:#fff;cursor:pointer;display:flex;align-items:center;justify-content:center;}
.todos{display:flex;flex-direction:column;gap:7px;}
.todo{display:flex;gap:9px;padding:8px 9px;background:#FAFAF9;border:1px solid var(--line);border-radius:10px;align-items:flex-start;}
.todo .dotc{width:7px;height:7px;border-radius:50%;background:#B4533F;margin-top:5px;flex-shrink:0;}
.todo h4{font-size:11.5px;margin:0;font-weight:600;line-height:1.4;}
.todo p{font-size:10px;color:var(--ink-soft);margin:3px 0 0;line-height:1.5;}
.dabar{display:flex;align-items:center;gap:6px;margin:2px 0 22px;font-family:var(--mono);font-size:10px;color:var(--ink-faint);letter-spacing:.03em;}
.dabar i{width:8px;height:8px;border-radius:50%;background:#346538;}`;

/* ------------------------------------------------------------------ */
/* 소형 컴포넌트                                                        */
/* ------------------------------------------------------------------ */
function Spark({ t, color = "#1F6C9F" }: { t: number[]; color?: string }) {
  if (!t || t.length < 2) return null;
  const mn = Math.min(...t), mx = Math.max(...t), span = mx - mn || 1;
  const pts = t.map((v, i) => `${2 + (i / (t.length - 1)) * 70},${22 - ((v - mn) / span) * 18}`).join(" ");
  return <svg className="spark" viewBox="0 0 74 24" preserveAspectRatio="none"><polyline points={pts} fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" /></svg>;
}

function FocusSection({ items }: { items: FocusItem[] }) {
  return (
    <>
      <div style={{ display: "grid", gridTemplateColumns: "320px 1fr", gap: 16, alignItems: "stretch" }} className="focus-grid">
        <div style={{ background: "linear-gradient(150deg,#1F6C9F 0%,#16527D 100%)", color: "#F5FAFD", borderRadius: 14, padding: "20px 20px", display: "flex", flexDirection: "column", justifyContent: "space-between", boxShadow: "0 6px 18px -8px rgba(31,108,159,.55)" }}>
          <div>
            <span className="eyebrow" style={{ fontFamily: "var(--mono,monospace)", fontSize: 10, letterSpacing: ".22em", color: "#191815" }}>TODAY · DIRECTION</span>
            <p style={{ fontFamily: "var(--serif,serif)", fontSize: 21, fontWeight: 600, margin: "10px 0 0", lineHeight: 1.4 }}>오늘 팀이 집중할<br />방향은 이것입니다.</p>
          </div>
          <p style={{ fontSize: 10.5, color: "#C7E0F0", fontFamily: "var(--mono,monospace)" }}>대시보드는 어제 실적 기준 · 매일 09:00 갱신</p>
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {items.map((it, i) => (
            <div className="fitem" key={i} style={{ flex: 1 }}>
              <div className="row1">
                <Lvl tone={it.tone} size={30} icon={it.icon} iconSize={15} />
                <div><h4>{it.title}</h4><p dangerouslySetInnerHTML={{ __html: it.sub }} /></div>
              </div>
              <div className="meta"><Tag tone={it.tagTone}>{it.tag}</Tag><QBtn q={it.title + "를 검토해 주세요."} /></div>
            </div>
          ))}
        </div>
      </div>
      <style>{`@media(max-width:900px){.focus-grid{grid-template-columns:1fr !important}}`}</style>
    </>
  );
}

function KpiCards({ kpis, onSelect, selected }: { kpis: KpiCard[]; onSelect?: (key: string) => void; selected?: string | null }) {
  const router = useRouter();
  return (
    <div className="dab-row g5">
      {kpis.map(k => (
        <div className="kpi" key={k.key} onClick={() => onSelect?.(k.key)} style={{ cursor: onSelect ? "pointer" : undefined, outline: selected === k.key ? "2px solid var(--link,#1F6C9F)" : "none", outlineOffset: -2 }}>
          <button className="kq" onClick={() => router.push(`/chat?q=${encodeURIComponent(k.label + " " + k.big + k.unit + " " + k.tag.text + " — 검증해 주세요.")}`)} title="질문하기"><Ic name="q" size={13} /></button>
          <div className="khead"><Lvl tone={k.tag.tone} size={24} icon={kpiIcon(k.key)} iconSize={12} /><h3>{k.label}</h3></div>
          <div className="kbody">
            <span className="num">{k.big}</span><span className="unit">{k.unit}</span>
            {k.key === "cum_paid" && <span style={{ marginLeft: "auto" }}><Spark t={k.trend ?? []} /></span>}
          </div>
          {typeof k.barPct === "number" && (
            <div className="kbar">{<i style={{ width: `${Math.min(k.barPct, 100)}%` }} />}
              {typeof k.barLabel === "string" && <span className="tmark" style={{ left: `${Math.min(Number(parseFloat(k.barLabel) > 5 ? 100 : (parseFloat(k.barLabel) / 5) * 100), 100)}%` }} />}
            </div>
          )}
          <div className="kfoot"><Tag tone={k.tag.tone}>{k.tag.text}</Tag><span>{k.foot}</span></div>
        </div>
      ))}
    </div>
  );
}

function KpiDetailPanel({ detail, onClose }: { detail: any; onClose: () => void }) {
  const maxM = Math.max(...detail.monthly, 1);
  const mx = detail.breakdown.reduce((a: number, b: any) => Math.max(a, ...b.values), 1);
  const pal = ["#1F6C9F", "#B08600", "#3E8E5A", "#8B5BB4", "#C05A6E"];
  return (
    <div className="kd" style={{ marginTop: 12, background: "var(--surface,#fff)", border: "1px solid var(--line,#EDEAE5)", borderRadius: 14, padding: "16px 18px" }}>
      <div className="kd-head" style={{ display: "flex", alignItems: "center", gap: 10 }}>
        <Lvl tone="b" size={22} icon={kpiIcon(detail.key)} iconSize={12} />
        <h4 style={{ flex: 1, margin: 0, fontSize: 14 }}>{detail.title} 상세 (1~9월) · <span style={{ color: "var(--ink-faint)", fontWeight: 400 }}>출처: RAG 가상 데이터(정비 예정)</span></h4>
        <button onClick={onClose} style={{ border: "none", background: "transparent", cursor: "pointer", fontSize: 16, color: "var(--ink-faint)" }}>✕</button>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 18, marginTop: 8 }}>
        <div>
          <div className="eyebrow" style={{ fontSize: 10, letterSpacing: ".12em", color: "var(--ink-faint)", marginBottom: 6 }}>월별 {detail.unit}</div>
          <div style={{ display: "flex", alignItems: "flex-end", gap: 5, height: 110 }}>
            {detail.monthly.map((v: number, i: number) => (
              <div key={i} style={{ flex: 1, textAlign: "center" }}>
                <div style={{ fontSize: 9.5, color: "var(--ink-faint)" }}>{Math.round(v)}</div>
                <div style={{ height: `${(v / maxM) * 82}px`, background: pal[i % pal.length], borderRadius: "5px 5px 0 0", minHeight: 3 }} />
                <div style={{ fontSize: 9, color: "var(--ink-faint)", marginTop: 3 }}>{detail.months[i]}</div>
              </div>
            ))}
          </div>
        </div>
        <div>
          <div className="eyebrow" style={{ fontSize: 10, letterSpacing: ".12em", color: "var(--ink-faint)", marginBottom: 6 }}>하위 분류별 월별 추이</div>
          <div style={{ display: "flex", flexDirection: "column", gap: 7 }}>
            {detail.breakdown.map((b: any, bi: number) => (
              <div key={bi} style={{ display: "grid", gridTemplateColumns: "46px 10px 1fr", alignItems: "center", gap: 6 }}>
                <span style={{ fontSize: 10.5, color: "var(--ink-soft)" }}>{b.label}</span>
                <span style={{ width: 8, height: 8, borderRadius: 2, background: pal[bi % pal.length] }} />
                <svg viewBox="0 0 90 20" preserveAspectRatio="none" style={{ width: "100%", height: 16 }}>
                  <polyline points={b.values.map((v: number, k: number) => `${(k / (b.values.length - 1)) * 88 + 1},${18 - ((v / mx) * 15)}`).join(" ")} fill="none" stroke={pal[bi % pal.length]} strokeWidth="1.6" />
                </svg>
              </div>
            ))}
          </div>
        </div>
      </div>
      <style>{"@media(max-width:760px){.kd-kd-grid{grid-template-columns:1fr}}"}</style>
    </div>
  );
}

function kpiIcon(key: string) { return key === "loss_ratio" ? "tri" : key === "avg_days" ? "clock" : key === "fraud" ? "shield" : "doc"; }

function Pipeline({ pipe, flowNote, qs }: { pipe: PipeStage[]; flowNote: string; qs: string[] }) {
  const router = useRouter();
  return (
    <>
      <div className="pipe-title">
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}><h3>접수 → 지급</h3><p>자동심사 비중을 높여 병목(수동심사)을 줄이는 것이 올해 방향입니다.</p></div>
        <QBtn label="단계 전체 질문" q="파이프라인 전체 흐름에서 병목 지점과 처리율 99% 로드맵을 제안해 주세요." />
      </div>
      <div className="pipeflow">
        {pipe.map((s, i) => (
          <Fragment key={s.label}>
            {i > 0 && <div className="parrow"><Ic name="chev" size={14} /></div>}
            <div className="pcard">
              <div className="ph"><Lvl tone={s.tone} size={22} icon={pIcon(s.label)} iconSize={11} />{s.label}
                <button className="kq" onClick={() => router.push(`/chat?q=${encodeURIComponent(qs[i] ?? s.label + " 검토")}`)} title="질문하기" style={{ position: "static", marginLeft: "auto" }}><Ic name="q" size={12} /></button>
              </div>
              <div className="pn">{s.num} <small style={{ fontSize: 11, color: "var(--ink-soft)" }}>{s.unit}</small></div>
              <div className="pd" dangerouslySetInnerHTML={{ __html: s.sub }} />
            </div>
          </Fragment>
        ))}
      </div>
      <div className="pflownote"><span className="sum">{flowNote}</span><QBtn label="흐름 전체 질문" q="파이프라인 처리율 99% 달성 로드맵을 제안해 주세요." /></div>
    </>
  );
}
function pIcon(label: string) { return label.includes("AI") ? "bolt" : label.includes("수동") ? "clock" : label.includes("지급") ? "chk" : label.includes("보류") ? "search" : "doc"; }

function TrendChart({ dash }: { dash: ClaimDashboard }) {
  const t = dash.trend ?? { months: [], paid: [], paidPrevYear: [], lossRatio: [], targetLoss: 79 };
  const max = Math.max(...t.paid, ...t.paidPrevYear) * 1.1;
  const bw = 24, gap = 18, H = 150, base = H - 26;
  const barY = (v: number) => base - (v / max) * base;
  const lineMax = Math.max(...t.lossRatio, t.targetLoss, 79) * 1.08;
  const lx = (i: number) => 16 + i * (bw + gap) + bw / 2;
  const ly = (v: number) => base - (v / lineMax) * base;
  const pts = t.lossRatio.map((v, i) => `${lx(i)},${ly(v)}`).join(" ");
  const targY = ly(t.targetLoss);
  return (
    <div>
      <div className="legend">
        <span><i style={{ background: "#1F6C9F" }} />지급보험금 (억 원)</span>
        <span><i style={{ background: "#C4C9CE" }} />전년 동월</span>
        <span><span className="dot" style={{ background: "#9F2F2D" }} />손해율 (%)</span>
        <span><span className="dot" style={{ background: "#1C1917", opacity: .5 }} />목표 79.0%</span>
      </div>
      <svg className="chartbox" viewBox={`0 0 ${t.months.length * (bw + gap) + 20} 176`} preserveAspectRatio="none">
        <line x1="0" y1={base} x2={t.months.length * (bw + gap) + 20} y2={base} stroke="#E7E5E4" />
        {t.months.map((m, i) => (
          <g key={m}>
            <rect x={14 + i * (bw + gap)} y={barY(t.paid[i])} width={bw} height={base - barY(t.paid[i])} rx={3} fill="#1F6C9F" opacity={0.85} />
            <rect x={14 + i * (bw + gap)} y={barY(t.paidPrevYear[i])} width={bw} height={base - barY(t.paidPrevYear[i])} rx={3} fill="#C4C9CE" opacity={0.6} />
            <rect x={14 + i * (bw + gap) + bw / 2 - 1} y={base - 5} width={2} height={5} fill="none" />
            <text x={lx(i)} y={176} fontSize="8" fill="#A8A29E" textAnchor="middle" fontFamily="monospace">{m}</text>
          </g>
        ))}
        <line x1="0" y1={targY} x2={t.months.length * (bw + gap) + 20} y2={targY} stroke="#1C1917" strokeWidth="1" strokeDasharray="3 3" opacity=".5" />
        <polyline points={pts} fill="none" stroke="#9F2F2D" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
        {t.lossRatio.map((v, i) => <circle key={i} cx={lx(i)} cy={ly(v)} r="2.4" fill="#9F2F2D" />)}
      </svg>
    </div>
  );
}


function DeadlineCard({ dash }: { dash: ClaimDashboard }) {
  const toneColor: Record<string, string> = { a: "#B08600", r: "#C05A6E", b: "#1F6C9F" };
  return (
    <div className="cd">
      <div className="cd-head"><Lvl tone="a" size={26} icon="clock" iconSize={13} /><h3>다가오는 마감</h3><QBtn label="마감 일정 질문" q="이번 달 마감 일정과 준비 현황을 정리해 주세요." icon="chev" /></div>
      <div className="ddlist">
        {dash.deadlines.map((d, i) => (
          <div key={i} className="dd" style={{ display: "flex", gap: 10, alignItems: "flex-start", padding: "7px 0", borderBottom: "1px solid var(--line,#F3F1EC)" }}>
            <div style={{ width: 52, textAlign: "center", borderRadius: 8, background: "#F5F4F0", padding: "4px 2px" }}>
              <div style={{ fontSize: 13, fontWeight: 700 }}>{d.day}</div><div style={{ fontSize: 9.5, color: "var(--ink-faint)" }}>{d.weekday}</div>
            </div>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 13, fontWeight: 600 }}>{d.title}</div>
              <div style={{ fontSize: 11.5, color: "var(--ink-soft)" }}>{d.sub}</div>
            </div>
            <Tag tone={toneColor[d.tone] ? (d.tone === "r" ? "r" : d.tone === "a" ? "a" : "b") : "n"}>{d.state}</Tag>
          </div>
        ))}
        {dash.deadlines.length === 0 && <div style={{ color: "var(--ink-faint)", fontSize: 12, padding: "12px 0" }}>예정된 마감이 없습니다.</div>}
      </div>
    </div>
  );
}

function WorkQueueCard({ tasks, stats, reload, onDelete }: { tasks: any[]; stats: any; reload: () => void; onDelete?: (id: string) => void }) {
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ title: "", assignee: "", dueDate: "", content: "" });
  const st = stats ?? { total: 0, done: 0, delayed: 0, avgProgress: 0 };
  const create = async () => {
    if (!form.title.trim()) return;
    await fetch("/api/workqueue", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ title: form.title, assignee: form.assignee, dueDate: form.dueDate, content: form.content }) });
    setForm({ title: "", assignee: "", dueDate: "", content: "" }); setOpen(false); reload();
  };
  const patch = async (id: string, p: any) => { await fetch(`/api/workqueue/${id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(p) }); reload(); };
  return (
    <div className="cd">
      <div className="cd-head"><Lvl tone="b" size={26} icon="bolt" iconSize={13} /><h3>부서 워크큐</h3><button onClick={() => setOpen(!open)} className="wq-add" style={{ border: "1px solid var(--line,#E8E4DD)", background: "var(--surface,#fff)", borderRadius: 8, padding: "4px 10px", fontSize: 11.5, cursor: "pointer" }}>{open ? "닫기" : "+ 일감 생성"}</button></div>
      <div style={{ display: "flex", gap: 10, margin: "2px 0 10px", flexWrap: "wrap" }}>
        <span className="wq-stat" style={{ fontSize: 11.5, color: "var(--ink-soft)" }}>전체 {st.total} · 진행 중 {st.doing ?? 0} · 완료 {st.done} · 지연 {st.delayed}</span>
        <span style={{ fontSize: 11.5, color: "var(--ink-soft)" }}>평균 진행률 <b>{st.avgProgress}%</b></span>
      </div>
      {open && (
        <div style={{ display: "grid", gap: 6, marginBottom: 10, padding: 10, border: "1px dashed var(--line,#E0DBD3)", borderRadius: 10, background: "#FBFAF7" }}>
          <input value={form.title} onChange={e => setForm({ ...form, title: e.target.value })} placeholder="일감 제목" style={{ padding: "6px 8px", fontSize: 12.5, border: "1px solid var(--line)", borderRadius: 7 }} />
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 6 }}>
            <input value={form.assignee} onChange={e => setForm({ ...form, assignee: e.target.value })} placeholder="담당자" style={{ padding: "6px 8px", fontSize: 12.5, border: "1px solid var(--line)", borderRadius: 7 }} />
            <input value={form.dueDate} onChange={e => setForm({ ...form, dueDate: e.target.value })} placeholder="마감(예 2026-09-30)" style={{ padding: "6px 8px", fontSize: 12.5, border: "1px solid var(--line)", borderRadius: 7 }} />
          </div>
          <input value={form.content} onChange={e => setForm({ ...form, content: e.target.value })} placeholder="진행 내용(주간/월간 업무 등) — RAG 등록" style={{ padding: "6px 8px", fontSize: 12.5, border: "1px solid var(--line)", borderRadius: 7 }} />
          <button onClick={create} disabled={!form.title.trim()} style={{ padding: "7px", fontSize: 12.5, borderRadius: 8, background: "#1F6C9F", color: "#fff", border: "none", cursor: "pointer" }}>일감 등록</button>
        </div>
      )}
      <div className="wqlist" style={{ display: "flex", flexDirection: "column", gap: 7 }}>
        {tasks.length === 0 && <div style={{ color: "var(--ink-faint)", fontSize: 12, padding: "6px 0" }}>등록된 일감이 없습니다. 부서장 의견 항목을 클릭하거나 「+ 일감 생성」으로 등록하세요.</div>}
        {tasks.map((t) => (
          <div key={t.id} style={{ border: "1px solid var(--line,#EDEAE5)", borderRadius: 10, padding: "8px 10px" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <Tag tone={t.status === "done" ? "g" : t.status === "delayed" ? "r" : t.status === "doing" ? "b" : "n"}>{t.status === "doing" ? "진행" : t.status === "done" ? "완료" : t.status === "delayed" ? "지연" : "대기"}</Tag>
              <b style={{ fontSize: 12.5, flex: 1 }}>{t.title}</b>
              <span style={{ fontSize: 11, color: "var(--ink-soft)" }}>{t.assignee || ""}{t.dueDate ? " · " + t.dueDate : ""}</span>
              {onDelete && <button onClick={() => onDelete(t.id)} title="일감 삭제" style={{ fontSize: 10, border: "1px solid #E3E0DB", background: "#fff", borderRadius: 6, padding: "1px 6px", color: "#9F2F2D", cursor: "pointer" }}>삭제</button>}
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 5 }}>
              <div style={{ flex: 1, height: 6, borderRadius: 4, background: "#EFECE6" }}><div style={{ width: `${t.progress ?? 0}%`, height: 6, borderRadius: 4, background: t.status === "delayed" ? "#C05A6E" : "#1F6C9F" }} /></div>
              <span style={{ fontSize: 11 }}>{t.progress ?? 0}%</span>
              {t.status !== "done" && <button onClick={() => patch(t.id, { progress: (t.progress ?? 0) >= 90 ? 0 : (t.progress ?? 0) + 25 })} style={{ fontSize: 10.5, border: "1px solid var(--line)", background: "#fff", borderRadius: 6, padding: "2px 6px", cursor: "pointer" }}>+25%</button>}
              {t.status === "delayed" && <span style={{ fontSize: 10.5, color: "#C05A6E" }}>서면 보고 지시</span>}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function QueueCard({ dash }: { dash: ClaimDashboard }) {
  return (
    <div className="cd">
      <div className="cd-head">
        <Lvl tone="a" icon="clock" /><h3>심사 처리 큐 · 지연 관리</h3>
        <QBtn label="큐 상세" q="심사 처리 큐 지연 구간의 기한 초과분을 없애는 실행 계획을 제안해 주세요." icon="chev" />
      </div>
      <table className="qtable">
        <thead><tr><th>구분</th><th>건수</th><th style={{ width: "38%" }}>분포</th><th>상태</th></tr></thead>
        <tbody>
          {dash.queueRows.map(r => (
            <tr key={r.label}>
              <td>{r.label}</td><td className="cnt">{r.cnt}</td>
              <td><div className="bar"><i style={{ width: `${r.pct}%` }} />{typeof r.overPct === "number" && <i className="over" style={{ width: `${r.overPct}%`, left: `${r.pct}%` }} />}</div></td>
              <td><Tag tone={r.tone}>{r.status}</Tag></td>
            </tr>
          ))}
        </tbody>
      </table>
      <div className="planline"><span dangerouslySetInnerHTML={{ __html: dash.queueSummary }} /><QBtn label="정리안 요청" q="기한 초과 156건을 이번 주 안에 정리하는 실행 계획을 세워 주세요." /></div>
      <div className="cd-head" style={{ margin: "16px 0 6px" }}><h3 style={{ fontSize: 11.5, color: "var(--ink-soft)" }}>다가오는 마감</h3></div>
      <div className="ddlist">
        {dash.deadlines.map((d) => (
          <div className="dd" key={d.title}>
            <div className="dday"><b>{d.day}</b><span>{d.weekday}</span></div>
            <div className="dt"><h4>{d.title}</h4><p>{d.sub}</p></div>
            <div className="dstate"><Tag tone={d.tone}>{d.state}</Tag></div>
          </div>
        ))}
      </div>
    </div>
  );
}

function MonitorCard({ m }: { m: Monitor }) {
  return (
    <div className="cd">
      <div className="cd-head"><Lvl tone={m.tone} icon={m.icon} /><h3>{m.title}</h3>
        <QBtn label="질문" q={`${m.title} 현재 ${m.big}${m.bigUnit} — 실행 계획을 검토해 주세요.`} icon="chev" />
      </div>
      <div className="metriccell">
        <div className="metricrow">
          <div className="gauge">
            <div style={{ display: "flex", justifyContent: "space-between", fontSize: 10.5, color: "var(--ink-soft)", marginBottom: 5 }}><span>{m.gaugeLabel}</span><span>{m.gaugeRight}</span></div>
            <div className="kbar"><i style={{ width: `${m.gaugePct}%`, background: m.gaugeColor ?? undefined }} /></div>
          </div>
          <div className="gv"><span className="big-num">{m.big}<small>{m.bigUnit}</small></span></div>
        </div>
        <div className="planline"><span dangerouslySetInnerHTML={{ __html: m.planLine }} /><Tag tone={m.planTag.tone}>{m.planTag.text}</Tag></div>
      </div>
      <div className="mlist">
        {m.items.map((it, i) => <div className="mitem" key={i}><span className="mb" style={{ background: it.dot }} /><div dangerouslySetInnerHTML={{ __html: it.text }} /></div>)}
      </div>
    </div>
  );
}

function MonRow({ t, onDelete }: { t: any; onDelete?: (id: string) => void }) {
  return (
    <div className="cd">
      <div className="cd-head"><Lvl tone={t.status === "delayed" ? "r" : t.status === "done" ? "g" : t.status === "doing" ? "b" : "n"} size={26} icon="bolt" iconSize={13} /><h3 style={{ flex: 1 }}>{t.title}</h3>
        {onDelete && <button onClick={() => onDelete(t.id)} title="일감 삭제" style={{ border: "1px solid #E3E0DB", background: "#fff", borderRadius: 7, padding: "2px 8px", fontSize: 10.5, color: "#9F2F2D", cursor: "pointer" }}>삭제</button>}
        <QBtn label="질문" q={`일감「${t.title}」의 실행·진행 상황을 점검해 주세요.`} icon="chev" />
      </div>
      <div className="metriccell">
        <div className="metricrow">
          <div className="gauge">
            <div style={{ display: "flex", justifyContent: "space-between", fontSize: 10.5, color: "var(--ink-soft)", marginBottom: 5 }}><span>{t.assignee || "담당 미지정"}{t.dueDate ? " · " + t.dueDate : ""}</span><span>{t.status === "doing" ? "진행" : t.status === "done" ? "완료" : t.status === "delayed" ? "지연" : "대기"}</span></div>
            <div className="kbar"><i style={{ width: `${Math.min(t.progress ?? 0, 100)}%`, background: t.status === "delayed" ? "#C05A6E" : "#1F6C9F" }} /></div>
          </div>
          <div className="gv"><span className="big-num">{t.progress ?? 0}<small>%</small></span></div>
        </div>
        <div className="planline"><span style={{ fontSize: 11 }}>{t.content || "등록된 내용 없음 (일감 상세 작성 필요)"}</span></div>
        <div className="meta" style={{ marginTop: 6 }}><Tag tone={t.status === "done" ? "g" : t.status === "delayed" ? "r" : t.status === "doing" ? "b" : "n"}>{t.category || "일반"}</Tag>
          <span style={{ fontSize: 10, color: "var(--ink-faint)" }}>{t.status === "delayed" ? "서면 보고 지시" : t.ragSynced ? "RAG 등록" : ""}</span>
        </div>
      </div>
    </div>
  );
}


function NewsCard({ fss, ins }: { fss: NewsItem[]; ins: NewsItem[] }) {
  const router = useRouter();
  const [tab, setTab] = useState<"fss" | "ins">("fss");
  const list = tab === "fss" ? fss : ins;
  return (
    <div className="cd" style={{ display: "flex", flexDirection: "column" }}>
      <div className="cd-head">
        <Lvl tone="n" icon="news" /><h3>금감원 공시 · 오늘의 보험뉴스</h3>
        <div className="news-tabs">
          <button className={tab === "fss" ? "on" : ""} onClick={() => setTab("fss")}>금감원 공시</button>
          <button className={tab === "ins" ? "on" : ""} onClick={() => setTab("ins")}>보험 뉴스</button>
        </div>
      </div>
      <div className="nlist">
        {list.map((n, i) => (
          <div className="nitem" key={i}>
            <span className="ndate">{n.date}</span>
            <div className="nc"><h4>{n.title}</h4><p>{n.sub}</p></div>
            <button className="kq" onClick={() => router.push(`/chat?q=${encodeURIComponent(n.title + " — 시사점을 정리해 주세요.")}`)} title="질문하기"><Ic name="q" size={12} /></button>
          </div>
        ))}
      </div>
    </div>
  );
}

function ChatPanel({ dash }: { dash: ClaimDashboard | null }) {
  const router = useRouter();
  const [q, setQ] = useState("");
  const send = () => { if (q.trim()) router.push(`/chat?q=${encodeURIComponent(q.trim())}`); };
  return (
    <div className="chatpanel">
      <div className="cp-head">
        <div className="pchip"><span className="ava">심</span><div><b>보험금심사기획 부서장</b><span>대시보드 데이터를 근거로 검증·조언합니다</span></div></div>
        <span className="ctx-toggle" style={{ display: "inline-flex", alignItems: "center", gap: 6, marginLeft: "auto", fontSize: 10.5, color: "#1F6C9F", background: "#E8F1F9", borderRadius: 8, padding: "5px 9px" }}>
          <span style={{ width: 7, height: 7, borderRadius: "50%", background: "#1F6C9F" }} />대시보드 컨텍스트
        </span>
        <button className="kq" onClick={() => router.push("/chat?q=" + encodeURIComponent("대시보드 화면 전체를 설명해 주세요."))} title="질문하기"><Ic name="q" size={13} /></button>
      </div>
      <div className="ctxbar"><b>대시보드 참조:</b>
        <Tag tone="b">{`${curMonth(dash)} 실적 · 2026`}</Tag><Tag tone="n">누적 지급 {dash?.trend?.cumulative.toLocaleString("ko-KR") ?? "4,218"}억</Tag><Tag tone="r">{`손해율 ${dash?.trend?.lossRatio?.[8] ?? 82.4}%`}</Tag><Tag tone="b">AI 적용 71.3%</Tag><Tag tone="a">초과 156건</Tag>
        <span style={{ marginLeft: "auto", color: "#1F6C9F" }}>매일 09:00 갱신</span>
      </div>
      <div className="cp-msgs">
        <div className="msg user"><span className="who">팀원 · 09:12</span><div className="bubble">{curMonth(dash)} 손해율 83.1% — 목표 79%보다 4.1%p 높아. 지금 상황을 한 줄로 요약해 줘.</div></div>
        <div className="msg assistant"><span className="who">부서장 · 09:12</span>
          <div className="bubble">{curMonth(dash)} 누적 손해율 <b>83.1%</b>(목표 79.0% 대비 <b>+4.1%p</b>, 3개월 연속 상승)로 <b>통제 필요 구간</b>입니다. 원인은 ①실손·상해 청구 급증(+6.2%) ②1건당 평균 지급액 +4.1% ③조서 누락 등 품질 지적 156건이 복합된 것으로 보입니다.</div>
          <div className="refs"><span className="ref">대시보드 · 손해율 추이</span><span className="ref">{curMonth(dash)} 품질 점검</span></div>
        </div>
      </div>
      <div className="sug-row">
        {["손해율 +3.4%p 원인 분석", "AI 한도 500만 확대 리스크", "기한 초과 156건 정리", "오늘 공시·뉴스 영향 요약"].map(s => (
          <button className="sug" key={s} onClick={() => router.push(`/chat?q=${encodeURIComponent(s)}`)}>{s}</button>
        ))}
      </div>
      <div className="cp-in">
        <textarea rows={1} value={q} onChange={e => setQ(e.target.value)} placeholder="대시보드 지표에 대해 질문하세요 — 예) 손해율 원인을 분석해 줘" onKeyDown={e => { if (e.key === "Enter" && !e.nativeEvent.isComposing) send(); }} />
        <button className="sendbtn" onClick={send} title="전송"><Ic name="send" size={15} /></button>
      </div>
      <div style={{ padding: "7px 14px", borderTop: "1px solid var(--line)", fontSize: 10, color: "var(--ink-faint)" }}>전체 채팅은 좌측 레일 [채팅]에서 — 질문을 입력하면 에이전트와 대화합니다.</div>
    </div>
  );
}


function DirectorNote({ review, onMeeting, onTask, registered }: { review: SectionReview | null; onMeeting: (review: SectionReview) => void; onTask?: (title: string) => void; registered?: (t: string) => boolean }) {
  if (!review) return null;
  const teams = review.teams ?? {};
  const teamsEntries = Object.entries(teams);
  return (
    <div style={{ marginTop: 12, border: "1px solid #D8E4EF", borderLeft: "3px solid var(--accent,#1F6C9F)", borderRadius: 10, background: "#F4F8FB", padding: "12px 14px" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 7 }}>
        <Lvl tone="b" size={22} icon="spark" iconSize={11} />
        <span style={{ fontSize: 12, fontWeight: 700, color: "var(--accent,#1F6C9F)" }}>부서장 의견</span>
        <span style={{ fontSize: 10, color: "var(--ink-faint)", fontFamily: "var(--mono,monospace)" }}>{review.title}</span>
        {review.needsMeeting && (
          <span style={{ fontSize: 9.5, fontWeight: 600, color: "#9F2F2D", background: "#FBEAE9", border: "1px solid #F3D1D0", borderRadius: 999, padding: "2px 8px", marginLeft: "auto" }}>회의 필요</span>
        )}
      </div>
      <p style={{ margin: 0, fontSize: 11.5, lineHeight: 1.6, color: "var(--ink,#1C1917)" }}>{review.summary}</p>
      {review.actions && review.actions.length > 0 && (
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginTop: 8 }}>
          {review.actions.map((a, i) => (
            <span key={i} style={{ display: "inline-flex", alignItems: "center", gap: 5, fontSize: 10.5, color: "#1F6C9F", background: "#E8F1F9", border: "1px solid #D2E3F1", borderRadius: 999, padding: "3px 9px" }}>
              <svg viewBox="0 0 24 24" width="10" height="10" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M20 6L9 17l-5-5" /></svg>
              {a}
            </span>
          ))}
        </div>
      )}
      {teamsEntries.length > 0 && (
        <div style={{ marginTop: 10, paddingTop: 9, borderTop: "1px dashed #D8E4EF" }}>
          <div style={{ fontSize: 10, fontWeight: 700, color: "var(--ink-faint)", marginBottom: 6 }}>파트별 할 일</div>
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            {teamsEntries.map(([part, items]) => {
              const pc = PART_COLOR[part] ?? { fg: "#57534E", bg: "#F0EFED" };
              return (
                <div key={part} style={{ display: "flex", gap: 7, alignItems: "flex-start" }}>
                  <span style={{ flex: "0 0 auto", fontSize: 10, fontWeight: 700, color: pc.fg, background: pc.bg, borderRadius: 7, padding: "2px 8px", border: "1px solid " + pc.bg }}>{part}</span>
                  <div style={{ display: "flex", gap: 5, flexWrap: "wrap" }}>
                    {items.map((t, j) => {
                      const reg = registered?.(t) ?? false;
                      return (
                        <button key={j} disabled={reg} title={reg ? "이미 부서 워크큐에 일감으로 등록됨" : "클릭하면 부서 워크큐에 일감으로 등록"}
                          onClick={() => onTask?.(t)}
                          style={{ fontSize: 10.5, color: reg ? "#3E8E5A" : "var(--ink,#1C1917)", background: reg ? "#EAF4EE" : "#FFFFFF", border: "1px solid " + (reg ? "#BFE0CC" : "#E3E0DB"), borderRadius: 7, padding: "2px 8px", cursor: onTask && !reg ? "pointer" : "default", textDecoration: reg ? "none" : undefined }}>{reg ? "✓ " + t : t}</button>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
      <button
        onClick={() => onMeeting(review)}
        style={{ marginTop: 10, display: "inline-flex", alignItems: "center", gap: 6, fontSize: 10.5, fontWeight: 600, color: "#1F6C9F", background: "#FFFFFF", border: "1px solid #C9DDF0", borderRadius: 8, padding: "5px 10px", cursor: "pointer" }}
      >
        <svg viewBox="0 0 24 24" width="11" height="11" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="5" width="18" height="16" rx="2"/><path d="M8 3v4M16 3v4M3 10h18M9 15l2 2 4-4"/></svg>
        회의안 생성
      </button>
    </div>
  );
}

function MeetingModal({ review, onClose }: { review: SectionReview; onClose: () => void }) {
  const [schedule, setSchedule] = useState("");
  const [attendees, setAttendees] = useState("");
  const [copied, setCopied] = useState(false);
  // ① LLM/기본 회의안 본문
  const baseDraft = review.meetingDraft && review.meetingDraft.trim().length > 0
    ? review.meetingDraft
    : ["# 회의안", "", "- 목적: " + review.title + " 관련 현안 점검 및 후속 조치 확정", "", "## 안건", "- " + review.summary, "", "## 결정 필요 사항", "", "- 일정과 참석자: 직접 작성"].join("\n");
  // ② 파트별 사전 준비 업무(시스템/기획/품질점검) — 회의 전 미리 준비할 과제를 함께 편성
  const teams = review.teams ?? {};
  const prepLines = Object.entries(teams).map(([part, items]) => "- **" + part + "**: " + items.join(" · ")).join("\n");
  const prepSection = prepLines ? "\n\n## 사전 준비 (파트별 · 회의 전까지)\n" + prepLines : "";
  const draftBody = baseDraft + prepSection;
  const finalMd = draftBody + "\n\n---\n- 일정: " + (schedule || "(작성 필요)") + "\n- 참석자: " + (attendees || "(작성 필요)");
  function copyIt() {
    navigator.clipboard?.writeText(finalMd).then(() => { setCopied(true); setTimeout(() => setCopied(false), 1500); }).catch(() => {});
  }
  return (
    <div style={{ position: "fixed", inset: 0, top: 0, left: 0, width: "100%", height: "100%", background: "rgba(20,16,12,0.45)", zIndex: 60, display: "flex", alignItems: "center", justifyContent: "center", padding: 20 }} onClick={onClose}>
      <div onClick={(e) => e.stopPropagation()} style={{ width: "min(680px, 94vw)", maxHeight: "88vh", display: "flex", flexDirection: "column", background: "#FFFFFF", border: "1px solid #E3E0DB", borderRadius: 14, boxShadow: "0 18px 50px rgba(20,16,12,0.28)", overflow: "hidden" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "14px 16px", borderBottom: "1px solid #EAE7E2", background: "#FAF9F7" }}>
          <Lvl tone="b" size={20} icon="doc" iconSize={10} />
          <div style={{ fontSize: 13, fontWeight: 700, color: "var(--ink,#1C1917)" }}>회의안 (MD) · {review.title}</div>
          <button onClick={onClose} style={{ marginLeft: "auto", fontSize: 18, lineHeight: 1, color: "var(--ink-faint)", background: "none", border: "none", cursor: "pointer" }} aria-label="닫기">×</button>
        </div>
        <div style={{ padding: "6px 16px", background: "#F4F8FB", borderBottom: "1px solid #E3E0DB", display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
          <label style={{ fontSize: 10.5, color: "var(--ink-faint)", display: "flex", alignItems: "center", gap: 6 }}>
            일정
            <input value={schedule} onChange={(e) => setSchedule(e.target.value)} placeholder="예: 9월 18일(금) 10:00" style={{ fontSize: 11, padding: "4px 8px", borderRadius: 6, border: "1px solid #CFE0EF", width: 170 }} />
          </label>
          <label style={{ fontSize: 10.5, color: "var(--ink-faint)", display: "flex", alignItems: "center", gap: 6, flex: "1 1 auto", minWidth: 180 }}>
            참석자
            <input value={attendees} onChange={(e) => setAttendees(e.target.value)} placeholder="예: 팀장, 시스템, 기획, 품질점검" style={{ fontSize: 11, padding: "4px 8px", borderRadius: 6, border: "1px solid #CFE0EF", flex: 1 }} />
          </label>
          <button onClick={copyIt} style={{ fontSize: 11, fontWeight: 600, color: "#1F6C9F", background: "#FFFFFF", border: "1px solid #C9DDF0", borderRadius: 8, padding: "5px 12px", cursor: "pointer" }}>{copied ? "복사됨 ✓" : "회의안 복사"}</button>
        </div>
        <div style={{ flex: 1, overflow: "auto", padding: "14px 18px" }}>
          <MarkdownViewer content={draftBody} />
          <div style={{ marginTop: 10, padding: "8px 10px", fontSize: 10.5, color: "var(--ink-faint)", background: "#F6F5F2", borderRadius: 8, border: "1px dashed #DDD9D2", whiteSpace: "pre-wrap" }}>
            {draftBody}{"\n\n---\n- 일정: " + (schedule || "(작성 필요)") + "\n- 참석자: " + (attendees || "(작성 필요)")}
          </div>
        </div>
      </div>
    </div>
  );
}


/* ─── 메인 페이지 ─── */
/* ─── 메인 페이지 ─── */
type SectionReview = { key: string; title: string; summary: string; actions: string[]; teams?: Record<string, string[]>; needsMeeting?: boolean; meetingDraft?: string };
type DashData = { user: { name: string; role: string; email: string }; dash: ClaimDashboard; reviews: SectionReview[]; isAdmin: boolean };
function reviewsBy(data: DashData | null, key: string) {
  return data?.reviews?.find((r) => r.key === key) ?? null;
}
function curMonth(dash?: ClaimDashboard | null): string {
  const claims = dash?.kpis?.find((k) => k.key === "claims_aug");
  const m = claims?.label?.match(/^(\d+)월/)?.[1];
  return m ? `${m}월` : "이번 달";
}
const PART_COLOR: Record<string, { fg: string; bg: string }> = {
  "시스템": { fg: "#1F6C9F", bg: "#E8F1F9" },
  "기획": { fg: "#8A6116", bg: "#F6EFDF" },
  "품질점검": { fg: "#346538", bg: "#E7F0E6" },
};
export default function Dashboard() {
  const router = useRouter();
  const [data, setData] = useState<DashData | null>(null);
  const [err, setErr] = useState("");
  const [workTasks, setWorkTasks] = useState<any[]>([]);
  const [workStats, setWorkStats] = useState<any>(null);
  useEffect(() => {
    let on = true;
    (async () => {
      try {
        const res = await fetch("/api/dashboard");
        if (res.status === 401) { router.replace("/login"); return; }
        const d = await res.json();
        if (!res.ok || !d?.dash) { if (on) setErr(d?.error ?? "대시보드 데이터를 불러오지 못했습니다."); return; }
        if (on) setData(d);
        if (on) { setWorkTasks(d.workTasks ?? []); setWorkStats(d.workStats ?? null); }
      } catch { if (on) setErr("대시보드 데이터를 불러오지 못했습니다."); }
    })();
    return () => { on = false; };
  }, [router]);

  const loadWork = () => fetch("/api/workqueue").then(r => r.json()).then(d => { setWorkTasks(d.tasks ?? []); setWorkStats(d.stats ?? null); }).catch(() => {});
  const makeTask = (title: string) => { if (workTasks.some((w) => w.title === title)) return; fetch("/api/workqueue", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ title, source: "director_note" }) }).then(loadWork).catch(() => {}); };
  const delTask = (id: string) => fetch(`/api/workqueue/${id}`, { method: "DELETE" }).then(loadWork).catch(() => {});
  const dash = data?.dash;
  const [meeting, setMeeting] = useState<SectionReview | null>(null);
  const [selKpi, setSelKpi] = useState<string | null>(null);
  const selKpiDetail = dash?.kpiDetails?.find((kd: any) => kd.key === selKpi) ?? null;
  return (
    <div className="dab-root">
      {meeting && <MeetingModal review={meeting} onClose={() => setMeeting(null)} />}
      <style>{css}</style>
      <div className="dab-wrap">
        <div className="dab-topbar">
          <div className="dab-title">
            <span className="eyebrow">DEPARTMENT · {dash?.asOf ?? "2026. 9. 3 (목)"}</span>
            <h1>보험금심사기획팀 · 업무 대시보드</h1>
            <p className="sub">팀 KPI 실적과 처리 흐름, 모니터링, 공시·뉴스를 한 화면에서 확인합니다.</p>
          </div>
          <div className="dab-chip">
            <span className="dab-data-note"><Ic name="chart" size={12} />{dash?.dataNote ?? "DATA AS OF 8월 실적"}</span>
            {data?.user && <div className="dab-user"><span className="ava">{(data.user.name ?? "U")[0]}</span><div><b>{data.user.name}</b><span className="role">{data.user.role === "admin" ? "관리자" : "구성원"}</span></div></div>}
          </div>
        </div>
        <div className="dabar"><i />대시보드는 어제 실적 기준 · 매일 09:00 갱신 · 새로고침으로 최신 반영</div>

        {err && <div style={{ background: "#FBE9E9", color: "#9F2F2D", padding: "12px 14px", borderRadius: 10, fontSize: 13, marginBottom: 16 }}>{err}</div>}

        {!dash ? (
          <div style={{ padding: "60px 0", textAlign: "center", color: "var(--ink-faint)" }}>대시보드 로딩 중…</div>
        ) : (
          <>
            <SectionTitle title="오늘의 집중" note="· 9/3(목) 기준 방향" />
            <FocusSection items={dash.focusItems} />

            <SectionTitle title={`핵심 KPI · ${curMonth(dash)} 실적`} note="지급보험금 중심 지표" />
            <KpiCards kpis={dash.kpis} onSelect={(key: string) => setSelKpi(selKpi === key ? null : key)} selected={selKpi} />
            {selKpiDetail && <KpiDetailPanel detail={selKpiDetail} onClose={() => setSelKpi(null)} />}
            <DirectorNote review={reviewsBy(data, "kpi")} onMeeting={(r) => setMeeting(r)} onTask={makeTask} registered={(tt) => workTasks.some((w) => w.title === tt)} />

            <SectionTitle title="지급보험금 처리 흐름" note={`${curMonth(dash)} 실적 · 클릭하면 해당 단계 질문`} />
            <Pipeline pipe={dash.pipeline} flowNote={dash.pipelineFlowNote} qs={[]} />
            <DirectorNote review={reviewsBy(data, "pipeline")} onMeeting={(r) => setMeeting(r)} onTask={makeTask} registered={(tt) => workTasks.some((w) => w.title === tt)} />

            <div className="dab-row g2" style={{ marginTop: 16, alignItems: "stretch" }}>
              <DeadlineCard dash={dash} />
              <WorkQueueCard tasks={workTasks} stats={workStats} reload={loadWork} onDelete={delTask} />
            </div>

            <SectionTitle title="업무 진도 · 모니터링" note={`부서 워크큐 일감 ${workTasks.length}건`} />
            <div className="dab-row g4" style={{ gridTemplateColumns: "repeat(auto-fill,minmax(260px,1fr))" }}>
              {workTasks.length === 0 && <div style={{ color: "var(--ink-faint)", fontSize: 12.5, padding: "14px 2px" }}>등록된 일감이 없습니다. 부서장 의견 항목을 클릭하거나 부서 워크큐에서 일감을 생성하세요.</div>}
              {workTasks.map(t => <MonRow key={t.id} t={t} onDelete={delTask} />)}
            </div>
            <DirectorNote review={reviewsBy(data, "monitor")} onMeeting={(r) => setMeeting(r)} onTask={makeTask} registered={(tt) => workTasks.some((w) => w.title === tt)} />

            <div className="dab-row g2" style={{ marginTop: 16, alignItems: "stretch" }}>
              <NewsCard fss={dash.fssNews} ins={dash.insNews} />
              <ChatPanel dash={dash} />
            </div>

                      </>
        )}
      </div>
      <style>{"@media(max-width:720px){.dab-row.g2{grid-template-columns:1fr}}@media(max-width:900px){.dab-row.g4{grid-template-columns:1fr 1fr}}"}</style>
    </div>
  );
}
