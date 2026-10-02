import { NextRequest } from "next/server";
import { requireUser, jsonError, HttpError } from "@/lib/auth/http";
import { listAllPersonas, upsertPersona, resetPersona } from "@/lib/debate/store";
import { getBuiltinSeed } from "@/lib/debate/personas";

// 토론방 페르소나 — 조회/생성/수정/되돌리기
function parseBody(body: Record<string, unknown>) {
  const s = (k: string, max = 400) => (body[k] === undefined || body[k] === null ? undefined : String(body[k]).slice(0, max).trim());
  const color = String(body.color ?? "").trim();
  return {
    name: s("name", 40),
    emoji: s("emoji", 4),
    role: s("role", 80),
    stance: s("stance", 400),
    expertise: s("expertise", 400),
    goal: s("goal", 400),
    redLine: s("redLine", 400),
    tone: s("tone", 120),
    note: s("note", 4000),
    color: /^#[0-9A-Fa-f]{6}$/.test(color) ? color : undefined,
  };
}

export async function GET(req: NextRequest) {
  try {
    await requireUser(req);
    const personas = await listAllPersonas();
    return Response.json({ personas: personas.map((p) => ({ ...p, isBuiltinKey: !!getBuiltinSeed(p.key) })) });
  } catch (e) { return jsonError(e); }
}

// POST — 커스텀 페르소나 생성
export async function POST(req: NextRequest) {
  try {
    const user = await requireUser(req);
    const body = await req.json().catch(() => ({}));
    const parsed = parseBody(body);
    if (!parsed.name) throw new HttpError(400, "페르소나 이름이 필요합니다.");
    const persona = await upsertPersona({ ...parsed, name: parsed.name, createdBy: user.id });
    return Response.json({ persona }, { status: 201 });
  } catch (e) { return jsonError(e); }
}

// PUT — 수정(기본 페르소나 덮어쓰기 포함). key 필요
export async function PUT(req: NextRequest) {
  try {
    const user = await requireUser(req);
    const body = await req.json().catch(() => ({}));
    const key = String(body.key ?? "").trim();
    if (!key) throw new HttpError(400, "key 가 필요합니다.");
    const parsed = parseBody(body);
    if (!parsed.name) throw new HttpError(400, "페르소나 이름이 필요합니다.");
    const persona = await upsertPersona({ ...parsed, name: parsed.name, key, createdBy: user.id });
    return Response.json({ persona });
  } catch (e) { return jsonError(e); }
}

// DELETE — 커스텀 삭제 / 기본 페르소나는 기본값 복원. ?key=
export async function DELETE(req: NextRequest) {
  try {
    await requireUser(req);
    const key = String(req.nextUrl.searchParams.get("key") ?? "").trim();
    if (!key) throw new HttpError(400, "key 가 필요합니다.");
    await resetPersona(key);
    const personas = await listAllPersonas();
    const persona = personas.find((p) => p.key === key) ?? null;
    return Response.json({ ok: true, restored: !!getBuiltinSeed(key), persona });
  } catch (e) { return jsonError(e); }
}
