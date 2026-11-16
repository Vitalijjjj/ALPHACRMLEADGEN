"use client";

import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  Briefcase, Camera, Check, CheckCircle2, Clock, ExternalLink, EyeOff, Gem, Gauge, Globe2, MapPin, MessageSquare, Repeat, Rocket, SlidersHorizontal, Sparkles, Tag, Trophy, Users, Wallet,
} from "lucide-react";
import DashHeader from "@/components/dashboard/DashHeader";
import PeriodPicker, { valueLabel, type PeriodValue } from "@/components/finance/PeriodPicker";
import TrendChart from "@/components/finance/TrendChart";
import { Card } from "@/components/finance/PnlHomeTab";
import { Modal } from "@/components/ui/modal";
import { PrivacyButton } from "@/components/ui/Privacy";
import { periodOf } from "@/lib/finance";

interface StoryData {
  doneP: number; doneAll: number; active: number; newP: number;
  launchDays: number | null; launchDaysP: number | null; fastest: number | null; progress: number | null;
  leadsP: number; clients: number; repeat: number; salesP: number; conv: number | null; check: number | null; turnoverP: number;
  niches: { label: string; n: number }[]; nichesCount: number;
  cities: { label: string; n: number }[]; citiesCount: number;
  months: { p: string; name: string; fresh: number; done: number }[];
  cases: { id: string; title: string; niche: string | null; url: string }[];
}

// what can be shown — «Налаштувати» picks them (remembered in this browser)
const TILES: { key: string; label: string }[] = [
  { key: "doneAll", label: "Здано за весь час" }, { key: "doneP", label: "Здано за місяць" }, { key: "active", label: "У роботі" },
  { key: "launch", label: "Термін запуску" }, { key: "newP", label: "Нових проєктів" }, { key: "repeat", label: "Повертаються" },
  { key: "leadsP", label: "Заявок" }, { key: "clients", label: "Нових клієнтів" }, { key: "conv", label: "Конверсія" },
  { key: "check", label: "Середній чек" }, { key: "turnover", label: "Оборот" },
];
const BLOCKS: { key: string; label: string }[] = [
  { key: "chart", label: "Проєкти по місяцях" }, { key: "niches", label: "Ніші" }, { key: "cities", label: "Географія" }, { key: "cases", label: "Свіжі кейси" },
];
const STORE = "story-hidden-v2";
const VALUES = "story-values"; // own numbers typed in «Налаштувати» instead of the counted ones
const eur = (v: number) => `€${Math.round(v).toLocaleString("uk-UA").replace(/\s/g, " ")}`;
const dn = (v: number | null) => (v === null ? "—" : v < 1 ? "< 1" : String(Math.round(v)));
const ymd = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

function rangeOf(v: PeriodValue): { from?: string; to?: string } {
  if (v.mode === "all") return {};
  if (v.mode === "range") return { from: v.from, to: v.to };
  const [y, m] = v.p.split("-").map(Number);
  return { from: `${v.p}-01`, to: ymd(new Date(y, m, 0)) };
}

