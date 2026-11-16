import type { Prisma } from "@prisma/client";
import { NextResponse } from "next/server";
import { auth, OWNER_ID } from "@/lib/auth";
import { db, ensureSchema } from "@/lib/db";
import { getCrmSettings } from "@/lib/crmSettingsServer";
import { NOTIFY, PAGES, can, canPage, withImplied, type Access, type FunnelAction, type PageKey } from "@/lib/access";
import type { CrmSettings } from "@/lib/crmSettings";

// Who is calling and what they may do. Read fresh on every request, so role changes apply at once.
export async function getAccess(settings?: CrmSettings): Promise<Access | null> {
  const session = await auth();
  if (!session?.user) return null;
  const id = session.user.id ?? OWNER_ID;
  if (id === OWNER_ID) {
    return {
      owner: true, userId: OWNER_ID, name: session.user.name ?? "Власник", email: session.user.email ?? "",
      roleId: null, roleName: "Власник", pages: withImplied(PAGES.map((p) => p.key)), funnels: {}, notify: NOTIFY.map((n) => n.key),
    };
  }
  await ensureSchema();
  const user = await db.user.findUnique({ where: { id } });
  if (!user || !user.active) return null;
  const s = settings ?? (await getCrmSettings());
  const role = s.access.roles.find((r) => r.id === user.roleId);
  return {
    owner: false, userId: user.id, name: user.name, email: user.email,
    roleId: role?.id ?? null, roleName: role?.name ?? "Без ролі",
    pages: withImplied(role?.pages ?? []), funnels: role?.funnels ?? {}, notify: role?.notify ?? ["tasks"],
  };
}

export const unauthorized = () => NextResponse.json({ error: "Unauthorized" }, { status: 401 });
export const forbidden = (what = "Немає доступу") => NextResponse.json({ error: what }, { status: 403 });

// Real funnel of a lead (no funnelId = the first funnel).
export function leadFunnelId(settings: CrmSettings, funnelId: string | null | undefined): string {
  return settings.funnels.find((f) => f.id === funnelId)?.id ?? settings.funnels[0].id;
}

export function canLead(access: Access, settings: CrmSettings, funnelId: string | null | undefined, action: FunnelAction): boolean {
  return can(access, leadFunnelId(settings, funnelId), action);
}

// Prisma filter: leads of the funnels the user may see (owner → no filter).
export function visibleLeadsWhere(access: Access, settings: CrmSettings): Prisma.LeadWhereInput | null {
  if (access.owner) return null;
  const ids = settings.funnels.filter((f) => can(access, f.id, "view")).map((f) => f.id);
  const firstAllowed = ids.includes(settings.funnels[0].id);
  return { OR: [{ funnelId: { in: ids } }, ...(firstAllowed ? [{ funnelId: null }] : [])] };
}

// For route handlers: { access, settings } or a ready 401 / 403 response.
export async function requireAccess(page?: PageKey) {
  const settings = await getCrmSettings();
  const access = await getAccess(settings);
  if (!access) return { error: unauthorized() } as const;
  if (page && !canPage(access, page)) return { error: forbidden() } as const;
  return { access, settings } as const;
}
