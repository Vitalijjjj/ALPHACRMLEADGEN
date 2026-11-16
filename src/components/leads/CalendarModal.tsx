"use client";

import { useState } from "react";
import { CalendarPlus, Copy, Check, ExternalLink, Link2, Clock } from "lucide-react";
import { format } from "date-fns";
import { uk } from "date-fns/locale";
import { Modal } from "@/components/ui/modal";
import { CALENDAR_STATUSES, leadDisplayName } from "@/lib/leadOptions";

// Lead fields the calendar dialog needs.
export interface CalendarLead {
  id: string;
  name: string;
  number?: number;
  niche?: string | null;
  phone?: string | null;
  instagram?: string | null;
  telegram?: string | null;
  source?: string | null;
  calendarAt: string | null;
  calendarStatus: string | null;
}
type Lead = CalendarLead;

// Stored instant → "YYYY-MM-DDTHH:mm" in the browser's own time (summer / winter time handled by the browser)
export function toLocalInput(utcStr: string): string {
  const d = new Date(utcStr);
  return new Date(d.getTime() - d.getTimezoneOffset() * 60_000).toISOString().slice(0, 16);
}

function pad(n: number) {
  return n.toString().padStart(2, "0");
}

// Link to the deal in this CRM (opens its card) — goes into the calendar event.
export function dealUrl(lead: { id: string; number?: number }): string {
  const origin = typeof window !== "undefined" ? window.location.origin : "";
  return lead.number ? `${origin}/leads/${lead.number}` : `${origin}/leads?open=${lead.id}`;
}

function eventTitle(lead: Lead, status: string): string {
  return [leadDisplayName(lead), lead.niche, lead.phone, status].filter(Boolean).join(" / ");
}

function eventDetails(lead: Lead): string {
  return [
    `Угода в CRM: ${dealUrl(lead)}`,
    lead.phone ? `Телефон: ${lead.phone}` : "",
    lead.niche ? `Ніша: ${lead.niche}` : "",
    lead.telegram ? `Telegram: @${lead.telegram}` : "",
    lead.instagram ? `Instagram: @${lead.instagram}` : "",
    lead.source ? `Джерело: ${lead.source}` : "",
  ].filter(Boolean).join("\n");
}

function buildGCalUrl(lead: Lead, dateStr: string, timeStr: string, status: string, minutes: number): string {
  // Floating local time — Google Calendar interprets it in the account's timezone.
  const start = new Date(`${dateStr}T${timeStr || "09:00"}`);
  const end = new Date(start.getTime() + minutes * 60_000);
  const fmt = (d: Date) =>
    `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}T${pad(d.getHours())}${pad(d.getMinutes())}00`;
  const params = new URLSearchParams({
    action: "TEMPLATE",
    text: eventTitle(lead, status),
    dates: `${fmt(start)}/${fmt(end)}`,
    details: eventDetails(lead),
  });
  return `https://calendar.google.com/calendar/render?${params.toString()}`;
}

