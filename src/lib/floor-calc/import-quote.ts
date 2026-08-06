import { readXlsx, type SheetGrid } from "./xlsx-read";
import { fixThai, type FixChange } from "./thai-fix";

/**
 * แปลงใบเสนอราคา .xlsx ของผู้รับเหมา → โครงข้อมูลใบเสนอของเรา
 *
 * ปัญหาจริงที่ต้องรับมือ (เก็บจากใบจริง 2 ใบ ของช่างเพยาว์):
 *   · ชีทเกิน — chartsheet ว่าง, Sheet2 ว่าง, Sheet3 = ใบเบิกงวดปนมาในไฟล์เดียวกัน
 *   · หัวตารางแหก — "รายการ | รายการ" ซ้ำ, เลข 4 โผล่มาในหัว, คอลัมน์ค่าวัสดุหาย
 *   · หัวข้อหมวดถูกใส่เป็นรายการ (มีเลขลำดับ ยอด 0) เช่น "งานเฉลียงหน้าบ้านชั้น1"
 *   · "หมายเหตุ..." กับ "ยอดโดยรวม" ถูกใส่เป็นรายการด้วย
 *   · แถวขยะท้ายตารางเป็นสิบแถว (ลำดับ 18–32 ว่าง มีแต่เลข 0)
 *   · เลขลำดับไหลยาวข้ามหมวด (ควรเริ่ม 1 ใหม่ทุกหมวด)
 */

export type ImportedItem = {
  group_label: string;
  name: string;
  qty: number;
  unit: string;
  material_price: number | null;
  labor_price: number | null;
  unit_price: number;
  line_total: number;
  remark: string;
  source: "import";
  /** ยอดในไฟล์ต้นฉบับ — ใช้เตือนถ้าคิดใหม่แล้วไม่ตรง (ช่างพิมพ์ยอดทับสูตรบ่อย) */
  raw_total: number;
};

export type ImportResult = {
  sheetName: string;
  customer: { name: string; address: string; phone: string };
  issueDateRaw: string;
  items: ImportedItem[];
  /** ยอด "ยอดโดยรวม" ที่เขียนไว้ในไฟล์ (ถ้ามี) */
  statedTotal: number | null;
  computedTotal: number;
  changes: FixChange[];
  warnings: string[];
  /** ใบเบิกงวดที่ปนมาในไฟล์ (มักเป็น Sheet3) — ข้อความดิบ ให้คนอ่านตรวจเอง */
  installmentText: string[];
};

const r2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;
const cell = (row: string[] | undefined, c: number) => String(row?.[c] ?? "").trim();
const toNum = (s: string): number => {
  const n = Number(String(s).replace(/[, ]/g, ""));
  return Number.isFinite(n) ? n : 0;
};
const hasText = (s: string) => s.replace(/[\s0.\-]/g, "").length > 0;

const UNIT_WORDS = /^(งาน|ต้น|ตร\.?ม\.?|ตร\.?ว\.?|เมตร|ม\.|ชุด|จุด|ตัว|แผ่น|อัน|หลุม|ชิ้น|ห้อง|บาน)$/;

/**
 * หาว่าคอลัมน์ไหนคืออะไร
 *
 * ⚠ **ดูจากข้อมูลจริง ไม่ใช่หัวตาราง** — ใบช่างหัวตารางเลื่อนจากข้อมูล 1 ช่อง
 * (คำว่า "รายการ" ถูกพิมพ์ซ้ำ 2 ช่อง ทำให้ "ปริมาณ" ไปอยู่ตรงคอลัมน์ที่ข้อมูลเป็น "หน่วย")
 * ถ้าเชื่อหัวตาราง จะได้ ปริมาณ = "งาน" และ หน่วย = "18500" — เจอจริงในใบคุณนฤมิตร
 */
