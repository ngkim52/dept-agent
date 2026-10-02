import { NextRequest } from "next/server";
import { requireUser, jsonError, HttpError } from "@/lib/auth/http";
import { getSession } from "@/lib/debate/store";
import { readDebateReportMd } from "@/lib/debate/storage";

// GET /api/debate/[id]/report — 최종 보고서 MD (?download=1 이면 파일 다운로드)
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    await requireUser(req);
    const { id } = await params;
    const session = await getSession(id);
    if (!session) throw new HttpError(404, "토론 세션을 찾을 수 없습니다.");
    const md = await readDebateReportMd(id);
    if (!md) throw new HttpError(404, "아직 최종 보고서가 생성되지 않았습니다.");

    if (req.nextUrl.searchParams.get("download") === "1") {
      const safe = (session.title || id).slice(0, 30).replace(/[^\w가-힣\-]+/g, "_") || id;
      const filename = `debate-${safe}.md`;
      // ASCII 폴백(filename=)을 함께 보낸다 — filename* 만 보내면 일부 브라우저가 무시하고
      // 원문(markdown)을 탭에 그대로 표시할 수 있다.
      const asciiName = `debate-${id}.md`;
      return new Response(md, {
        headers: {
          "Content-Type": "text/markdown; charset=utf-8",
          "Content-Disposition": `attachment; filename="${asciiName}"; filename*=UTF-8''${encodeURIComponent(filename)}`,
        },
      });
    }
    return Response.json({ md, verdict: session.verdict, title: session.title, reportPath: session.reportPath });
  } catch (e) { return jsonError(e); }
}
