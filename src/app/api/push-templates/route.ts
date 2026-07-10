import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";

const DEFAULT_TEMPLATES = [
  `Я так розумію, що стався певний форс-мажор або зсув у графіку, і вам не вдалося підключитися

Підкажіть, будь ласка, на який час сьогодні або, можливо, завтра вам було б зручно вийти на дзвінок`,

  `Дееень добрий!
Розумію, що можете бути зайняті, тож напишіть, будь ласка, як тільки Вам буде зручно

Якщо, звісно, це Вам все ще цікаво 🙂

Не хочу надокучати, якщо тема вже неактуальна`,

  `Привіт-привіт! Так і не отримав відповідь, тому нагадую про себе🫶`,
];

// The table is provisioned lazily because prod builds no longer run `prisma db push`.
async function ensureTable() {
  await db.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS "PushTemplate" (
      "id" TEXT NOT NULL,
      "title" TEXT,
      "text" TEXT NOT NULL,
      "sortOrder" INTEGER NOT NULL DEFAULT 0,
      "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
      "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
      CONSTRAINT "PushTemplate_pkey" PRIMARY KEY ("id")
    )
  `);
}

export async function GET() {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    await ensureTable();
    let items = await db.pushTemplate.findMany({ orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }] });
    if (items.length === 0) {
      await db.pushTemplate.createMany({
        data: DEFAULT_TEMPLATES.map((text, i) => ({ text, sortOrder: i })),
      });
      items = await db.pushTemplate.findMany({ orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }] });
    }
    return NextResponse.json(items);
  } catch (e) {
    console.error("GET /api/push-templates:", e);
    return NextResponse.json({ error: "DB error", detail: String(e) }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const body = await req.json();
    const text = (body.text ?? "").trim();
    if (!text) return NextResponse.json({ error: "Text is required" }, { status: 400 });

    await ensureTable();
    const max = await db.pushTemplate.aggregate({ _max: { sortOrder: true } });
    const item = await db.pushTemplate.create({
      data: {
        title: body.title?.trim() || null,
        text,
        sortOrder: (max._max.sortOrder ?? -1) + 1,
      },
    });
    return NextResponse.json(item, { status: 201 });
  } catch (e) {
    console.error("POST /api/push-templates:", e);
    return NextResponse.json({ error: "DB error", detail: String(e) }, { status: 500 });
  }
}
