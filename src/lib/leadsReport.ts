// «Ліди і конверсії» — shared types + counting (runs in the browser, so filters / clicks are instant).

export interface ReportLead {
  id: string; n: number; name: string; eur: number; // number, title, amount in €
  d: string;          // created yyyy-mm-dd
  c: string | null;   // closed yyyy-mm-dd
  inR: boolean;       // created inside the range
  src: string;        // source (ad type name or lead source)
  ad: boolean;        // ad source (spend from the cashflow)
  camp: string | null;
  st: string;         // current stage id
  k: "a" | "w" | "l"; // active / win / loss
  r: string | null;   // loss reason id
  // the day each step was reached (null = not reached)
  tD: string | null;  // цільовий
  qD: string | null;  // «Кваліфіковано»
  pD: string | null;  // КП
  wD: string | null;  // продаж
}
export interface LeadsReportData {
  from: string; to: string;
  stages: { id: string; label: string; color: string; kind: string }[];
  reasons: { id: string; label: string }[];
  adTypes: { name: string; color: string }[];
  leads: ReportLead[];
  spend: { src: string; camp: string | null; uah: number }[];
}

export interface Counts {
  // what happened in the range — every step on its own day
  leads: number; targeted: number; qualified: number; proposals: number; sales: number;
  // what became of the leads that came in the range
  work: number; lost: number; lostTargeted: number; dup: number; notTarget: number; soldOfNew: number;
  // step conversion: of those who reached the previous step in the range, how many went on (any time later)
  cv: { targeted: [number, number]; qualified: [number, number]; proposals: [number, number]; sales: [number, number] };
}
export const zeroCounts = (): Counts => ({
  leads: 0, targeted: 0, qualified: 0, proposals: 0, sales: 0, work: 0, lost: 0, lostTargeted: 0, dup: 0, notTarget: 0, soldOfNew: 0,
  cv: { targeted: [0, 0], qualified: [0, 0], proposals: [0, 0], sales: [0, 0] },
});

export function countOf(leads: ReportLead[], r: { from: string; to: string }): Counts {
  const c = zeroCounts();
  const inn = (x: string | null) => !!x && x >= r.from && x <= r.to;
  const step = (k: keyof Counts["cv"], base: boolean, next: string | null) => { if (base) { c.cv[k][1]++; if (next) c.cv[k][0]++; } };
  for (const l of leads) {
    if (l.inR) {
      c.leads++;
      if (l.k === "a") c.work++;
      if (l.wD) c.soldOfNew++;
      if (l.k === "l") {
        c.lost++;
        if (l.tD) c.lostTargeted++;
        if (l.r === "DUPLICATE") c.dup++;
        if (l.r === "NOT_TARGET") c.notTarget++;
      }
    }
    if (inn(l.tD)) c.targeted++;
    if (inn(l.qD)) c.qualified++;
    if (inn(l.pD)) c.proposals++;
    if (inn(l.wD)) c.sales++;
    step("targeted", l.inR, l.tD);
    step("qualified", inn(l.tD), l.qD);
    step("proposals", inn(l.qD), l.pD);
    step("sales", inn(l.pD), l.wD);
  }
  return c;
}
export const ratio = ([n, base]: [number, number]) => (base > 0 ? (n / base) * 100 : null);

export const OTHER_COLORS = ["#a78bfa", "#34d399", "#f472b6", "#fbbf24", "#60a5fa", "#fb923c", "#2dd4bf", "#e879f9", "#94a3b8"];
export function sourceColor(name: string, adTypes: { name: string; color: string }[]) {
  const t = adTypes.find((x) => x.name.toLowerCase() === name.toLowerCase());
  if (t) return t.color;
  if (name === "Не вказано") return "#6b7280";
  const h = [...name].reduce((a, ch) => (a * 31 + ch.charCodeAt(0)) | 0, 7);
  return OTHER_COLORS[Math.abs(h) % OTHER_COLORS.length];
}
