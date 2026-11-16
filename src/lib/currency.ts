// Lead amounts can be in EUR, UAH or USD. Totals (Overview, kanban sums…) are always shown in EUR,
// converted with the NBU rate stored in the DB (Setting "fx") — see fxServer.ts / useFx.ts.

export const CURRENCIES = ["EUR", "UAH", "USD"] as const;
export type Currency = (typeof CURRENCIES)[number];

export const CURRENCY_SYMBOL: Record<Currency, string> = { EUR: "€", UAH: "₴", USD: "$" };
export const CURRENCY_LABEL: Record<Currency, string> = { EUR: "Євро", UAH: "Гривня", USD: "Долар" };

export interface FxRates {
  eurUah: number;    // 1 EUR = x UAH
  usdUah: number;    // 1 USD = x UAH
  date: string;      // NBU rate date, "12.11.2026"
  fetchedAt: string; // ISO, when we last asked NBU
  fallback?: boolean; // true = NBU never answered, rough built-in rate
}

// Used only until the first successful NBU request.
export const FALLBACK_FX: FxRates = { eurUah: 48, usdUah: 41.5, date: "—", fetchedAt: new Date(0).toISOString(), fallback: true };

export function asCurrency(v: unknown): Currency {
  return CURRENCIES.includes(v as Currency) ? (v as Currency) : "EUR";
}

// Amount in its own currency → EUR.
export function toEur(amount: number | null | undefined, currency: string | null | undefined, fx: FxRates): number {
  if (!amount) return 0;
  const c = asCurrency(currency);
  if (c === "EUR") return amount;
  if (c === "UAH") return amount / fx.eurUah;
  return (amount * fx.usdUah) / fx.eurUah;
}

// "€1 800", "₴45 000", "$2 000"
export function formatMoney(amount: number | null | undefined, currency?: string | null): string {
  const c = asCurrency(currency);
  return `${CURRENCY_SYMBOL[c]}${Math.round(amount ?? 0).toLocaleString("uk-UA")}`;
}

// Short form for tight places: "€1.8k"
export function formatMoneyShort(amount: number, currency?: string | null): string {
  const s = CURRENCY_SYMBOL[asCurrency(currency)];
  if (amount >= 1_000_000) return `${s}${(amount / 1_000_000).toFixed(1).replace(/\.0$/, "")}M`;
  if (amount >= 10_000) return `${s}${Math.round(amount / 1000)}k`;
  return `${s}${Math.round(amount).toLocaleString("uk-UA")}`;
}
