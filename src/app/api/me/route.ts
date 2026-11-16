import { NextResponse } from "next/server";
import { getAccess, unauthorized } from "@/lib/accessServer";

// Current user and what they may do (sidebar, page guard, funnel list, buttons).
export async function GET() {
  const access = await getAccess();
  if (!access) return unauthorized();
  return NextResponse.json(access);
}
