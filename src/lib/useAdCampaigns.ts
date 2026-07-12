"use client";

import { useEffect, useState } from "react";

export interface AdCampaignOption {
  id: string;
  name: string;
  trafficType: string;
  active: boolean;
}

// Список рекламних кампаній для дропдаунів (форма ліда, фільтри).
// GET /api/ad-campaigns попутно синхронізує кампанії з існуючих лідів.
export function useAdCampaigns() {
  const [campaigns, setCampaigns] = useState<AdCampaignOption[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/ad-campaigns")
      .then((res) => (res.ok ? res.json() : []))
      .then((list) => { if (!cancelled) setCampaigns(list); })
      .catch(() => {})
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, []);

  return { campaigns, loading };
}
