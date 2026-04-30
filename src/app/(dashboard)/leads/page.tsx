"use client";

import { useState, useEffect, useCallback } from "react";
import { Plus, Search, Phone, Mail, ExternalLink, Pencil, Trash2, ChevronRight } from "lucide-react";
import { Modal } from "@/components/ui/modal";
import { Badge } from "@/components/ui/badge";
import { LeadForm, type LeadFormData } from "@/components/leads/LeadForm";
import LeadDrawer from "@/components/leads/LeadDrawer";
import { formatDistanceToNow } from "date-fns";
import { uk } from "date-fns/locale";

// Convert UTC ISO string to Europe/Warsaw (UTC+2) for datetime-local input
function toWarsawInput(utcStr: string): string {
  const d = new Date(new Date(utcStr).getTime() + 2 * 60 * 60 * 1000);
  return d.toISOString().slice(0, 16);
}

interface Lead {
  id: string;
  name: string;
  instagram: string | null;
  telegram: string | null;
  phone: string | null;
  email: string | null;
  comment: string | null;
  source: string | null;
  geo: string | null;
  niche: string | null;
  amount: number | null;
  status: string;
  siteStructure: string | null;
  hasExtraLang: boolean;
  languages: string | null;
  service: string | null;
  paymentSystem: string | null;
  usedServices: string[];
  projectDeadline: string | null;
  pushAt: string | null;
  pushComment: string | null;
  createdAt: string;
  updatedAt: string;
  _count: { tasks: number; deals: number };
}

const STATUS_OPTIONS = [
  { value: "",               label: "Всі статуси" },
  { value: "NEW_LEAD",       label: "Новий лід" },
  { value: "CONTACTED",      label: "Звʼязався" },
  { value: "MISSED_CALL",    label: "Недозвон" },
  { value: "TARGETED",       label: "Цільовий" },
  { value: "PROPOSAL",       label: "КП" },
  { value: "INTERESTED",     label: "Цікаво" },
  { value: "THINKING",       label: "Думає" },
  { value: "WON",            label: "Виграш — Продаж" },
  { value: "NOT_INTERESTED", label: "Програш — Не цікаво" },
  { value: "DUPLICATE",      label: "Програш — Дубль" },
  { value: "UNREACHABLE",    label: "Програш — Не змогли звʼязатись" },
  { value: "NOT_TARGET",     label: "Програш — не ЦА" },
  { value: "TOO_EXPENSIVE",  label: "Програш — Дорого" },
];

function InstagramLink({ username }: { username: string }) {
  return (
    <a
      href={`https://instagram.com/${username}`}
      target="_blank"
      rel="noopener noreferrer"
      onClick={(e) => e.stopPropagation()}
      className="flex items-center gap-1 text-xs hover:opacity-80 transition-opacity"
      style={{ color: "#E4405F" }}
    >
      <svg width="11" height="11" viewBox="0 0 24 24" fill="currentColor">
        <path d="M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zm0-2.163c-3.259 0-3.667.014-4.947.072-4.358.2-6.78 2.618-6.98 6.98-.059 1.281-.073 1.689-.073 4.948 0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98 1.281.058 1.689.072 4.948.072 3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98-1.281-.059-1.69-.073-4.949-.073zm0 5.838c-3.403 0-6.162 2.759-6.162 6.162s2.759 6.163 6.162 6.163 6.162-2.759 6.162-6.163c0-3.403-2.759-6.162-6.162-6.162zm0 10.162c-2.209 0-4-1.79-4-4 0-2.209 1.791-4 4-4s4 1.791 4 4c0 2.21-1.791 4-4 4zm6.406-11.845c-.796 0-1.441.645-1.441 1.44s.645 1.44 1.441 1.44c.795 0 1.439-.645 1.439-1.44s-.644-1.44-1.439-1.44z"/>
      </svg>
      @{username}
    </a>
  );
}

