// Round avatar with initials — contractors, owners, employees in the cashflow.
const COLORS = ["#60a5fa", "#f472b6", "#34d399", "#fbbf24", "#a78bfa", "#f87171", "#38bdf8", "#fb923c"];

export const initials = (name: string) =>
  name.trim().split(/\s+/).slice(0, 2).map((w) => w[0]?.toUpperCase() ?? "").join("") || "?";

const colorOf = (name: string) => COLORS[[...name].reduce((s, c) => s + c.charCodeAt(0), 0) % COLORS.length];

export function Avatar({ name, size = 22 }: { name: string; size?: number }) {
  const c = colorOf(name);
  return (
    <span className="inline-flex items-center justify-center rounded-full shrink-0 font-semibold"
      style={{ width: size, height: size, fontSize: size * 0.42, color: c, background: `${c}22`, border: `1px solid ${c}55` }}>
      {initials(name)}
    </span>
  );
}

export function Person({ name, sub }: { name: string; sub?: string | null }) {
  return (
    <span className="inline-flex items-center gap-2 min-w-0">
      <Avatar name={name} />
      <span className="min-w-0">
        <span className="block truncate text-[var(--text)]">{name}</span>
        {sub && <span className="block truncate text-[10px] text-[var(--text-dim)]">{sub}</span>}
      </span>
    </span>
  );
}
