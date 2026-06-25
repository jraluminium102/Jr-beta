import { format } from "date-fns";

export const baht = (n?: number | null) =>
  n == null ? "—" : Number(n).toLocaleString("en-US", { maximumFractionDigits: 0 });

// วันที่มาตรฐานทั้งระบบ = ค.ศ. DD/MM/YYYY (เช่น 27/06/2026) — ห้ามใช้ พ.ศ. ที่ไหนอีก
export const thDate = (d?: string | null) => {
  if (!d) return "—";
  try { return format(new Date(d), "dd/MM/yyyy"); } catch { return d; }
};

/** ISO "YYYY-MM-DD" (หรือ timestamptz) → "DD/MM/YYYY" ค.ศ. แบบ string-based (กัน timezone เพี้ยน) */
export const ddmy = (iso?: string | null) => {
  if (!iso) return "—";
  const [y, m, d] = iso.slice(0, 10).split("-");
  if (!y || !m || !d) return iso;
  return `${d}/${m}/${y}`;
};

export function cn(...parts: (string | false | null | undefined)[]) {
  return parts.filter(Boolean).join(" ");
}
