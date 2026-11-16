"use client";

import { useState } from "react";
import { format } from "date-fns";
import { ArrowLeft, Check, Copy, FileText, Pencil, Printer, Save, X } from "lucide-react";
import { Modal } from "@/components/ui/modal";
import { toast, toastError } from "@/components/ui/toast";
import { kindOf, type Account, type Payer, type Requisites } from "@/lib/finance";
import { localDate } from "@/components/tasks/taskUtils";
import { useFinance } from "@/components/finance/useFinance";
import AccountIcon, { CUR_SYM } from "@/components/finance/AccountIcon";
import Select from "@/components/finance/Select";
import { groupNum, numText } from "@/lib/numInput";

type Key = keyof Requisites;
type Kind = "uah" | "foreign" | "crypto";
const kindOfReq = (a: Account): Kind => (kindOf(a) === "crypto" ? "crypto" : a.currency === "UAH" ? "uah" : "foreign");

// what the client sees (copy) — per account type
const PAY_FIELDS: Record<Kind, { k: Key; label: string; multi?: boolean }[]> = {
  uah: [
    { k: "receiver", label: "Одержувач (ПІБ)" },
    { k: "iban", label: "IBAN" },
    { k: "taxId", label: "ЄДРПОУ" },
    { k: "purpose", label: "Призначення платежу" },
    { k: "note", label: "Примітка для клієнта", multi: true },
  ],
  foreign: [
    { k: "iban", label: "IBAN" },
    { k: "swift", label: "SWIFT / BIC Code" },
    { k: "receiver", label: "Receiver" },
    { k: "address", label: "Address", multi: true },
    { k: "purpose", label: "Призначення платежу" },
  ],
  crypto: [
    { k: "wallet", label: "Адреса" },
    { k: "network", label: "Мережа" },
    { k: "note", label: "Примітка для клієнта", multi: true },
  ],
};
// extra fields that only go into the invoice
const INVOICE_FIELDS: { k: Key; label: string }[] = [
  { k: "signName", label: "Ім'я в інвойсі (підпис)" },
  { k: "taxId", label: "ІПН / ЄДРПОУ" },
  { k: "phone", label: "Телефон" },
  { k: "email", label: "Email" },
];

const field = "w-full px-3 py-2 rounded-xl bg-[var(--surface-2)] border border-[var(--border)] text-sm text-[var(--text)] outline-none focus:border-[var(--accent)]";
const label = "block text-[10px] font-medium uppercase tracking-wider text-[var(--text-dim)] mb-1";
const mono = (k: Key) => (k === "iban" || k === "wallet" || k === "swift" ? "font-mono" : "");

async function copy(text: string, what = "Скопійовано") {
  try {
    await navigator.clipboard.writeText(text);
    toast({ kind: "success", title: what, text: text.length > 60 ? `${text.slice(0, 60)}…` : text, duration: 1800 });
  } catch {
    toastError("Не вдалося скопіювати");
  }
}

// the whole message for a client, like the Telegram one
export function requisitesText(a: Account): string {
  const req = a.req ?? {};
  const kind = kindOfReq(a);
  const out = [kind === "crypto" ? `${a.currency === "USD" ? "Долар" : a.currency} крипта:` : `${a.name}:`, ""];
  if (req.note) out.push(req.note, "");
  for (const f of PAY_FIELDS[kind]) if (f.k !== "note" && req[f.k]) out.push(`${f.label}:`, req[f.k]!, "");
  return out.join("\n").trim();
}
export const hasRequisites = (a: Account) => PAY_FIELDS[kindOfReq(a)].some((f) => f.k !== "note" && a.req?.[f.k]?.trim());
export const copyRequisites = (a: Account) => copy(requisitesText(a), `Реквізити скопійовано · ${a.name}`);

// «Реквізити» / «Інвойс» of one account. mode "req" — fields with copy + edit; "invoice" — short requisites + invoice form.
export interface InvoicePrefill { amount?: number; currency?: string; payer?: string; item?: string }

