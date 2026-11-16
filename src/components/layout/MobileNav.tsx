"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Briefcase, CheckSquare, Menu, Users, Wallet } from "lucide-react";
import { useMobileMenu } from "@/lib/useMobileMenu";
import { useAccess } from "@/lib/useAccess";
import { canPage, type PageKey } from "@/lib/access";

// Phone bottom bar: the 4 screens used on the go + «Меню» (the full sidebar). Hidden from lg up.
const ITEMS: { key: PageKey; href: string; match: string; icon: typeof Users; label: string }[] = [
  { key: "crm", href: "/leads", match: "/leads", icon: Users, label: "CRM" },
  { key: "projects", href: "/projects", match: "/projects", icon: Briefcase, label: "Проєкти" },
  { key: "tasks", href: "/tasks", match: "/tasks", icon: CheckSquare, label: "Задачі" },
  { key: "fin_cashflow", href: "/pnl/cashflow", match: "/pnl/", icon: Wallet, label: "Гроші" },
];

export default function MobileNav() {
  const path = usePathname();
  const { access, loaded } = useAccess();
  const { isOpen, toggle } = useMobileMenu();
  const items = loaded ? ITEMS.filter((i) => canPage(access, i.key)) : [];
  const activeHref = items.find((i) => path === i.match || path.startsWith(i.match))?.href;

  return (
    <nav className="mobile-nav" aria-label="Швидка навігація">
      {items.map((i) => {
        const on = !isOpen && activeHref === i.href;
        const Icon = i.icon;
        return (
          <Link key={i.href} href={i.href} className={`mobile-nav-item${on ? " is-active" : ""}`} aria-current={on ? "page" : undefined}>
            <Icon size={20} strokeWidth={on ? 2.3 : 1.8} />
            <span>{i.label}</span>
          </Link>
        );
      })}
      <button type="button" onClick={toggle} className={`mobile-nav-item${isOpen ? " is-active" : ""}`} aria-label="Усе меню">
        <Menu size={20} strokeWidth={isOpen ? 2.3 : 1.8} />
        <span>Меню</span>
      </button>
    </nav>
  );
}