function detectColumns(rows: string[][]): { header: number; c: Record<string, number> } | null {
  let header = -1;
  for (let r = 0; r < Math.min(12, rows.length); r++) {
    const j = (rows[r] ?? []).join("|");
    if (/ลำดับ/.test(j) && /รายการ/.test(j)) { header = r; break; }
  }
  if (header < 0) return null;

  const body = rows.slice(header + 1).filter((row) => (row ?? []).some((v) => String(v ?? "").trim()));
  if (!body.length) return null;
  const width = Math.max(...body.map((r) => r.length));

  const score = { text: [] as number[], numeric: [] as number[], unit: [] as number[], len: [] as number[] };
  for (let c = 0; c < width; c++) {
    let text = 0, numeric = 0, unit = 0, len = 0;
    for (const row of body) {
      const v = cell(row, c);
      if (!v) continue;
      const isNum = /^-?[\d, ]+(\.\d+)?$/.test(v);
      if (isNum) numeric++;
      else { text++; len += v.length; }
      if (UNIT_WORDS.test(v)) unit++;
    }
    score.text[c] = text; score.numeric[c] = numeric; score.unit[c] = unit; score.len[c] = len;
  }

  // ชื่องาน = คอลัมน์ที่มีข้อความยาวรวมมากสุด
  let nameCol = 0;
  for (let c = 0; c < width; c++) if ((score.len[c] ?? 0) > (score.len[nameCol] ?? 0)) nameCol = c;

  // หน่วย = คอลัมน์หลังชื่องาน ที่มีคำหน่วย (งาน/ต้น/ตร.ม.) มากสุด
  let unitCol = -1;
  for (let c = nameCol + 1; c < width; c++) {
    if ((score.unit[c] ?? 0) > 0 && (unitCol < 0 || score.unit[c] > score.unit[unitCol])) unitCol = c;
  }
  // ปริมาณ = คอลัมน์ตัวเลขก่อนหน่วย (ถ้าไม่มีหน่วย = คอลัมน์ตัวเลขแรกหลังชื่อ)
  let qtyCol = -1;
  if (unitCol > nameCol + 0) {
    for (let c = unitCol - 1; c > nameCol; c--) if ((score.numeric[c] ?? 0) > 0) { qtyCol = c; break; }
  }
  if (qtyCol < 0) for (let c = nameCol + 1; c < width; c++) if ((score.numeric[c] ?? 0) > 0) { qtyCol = c; break; }

  // ยอดรวม = คอลัมน์ตัวเลขขวาสุด
  let totalCol = -1;
  for (let c = width - 1; c > (unitCol > 0 ? unitCol : qtyCol); c--) if ((score.numeric[c] ?? 0) > 0) { totalCol = c; break; }

  // บล็อกราคาอยู่ระหว่างหน่วยกับยอดรวม: ช่องแรก = ราคา/หน่วย(วัสดุ) · ช่องท้ายสุดก่อนยอดรวม = ราคางาน
  const priceCols: number[] = [];
  for (let c = (unitCol > 0 ? unitCol : qtyCol) + 1; c < totalCol; c++) if ((score.numeric[c] ?? 0) > 0) priceCols.push(c);
  const priceCol = priceCols[0] ?? -1;
  const workCol = priceCols.length > 1 ? priceCols[priceCols.length - 1] : -1;
  const laborCol = priceCols.length > 2 ? priceCols[1] : -1;

  // หมายเหตุ = คอลัมน์ข้อความหลังยอดรวม
  let remarkCol = -1;
  for (let c = totalCol + 1; c < width; c++) if ((score.text[c] ?? 0) > 0) { remarkCol = c; break; }

  if (nameCol < 0 || totalCol < 0) return null;
  return { header, c: { name: nameCol, qty: qtyCol, unit: unitCol, price: priceCol, labor: laborCol, work: workCol, total: totalCol, remark: remarkCol } };
}

