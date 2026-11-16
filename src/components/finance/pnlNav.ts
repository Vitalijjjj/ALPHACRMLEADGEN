import { CalendarClock, Landmark, Repeat, Users, Wallet } from "lucide-react";

// Sections of the «Облік» group (sidebar + page header). The reports (P&L, Фінансовий огляд, Проєкти) live in «Дашборд».
export const PNL_SECTIONS = [
  { page: "fin_cashflow", href: "/pnl/cashflow", label: "Кешфлоу", icon: Wallet, hint: "Гроші, що змінюють результат компанії: оплати, підрядники, витрати, податки, дивіденди" },
  { page: "fin_schedule", href: "/pnl/schedule", label: "Графік оплат", icon: CalendarClock, hint: "Хто скільки винен і коли — етапи оплат з угод «Операційки»" },
  { page: "fin_accounts", href: "/pnl/accounts", label: "Рахунки", icon: Landmark, hint: "Скільки грошей на якому рахунку зараз" },
  { page: "fin_team", href: "/pnl/team", label: "Співробітники", icon: Users, hint: "Зарплати з автосписанням щомісяця — вмикай і вимикай" },
  { page: "fin_subs", href: "/pnl/subscriptions", label: "Підписки", icon: Repeat, hint: "Сервіси й софт з автосписанням щомісяця — вмикай і вимикай" },
] as const;

export const pnlSection = (path: string) =>
  [...PNL_SECTIONS].sort((a, b) => b.href.length - a.href.length).find((s) => path === s.href || path.startsWith(`${s.href}/`)) ?? PNL_SECTIONS[0];
