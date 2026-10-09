#!/usr/bin/env node
/**
 * อ่านน้ำหนัก กก./ม. รายรหัส จากแคตตาล็อก Euro Fuji (อลู/fuji.pdf) แล้วเทียบกับ
 * ชีต "น้ำหนักโปรไฟล์" — ใช้ปิดช่องว่างรหัสที่ชีตไม่มี และตรวจแถวที่ชีตติดธง "ตรวจหน่วย"
 *
 *   node scripts/read-fuji-catalogue.mjs [--all]
 *
 * ⚠ ToUnicode ของฟอนต์ในเล่มแปลเลข 6 เป็น "ด" (เจอ 9 ต.ค.69)
 *   ยืนยันแล้วจาก F79ด4 = 1.030 กก./ม. ↔ ชีต F7964 · F785ด ↔ F7856
 *   ทุกเลขอื่นถอดถูก — แก้เฉพาะตัวนี้ตัวเดียว
 *
 * ตัวตรวจว่าค่าที่ได้ถูก: ราคาอลูเดิมในสูตรตั้งไว้ที่ 187 ฿/กก.
 *   F7948 0.141×6.4 = 0.902 กก. → 169 ฿ = 187.3 ฿/กก. ✓
 *   F7860 0.412×6.4 = 2.637 กก. → 493 ฿ = 187.0 ฿/กก. ✓
 *   F7949 0.252×6.4 = 1.613 กก. → 302 ฿ = 187.2 ฿/กก. ✓
 */
import { execFileSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { openXlsx } from "./dumpxlsx.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const PDF = "C:/Users/jralu/JR-beta/อลู/fuji.pdf";
const XLSX = "C:/Users/jralu/JR-beta/น้ำหนักโปรไฟล์.xlsx";
const BAR = 6.4;   // เส้นมาตรฐาน Fuji

const txt = execFileSync(process.execPath, [path.join(ROOT, "scripts/dumppdf.mjs"), PDF, "99999999"], { encoding: "utf8", maxBuffer: 1 << 28 });

/** แก้เลขที่ ToUnicode แปลผิด (6 → "ด") */
const fixNum = (s) => String(s).replace(/ด/g, "6");

export function readFujiCatalogue() {
  const out = new Map();   // รหัส → กก./ม.
  for (const ln of txt.split(/\r?\n/)) {
    //  "F7974 Wา = 0.799 K่/M"  (ชื่อคอลัมน์ถอดไม่ครบ แต่เลขถอดได้)
    const m = /^\*?([A-Zด][0-9ด]{3,4}[A-Zด]?)\s*\S*\s*=\s*([0-9.ด]+)\s/.exec(ln.trim());
    if (!m) continue;
    const code = fixNum(m[1]).toUpperCase();
    const kgm = Number(fixNum(m[2]));
    if (!/^[A-Z]\d{3,4}[A-Z]?$/.test(code) || !(kgm > 0) || kgm > 20) continue;
    // รหัสเดียวกันโผล่หลายหน้า (ค่าเท่ากัน) — เก็บค่าแรก แต่ถ้าต่างกันให้เตือน
    const had = out.get(code);
    if (had != null && Math.abs(had - kgm) > 0.0005) console.log("  ⚠ " + code + " เล่มเขียน 2 ค่า: " + had + " / " + kgm);
    if (had == null) out.set(code, kgm);
  }
  return out;
}

if (import.meta.url.startsWith("file:") && process.argv[1] && path.resolve(process.argv[1]).endsWith("read-fuji-catalogue.mjs")) {
  const cat = readFujiCatalogue();
  console.log("แคตตาล็อก Fuji: " + cat.size + " รหัสที่มี กก./ม.\n");

  // ชีตน้ำหนักโปรไฟล์ (คอลัมน์ C รหัส · F ยาว · G กก./ม. · H กก./เส้น · I หมายเหตุ)
  const X = openXlsx(XLSX);
  const sh = X.sheets.find((s) => s.name === "น้ำหนักโปรไฟล์");
  const sheet = new Map();
  for (const { cells: c } of X.read(sh.path)) {
    const code = String(c.C ?? "").trim().toUpperCase();
    if (!/^[A-Z]\d{3,5}[A-Z]?(-\d{2})?$/.test(code)) continue;
    sheet.set(code.replace(/-\d{2}$/, ""), {
      kgm: Number(c.G) || 0, kgBar: Number(c.H) || 0, len: Number(c.F) || 0,
      name: String(c.E ?? "").trim(), note: String(c.I ?? "").trim(),
    });
  }

  const flagged = [], missing = [], diff = [];
  for (const [code, kgm] of [...cat.entries()].sort()) {
    const s = sheet.get(code) ?? sheet.get(code.replace(/B$/, "")) ?? sheet.get(code + "B");
    if (!s) { missing.push([code, kgm]); continue; }
    if (/ตรวจหน่วย/.test(s.note)) flagged.push([code, kgm, s]);
    else if (s.kgm > 0 && Math.abs(s.kgm - kgm) / kgm > 0.03) diff.push([code, kgm, s]);
  }

  console.log("── ① แถวที่ชีตติดธง \"ตรวจหน่วย\" — แคตตาล็อกบอกว่าเท่าไร ──");
  for (const [code, kgm, s] of flagged) {
    const barCat = Math.round(kgm * BAR * 1000) / 1000;
    const same = Math.abs(s.kgBar - barCat) / barCat < 0.02;
    const unitErr = Math.abs(s.kgBar - kgm) / kgm < 0.02;
    console.log("  " + code.padEnd(8) + " เล่ม " + String(kgm).padStart(6) + " กก./ม. → " + String(barCat).padStart(7) + " กก./เส้น"
      + " · ชีตเขียน " + String(s.kgBar).padStart(7) + (same ? "  ✅ ตรงกัน" : unitErr ? "  ❌ ชีตเอา กก./ม. มาใส่ช่อง กก./เส้น" : "  ⚠ ต่างกัน") + "  " + s.name);
  }
  console.log("\n── ② รหัสที่ชีตไม่มีเลย (เติมได้จากเล่ม) " + missing.length + " รหัส ──");
  for (const [code, kgm] of missing)
    console.log("  " + code.padEnd(8) + String(kgm).padStart(6) + " กก./ม. → " + String(Math.round(kgm * BAR * 1000) / 1000).padStart(7) + " กก./เส้น");
  if (process.argv.includes("--all")) {
    console.log("\n── ③ ค่าที่ชีตกับเล่มต่างกันเกิน 3% " + diff.length + " รหัส ──");
    for (const [code, kgm, s] of diff)
      console.log("  " + code.padEnd(8) + " เล่ม " + String(kgm).padStart(6) + " · ชีต " + String(s.kgm).padStart(6) + " กก./ม.  " + s.name);
  }
}
