import { connection } from "next/server";
import { prisma } from "@/server/db";

// Liveness + database check, used by deploy smoke tests.
export async function GET() {
  await connection();
  try {
    await prisma.$queryRaw`SELECT 1`;
    return Response.json({ ok: true, database: "up" });
  } catch {
    return Response.json({ ok: false, database: "down" }, { status: 503 });
  }
}
