import { NextRequest, NextResponse } from "next/server";
import type { Prisma } from "@prisma/client";
import { requireAccess } from "@/lib/accessServer";
import { db, ensureSchema } from "@/lib/db";
import { getFx } from "@/lib/fxServer";
import { toEur } from "@/lib/currency";
import { getAdSettings } from "@/lib/adTypesServer";
import { findType } from "@/lib/adTypes";
import { milestones } from "@/lib/leadMilestones";
import type { SaleRow } from "@/lib/salesReport";

const ymd = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

// «Продажі»: every deal sold in the range (on the DAY OF THE SALE, whenever the lead came) + how long it took.
export async function GET(req: NextRequest) {
  const gate = await requireAccess("dash_sales");
  if ("error" in gate) return gate.error;
  const { settings: crm } = gate;
  await ensureSchema();
  const sp = req.nextUrl.searchParams;
  const from = new Date(`${sp.get("from") ?? ymd(new Date())}T00:00:00`);
  const toDay = new Date(`${sp.get("to") ?? ymd(new Date())}T00:00:00`);
  const to = new Date(toDay.getFullYear(), toDay.getMonth(), toDay.getDate() + 1);

  const [ads, fx] = await Promise.all([getAdSettings(), getFx()]);
  const payFunnels = crm.funnels.filter((f) => f.payments).map((f) => f.id);
  const notProjects: Prisma.LeadWhereInput = payFunnels.length ? { OR: [{ funnelId: null }, { funnelId: { notIn: payFunnels } }] } : {};
  const leads = await db.lead.findMany({
    where: { AND: [notProjects, { OR: [{ closedAt: { gte: from, lt: to } }, { activities: { some: { type: "STATUS_CHANGE", createdAt: { gte: from, lt: to } } } }] }] },
    select: {
      id: true, number: true, name: true, projectName: true, amount: true, currency: true, source: true, sourceDetail: true,
      status: true, closeReason: true, funnelId: true, createdAt: true, closedAt: true,
      activities: { where: { type: "STATUS_CHANGE" }, select: { content: true, createdAt: true } },
    },
  });

  const DAY = 86_400_000;
  const sales: SaleRow[] = [];
  for (const l of leads) {
    const m = milestones(crm, l);
    if (!m.wAt || m.wAt < from || m.wAt >= to) continue;
    const type = findType(ads, l.source);
    sales.push({
      id: l.id, n: l.number, name: l.projectName || l.name,
      src: type?.name ?? (l.source?.trim() || "Не вказано"), ad: !!type, camp: type ? l.sourceDetail?.trim() || null : null,
      eur: Math.round(toEur(l.amount, l.currency, fx)),
      created: l.createdAt.toISOString(), kp: m.pAt?.toISOString() ?? null, sold: m.wAt.toISOString(),
      days: Math.max(0, (m.wAt.getTime() - l.createdAt.getTime()) / DAY),
      kpDays: m.pAt ? Math.max(0, (m.wAt.getTime() - m.pAt.getTime()) / DAY) : null,
    });
  }
  sales.sort((a, b) => b.sold.localeCompare(a.sold));
  return NextResponse.json({ from: ymd(from), to: ymd(toDay), adTypes: ads.types.map((t) => ({ name: t.name, color: t.color })), sales });
}