// «Invoice» for a payment stage: pick the account (ФОП in the stage currency by default) → the invoice form, already filled.
export function StageInvoiceModal({ prefill, onClose }: { prefill: InvoicePrefill; onClose: () => void }) {
  const { fin } = useFinance();
  const live = fin.accounts.filter((a) => !a.archived);
  const ready = live.filter(hasRequisites);
  const cur = prefill.currency ?? "EUR";
  const best = ready.find((a) => kindOf(a) === "fop" && a.currency === cur) ?? ready.find((a) => a.currency === cur) ?? ready[0] ?? live[0];
  if (!best) return null;
  return <RequisitesModal account={best} mode="invoice" prefill={prefill} choose onClose={onClose} />;
}

export default function RequisitesModal({ account, mode: initial = "req", prefill, choose, onClose }: {
  account: Account; mode?: "req" | "invoice"; prefill?: InvoicePrefill; choose?: boolean; onClose: () => void;
}) {
  const { fin, save } = useFinance();
  const [accId, setAccId] = useState(account.id);
  const a = fin.accounts.find((x) => x.id === accId) ?? account;
  const kind = kindOfReq(a);
  const req = a.req ?? {};
  const [mode, setMode] = useState<"req" | "invoice">(hasRequisites(a) ? initial : "req");
  const [editing, setEditing] = useState(!hasRequisites(a));
  const [draft, setDraft] = useState<Requisites>(req);
  const fields = PAY_FIELDS[kind];
  const filled = fields.filter((f) => req[f.k]?.trim());

  const persist = async (next: Partial<Account>, extra?: Partial<typeof fin>) => {
    await save({ ...fin, ...extra, accounts: fin.accounts.map((x) => (x.id === a.id ? { ...x, ...next } : x)) });
  };
  async function saveReq() {
    const clean: Requisites = {};
    for (const [k, v] of Object.entries(draft)) if (typeof v === "string" && v.trim()) clean[k as Key] = v.trim();
    try {
      await persist({ req: clean });
      setEditing(false);
      toast({ kind: "success", title: "Реквізити збережено", text: a.name, duration: 2500 });
    } catch (e) {
      toastError(e instanceof Error ? e.message : "Не вдалося зберегти");
    }
  }
  const edit = () => { setDraft(req); setEditing(true); setMode("req"); };
  const btn = "flex items-center gap-1.5 px-3 py-2 rounded-xl border border-[var(--border)] text-xs text-[var(--text-muted)] hover:text-[var(--text)] cursor-pointer";

  return (
    <Modal open onClose={onClose} title={mode === "invoice" ? "Створити інвойс" : "Реквізити"} size="lg">
      <div className="space-y-4">
        <div className="flex flex-wrap items-center gap-2">
          <AccountIcon a={a} size={36} />
          {choose ? (
            <div className="min-w-[220px] flex-1 mr-auto">
              <span className={label}>На який рахунок платити</span>
              <Select value={a.id} onChange={(v) => { setAccId(v); const n = fin.accounts.find((x) => x.id === v); setEditing(!!n && !hasRequisites(n)); setMode(n && hasRequisites(n) ? "invoice" : "req"); setDraft(n?.req ?? {}); }}
                options={fin.accounts.filter((x) => !x.archived).map((x) => ({ value: x.id, label: x.name, sub: hasRequisites(x) ? x.currency : "без реквізитів" }))} />
            </div>
          ) : (
            <div className="min-w-0 mr-auto">
              <div className="text-sm font-semibold text-[var(--text)] truncate">{a.name}</div>
              <div className="text-[11px] text-[var(--text-dim)]">{kind === "crypto" ? "криптогаманець" : kind === "uah" ? "гривневий рахунок" : `валютний рахунок · ${a.currency}`}</div>
            </div>
          )}
          {!editing && filled.length > 0 && (
            <button onClick={() => copyRequisites(a)} className={btn}><Copy size={13} /> Скопіювати реквізити</button>
          )}
          {!editing && mode === "req" && filled.length > 0 && (
            <button onClick={() => setMode("invoice")} className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-semibold text-black cursor-pointer hover:brightness-110" style={{ background: "#60a5fa" }}>
              <FileText size={13} /> Створити інвойс
            </button>
          )}
        </div>

        {editing ? (
          <div className="space-y-3 rounded-2xl border border-[var(--border)] bg-white/[0.015] p-3.5">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {[...fields, ...INVOICE_FIELDS.filter((f) => !fields.some((x) => x.k === f.k))].map((f) => {
                const multi = "multi" in f && f.multi;
                return (
                  <label key={f.k} className={multi || f.k === "purpose" ? "sm:col-span-2" : ""}>
                    <span className={label}>{f.label}</span>
                    {multi ? (
                      <textarea rows={2} value={draft[f.k] ?? ""} onChange={(e) => setDraft({ ...draft, [f.k]: e.target.value })} className={`${field} resize-y`} />
                    ) : (
                      <input value={draft[f.k] ?? ""} onChange={(e) => setDraft({ ...draft, [f.k]: e.target.value })} className={`${field} ${mono(f.k)}`} />
                    )}
                  </label>
                );
              })}
            </div>
            <div className="text-[11px] text-[var(--text-dim)]">Ім&apos;я для підпису, телефон і email ідуть тільки в інвойс — у «Скопіювати реквізити» не потрапляють.</div>
            <div className="flex gap-2">
              {hasRequisites(a) && <button onClick={() => setEditing(false)} className={btn}><X size={13} />Скасувати</button>}
              <button onClick={saveReq} className="ml-auto flex items-center gap-1 px-4 py-2 rounded-xl text-xs font-semibold text-black cursor-pointer" style={{ background: "var(--accent)" }}><Save size={13} />Зберегти реквізити</button>
            </div>
          </div>
        ) : mode === "req" ? (
          <div className="space-y-2">
            {req.note && (
              <div className="rounded-xl border border-[#f59e0b]/30 bg-[#f59e0b]/[0.07] px-3.5 py-2.5 text-xs text-[#fcd34d] whitespace-pre-line">{req.note}</div>
            )}
            {filled.filter((f) => f.k !== "note").map((f) => (
              <button key={f.k} onClick={() => copy(req[f.k]!)} title="Натисни, щоб скопіювати"
                className="group w-full flex items-start gap-3 px-3.5 py-2.5 rounded-xl border border-white/[0.06] bg-white/[0.02] hover:border-[var(--accent)]/40 hover:bg-white/[0.04] text-left cursor-pointer transition-colors">
                <span className="min-w-0 flex-1">
                  <span className="block text-[10px] uppercase tracking-wider text-[var(--text-dim)]">{f.label}</span>
                  <span className={`block text-sm text-[var(--text)] break-all whitespace-pre-line ${mono(f.k)}`}>{req[f.k]}</span>
                </span>
                <Copy size={14} className="mt-3 shrink-0 text-[var(--text-dim)] group-hover:text-[var(--accent)]" />
              </button>
            ))}
            <div className="flex pt-1"><button onClick={edit} className={`${btn} ml-auto`}><Pencil size={12} /> Змінити реквізити</button></div>
          </div>
        ) : (
          <>
            {/* what goes into the invoice — small */}
            <div className="rounded-xl border border-white/[0.06] bg-white/[0.02] px-3.5 py-2.5">
              <div className="flex items-center gap-2 mb-1.5">
                <span className="text-[10px] uppercase tracking-wider text-[var(--text-dim)]">Реквізити в інвойсі</span>
                <button onClick={edit} className="ml-auto flex items-center gap-1 text-[11px] text-[var(--text-muted)] hover:text-[var(--text)] cursor-pointer"><Pencil size={11} /> змінити</button>
              </div>
              <div className="grid grid-cols-[110px_1fr] gap-x-3 gap-y-0.5 text-xs">
                {invoiceRows(a).map(([k, v, m]) => (
                  <div key={k} className="contents">
                    <span className="text-[var(--text-dim)]">{k}</span>
                    <span className={`text-[var(--text-muted)] break-all whitespace-pre-line ${m ? "font-mono" : ""}`}>{v}</span>
                  </div>
                ))}
              </div>
            </div>
            <InvoiceForm key={a.id} a={a} payers={fin.payers} prefill={prefill} onDone={(no, payer) => persist({ invoiceNo: no }, { payers: upsertPayer(fin.payers, payer) })} />
            <button onClick={() => setMode("req")} className="flex items-center gap-1 text-xs text-[var(--text-muted)] hover:text-[var(--text)] cursor-pointer"><ArrowLeft size={12} /> до реквізитів</button>
          </>
        )}
      </div>
    </Modal>
  );
}

