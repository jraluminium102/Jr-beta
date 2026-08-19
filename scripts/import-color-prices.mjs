/**
 * import-color-prices — ดึง "ราคาเส้นแยกสี + น้ำหนัก/เส้น" จากไฟล์ถอดทุน เข้า pricebook
 *   node scripts/import-color-prices.mjs "C:/.../ถอดทุน_รวมทั้งหมด v9.xlsx" [--write]
 *
 * เจ้าของเคาะ 19 ส.ค.69: "เอา" — ยึดราคาสีตามไฟล์
 * แหล่ง: ชีต "ราคาสี" บล็อก "ปัจจุบัน" (คอลัมน์ L–R) = ราคาสุทธิต่อเส้นของแต่ละสี
 *   L ขาว/ดำ · M เทาซาฮาร่า · N ดำซาฮาร่า · O แอทแทคเกรย์ · P ลายไม้สต็อค · Q มะฮอกกานี · R ไวท์โอ๊ค
 *   S น้ำหนัก กก./เส้น
 * ⚠ ตรวจแล้วราคาสีในไฟล์ "ไม่ใช่" ขาว+ค่าอบ×กก. (ตรงสูตรแค่ 5–59/125 รหัส) = เป็นราคาจริงรายสี
 *   → ต้องยึดค่าในไฟล์ตรง ๆ ห้ามคำนวณเอง
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { openXlsx } from "./dumpxlsx.mjs";

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const PB_PATH = path.join(ROOT, "src/lib/calculator40/pricebook.json");

// คอลัมน์ในไฟล์ → คีย์สีในเครื่องคิดราคา (alu-colors.ts)
const COLOR_COL = {
  sahara: "M", sahara_black: "N", aztec: "O",
  wood_teak: "P", wood_maho: "Q", wood_whiteoak: "R",
};
const isCode = (s) => /^[BF]\d{4,5}$|^E-|^WM-/.test(String(s ?? ""));
const num = (v) => Number(String(v ?? "").replace(/,/g, "")) || 0;

/**
 * ⚠ เอาเฉพาะ "ระบบที่ชีตราคาสีเป็นราคาจริง" — หัวชีตเขียนเตือนไว้เองว่า
 *   "เพิ่มเมืองทอง/SlimLux/Velora/E-series (ราคาประเมิน นน×เรต+ค่าอบ)"
 * ตรวจแล้วจริง: ชีต "คิดทุน SlimLux" ใช้ WM-K04 = 750 · ราคาสีประเมิน 797
 *               ชีต "คิดทุน E-series" ใช้ E-03 = 3,347 (เรต 1,492/กก.) · ราคาสีประเมิน 1,237
 *   → ถ้าดึงเข้ามาทั้งดุ้น ทุน E-series จะหล่น 33% เงียบ ๆ
 * ระบบที่รับ: sms / Fuji (ราคาสีดึงมาจาก Stock.xlsx = ราคาซื้อจริง)
 */
const SYSTEM_OK = /(sms|fuji)\s*$/i;
const SYSTEM_SKIP_NOTE = "ราคาประเมิน (นน×เรต) — ชีตคิดทุนของรุ่นนั้นใช้ราคาจริงคนละตัว";

