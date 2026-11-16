import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db, ensureSchema } from "@/lib/db";
import { CRM_SETTINGS_KEY, normalizeCrmSettings } from "@/lib/crmSettings";
import { getCrmSettings } from "@/lib/crmSettingsServer";
import { requireAccess } from "@/lib/accessServer";

export async function GET() {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    return NextResponse.json(await getCrmSettings());
  } catch (e) {
    console.error("GET /api/settings:", e);
    return NextResponse.json({ error: "DB error", detail: String(e) }, { status: 500 });
  }
}

export async function PUT(req: NextRequest) {
  const gate = await requireAccess("settings");
  if ("error" in gate) return gate.error;

  try {
    const settings = normalizeCrmSettings(await req.json());
    // roles are changed only by the owner
    if (!gate.access.owner) settings.access = gate.settings.access;
    await ensureSchema();
    await db.setting.upsert({
      where: { key: CRM_SETTINGS_KEY },
      create: { key: CRM_SETTINGS_KEY, value: settings as object },
      update: { value: settings as object },
    });
    return NextResponse.json(settings);
  } catch (e) {
    console.error("PUT /api/settings:", e);
    return NextResponse.json({ error: "DB error", detail: String(e) }, { status: 500 });
  }
}
