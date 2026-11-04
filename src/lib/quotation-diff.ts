/**
 * เทียบรายการใบเสนอ "ก่อน Rev" กับ "หลัง Rev" → สรุปเป็นภาษาคนให้ฝ่ายผลิตอ่าน (Rev. หลังมัดจำ · 0169)
 *   รายการถูกลบ+ใส่ใหม่ทุกครั้งที่แก้ (id เปลี่ยน) → จับคู่ด้วย ชื่อ+หัวข้อชุด ก่อน แล้วค่อยตำแหน่ง
 *   สเปคที่ฝ่ายผลิตสนใจ = บุลเลทใต้ "รายละเอียดงาน" (สี/กระจก/มุ้ง/อื่น ๆ) — ใช้ตัวดึงเดียวกับใบปะหน้า
 */
import { specBulletsFromDetail } from "@/lib/cover-sheet/generate.mjs";

export type DiffItem = { name?: string | null; detail?: string | null; qty?: number | null; unit_price?: number | null; group_label?: string | null; sort_order?: number | null };
export type RevChange =
  | { kind: "added"; name: string }
  | { kind: "removed"; name: string }
  | { kind: "changed"; name: string; changes: string[] };

const norm = (s: unknown) => String(s ?? "").replace(/\s+/g, " ").trim();
const key = (it: DiffItem) => `${norm(it.group_label)}|${norm(it.name)}`;
const specKind = (b: string) => (/สี/.test(b) && /อลู|เฟรม|โครง|สีอบ/.test(b)) || /^อลูฯ/.test(b) ? "สีอลู" : /กระจก/.test(b) ? "กระจก" : /มุ้ง/.test(b) ? "มุ้ง" : /มือจับ/.test(b) ? "มือจับ" : /ราง/.test(b) ? "ราง" : "";
const fmtNum = (n: unknown) => Number(n ?? 0).toLocaleString("th-TH");

function specChanges(oldDetail: unknown, newDetail: unknown): string[] {
  const a = specBulletsFromDetail(String(oldDetail ?? "")) as string[];
  const b = specBulletsFromDetail(String(newDetail ?? "")) as string[];
  const out: string[] = [];
  const removed = a.filter((x) => !b.includes(x));
  const added = b.filter((x) => !a.includes(x));
  // จับคู่ "ชนิดเดียวกัน" (สีอลู→สีอลู) ให้ขึ้นเป็น "เดิม → ใหม่" อ่านง่าย
  const usedAdd = new Set<number>();
  for (const r of removed) {
    const k = specKind(r);
    const j = k ? added.findIndex((x, i) => !usedAdd.has(i) && specKind(x) === k) : -1;
    if (j >= 0) { usedAdd.add(j); out.push(`${k}: ${r} → ${added[j]}`); }
    else out.push(`ตัด: ${r}`);
  }
  added.forEach((x, i) => { if (!usedAdd.has(i)) out.push(`เพิ่ม: ${x}`); });
  if (!out.length && norm(oldDetail) !== norm(newDetail)) out.push("รายละเอียด/หมายเหตุเปลี่ยน (นอกบล็อกสเปค)");
  return out;
}

export function diffQuotationItems(oldItems: DiffItem[], newItems: DiffItem[]): RevChange[] {
  const out: RevChange[] = [];
  const oldByKey = new Map<string, DiffItem[]>();
  for (const it of oldItems) { const k = key(it); (oldByKey.get(k) ?? oldByKey.set(k, []).get(k)!).push(it); }
  const matchedOld = new Set<DiffItem>();
  const unmatchedNew: DiffItem[] = [];
  for (const n of newItems) {
    const pool = (oldByKey.get(key(n)) ?? []).filter((o) => !matchedOld.has(o));
    if (!pool.length) { unmatchedNew.push(n); continue; }
    const o = pool[0]; matchedOld.add(o);
    // ⚠ ไม่ใส่ราคาใน summary — ไปถึงช่าง/ติดตั้ง (production:read) ที่ไม่ควรเห็นราคา (QA MED-7) · ฝ่ายผลิตดูราคาที่ใบเสนอเอง
    const ch: string[] = [];
    if (Number(o.qty) !== Number(n.qty)) ch.push(`จำนวน ${fmtNum(o.qty)} → ${fmtNum(n.qty)}`);
    ch.push(...specChanges(o.detail, n.detail));
    if (ch.length) out.push({ kind: "changed", name: norm(n.name) || "(ไม่มีชื่อ)", changes: ch });
  }
  // ที่เหลือ: ชื่อเปลี่ยน? จับคู่ด้วยตำแหน่งเดิม (sort_order) ถ้าทั้งคู่ยังเหลือ
  const leftOld = oldItems.filter((o) => !matchedOld.has(o));
  for (const n of unmatchedNew) {
    const o = leftOld.find((x) => !matchedOld.has(x) && Number(x.sort_order) === Number(n.sort_order));
    if (o) {
      matchedOld.add(o);
      const ch = norm(o.name) !== norm(n.name) ? [`ชื่อรายการ: ${norm(o.name)} → ${norm(n.name)}`] : [`หัวข้อชุด: ${norm(o.group_label) || "—"} → ${norm(n.group_label) || "—"}`];
      if (Number(o.qty) !== Number(n.qty)) ch.push(`จำนวน ${fmtNum(o.qty)} → ${fmtNum(n.qty)}`);
      ch.push(...specChanges(o.detail, n.detail));
      out.push({ kind: "changed", name: norm(n.name) || "(ไม่มีชื่อ)", changes: ch });
    } else out.push({ kind: "added", name: norm(n.name) || "(ไม่มีชื่อ)" });
  }
  for (const o of oldItems) if (!matchedOld.has(o)) out.push({ kind: "removed", name: norm(o.name) || "(ไม่มีชื่อ)" });
  return out;
}

/** บรรทัดสั้น ๆ ไว้โชว์บนการ์ด */
export function summarizeRevChanges(ch: RevChange[]): string[] {
  const lines: string[] = [];
  for (const c of ch) {
    if (c.kind === "added") lines.push(`➕ เพิ่ม: ${c.name}`);
    else if (c.kind === "removed") lines.push(`➖ ตัด: ${c.name}`);
    else for (const x of c.changes) lines.push(`✏️ ${c.name} — ${x}`);
  }
  return lines;
}
