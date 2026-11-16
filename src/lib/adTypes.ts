// Типи рекламного трафіку (налаштовуються на сторінці «Реклама»). Витрати — завжди з кешфлоу («Реклама» → кампанія).
// mode: daily / total — тип з кампаніями (Таргет, Автопрозвон); spend — «загально», без кампаній (Контекст):
//       у нього одна кампанія з назвою типу, її вибирають у кешфлоу.
export type AdMode = "daily" | "total" | "spend";
export interface AdType { name: string; color: string; mode: AdMode }
export interface AdSettings { types: AdType[] }

export const AD_SETTINGS_KEY = "ads";
export const AD_MODES: { key: AdMode; label: string; hint: string }[] = [
  { key: "daily", label: "З кампаніями", hint: "у кешфлоу вибираєш конкретну кампанію (як Таргет)" },
  { key: "spend", label: "Загально", hint: "без кампаній — у кешфлоу вибираєш сам тип (як Контекст)" },
];
export const isGeneral = (t: AdType | null | undefined) => t?.mode === "spend";
export const AD_COLORS = ["#C98C0A", "#22d3ee", "#38bdf8", "#a855f7", "#f472b6", "#22c55e", "#f97316", "#ef4444"];

export const defaultAdSettings = (): AdSettings => ({
  types: [
    { name: "Таргет", color: "#C98C0A", mode: "daily" },
    { name: "Автопрозвон", color: "#22d3ee", mode: "total" },
    { name: "Контекст", color: "#38bdf8", mode: "spend" },
  ],
});

export function normalizeAdSettings(raw: unknown): AdSettings {
  const d = defaultAdSettings();
  const v = raw && typeof raw === "object" ? (raw as Partial<AdSettings>) : {};
  if (!Array.isArray(v.types)) return d;
  const seen = new Set<string>();
  const types = v.types
    .filter((t): t is AdType => !!t && typeof t.name === "string" && !!t.name.trim())
    .map((t) => ({
      name: t.name.trim(),
      color: typeof t.color === "string" && /^#[0-9a-f]{6}$/i.test(t.color) ? t.color : "#C98C0A",
      mode: (["daily", "total", "spend"] as const).includes(t.mode) ? t.mode : "daily",
    }))
    .filter((t) => (seen.has(t.name.toLowerCase()) ? false : (seen.add(t.name.toLowerCase()), true)));
  return { types: types.length ? types : d.types };
}

export const findType = (s: AdSettings, name: string | null | undefined) =>
  name ? s.types.find((t) => t.name.toLowerCase() === name.trim().toLowerCase()) ?? null : null;
