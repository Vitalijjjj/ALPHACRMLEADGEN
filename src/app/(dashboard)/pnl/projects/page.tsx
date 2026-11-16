import { redirect } from "next/navigation";

// «Проєкти» moved under CRM.
export default function PnlProjectsPage() {
  redirect("/projects");
}
