/**
 * stock-audit — ตรวจว่า "ทุกราคาที่คิดราคา 4.0 ใช้" ผูกกับสินค้าในสโตร์จริงหรือยัง
 *
 * ทำไมต้องมี (เจ้าของสั่ง 8 ส.ค.69): กังวลว่าผูกโปรไฟล์ผิดตัว / ผิดสี / ไม่ครบ
 *   และกลัวว่า "เพิ่มราคาต่อกิโลในสโตร์แล้วราคาในใบเสนอไม่เด้งตาม"
 *   → ต้องไล่ดูได้ทีละรายการ พร้อมรหัสสินค้า เอาไปกาเช็คเองได้
 *
 * ฟังก์ชันในไฟล์นี้บริสุทธิ์ (รับข้อมูลเข้า คืนผลออก) — เทสที่ scripts/verify-stock-audit.mjs
 */
/* eslint-disable @typescript-eslint/no-explicit-any */
import { PRODUCTS } from "./products.mjs";
import { computeCost } from "./engine.mjs";

export type AuditStockRow = {
  id?: number; name?: string | null; sku?: string | null; color?: string | null;
  category?: string | null; supplier?: string | null;
  is_weight_based?: boolean | null; unit_cost?: number | string | null; price_per_kg?: number | string | null;
};

export type AuditStatus = "linked" | "price_diff" | "missing" | "no_key" | "multi" | "zero";
export type AuditRow = {
  section: string;              // หมวด (อลูรายเส้น / อุปกรณ์ / กระจก ...)
  usedBy: string;               // ใช้ในรุ่นไหน (ว่าง = ตารางราคากลาง)
  item: string;                 // ชื่อบรรทัดในสูตร
  key: string;                  // คีย์ที่ใช้ผูก (รหัส/ชื่อ)
  keyKind: "sku" | "ชื่อ" | "แบรนด์" | "-";
  formulaPrice: number | null;  // ราคาที่สูตรใช้อยู่
  stockPrice: number | null;    // ราคาที่เจอในสโตร์
  stockSku: string;             // รหัสจริงในสโตร์ที่จับคู่ได้
  matches: number;              // เจอกี่แถว
  status: AuditStatus;
  note: string;
};

const num = (v: any) => (Number(v) || 0);
const norm = (s: any) => String(s ?? "").trim();
const up = (s: any) => norm(s).toUpperCase();
const near = (a: number, b: number) => Math.abs(a - b) <= 0.51;

export const STATUS_LABEL: Record<AuditStatus, string> = {
  linked: "ผูกแล้ว",
  price_diff: "ผูกแล้ว แต่ราคาไม่ตรง",
  missing: "ไม่เจอในสโตร์",
  no_key: "ผูกไม่ได้ (ไม่มีรหัส/ยังไม่เปิดผูก)",
  multi: "เจอหลายแถว ต้องเลือกสี",
  zero: "เจอแล้วแต่ราคาเป็น 0",
};

