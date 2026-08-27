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
import { FAMILIES, familyCodeSets } from "../cutlist/family-codes.ts";

export type AuditStockRow = {
  id?: number; name?: string | null; sku?: string | null; color?: string | null;
  category?: string | null; supplier?: string | null;
  is_weight_based?: boolean | null; unit_cost?: number | string | null; price_per_kg?: number | string | null;
  weight_per_unit?: number | string | null;   // กก./เส้น — ตัวคูณของสาย "เรตต่อโล → ราคาต่อเส้น"
};

export type AuditStatus = "linked" | "price_diff" | "missing" | "no_key" | "multi" | "zero" | "order_only";
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
  order_only: "ไม่สต็อก สั่งใหม่ (ตั้งใจไม่ผูก · ราคาอยู่ในสูตร)",
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
      // ของสั่งตามงาน — ตั้งใจไม่ผูกสโตร์ ราคาอยู่ในสูตร ไม่ใช่ของตกหล่น (เจ้าของสั่ง 26 ส.ค.69)
      if (a.orderOnly) {
        push({ section: "อลูรายเส้น", usedBy: p.name || p.id, item: a.name, key: "", keyKind: "-",
          formulaPrice: a.price ?? null, status: "order_only",
          note: "ไม่ได้สต็อกไว้ สั่งซื้อเมื่อมีงาน — ราคาอยู่ในสูตร ตั้งใจไม่ผูกสโตร์" });
        continue;
      }
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
        if (it.orderOnly) {
          push({ section: "อุปกรณ์/สิ้นเปลือง", usedBy: p.name || p.id, item: nm, key: "", keyKind: "-",
            formulaPrice: it.price ?? null, status: "order_only",
            note: "ไม่ได้สต็อกไว้ สั่งซื้อเมื่อมีงาน — ราคาอยู่ในสูตร ตั้งใจไม่ผูกสโตร์" });
          continue;
        }
        // ⚠ บรรทัดที่ "มีรหัสสโตร์อยู่แล้ว" ผูกติดจริงไม่ว่าจะติดธง partsLinked หรือไม่ —
        //   เอนจินคิดราคาอ่านราคาจาก PB.SKUPRICE[sku] ตรง ๆ (hwPrice ใน engine.mjs)
        //   ของเดิมเช็คด้วย "ชื่อ" อย่างเดียว บรรทัดที่มี sku เลยถูกตีเป็น "ผูกไม่ได้" ทั้งที่ผูกแล้ว
        //   → หน้าตรวจโชว์ว่าแทบไม่มีอะไรผูก ทั้งที่ของจริงผูกเยอะกว่านั้น (เจ้าของท้วง 27 ส.ค.69)
        const skuRaw = String(it.sku ?? "");
        // sku เป็นสูตรได้ (เลือกรหัสตามเงื่อนไข เช่น "WIN?'JR00770':'JR00771'") → ดึงรหัสในเครื่องหมายคำพูดออกมา
        const skus = skuRaw.includes("?")
          ? [...skuRaw.matchAll(/'([^']+)'|"([^"]+)"/g)].map((m) => m[1] ?? m[2]).filter(Boolean)
          : (skuRaw ? [skuRaw] : []);
        if (skus.length) {
          for (const s of skus) {
            byKey("อุปกรณ์/สิ้นเปลือง", p.name || p.id, skus.length > 1 ? `${nm} (${s})` : nm, s, "sku",
              it.price ?? null, skus.length > 1 ? "สูตรเลือกรหัสตามเงื่อนไข" : "");
          }
          continue;
        }
        if (!p.partsLinked) {
          push({ section: "อุปกรณ์/สิ้นเปลือง", usedBy: p.name || p.id, item: nm, key: "", keyKind: "-",
            formulaPrice: it.price ?? null, status: "no_key",
            note: "สูตรไม่ได้ใส่รหัสสโตร์ + รุ่นนี้ยังไม่เปิดผูกด้วยชื่อ (partsLinked) → ราคาฝังในสูตร" });
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

// ── ตรวจสายราคา "ต่อโล → ต่อเส้น" (เจ้าของถาม 19 ส.ค.69) ─────────────────────
//   สโตร์เก็บ: น้ำหนัก/เส้น (weight_per_unit) · เรตต่อโล (price_per_kg) · ราคา/เส้น (unit_cost)
//   ตอนบันทึกราคา ระบบคิด unit_cost = น้ำหนัก × เรตต่อโล  แล้วคิดราคา 4.0 อ่าน unit_cost
//   → เส้นที่ "ไม่มีน้ำหนัก" = กดเปลี่ยนเรตต่อโลแล้วราคาไม่ขยับ (ตรงกับที่เจ้าของกลัว)
export type KgStatus = "ok" | "no_weight" | "no_rate" | "stale" | "not_kg";
export const KG_STATUS_LABEL: Record<KgStatus, string> = {
  ok: "ต่อโลเด้งได้",
  no_weight: "⚠ ไม่มีน้ำหนัก/เส้น — เปลี่ยนเรตต่อโลแล้วราคาไม่ขยับ",
  no_rate: "ยังไม่ได้ตั้งเรตต่อโล",
  stale: "⚠ ราคา/เส้น ไม่เท่ากับ น้ำหนัก × เรต (ตั้งไว้ตอนเรตเก่า)",
  not_kg: "ตั้งราคาต่อเส้นตรง (ไม่ได้ติดธงคิดต่อโล)",
};
export type KgRow = {
  sku: string; name: string; color: string;
  kgPerUnit: number; ratePerKg: number; unitCost: number; expected: number;
  status: KgStatus;
};

/** ไล่เส้นอลูที่คิดราคา 4.0 ใช้จริง ว่าสาย "เรตต่อโล → ราคาต่อเส้น" ต่อครบไหม */
export function auditKgLink(stock: AuditStockRow[]): KgRow[] {
  const codes = new Set<string>();
  for (const p of Object.values(PRODUCTS as Record<string, any>))
    for (const a of (p?.alu || [])) if (a.code) codes.add(up(a.code));

  const out: KgRow[] = [];
  for (const r of stock || []) {
    const sku = up(r.sku);
    if (!sku || !codes.has(sku)) continue;                 // เอาเฉพาะเส้นที่สูตรเรียกใช้จริง
    const kg = num((r as any).weight_per_unit);
    const rate = num(r.price_per_kg);
    const cost = num(r.unit_cost);
    const expected = Math.round(kg * rate * 100) / 100;
    let status: KgStatus;
    if (!r.is_weight_based) status = "not_kg";
    else if (kg <= 0) status = "no_weight";
    else if (rate <= 0) status = "no_rate";
    else if (!near(cost, expected)) status = "stale";
    else status = "ok";
    out.push({ sku, name: norm(r.name), color: norm(r.color), kgPerUnit: kg, ratePerKg: rate, unitCost: cost, expected, status });
  }
  const rank: Record<KgStatus, number> = { no_weight: 0, stale: 1, no_rate: 2, not_kg: 3, ok: 4 };
  return out.sort((a, b) => rank[a.status] - rank[b.status] || a.sku.localeCompare(b.sku));
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
  aluOrderOnly?: string[];                                    // ของสั่งตามงาน (ตั้งใจไม่ผูก)
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
    const linked = (r: AuditRow) => r.status !== "no_key" && r.status !== "missing";   // order_only = ตั้งใจ นับว่าเรียบร้อย
    const aluLinked = alu.filter(linked).length, hwLinked = hw.filter(linked).length;
    const total = alu.length + hw.length, ok = aluLinked + hwLinked;
    const b = byId.get(p.id);
    out.push({
      id: p.id, name: p.name || p.id, group: p.group ?? 0, groupLabel: GROUP_LABEL[p.group] ?? "อื่น ๆ",
      aluTotal: alu.length, aluLinked, aluNoCode: alu.filter((r) => r.status === "no_key").map((r) => r.item),
      aluOrderOnly: alu.filter((r) => r.status === "order_only").map((r) => r.item),
      hwTotal: hw.length, hwLinked,
      moved: b ? b.moved : null, price: b?.before ?? 0,
      status: total === 0 ? "ไม่มีรายการวัสดุ" : ok === 0 ? "ไม่ผูกเลย" : ok === total ? "ครบ" : "บางส่วน",
    });
  }
  const rank = { "ไม่ผูกเลย": 0, "บางส่วน": 1, "ไม่มีรายการวัสดุ": 2, "ครบ": 3 } as const;
  return out.sort((a, b) => rank[a.status] - rank[b.status] || a.group - b.group || a.name.localeCompare(b.name, "th"));
}

