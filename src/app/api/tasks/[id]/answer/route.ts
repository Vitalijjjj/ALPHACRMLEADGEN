import { NextRequest, NextResponse } from "next/server";
import { requireAccess } from "@/lib/accessServer";
import { ensureSchema } from "@/lib/db";
import { getCrmSettings } from "@/lib/crmSettingsServer";
import { answerNo } from "@/lib/taskAutomationServer";

// «Ні» on the question after an automatic task: keeps the next planned step or creates a new task.
export async function POST(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const gate = await requireAccess();
  if ("error" in gate) return gate.error;

  await ensureSchema();
  const { id } = await params;
  const result = await answerNo(await getCrmSettings(), id);
  return NextResponse.json(result);
}