// requisites shown in the invoice: [label, value, mono]
function invoiceRows(a: Account): [string, string, boolean][] {
  const r = a.req ?? {};
  const kind = kindOfReq(a);
  const rows: [string, string | undefined, boolean][] = [
    ["Ім'я / підпис", r.signName || r.receiver, false],
    [kind === "uah" ? "ЄДРПОУ" : "Tax ID", r.taxId, false],
    ...(kind === "crypto"
      ? ([["Адреса", r.wallet, true], ["Мережа", r.network, false]] as [string, string | undefined, boolean][])
      : ([["IBAN", r.iban, true], ["SWIFT / BIC", r.swift, true], [kind === "uah" ? "Одержувач" : "Receiver", r.receiver, false], ["Address", r.address, false]] as [string, string | undefined, boolean][])),
    ["Телефон", r.phone, false],
    ["Email", r.email, false],
  ];
  return rows.filter((x): x is [string, string, boolean] => !!x[1]?.trim());
}

const upsertPayer = (list: Payer[], p: Payer) => [p, ...list.filter((x) => x.name.toLowerCase() !== p.name.toLowerCase())].slice(0, 30);

// ── invoice form: number, date, payer, service, amount → PDF ──
function InvoiceForm({ a, payers, prefill, onDone }: { a: Account; payers: Payer[]; prefill?: InvoicePrefill; onDone: (no: number, payer: Payer) => Promise<void> }) {
  const req = a.req ?? {};
  const ua = a.currency === "UAH";
  const known0 = prefill?.payer ? payers.find((p) => p.name.toLowerCase() === prefill.payer!.toLowerCase()) : payers[0];
  const [no, setNo] = useState(String((a.invoiceNo ?? 0) + 1));
  const [date, setDate] = useState(localDate(new Date()));
  const [payerName, setPayerName] = useState(known0?.name ?? prefill?.payer ?? "");
  const [details, setDetails] = useState(known0?.details ?? "");
  const [item, setItem] = useState(prefill?.item || (ua ? req.purpose || "Послуги з розробки сайту" : "site creation"));
  const [amount, setAmount] = useState(prefill?.amount && (!prefill.currency || prefill.currency === a.currency) ? numText(prefill.amount) : "");
  const n = Number(amount.replace(/\s/g, "").replace(",", ".")) || 0;
  const known = payers.some((p) => p.name === payerName);
  const [newPayer, setNewPayer] = useState(!payers.length || !known0);
  const pick = (name: string) => { const p = payers.find((x) => x.name === name); setPayerName(name); setDetails(p?.details ?? ""); setNewPayer(false); };

  async function make() {
    if (!payerName.trim()) return toastError(ua ? "Вкажи платника" : "Вкажи платника (Payer)");
    if (!(n > 0)) return toastError("Вкажи суму");
    const num = Math.max(1, Math.round(Number(no) || 1));
    const html = invoiceHtml({ a, req, no: num, date, payer: payerName.trim(), details, item: item.trim() || "site creation", amount: n });
    const w = window.open("", "_blank");
    if (!w) return toastError("Браузер заблокував нове вікно — дозволь спливаючі вікна");
    w.document.write(html);
    w.document.close();
    await onDone(Math.max(num, a.invoiceNo ?? 0), { name: payerName.trim(), details }).catch(() => {});
    setNo(String(num + 1));
  }

  return (
    <div className="rounded-2xl border border-[#60a5fa]/25 bg-[#60a5fa]/[0.04] p-3.5 space-y-3">
      <div className="flex items-center gap-2 text-sm font-semibold text-[var(--text)]"><FileText size={15} className="text-[#60a5fa]" /> Що вписати в інвойс</div>
      <div className="grid grid-cols-[90px_1fr] sm:grid-cols-[90px_160px_1fr] gap-3">
        <label><span className={label}>№</span><input value={no} onChange={(e) => setNo(e.target.value.replace(/\D/g, ""))} inputMode="numeric" className={`${field} tabular-nums`} /></label>
        <label><span className={label}>Дата</span><input type="date" value={date} onChange={(e) => setDate(e.target.value)} className={field} style={{ colorScheme: "dark" }} /></label>
        <div className="col-span-2 sm:col-span-1">
          <span className={label}>Платник</span>
          {payers.length > 0 ? (
            <Select value={newPayer || !known ? "__new" : payerName} onChange={(v) => (v === "__new" ? (setPayerName(""), setDetails(""), setNewPayer(true)) : pick(v))}
              options={[...payers.map((p) => ({ value: p.name, label: p.name })), { value: "__new", label: "+ Новий платник" }]} />
          ) : (
            <input value={payerName} onChange={(e) => setPayerName(e.target.value)} placeholder={ua ? "ТОВ «Клієнт»" : "ZAFIRION LTD"} className={field} />
          )}
        </div>
      </div>
      {payers.length > 0 && (newPayer || !known) && (
        <input value={payerName} onChange={(e) => setPayerName(e.target.value)} placeholder={ua ? "Назва платника" : "Назва платника — ZAFIRION LTD"} className={field} autoFocus />
      )}
      <label className="block">
        <span className={label}>Дані платника · адреса, ЄДРПОУ / VAT, email, телефон — кожне з нового рядка</span>
        <textarea rows={3} value={details} onChange={(e) => setDetails(e.target.value)} className={`${field} resize-y`}
          placeholder={ua ? "м. Київ, вул. …\nЄДРПОУ …\nemail@company.ua" : "THEODOROU ELEFTHERIOU 9, AGIOS ATHANASIOS, 4103, LIMASSOL\nVAT REG. CY10416070Q\ninfo@company.com"} />
      </label>
      <div className="grid grid-cols-1 sm:grid-cols-[1fr_180px] gap-3">
        <label><span className={label}>Послуга</span><input value={item} onChange={(e) => setItem(e.target.value)} className={field} /></label>
        <label>
          <span className={label}>Сума, {a.currency}{prefill?.amount && prefill.currency && prefill.currency !== a.currency ? ` · етап ${prefill.amount} ${prefill.currency}` : ""}</span>
          <div className="relative">
            <input value={amount} onChange={(e) => setAmount(groupNum(e.target.value))} inputMode="decimal" placeholder="0" className={`${field} pr-8 font-semibold tabular-nums`} />
            <span className="absolute right-3 top-1/2 -translate-y-1/2 text-sm text-[var(--text-muted)]">{CUR_SYM[a.currency]}</span>
          </div>
        </label>
      </div>
      {n > 0 && <div className="text-[11px] text-[var(--text-dim)] flex items-center gap-1.5"><Check size={11} className="text-[#4ade80]" /> {amountWords(n, a.currency)}</div>}
      <button onClick={make} className="w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl text-sm font-semibold text-black cursor-pointer hover:brightness-110" style={{ background: "#60a5fa" }}>
        <Printer size={15} /> Створити інвойс · зберегти PDF
      </button>
      <div className="text-[11px] text-[var(--text-dim)]">Відкриється готовий інвойс і вікно друку — там вибери «Зберегти як PDF».</div>
    </div>
  );
}

