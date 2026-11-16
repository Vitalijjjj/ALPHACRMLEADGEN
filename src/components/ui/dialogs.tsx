"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { AlertTriangle, Eye, EyeOff, HelpCircle, KeyRound, Trash2, X } from "lucide-react";

// Our own pop-ups instead of the browser's confirm() / prompt() («Повідомлення з localhost:3000»).
//   if (!(await ask("Видалити кампанію?"))) return;
//   const pass = await askText({ title: "Новий пароль", secret: true, min: 6 });
// <Dialogs /> lives in the dashboard layout.

export interface AskOptions {
  title?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  danger?: boolean; // red button; on by default when the text starts with «Видалити»
}

export interface AskTextOptions {
  title: string;
  text?: string;
  label?: string;
  placeholder?: string;
  initial?: string;
  secret?: boolean;   // password field with an eye toggle
  min?: number;       // minimum length
  confirmLabel?: string;
}

type Req =
  | { id: number; kind: "confirm"; text: string; opts: AskOptions; resolve: (v: boolean) => void }
  | { id: number; kind: "text"; opts: AskTextOptions; resolve: (v: string | null) => void };

let nextId = 1;
const listeners = new Set<(r: Req) => void>();
const emit = (r: Req) => listeners.forEach((l) => l(r));

export function ask(text: string, opts: AskOptions = {}): Promise<boolean> {
  if (!listeners.size) return Promise.resolve(window.confirm(text));
  return new Promise((resolve) => emit({ id: nextId++, kind: "confirm", text, opts, resolve }));
}

export function askText(opts: AskTextOptions): Promise<string | null> {
  if (!listeners.size) return Promise.resolve(window.prompt(opts.title, opts.initial ?? ""));
  return new Promise((resolve) => emit({ id: nextId++, kind: "text", opts, resolve }));
}

export function Dialogs() {
  const [queue, setQueue] = useState<Req[]>([]);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- portal target exists only in the browser
    setMounted(true);
    const add = (r: Req) => setQueue((q) => [...q, r]);
    listeners.add(add);
    return () => { listeners.delete(add); };
  }, []);

  if (!mounted || !queue.length) return null;
  const cur = queue[0];
  const close = () => setQueue((q) => q.slice(1));

  return createPortal(
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm dialog-fade" onClick={() => {
        if (cur.kind === "confirm") cur.resolve(false); else cur.resolve(null);
        close();
      }} />
      {cur.kind === "confirm"
        ? <ConfirmBox key={cur.id} req={cur} onDone={(v) => { cur.resolve(v); close(); }} />
        : <TextBox key={cur.id} req={cur} onDone={(v) => { cur.resolve(v); close(); }} />}
    </div>,
    document.body
  );
}

function Shell({ color, icon, title, onClose, children }: { color: string; icon: React.ReactNode; title: string; onClose: () => void; children: React.ReactNode }) {
  return (
    <div
      role="dialog"
      aria-modal="true"
      className="relative w-full max-w-[400px] rounded-2xl border bg-[var(--surface)] shadow-2xl dialog-pop overflow-hidden"
      style={{ borderColor: `${color}33`, boxShadow: `0 24px 60px -20px rgba(0,0,0,0.8), 0 0 0 1px ${color}14` }}
    >
      <div className="absolute inset-x-0 top-0 h-24 pointer-events-none" style={{ background: `radial-gradient(120% 100% at 50% 0%, ${color}1c, transparent 70%)` }} />
      <button onClick={onClose} aria-label="Закрити" className="absolute z-10 top-3 right-3 p-1 rounded-md text-[var(--text-dim)] hover:text-[var(--text)] hover:bg-white/[0.06] cursor-pointer">
        <X size={14} />
      </button>
      <div className="relative p-5">
        <div className="flex items-start gap-3">
          <span className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0" style={{ color, background: `${color}1f`, border: `1px solid ${color}33` }}>
            {icon}
          </span>
          <div className="min-w-0 flex-1 pt-0.5 pr-5">
            <h2 className="text-[15px] font-semibold text-[var(--text)] leading-snug">{title}</h2>
          </div>
        </div>
        {children}
      </div>
    </div>
  );
}

