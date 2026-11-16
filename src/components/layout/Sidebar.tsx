"use client";

import Link from "next/link";
import Image from "next/image";
import { Fragment, useState } from "react";
import { usePathname } from "next/navigation";
import { signOut } from "next-auth/react";
import {
  LayoutDashboard, Users, CheckSquare,
  Bell, LogOut, X, Settings, Wallet, ChevronDown, Briefcase, Gem,
} from "lucide-react";
import { useMobileMenu } from "@/lib/useMobileMenu";
import { useAccess } from "@/lib/useAccess";
import { canPage, type PageKey } from "@/lib/access";
import { PNL_SECTIONS, pnlSection } from "@/components/finance/pnlNav";
import { DASH_TABS } from "@/components/dashboard/DashHeader";
import FxRate from "@/components/layout/FxRate";

const nav: { key: PageKey; href: string; icon: typeof LayoutDashboard; label: string }[] = [
  { key: "crm",       href: "/leads",  icon: Users,           label: "CRM" },
  { key: "projects",  href: "/projects", icon: Briefcase,     label: "Проєкти" },
  { key: "cases",     href: "/cases",    icon: Gem,           label: "Кейси" },
  { key: "tasks",     href: "/tasks",  icon: CheckSquare,     label: "Задачі" },
  { key: "pushes",    href: "/pushes", icon: Bell,            label: "Пуші" },
];
// at the bottom, above «Вийти»
const settingsItem = { key: "settings" as PageKey, href: "/settings", icon: Settings, label: "Налаштування" };

function NavLink({ item, active, onClick }: { item: typeof settingsItem; active: boolean; onClick?: () => void }) {
  const Icon = item.icon;
  return (
    <Link
      href={item.href}
      onClick={onClick}
      style={{
        display: "flex",
        alignItems: "center",
        gap: 12,
        padding: "10px 12px",
        borderRadius: 12,
        marginBottom: 2,
        fontSize: 14,
        fontWeight: 500,
        textDecoration: "none",
        transition: "all 0.15s",
        ...(active
          ? { background: "var(--accent)", color: "#000", boxShadow: "0 0 16px var(--accent-glow)" }
          : { color: "var(--text-muted)" }
        ),
      }}
    >
      <Icon size={15} />
      {item.label}
    </Link>
  );
}

// open/closed state of a sidebar group, kept in localStorage. The groups mount only after the role
// loads (client side), so reading storage in the initializer is safe.
function useNavGroup(key: string, fallback: () => boolean) {
  const [open, set] = useState<boolean>(() => {
    try { const v = localStorage.getItem(key); if (v !== null) return v === "1"; } catch {}
    return fallback();
  });
  const setOpen = (f: (v: boolean) => boolean) => set((v) => {
    const n = f(v);
    try { localStorage.setItem(key, n ? "1" : "0"); } catch {}
    return n;
  });
  return [open, setOpen] as const;
}

