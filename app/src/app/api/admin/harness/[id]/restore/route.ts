import { NextRequest } from "next/server";
import { requireUser, requireAdmin, jsonError } from "@/lib/auth/http";
import { restoreVersion } from "@/lib/harness/store";

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireUser(req); requireAdmin(user);
    const { id } = await params; // version id
    const item = await restoreVersion(id, user.id);
    return Response.json({ item });
  } catch (e) { return jsonError(e); }
}
