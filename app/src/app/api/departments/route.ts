import { NextRequest } from "next/server";
import { db, schema } from "@/lib/db";
import { eq } from "drizzle-orm";
import { requireUser, jsonError } from "@/lib/auth/http";

export async function GET(req: NextRequest) {
  try {
    await requireUser(req);
    const deps = await db.query.departments.findMany({ where: eq(schema.departments.isActive, true) });
    return Response.json({ departments: deps });
  } catch (e) { return jsonError(e); }
}