// Дашборд → «Instagram»: the numbers to brag about to potential clients — of the picked month by default.
export default function StoryReport() {
  const [period, setPeriod] = useState<PeriodValue>(() => ({ mode: "period", p: periodOf(new Date(), 1) }));
  const [hidden, setHidden] = useState<string[]>([]);
  const [clean, setClean] = useState(false); // «для скріншота»: no buttons on the page
  const [edit, setEdit] = useState(false);
  const [custom, setCustom] = useState<Record<string, string>>({});
  useEffect(() => {
    try {
      const v = JSON.parse(localStorage.getItem(STORE) ?? "null");
      // eslint-disable-next-line react-hooks/set-state-in-effect -- remembered choice
      if (Array.isArray(v)) setHidden(v);
      const c = JSON.parse(localStorage.getItem(VALUES) ?? "null");
      if (c && typeof c === "object") setCustom(c);
    } catch { /* ignore */ }
  }, []);
  const setValue = (k: string, v: string) => setCustom((c) => {
    const n = { ...c };
    if (v.trim()) n[k] = v; else delete n[k];
    try { localStorage.setItem(VALUES, JSON.stringify(n)); } catch { /* ignore */ }
    return n;
  });
  const save = (n: string[]) => { setHidden(n); try { localStorage.setItem(STORE, JSON.stringify(n)); } catch { /* ignore */ } };
  const flip = (k: string) => save(hidden.includes(k) ? hidden.filter((x) => x !== k) : [...hidden, k]);
  const r = rangeOf(period);
  const q = useQuery({
    queryKey: ["story", r.from, r.to],
    queryFn: async (): Promise<StoryData> => {
      const res = await fetch(`/api/dashboard/story${r.from ? `?from=${r.from}&to=${r.to}` : ""}`);
      if (!res.ok) throw new Error(String(res.status));
      return res.json();
    },
    staleTime: 60_000,
    placeholderData: (p) => p,
  });
  const d = q.data;
  const on = (k: string) => !hidden.includes(k);
  const all = period.mode === "all";
  const label = all ? "за весь час" : period.mode === "range" ? valueLabel(period) : `за ${valueLabel(period).toLowerCase()}`;

  const header = (
    <DashHeader tab="story" right={<>
      <PrivacyButton />
      <button onClick={() => setEdit(true)} title="Що показувати у звіті"
        className="h-[38px] flex items-center gap-1.5 px-3 rounded-xl border border-[var(--border)] bg-[var(--surface)] text-sm text-[var(--text-muted)] hover:text-[var(--text)] cursor-pointer transition-colors">
        <SlidersHorizontal size={14} />Налаштувати
        {hidden.length > 0 && <span className="ml-0.5 px-1.5 rounded-md bg-white/[0.07] text-[11px] tabular-nums text-[var(--text-dim)]" title="Сховано">{hidden.length}</span>}
      </button>
      <button onClick={() => setClean((c) => !c)} title="Сховати кнопки — для скріншота"
        className={`h-[38px] flex items-center gap-1.5 px-3 rounded-xl border text-sm cursor-pointer transition-colors ${clean ? "border-[var(--accent)]/50 bg-[var(--accent)]/10 text-[var(--accent)]" : "border-[var(--border)] bg-[var(--surface)] text-[var(--text-muted)] hover:text-[var(--text)]"}`}>
        <Camera size={14} />{clean ? "Режим скріншота" : "Для скріншота"}
      </button>
      <PeriodPicker value={period} onChange={setPeriod} startDay={1} align="right" />
    </>} />
  );
  const modalFor = (current: Record<string, string>) => edit && (
    <EditModal hidden={hidden} all={all} custom={custom} current={current} onValue={setValue} onFlip={flip} onReset={() => save([])} onClose={() => setEdit(false)} />
  );
  const modal = modalFor({});
  if (!d) return <div className="p-3 sm:p-6 space-y-4 relative z-10">{header}<div className="py-16 text-center text-sm text-[var(--text-muted)]">{q.isError ? "Не вдалося завантажити" : "Завантаження…"}</div>{modal}</div>;

  const counted: TileProps[] = [
    { k: "doneAll", icon: Trophy, color: "#F5B530", label: "Здано проєктів", value: String(d.doneAll), sub: "за весь час" },
    ...(all ? [] : [{ k: "doneP", icon: CheckCircle2, color: "#4ade80", label: "Здано", value: String(d.doneP), sub: label }]),
    { k: "active", icon: Rocket, color: "#a78bfa", label: "У роботі", value: String(d.active), sub: d.progress !== null ? `готові в середньому на ${d.progress}%` : "прямо зараз", progress: d.progress },
    { k: "launch", icon: Clock, color: "#22d3ee", label: "Термін запуску", value: d.launchDays === null ? "—" : `${dn(d.launchDays)} дн.`, sub: d.fastest !== null ? `найшвидший — ${dn(d.fastest)} дн.` : "від старту до здачі" },
    { k: "newP", icon: Sparkles, color: "#f472b6", label: "Нових проєктів", value: String(d.newP), sub: label },
    { k: "repeat", icon: Repeat, color: "#34d399", label: "Повертаються", value: String(d.repeat), sub: "клієнтів замовили ще раз" },
    { k: "leadsP", icon: MessageSquare, color: "#fb923c", label: "Заявок", value: String(d.leadsP), sub: label },
    { k: "clients", icon: Users, color: "#60a5fa", label: "Нових клієнтів", value: String(d.clients), sub: label },
    { k: "conv", icon: Gauge, color: "#c084fc", label: "Конверсія", value: d.conv === null ? "—" : `${Math.round(d.conv)}%`, sub: "заявок стають клієнтами" },
    { k: "check", icon: Wallet, color: "#facc15", label: "Середній чек", value: d.check === null ? "—" : eur(d.check), sub: label, money: true },
    // turnover only of a month / range — «за весь час» is not a number to show
    ...(all ? [] : [{ k: "turnover", icon: Gem, color: "#22c55e", label: "Оборот", value: eur(d.turnoverP), sub: label, money: true }]),
  ];
  // own number from «Налаштувати» wins over the counted one
  const tiles = counted.filter((x) => on(x.k)).map((x) => (custom[x.k]?.trim() ? { ...x, value: custom[x.k].trim(), own: !clean } : x));
  const pageModal = modalFor(Object.fromEntries(counted.map((x) => [x.k, x.value])));
  const maxNiche = Math.max(1, ...d.niches.map((x) => x.n));
  const eye = (k: string) => (clean ? null : (
    <button onClick={() => flip(k)} title="Сховати"
      className="p-1 rounded-md text-[var(--text-dim)] hover:text-[var(--text)] hover:bg-white/[0.06] opacity-0 group-hover:opacity-100 transition-opacity cursor-pointer"><EyeOff size={13} /></button>
  ));

  return (
    <div className="p-3 sm:p-6 space-y-4 relative z-10">
      {header}

      {tiles.length > 0 && (
        <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-2.5">
          {tiles.map((t) => <Tile key={t.k} {...t} eye={eye(t.k)} />)}
        </div>
      )}

      {on("chart") && (
        <div className="group">
          <Card icon={Briefcase} color="#a78bfa" title="Проєкти по місяцях" right={eye("chart")}>
            <TrendChart data={d.months} height={240} storeKey="story-chart-view" defaultView="bars" showChange={false} series={[
              { key: "fresh", label: "Нові проєкти", color: "#a78bfa", fmt: (v: number) => String(Math.round(v)) },
              { key: "done", label: "Здано", color: "#F5B530", fmt: (v: number) => String(Math.round(v)) },
            ]} />
          </Card>
        </div>
      )}

      {(on("niches") || on("cities")) && (
        <div className={`grid grid-cols-1 gap-2.5 ${on("niches") && on("cities") ? "lg:grid-cols-2" : ""}`}>
          {on("niches") && (
            <div className="group">
              <Card icon={Tag} color="#f472b6" title="Ніші" right={<span className="flex items-center gap-2"><span className="text-[11px] text-[var(--text-dim)]">{d.nichesCount} · {label}</span>{eye("niches")}</span>}>
                {!d.niches.length ? <div className="text-xs text-[var(--text-dim)] py-4 text-center">Ніші ще не заповнені в угодах цього періоду</div> : (
                  <div className="space-y-2.5">
                    {d.niches.map((x, i) => (
                      <div key={x.label}>
                        <div className="flex justify-between text-xs mb-1"><span className="text-[var(--text-muted)] truncate">{x.label}</span><span className="tabular-nums text-[var(--text)]">{x.n}</span></div>
                        <div className="h-1.5 rounded-full bg-white/[0.05] overflow-hidden"><div className="h-full rounded-full" style={{ width: `${(x.n / maxNiche) * 100}%`, background: `hsl(${330 - i * 22} 85% 65%)` }} /></div>
                      </div>
                    ))}
                  </div>
                )}
              </Card>
            </div>
          )}
          {on("cities") && (
            <div className="group">
              <Card icon={Globe2} color="#22d3ee" title="Географія" right={<span className="flex items-center gap-2"><span className="text-[11px] text-[var(--text-dim)]">{d.citiesCount} · {label}</span>{eye("cities")}</span>}>
                {!d.cities.length ? <div className="text-xs text-[var(--text-dim)] py-4 text-center">Гео ще не заповнене в угодах цього періоду</div> : (
                  <div className="flex flex-wrap gap-1.5">
                    {d.cities.map((c) => (
                      <span key={c.label} className="flex items-center gap-1.5 pl-2 pr-2.5 py-1 rounded-lg bg-white/[0.04] text-xs text-[var(--text)]">
                        <MapPin size={11} className="text-[#22d3ee]" />{c.label}<span className="text-[var(--text-dim)] tabular-nums">{c.n}</span>
                      </span>
                    ))}
                  </div>
                )}
              </Card>
            </div>
          )}
        </div>
      )}

      {on("cases") && (
        <div className="group">
          <Card icon={Gem} color="#F5B530" title="Свіжі кейси" right={eye("cases")}>
            {!d.cases.length ? <div className="text-xs text-[var(--text-dim)] py-4 text-center">За цей період кейсів немає — посилання додають при здачі проєкту або в «Кейсах»</div> : (
              <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-2">
                {d.cases.map((c) => (
                  <a key={c.id} href={c.url} target="_blank" rel="noopener noreferrer"
                    className="flex items-center gap-2.5 px-3 py-2.5 rounded-xl bg-white/[0.03] hover:bg-white/[0.06] transition-colors">
                    <span className="w-7 h-7 rounded-lg flex items-center justify-center bg-[#F5B530]/12 text-[#F5B530] shrink-0"><Globe2 size={14} /></span>
                    <span className="min-w-0 flex-1">
                      <span className="block text-sm text-[var(--text)] truncate">{c.url.replace(/^https?:\/\/(www\.)?/i, "").replace(/\/$/, "")}</span>
                      <span className="block text-[11px] text-[var(--text-dim)] truncate">{c.niche || c.title}</span>
                    </span>
                    <ExternalLink size={13} className="text-[var(--text-dim)] shrink-0" />
                  </a>
                ))}
              </div>
            )}
          </Card>
        </div>
      )}
      {pageModal}
    </div>
  );
}

