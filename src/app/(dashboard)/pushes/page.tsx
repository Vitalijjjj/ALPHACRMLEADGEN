"use client";

import { useState } from "react";
import { Copy, Check } from "lucide-react";

const TEMPLATES: string[] = [
  `Я так розумію, що стався певний форс-мажор або зсув у графіку, і вам не вдалося підключитися

Підкажіть, будь ласка, на який час сьогодні або, можливо, завтра вам було б зручно вийти на дзвінок`,

  `Дееень добрий!
Розумію, що можете бути зайняті, тож напишіть, будь ласка, як тільки Вам буде зручно

Якщо, звісно, це Вам все ще цікаво 🙂

Не хочу надокучати, якщо тема вже неактуальна`,

  `Привіт-привіт! Так і не отримав відповідь, тому нагадую про себе🫶`,
];

export default function PushesPage() {
  const [copiedIdx, setCopiedIdx] = useState<number | null>(null);

  async function copy(text: string, idx: number) {
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      // Fallback for browsers without clipboard API / insecure context
      const ta = document.createElement("textarea");
      ta.value = text;
      ta.style.position = "fixed";
      ta.style.opacity = "0";
      document.body.appendChild(ta);
      ta.select();
      document.execCommand("copy");
      document.body.removeChild(ta);
    }
    setCopiedIdx(idx);
    setTimeout(() => setCopiedIdx((c) => (c === idx ? null : c)), 1800);
  }

  return (
    <div className="p-3 sm:p-6 space-y-4 max-w-3xl">
      {/* Header */}
      <div>
        <h1 className="text-lg font-semibold text-[var(--text)]">Пуші</h1>
        <p className="text-xs text-[var(--text-muted)] mt-0.5">
          Готові шаблони повідомлень — натисніть «Скопіювати» і вставте клієнту
        </p>
      </div>

      {/* Cards */}
      <div className="space-y-3">
        {TEMPLATES.map((text, idx) => {
          const copied = copiedIdx === idx;
          return (
            <div
              key={idx}
              className="bg-[var(--surface)] border border-[var(--border)] rounded-xl overflow-hidden"
            >
              <div
                className="flex items-center justify-between px-4 py-2.5"
                style={{ borderBottom: "1px solid rgba(255,255,255,0.05)" }}
              >
                <span className="text-xs font-medium text-[var(--text-muted)]">
                  Шаблон {idx + 1}
                </span>
                <button
                  onClick={() => copy(text, idx)}
                  className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-semibold transition-colors cursor-pointer"
                  style={
                    copied
                      ? { background: "rgba(34,197,94,0.15)", border: "1px solid rgba(34,197,94,0.35)", color: "#22c55e" }
                      : { background: "var(--accent-subtle)", border: "1px solid var(--accent)", color: "var(--accent)" }
                  }
                >
                  {copied ? <Check size={13} /> : <Copy size={13} />}
                  {copied ? "Скопійовано" : "Скопіювати"}
                </button>
              </div>
              <p className="px-4 py-3 text-sm text-[var(--text)] whitespace-pre-wrap leading-relaxed">
                {text}
              </p>
            </div>
          );
        })}
      </div>
    </div>
  );
}