// ═══════════════════════ ใบตัด — รายรุ่น (ตระกูล) เทียบสโตร์ ═══════════════════════
// เจ้าของสั่ง 27 ส.ค.69: เช็ค "คิดราคา 4.0 + ใบตัด เทียบสโตร์ แบ่งตามหมวด(รุ่น)"
//   ไล่ทุกรหัสที่รุ่นนั้นตัดจริง (อลู B/F + อุปกรณ์ JR จาก family-codes) → มีในสโตร์ไหม/ซ้ำไหม/ราคา0ไหม
//   ⚠ "กล่อง …" ไม่มีรหัสโปรไฟล์ในสโตร์ (จับด้วยชื่อ+ขนาด ที่แท็บกล่อง) → แยกไว้ ไม่ธงว่า "หาย" มั่ว
export type FamilyCodeStatus = "linked" | "missing" | "multi" | "zero" | "box";
export type FamilyCodeAudit = {
  code: string; name: string; matches: number; colors: string[]; stockSku: string; cost: number; status: FamilyCodeStatus;
};
export type FamilyAudit = {
  key: string; label: string;
  total: number; linked: number; missing: number; dup: number; zero: number; box: number;
  codes: FamilyCodeAudit[];
};

/** ต่อรุ่น(ตระกูล): ไล่รหัสใบตัดทั้งหมด → เทียบสโตร์จริง (หาย/ซ้ำ/ราคา0) */
export function auditCutlistFamilies(stock: AuditStockRow[]): FamilyAudit[] {
  const bySku = new Map<string, AuditStockRow[]>();
  for (const r of stock || []) {
    const s = up(r.sku);
    if (!s) continue;
    if (!bySku.has(s)) bySku.set(s, []);
    bySku.get(s)!.push(r);
  }
  const isWhite = (r: AuditStockRow) => norm(r.name).includes("อบขาว") || norm(r.color).includes("อบขาว");
  const pickCost = (list: AuditStockRow[]) => {
    const costs = list.map((r) => num(r.unit_cost)).filter((c) => c > 0);
    if (!costs.length) return 0;
    const wc = list.filter(isWhite).map((r) => num(r.unit_cost)).filter((c) => c > 0);
    return wc.length ? Math.max(...wc) : Math.min(...costs);
  };

  const sets = familyCodeSets();
  const out: FamilyAudit[] = [];
  for (const f of FAMILIES) {
    const codes = [...(sets.get(f.key) ?? [])].sort((a, b) => a.localeCompare(b, "th"));
    const detail: FamilyCodeAudit[] = codes.map((code) => {
      // กล่อง/ฉาก = จับด้วยชื่อ+ขนาด (แท็บกล่อง) ไม่ใช่รหัสโปรไฟล์ → ไม่เช็คตรงนี้
      if (/^กล่อง/.test(code)) {
        return { code, name: code, matches: 0, colors: [], stockSku: "", cost: 0, status: "box" as const };
      }
      const list = bySku.get(up(code)) ?? [];
      const colors = [...new Set(list.map((r) => norm(r.color) || "-"))];
      const cost = pickCost(list);
      const hasWhite = list.some(isWhite);
      let status: FamilyCodeStatus = "linked";
      if (!list.length) status = "missing";
      else if (cost <= 0) status = "zero";
      else if (list.length > 1 && !hasWhite) status = "multi";
      return { code, name: norm(list[0]?.name) || code, matches: list.length, colors, stockSku: norm(list[0]?.sku), cost, status };
    });
    out.push({
      key: f.key, label: f.label, total: detail.length,
      linked: detail.filter((d) => d.status === "linked").length,
      missing: detail.filter((d) => d.status === "missing").length,
      dup: detail.filter((d) => d.status === "multi").length,
      zero: detail.filter((d) => d.status === "zero").length,
      box: detail.filter((d) => d.status === "box").length,
      codes: detail,
    });
  }
  // เรียงรุ่นที่ต้องแก้ก่อน (หาย+ซ้ำ+ราคา0 มากสุดขึ้นบน)
  return out.sort((a, b) => (b.missing + b.dup + b.zero) - (a.missing + a.dup + a.zero) || a.label.localeCompare(b.label, "th"));
}