interface TileProps { k: string; icon: typeof Trophy; color: string; label: string; value: string; sub?: string; money?: boolean; progress?: number | null; own?: boolean }

// the same tile as «Фінанси»
function Tile({ icon: I, color, label, value, sub, money, progress, own, eye }: TileProps & { eye: React.ReactNode }) {
  return (
    <section className="group relative overflow-hidden rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-4">
      <div className="absolute -top-14 -right-10 w-40 h-40 rounded-full blur-3xl opacity-[0.12] pointer-events-none" style={{ background: color }} />
      <div className="relative flex items-center gap-2.5">
        <span className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0" style={{ color, background: `${color}1f` }}><I size={15} /></span>
        <span className="flex-1 min-w-0 text-[11px] uppercase tracking-wider text-[var(--text-muted)] truncate">{label}</span>
        <span className="absolute -top-1 -right-1">{eye}</span>
      </div>
      <div className="relative mt-3 text-2xl font-bold tabular-nums text-[var(--text)]" data-private={money ? "amount" : undefined}>
        {value}{own && <span title="Своя цифра з «Налаштувати»" className="ml-1.5 align-top text-[10px] font-medium text-[var(--accent)]">своя</span>}
      </div>
      {sub && <div className="relative mt-0.5 text-[11px] text-[var(--text-dim)] truncate">{sub}</div>}
      {progress != null && <div className="relative mt-2 h-1 rounded-full bg-white/[0.06] overflow-hidden"><div className="h-full rounded-full" style={{ width: `${progress}%`, background: color }} /></div>}
    </section>
  );
}

