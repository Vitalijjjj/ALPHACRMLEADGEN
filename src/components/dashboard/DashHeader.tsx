"use client";

import { BarChart3, Briefcase, Handshake, LayoutGrid, Megaphone, PiggyBank, Table2, Trophy, Smartphone } from "lucide-react";
import type { PageKey } from "@/lib/access";

export type DashTab = "overview" | "leads" | "sales" | "ads" | "projects" | "finance" | "pnl" | "story" | "partners";
// «Дашборд» group of the sidebar: every report of the company in one place.
export const DASH_TABS: { key: DashTab; label: string; href: string; icon: typeof LayoutGrid; page: PageKey }[] = [
  { key: "overview", label: "Огляд", href: "/", icon: LayoutGrid, page: "dash_overview" },
  { key: "leads", label: "Ліди і конверсії", href: "/conversions", icon: BarChart3, page: "dash_leads" },
  { key: "sales", label: "Продажі", href: "/sales", icon: Trophy, page: "dash_sales" },
  { key: "ads", label: "Реклама", href: "/ads", icon: Megaphone, page: "ads" },
  { key: "projects", label: "Проєкти", href: "/pnl/project-stats", icon: Briefcase, page: "dash_projects" },
  { key: "finance", label: "Фінанси", href: "/pnl/overview", icon: PiggyBank, page: "dash_finance" },
  { key: "pnl", label: "P&L", href: "/pnl", icon: Table2, page: "dash_pnl" },
  { key: "story", label: "Instagram", href: "/story", icon: Smartphone, page: "dash_story" },
  { key: "partners", label: "Партнери", href: "/partners", icon: Handshake, page: "dash_partners" },
];

// Title of the report (left) + its own controls (right).
export default function DashHeader({ tab, right }: { tab: DashTab; right?: React.ReactNode }) {
  const t = DASH_TABS.find((x) => x.key === tab)!;
  return (
    <div className="flex flex-wrap items-center gap-2">
      <div className="w-9 h-9 rounded-xl flex items-center justify-center bg-[var(--accent)]/12 text-[var(--accent)] border border-[var(--accent)]/25"><t.icon size={17} /></div>
      <h1 className="text-lg font-semibold text-[var(--text)] mr-auto ml-1">{t.label}</h1>
      {right}
    </div>
  );
}
