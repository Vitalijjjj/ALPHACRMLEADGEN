import { db, ensureSchema } from "@/lib/db";
import { FALLBACK_FX, type FxRates } from "@/lib/currency";

// NBU rates are stored in Setting "fx" and are NOT fetched on every page view:
//  • once after the server starts (if the stored rate is older than 30 min),
//  • and when the user presses «Оновити» next to the rate in the header.
const KEY = "fx";
const NBU_URL = "https://bank.gov.ua/NBUStatService/v1/statdirectory/exchange?json";
let refreshedThisProcess = false;

async function readStored(): Promise<FxRates | null> {
  const row = await db.setting.findUnique({ where: { key: KEY } });
  const v = row?.value as Partial<FxRates> | undefined;
  if (!v || typeof v.eurUah !== "number" || typeof v.usdUah !== "number") return null;
  return { eurUah: v.eurUah, usdUah: v.usdUah, date: String(v.date ?? "—"), fetchedAt: String(v.fetchedAt ?? new Date(0).toISOString()) };
}

async function fetchNbu(): Promise<FxRates> {
  const res = await fetch(NBU_URL, { cache: "no-store", signal: AbortSignal.timeout(8000) });
  if (!res.ok) throw new Error(`NBU HTTP ${res.status}`);
  const list = (await res.json()) as { cc: string; rate: number; exchangedate: string }[];
  const eur = list.find((x) => x.cc === "EUR");
  const usd = list.find((x) => x.cc === "USD");
  if (!eur || !usd) throw new Error("NBU: no EUR/USD");
  const fx: FxRates = { eurUah: eur.rate, usdUah: usd.rate, date: eur.exchangedate, fetchedAt: new Date().toISOString() };
  await db.setting.upsert({
    where: { key: KEY },
    create: { key: KEY, value: fx as object },
    update: { value: fx as object },
  });
  return fx;
}

export async function getFx(opts: { refresh?: boolean } = {}): Promise<FxRates> {
  await ensureSchema();
  const stored = await readStored();
  const old = !stored || Date.now() - new Date(stored.fetchedAt).getTime() > 30 * 60 * 1000;
  if (opts.refresh || !stored || (!refreshedThisProcess && old)) {
    refreshedThisProcess = true;
    try {
      return await fetchNbu();
    } catch (e) {
      console.error("NBU rate fetch failed:", e);
      if (opts.refresh) throw e;
    }
  }
  refreshedThisProcess = true;
  return stored ?? FALLBACK_FX;
}
