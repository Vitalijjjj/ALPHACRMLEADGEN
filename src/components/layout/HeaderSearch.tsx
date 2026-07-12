"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Search, CornerDownLeft } from "lucide-react";
import { LEAD_STATUS_BADGE, LEAD_STATUS_BADGE_LABEL } from "@/lib/leadOptions";

interface LeadHit {
  id: string;
  name: string;
  status: string;
  instagram: string | null;
  telegram: string | null;
  phone: string | null;
  email: string | null;
  source: string | null;
}

const MAX_RESULTS = 8;

// Глобальний пошук по лідах: живий дропдаун (дебаунс 250мс), клавіатура
// (↑/↓/Enter/Esc), ⌘K / Ctrl+K — фокус. Клік по результату відкриває ліда на /leads.
export default function HeaderSearch() {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<LeadHit[]>([]);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [active, setActive] = useState(-1);
  const boxRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Дебаунс запиту
  useEffect(() => {
    const q = query.trim();
    if (q.length < 2) {
      setResults([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    const t = setTimeout(async () => {
      try {
        const res = await fetch(`/api/leads?q=${encodeURIComponent(q)}`);
        if (res.ok) {
          const leads: LeadHit[] = await res.json();
          setResults(leads.slice(0, MAX_RESULTS));
          setActive(-1);
        }
      } catch {
        /* мережева помилка — просто без результатів */
      } finally {
        setLoading(false);
      }
    }, 250);
    return () => clearTimeout(t);
  }, [query]);

  // Клік поза полем — закрити
  useEffect(() => {
    function onDown(e: MouseEvent) {
      if (boxRef.current && !boxRef.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, []);

  // ⌘K / Ctrl+K — фокус на пошук
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        inputRef.current?.focus();
        setOpen(true);
      }
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, []);

  const openLead = useCallback(
    (id: string) => {
      setOpen(false);
      router.push(`/leads?open=${id}`);
    },
    [router]
  );

  const goToAll = useCallback(() => {
    const q = query.trim();
    if (!q) return;
    setOpen(false);
    router.push(`/leads?q=${encodeURIComponent(q)}`);
  }, [router, query]);

  function onKeyDown(e: React.KeyboardEvent) {
    if (e.key === "Escape") {
      setOpen(false);
      inputRef.current?.blur();
      return;
    }
    if (!open || results.length === 0) {
      if (e.key === "Enter") goToAll();
      return;
    }
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActive((i) => (i + 1) % results.length);
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActive((i) => (i <= 0 ? results.length - 1 : i - 1));
    } else if (e.key === "Enter") {
      e.preventDefault();
      if (active >= 0) openLead(results[active].id);
      else openLead(results[0].id);
    }
  }

  const showDropdown = open && query.trim().length >= 2;

  return (
    <div ref={boxRef} style={{ flex: 1, maxWidth: 280, position: "relative" }}>
      <Search
        size={13}
        style={{ position: "absolute", left: 12, top: "50%", transform: "translateY(-50%)", color: "var(--text-muted)", pointerEvents: "none" }}
      />
      <input
        ref={inputRef}
        value={query}
        onChange={(e) => { setQuery(e.target.value); setOpen(true); }}
        onFocus={(e) => {
          setOpen(true);
          e.currentTarget.style.borderColor = "rgba(201,140,10,0.40)";
          e.currentTarget.style.background = "rgba(201,140,10,0.05)";
        }}
        onBlur={(e) => {
          e.currentTarget.style.borderColor = "rgba(255,255,255,0.07)";
          e.currentTarget.style.background = "rgba(255,255,255,0.04)";
        }}
        onKeyDown={onKeyDown}
        placeholder="Пошук лідів...  ⌘K"
        style={{
          width: "100%",
          padding: "6px 16px 6px 36px",
          fontSize: 13,
          borderRadius: 10,
          color: "var(--text)",
          background: "rgba(255,255,255,0.04)",
          border: "1px solid rgba(255,255,255,0.07)",
          outline: "none",
        }}
      />

      {showDropdown && (
        <div
          style={{
            position: "absolute",
            top: "calc(100% + 6px)",
            left: 0,
            right: 0,
            minWidth: 300,
            borderRadius: 12,
            overflow: "hidden",
            background: "rgba(10,10,10,0.98)",
            backdropFilter: "blur(24px) saturate(160%)",
            WebkitBackdropFilter: "blur(24px) saturate(160%)",
            border: "1px solid rgba(255,255,255,0.08)",
            boxShadow: "0 16px 48px rgba(0,0,0,0.6)",
            zIndex: 50,
          }}
        >
          {loading && results.length === 0 ? (
            <p style={{ padding: "14px 14px", fontSize: 12, color: "var(--text-muted)" }}>Пошук...</p>
          ) : results.length === 0 ? (
            <p style={{ padding: "14px 14px", fontSize: 12, color: "var(--text-muted)" }}>Нічого не знайдено</p>
          ) : (
            <>
              {results.map((lead, i) => {
                const contact =
                  lead.instagram ? `@${lead.instagram}` :
                  lead.telegram ? `@${lead.telegram}` :
                  lead.phone ?? lead.email ?? lead.source ?? "";
                return (
                  <button
                    key={lead.id}
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={() => openLead(lead.id)}
                    onMouseEnter={() => setActive(i)}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "space-between",
                      gap: 10,
                      width: "100%",
                      padding: "9px 12px",
                      background: i === active ? "rgba(201,140,10,0.10)" : "none",
                      border: "none",
                      borderBottom: "1px solid rgba(255,255,255,0.04)",
                      cursor: "pointer",
                      textAlign: "left",
                    }}
                  >
                    <span style={{ minWidth: 0 }}>
                      <span style={{ display: "block", fontSize: 13, fontWeight: 500, color: "var(--text)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                        {lead.name}
                      </span>
                      {contact && (
                        <span style={{ display: "block", fontSize: 11, color: "var(--text-muted)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                          {contact}
                        </span>
                      )}
                    </span>
                    <span
                      className={`text-[10px] px-1.5 py-0.5 rounded font-medium border shrink-0 ${LEAD_STATUS_BADGE[lead.status] ?? "bg-zinc-500/10 text-zinc-400 border-zinc-400/20"}`}
                    >
                      {LEAD_STATUS_BADGE_LABEL[lead.status] ?? lead.status}
                    </span>
                  </button>
                );
              })}
              <button
                onMouseDown={(e) => e.preventDefault()}
                onClick={goToAll}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 6,
                  width: "100%",
                  padding: "9px 12px",
                  background: "none",
                  border: "none",
                  fontSize: 12,
                  fontWeight: 600,
                  color: "var(--accent)",
                  cursor: "pointer",
                }}
              >
                <CornerDownLeft size={12} />
                Всі результати в Leads
              </button>
            </>
          )}
        </div>
      )}
    </div>
  );
}
