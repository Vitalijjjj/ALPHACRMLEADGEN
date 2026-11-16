import { redirect } from "next/navigation";

// «Рух грошей» now lives inside «Кешфлоу» as a switch — old links land there.
export default function PnlTransfersPage() {
  redirect("/pnl/cashflow?view=transfers");
}
