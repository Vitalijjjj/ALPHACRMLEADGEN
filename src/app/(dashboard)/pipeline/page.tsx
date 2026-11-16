import { redirect } from "next/navigation";

// Kanban now lives on the «Ліди» page (Канбан / Список switch). Old links keep working.
export default function PipelinePage() {
  redirect("/leads?view=kanban");
}
