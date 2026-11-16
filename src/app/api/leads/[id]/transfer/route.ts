import { NextRequest, NextResponse } from "next/server";
import { db, ensureSchema } from "@/lib/db";
import { getCrmSettings } from "@/lib/crmSettingsServer";
import { canLead, forbidden, requireAccess } from "@/lib/accessServer";
import { runTransfer } from "@/lib/transferServer";

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const gate = await requireAccess();
  if ("error" in gate) return gate.error;
  const { access } = gate;
  const { id } = await params;

  try {
    const body = await req.json();
    await ensureSchema();
    const settings = await getCrmSettings();
    const process = settings.processes.find((p) => p.id === body.processId);
    if (!process) return NextResponse.json({ error: "Бізнес-процес не знайдено" }, { status: 400 });
    const source = settings.funnels.find((f) => f.id === process.fromFunnelId)!;
    const target = settings.funnels.find((f) => f.id === process.toFunnelId)!;

    const lead = await db.lead.findUnique({ where: { id } });
    if (!lead) return NextResponse.json({ error: "Not found" }, { status: 404 });
    const leadFunnel = settings.funnels.find((f) => f.id === lead.funnelId) ?? settings.funnels[0];
    if (leadFunnel.id !== source.id) {
      return NextResponse.json({ error: `Цей процес працює з воронки «${source.name}»` }, { status: 400 });
    }
    if (!canLead(access, settings, lead.funnelId, "view")) return forbidden("Немає доступу до цієї воронки");
    if (!canLead(access, settings, target.id, "create")) return forbidden(`Немає права додавати угоди у воронку «${target.name}»`);
    if (process.sourceStageId && !canLead(access, settings, lead.funnelId, "edit")) return forbidden("Немає права редагувати угоди цієї воронки");

    const created = await runTransfer(settings, process, lead);
    return NextResponse.json({ id: created.id, number: created.number });
  } catch (e) {
    console.error("POST /api/leads/[id]/transfer:", e);
    return NextResponse.json({ error: "DB error", detail: String(e) }, { status: 500 });
  }
}