// «Дашборд» — Огляд / Ліди і конверсії / Реклама; opens by itself while you are inside it.
function DashGroup({ path, onLinkClick, allowed }: { path: string; onLinkClick?: () => void; allowed: (k: PageKey) => boolean }) {
  const items = DASH_TABS.filter((t) => allowed(t.page));
  const current = items.find((t) => path === t.href || (t.href === "/ads" && path.startsWith("/ads/")))?.href ?? null;
  const inside = !!current;
  // remembered per browser; first time — open only on tall screens (on a 13" laptop it pushed «Облік» off-screen)
  const [open, setOpen] = useNavGroup("nav-dash-open", () => window.innerHeight >= 900);
  const shown = open || inside;
  if (!items.length) return null;
  return (
    <div style={{ marginBottom: 2 }}>
      <button
        onClick={() => setOpen((v) => !v)}
        style={{
          display: "flex", alignItems: "center", gap: 12, width: "100%", padding: "10px 12px", borderRadius: 12,
          fontSize: 14, fontWeight: 500, background: inside ? "rgba(201,140,10,0.10)" : "none", border: "none", cursor: "pointer",
          color: inside ? "var(--accent)" : "var(--text-muted)", transition: "all 0.15s",
        }}
      >
        <LayoutDashboard size={15} />
        Дашборд
        <ChevronDown size={14} style={{ marginLeft: "auto", transform: shown ? "rotate(180deg)" : "none", transition: "transform 0.2s" }} />
      </button>
      {shown && (
        <div style={{ margin: "2px 0 4px 19px", paddingLeft: 10, borderLeft: "1px solid rgba(255,255,255,0.08)" }}>
          {items.map((s) => {
            const Icon = s.icon;
            const on = current === s.href;
            return (
              <Link key={s.href} href={s.href} onClick={onLinkClick}
                style={{
                  display: "flex", alignItems: "center", gap: 10, padding: "7px 10px", borderRadius: 10, marginBottom: 1,
                  fontSize: 13, fontWeight: on ? 600 : 500, textDecoration: "none", transition: "all 0.15s",
                  ...(on ? { background: "var(--accent)", color: "#000", boxShadow: "0 0 14px var(--accent-glow)" } : { color: "var(--text-muted)" }),
                }}>
                <Icon size={13} />
                {s.label}
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}

// «Облік» — the working finance sections (cashflow, payment schedule, accounts, team, subscriptions); opens by itself while you are inside it.
function PnlGroup({ path, onLinkClick, allowed }: { path: string; onLinkClick?: () => void; allowed: (k: PageKey) => boolean }) {
  const sections = PNL_SECTIONS.filter((s) => allowed(s.page));
  // the reports under /pnl (P&L, Фінансовий огляд, Проєкти) belong to «Дашборд»
  const inside = PNL_SECTIONS.some((s) => path === s.href || path.startsWith(`${s.href}/`));
  const [open, setOpen] = useNavGroup("nav-pnl-open", () => false);
  const shown = open || inside;
  const current = inside ? pnlSection(path).href : null;
  if (!sections.length) return null;
  return (
    <div style={{ marginBottom: 2 }}>
      <button
        onClick={() => setOpen((v) => !v)}
        style={{
          display: "flex", alignItems: "center", gap: 12, width: "100%", padding: "10px 12px", borderRadius: 12,
          fontSize: 14, fontWeight: 500, background: inside ? "rgba(201,140,10,0.10)" : "none", border: "none", cursor: "pointer",
          color: inside ? "var(--accent)" : "var(--text-muted)", transition: "all 0.15s",
        }}
      >
        <Wallet size={15} />
        Облік
        <ChevronDown size={14} style={{ marginLeft: "auto", transform: shown ? "rotate(180deg)" : "none", transition: "transform 0.2s" }} />
      </button>
      {shown && (
        <div style={{ margin: "2px 0 4px 19px", paddingLeft: 10, borderLeft: "1px solid rgba(255,255,255,0.08)" }}>
          {sections.map((s) => {
            const Icon = s.icon;
            const on = current === s.href;
            return (
              <Link key={s.href} href={s.href} onClick={onLinkClick}
                style={{
                  display: "flex", alignItems: "center", gap: 10, padding: "7px 10px", borderRadius: 10, marginBottom: 1,
                  fontSize: 13, fontWeight: on ? 600 : 500, textDecoration: "none", transition: "all 0.15s",
                  ...(on ? { background: "var(--accent)", color: "#000", boxShadow: "0 0 14px var(--accent-glow)" } : { color: "var(--text-muted)" }),
                }}>
                <Icon size={13} />
                {s.label}
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}

const glassStyle: React.CSSProperties = {
  background: "rgba(6, 6, 6, 0.98)",
  backdropFilter: "blur(28px) saturate(180%)",
  WebkitBackdropFilter: "blur(28px) saturate(180%)",
  borderRight: "1px solid rgba(255,255,255,0.07)",
  boxShadow: "4px 0 40px rgba(0,0,0,0.5), 1px 0 0 rgba(255,255,255,0.04) inset",
};

function NavContent({ onLinkClick }: { onLinkClick?: () => void }) {
  const path = usePathname();
  const { access, loaded } = useAccess();
  // until the role is known show nothing extra (avoids flashing pages the user cannot open)
  const allowed = (key: PageKey) => loaded && canPage(access, key);
  const isActive = (href: string) => (href === "/" ? path === "/" : path.startsWith(href));

  return (
    <>
      {/* Logo */}
      <div style={{ padding: "24px 20px 20px", display: "flex", alignItems: "center", gap: 10 }}>
        <Image src="/logo.svg" alt="AlphaCRM" width={36} height={36} style={{ flexShrink: 0 }} />
        <div>
          <span style={{ fontSize: 13, fontWeight: 700, color: "var(--text)", letterSpacing: "0.12em", textTransform: "uppercase" }}>
            Alpha
          </span>
          <span style={{ fontSize: 9, display: "block", fontWeight: 600, letterSpacing: "0.2em", textTransform: "uppercase", color: "var(--text-dim)", lineHeight: 1.2 }}>
            CRM
          </span>
        </div>
      </div>

      {/* Menu label */}
      <div style={{ padding: "0 20px 6px" }}>
        <span style={{ fontSize: 9, fontWeight: 600, letterSpacing: "0.2em", textTransform: "uppercase", color: "var(--text-dim)" }}>
          Menu
        </span>
      </div>

      {/* Nav links */}
      <nav style={{ flex: 1, padding: "0 10px", overflowY: "auto" }}>
        {/* «Дашборд» (all reports) goes first */}
        {loaded && <DashGroup path={path} onLinkClick={onLinkClick} allowed={allowed} />}
        {nav.filter((n) => allowed(n.key)).map((n) => (
          <Fragment key={n.href}>
            <NavLink item={n} active={isActive(n.href)} onClick={onLinkClick} />
            {/* «P&L» group goes right after «Задачі» */}
            {/* after «Задачі» — «Облік» */}
            {n.key === "tasks" && <PnlGroup path={path} onLinkClick={onLinkClick} allowed={allowed} />}
          </Fragment>
        ))}
      </nav>

      {/* Settings + who is signed in + logout */}
      <div style={{ padding: "12px 10px 16px", borderTop: "1px solid rgba(255,255,255,0.05)", marginTop: "auto" }}>
        {allowed("settings") && <NavLink item={settingsItem} active={isActive(settingsItem.href)} onClick={onLinkClick} />}
        {/* phones: the NBU rate is not in the header (no room) — it lives here */}
        {onLinkClick && <div className="sm:hidden" style={{ padding: "6px 2px 4px" }}><FxRate className="flex" /></div>}
        {access && (
          <div style={{ padding: "8px 12px 4px", fontSize: 11, color: "var(--text-dim)", lineHeight: 1.35 }}>
            <div style={{ color: "var(--text-muted)", fontWeight: 600, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{access.name}</div>
            <div>{access.roleName}</div>
          </div>
        )}
        <button
          onClick={() => signOut({ callbackUrl: "/login" })}
          style={{
            display: "flex", alignItems: "center", gap: 12,
            padding: "10px 12px", width: "100%", borderRadius: 12,
            fontSize: 14, fontWeight: 500, background: "none", border: "none",
            color: "var(--text-muted)", cursor: "pointer", transition: "all 0.15s",
          }}
          onMouseEnter={(e) => { e.currentTarget.style.color = "var(--danger)"; e.currentTarget.style.background = "rgba(248,113,113,0.06)"; }}
          onMouseLeave={(e) => { e.currentTarget.style.color = "var(--text-muted)"; e.currentTarget.style.background = "none"; }}
        >
          <LogOut size={15} />
          Вийти
        </button>
      </div>
    </>
  );
}

export default function Sidebar() {
  const { isOpen, close } = useMobileMenu();

  return (
    <>
      {/* Desktop sidebar — CSS class показує лише на lg+ */}
      <aside className="sidebar-desktop" style={glassStyle}>
        <NavContent />
      </aside>

      {/* Mobile overlay — CSS class показує лише на mobile */}
      {isOpen && (
        <div
          className="sidebar-overlay"
          onClick={close}
          aria-hidden="true"
        />
      )}

      {/* Mobile drawer — CSS class ховає на desktop, JS керує transform */}
      <aside
        className="sidebar-mobile-drawer"
        style={{
          ...glassStyle,
          transform: isOpen ? "translateX(0)" : "translateX(-100%)",
        }}
      >
        {/* Close button */}
        <button
          onClick={close}
          style={{
            position: "absolute", top: 16, right: 16,
            width: 28, height: 28, borderRadius: 8,
            background: "rgba(255,255,255,0.06)", border: "none",
            color: "var(--text-muted)", cursor: "pointer",
            display: "flex", alignItems: "center", justifyContent: "center",
          }}
        >
          <X size={16} />
        </button>

        <NavContent onLinkClick={close} />
      </aside>
    </>
  );
}
