"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useCallback } from "react";
import { assignPeriods, defaultFinance, type FinanceSettings, type StageLike } from "@/lib/finance";

export const FIN_KEY = ["finance-settings"];
export const TX_KEY = ["finance-tx"];
export const SCHEDULE_KEY = ["finance-schedule"];

export interface TxRow {
  id: string;
  date: string;
  kind: string;
  amount: number;
  currency: string;
  rate: number;
  amountUah: number;
  accountId: string;
  toAccountId: string | null;
  leadId: string | null;
  projectId: string | null;
  stageId: string | null;
  counterparty: string | null;
  category: string | null;
  parentId?: string | null;
  adCampaignId?: string | null;
  recurringId?: string | null;
  comment: string | null;
  period: string | null;
  createdBy: string | null;
  createdAt: string;
  autoPeriod?: string;
  lead?: { id: string; number: number; name: string; projectName?: string | null; phone?: string | null; funnelId: string | null; amount?: number | null; currency?: string | null } | null;
  project?: { id: string; name: string; leadId: string | null } | null;
}

export interface ProjectRow {
  id: string;
  name: string;
  client: string | null;
  value: number | null;
  currency: string;
  note: string | null;
  leadId: string | null;
  createdAt: string;
  lead: { id: string; number: number; name: string; phone?: string | null; funnelId: string | null; status: string; amount: number | null; currency: string | null } | null;
}

export const PROJECTS_KEY = ["finance-projects"];

export function useProjects(enabled = true) {
  return useQuery({
    queryKey: PROJECTS_KEY,
    queryFn: async (): Promise<ProjectRow[]> => {
      const res = await fetch("/api/finance/projects");
      if (!res.ok) throw new Error(String(res.status));
      return res.json();
    },
    enabled,
    staleTime: 10_000,
  });
}

export interface ScheduleRow extends StageLike {
  leadId: string | null;
  currency?: string | null;   // planned payment without a project
  payer?: string | null;
  lead: { id: string; number: number; name: string; projectName?: string | null; payer?: string | null; phone?: string | null; funnelId: string | null; status: string; amount: number | null; currency: string | null } | null;
}
export const rowCurrency = (r: ScheduleRow) => r.lead?.currency ?? r.currency ?? "EUR";

export function useFinance() {
  const qc = useQueryClient();
  const q = useQuery({
    queryKey: FIN_KEY,
    queryFn: async (): Promise<FinanceSettings> => {
      const res = await fetch("/api/finance/settings");
      if (!res.ok) throw new Error(String(res.status));
      return res.json();
    },
    staleTime: 60_000,
  });
  const save = useMutation({
    mutationFn: async (next: FinanceSettings): Promise<FinanceSettings> => {
      const res = await fetch("/api/finance/settings", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(next) });
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error ?? String(res.status));
      return res.json();
    },
    onMutate: (next) => qc.setQueryData(FIN_KEY, next),
    onSuccess: (v) => qc.setQueryData(FIN_KEY, v),
    onError: () => qc.invalidateQueries({ queryKey: FIN_KEY }),
  });
  return { fin: q.data ?? defaultFinance(), loaded: q.isSuccess, save: save.mutateAsync };
}

export function useTransactions(leadId?: string, enabled = true) {
  const { fin } = useFinance();
  const startDay = fin.monthStartDay;
  // month of each operation needs the whole journal (the split on the 10th) → computed once per load
  const select = useCallback((list: TxRow[]) => assignPeriods(list, startDay), [startDay]);
  return useQuery({
    select,
    queryKey: leadId ? [...TX_KEY, leadId] : TX_KEY,
    queryFn: async (): Promise<TxRow[]> => {
      const res = await fetch(`/api/finance/transactions${leadId ? `?leadId=${leadId}` : ""}`);
      if (!res.ok) throw new Error(String(res.status));
      return res.json();
    },
    enabled,
    staleTime: 5_000,
  });
}

// Projects = deals of funnels with «Оплати в угодах» (Операційка)
export interface DealRow { id: string; number: number; name: string; projectName?: string | null; payer?: string | null; phone: string | null; funnelId: string | null; status: string; amount: number | null; currency: string | null; createdAt: string; doneHere?: number }
export const DEALS_KEY = ["finance-deals"];
export function useDeals(enabled = true) {
  return useQuery({
    queryKey: DEALS_KEY,
    queryFn: async (): Promise<DealRow[]> => {
      const res = await fetch("/api/finance/deals");
      if (!res.ok) throw new Error(String(res.status));
      return res.json();
    },
    enabled,
    staleTime: 10_000,
  });
}

// Співробітники / підписки (автосписання) — співробітники ж і є підрядники у формі операції
export interface RecurringRow {
  id: string; type: "employee" | "subscription"; payMode: "monthly" | "project"; every: "month" | "quarter" | "year"; month: number | null; uahAmount: number | null; name: string; role: string | null; amount: number; currency: string; accountId: string;
  day: number; category: string | null; active: boolean; activeFrom: string; note: string | null;
  charges: number; chargedUah: number; lastCharge: string | null;
  paidYearUah?: number;   // employees: all payments to this person this year (salary + per-project)
  paidCount?: number;
}
export const RECURRING_KEY = ["finance-recurring"];
export function useRecurring(enabled = true) {
  return useQuery({
    queryKey: RECURRING_KEY,
    queryFn: async (): Promise<RecurringRow[]> => {
      const res = await fetch("/api/finance/recurring");
      if (!res.ok) throw new Error(String(res.status));
      return res.json();
    },
    enabled,
    staleTime: 30_000,
  });
}

// Рекламні кампанії (розділ «Реклама») — до них прив'язуються витрати «Реклама»
export interface AdCampaignRow { id: string; name: string; trafficType: string; active: boolean }
export const ADS_KEY = ["ad-campaigns"];
export function useAdCampaigns(enabled = true) {
  return useQuery({
    queryKey: ADS_KEY,
    queryFn: async (): Promise<AdCampaignRow[]> => {
      const res = await fetch("/api/ad-campaigns");
      if (!res.ok) throw new Error(String(res.status));
      return res.json();
    },
    enabled,
    staleTime: 60_000,
  });
}
