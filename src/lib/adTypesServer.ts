import { db, ensureSchema } from "@/lib/db";
import { AD_SETTINGS_KEY, normalizeAdSettings, type AdSettings } from "@/lib/adTypes";

export async function getAdSettings(): Promise<AdSettings> {
  await ensureSchema();
  const row = await db.setting.findUnique({ where: { key: AD_SETTINGS_KEY } });
  return normalizeAdSettings(row?.value);
}

export async function saveAdSettings(v: unknown): Promise<AdSettings> {
  const clean = normalizeAdSettings(v);
  await db.setting.upsert({
    where: { key: AD_SETTINGS_KEY },
    create: { key: AD_SETTINGS_KEY, value: clean as object },
    update: { value: clean as object },
  });
  return clean;
}