function TelegramLink({ username }: { username: string }) {
  return (
    <a
      href={`https://t.me/${username}`}
      target="_blank"
      rel="noopener noreferrer"
      onClick={(e) => e.stopPropagation()}
      className="flex items-center gap-1 text-xs hover:opacity-80 transition-opacity"
      style={{ color: "#26A5E4" }}
    >
      <svg width="11" height="11" viewBox="0 0 24 24" fill="currentColor">
        <path d="M11.944 0A12 12 0 0 0 0 12a12 12 0 0 0 12 12 12 12 0 0 0 12-12A12 12 0 0 0 12 0a12 12 0 0 0-.056 0zm4.962 7.224c.1-.002.321.023.465.14a.506.506 0 0 1 .171.325c.016.093.036.306.02.472-.18 1.898-.962 6.502-1.36 8.627-.168.9-.499 1.201-.82 1.23-.696.065-1.225-.46-1.9-.902-1.056-.693-1.653-1.124-2.678-1.8-1.185-.78-.417-1.21.258-1.91.177-.184 3.247-2.977 3.307-3.23.007-.032.014-.15-.056-.212s-.174-.041-.249-.024c-.106.024-1.793 1.14-5.061 3.345-.48.33-.913.49-1.302.48-.428-.008-1.252-.241-1.865-.44-.752-.245-1.349-.374-1.297-.789.027-.216.325-.437.893-.663 3.498-1.524 5.83-2.529 6.998-3.014 3.332-1.386 4.025-1.627 4.476-1.635z"/>
      </svg>
      @{username}
    </a>
  );
}

