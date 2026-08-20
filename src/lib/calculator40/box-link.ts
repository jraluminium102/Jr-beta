/**
 * box-link — ผูก "กล่อง/ฉาก อลูเมืองทอง" ในสูตรคิดราคา กับรายการในสโตร์ ด้วย "ชื่อ+ขนาด+สี"
 * ─────────────────────────────────────────────────────────────────────────────
 * ทำไม (เจ้าของ 19 ส.ค.69): กล่อง/ฉาก ไม่มีรหัส B####/F#### เหมือนเส้นอลู
 *   แต่สโตร์ตั้งชื่อลงตัวอยู่แล้ว เช่น `กล่อง 4"x6"-Aztec gray` → จับคู่ตามชื่อได้
 *
 * ปัญหาที่ต้องกันคือ "เขียนขนาดคนละแบบ" — ในสูตรมีทั้ง
 *   1.6"x3"  ·  1.6"×4"  ·  1×1.6  ·  1"×1"  ·  4"×4"  ·  1×1½
 * เลยต้องล้างให้เป็นรูปเดียวก่อนเทียบ (normSize) ไม่งั้นจับคู่ไม่ติดทั้งที่เป็นของชิ้นเดียวกัน
 *
 * ⚠ จับคู่ได้ = ใช้ราคาสโตร์ · จับคู่ไม่ได้ = ใช้ราคาในสูตรเหมือนเดิม (ห้ามหล่นเป็น 0)
 */
/* eslint-disable @typescript-eslint/no-explicit-any */

/** ชนิดของที่ผูกด้วยชื่อ (ไม่มีรหัสโปรไฟล์) */
export const BOX_KINDS = ["กล่อง", "ฉาก", "แป๊บ", "ตัวZ", "ท่อ"] as const;
export type BoxKind = (typeof BOX_KINDS)[number];

const th = (s: unknown) => String(s ?? "").trim();

/**
 * ล้างขนาดให้เป็นรูปเดียว: ตัดฟุตหุน/ช่องว่าง · ×→x · ½→.5 · ตัด .0 ท้าย
 *   `1.6"x3"` `1.6 × 3"` `1.6X3` → `1.6X3`     ·   `1×1½` → `1X1.5`
 */
export function normSize(raw: unknown): string {
  let s = th(raw)
    .replace(/[”"″']/g, "")
    .replace(/[×✕✖]/g, "x")
    .replace(/½/g, ".5").replace(/¼/g, ".25").replace(/¾/g, ".75")
    .replace(/นิ้ว|inch/gi, "")
    .replace(/\s+/g, "")
    .toUpperCase();
  const num = (v: string) => String(Number(v));       // 1.60 → 1.6 · 4.0 → 4
  const m = s.match(/(\d+(?:\.\d+)?)X(\d+(?:\.\d+)?)/);
  if (m) return `${num(m[1])}X${num(m[2])}`;
  // ขนาดเดี่ยว: `ฉาก 6 หุน` · `ฉาก 4" ปิดราง` → "6หุน" · "4"
  const h = s.match(/(\d+(?:\.\d+)?)หุน/);
  if (h) return `${num(h[1])}หุน`;
  const one = s.match(/(?:^|[^\d.])(\d+(?:\.\d+)?)(?![\d.])/);
  return one ? num(one[1]) : "";
}

/** คีย์กลางของของชิ้นหนึ่ง: ชนิด + ขนาด (ไม่รวมสี) */
export const boxKey = (kind: string, size: unknown) => `${th(kind)}|${normSize(size)}`;

/**
 * อ่านชื่อในสโตร์ → { ชนิด, ขนาด, สี }
 *   รูปแบบที่รองรับ: `กล่อง 4"x6"-Aztec gray` · `ฉาก 6 หุน-อบขาว` · `กล่อง 1.6"x1.6"-มิว`
 *   ชื่อที่ไม่เข้าเกณฑ์ (ไม่มีขนาด) → คืน null
 */
export function parseBoxName(name: unknown): { kind: BoxKind; size: string; color: string } | null {
  const raw = th(name);
  if (!raw) return null;
  const kind = BOX_KINDS.find((k) => raw.replace(/\s+/g, "").startsWith(k.replace(/\s+/g, "")));
  if (!kind) return null;
  // สีอยู่หลังขีดสุดท้าย (ชื่อกล่องเองไม่มีขีด) — ไม่มีขีด = ยังไม่ระบุสี
  const dash = raw.lastIndexOf("-");
  const color = dash > 0 ? th(raw.slice(dash + 1)) : "";
  const size = normSize(dash > 0 ? raw.slice(0, dash) : raw);
  if (!size) return null;
  return { kind, size, color };
}

export type BoxStockRow = { name?: string | null; color?: string | null; unit_cost?: number | string | null };
/** ตารางราคา: BOXPRICE["กล่อง|1.6X3"]["อบขาว"] = 1240 */
export type BoxPrices = Record<string, Record<string, number>>;

/** รวมราคากล่อง/ฉาก จากสโตร์ — เอาเฉพาะที่ตั้งราคาแล้ว (ราคา 0 = ยังไม่ตั้ง ข้ามไป) */
export function buildBoxPrices(rows: BoxStockRow[]): BoxPrices {
  const out: BoxPrices = {};
  for (const r of rows ?? []) {
    const cost = Number(r.unit_cost) || 0;
    if (!(cost > 0)) continue;
    const p = parseBoxName(r.name);
    if (!p) continue;
    // สีจากช่อง "สี" มาก่อน ไม่มีค่อยใช้สีที่อ่านจากท้ายชื่อ
    const color = th(r.color) || p.color;
    if (!color) continue;
    const k = boxKey(p.kind, p.size);
    const b = out[k] || (out[k] = {});
    // ซ้ำสีเดิม → เอาถูกสุด (กันแถวสีพิเศษดันราคาขึ้น — ตรรกะเดียวกับเส้นอลู)
    b[color] = b[color] > 0 ? Math.min(b[color], cost) : cost;
  }
  return out;
}

/** ราคากล่องของสีนั้น — ไม่เจอสีที่ขอ ลองสีมิว (ยังไม่ทำสี) เป็นตัวสำรอง · ไม่เจอเลย = null */
export function boxPriceOf(BOX: BoxPrices | undefined, key: string, color: string): number | null {
  const b = BOX?.[key];
  if (!b) return null;
  const c = th(color);
  if (c && b[c] > 0) return b[c];
  for (const alt of ["มิว", "อบขาว"]) if (b[alt] > 0) return b[alt];
  return null;
}
