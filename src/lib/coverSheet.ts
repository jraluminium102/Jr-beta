/**
 * Cover Sheet (ใบปะหน้า) — เฟส 3
 *
 * derive ข้อมูลใบปะหน้าจาก production_order (ใบสั่งผลิต)
 * ใบปะหน้าจริง = ตาราง 3 คอลัมน์ (ไม่ใช่ tick-list):
 *   ① สั่งของเตรียมผลิต   — AUTO: รวมบรรทัดวัสดุของทุกรายการ (dedupe)
 *   ② แจ้งช่างตอนติดตั้ง  — pre-fill งานพิเศษจากหมายเหตุ "ราคาที่เสนอรวม:" + เซลล์พิมพ์เพิ่ม
 *   ③ แจ้งลูกค้า+เตรียมของ — pre-fill วัสดุ "ไม่รวม" จากหมายเหตุ "ไม่รวม:" + เซลล์พิมพ์เพิ่ม
 *
 * อ้างอิง detail format จาก genQuote: public/calculator/index.html itemDetail() (บรรทัด 2108-2301)
 *   - แต่ละบรรทัดคั่นด้วย "\n", บรรทัดวัสดุขึ้นต้นด้วย "- "
 *   - ตำแหน่ง: "- ด้าน A ..."  · option: "OPTION : ..."
 *   - หมายเหตุรวม: "หมายเหตุ — ราคาที่เสนอรวม: ..."  · ไม่รวม: "หมายเหตุ — ไม่รวม: ..."
 */

import type { ProductionOrder, ProductionItem } from "@/lib/types";

export type CoverSheet = {
  /** ① สั่งของเตรียมผลิต — สเปกวัสดุทั้งงาน (dedupe ข้ามรายการ) */
  prepare: string[];
  /** ② แจ้งช่างตอนติดตั้ง — pre-fill งานพิเศษ (auto เท่าที่ดึงได้) */
  installerPrefill: string[];
  /** ③ แจ้งลูกค้า+เตรียมของ — pre-fill วัสดุที่ "ไม่รวม" (auto เท่าที่ดึงได้) */
  customerPrefill: string[];
};

// ─── line classifiers ────────────────────────────────────────────────────────

/** ตำแหน่งงาน glasshouse เช่น "ด้าน A บานกระจกติดตาย" — ไม่ใช่ของสั่ง */
const RE_SIDE = /^ด้าน\s+[A-H]\b/;
/** option ที่มีราคา เช่น "OPTION : ... (+1,000)" — ไม่เอาเข้าใบปะหน้า */
const RE_OPTION = /^OPTION\s*[:：]/i;
/** property ของรุ่น ไม่ใช่ของสั่ง */
const RE_PROPERTY = /^ใช้ภายใน/;
/** หมายเหตุ "ราคาที่เสนอรวม: ..." → งานพิเศษแจ้งช่าง (คอลัมน์ ②) */
const RE_NOTE_INCLUDE = /^หมายเหตุ\s*[—–-]\s*ราคาที่เสนอ\s*รวม\s*[:：]\s*(.+)$/;
/** หมายเหตุ "ไม่รวม: ..." → วัสดุลูกค้าเตรียม (คอลัมน์ ③) */
const RE_NOTE_EXCLUDE = /^หมายเหตุ\s*[—–-]\s*ไม่รวม\s*[:：]\s*(.+)$/;

/** ตัด "- " หรือ "• " นำหน้า + ช่องว่าง */
function stripBullet(line: string): string {
  return line.replace(/^\s*[-•]\s*/, "").trim();
}

/** แตกหลายงานในบรรทัดเดียวด้วย "/" เช่น "งานดรอปพื้น (B) / งานรื้อระแนง (C)" */
function splitMulti(s: string): string[] {
  return s
    .split(/\s*\/\s*/)
    .map((x) => x.trim())
    .filter(Boolean);
}

/** เพิ่มเข้า list แบบ dedupe (เทียบแบบ normalize ช่องว่าง/ตัวพิมพ์) */
function pushUnique(list: string[], seen: Set<string>, value: string): void {
  const v = value.trim();
  if (!v) return;
  const key = v.replace(/\s+/g, " ").toLowerCase();
  if (seen.has(key)) return;
  seen.add(key);
  list.push(v);
}

// ─── main ─────────────────────────────────────────────────────────────────────

export function deriveCoverSheet(order: ProductionOrder): CoverSheet {
  const prepare: string[] = [];
  const installerPrefill: string[] = [];
  const customerPrefill: string[] = [];

  const seenPrepare = new Set<string>();
  const seenInstaller = new Set<string>();
  const seenCustomer = new Set<string>();

  const items: ProductionItem[] = order.items ?? [];

  for (const it of items) {
    const detail = String(it.detail ?? "");
    if (!detail.trim()) continue;

    for (const rawLine of detail.split("\n")) {
      const line = rawLine.trim();
      if (!line || line === "-") continue;

      // หมายเหตุ "รวม" → คอลัมน์ ② (ตรวจก่อน strip bullet เพราะขึ้นต้น "หมายเหตุ")
      const mInc = line.match(RE_NOTE_INCLUDE);
      if (mInc) {
        for (const part of splitMulti(mInc[1])) {
          pushUnique(installerPrefill, seenInstaller, part);
        }
        continue;
      }

      // หมายเหตุ "ไม่รวม" → คอลัมน์ ③
      const mExc = line.match(RE_NOTE_EXCLUDE);
      if (mExc) {
        for (const part of splitMulti(mExc[1])) {
          pushUnique(customerPrefill, seenCustomer, part);
        }
        continue;
      }

      const body = stripBullet(line);
      if (!body) continue;

      // ข้าม: ตำแหน่งด้าน / option / property
      if (RE_SIDE.test(body) || RE_OPTION.test(body) || RE_PROPERTY.test(body)) {
        continue;
      }

      // ที่เหลือ = วัสดุสั่งของ → คอลัมน์ ①
      pushUnique(prepare, seenPrepare, body);
    }
  }

  return { prepare, installerPrefill, customerPrefill };
}
