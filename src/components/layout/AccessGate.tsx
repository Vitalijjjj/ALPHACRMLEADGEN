"use client";

import Link from "next/link";
import { useEffect } from "react";
import { usePathname, useRouter } from "next/navigation";
import { Lock } from "lucide-react";
import { useAccess } from "@/lib/useAccess";
import { canPage, firstAllowedHref, pageForPath, PAGES } from "@/lib/access";

// Pages the user's role does not include show «Немає доступу» (the API refuses the data anyway).
export default function AccessGate({ children }: { children: React.ReactNode }) {
  const path = usePathname();
  const { access, loaded } = useAccess();
  const router = useRouter();
  const page = pageForPath(path);
  const blocked = !!page && loaded && !canPage(access, page);
  const home = firstAllowedHref(access);
  // after login everyone lands on «/»: without the dashboard go straight to the first allowed page
  useEffect(() => {
    if (blocked && page === "dash_overview" && home) router.replace(home);
  }, [blocked, page, home, router]);
  if (!blocked) return <>{children}</>;

  const label = PAGES.find((p) => p.key === page)?.label ?? "цієї сторінки";
  return (
    <div className="h-full flex items-center justify-center p-6">
      <div className="max-w-sm text-center space-y-3">
        <div className="mx-auto w-12 h-12 rounded-xl flex items-center justify-center bg-white/[0.04] border border-[var(--border)]">
          <Lock size={20} className="text-[var(--text-muted)]" />
        </div>
        <h1 className="text-base font-semibold text-[var(--text)]">Немає доступу до розділу «{label}»</h1>
        <p className="text-sm text-[var(--text-muted)]">Попроси власника CRM відкрити цей розділ для твоєї ролі.</p>
        {home && (
          <Link href={home} className="inline-block px-3 py-2 rounded-lg text-sm font-semibold text-black" style={{ background: "var(--accent)" }}>
            Перейти до доступного розділу
          </Link>
        )}
      </div>
    </div>
  );
}
