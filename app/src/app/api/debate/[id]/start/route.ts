import { NextRequest, after } from "next/server";
import { requireUser, jsonError, HttpError } from "@/lib/auth/http";
import { getSession } from "@/lib/debate/store";
import { runDebate } from "@/lib/debate/engine";

// 같은 세션에 대해 실행 루프가 두 번 돌지 않도록 하는 프로세스 내 가드.
// (연속 클릭/중복 요청 시 발언이 중복 생성되는 것을 막는다)
const inFlight = new Set<string>();

// POST /api/debate/[id]/start — 백그라운드로 토론 실행 시작
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    await requireUser(req);
    const { id } = await params;
    const session = await getSession(id);
    if (!session) throw new HttpError(404, "토론 세션을 찾을 수 없습니다.");
    if (session.status === "running" || inFlight.has(id)) {
      return Response.json({ started: false, reason: "already-running", status: "running" });
    }
    if (session.status === "finished" || session.status === "stopped") {
      return Response.json({ started: false, reason: "already-ended", status: session.status });
    }

    inFlight.add(id);
    const run = () =>
      runDebate(id)
        .catch((e) => console.error("[debate] 실행 실패:", (e as Error).message))
        .finally(() => inFlight.delete(id));
    try {
      after(run);
    } catch {
      void run(); // after 미지원 환경(테스트 등) 폴백
    }
    return Response.json({ started: true, status: "running" }, { status: 202 });
  } catch (e) { return jsonError(e); }
}
