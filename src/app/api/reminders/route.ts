import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";

const ALL_UPSELL = ["Google Ads", "Target Ads", "SEO", "Google Maps", "Branding", "TikTok Ads", "Graphic Design"];

async function sendTelegram(text: string) {
  const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
  const CHAT_ID = process.env.TELEGRAM_CHAT_ID;
  if (!BOT_TOKEN || !CHAT_ID) {
    console.warn("[reminders] TELEGRAM_BOT_TOKEN or TELEGRAM_CHAT_ID not set");
    return false;
  }
  const res = await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ chat_id: CHAT_ID, text, parse_mode: "HTML" }),
  });
  if (!res.ok) {
    console.error("[reminders] Telegram error:", await res.text());
    return false;
  }
  return true;
}

export async function GET(_req: NextRequest) {
  const now = new Date();
  let sent = 0;

  // ── Task reminders (generic) ──
  const tasks = await db.task.findMany({
    where: { remindAt: { lte: now }, remindSent: false },
    include: { lead: { select: { name: true } } },
  });

  for (const task of tasks) {
    const who = task.lead ? ` (${task.lead.name})` : "";
    const ok = await sendTelegram(
      `🔔 <b>Нагадування про задачу</b>\n\n` +
      `📋 ${task.title}${who}\n` +
      `⚡ Пріоритет: ${task.priority}\n` +
      (task.deadline ? `📅 Дедлайн: ${task.deadline.toLocaleDateString("uk-UA")}\n` : "") +
      `\n👉 Відкрий CRM для деталей`
    );
    if (ok) {
      await db.task.update({ where: { id: task.id }, data: { remindSent: true } });
      sent++;
    }
  }

  // ── Lead generic reminders (remindAt) ──
  const leadsGeneric = await db.lead.findMany({
    where: { remindAt: { lte: now }, remindSent: false },
  });

  for (const lead of leadsGeneric) {
    const ok = await sendTelegram(
      `🔔 <b>Нагадування про ліда</b>\n\n` +
      `👤 ${lead.name}\n` +
      (lead.status ? `📊 Статус: ${lead.status}\n` : "") +
      (lead.instagram ? `📸 @${lead.instagram}\n` : "") +
      (lead.telegram ? `✈️ @${lead.telegram}\n` : "") +
      `\n👉 Відкрий CRM для деталей`
    );
    if (ok) {
      await db.lead.update({ where: { id: lead.id }, data: { remindSent: true } });
      sent++;
    }
  }

  // ── Lead push reminders (pushAt) — детальний формат ──
  const leadsPush = await db.lead.findMany({
    where: { pushAt: { lte: now }, pushSent: false },
  });

  for (const lead of leadsPush) {
    const upsell = ALL_UPSELL.filter((s) => !lead.usedServices.includes(s));
    const pushDate = lead.pushAt
      ? lead.pushAt.toLocaleString("uk-UA", { timeZone: "Europe/Kyiv", dateStyle: "short", timeStyle: "short" })
      : "—";

    const message =
      `🔔 <b>Нагадування по ліду</b>\n\n` +
      `<b>Лід:</b> ${lead.name}\n` +
      `<b>Послуга:</b> ${lead.service || "—"}\n` +
      `<b>Коли запушити:</b> ${pushDate}\n` +
      `<b>Термін проєкту:</b> ${lead.projectDeadline || "—"}\n\n` +
      `<b>Коментар:</b>\n${lead.comment || "—"}\n\n` +
      `<b>Рекомендовано допродати:</b>\n` +
      (upsell.length > 0 ? upsell.map((s) => `• ${s}`).join("\n") : "—");

    const ok = await sendTelegram(message);
    if (ok) {
      await db.lead.update({ where: { id: lead.id }, data: { pushSent: true } });
      sent++;
    } else {
      console.error(`[reminders] Failed to send push reminder for lead ${lead.id}`);
    }
  }

  return NextResponse.json({ ok: true, sent });
}
