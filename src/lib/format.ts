import { format } from "date-fns";

export const baht = (n?: number | null) =>
  n == null ? "—" : Number(n).toLocaleString("en-US", { maximumFractionDigits: 0 });

export const thDate = (d?: string | null) => {
  if (!d) return "—";
  try { return format(new Date(d), "d MMM yyyy"); } catch { return d; }
};

export function cn(...parts: (string | false | null | undefined)[]) {
  return parts.filter(Boolean).join(" ");
}