/** ตรวจทั้งระบบ — คืนรายการทีละบรรทัดพร้อมสถานะ */
export function auditStockLink(stock: AuditStockRow[], PB: any): AuditRow[] {
  const rows: AuditRow[] = [];
  const bySku = new Map<string, AuditStockRow[]>();
  const byName = new Map<string, AuditStockRow[]>();
  for (const r of stock || []) {
    const s = up(r.sku), nm = norm(r.name);
    if (s) { if (!bySku.has(s)) bySku.set(s, []); bySku.get(s)!.push(r); }
    if (nm) { if (!byName.has(nm)) byName.set(nm, []); byName.get(nm)!.push(r); }
  }

  const isWhite = (r: AuditStockRow) => norm(r.name).includes("อบขาว") || norm(r.color).includes("อบขาว");
  /** ราคาตัวแทนของกลุ่มแถว — ตรรกะเดียวกับ buildPriceOverride (แถวอบขาวก่อน ไม่มีก็ต่ำสุด) */
  const pickCost = (list: AuditStockRow[]) => {
    const costs = list.map((r) => num(r.unit_cost)).filter((c) => c > 0);
    if (!costs.length) return 0;
    const wc = list.filter(isWhite).map((r) => num(r.unit_cost)).filter((c) => c > 0);
    return wc.length ? Math.max(...wc) : Math.min(...costs);
  };

  const push = (o: Partial<AuditRow> & Pick<AuditRow, "section" | "item" | "key" | "keyKind">) => {
    rows.push({ usedBy: "", formulaPrice: null, stockPrice: null, stockSku: "", matches: 0, status: "missing", note: "", ...o } as AuditRow);
  };

  const byKey = (
    section: string, usedBy: string, item: string, key: string, kind: "sku" | "ชื่อ",
    formulaPrice: number | null, extraNote = "",
  ) => {
    if (!key || key === "-") {
      push({ section, usedBy, item, key: "", keyKind: "-", formulaPrice, status: "no_key",
        note: extraNote || "สูตรไม่ได้ใส่รหัส/ชื่อไว้ → แก้ราคาในสโตร์ไม่มีผลกับรายการนี้" });
      return;
    }
    const list = kind === "sku" ? (bySku.get(up(key)) ?? []) : (byName.get(norm(key)) ?? []);
    if (!list.length) {
      push({ section, usedBy, item, key, keyKind: kind, formulaPrice, status: "missing",
        note: extraNote || "ไม่มีสินค้านี้ในสโตร์ → ใช้ราคาที่ฝังในสูตร" });
      return;
    }
    const cost = pickCost(list);
    const colors = new Set(list.map((r) => norm(r.color) || "-"));
    const hasWhite = list.some(isWhite);
    const notes: string[] = [];
    if (list.length > 1) notes.push(`เจอ ${list.length} แถว (สี: ${[...colors].join(", ")})`);
    if (list.length > 1 && !hasWhite) notes.push("⚠ ไม่มีแถวสีอบขาว → ระบบหยิบราคาต่ำสุดมาใช้");
    if (extraNote) notes.push(extraNote);
    let status: AuditStatus = "linked";
    if (cost <= 0) status = "zero";
    else if (formulaPrice != null && !near(cost, formulaPrice)) status = "price_diff";
    else if (list.length > 1 && !hasWhite) status = "multi";
    push({
      section, usedBy, item, key, keyKind: kind, formulaPrice,
      stockPrice: cost || null, stockSku: norm(list[0].sku), matches: list.length, status,
      note: notes.join(" · "),
    });
  };

  // ① อลูรายเส้น — ทุกบรรทัดในสูตรของทุกรุ่น
  for (const p of Object.values(PRODUCTS as Record<string, any>)) {
    for (const a of (p.alu || [])) {
      const code = norm(a.code);
      const eff = code ? (PB.ALUCODE_ALIAS?.[code] || code) : "";
      byKey("อลูรายเส้น", p.name || p.id, a.name, eff, "sku",
        PB.ALUCODE?.[eff] ?? (a.price ?? null),
        eff && eff !== code ? `สูตรเขียนรหัส ${code} แต่ระบบชี้ไป ${eff}` : "");
    }
  }
  // ② อุปกรณ์/สิ้นเปลือง — ผูกได้เฉพาะรุ่นที่ติดธง partsLinked
  for (const p of Object.values(PRODUCTS as Record<string, any>)) {
    for (const grp of ["hardware", "consum"] as const) {
      for (const it of (p[grp] || [])) {
        const nm = norm(it.name);
        if (!p.partsLinked) {
          push({ section: "อุปกรณ์/สิ้นเปลือง", usedBy: p.name || p.id, item: nm, key: "", keyKind: "-",
            formulaPrice: it.price ?? null, status: "no_key",
            note: "รุ่นนี้ยังไม่เปิดผูกสโตร์ (ไม่มีธง partsLinked) → ราคาฝังในสูตร" });
          continue;
        }
        byKey("อุปกรณ์/สิ้นเปลือง", p.name || p.id, nm, nm, "ชื่อ", PB.PARTS?.[nm] ?? (it.price ?? null),
          nm in (PB.PARTS || {}) ? "" : "ชื่อนี้ไม่มีใน PARTS ของ pricebook → ผูกไม่ติด");
      }
    }
  }
  // ③ ตารางราคากลาง (ผูกด้วยชื่อ / sku)
  const central: [string, any, "ชื่อ" | "sku"][] = [
    ["กระจก", PB.GLASS, "ชื่อ"], ["หลังคา/ผนัง", PB.ROOFMAT, "ชื่อ"],
    ["มอเตอร์/ออโต้", PB.MOTOR, "ชื่อ"], ["เหล็ก", PB.STEEL, "sku"],
  ];
  for (const [sec, tbl, kind] of central) {
    for (const k of Object.keys(tbl || {})) byKey(sec, "", k, k, kind, num(tbl[k]) || null);
  }
  for (const k of Object.keys(PB.EXTRA || {})) {
    const v = PB.EXTRA[k];
    byKey("งานเสริม", "", k, k, "ชื่อ",
      typeof v?.make === "number" ? v.make : (typeof v?.install === "number" ? v.install : null));
  }
  // ④ เรตอลูต่อกิโล — ตัวคูณที่ทำให้ "ขึ้นราคากิโลแล้วราคาเด้ง"
  for (const brand of Object.keys(PB.ALU || {})) {
    const list = (stock || []).filter((r) => r.is_weight_based && norm(r.supplier) === brand && num(r.price_per_kg) > 0);
    const rate = list.length ? Math.max(...list.map((r) => num(r.price_per_kg))) : 0;
    const rates = new Set(list.map((r) => num(r.price_per_kg)));
    push({
      section: "อลู เรต/กก.", usedBy: "", item: `แบรนด์ ${brand}`, key: brand, keyKind: "แบรนด์",
      formulaPrice: num(PB.ALU[brand]), stockPrice: rate || null, stockSku: "", matches: list.length,
      status: !list.length ? "missing" : rate <= 0 ? "zero"
        : near(rate, num(PB.ALU[brand])) ? "linked" : "price_diff",
      note: !list.length
        ? "ไม่มีวัสดุที่ตั้ง ผู้ขาย = แบรนด์นี้ + ติ๊ก 'คิดตามน้ำหนัก' → เรตกิโลไม่มีผล"
        : rates.size > 1 ? `⚠ เรตกิโลในแบรนด์นี้ไม่เท่ากัน (${[...rates].join(", ")}) → ระบบใช้ค่าสูงสุด` : "",
    });
  }
  return rows;
}

