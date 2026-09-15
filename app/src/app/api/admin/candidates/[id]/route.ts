import { NextRequest } from "next/server";
import { requireUser, requireAdmin, jsonError, HttpError } from "@/lib/auth/http";
import { resolveCandidate, applyCandidate, getCandidate } from "@/lib/harness/review";

// PATCH /api/admin/candidates/[id]  body: { decision: "reject"|"apply"|"edited", adminNote?, overrides? }
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireUser(req); requireAdmin(user);
    const { id } = await params;
    const body = await req.json().catch(() => ({}));
    const decision = body.decision;
    if (decision === "reject") {
      const cand = await resolveCandidate(id, { status: "rejected", adminNote: body.adminNote, resolvedBy: user.id });
      return Response.json({ candidate: cand });
    }
    if (decision === "apply" || decision === "edited") {
      const result = await applyCandidate(id, user.id, body.overrides);
      return Response.json(result);
    }
    throw new HttpError(400, "decision 필요 (reject|apply|edited)");
  } catch (e) { return jsonError(e); }
}

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireUser(req); requireAdmin(user);
    const { id } = await params;
    const candidate = await getCandidate(id);
    if (!candidate) throw new HttpError(404, "후보가 없습니다.");
    return Response.json({ candidate });
  } catch (e) { return jsonError(e); }
}
