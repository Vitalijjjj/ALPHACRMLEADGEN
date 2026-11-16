import { NextRequest, NextResponse } from "next/server";
import { requireAccess } from "@/lib/accessServer";
import { db, ensureSchema } from "@/lib/db";
import { LEGACY_MIGRATION, LEAD_STATUSES } from "@/lib/leadOptions";
import { getCrmSettings } from "@/lib/crmSettingsServer";
import { workdaysAt } from "@/lib/taskAutomation";

const NEW_LABEL: Record<string, string> = { ...Object.fromEntries(LEAD_STATUSES.map((s) => [s.value, s.label])), LOST: "Програш", WON: "Виграш" };

// Old stage codes → current funnel (see LEGACY_MIGRATION).
//   GET    → preview: how many leads per old code would move, and how many were already moved (can be rolled back)
//   POST   → run the migration. Body: { history?: boolean } — also write a note to each lead's timeline
//   DELETE → roll back leads that are still on the stage they were moved to

const OLD_CODES = Object.keys(LEGACY_MIGRATION);

async function preview() {
  const [pending, migrated] = await Promise.all([
    db.lead.groupBy({ by: ["status"], where: { status: { in: OLD_CODES } }, _count: { _all: true } }),
    db.lead.count({ where: { legacyStatus: { not: null } } }),
  ]);
  // how many tasks each old code would get (task.since = only leads created from that date)
  const withTasks = await Promise.all(pending.map(async (g) => {
    const t = LEGACY_MIGRATION[g.status].task;
    if (!t) return 0;
    return t.since
      ? db.lead.count({ where: { status: g.status, createdAt: { gte: new Date(t.since) } } })
      : g._count._all;
  }));
  const rows = pending
    .map((g, i) => ({ from: g.status, ...LEGACY_MIGRATION[g.status], count: g._count._all, tasks: withTasks[i] }))
    .sort((a, b) => OLD_CODES.indexOf(a.from) - OLD_CODES.indexOf(b.from));
  return { rows, total: rows.reduce((s, r) => s + r.count, 0), migrated };
}

export async function GET() {
  const gate = await requireAccess("settings");
  if ("error" in gate) return gate.error;
  try {
    await ensureSchema();
    return NextResponse.json(await preview());
  } catch (e) {
    console.error("GET /api/settings/migrate-legacy:", e);
    return NextResponse.json({ error: "DB error", detail: String(e) }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  const gate = await requireAccess("settings");
  if ("error" in gate) return gate.error;
  try {
    const { history = false } = await req.json().catch(() => ({}));
    await ensureSchema();
    const leads = await db.lead.findMany({
      where: { status: { in: OLD_CODES } },
      select: { id: true, status: true, closeReason: true, createdAt: true },
    });
    const settings = await getCrmSettings();

    // Tasks from the mapping: oldest leads first, next working day from 10:00, 15 min apart.
    const taskLeads = leads
      .filter((l) => { const t = LEGACY_MIGRATION[l.status].task; return t && (!t.since || l.createdAt >= new Date(t.since)); })
      .sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());
    const start = workdaysAt(new Date(), 0, "10:00", settings.tasks.timezone).getTime();
    const weekAgo = Date.now() - 7 * 86_400_000;
    const tasks = taskLeads.map((l, i) => {
      const m = LEGACY_MIGRATION[l.status];
      return {
        title: m.task!.title,
        deadline: new Date(start + i * 15 * 60_000),
        priority: (l.createdAt.getTime() < weekAgo ? "URGENT" : "HIGH") as "URGENT" | "HIGH",
        status: "TODO" as const,
        assignee: settings.tasks.defaultAssignee || null,
        leadId: l.id,
        autoKind: "migration",
        autoStage: m.status,
      };
    });

    await db.$transaction(async (tx) => {
      for (const code of OLD_CODES) {
        const m = LEGACY_MIGRATION[code];
        const ids = leads.filter((l) => l.status === code).map((l) => l.id);
        if (!ids.length) continue;
        // keep an existing close reason; old loss codes become the reason otherwise
        await tx.lead.updateMany({
          where: { id: { in: ids }, ...(m.reason ? { closeReason: null } : {}) },
          data: { status: m.status, legacyStatus: code, ...(m.reason ? { closeReason: code } : {}) },
        });
        if (m.reason) {
          await tx.lead.updateMany({ where: { id: { in: ids }, status: code }, data: { status: m.status, legacyStatus: code } });
        }
        if (history) {
          await tx.activity.createMany({
            data: ids.map((leadId) => ({
              leadId,
              type: "STATUS_CHANGE" as const,
              content: `Стадію оновлено під нову воронку: ${m.label} → ${NEW_LABEL[m.status] ?? m.status}`,
            })),
          });
        }
        if (m.note) {
          await tx.activity.createMany({ data: ids.map((leadId) => ({ leadId, type: "NOTE" as const, content: m.note! })) });
        }
      }
      if (tasks.length) {
        await tx.task.createMany({ data: tasks });
        await tx.activity.createMany({
          data: tasks.map((t) => ({ leadId: t.leadId, type: "TASK_CREATED" as const, content: `Задача створена: ${t.title}` })),
        });
      }
    }, { timeout: 60_000 });

    return NextResponse.json({ moved: leads.length, tasks: tasks.length, ...(await preview()) });
  } catch (e) {
    console.error("POST /api/settings/migrate-legacy:", e);
    return NextResponse.json({ error: "DB error", detail: String(e) }, { status: 500 });
  }
}

export async function DELETE() {
  const gate = await requireAccess("settings");
  if ("error" in gate) return gate.error;
  try {
    await ensureSchema();
    let restored = 0;
    await db.$transaction(async (tx) => {
      for (const code of OLD_CODES) {
        const m = LEGACY_MIGRATION[code];
        // only leads that nobody moved since the migration
        const back = await tx.lead.findMany({ where: { legacyStatus: code, status: m.status }, select: { id: true } });
        // the tasks the migration created (not done yet) go away too
        if (back.length) {
          await tx.task.deleteMany({ where: { leadId: { in: back.map((b) => b.id) }, autoKind: "migration", status: { not: "DONE" } } });
        }
        const res = await tx.lead.updateMany({
          where: { legacyStatus: code, status: m.status },
          data: { status: code, legacyStatus: null, ...(m.reason ? { closeReason: null } : {}) },
        });
        restored += res.count;
      }
    }, { timeout: 60_000 });
    return NextResponse.json({ restored, ...(await preview()) });
  } catch (e) {
    console.error("DELETE /api/settings/migrate-legacy:", e);
    return NextResponse.json({ error: "DB error", detail: String(e) }, { status: 500 });
  }
}
