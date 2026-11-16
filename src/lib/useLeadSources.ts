"use client";

import { useQuery } from "@tanstack/react-query";
import { LEAD_SOURCES } from "@/lib/leadOptions";
import { findType, normalizeAdSettings, type AdSettings } from "@/lib/adTypes";

export const AD_SETTINGS_QK = ["ad-settings"];

// Lead sources = the fixed list + every traffic type from «Реклама» (they carry a campaign).
export function useLeadSources() {
  const q = useQuery({
    queryKey: AD_SETTINGS_QK,
    queryFn: async (): Promise<AdSettings> => {
      const res = await fetch("/api/ads/settings");
      if (!res.ok) throw new Error(String(res.status));
      return normalizeAdSettings(await res.json());
    },
    staleTime: 60_000,
  });
  const ads = q.data ?? normalizeAdSettings(null);
  const known = new Set(LEAD_SOURCES.map((s) => s.value.toLowerCase()));
  const sources = [
    // a type with campaigns asks for one; a «загально» type (Контекст) doesn't
    ...LEAD_SOURCES.map((s) => {
      const t = findType(ads, s.value);
      return !t ? s : t.mode === "spend" ? { value: s.value } : { value: s.value, detail: s.detail ?? "Назва кампанії" };
    }),
    ...ads.types.filter((t) => !known.has(t.name.toLowerCase())).map((t) => (t.mode === "spend" ? { value: t.name } : { value: t.name, detail: "Назва кампанії" })),
  ];
  // the traffic type of a source (null — not a paid source)
  const adTypeOf = (source: string | null | undefined) => { const t = findType(ads, source); return t && t.mode !== "spend" ? t.name : null; };
  return { sources, adTypeOf };
}
