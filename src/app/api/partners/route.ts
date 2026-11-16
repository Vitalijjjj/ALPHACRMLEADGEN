import { NextRequest, NextResponse } from "next/server";
import { requireAccess, visibleLeadsWhere } from "@/lib/accessServer";
import { db, ensureSchema } from "@/lib/db";
import { partnerFunnels, resolveStage } from "@/lib/crmSettings";

// Partners (deals of the «Партнери» funnel) — for the «Партнер» picker of a lead.
// `?of=<partnerId>` — the leads this partner passed (for the partner's card).
export async function GET(req: NextRequest) {
  const gate = await requireAccess();
  if ("error" in gate) return gate.error;
  const { settings, access } = gate;
  await ensureSchema();
  const visible = visibleLeadsWhere(access, settings);
  const sel = { id: true, number: true, name: true, projectName: true, phone: true, status: true, funnelId: true, closeReason: true, amount: true, currency: true, createdAt: true, closedAt: true } as const;
  const stage = (l: { status: string; funnelId: string | null; closeReason: string | null }) => {
    const r = resolveStage(settings, l);
    return { label: r.stage.label, color: r.stage.color, kind: r.stage.kind, funnel: r.funnel.name };
  };
  const of = req.nextUrl.searchParams.get("of");
  if (of) {
    const rows = await db.lead.findMany({ where: visible ? { AND: [visible, { partnerId: of }] } : { partnerId: of }, orderBy: { createdAt: "desc" }, select: sel });
    return NextResponse.json(rows.map((l) => ({ ...l, stage: stage(l) })));
  }
  const ids = partnerFunnels(settings).map((f) => f.id);
  const rows = await db.lead.findMany({ where: { funnelId: { in: ids.length ? ids : ["-"] } }, orderBy: { name: "asc" }, select: sel });
  return NextResponse.json(rows.map((l) => ({ id: l.id, number: l.number, name: l.name, phone: l.phone, stage: stage(l) })));
}
