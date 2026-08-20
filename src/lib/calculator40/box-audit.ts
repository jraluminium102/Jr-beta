/**
 * box-audit — รายงาน "กล่อง/ฉาก ในสูตรคิดราคา จับคู่กับสโตร์ได้ไหม"
 *   ไม่มีสูตรของตัวเอง — อ่านจาก PRODUCTS + ตารางราคาที่ buildBoxPrices ทำไว้
 */
/* eslint-disable @typescript-eslint/no-explicit-any */
import { PRODUCTS } from "./products.mjs";
import { parseBoxName, type BoxPrices, type BoxStockRow } from "./box-link.ts";

export type BoxRow = {
  key: string;            // 'กล่อง|1.6X3'
  kind: string; size: string;
  usedBy: string[];       // ใช้ในรุ่นไหนบ้าง
  lines: string[];        // ชื่อบรรทัดในสูตร
  formulaPrice: number;   // ราคาที่สูตรใช้อยู่ (ยังไม่ผูก)
  colors: { color: string; price: number }[];   // ราคาในสโตร์ แยกสี
  status: "ครบ" | "มีบางสี" | "ไม่เจอในสโตร์";
};

const num = (v: any) => Number(v) || 0;

/** กล่อง/ฉาก ทุกคีย์ที่สูตรเรียกใช้ + ราคาที่เจอในสโตร์ */
export function auditBoxes(BOX: BoxPrices | undefined): BoxRow[] {
  const byKey = new Map<string, BoxRow>();
  for (const p of Object.values(PRODUCTS as Record<string, any>)) {
    for (const grp of ["alu", "hardware", "consum"] as const) {
      for (const it of (p[grp] || [])) {
        if (!it.box) continue;
        const [kind, size] = String(it.box).split("|");
        const e = byKey.get(it.box) ?? {
          key: it.box, kind, size, usedBy: [], lines: [],
          formulaPrice: typeof it.price === "number" ? it.price : 0,
          colors: [], status: "ไม่เจอในสโตร์" as BoxRow["status"],
        };
        const pn = p.name || p.id;
        if (!e.usedBy.includes(pn)) e.usedBy.push(pn);
        if (!e.lines.includes(it.name)) e.lines.push(it.name);
        byKey.set(it.box, e);
      }
    }
  }
  const rows = [...byKey.values()];
  for (const r of rows) {
    const b = BOX?.[r.key] ?? {};
    r.colors = Object.entries(b).map(([color, price]) => ({ color, price: num(price) }))
      .filter((c) => c.price > 0)
      .sort((a, c) => a.color.localeCompare(c.color, "th"));
    // "ครบ" = มีครบทั้ง 4 สีหลักที่ขายจริง · มีบ้าง = มีบางสี
    const main = ["อบขาว", "ดำ", "เทาซาฮาร่า", "ลายไม้สักทอง"];
    const have = new Set(r.colors.map((c) => c.color));
    r.status = !r.colors.length ? "ไม่เจอในสโตร์"
      : main.every((m) => have.has(m)) ? "ครบ" : "มีบางสี";
  }
  const order = { "ไม่เจอในสโตร์": 0, "มีบางสี": 1, "ครบ": 2 } as const;
  return rows.sort((a, b) => order[a.status] - order[b.status] || a.key.localeCompare(b.key));
}

/** รายการในสโตร์ที่ "อ่านเป็นกล่อง/ฉากได้" แต่สูตรไม่มีขนาดนี้ — เผื่อสูตรพิมพ์ขนาดผิด */
export function unusedBoxesInStock(stock: BoxStockRow[], used: Set<string>) {
  const out = new Map<string, { key: string; sample: string; colors: number }>();
  for (const r of stock ?? []) {
    const p = parseBoxName(r.name);
    if (!p) continue;
    const key = `${p.kind}|${p.size}`;
    if (used.has(key)) continue;
    const e = out.get(key) ?? { key, sample: String(r.name ?? ""), colors: 0 };
    e.colors++;
    out.set(key, e);
  }
  return [...out.values()].sort((a, b) => b.colors - a.colors);
}
