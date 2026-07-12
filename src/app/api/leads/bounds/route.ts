import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";

// Межі бази лідів: дата першого та останнього ліда (для пресету «Весь час»)
export async function GET() {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const agg = await db.lead.aggregate({ _min: { createdAt: true }, _max: { createdAt: true } });
    return NextResponse.json({
      first: agg._min.createdAt,
      last: agg._max.createdAt,
    });
  } catch (e) {
    console.error("GET /api/leads/bounds:", e);
    return NextResponse.json({ error: "DB error" }, { status: 500 });
  }
}
