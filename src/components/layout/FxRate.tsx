"use client";

import { RefreshCw } from "lucide-react";
import { useFx } from "@/lib/useFx";

// NBU rate in the header: «€ 48,12 ₴ · $ 41,30 ₴» + «Оновити». Totals in the CRM are counted in EUR with it.
export default function FxRate({ className = "header-fx" }: { className?: string }) {
  const { fx, loaded, refresh, refreshing, error } = useFx();
  const fetched = new Date(fx.fetchedAt);
  const title = fx.fallback
    ? "Курс НБУ ще не завантажено — використовується приблизний. Натисни, щоб оновити."
    : `Курс НБУ на ${fx.date} · оновлено ${fetched.toLocaleString("uk-UA", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}`;
  const num = (v: number) => v.toLocaleString("uk-UA", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

  return (
    <div
      className={className}
      title={error ? "НБУ не відповідає — показано останній збережений курс" : title}
      style={{
        alignItems: "center", gap: 8, height: 36, padding: "0 4px 0 12px", borderRadius: 10,
        background: "rgba(255,255,255,0.04)", border: `1px solid ${error ? "rgba(248,113,113,0.4)" : "rgba(255,255,255,0.07)"}`,
        whiteSpace: "nowrap", fontSize: 12, fontVariantNumeric: "tabular-nums",
      }}
    >
      <span style={{ color: "var(--text-dim)", fontSize: 10, fontWeight: 600, letterSpacing: 0.5 }}>НБУ</span>
      <span style={{ color: fx.fallback ? "var(--text-dim)" : "var(--text)" }}>
        <b style={{ color: "var(--accent)" }}>€</b> {loaded ? num(fx.eurUah) : "…"} ₴
      </span>
      <span className="header-fx-usd" style={{ color: fx.fallback ? "var(--text-dim)" : "var(--text-muted)" }}>
        <b style={{ color: "#4ade80" }}>$</b> {loaded ? num(fx.usdUah) : "…"} ₴
      </span>
      <button
        onClick={() => refresh()}
        disabled={refreshing}
        aria-label="Оновити курс"
        title="Оновити курс з НБУ"
        style={{
          width: 28, height: 28, display: "flex", alignItems: "center", justifyContent: "center",
          borderRadius: 8, border: "none", background: "transparent", color: "var(--text-muted)", cursor: "pointer",
        }}
        className="hover:!text-[var(--accent)] hover:!bg-white/[0.06] transition-colors"
      >
        <RefreshCw size={13} className={refreshing ? "animate-spin" : ""} />
      </button>
    </div>
  );
}