function ConfirmBox({ req, onDone }: { req: Extract<Req, { kind: "confirm" }>; onDone: (v: boolean) => void }) {
  const danger = req.opts.danger ?? /^(видалити|прибрати|скасувати)/i.test(req.text.trim());
  const color = danger ? "#ef4444" : "#C98C0A";
  const okRef = useRef<HTMLButtonElement>(null);
  // split «Видалити X? Деталі.» into a title and a hint
  const m = req.text.match(/^([^?]+\?)\s*([\s\S]*)$/);
  const title = req.opts.title ?? (m ? m[1] : req.text);
  const hint = req.opts.title ? req.text : m ? m[2] : "";

  useEffect(() => {
    okRef.current?.focus();
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onDone(false); };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onDone]);

  return (
    <Shell color={color} icon={danger ? <Trash2 size={18} /> : <HelpCircle size={18} />} title={title} onClose={() => onDone(false)}>
      {hint && <p className="mt-3 text-sm text-[var(--text-muted)] leading-relaxed">{hint}</p>}
      <div className="mt-5 flex gap-2">
        <button onClick={() => onDone(false)} className="flex-1 px-4 py-2.5 rounded-xl text-sm font-medium border border-[var(--border)] text-[var(--text-muted)] hover:text-[var(--text)] hover:bg-white/[0.04] cursor-pointer transition-colors">
          {req.opts.cancelLabel ?? "Скасувати"}
        </button>
        <button
          ref={okRef}
          onClick={() => onDone(true)}
          className="flex-1 px-4 py-2.5 rounded-xl text-sm font-semibold cursor-pointer transition-[filter] hover:brightness-110 outline-none focus-visible:ring-2 focus-visible:ring-white/30"
          style={{ background: danger ? "#ef4444" : "var(--accent)", color: danger ? "#fff" : "#000" }}
        >
          {req.opts.confirmLabel ?? (danger ? "Видалити" : "Так")}
        </button>
      </div>
    </Shell>
  );
}

function TextBox({ req, onDone }: { req: Extract<Req, { kind: "text" }>; onDone: (v: string | null) => void }) {
  const o = req.opts;
  const [val, setVal] = useState(o.initial ?? "");
  const [show, setShow] = useState(false);
  const [touched, setTouched] = useState(false);
  const short = (o.min ?? 1) > val.trim().length;
  const color = o.secret ? "#4285F4" : "#C98C0A";

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onDone(null); };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onDone]);

  function submit(e: React.FormEvent) {
    e.preventDefault();
    setTouched(true);
    if (!short) onDone(o.secret ? val : val.trim());
  }

  return (
    <Shell color={color} icon={o.secret ? <KeyRound size={18} /> : <HelpCircle size={18} />} title={o.title} onClose={() => onDone(null)}>
      {o.text && <p className="mt-3 text-sm text-[var(--text-muted)] leading-relaxed">{o.text}</p>}
      <form onSubmit={submit} className="mt-4 space-y-1.5">
        {o.label && <label className="block text-xs font-medium text-[var(--text-muted)]">{o.label}</label>}
        <div className="relative">
          <input
            autoFocus
            type={o.secret && !show ? "password" : "text"}
            value={val}
            onChange={(e) => setVal(e.target.value)}
            placeholder={o.placeholder}
            autoComplete={o.secret ? "new-password" : "off"}
            className="w-full px-3.5 py-2.5 pr-10 rounded-xl text-sm bg-[var(--surface-2)] border border-[var(--border)] text-[var(--text)] placeholder:text-[var(--text-dim)] outline-none focus:border-[color:var(--ring)] transition-colors"
            style={{ ["--ring" as string]: color }}
          />
          {o.secret && (
            <button type="button" onClick={() => setShow((v) => !v)} tabIndex={-1} aria-label={show ? "Сховати" : "Показати"}
              className="absolute right-2 top-1/2 -translate-y-1/2 p-1.5 rounded-md text-[var(--text-dim)] hover:text-[var(--text)] cursor-pointer">
              {show ? <EyeOff size={15} /> : <Eye size={15} />}
            </button>
          )}
        </div>
        <div className="h-4 text-[11px]">
          {o.min && o.min > 1 && (
            <span className={touched && short ? "text-red-400 flex items-center gap-1" : "text-[var(--text-dim)]"}>
              {touched && short && <AlertTriangle size={10} />}
              Щонайменше {o.min} символів{val ? ` · зараз ${val.trim().length}` : ""}
            </span>
          )}
        </div>
        <div className="pt-2 flex gap-2">
          <button type="button" onClick={() => onDone(null)} className="flex-1 px-4 py-2.5 rounded-xl text-sm font-medium border border-[var(--border)] text-[var(--text-muted)] hover:text-[var(--text)] hover:bg-white/[0.04] cursor-pointer transition-colors">
            Скасувати
          </button>
          <button type="submit" className="flex-1 px-4 py-2.5 rounded-xl text-sm font-semibold text-black cursor-pointer transition-[filter,opacity] hover:brightness-110"
            style={{ background: o.secret ? "#4285F4" : "var(--accent)", color: o.secret ? "#fff" : "#000", opacity: short ? 0.55 : 1 }}>
            {o.confirmLabel ?? "Зберегти"}
          </button>
        </div>
      </form>
    </Shell>
  );
}
