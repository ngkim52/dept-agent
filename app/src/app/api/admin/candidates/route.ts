import { NextRequest } from "next/server";
import { requireUser, requireAdmin, jsonError, HttpError } from "@/lib/auth/http";
import { listCandidates, createCandidate } from "@/lib/harness/review";

const ACTIONS = new Set(["create_skill","update_skill","create_prompt","update_prompt","create_memory","update_memory"]);

export async function GET(req: NextRequest) {
  try {
    const user = await requireUser(req); requireAdmin(user);
    const personaKey = req.nextUrl.searchParams.get("personaKey") ?? undefined;
    const status = (req.nextUrl.searchParams.get("status") ?? undefined) as any;
    const candidates = await listCandidates({ personaKey, status });
    return Response.json({ candidates });
  } catch (e) { return jsonError(e); }
}

export async function POST(req: NextRequest) {
  try {
    const user = await requireUser(req); requireAdmin(user);
    const body = await req.json().catch(() => ({}));
    if (!body.proposedContent) throw new HttpError(400, "proposedContent 필요");
    if (!ACTIONS.has(body.action)) throw new HttpError(400, "action 필요");
    const cand = await createCandidate({
      personaKey: String(body.personaKey ?? "claims-planning"),
      sourceKind: body.sourceKind ?? "admin_chat", sourceId: String(body.sourceId ?? "manual"),
      summary: body.summary, action: body.action, targetTitle: body.targetTitle,
      proposedContent: String(body.proposedContent), confidence: typeof body.confidence === "number" ? body.confidence : 0.9,
    });
    return Response.json({ candidate: cand }, { status: 201 });
  } catch (e) { return jsonError(e); }
}
