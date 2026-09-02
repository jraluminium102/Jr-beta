/**
 * build-quote-pricebook — แปลง "Data ไฟล์ราคาประเมิน (2026).xlsx" → src/lib/quick-quote/pricebook.json
 *
 * โครงไฟล์ต้นทาง (ชีต Index): Type(A) · Brand(B) · Lower(C) · Upper(D) · Price(E) · หน่วย(F) · addLabel(G) · addAmt(H)
 *   · แถวมี C/D = ช่วงพื้นที่ (tier) ราคา E = บ./ตร.ม.
 *   · แถวมี A+E ไม่มี C/D = ขั้นต่ำ บ./ชุด (ขึ้นสินค้าใหม่) — หรือถ้าไม่มี tier ตามหลัง = ราคา flat บ./ตร.ม.
 *   · identity สินค้า = A + '|' + B ; แถวไม่มี A = สืบทอดสินค้าปัจจุบัน (แถว tier ล้วน)
 *   · G="เพิ่มบานละ" → perPanelAdd ; G="เพิ่ม N บาน" → tieredAdds ; G ขึ้นต้น * = โน้ต
 *   · แถวมี A ไม่มี E ไม่มี C/D = หัวข้อ/โน้ต/alias → ข้าม (ไม่เป็นสินค้า)
 *
 * รันซ้ำได้ · เจ้าของอัปเดต xlsx แล้วรันใหม่ = ราคาใหม่ทันที
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { openXlsx } from "./dumpxlsx.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const SRC = path.join(ROOT, "คิดราคา3.9", "Data ไฟล์ราคาประเมิน (2026).xlsx");
const OUT = path.join(ROOT, "src", "lib", "quick-quote", "pricebook.json");

const num = (v) => {
  if (v == null || v === "") return null;
  const n = Number(String(v).replace(/[, ]/g, ""));
  return Number.isFinite(n) ? n : null;
};
const round = (n, d = 3) => Math.round(n * 10 ** d) / 10 ** d;

// ── จัดหมวดจากชื่อ (keyword) ──
function categoryOf(name, brand) {
  const s = (name + " " + (brand || "")).toLowerCase();
  const has = (...kw) => kw.some((k) => s.includes(k.toLowerCase()));
  if (has("มุ้ง")) return "มุ้ง";
  if (has("ระแนง", "บังตา", "เกล็ด", "ลูกฟูก", "คอมโพสิต")) return "ระแนง/บังตา"; // ก่อนหลังคา (ฝ้าระแนงหลังคา = ระแนง)
  if (has("หลังคา", "เมทัลชีท", "ชินโค", "ไวนิล", "ดีไลท์", "โพลีตัน", "isowall", "เมทัล", "eps", "pu foam", "ลามิเนต lm")) return "หลังคา";
  if (has("ผนัง", "สมาร์ทบอร์ด", "ยิปซั่ม", "ฝ้า")) return "ผนัง/ฝ้า";
  if (has("กระจก")) return "กระจก (เปลี่ยน/เพิ่ม)";
  if (has("เพิ่มสี", "อบสี", "ชุบสี", "ลายไม้", "ซาฮาร่า")) return "สี/พื้นผิว (เพิ่ม)";
  if (has("shower", "เปลือย", "ฝาตู้", "future")) return "กระจกเปลือย/ตู้";
  return "ประตู/หน้าต่าง";
}

// หน่วยพื้นที่ (ทุกอย่างในไฟล์นี้คิด บ./ตร.ม. เว้นที่ระบุ F อื่น)
function main() {
  const x = openXlsx(SRC);
  const sheet = x.sheets.find((s) => s.name === "Index") || x.sheets[0];
  const rows = x.read(sheet.path);

  const products = [];
  let cur = null;
  let curId = null;
  // เรตต่อ ตร.ม. ที่ซ่อนในชื่อ เช่น "…ราคา 2,500 บาท/ตร.ม." / "ขาย 3,000 บ./ตรม."
  const rateFromName = (name) => {
    const m = String(name).match(/(?:ราคา|ขาย)\s*([\d,]+)\s*(?:บาท|บ\.)\s*\/?\s*(?:ตร\.?\s*ม\.?|ตรม)/);
    return m ? num(m[1]) : null;
  };
  const finalize = () => {
    if (!cur) return;
    if (cur.tiers.length === 0 && cur.min != null) {
      const nameRate = rateFromName(cur.name);
      if (nameRate != null && /ขั้นต่ำ/.test(cur.unitNote || "")) {
        // F="ขั้นต่ำ" → E คือ "ขั้นต่ำ/ชุด" ส่วนเรตจริง/ตร.ม. อยู่ในชื่อ
        cur.flatRate = nameRate;
        // min เดิม (E) เก็บไว้เป็นขั้นต่ำ
      } else {
        // ไม่มี tier → flat rate บ./ตร.ม. (ใช้ E เป็นเรต)
        cur.flatRate = nameRate ?? cur.min;
        cur.min = null;
      }
    }
    // สินค้าที่ไม่มีทั้ง tier และ price → เป็นหัวข้อ/โน้ต ไม่เก็บ
    if (cur.tiers.length > 0 || cur.flatRate != null) products.push(cur);
    cur = null;
  };

  for (const { cells: c } of rows) {
    const A = (c.A || "").trim();
    const B = (c.B || "").trim();
    const C = num(c.C), D = num(c.D), E = num(c.E);
    const F = (c.F || "").trim();
    const G = (c.G || "").trim();
    const H = num(c.H);
    const hasTier = C != null || D != null;

    // ข้าม header ตาราง
    if (A === "Type" && B === "Brand") continue;

    // แถวขึ้นต้น "+" = ตัวเลือกสี/พื้นผิวของสินค้าปัจจุบัน (เช่น ระแนง +เทาซาฮาร่า) ไม่ใช่สินค้าเดี่ยว
    if (A.startsWith("+") && !hasTier) {
      if (cur && E != null) cur.colorAdds.push({ name: A.replace(/^\+\s*/, "").trim(), amount: E });
      continue;
    }

    if (hasTier) {
      // แถวช่วงพื้นที่ — ถ้ามี A และ identity เปลี่ยน = สินค้าใหม่ที่ขึ้นด้วย tier เลย (เช่น PC door 4บาน)
      const id = A ? A + "|" + B : curId;
      if (A && id !== curId) {
        finalize();
        cur = { name: A, brand: B || null, min: null, tiers: [], perPanelAdd: null, tieredAdds: [], unitNote: F || null, note: "", colorAdds: [] };
        curId = id;
      }
      if (!cur) continue; // tier ลอยไม่มีเจ้าของ — ข้าม
      if (E != null) cur.tiers.push({ lo: C ?? 0, hi: D ?? null, price: E });
    } else if (A && E != null) {
      // แถวขึ้นสินค้าใหม่ (มีขั้นต่ำ/flat)
      const id = A + "|" + B;
      finalize();
      cur = { name: A, brand: B || null, min: E, tiers: [], perPanelAdd: null, tieredAdds: [], unitNote: F || null, note: "", colorAdds: [] };
      curId = id;
    } else if (A && E == null) {
      // หัวข้อ/โน้ต/alias — ปิดสินค้าก่อนหน้า, ไม่เริ่มใหม่ (แถวพวกนี้เป็นข้อความล้วน)
      finalize();
      curId = null;
      continue;
    }

    // add-on (G/H) ผูกกับสินค้าปัจจุบัน
    if (cur && G) {
      if (/^\*/.test(G)) cur.note = (cur.note ? cur.note + " " : "") + G;
      else if (/เพิ่มบานละ/.test(G) && H != null) cur.perPanelAdd = { label: G, amount: H };
      else if (/เพิ่ม\s*\d+\s*บาน/.test(G) && H != null) cur.tieredAdds.push({ label: G, amount: H });
      else if (H != null) cur.tieredAdds.push({ label: G, amount: H });
      else cur.note = (cur.note ? cur.note + " " : "") + G;
    }
  }
  finalize();

  // ── ประกอบผลลัพธ์ + จัดหมวด ──
  const catOrder = ["ประตู/หน้าต่าง", "กระจกเปลือย/ตู้", "หลังคา", "ระแนง/บังตา", "ผนัง/ฝ้า", "มุ้ง", "กระจก (เปลี่ยน/เพิ่ม)", "สี/พื้นผิว (เพิ่ม)"];
  // หน่วยคิดราคา: ปกติ ตร.ม. · บางรายการเป็น ต่อบาน/ชุด/เมตร
  const unitOf = (p) => {
    const u = p.unitNote || "", n = p.name;
    if (/ต่อบาน|\/\s*บาน/.test(u) || /บ\.\/บาน|บาท\/บาน/.test(n)) return "panel";
    if (/ต่อชุด|\/\s*ชุด/.test(u)) return "set";
    if (/\/\s*เมตร|บ\.\/เมตร|บาท\/เมตร/.test(n)) return "meter";
    return "sqm";
  };
  let key = 0;
  const clean = products.map((p) => {
    const category = categoryOf(p.name, p.brand);
    const unit = unitOf(p);
    const tiers = p.tiers.map((t) => ({ lo: round(t.lo), hi: t.hi == null ? null : round(t.hi), price: t.price }));
    // dedupe tieredAdds
    const seen = new Set();
    const tieredAdds = p.tieredAdds.filter((a) => { const k = a.label + a.amount; if (seen.has(k)) return false; seen.add(k); return true; });
    return {
      key: "p" + (++key),
      category,
      unit,
      name: p.name,
      brand: p.brand,
      min: p.min,
      flatRate: p.flatRate ?? null,
      tiers,
      perPanelAdd: p.perPanelAdd,
      tieredAdds,
      colorAdds: p.colorAdds || [],
      unitNote: p.unitNote,
      note: p.note || null,
    };
  });

  const categories = catOrder
    .filter((cat) => clean.some((p) => p.category === cat))
    .map((cat) => ({ label: cat, count: clean.filter((p) => p.category === cat).length }));

  const out = {
    version: "ราคาประเมิน 2026 R1",
    source: "Data ไฟล์ราคาประเมิน (2026).xlsx",
    builtAt: new Date().toISOString().slice(0, 10),
    categories,
    products: clean,
  };
  fs.mkdirSync(path.dirname(OUT), { recursive: true });
  fs.writeFileSync(OUT, JSON.stringify(out, null, 2), "utf8");

  console.log(`✓ เขียน ${OUT}`);
  console.log(`  สินค้า ${clean.length} รายการ · ${categories.length} หมวด`);
  for (const cat of categories) console.log(`    - ${cat.label}: ${cat.count}`);
  // verify ตัวอย่างที่รู้ค่าจาก docx
  const smsSlide = clean.find((p) => p.name.includes("บานเลื่อน") && p.brand === "SMS");
  const casement = clean.find((p) => p.name === "บานเปิด" && p.brand === "EURO");
  console.log("\n  ── verify ──");
  if (smsSlide) console.log(`  บานเลื่อน SMS: min=${smsSlide.min} tiers=${smsSlide.tiers.length} (คาด min 6500, 8 ช่วง)`);
  if (casement) console.log(`  บานเปิด EURO: min=${casement.min} perPanelAdd=${casement.perPanelAdd?.amount} tier@2.0-2.4=${casement.tiers.find((t) => t.lo === 2)?.price} (คาด min? +บาน 5000, 7500)`);
}
main();