const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!);
const lines = (s?: string) => (s ?? "").split(/\n/).map((x) => x.trim()).filter(Boolean).map(esc).join("<br>");

// Invoice in the format of the sample. UAH accounts get the Ukrainian version, crypto — wallet instead of IBAN.
export function invoiceHtml({ a, req, no, date, payer, details, item, amount }: {
  a: Account; req: Requisites; no: number; date: string; payer: string; details: string; item: string; amount: number;
}) {
  const ua = a.currency === "UAH";
  const crypto = kindOfReq(a) === "crypto";
  const sym = CUR_SYM[a.currency] ?? a.currency;
  const money = amount.toLocaleString("uk-UA", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).replace(/\s/g, " ");
  const sign = req.signName || (req.receiver ?? "").replace(/^PE\s+/i, "") || a.name;
  const receiver = `${esc(req.receiver || sign)}${req.address ? "," : ""}`;
  const contacts = [req.phone && `${ua ? "тел." : "tel."}: ${esc(req.phone)}`, req.email && esc(req.email)].filter(Boolean).join("<br>");
  const t = ua
    ? { title: "РАХУНОК", dated: "від", benef: "Отримувач", rec: "Одержувач", phone: "Телефон", payer: "Платник", name: "Найменування", price: "Сума", total: "Разом", totalAmount: "Всього на суму:", vat: "Без ПДВ.", regards: "З повагою," }
    : { title: "INVOICE", dated: "dated", benef: "Beneficiary", rec: "Receiver", phone: "Phone", payer: "Payer", name: "Name", price: "Price", total: "Total", totalAmount: "Total amount:", vat: "Without VAT.", regards: "With best regards," };
  const bank = crypto
    ? `<div>Wallet</div><div>${esc(req.wallet ?? "")}</div>${req.network ? `<div>Network</div><div>${esc(req.network)}</div>` : ""}`
    : `<div>IBAN</div><div>${esc(req.iban ?? "")}</div>${req.swift ? `<div>SWIFT / BIC Code</div><div>${esc(req.swift)}</div>` : ""}`;
  return `<!doctype html><html><head><meta charset="utf-8"><title>${t.title} ${String(no).padStart(2, "0")} ${esc(payer)}</title>
<style>
  @page{size:A4;margin:18mm 20mm}
  body{font-family:"Times New Roman",Times,serif;color:#000;font-size:15px;line-height:1.35;margin:0;padding:24px 56px}
  .contacts{text-align:right;font-family:Arial,Helvetica,sans-serif;font-size:14px}
  h1{text-align:center;font-family:Arial,Helvetica,sans-serif;font-size:17px;font-weight:700;margin:22px 0 26px;word-spacing:2px}
  .kv{display:grid;grid-template-columns:150px 1fr;column-gap:24px}
  .gap{height:18px} .gap2{height:44px}
  .rec{display:grid;grid-template-columns:100px 1fr} .rec .addr{grid-column:1/3;padding-left:130px}
  table{border-collapse:collapse;margin:34px 0 22px;width:72%}
  td,th{border:1px solid #000;padding:7px 10px;font-weight:400} th{text-align:center}
  .num{width:30px;text-align:center} .price{width:150px;white-space:nowrap} .price span{float:left} .price b{font-weight:400;float:right}
  .r{text-align:right}
  @media print{body{padding:0}}
</style></head><body>
${contacts ? `<div class="contacts">${contacts}</div>` : ""}
<h1>${t.title} № ${String(no).padStart(2, "0")}&nbsp;&nbsp;&nbsp; ${t.dated} ${esc(format(new Date(`${date}T12:00`), "dd.MM.yyyy"))}</h1>
<div>${esc(sign)}</div>
${req.taxId ? `<div>${ua ? "ЄДРПОУ " : ""}${esc(req.taxId)}</div>` : ""}
<div>${t.benef}</div>
<div class="kv">${bank}</div>
${!crypto && ((req.receiver && req.receiver !== sign) || req.address) ? `<div class="gap"></div><div class="rec"><div>${t.rec}</div><div style="padding-left:30px">${receiver}</div>${req.address ? `<div class="addr">${lines(req.address)}</div>` : ""}</div>` : ""}
${req.phone ? `<div class="gap"></div><div>${t.phone}:&nbsp;&nbsp; ${esc(req.phone)}</div>` : ""}
<div class="gap2"></div>
<div>${t.payer}:&nbsp;&nbsp; ${esc(payer)}</div>
${details.trim() ? `<div>${lines(details)}</div>` : ""}
<table>
  <tr><th class="num">№</th><th>${t.name}</th><th class="price" style="text-align:center">${t.price}</th></tr>
  <tr><td class="num">1</td><td>${esc(item)}</td><td class="price"><span>${sym}</span><b>${money}</b></td></tr>
  <tr><td></td><td class="r">${t.total}</td><td class="price"><span>${sym}</span><b>${money}</b></td></tr>
</table>
<div>${t.totalAmount}</div>
<div class="gap2"></div>
<div>${esc(amountWords(amount, a.currency))}</div>
<div class="gap2"></div>
<div>${t.vat}</div>
<div class="gap2"></div>
<div>${t.regards} ${esc(sign)}</div>
<script>window.onload=()=>setTimeout(()=>window.print(),300)</script>
</body></html>`;
}

