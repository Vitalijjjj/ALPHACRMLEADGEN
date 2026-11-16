"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { DEFAULT_CRM_SETTINGS, type CrmSettings } from "@/lib/crmSettings";

const KEY = ["crm-settings"];

export function useCrmSettings() {
  const qc = useQueryClient();
  const query = useQuery({
    queryKey: KEY,
    queryFn: async (): Promise<CrmSettings> => {
      const res = await fetch("/api/settings");
      if (!res.ok) throw new Error(String(res.status));
      return res.json();
    },
    staleTime: 60_000,
  });

  const save = useMutation({
    mutationFn: async (next: CrmSettings): Promise<CrmSettings> => {
      const res = await fetch("/api/settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(next),
      });
      if (!res.ok) throw new Error(String(res.status));
      return res.json();
    },
    // optimistic update
    onMutate: async (next) => {
      await qc.cancelQueries({ queryKey: KEY });
      const prev = qc.getQueryData<CrmSettings>(KEY);
      qc.setQueryData(KEY, next);
      return { prev };
    },
    onError: (_e, _n, ctx) => ctx?.prev && qc.setQueryData(KEY, ctx.prev),
    onSuccess: (data) => qc.setQueryData(KEY, data),
  });

  return {
    settings: query.data ?? DEFAULT_CRM_SETTINGS,
    loaded: query.isSuccess,
    save: save.mutate,
    saving: save.isPending,
  };
}