export type BumpRow = { id: string; name: string; before: number; after: number; moved: boolean; pct: number };

/**
 * "ทดสอบเด้ง" — ขึ้นเรตอลูทุกแบรนด์ +N% แล้วดูว่าราคาขายของแต่ละรุ่นขยับตามไหม
 * ตอบคำถามเจ้าของตรง ๆ: "กลัวเพิ่มราคากิโลแล้วราคาไม่เด้งตาม"
 * รุ่นที่ไม่ขยับเลย = ราคาไม่ได้ผูกกับเรตอลู (ฝังตายตัว / ใช้ตาราง R3.9)
 */
export function bumpTest(PB: any, pct = 10): BumpRow[] {
  const PB2 = JSON.parse(JSON.stringify(PB));
  for (const b of Object.keys(PB2.ALU || {})) PB2.ALU[b] = num(PB2.ALU[b]) * (1 + pct / 100);
  const out: BumpRow[] = [];
  for (const p of Object.values(PRODUCTS as Record<string, any>)) {
    if (p.pickerHide) continue;
    const inp = { w: p.defaults?.w ?? 200, h: p.defaults?.h ?? 200, p: p.defaults?.p ?? 1, form: p.defForm ?? "" };
    let before = 0, after = 0;
    try { before = computeCost(PB, p, inp)?.sell?.withInstall ?? 0; } catch { before = 0; }
    try { after = computeCost(PB2, p, inp)?.sell?.withInstall ?? 0; } catch { after = 0; }
    if (!before) continue;
    out.push({
      id: p.id, name: p.name, before, after,
      moved: after > before + 0.5, pct: Math.round((after / before - 1) * 1000) / 10,
    });
  }
  return out.sort((a, b) => Number(a.moved) - Number(b.moved) || a.name.localeCompare(b.name, "th"));
}

export type ProductAudit = {
  id: string; name: string; group: number; groupLabel: string;
  aluTotal: number; aluLinked: number; aluNoCode: string[];   // ชื่อบรรทัดอลูที่ไม่มีรหัส
  hwTotal: number; hwLinked: number;
  moved: boolean | null; price: number;                      // ผลทดสอบเด้ง
  status: "ครบ" | "บางส่วน" | "ไม่ผูกเลย" | "ไม่มีรายการวัสดุ";
};

const GROUP_LABEL: Record<number, string> = {
  1: "บาน", 2: "ระแนง/รั้ว", 3: "หลังคา/ผนัง/ฝ้า", 4: "ตู้", 5: "มุ้ง", 6: "ห้องกระจก", 7: "ม่านซิป",
};

/**
 * สรุป "รายรุ่นในเครื่องคิดราคา" — เจ้าของดูมุมนี้เป็นหลัก (เลือกรุ่นไหนก็อยากรู้ว่ารุ่นนั้นผูกครบไหม)
 * ไม่ใช่มุมหมวดวัสดุ ซึ่งไล่ตามงานจริงไม่ได้
 */
export function auditByProduct(rows: AuditRow[], bump: BumpRow[]): ProductAudit[] {
  const byId = new Map<string, BumpRow>(bump.map((b) => [b.id, b]));
  const out: ProductAudit[] = [];
  for (const p of Object.values(PRODUCTS as Record<string, any>)) {
    const mine = rows.filter((r) => r.usedBy === (p.name || p.id));
    const alu = mine.filter((r) => r.section === "อลูรายเส้น");
    const hw = mine.filter((r) => r.section === "อุปกรณ์/สิ้นเปลือง");
    const linked = (r: AuditRow) => r.status !== "no_key" && r.status !== "missing";
    const aluLinked = alu.filter(linked).length, hwLinked = hw.filter(linked).length;
    const total = alu.length + hw.length, ok = aluLinked + hwLinked;
    const b = byId.get(p.id);
    out.push({
      id: p.id, name: p.name || p.id, group: p.group ?? 0, groupLabel: GROUP_LABEL[p.group] ?? "อื่น ๆ",
      aluTotal: alu.length, aluLinked, aluNoCode: alu.filter((r) => r.status === "no_key").map((r) => r.item),
      hwTotal: hw.length, hwLinked,
      moved: b ? b.moved : null, price: b?.before ?? 0,
      status: total === 0 ? "ไม่มีรายการวัสดุ" : ok === 0 ? "ไม่ผูกเลย" : ok === total ? "ครบ" : "บางส่วน",
    });
  }
  const rank = { "ไม่ผูกเลย": 0, "บางส่วน": 1, "ไม่มีรายการวัสดุ": 2, "ครบ": 3 } as const;
  return out.sort((a, b) => rank[a.status] - rank[b.status] || a.group - b.group || a.name.localeCompare(b.name, "th"));
}
