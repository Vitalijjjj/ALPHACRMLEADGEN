// Amount inputs: "20000" → "20 000" while typing (thousands split by a space); keeps one decimal part.
export function groupNum(raw: string): string {
  const s = raw.replace(/[^\d.,-]/g, "");
  const neg = s.startsWith("-");
  const body = s.replace(/-/g, "");
  const sep = body.search(/[.,]/);
  const int = (sep < 0 ? body : body.slice(0, sep)).replace(/[.,]/g, "");
  const dec = sep < 0 ? null : body.slice(sep + 1).replace(/[.,]/g, "");
  const grouped = int.replace(/^0+(?=\d)/, "").replace(/\B(?=(\d{3})+(?!\d))/g, " ");
  return `${neg ? "-" : ""}${grouped}${dec !== null ? `${body[sep]}${dec}` : ""}`;
}

// "20 000,5" → 20000.5 (NaN when empty / not a number)
export const parseNum = (s: string) => (s.trim() ? Number(s.replace(/\s/g, "").replace(",", ".")) : NaN);

// a stored number → the input text ("" for empty)
export const numText = (v: number | null | undefined) => (v === null || v === undefined || !Number.isFinite(v) ? "" : groupNum(String(v).replace(".", ",")));
