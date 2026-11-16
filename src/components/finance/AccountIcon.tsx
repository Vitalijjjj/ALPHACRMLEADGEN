import { Bitcoin, Building2, CircleDollarSign, CreditCard, Landmark, Wallet, type LucideIcon } from "lucide-react";
import { KIND_META, kindOf, type Account, type AccountKind } from "@/lib/finance";

export const KIND_ICON: Record<AccountKind, LucideIcon> = {
  fop: Landmark, company: Building2, card: CreditCard, paypal: CircleDollarSign, crypto: Bitcoin, other: Wallet,
};
export const CUR_SYM: Record<string, string> = { UAH: "₴", USD: "$", EUR: "€" };

// Account icon in a tinted square (size = square side); `plain` — bare icon.
export default function AccountIcon({ a, size = 28, plain }: { a?: Account; size?: number; plain?: boolean }) {
  const kind = a ? kindOf(a) : "other";
  const { color } = KIND_META[kind];
  const props = { size: Math.round(size * 0.5), style: plain ? undefined : { color } };
  const icon = (() => {
    switch (kind) {
      case "fop": return <Landmark {...props} />;
      case "company": return <Building2 {...props} />;
      case "card": return <CreditCard {...props} />;
      case "paypal": return <CircleDollarSign {...props} />;
      case "crypto": return <Bitcoin {...props} />;
      default: return <Wallet {...props} />;
    }
  })();
  if (plain) return <span className="shrink-0 text-[var(--text-dim)] inline-flex">{icon}</span>;
  return (
    <span className="relative shrink-0 rounded-lg flex items-center justify-center" style={{ width: size, height: size, background: `${color}1a` }}>
      {icon}
      {a && a.kind !== "paypal" && !a.anyCurrency && size >= 26 && (
        <span className="absolute -bottom-1 -right-1 min-w-[14px] h-[14px] px-0.5 rounded-full bg-[#18181b] border border-white/10 text-[9px] font-bold leading-[12px] text-center text-[var(--text-muted)]">
          {CUR_SYM[a.currency] ?? a.currency}
        </span>
      )}
    </span>
  );
}
