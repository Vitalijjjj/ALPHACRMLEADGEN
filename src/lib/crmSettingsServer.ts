import { db, ensureSchema } from "@/lib/db";
import { CRM_SETTINGS_KEY, normalizeCrmSettings, type CrmSettings } from "@/lib/crmSettings";

export async function getCrmSettings(): Promise<CrmSettings> {
  await ensureSchema();
  const row = await db.setting.findUnique({ where: { key: CRM_SETTINGS_KEY } });
  return normalizeCrmSettings(row?.value);
}

// Prisma filter for "leads of this funnel" (the first funnel also owns leads without funnelId).
export function funnelWhere(settings: CrmSettings, funnelId: string) {
  return settings.funnels[0]?.id === funnelId
    ? { OR: [{ funnelId: null }, { funnelId }] }
    : { funnelId };
}
