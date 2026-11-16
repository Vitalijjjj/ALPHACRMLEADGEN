"use client";

import { useQuery } from "@tanstack/react-query";
import type { Access } from "@/lib/access";

// What the signed-in user may do (pages, funnels). Re-read every minute, so role changes show up.
export function useAccess() {
  const q = useQuery({
    queryKey: ["me"],
    queryFn: async (): Promise<Access> => {
      const res = await fetch("/api/me");
      if (!res.ok) throw new Error(String(res.status));
      return res.json();
    },
    staleTime: 30_000,
    refetchInterval: 60_000,
  });
  return { access: q.data ?? null, loaded: q.isSuccess, failed: q.isError };
}
