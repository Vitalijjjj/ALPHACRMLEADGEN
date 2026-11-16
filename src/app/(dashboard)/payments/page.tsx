import { redirect } from "next/navigation";

// «Оплати» moved into the «P&L» group.
export default function PaymentsPage() {
  redirect("/pnl/cashflow");
}
