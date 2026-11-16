import { NextRequest, NextResponse } from "next/server";
import type { Prisma } from "@prisma/client";
import { requireAccess } from "@/lib/accessServer";
import { db, ensureSchema } from "@/lib/db";
import { getFx } from "@/lib/fxServer";
import { toEur } from "@/lib/currency";
import { resolveStage } from "@/lib/crmSettings";
import { projectProgress } from "@/lib/projectProgress";

const DAY = 86_400_000;
const mk = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
const clean = (s: string | null) => (s ?? "").trim().replace(/\s+/g, " ");
const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

// «Instagram»: numbers to show potential clients — projects done / in work, launch time, niches, cities, fresh cases.
export async function GET(req: NextRequest) {
  const gate = await requireAccess("dash_story");
  if ("error" in gate) return gate.error;
  const { settings: crm } = gate;
  await ensureSchema();
  const sp = req.nextUrl.searchParams;
  const now = new Date();
  const from = sp.get("from") ? new Date(`${sp.get("from")}T00:00:00`) : new Date(2000, 0, 1);
  const to = sp.get("to") ? new Date(`${sp.get("to")}T23:59:59.999`) : now;

  const pay = crm.funnels.filter((f) => f.payments).map((f) => f.id);
  const isProject: Prisma.LeadWhereInput = { funnelId: { in: pay.length ? pay : ["-"] } };
  const isLead: Prisma.LeadWhereInput = pay.length ? { OR: [{ funnelId: null }, { funnelId: { notIn: pay } }] } : {};
  const [fx, projects, leads, sold, freeCases] = await Promise.all([
    getFx(),
    db.lead.findMany({
      where: isProject,
      select: { id: true, number: true, name: true, projectName: true, status: true, funnelId: true, closeReason: true, createdAt: true, closedAt: true,
        niche: true, geo: true, caseUrl: true, tasks: { where: { status: "DONE", autoRuleId: { not: null } }, select: { autoStage: true } } },
    }),
    db.lead.findMany({ where: { AND: [isLead, { createdAt: { gte: from, lte: to } }] }, select: { status: true } }),
    // sales of the sales funnel — clients, the average check, repeat clients
    db.lead.findMany({ where: { AND: [isLead, { status: "WON" }] }, select: { phone: true, amount: true, currency: true, closedAt: true, niche: true, geo: true } }),
    db.caseLink.findMany({ where: { createdAt: { gte: from, lte: to } }, orderBy: { createdAt: "desc" }, take: 6 }),
  ]);

  const inP = (d: Date | null) => !!d && d >= from && d <= to;
  const kind = (p: (typeof projects)[number]) => resolveStage(crm, p).stage.kind;
  const active = projects.filter((p) => kind(p) === "active");
  const done = projects.filter((p) => kind(p) === "win");
  const doneP = done.filter((p) => inP(p.closedAt));
  const days = (xs: typeof done) => { const v = xs.filter((p) => p.closedAt).map((p) => (p.closedAt!.getTime() - p.createdAt.getTime()) / DAY); return v.length ? v.reduce((a, b) => a + b, 0) / v.length : null; };
  const fastest = done.filter((p) => p.closedAt).map((p) => (p.closedAt!.getTime() - p.createdAt.getTime()) / DAY).sort((a, b) => a - b)[0] ?? null;
  let prog = 0, progN = 0;
  for (const p of active) {
    const pr = projectProgress(crm, { status: p.status, funnelId: p.funnelId, doneHere: p.tasks.filter((t) => t.autoStage === p.status).length });
    if (pr) { prog += pr.pct; progN++; }
  }

  // niches and cities — of the projects and of the sales (lower-case grouping, nice capitalised label)
  const group = (vals: string[]) => {
    const m = new Map<string, { label: string; n: number }>();
    for (const v of vals.map(clean).filter(Boolean)) { const k = v.toLowerCase(); const c = m.get(k) ?? { label: cap(v), n: 0 }; c.n++; m.set(k, c); }
    return [...m.values()].sort((a, b) => b.n - a.n);
  };
  // of the period: projects started or delivered in it + sales of it
  const soldP = sold.filter((s) => inP(s.closedAt));
  const projP = projects.filter((p) => inP(p.createdAt) || inP(p.closedAt));
  const niches = group([...projP.map((p) => p.niche ?? ""), ...soldP.map((s) => s.niche ?? "")]);
  const cities = group([...projP.map((p) => p.geo ?? ""), ...soldP.map((s) => s.geo ?? "")]);
  const priced = soldP.filter((s) => s.amount);
  const phones = new Map<string, number>();
  for (const s of sold) { const ph = (s.phone ?? "").replace(/\D/g, "").slice(-9); if (ph) phones.set(ph, (phones.get(ph) ?? 0) + 1); }

  // 12 months up to the picked one: new and delivered projects
  const months: { p: string; name: string; fresh: number; done: number }[] = [];
  const SHORT = ["січ", "лют", "бер", "кві", "тра", "чер", "лип", "сер", "вер", "жов", "лис", "гру"];
  const end = to < now ? to : now;
  for (let i = 11; i >= 0; i--) {
    const d = new Date(end.getFullYear(), end.getMonth() - i, 1);
    months.push({ p: mk(d), name: `${SHORT[d.getMonth()]} ${String(d.getFullYear()).slice(2)}`, fresh: 0, done: 0 });
  }
  const at = new Map(months.map((m, i) => [m.p, i]));
  for (const p of projects) {
    const a = at.get(mk(p.createdAt)); if (a !== undefined) months[a].fresh++;
    if (kind(p) === "win" && p.closedAt) { const b = at.get(mk(p.closedAt)); if (b !== undefined) months[b].done++; }
  }
  const firstUsed = months.findIndex((m) => m.fresh || m.done);

  // cases of the period: delivered projects with a link + links added by hand
  const cases = [
    ...done.filter((p) => p.caseUrl && inP(p.closedAt)).map((p) => ({ id: p.id, title: p.projectName || `Проєкт #${p.number}`, niche: p.niche, url: p.caseUrl!, at: p.closedAt!.getTime() })),
    ...freeCases.map((c) => ({ id: c.id, title: c.title || "", niche: c.niche, url: c.url, at: c.createdAt.getTime() })),
  ].sort((a, b) => b.at - a.at).slice(0, 6).map((c) => ({ id: c.id, title: c.title, niche: c.niche, url: c.url }));

  return NextResponse.json({
    doneP: doneP.length, doneAll: done.length, active: active.length,
    newP: projects.filter((p) => inP(p.createdAt)).length,
    launchDays: days(done), launchDaysP: days(doneP), fastest,
    progress: progN ? Math.round(prog / progN) : null,
    leadsP: leads.length,
    clients: soldP.length, repeat: [...phones.values()].filter((n) => n > 1).length,
    salesP: soldP.length,
    conv: leads.length ? (leads.filter((l) => l.status === "WON").length / leads.length) * 100 : null,
    check: priced.length ? Math.round(priced.reduce((a, s) => a + toEur(s.amount, s.currency, fx), 0) / priced.length) : null,
    turnoverP: Math.round(soldP.reduce((a, s) => a + toEur(s.amount, s.currency, fx), 0)),
    niches: niches.slice(0, 8), nichesCount: niches.length,
    cities: cities.slice(0, 10), citiesCount: cities.length,
    months: firstUsed < 0 ? months.slice(-6) : months.slice(Math.min(firstUsed, 6)),
    cases,
  });
}
