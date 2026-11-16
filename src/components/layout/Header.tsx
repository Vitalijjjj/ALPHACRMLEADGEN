"use client";

import { Menu } from "lucide-react";
import { useState, useEffect } from "react";
import { useMobileMenu } from "@/lib/useMobileMenu";
import HeaderSearch from "@/components/layout/HeaderSearch";
import FxRate from "@/components/layout/FxRate";
import NotificationsBell from "@/components/layout/NotificationsBell";

export default function Header() {
  const [time, setTime] = useState("");
  const { toggle } = useMobileMenu();

  useEffect(() => {
    const tick = () => {
      const now = new Date();
      setTime(now.toLocaleTimeString("uk-UA", { hour: "2-digit", minute: "2-digit", second: "2-digit" }));
    };
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, []);

  // Live clock with weekday — e.g. «Середа, 11 листопада · 20:23:15».
  const now = time ? new Date() : null;
  const weekday = now?.toLocaleDateString("uk-UA", { weekday: "long" }) ?? "";
  const day = now?.toLocaleDateString("uk-UA", { day: "numeric", month: "long" }) ?? "";

  return (
    <header
      style={{
        display: "flex",
        alignItems: "center",
        gap: 12,
        padding: "12px 16px",
        paddingTop: "calc(12px + env(safe-area-inset-top))",
        flexShrink: 0,
        position: "relative",
        zIndex: 40, // вище за контентні картки (z-10), щоб дропдаун пошуку не ховався під ними
        background: "rgba(6, 6, 6, 0.88)",
        backdropFilter: "blur(24px) saturate(160%)",
        WebkitBackdropFilter: "blur(24px) saturate(160%)",
        borderBottom: "1px solid rgba(255,255,255,0.06)",
        boxShadow: "0 1px 0 rgba(255,255,255,0.04) inset",
      }}
    >
      {/* Hamburger — CSS клас ховає на desktop */}
      <button
        onClick={toggle}
        className="hamburger-btn"
        aria-label="Відкрити меню"
        style={{
          alignItems: "center",
          justifyContent: "center",
          width: 36,
          height: 36,
          borderRadius: 10,
          background: "rgba(255,255,255,0.04)",
          border: "1px solid rgba(255,255,255,0.07)",
          color: "var(--text-muted)",
          cursor: "pointer",
          flexShrink: 0,
        }}
      >
        <Menu size={18} />
      </button>

      {/* Search — прихований на дуже малих екранах через flex shrink */}
      <HeaderSearch />

      <div style={{ display: "flex", alignItems: "center", gap: 8, marginLeft: "auto" }}>
        {/* NBU rate (EUR/USD → UAH) with a manual refresh */}
        <FxRate />

        {/* Bell: overdue / today's / upcoming tasks */}
        <NotificationsBell />

        {/* Clock: weekday + date + ticking time (replaces the old «S Admin» avatar) */}
        <div
          className="header-clock"
          style={{
            alignItems: "center", gap: 10, height: 36, padding: "0 12px", borderRadius: 10,
            background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.07)", whiteSpace: "nowrap",
          }}
          title={now?.toLocaleString("uk-UA") ?? ""}
        >
          <span className="header-date" style={{ fontSize: 12, color: "var(--text-muted)" }}>
            <span style={{ color: "var(--accent)", fontWeight: 600, textTransform: "capitalize" }}>{weekday}</span>
            <span style={{ margin: "0 6px", color: "var(--text-dim)" }}>·</span>
            {day}
          </span>
          <span style={{ fontSize: 13, fontWeight: 600, color: "var(--text)", fontVariantNumeric: "tabular-nums" }}>{time}</span>
        </div>
      </div>
    </header>
  );
}
