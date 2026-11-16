"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { FALLBACK_FX, type FxRates } from "@/lib/currency";

// NBU rate for the whole app. Loaded once per page load (never refetched by itself);
// refresh() asks NBU again (button in the header).
export function useFx() {
  const qc = useQueryClient();
  const query = useQuery({
    queryKey: ["fx"],
    queryFn: async (): Promise<FxRates> => {
      const res = await fetch("/api/fx");
      if (!res.ok) throw new Error("fx");
      return res.json();
    },
    staleTime: Infinity,
    gcTime: Infinity,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
  });
  const refresh = useMutation({
    mutationFn: async (): Promise<FxRates> => {
      const res = await fetch("/api/fx", { method: "POST" });
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error ?? "fx");
      return res.json();
    },
    onSuccess: (fx) => qc.setQueryData(["fx"], fx),
  });
  return { fx: query.data ?? FALLBACK_FX, loaded: !!query.data, refresh: refresh.mutate, refreshing: refresh.isPending, error: refresh.error };
}
