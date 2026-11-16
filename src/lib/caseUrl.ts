// A case link is always stored with a scheme — «site.com» → «https://site.com».
export const normUrl = (v: unknown) => { const u = String(v ?? "").trim(); return u ? (/^https?:\/\//i.test(u) ? u : `https://${u}`) : ""; };