export function readColorPrices(file) {
  const X = openXlsx(file);
  const sheet = X.sheets.find((s) => s.name === "ราคาสี");
  if (!sheet) throw new Error('ไม่เจอชีต "ราคาสี" ในไฟล์');
  const all = X.read(sheet.path).filter((r) => isCode(r.cells.A));
  const rows = all.filter((r) => SYSTEM_OK.test(String(r.cells.C ?? "").trim()));
  const skipped = all.filter((r) => !SYSTEM_OK.test(String(r.cells.C ?? "").trim()))
    .map((r) => ({ code: String(r.cells.A).trim(), system: String(r.cells.C ?? "").trim() }));
  const ALUCODE = {}, ALUWEIGHT = {}, ALUCOLOR_KEY = {}, NAMES = {};
  for (const k of Object.keys(COLOR_COL)) ALUCOLOR_KEY[k] = {};

  // ── น้ำหนักจริง: ชีต "น้ำหนักโปรไฟล์" (C รหัส · F ยาว(ม.) · G กก./ม. · H กก./เส้น) ──
  //   หัวชีตเขียนเอง: "เอาไปเสียบระบบ ราคาเส้น = น้ำหนัก × ราคา/กก."
  const wsheet = X.sheets.find((s) => s.name === "น้ำหนักโปรไฟล์");
  if (wsheet) for (const { cells: c } of X.read(wsheet.path)) {
    const code = String(c.C ?? "").trim();
    if (!isCode(code) || !(num(c.H) > 0)) continue;
    ALUWEIGHT[code] = Math.round(num(c.H) * 1000) / 1000;
  }
  // ── คิดราคาใหม่จากน้ำหนักจริง (เจ้าของสั่ง 19 ส.ค.69: "ราคาคูณใหม่เลย") ────────
  //   ⚠ น้ำหนักในชีตราคาสี (คอลัมน์ S) ไม่ใช่ของชั่งจริง — มันคือ "ราคาขาว ÷ 187"
  //     (B20001: 1125÷187 = 6.016 เป๊ะทุกรหัส) ของจริงคือ 6.25 → ราคาในชีตจึงคิดขาดไป ~3.9%
  //   วิธีแก้: ถอด "เรต ฿/กก. ของแต่ละสี" ที่ชีตตั้งใจไว้ออกมา (ราคาสี ÷ น้ำหนักที่ชีตใช้)
  //           แล้วคูณกลับด้วยน้ำหนักจริง → ความสัมพันธ์ระหว่างสีคงเดิมเป๊ะ แก้เฉพาะน้ำหนักที่ผิด
  //   ⚠ น้ำหนักบางรหัสในชีตดูเป็นเลขกลม ๆ ที่ยังไม่ได้ชั่ง (เช่น B20024 = "2.000" เป๊ะ
  //     ทั้งที่ราคาบอกว่า ~0.99) ถ้าคูณตามจะทำให้ราคาเด้งเท่าตัว → กันไว้ที่ ±15%
  //     เกินกรอบ = ไม่แก้ราคา เก็บเข้า outliers ให้เจ้าของไปเช็คน้ำหนักจริงก่อน
  const MAX_FIX = 0.15;
  const round1 = (n) => Math.round(n * 10) / 10;
  const outliers = [];
  for (const { cells: c } of rows) {
    const code = String(c.A).trim();
    NAMES[code] = String(c.B ?? "").trim();
    const white = num(c.L);
    const realKg = ALUWEIGHT[code] || 0;
    const sheetKg = white > 0 ? white / 187 : 0;              // น้ำหนักที่ชีตใช้คิดราคา (ย้อนจากราคา)
    let fix = (realKg > 0 && sheetKg > 0) ? realKg / sheetKg : 1;   // ตัวคูณแก้น้ำหนัก (ปกติ ≈1.039)
    if (Math.abs(fix - 1) > MAX_FIX) {
      outliers.push({ code, name: NAMES[code], sheetKg: round1(sheetKg * 100) / 100, realKg, white, would: round1(white * fix) });
      fix = 1;   // ไม่แตะราคา รอเจ้าของยืนยันน้ำหนัก
    }
    if (white > 0) ALUCODE[code] = round1(white * fix);
    for (const [key, col] of Object.entries(COLOR_COL))
      if (num(c[col]) > 0) ALUCOLOR_KEY[key][code] = round1(num(c[col]) * fix);
  }
  return { ALUCODE, ALUWEIGHT, ALUCOLOR_KEY, NAMES, count: rows.length, skipped, skipNote: SYSTEM_SKIP_NOTE, outliers };
}

