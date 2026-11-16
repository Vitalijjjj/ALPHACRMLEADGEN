import { NextRequest, NextResponse } from "next/server";
import { db, ensureSchema } from "@/lib/db";
import { statusMatchValues, POTENTIAL_STATUSES } from "@/lib/leadOptions";
import { getCrmSettings, funnelWhere } from "@/lib/crmSettingsServer";
import { buildFilterWhere, parseFilterQuery, searchWhere } from "@/lib/leadFilterServer";
import { asCurrency } from "@/lib/currency";
import { cleanPhone } from "@/lib/leadFilter";
import { canLead, forbidden, requireAccess, visibleLeadsWhere } from "@/lib/accessServer";
import { syncStageTasks } from "@/lib/taskAutomationServer";
import { logCreation } from "@/lib/stageFlowServer";

export async function GET(req: NextRequest) {
  const gate = await requireAccess();
  if ("error" in gate) return gate.error;
  const { access, settings: accessSettings } = gate;

  const { searchParams } = new URL(req.url);
  const search = searchParams.get("q") ?? "";
  const status = searchParams.get("status") ?? undefined;
  const source = searchParams.get("source") ?? undefined;
  const campaign = searchParams.get("campaign") ?? undefined;
  const dateFrom = searchParams.get("dateFrom") ?? undefined;
  const dateTo = searchParams.get("dateTo") ?? undefined;
  const funnel = searchParams.get("funnel") ?? undefined;
  // Вкладка Potential: гарячі стадії + всі ліди із запланованим пушем
  const potential = searchParams.get("potential") === "1";

  // Campaign name is stored in Lead.sourceDetail (e.g. for "Таргет" source).
  const createdAt: { gte?: Date; lte?: Date } = {};
  if (dateFrom) createdAt.gte = new Date(dateFrom);
  if (dateTo) {
    const end = new Date(dateTo);
    end.setHours(23, 59, 59, 999);
    createdAt.lte = end;
  }

  try {
    await ensureSchema();
    const funnelFilter = funnel ? funnelWhere(await getCrmSettings(), funnel) : null;
    const potentialValues = POTENTIAL_STATUSES.flatMap(statusMatchValues);
    const filterQuery = parseFilterQuery(searchParams.get("f"));
    const [filterAnd, searchFilter] = await Promise.all([
      filterQuery ? buildFilterWhere(filterQuery) : Promise.resolve([]),
      searchWhere(search),
    ]);
    const leads = await db.lead.findMany({
      where: {
        AND: [
          ...(funnelFilter ? [funnelFilter] : []),
          // only funnels this user may see
          ...(visibleLeadsWhere(access, accessSettings) ? [visibleLeadsWhere(access, accessSettings)!] : []),
          // НДЗ (Недозвон) у Potential не показується, навіть якщо на ліда запланований пуш
          ...(potential
            ? [
                { OR: [{ status: { in: potentialValues } }, { pushAt: { not: null } }] },
                { status: { not: "MISSED_CALL" } },
              ]
            : []),
          ...filterAnd,
          ...(searchFilter ? [searchFilter] : []),
        ],
        // status may be a comma-separated list: ?status=NEW_LEAD,PROPOSAL
        ...(status
          ? { status: { in: status.split(",").map((v) => v.trim()).filter(Boolean).flatMap(statusMatchValues) } }
          : {}),
        ...(source ? { source: { equals: source, mode: "insensitive" } } : {}),
        ...(campaign ? { sourceDetail: { equals: campaign, mode: "insensitive" } } : {}),
        ...(createdAt.gte || createdAt.lte ? { createdAt } : {}),
      },
      include: { _count: { select: { tasks: true, deals: true } } },
      orderBy: { updatedAt: "desc" },
    });

    return NextResponse.json(leads);
  } catch (e) {
    console.error("GET /api/leads:", e);
    return NextResponse.json({ error: "DB error", detail: String(e) }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  const gate = await requireAccess();
  if ("error" in gate) return gate.error;
  const { access, settings: accessSettings } = gate;

  const body = await req.json();
  const {
    name, instagram, telegram, phone, email, comment, source, sourceDetail, geo, niche, amount, tags, status,
    siteStructure, hasExtraLang, languages, service, paymentSystem, usedServices, projectDeadline, pushAt, pushComment, pushStage, messenger, createdAt,
    funnelId, closeReason, currency, projectName, payer, partnerId,
  } = body;

  if (!canLead(access, accessSettings, funnelId, "create")) return forbidden("Немає права додавати угоди в цю воронку");

  // Name is optional — a lead without a name is shown as «Угода #<last digits of phone>».
  if (!name?.trim() && !(phone && cleanPhone(String(phone)))) {
    return NextResponse.json({ error: "Вкажіть імʼя або телефон" }, { status: 400 });
  }

  const cleanInstagram = instagram ? instagram.replace(/^@/, "").trim() : undefined;
  const cleanTelegram = telegram ? telegram.replace(/^@/, "").trim() : undefined;

  await ensureSchema();
  const lead = await db.lead.create({
    data: {
      name: name?.trim() ?? "",
      funnelId: funnelId || null,
      partnerId: typeof partnerId === "string" && partnerId ? partnerId : null,
      projectName: typeof projectName === "string" && projectName.trim() ? projectName.trim() : null,
      payer: typeof payer === "string" && payer.trim() ? payer.trim() : null,
      closeReason: closeReason || null,
      instagram: cleanInstagram || null,
      telegram: cleanTelegram || null,
      phone: phone ? cleanPhone(String(phone)) || null : null,
      email: email || null,
      comment: comment || null,
      source: source || null,
      sourceDetail: sourceDetail || null,
      geo: geo || null,
      niche: niche || null,
      amount: amount ? parseFloat(String(amount).replace(/\s/g, "").replace(",", ".")) || null : null,
      currency: asCurrency(currency),
      tags: tags ?? [],
      status: status ?? "NEW_LEAD",
      siteStructure: siteStructure || null,
      hasExtraLang: !!hasExtraLang,
      languages: hasExtraLang ? (languages || null) : null,
      service: service || null,
      paymentSystem: paymentSystem || null,
      usedServices: Array.isArray(usedServices) ? usedServices : [],
      projectDeadline: projectDeadline || null,
      pushAt: pushAt ? new Date(pushAt.length === 16 ? pushAt + ":00+02:00" : pushAt) : null,
      pushComment: pushComment || null,
      pushStage: pushStage || null,
      messenger: messenger || null,
      ...(createdAt ? { createdAt: new Date(createdAt) } : {}),
    },
  });

  const settings = await getCrmSettings();
  // created on a later stage → history passes every stage from the first one (НДЗ skipped)
  await logCreation(db, settings, lead);
  try {
    await syncStageTasks(db, settings, lead);
  } catch (e) {
    console.error("auto tasks on create:", e);
  }

  return NextResponse.json(lead, { status: 201 });
}
