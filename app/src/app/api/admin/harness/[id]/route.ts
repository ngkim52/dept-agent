import { NextRequest } from "next/server";
import { requireUser, requireAdmin, jsonError, HttpError } from "@/lib/auth/http";
import { getEntry, updatePrompt, updateSkill, updateMemory, setActive, listVersions, deleteEntry } from "@/lib/harness/store";
import type { HarnessEntryType } from "@/lib/harness/store";

const TYPES = new Set(["prompt", "skill", "memory"]);

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireUser(req); requireAdmin(user);
    const { id } = await params;
    const type = (req.nextUrl.searchParams.get("type") ?? "") as HarnessEntryType;
    if (!TYPES.has(type)) throw new HttpError(400, "type 필요");
    const item = await getEntry(type, id);
    if (!item) throw new HttpError(404, "항목이 없습니다.");
    const versions = await listVersions(type, id);
    return Response.json({ item, versions });
  } catch (e) { return jsonError(e); }
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireUser(req); requireAdmin(user);
    const { id } = await params;
    const type = (req.nextUrl.searchParams.get("type") ?? "") as HarnessEntryType;
    if (!TYPES.has(type)) throw new HttpError(400, "type 필요");
    const body = await req.json().catch(() => ({}));
    let item;
    if (type === "prompt") item = await updatePrompt(id, body, user.id);
    else if (type === "skill") item = await updateSkill(id, body, user.id);
    else item = await updateMemory(id, body, user.id);
    return Response.json({ item });
  } catch (e) { return jsonError(e); }
}

// 활성/비활성 토글 (소프트 disable) 또는 하드 삭제 (?hard=1 — 관리자 의도적 삭제)
export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireUser(req); requireAdmin(user);
    const { id } = await params;
    const type = (req.nextUrl.searchParams.get("type") ?? "") as HarnessEntryType;
    if (!TYPES.has(type)) throw new HttpError(400, "type 필요");
    const hard = req.nextUrl.searchParams.get("hard") === "1";
    if (hard) {
      const result = await deleteEntry(type, id, user.id);
      return Response.json(result);
    }
    const active = req.nextUrl.searchParams.get("active");
    // ?active=false → 비활성, ?active=true → 재활성. 생략 시 false
    const item = await setActive(type, id, active !== "true" ? false : true, user.id);
    return Response.json({ item });
  } catch (e) { return jsonError(e); }
}
