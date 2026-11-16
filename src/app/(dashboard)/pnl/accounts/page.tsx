"use client";

import AccountsTab from "@/components/finance/AccountsTab";
import { useAccess } from "@/lib/useAccess";
import { canPage } from "@/lib/access";

export default function PnlAccountsPage() {
  const { access } = useAccess();
  return <AccountsTab canEdit={canPage(access, "pnl")} />;
}
