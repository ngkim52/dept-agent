import { NextRequest } from "next/server";
import { destroySession } from "@/lib/auth/session";
import { config } from "@/lib/config";
import { jsonError } from "@/lib/auth/http";

export async function POST(req: NextRequest) {
  try {
    const token = req.cookies.get(config.sessionCookieName)?.value;
    if (token) await destroySession(token);
    const res = Response.json({ ok: true });
    res.headers.set("Set-Cookie", `${config.sessionCookieName}=; HttpOnly; SameSite=Lax; Path=/; Max-Age=0`);
    return res;
  } catch (e) { return jsonError(e); }
}