// ── amount in words: 550 € → «Five hundred fifty euros 00 cents.», 550 ₴ → «П'ятсот п'ятдесят гривень 00 копійок.» ──
const ONES = ["", "one", "two", "three", "four", "five", "six", "seven", "eight", "nine", "ten", "eleven", "twelve", "thirteen", "fourteen", "fifteen", "sixteen", "seventeen", "eighteen", "nineteen"];
const TENS = ["", "", "twenty", "thirty", "forty", "fifty", "sixty", "seventy", "eighty", "ninety"];
function under1000(n: number): string {
  const h = Math.floor(n / 100), r = n % 100;
  const rest = r < 20 ? ONES[r] : `${TENS[Math.floor(r / 10)]}${r % 10 ? `-${ONES[r % 10]}` : ""}`;
  return [h ? `${ONES[h]} hundred` : "", rest].filter(Boolean).join(" ");
}
function words(n: number): string {
  if (n === 0) return "zero";
  const parts: string[] = [];
  for (const [v, name] of [[1e9, "billion"], [1e6, "million"], [1e3, "thousand"]] as const) {
    if (n >= v) { parts.push(`${under1000(Math.floor(n / v))} ${name}`); n %= v; }
  }
  if (n) parts.push(under1000(n));
  return parts.join(" ");
}

