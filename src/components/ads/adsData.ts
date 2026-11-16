"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import type { AdSettings } from "@/lib/adTypes";

export interface AdCampaignRow { id: string; name: string; trafficType: string; cash: number; leads: number; won: number }
export interface AdPayment { id: string; date: string; uah: number; amount: number; currency: string; type: string | null; campaignId: string | null; who: string | null; comment: string | null }
export interface AdsOverview {
  settings: AdSettings;
  campaigns: AdCampaignRow[];   // cash — ₴ оплачено в кешфлоу за період
  payments: AdPayment[];        // оплати «Реклама» за період
  months: { type: string; month: string; uah: number }[]; // останні 6 місяців по типах ("" — без типу)
  fallback: Record<string, { leads: number; won: number } | null>; // ліди типу без кампанії
}

export const ADS_KEY = ["ads-overview"] as const;

export function useAdsOverview(from: string, to: string) {
  return useQuery({
    queryKey: [...ADS_KEY, from, to],
    queryFn: async (): Promise<AdsOverview> => {
      const res = await fetch(`/api/ads/overview?from=${from}&to=${to}`);
      if (!res.ok) throw new Error(String(res.status));
      return res.json();
    },
    placeholderData: (prev) => prev,
  });
}

export function useAdsRefresh() {
  const qc = useQueryClient();
  return () => {
    qc.invalidateQueries({ queryKey: ADS_KEY });
    qc.invalidateQueries({ queryKey: ["ad-campaigns"] });
    qc.invalidateQueries({ queryKey: ["ad-settings"] });
  };
}

export async function send(url: string, method: string, body?: unknown) {
  const res = await fetch(url, { method, headers: { "Content-Type": "application/json" }, body: body === undefined ? undefined : JSON.stringify(body) });
  if (!res.ok) {
    const e = await res.json().catch(() => ({}));
    throw new Error(e.error || "Не вдалося зберегти");
  }
  return res.json();
}

export const DAY = 86_400_000;
export const ymd = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