// ── CLI ──
if (process.argv[1]?.endsWith("import-color-prices.mjs")) {
  const file = process.argv[2];
  const write = process.argv.includes("--write");
  if (!file) { console.log('ใช้: node scripts/import-color-prices.mjs "<ไฟล์.xlsx>" [--write]'); process.exit(1); }

  const nw = readColorPrices(file);
  const pb = JSON.parse(fs.readFileSync(PB_PATH, "utf8"));
  const b = (n) => Number(n).toLocaleString("th-TH", { maximumFractionDigits: 2 });

  console.log(`รับเข้า ${nw.count} รหัส · ข้าม ${nw.skipped.length} รหัส (${nw.skipNote})`);
  const bySys = {};
  for (const x of nw.skipped) bySys[x.system] = (bySys[x.system] ?? 0) + 1;
  for (const [k, v] of Object.entries(bySys)) console.log(`    ข้าม ${k}: ${v} รหัส`);
  console.log("");
  console.log("── ① ราคาขาว/ดำ (ALUCODE) ──");
  const cur = pb.ALUCODE ?? {};
  const added = Object.keys(nw.ALUCODE).filter((c) => !(cur[c] > 0));
  const changed = Object.keys(nw.ALUCODE).filter((c) => cur[c] > 0 && Math.abs(cur[c] - nw.ALUCODE[c]) > 0.5);
  console.log(`  เดิม ${Object.keys(cur).length} รหัส → ใหม่ ${Object.keys(nw.ALUCODE).length} รหัส · เพิ่ม ${added.length} · ราคาเปลี่ยน ${changed.length}`);
  changed.slice(0, 15).forEach((c) => console.log(`    ${c.padEnd(9)} ${b(cur[c]).padStart(7)} → ${b(nw.ALUCODE[c]).padStart(7)}  ${nw.NAMES[c]}`));
  if (changed.length > 15) console.log(`    … อีก ${changed.length - 15}`);

  console.log("\n── ② ราคาแยกสี (ALUCOLOR_KEY) ──");
  for (const [k, m] of Object.entries(nw.ALUCOLOR_KEY)) console.log(`  ${k.padEnd(14)} ${String(Object.keys(m).length).padStart(4)} รหัส`);

  console.log("\n── ③ น้ำหนัก กก./เส้น (ALUWEIGHT) ──");
  console.log(`  ${Object.keys(nw.ALUWEIGHT).length} รหัส (จากชีต "น้ำหนักโปรไฟล์" = น้ำหนักชั่งจริง)`);
  console.log('  → เอาไปเติมน้ำหนักในสโตร์ได้ (สายเรตต่อโล → ราคาต่อเส้น)');
  if (nw.outliers.length) {
    console.log(`
── ⚠ ${nw.outliers.length} รหัส น้ำหนักในชีตต่างจากที่ราคาบอกเกิน 15% — ไม่แก้ราคา รอเจ้าของเช็ค ──`);
    for (const o of nw.outliers)
      console.log(`    ${o.code.padEnd(9)} ราคาบอกว่าหนัก ${String(o.sheetKg).padStart(6)} กก. · ชีตเขียน ${String(o.realKg).padStart(6)} กก. → ถ้าคูณตาม ราคา ${b(o.white)} จะกลายเป็น ${b(o.would)}  ${o.name}`);
  }

  if (!write) { console.log("\n(ยังไม่เขียนลง pricebook — ใส่ --write ถ้าจะเขียนจริง)"); process.exit(0); }
  pb.ALUCODE = { ...cur, ...nw.ALUCODE };
  pb.ALUCOLOR_KEY = nw.ALUCOLOR_KEY;
  pb.ALUWEIGHT = nw.ALUWEIGHT;
  fs.writeFileSync(PB_PATH, JSON.stringify(pb, null, 2) + "\n");
  console.log("\n✅ เขียนลง pricebook.json แล้ว");
}
