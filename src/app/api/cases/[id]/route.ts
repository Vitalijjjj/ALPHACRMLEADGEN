import { NextRequest, NextResponse } from "next/server";
import { requireAccess } from "@/lib/accessServer";
import { db, ensureSchema } from "@/lib/db";
import { WIN_ID } from "@/lib/crmSettings";
import { normUrl } from "@/lib/caseUrl";

type Ctx = { params: Promise<{ id: string }> };
const txt = (v: unknown) => (typeof v === "string" && v.trim() ? v.trim() : null);

// edit a hand-added case
export async function PATCH(req: NextRequest, { params }: Ctx) {
  const gate = await requireAccess("cases");
  if ("error" in gate) return gate.error;
  await ensureSchema();
  const { id } = await params;
  const b = await req.json().catch(() => ({}));
  const data: { url?: string; title?: string | null; niche?: string | null; geo?: string | null } = {};
  if (b.url !== undefined) { const u = normUrl(b.url); if (!u) return NextResponse.json({ error: "Вкажи посилання" }, { status: 400 }); data.url = u; }
  if (b.title !== undefined) data.title = txt(b.title);
  if (b.niche !== undefined) data.niche = txt(b.niche);
  if (b.geo !== undefined) data.geo = txt(b.geo);
  const c = await db.caseLink.update({ where: { id }, data }).catch(() => null);
  if (!c) return NextResponse.json({ error: "Кейс не знайдено" }, { status: 404 });
  return NextResponse.json(c);
}

// remove: a hand-added case is deleted, a project's case just loses its link
export async function DELETE(req: NextRequest, { params }: Ctx) {
  const gate = await requireAccess("cases");
  if ("error" in gate) return gate.error;
  await ensureSchema();
  const { id } = await params;
  if (req.nextUrl.searchParams.get("lead")) await db.lead.update({ where: { id }, data: { caseUrl: null } }).catch(() => null);
  else await db.caseLink.delete({ where: { id } }).catch(() => null);
  return NextResponse.json({ ok: true });
}

// «Зв'язати з проєктом» ({ leadId }) or «Створити новий проєкт» ({ create: true }) — the link moves into the deal
export async function POST(req: NextRequest, { params }: Ctx) {
  const gate = await requireAccess("cases");
  if ("error" in gate) return gate.error;
  await ensureSchema();
  const { id } = await params;
  const b = await req.json().catch(() => ({}));
  const c = await db.caseLink.findUnique({ where: { id } });
  if (!c) return NextResponse.json({ error: "Кейс не знайдено" }, { status: 404 });

  if (b.leadId) {
    const lead = await db.lead.findUnique({ where: { id: String(b.leadId) }, select: { id: true, number: true, niche: true, geo: true } });
    if (!lead) return NextResponse.json({ error: "Проєкт не знайдено" }, { status: 404 });
    await db.$transaction([
      // the deal keeps its own niche / city; the case only fills empty ones
      db.lead.update({ where: { id: lead.id }, data: { caseUrl: c.url, niche: lead.niche?.trim() ? undefined : c.niche, geo: lead.geo?.trim() ? undefined : c.geo } }),
      db.caseLink.delete({ where: { id } }),
    ]);
    return NextResponse.json({ ok: true, number: lead.number });
  }

  if (b.create) {
    // a finished project from before the CRM: created right in «Виграш» of «Операційки»
    const f = gate.settings.funnels.find((x) => x.payments);
    if (!f) return NextResponse.json({ error: "Немає воронки проєктів" }, { status: 400 });
    const title = txt(b.title) ?? c.title ?? c.url.replace(/^https?:\/\/(www\.)?/i, "").replace(/\/.*$/, "");
    const [lead] = await db.$transaction([
      db.lead.create({ data: { name: txt(b.client) ?? "", projectName: title, funnelId: f.id, status: WIN_ID, closedAt: new Date(), niche: c.niche, geo: c.geo, caseUrl: c.url, source: "Кейс" } }),
      db.caseLink.delete({ where: { id } }),
    ]);
    await db.activity.create({ data: { leadId: lead.id, type: "NOTE", content: `Проєкт створено з «Кейсів»: ${c.url}` } }).catch(() => null);
    return NextResponse.json({ ok: true, number: lead.number });
  }
  return NextResponse.json({ error: "Нічого не вибрано" }, { status: 400 });
}