function ymd(d: Date) {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

const DURATIONS = [15, 30, 60, 90];
const HOURS = ["12:00", "13:00", "14:00", "15:00", "16:00", "17:00", "18:00"];
const WEEKDAYS = ["Пн", "Вт", "Ср", "Чт", "Пт", "Сб", "Нд"]; // getDay(): 1…6, 0

// Сьогодні, Завтра + the nearest Monday…Sunday after today (Mon→Sun order)
function makeDayTiles(now: Date) {
  const at = (n: number) => { const d = new Date(now); d.setDate(d.getDate() + n); return d; };
  const short = (d: Date) => `${pad(d.getDate())}.${pad(d.getMonth() + 1)}`;
  const title = (d: Date) => format(d, "EEEE, d MMMM", { locale: uk });
  const tiles = [
    { key: "today", label: "Сьогодні", d: at(0) },
    { key: "tomorrow", label: "Завтра", d: at(1) },
    ...WEEKDAYS.map((label, i) => {
      const wd = (i + 1) % 7;
      const ahead = ((wd - now.getDay() + 7) % 7) || 7; // 1…7 days ahead
      return { key: label, label, d: at(ahead) };
    }),
  ];
  return tiles.map((t, i) => ({ key: t.key, label: t.label, wide: i < 2, date: ymd(t.d), short: i < 2 ? `${WEEKDAYS[(t.d.getDay() + 6) % 7]} · ${short(t.d)}` : short(t.d), title: title(t.d), weekend: t.d.getDay() === 0 || t.d.getDay() === 6 }));
}
const GOOGLE_BLUE = "#4285F4";

export default function CalendarModal({ lead, onClose, onSaved, initialStatus }: { lead: Lead; onClose: () => void; onSaved: (at: string) => void; initialStatus?: string }) {
  // "now" is taken when the dialog opens, so the tiles always count from the real current day
  const [now] = useState(() => new Date());
  const hasEvent = !!lead.calendarAt;
  const savedLocal = lead.calendarAt ? toLocalInput(lead.calendarAt) : null;
  const [date, setDate] = useState(savedLocal ? savedLocal.slice(0, 10) : ymd(now));
  const [time, setTime] = useState(savedLocal ? savedLocal.slice(11, 16) : "13:00");
  const [minutes, setMinutes] = useState(30);
  const [status, setStatus] = useState(lead.calendarStatus ?? initialStatus ?? CALENDAR_STATUSES[0]);
  const [saving, setSaving] = useState(false);
  const [copied, setCopied] = useState(false);
  const link = dealUrl(lead);

  const field = "w-full px-3 py-2 rounded-lg bg-[var(--surface-2)] border border-[var(--border)] text-[var(--text)] text-sm focus:outline-none focus:border-[#4285F4] transition-colors";
  const lbl = "block text-[10px] font-semibold text-[var(--text-muted)] mb-1.5 uppercase tracking-wider";
  const chip = (on: boolean) =>
    `px-2.5 py-1 rounded-md text-[11px] font-medium border whitespace-nowrap transition-colors cursor-pointer ${on ? "text-white" : "text-[var(--text-muted)] border-[var(--border)] hover:text-[var(--text)] hover:border-white/20"}`;
  const chipOn = { background: `${GOOGLE_BLUE}30`, borderColor: `${GOOGLE_BLUE}90` };

  const start = new Date(`${date}T${time || "09:00"}`);
  const end = new Date(start.getTime() + minutes * 60_000);
  const valid = !Number.isNaN(start.getTime());
  const dayTiles = makeDayTiles(now);

  async function submit(openCalendar: boolean) {
    setSaving(true);
    // open the tab right away (browsers block pop-ups opened after an await)
    const tab = openCalendar ? window.open("about:blank", "_blank") : null;
    try {
      await fetch(`/api/leads/${lead.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        // a real instant (ISO) — the old "+02:00" guess was wrong in winter time
        body: JSON.stringify({ calendarAt: new Date(`${date}T${time || "09:00"}`).toISOString(), calendarStatus: status }),
      });
      if (tab) tab.location.href = buildGCalUrl(lead, date, time, status, minutes);
      onSaved(new Date(`${date}T${time || "09:00"}`).toISOString());
      onClose();
    } catch {
      tab?.close();
    } finally {
      setSaving(false);
    }
  }

  async function removeEvent() {
    setSaving(true);
    try {
      await fetch(`/api/leads/${lead.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ calendarAt: null, calendarStatus: null }),
      });
      onSaved("");
      onClose();
    } finally {
      setSaving(false);
    }
  }

  function copyLink() {
    navigator.clipboard.writeText(link);
    setCopied(true);
    setTimeout(() => setCopied(false), 1400);
  }

  return (
    <Modal open onClose={onClose} title={hasEvent ? "Перепланувати зустріч" : "Зустріч у Google Календарі"} size="lg">
      <div className="space-y-4">
        {/* when: quick day tiles (today, tomorrow, nearest Mon…Sun) + quick hours, exact inputs below */}
        <div>
          <label className={lbl}>День</label>
          <div className="flex flex-wrap sm:flex-nowrap gap-1">
            {dayTiles.map((t) => {
              const on = date === t.date;
              return (
                <button
                  key={t.key}
                  type="button"
                  onClick={() => setDate(t.date)}
                  title={t.title}
                  className={`${t.wide ? "flex-[1.7] min-w-[60px] sm:min-w-0" : "flex-1 min-w-[38px] sm:min-w-0"} flex flex-col items-center justify-center py-1.5 rounded-lg border cursor-pointer transition-all duration-150 ${on ? "text-white" : "border-[var(--border)] hover:border-white/25 hover:bg-white/[0.03]"}`}
                  style={on ? { background: GOOGLE_BLUE, borderColor: GOOGLE_BLUE, boxShadow: `0 4px 14px -6px ${GOOGLE_BLUE}` } : undefined}
                >
                  <span className={`text-[11px] font-semibold leading-tight ${on ? "" : t.weekend ? "text-[var(--text-dim)]" : "text-[var(--text)]"}`}>{t.label}</span>
                  <span className={`text-[10px] tabular-nums leading-tight ${on ? "text-white/80" : "text-[var(--text-dim)]"}`}>{t.short}</span>
                </button>
              );
            })}
          </div>
        </div>
        <div>
          <label className={lbl}>Час</label>
          <div className="grid grid-cols-7 gap-1">
            {HOURS.map((h) => {
              const on = time === h;
              return (
                <button
                  key={h}
                  type="button"
                  onClick={() => setTime(h)}
                  className={`py-2 rounded-lg border text-xs font-semibold tabular-nums cursor-pointer transition-all duration-150 ${on ? "text-white" : "border-[var(--border)] text-[var(--text)] hover:border-white/25 hover:bg-white/[0.03]"}`}
                  style={on ? { background: GOOGLE_BLUE, borderColor: GOOGLE_BLUE, boxShadow: `0 4px 14px -6px ${GOOGLE_BLUE}` } : undefined}
                >
                  {h.slice(0, 2)}<span className={on ? "text-white/70" : "text-[var(--text-dim)]"}>:00</span>
                </button>
              );
            })}
          </div>
        </div>
        <div className="grid grid-cols-2 gap-2">
          <input type="date" value={date} onChange={(e) => setDate(e.target.value)} className={field} aria-label="Інша дата" />
          <input type="time" value={time} onChange={(e) => setTime(e.target.value)} className={field} aria-label="Інший час" />
        </div>

        <div className="space-y-3">
          <div>
            <label className={lbl}>Тривалість</label>
            <div className="flex gap-1.5">
              {DURATIONS.map((m) => (
                <button key={m} type="button" onClick={() => setMinutes(m)} className={chip(minutes === m)} style={minutes === m ? chipOn : undefined}>
                  {m < 60 ? `${m} хв` : m === 60 ? "1 год" : "1,5 год"}
                </button>
              ))}
            </div>
          </div>
          <div>
            <label className={lbl}>Тип події</label>
            <div className="flex flex-wrap gap-1.5">
              {CALENDAR_STATUSES.map((s) => (
                <button key={s} type="button" onClick={() => setStatus(s)} className={chip(status === s)} style={status === s ? chipOn : undefined}>{s}</button>
              ))}
            </div>
          </div>
        </div>

        {/* how it will look in Google Calendar */}
        <div>
          <label className={lbl}>Подія в календарі</label>
          <div className="relative rounded-xl border border-[var(--border)] bg-[var(--surface-2)] pl-4 pr-3 py-3 overflow-hidden">
            <span className="absolute left-0 top-0 bottom-0 w-1" style={{ background: GOOGLE_BLUE }} />
            <div className="text-sm font-semibold text-[var(--text)] break-words">{eventTitle(lead, status)}</div>
            {valid && (
              <div className="flex items-center gap-1.5 mt-1 text-xs text-[var(--text-muted)]">
                <Clock size={11} />
                <span>{(() => { const t = format(start, "EEEE, d MMMM", { locale: uk }); return t.charAt(0).toUpperCase() + t.slice(1); })()}</span> · {format(start, "HH:mm")}–{format(end, "HH:mm")}
              </div>
            )}
            <div className="mt-2.5 pt-2.5 border-t border-white/[0.06] space-y-1">
              <div className="text-[10px] uppercase tracking-wider text-[var(--text-dim)] flex items-center gap-1"><Link2 size={10} /> Посилання на угоду (піде в опис події)</div>
              <div className="flex items-center gap-1.5">
                <code className="flex-1 min-w-0 truncate text-xs px-2 py-1.5 rounded-md bg-black/30 border border-white/[0.06]" style={{ color: "#8ab4f8" }} title={link}>{link}</code>
                <button type="button" onClick={copyLink} title="Скопіювати"
                  className="w-7 h-7 flex items-center justify-center rounded-md border border-[var(--border)] text-[var(--text-muted)] hover:text-[var(--text)] cursor-pointer shrink-0">
                  {copied ? <Check size={12} className="text-green-400" /> : <Copy size={12} />}
                </button>
                <a href={link} target="_blank" rel="noopener noreferrer" title="Відкрити"
                  className="w-7 h-7 flex items-center justify-center rounded-md border border-[var(--border)] text-[var(--text-muted)] hover:text-[var(--text)] shrink-0">
                  <ExternalLink size={12} />
                </a>
              </div>
            </div>
          </div>
        </div>

        {hasEvent && (
          <p className="text-[11px] text-[var(--text-dim)] leading-snug">
            Нова дата збережеться в CRM. «Зберегти і відкрити Календар» створює нову подію — стару в Google Календарі за потреби видали там.
          </p>
        )}

        <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
          {hasEvent ? (
            <button onClick={removeEvent} disabled={saving} className="text-xs text-red-400/80 hover:text-red-400 transition-colors cursor-pointer disabled:opacity-50">
              Прибрати подію
            </button>
          ) : <span />}
          <div className="flex items-center gap-2 ml-auto">
            <button onClick={onClose} className="px-3 py-2 text-xs text-[var(--text-muted)] hover:text-[var(--text)] transition-colors cursor-pointer">
              Скасувати
            </button>
            <button onClick={() => submit(false)} disabled={saving || !valid}
              className="px-3 py-2 text-xs font-medium rounded-lg border border-[var(--border)] bg-[var(--surface-2)] text-[var(--text)] hover:border-white/20 transition-colors cursor-pointer disabled:opacity-50">
              Зберегти
            </button>
            <button onClick={() => submit(true)} disabled={saving || !valid}
              className="flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold rounded-lg text-white transition-[filter] hover:brightness-110 cursor-pointer disabled:opacity-50"
              style={{ background: GOOGLE_BLUE, boxShadow: `0 6px 20px -8px ${GOOGLE_BLUE}` }}>
              <CalendarPlus size={13} />
              Зберегти і відкрити Календар
            </button>
          </div>
        </div>
      </div>
    </Modal>
  );
}
