import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { getFx } from "@/lib/fxServer";

// GET — stored NBU rate (fetched once after server start). POST — ask NBU again («Оновити»).
export async function GET() {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  return NextResponse.json(await getFx());
}

export async function POST() {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  try {
    return NextResponse.json(await getFx({ refresh: true }));
  } catch (e) {
    return NextResponse.json({ error: "НБУ не відповідає", detail: String(e) }, { status: 502 });
  }
}