/** ชีตไหนคือใบเสนอ — เลือกชีตที่มีหัวตารางและมีแถวข้อมูลมากสุด */
function pickQuoteSheet(sheets: SheetGrid[]): SheetGrid | null {
  let best: { s: SheetGrid; score: number } | null = null;
  for (const s of sheets) {
    if (!s.rows.length) continue;
    const flat = s.rows.map((r) => r.join("|")).join("\n");
    let score = s.rows.filter((r) => r.some((v) => String(v ?? "").trim())).length;
    if (/เอกสารแสดงปริมาณ|ใบเสนอราคา|ลำดับ/.test(flat)) score += 100;
    if (/ใบเบิกงวด/.test(flat)) score -= 200; // ชีตใบเบิกงวด ไม่ใช่ใบเสนอ
    if (!best || score > best.score) best = { s, score };
  }
  return best && best.score > 0 ? best.s : null;
}

export function importQuoteXlsx(buf: Buffer): ImportResult {
  const sheets = readXlsx(buf);
  const sheet = pickQuoteSheet(sheets);
  if (!sheet) throw new Error("ไม่พบชีตที่เป็นใบเสนอราคาในไฟล์นี้");

  const rows = sheet.rows;
  const warnings: string[] = [];
  const allChanges = new Map<string, FixChange>();
  const collect = (s: string) => {
    const r = fixThai(s);
    for (const c of r.changes) allChanges.set(`${c.from}→${c.to}`, c);
    return r.text;
  };

  // ── หัวเอกสาร: ลูกค้า / วันที่ / โทร ──
  let custRaw = "", dateRaw = "", phone = "";
  for (let r = 0; r < Math.min(8, rows.length); r++) {
    const line = (rows[r] ?? []).join(" ").trim();
    if (!custRaw && /รายการงาน/.test(line)) custRaw = line.replace(/.*?รายการงาน\s*/, "").trim();
    if (!dateRaw) dateRaw = /วันที่\s*([\d/.\-]+)/.exec(line)?.[1] ?? "";
    if (!phone) phone = /โทร\.?\s*([\d\- ]{8,})/.exec(line)?.[1]?.trim() ?? "";
  }
  // ชื่อลูกค้า = คำนำหน้า + ชื่อ · ที่อยู่ = ตั้งแต่ "เลขที่/บ้านเลขที่" หรือเลขบ้าน (123/45) เป็นต้นไป
  const addrAt = custRaw.search(/\s(?:บ้าน)?เลขที่\s*|\s\d+\/\d+/);
  const customer = addrAt > 0
    ? {
        name: collect(custRaw.slice(0, addrAt)).trim(),
        address: collect(custRaw.slice(addrAt).replace(/^\s*(?:บ้าน)?เลขที่\s*/, "")).trim(),
        phone,
      }
    : { name: collect(custRaw).trim(), address: "", phone };

  // ── ตาราง ──
  const det = detectColumns(rows);
  if (!det) throw new Error("อ่านหัวตารางไม่ออก — ไฟล์อาจเป็นคนละแบบ ลองแปลงเป็น .xlsx ปกติก่อน");
  const { c } = det;

  const items: ImportedItem[] = [];
  let statedTotal: number | null = null;
  let group = "";
  let junkRows = 0;

  for (let r = det.header + 2; r < rows.length; r++) {
    const row = rows[r] ?? [];
    const rawName = cell(row, c.name);
    const qty = toNum(cell(row, c.qty));
    const total = c.total >= 0 ? toNum(cell(row, c.total)) : 0;
    const unitPrice = c.work >= 0 && cell(row, c.work) ? toNum(cell(row, c.work)) : toNum(cell(row, c.price));

    // แถวว่าง / แถวขยะ (ไม่มีชื่องาน และไม่มียอด)
    if (!hasText(rawName) && total === 0) { if (row.some((v) => String(v ?? "").trim())) junkRows++; continue; }

    // "ยอดโดยรวม" — ไม่ใช่รายการ เก็บไว้เทียบ
    if (/^ยอด(โดย)?รวม/.test(rawName)) { statedTotal = total || null; continue; }
    // "หมายเหตุ ..." — ไม่ใช่รายการ (ระบบมีหมายเหตุมาตรฐานของตัวเองอยู่แล้ว)
    if (/^หมายเหตุ/.test(rawName)) continue;

    // หัวข้อหมวด = มีชื่อ แต่ไม่มีปริมาณและไม่มียอด
    if (hasText(rawName) && qty === 0 && total === 0) {
      group = collect(rawName).replace(/\($/, "").trim();
      continue;
    }

    const name = collect(rawName);
    if (!name) continue;

    const matRaw = c.price >= 0 ? cell(row, c.price) : "";
    const labRaw = c.labor >= 0 ? cell(row, c.labor) : "";
    // ใบช่างบางแถวใส่ราคาซ้ำทั้งช่องวัสดุและค่าแรง (เช่น เข็ม KEMREX) → ถือว่าเป็นค่าวัสดุอย่างเดียว
    const mat = matRaw ? toNum(matRaw) : null;
    const lab = labRaw && toNum(labRaw) !== mat ? toNum(labRaw) : null;

    const price = unitPrice || (qty ? r2(total / qty) : 0);
    const computed = r2((qty || 1) * price);

    items.push({
      group_label: group,
      name,
      qty: qty || 1,
      unit: collect(cell(row, c.unit)) || "งาน",
      material_price: mat && mat > 0 ? mat : null,
      labor_price: lab && lab > 0 ? lab : null,
      unit_price: price,
      line_total: total || computed,
      remark: c.remark >= 0 ? collect(cell(row, c.remark)) : "",
      source: "import",
      raw_total: total,
    });

    // ยอดในไฟล์ไม่ตรงกับ ปริมาณ × ราคา (ช่างพิมพ์ทับสูตร)
    if (total && Math.abs(total - computed) > 0.5) {
      warnings.push(`“${name.slice(0, 40)}” — ยอดในไฟล์ ${total.toLocaleString()} แต่ ${qty || 1} × ${price.toLocaleString()} = ${computed.toLocaleString()}`);
    }
  }

  const computedTotal = r2(items.reduce((a, it) => a + it.line_total, 0));
  if (statedTotal != null && Math.abs(statedTotal - computedTotal) > 0.5) {
    warnings.push(`ยอดรวมในไฟล์ ${statedTotal.toLocaleString()} ไม่ตรงกับผลบวกรายการ ${computedTotal.toLocaleString()}`);
  }
  if (junkRows > 0) warnings.push(`ข้ามแถวว่าง/แถวขยะท้ายตาราง ${junkRows} แถว`);

  const extra = sheets.filter((s) => s !== sheet && s.rows.some((r) => r.some((v) => String(v ?? "").trim())));
  if (extra.length) warnings.push(`ไฟล์มีชีตอื่นอีก ${extra.length} ชีต (${extra.map((s) => s.name).join(", ")}) — ไม่ได้นำเข้า`);

  // ใบเบิกงวดที่ปนมา — เก็บข้อความดิบไว้ให้คนตรวจ (มักลอกจากงานอื่นมา ยอดไม่ตรง)
  const instSheet = sheets.find((s) => s.rows.some((r) => /ใบเบิกงวด/.test(r.join(" "))));
  const installmentText = instSheet
    ? instSheet.rows.map((r) => r.filter((v) => String(v ?? "").trim()).join(" ").trim()).filter(Boolean)
    : [];
  if (installmentText.length) {
    warnings.push("ไฟล์มีใบเบิกงวดปนมาด้วย — ตรวจก่อนใช้ ใบจริงมักลอกจากงานอื่นแล้วลืมแก้ (ยอด/วันที่ไม่ตรง)");
  }

  return {
    sheetName: sheet.name,
    customer,
    issueDateRaw: dateRaw,
    items,
    statedTotal,
    computedTotal,
    changes: [...allChanges.values()],
    warnings,
    installmentText,
  };
}
