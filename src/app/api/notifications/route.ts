import { NextResponse } from "next/server";
import type { Prisma } from "@prisma/client";
import { db, ensureSchema } from "@/lib/db";
import { requireAccess, visibleLeadsWhere } from "@/lib/accessServer";
import { canNotify } from "@/lib/access";
import { resolveStage } from "@/lib/crmSettings";

const leadSelect = { id: true, number: true, name: true, phone: true, projectName: true, source: true, status: true, funnelId: true, closeReason: true, amount: true, currency: true, createdAt: true } as const;

// The bell: new leads, new projects in work, client payments due — only the kinds the user's role gets.
export async function GET() {
  const gate = await requireAccess();
  if ("error" in gate) return gate.error;
  const { access, settings } = gate;
  await ensureSchema();
  const visible = visibleLeadsWhere(access, settings);
  const where = (w: Prisma.LeadWhereInput): Prisma.LeadWhereInput => (visible ? { AND: [visible, w] } : w);
  const pay = settings.funnels.find((f) => f.payments) ?? null;
  const payIds = settings.funnels.filter((f) => f.payments).map((f) => f.id);
  // funnels with their own tab / hidden from the bell (set in the funnel's settings) — not in «Ліди»
  const tabFunnels = settings.funnels.filter((f) => !f.payments && f.notify.mode === "tab");
  const stageOf = (l: { status: string; funnelId: string | null; closeReason: string | null }) => {
    const { stage } = resolveStage(settings, l);
    return { label: stage.label, color: stage.color, kind: stage.kind };
  };

  // «нові» = still on the first stage of their funnel (Новий лід / Новий проєкт) — taken into work → gone from the bell
  const firstOf = (f: (typeof settings.funnels)[number]) => f.stages.find((st) => st.kind === "active")?.id ?? "-";
  const isNew = (fs: (typeof settings.funnels)[number][]): Prisma.LeadWhereInput[] => fs.map((f) => ({ funnelId: f.id, status: firstOf(f) }));
  const leadFunnels = settings.funnels.filter((f) => !f.payments && f.notify.mode === "leads");
  // leads without a funnel belong to the first funnel
  const noFunnel: Prisma.LeadWhereInput[] = settings.funnels[0] && !settings.funnels[0].payments && settings.funnels[0].notify.mode === "leads"
    ? [{ funnelId: null, status: firstOf(settings.funnels[0]) }] : [];
  // payments to ask for: overdue, today and tomorrow
  const t = new Date();
  const afterTomorrow = new Date(t.getFullYear(), t.getMonth(), t.getDate() + 2);

  const [leads, projects, payments, tabbed] = await Promise.all([
    canNotify(access, "leads") && (leadFunnels.length || noFunnel.length)
      ? db.lead.findMany({ where: where({ OR: [...isNew(leadFunnels), ...noFunnel] }), orderBy: { createdAt: "desc" }, take: 50, select: leadSelect })
      : [],
    canNotify(access, "projects") && pay
      ? db.lead.findMany({ where: where({ OR: isNew(settings.funnels.filter((f) => f.payments)) }), orderBy: { createdAt: "desc" }, take: 50, select: leadSelect })
      : [],
    canNotify(access, "payments")
      ? db.paymentStage.findMany({
          where: { paidAt: null, dueDate: { lt: afterTomorrow }, OR: [{ leadId: null }, { lead: visible ? { AND: [visible, { funnelId: { in: payIds } }] } : { funnelId: { in: payIds } } }] },
          orderBy: { dueDate: "asc" }, take: 50,
          select: { id: true, title: true, amount: true, currency: true, payer: true, dueDate: true, lead: { select: leadSelect } },
        })
      : [],
    canNotify(access, "leads") && tabFunnels.length
      ? db.lead.findMany({ where: where({ OR: isNew(tabFunnels) }), orderBy: { createdAt: "desc" }, take: 60, select: leadSelect })
      : [],
  ]);


  return NextResponse.json({
    // own tabs: «Апсейл», «Підписка»… — their new deals
    funnels: tabFunnels.map((f) => ({
      id: f.id, label: f.notify.label || f.name,
      leads: tabbed.filter((l) => l.funnelId === f.id).map((l) => ({ ...l, stage: stageOf(l) })),
    })),
    notify: access.notify,
    leads: leads.map((l) => ({ ...l, stage: stageOf(l) })),
    projects: projects.map((l) => ({ ...l, stage: stageOf(l) })),
    payments,
  });
}