// «Налаштувати»: tick what the report shows; hidden ones come back from here
function EditModal({ hidden, all, custom, current, onValue, onFlip, onReset, onClose }: {
  hidden: string[]; all: boolean; custom: Record<string, string>; current: Record<string, string>;
  onValue: (k: string, v: string) => void; onFlip: (k: string) => void; onReset: () => void; onClose: () => void;
}) {
  const row = (b: { key: string; label: string }, withValue = false) => {
    const shown = !hidden.includes(b.key);
    const na = all && (b.key === "doneP" || b.key === "turnover");
    const btn = (
      <button key={b.key} onClick={() => onFlip(b.key)} title={na ? "Не показується за весь час" : undefined}
        className="flex-1 min-w-0 flex items-center gap-2.5 px-2.5 py-2 rounded-lg text-left hover:bg-white/[0.05] cursor-pointer transition-colors">
        <span className={`w-4 h-4 shrink-0 rounded-[5px] border flex items-center justify-center transition-colors ${shown ? "bg-[var(--accent)] border-[var(--accent)]" : "border-white/25"}`}>
          {shown && <Check size={11} strokeWidth={3} className="text-black" />}
        </span>
        <span className={`flex-1 text-sm ${shown ? "text-[var(--text)]" : "text-[var(--text-muted)]"}`}>{b.label}</span>
        {na && <span className="text-[10px] text-[var(--text-dim)]">лише за місяць</span>}
      </button>
    );
    if (!withValue) return btn;
    // own number: typed → shown instead of the counted one (empty = counted)
    return (
      <div key={b.key} className="flex items-center gap-1.5">
        <input value={custom[b.key] ?? ""} onChange={(e) => onValue(b.key, e.target.value)} placeholder={current[b.key] ?? "—"}
          title="Своя цифра замість порахованої (порожньо — рахує CRM)"
          className={`w-24 shrink-0 h-8 px-2 rounded-lg bg-[var(--surface-2)] border text-sm tabular-nums text-[var(--text)] placeholder:text-[var(--text-dim)] outline-none focus:border-[var(--accent)] ${custom[b.key] ? "border-[var(--accent)]/50" : "border-[var(--border)]"}`} />
        {btn}
      </div>
    );
  };
  return (
    <Modal open onClose={onClose} title="Що показувати" size="lg">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-4">
        <div>
          <div className="px-2.5 pb-1 text-[10px] uppercase tracking-wider text-[var(--text-dim)]">Цифри</div>
          <div className="px-2.5 pb-1.5 text-[10px] text-[var(--text-dim)]">ліворуч — своя цифра замість порахованої</div>
          {TILES.map((b) => row(b, true))}
        </div>
        <div>
          <div className="px-2.5 pb-1 pt-3 sm:pt-0 text-[10px] uppercase tracking-wider text-[var(--text-dim)]">Блоки</div>
          {BLOCKS.map((b) => row(b))}
        </div>
      </div>
      <div className="mt-4 flex items-center justify-between gap-2">
        <button onClick={() => { onReset(); Object.keys(custom).forEach((k) => onValue(k, "")); }} disabled={!hidden.length && !Object.keys(custom).length} className="h-9 px-3 rounded-xl text-sm text-[var(--text-muted)] hover:text-[var(--text)] cursor-pointer disabled:opacity-40 disabled:cursor-default">Скинути все</button>
        <button onClick={onClose} className="h-9 px-4 rounded-xl text-sm font-semibold text-black cursor-pointer hover:brightness-110" style={{ background: "var(--accent)" }}>Готово</button>
      </div>
    </Modal>
  );
}
