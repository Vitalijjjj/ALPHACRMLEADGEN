import LeadsView from "@/components/leads/LeadsView";

// Direct link to a lead: /leads/5 opens the card of lead #5 on top of the leads page.
export default async function LeadByNumberPage({ params }: { params: Promise<{ number: string }> }) {
  const n = parseInt((await params).number, 10);
  return <LeadsView openNumber={Number.isFinite(n) && n > 0 ? n : undefined} />;
}