export default function LeadsPage() {
  const [leads, setLeads] = useState<Lead[]>([]);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [showCreate, setShowCreate] = useState(false);
  const [editLead, setEditLead] = useState<Lead | null>(null);
  const [openLead, setOpenLead] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [searching, setSearching] = useState(false);
  const [copiedPhone, setCopiedPhone] = useState<string | null>(null);

  const fetchLeads = useCallback(async () => {
    const params = new URLSearchParams();
    if (search) params.set("q", search);
    if (statusFilter) params.set("status", statusFilter);
    const res = await fetch(`/api/leads?${params}`);
    if (!res.ok) return;
    setLeads(await res.json());
    setLoading(false);
  }, [search, statusFilter]);

  useEffect(() => {
    setSearching(true);
    const t = setTimeout(() => fetchLeads().finally(() => setSearching(false)), 400);
    return () => clearTimeout(t);
  }, [fetchLeads]);

  async function createLead(data: LeadFormData) {
    const res = await fetch("/api/leads", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      alert("Помилка створення: " + (err.detail || err.error || res.status));
      return;
    }
    setShowCreate(false);
    fetchLeads();
  }

  async function updateLead(data: LeadFormData) {
    if (!editLead) return;
    const res = await fetch(`/api/leads/${editLead.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      alert("Помилка збереження: " + (err.detail || err.error || res.status));
      return;
    }
    setEditLead(null);
    fetchLeads();
  }

  async function deleteLead(id: string) {
    if (!confirm("Видалити ліда?")) return;
    await fetch(`/api/leads/${id}`, { method: "DELETE" });
    fetchLeads();
  }

  const totalAmount = leads.reduce((s, l) => s + (l.amount ?? 0), 0);

  return (
    <div className="p-6 space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-lg font-semibold text-[var(--text)]">Leads</h1>
          <p className="text-xs text-[var(--text-muted)] mt-0.5">
            {leads.length} контактів
            {totalAmount > 0 && (
              <span className="ml-2 font-medium" style={{ color: "var(--accent)" }}>
                · €{totalAmount.toLocaleString()} загальна сума
              </span>
            )}
          </p>
        </div>
        <button
          onClick={() => setShowCreate(true)}
          className="flex items-center gap-1.5 px-3 py-2 text-black text-sm rounded-lg transition-colors cursor-pointer font-semibold"
          style={{ background: "var(--accent)" }}
        >
          <Plus size={15} />
          Новий лід
        </button>
      </div>

      {/* Filters */}
      <div className="flex items-center gap-3 flex-wrap">
        <div className="relative flex-1 max-w-xs">
          {searching
            ? <div className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 rounded-full border-2 border-[var(--accent)] border-t-transparent animate-spin" />
            : <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--text-muted)]" />
          }
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Пошук по імені, @нікнейму, гео..."
            className="w-full pl-8 pr-3 py-2 rounded-lg bg-[var(--surface)] border border-[var(--border)] text-[var(--text)] text-sm focus:outline-none focus:border-[var(--accent)] transition-colors"
          />
        </div>
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          className="px-3 py-1.5 rounded-lg bg-[var(--surface)] border border-[var(--border)] text-[var(--text)] text-sm focus:outline-none focus:border-[var(--accent)] transition-colors cursor-pointer"
        >
          {STATUS_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>{o.label}</option>
          ))}
        </select>
      </div>

      {/* Table */}
      <div className="bg-[var(--surface)] border border-[var(--border)] rounded-xl overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-[var(--border)]">
              <th className="text-left px-4 py-3 text-xs font-medium text-[var(--text-muted)]">Ім'я</th>
              <th className="text-left px-4 py-3 text-xs font-medium text-[var(--text-muted)]">Соцмережі</th>
              <th className="text-left px-4 py-3 text-xs font-medium text-[var(--text-muted)]">Контакти</th>
              <th className="text-left px-4 py-3 text-xs font-medium text-[var(--text-muted)]">Статус</th>
              <th className="text-left px-4 py-3 text-xs font-medium text-[var(--text-muted)]">Джерело / Гео</th>
              <th className="text-left px-4 py-3 text-xs font-medium text-[var(--text-muted)]">Сума</th>
              <th className="text-left px-4 py-3 text-xs font-medium text-[var(--text-muted)]">Оновлено</th>
              <th className="px-4 py-3" />
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan={8} className="text-center py-12 text-[var(--text-muted)]">
                  Завантаження...
                </td>
              </tr>
            ) : leads.length === 0 ? (
              <tr>
                <td colSpan={8} className="text-center py-12 text-[var(--text-muted)]">
                  Лідів немає
                </td>
              </tr>
            ) : (
              leads.map((lead) => (
                <tr
                  key={lead.id}
                  className="border-b border-[var(--border)] last:border-0 hover:bg-[var(--surface-2)] transition-colors cursor-pointer"
                  onClick={() => setOpenLead(lead.id)}
                >
                  {/* Name */}
                  <td className="px-4 py-3">
                    <div className="font-medium text-[var(--text)]">{lead.name}</div>
                    {lead.niche && (
                      <div className="text-xs text-[var(--text-muted)] truncate max-w-[140px]">{lead.niche}</div>
                    )}
                  </td>

                  {/* Social */}
                  <td className="px-4 py-3">
                    <div className="flex flex-col gap-1">
                      {lead.instagram && <InstagramLink username={lead.instagram} />}
                      {lead.telegram && <TelegramLink username={lead.telegram} />}
                      {!lead.instagram && !lead.telegram && (
                        <span className="text-xs text-[var(--text-dim)]">—</span>
                      )}
                    </div>
                  </td>

                  {/* Contacts */}
                  <td className="px-4 py-3">
                    <div className="flex flex-col gap-0.5">
                      {lead.phone && (
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            navigator.clipboard.writeText(lead.phone!);
                            setCopiedPhone(lead.id);
                            setTimeout(() => setCopiedPhone(null), 1500);
                          }}
                          className="flex items-center gap-1 text-xs text-[var(--text-muted)] hover:text-[var(--accent)] transition-colors cursor-pointer"
                          title="Скопіювати"
                        >
                          <Phone size={10} />
                          {copiedPhone === lead.id ? <span className="text-green-400">✓ Скопійовано</span> : lead.phone}
                        </button>
                      )}
                      {lead.email && (
                        <span className="flex items-center gap-1 text-xs text-[var(--text-muted)]">
                          <Mail size={10} />{lead.email}
                        </span>
                      )}
                      {!lead.phone && !lead.email && (
                        <span className="text-xs text-[var(--text-dim)]">—</span>
                      )}
                    </div>
                  </td>

                  {/* Status */}
                  <td className="px-4 py-3">
                    <Badge value={lead.status} />
                  </td>

                  {/* Source / Geo */}
                  <td className="px-4 py-3">
                    <div className="text-xs text-[var(--text-muted)]">{lead.source ?? "—"}</div>
                    {lead.geo && (
                      <div className="text-xs text-[var(--text-dim)]">{lead.geo}</div>
                    )}
                  </td>

                  {/* Amount */}
                  <td className="px-4 py-3">
                    {lead.amount ? (
                      <span className="text-xs font-semibold" style={{ color: "var(--accent)" }}>
                        €{lead.amount.toLocaleString()}
                      </span>
                    ) : (
                      <span className="text-xs text-[var(--text-dim)]">—</span>
                    )}
                  </td>

                  {/* Updated */}
                  <td className="px-4 py-3 text-xs text-[var(--text-muted)]">
                    {formatDistanceToNow(new Date(lead.updatedAt), { addSuffix: true, locale: uk })}
                  </td>

                  {/* Actions */}
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-1" onClick={(e) => e.stopPropagation()}>
                      <button
                        onClick={() => setEditLead(lead)}
                        className="p-1.5 rounded text-[var(--text-muted)] hover:text-[var(--text)] hover:bg-[var(--border)] transition-colors cursor-pointer"
                      >
                        <Pencil size={13} />
                      </button>
                      <button
                        onClick={() => deleteLead(lead.id)}
                        className="p-1.5 rounded text-[var(--text-muted)] hover:text-[var(--danger)] hover:bg-[var(--border)] transition-colors cursor-pointer"
                      >
                        <Trash2 size={13} />
                      </button>
                      <ChevronRight size={13} className="text-[var(--text-muted)]" />
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Modals */}
      <Modal open={showCreate} onClose={() => setShowCreate(false)} title="Новий лід" size="xl">
        <LeadForm onSave={createLead} onCancel={() => setShowCreate(false)} />
      </Modal>

      <Modal open={!!editLead} onClose={() => setEditLead(null)} title="Редагувати ліда" size="xl">
        {editLead && (
          <LeadForm
            onSave={updateLead}
            onCancel={() => setEditLead(null)}
            initial={{
              name: editLead.name,
              instagram: editLead.instagram ?? "",
              telegram: editLead.telegram ?? "",
              phone: editLead.phone ?? "",
              email: editLead.email ?? "",
              comment: editLead.comment ?? "",
              source: editLead.source ?? "",
              geo: editLead.geo ?? "",
              niche: editLead.niche ?? "",
              amount: editLead.amount?.toString() ?? "",
              status: editLead.status,
              siteStructure: editLead.siteStructure ?? "",
              hasExtraLang: editLead.hasExtraLang ?? false,
              languages: editLead.languages ?? "",
              service: editLead.service ?? "",
              paymentSystem: editLead.paymentSystem ?? "",
              paymentSystemCustom: "",
              usedServices: editLead.usedServices ?? [],
              projectDeadline: editLead.projectDeadline ?? "",
              pushAt: editLead.pushAt ? toWarsawInput(editLead.pushAt) : "",
              pushComment: editLead.pushComment ?? "",
              createdAt: editLead.createdAt?.slice(0, 10) ?? "",
            }}
          />
        )}
      </Modal>

      {openLead && (
        <LeadDrawer leadId={openLead} onClose={() => setOpenLead(null)} onUpdate={fetchLeads} />
      )}
    </div>
  );
}
