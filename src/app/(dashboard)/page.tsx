export const dynamic = "force-dynamic";

import { getAccess } from "@/lib/accessServer";
import { canPage } from "@/lib/access";
import { getDashboard, type DashFilters } from "@/lib/dashboardStats";
import DashboardView from "@/components/dashboard/DashboardView";
import type { PeriodValue } from "@/components/finance/PeriodPicker";

const first = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) || undefined;

// «Дашборд» — counted on the server from the URL (period + extended filter), drawn by DashboardView.
export default async function DashboardPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  // no «Дашборд» in the role → no company numbers (AccessGate shows «Немає доступу»)
  const access = await getAccess();
  if (!canPage(access, "dash_overview")) return null;
  const sp = await searchParams;
  const f: DashFilters = {
    p: first(sp.p), dateFrom: first(sp.dateFrom), dateTo: first(sp.dateTo),
    status: first(sp.status), niche: first(sp.niche), source: first(sp.source), campaign: first(sp.campaign),
    geo: first(sp.geo), amount: first(sp.amount), service: first(sp.service),
  };
  const data = await getDashboard(f);
  const value: PeriodValue = data.mode === "all" ? { mode: "all" } : data.mode === "range" ? { mode: "range", from: data.cur.from, to: data.cur.to } : { mode: "period", p: data.p! };
  return <DashboardView data={data} value={value} />;
}