const UA_ONES_M = ["", "один", "два", "три", "чотири", "п'ять", "шість", "сім", "вісім", "дев'ять"];
const UA_ONES_F = ["", "одна", "дві", "три", "чотири", "п'ять", "шість", "сім", "вісім", "дев'ять"];
const UA_TEENS = ["десять", "одинадцять", "дванадцять", "тринадцять", "чотирнадцять", "п'ятнадцять", "шістнадцять", "сімнадцять", "вісімнадцять", "дев'ятнадцять"];
const UA_TENS = ["", "", "двадцять", "тридцять", "сорок", "п'ятдесят", "шістдесят", "сімдесят", "вісімдесят", "дев'яносто"];
const UA_HUND = ["", "сто", "двісті", "триста", "чотириста", "п'ятсот", "шістсот", "сімсот", "вісімсот", "дев'ятсот"];
const plural = (n: number, [one, few, many]: [string, string, string]) => {
  const m10 = n % 10, m100 = n % 100;
  return m10 === 1 && m100 !== 11 ? one : m10 >= 2 && m10 <= 4 && (m100 < 12 || m100 > 14) ? few : many;
};
function uaUnder1000(n: number, fem: boolean): string {
  const h = Math.floor(n / 100), r = n % 100;
  const rest = r >= 10 && r < 20 ? UA_TEENS[r - 10] : [UA_TENS[Math.floor(r / 10)], (fem ? UA_ONES_F : UA_ONES_M)[r % 10]].filter(Boolean).join(" ");
  return [UA_HUND[h], rest].filter(Boolean).join(" ");
}
function uaWords(n: number): string {
  if (n === 0) return "нуль";
  const parts: string[] = [];
  const groups: [number, [string, string, string], boolean][] = [
    [1e9, ["мільярд", "мільярди", "мільярдів"], false],
    [1e6, ["мільйон", "мільйони", "мільйонів"], false],
    [1e3, ["тисяча", "тисячі", "тисяч"], true],
  ];
  for (const [v, forms, fem] of groups) {
    if (n >= v) { const k = Math.floor(n / v); parts.push(`${uaUnder1000(k, fem)} ${plural(k, forms)}`); n %= v; }
  }
  if (n) parts.push(uaUnder1000(n, true)); // гривня — жіночий рід
  return parts.join(" ");
}

export function amountWords(amount: number, currency: string) {
  const whole = Math.floor(amount + 1e-9), cents = Math.round((amount - whole) * 100);
  const c = String(cents).padStart(2, "0");
  if (currency === "UAH") {
    const w = uaWords(whole);
    return `${w[0].toUpperCase()}${w.slice(1)} ${plural(whole, ["гривня", "гривні", "гривень"])} ${c} ${plural(cents, ["копійка", "копійки", "копійок"])}.`;
  }
  const unit = currency === "EUR" ? (whole === 1 ? "euro" : "euros") : currency === "USD" ? (whole === 1 ? "dollar" : "dollars") : currency;
  const w = words(whole);
  return `${w[0].toUpperCase()}${w.slice(1)} ${unit} ${c} cents.`;
}
