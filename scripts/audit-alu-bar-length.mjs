#!/usr/bin/env node
/**
 * audit-alu-bar-length — ไล่ทุกบรรทัดเส้นอลูในทุกรุ่น: "ความยาวเส้นที่เอนจินใช้" ตรงกับ "ความยาวเส้นจริงของรหัสนั้น" ไหม
 *   node scripts/audit-alu-bar-length.mjs
 *
 * เจ้าของถาม 12 ต.ค.69 "แน่ใจใช่ไหมระบบไม่สับสน บางทีบันทึกเป็นกิโล/เส้น บางทีกิโล/เมตร
 *   สโตร์เขียนเป็นต่อเส้น เอาไปคิดจริงรู้ใช่ไหมเส้นไหนยาวกี่เมตร"
 *
 * วิธีที่เอนจินใช้ความยาว (engine.mjs)
 *   barLen ของบรรทัด = it.stockLen (ถ้าบรรทัดนั้นตั้งไว้) → prod.stockLen (ถ้ารุ่นตั้งไว้) → 6.4 (ค่าตั้งต้น)
 *   ① นับเส้นที่ต้องซื้อ  = ความยาวที่ตัด ÷ barLen             (barsNeeded)
 *   ② ราคาเส้น          = ALU_KG[รหัส] (กก./เส้น) × เรต        ← ไม่คูณ barLen ซ้ำ
 *   ③ ค่าอบสี            = it.kg (ถ้าสูตรฝังไว้) หรือ ALUWEIGHT_KGM[รหัส] (กก./ม.) × barLen
 * จุดที่จะพังได้: รหัส B/F (เส้นจริง 6.4 ม.) ไปอยู่ในรุ่นที่ตั้ง stockLen 6.0 (เมืองทอง) หรือกลับกัน
 *   → ③ คูณผิดยาว 6% · ① นับเส้นผิด · และ it.kg ที่ฝังในสูตรอาจเป็นคนละความยาวกับตาราง
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { PRODUCTS } from "../src/lib/calculator40/products.mjs";
import { STOCK_LEN } from "../src/lib/calculator40/engine.mjs";

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const PB = JSON.parse(fs.readFileSync(path.join(ROOT, "src/lib/calculator40/pricebook.json"), "utf8"));
const KG = PB.ALU_KG ?? {}, KGM = PB.ALUWEIGHT_KGM ?? {}, BR = PB.ALU_BRAND_OF ?? {};

/** ความยาวเส้นจริงของรหัส — B/F (ฟูจิ/SMS) 6.4 · เมืองทอง/SlimLux/Velora/ชื่อไทย 6 · มือจับ X-J 2.8 */
function nativeLen(code) {
  const c = String(code).toUpperCase();
  if (c === "JR02891") return 2.8;                             // มือจับ X-J ขายเป็นท่อน 2.8 ม.
  // กล่อง/ฉาก/แซด เมืองทอง + ลูกฟูก = เส้น 6 ม. เสมอ แม้ "เรต" จะคิดแบรนด์ฟูจิ (แบรนด์คือ ฿/กก. ไม่ใช่ความยาว)
  if (/^(กล่อง|ฉาก|แซด|ตัวZ)/.test(code) || c === "JR01994" || c === "JR01993") return 6;
  const b = BR[c];
  if (b === "fuji" || b === "sms") return 6.4;                 // รวมเส้นฟูจิที่สโตร์ตั้ง sku เป็น JR (F7860→JR02894 ฯลฯ)
  if (/^(B|F)\d/.test(c) || /^E-/.test(c)) return 6.4;        // E-series ชีตน้ำหนักโปรไฟล์ คอลัมน์ F = 6.4
  return 6;                                                    // เมืองทอง / SlimLux / Velora / ชื่อไทย
}
const codeOf = (it) => (it.code && String(it.code).includes("?")) ? null : String(it.code ?? "");

const lenMismatch = [], kgMismatch = [], noLenInfo = [];
let lines = 0;
for (const [pid, p] of Object.entries(PRODUCTS)) {
  if (!p || !Array.isArray(p.alu)) continue;
  const prodLen = p.stockLen ?? STOCK_LEN;
  for (const it of p.alu) {
    const code = codeOf(it);
    if (!code || code === "-") continue;
    lines++;
    const engineLen = Number(it.stockLen) || prodLen;
    const nat = nativeLen(code);
    // ① ความยาวที่เอนจินใช้ vs ความยาวจริงของรหัส
    if (Math.abs(engineLen - nat) > 0.01 && (KGM[code] > 0 || KG[code] > 0))
      lenMismatch.push({ pid, name: it.name, code, engineLen, nat, kgm: KGM[code], itKg: it.kg });
    // ② kg ที่ฝังในสูตร (ใช้คิดค่าอบก่อนตาราง) vs ตาราง กก./เส้น
    const itKg = Number(it.kg) || 0, tabKg = Number(KG[code]) || 0;
    if (itKg > 0 && tabKg > 0 && Math.abs(itKg - tabKg) / tabKg > 0.03)
      kgMismatch.push({ pid, name: it.name, code, itKg, tabKg, pct: Math.round((itKg / tabKg - 1) * 100) });
  }
}

console.log("บรรทัดเส้นอลูในสูตรทั้งหมด " + lines + " บรรทัด");
console.log("\n── ① ความยาวเส้นที่เอนจินใช้ ≠ ความยาวจริงของรหัส: " + lenMismatch.length + " บรรทัด ──");
for (const r of lenMismatch)
  console.log("   " + r.pid.padEnd(14) + String(r.name).slice(0, 30).padEnd(32) + r.code.padEnd(10)
    + " เอนจินใช้ " + r.engineLen + " ม. · ของจริง " + r.nat + " ม." + (r.itKg > 0 ? "  (สูตรฝัง kg " + r.itKg + " ไว้ ค่าอบไม่กระทบ)" : "  ⚠ ค่าอบคูณผิดยาว"));
// ② ตั้งแต่ 12 ต.ค.69 ค่าอบยึดตารางก่อน it.kg (kgForBake) → รายการนี้เป็น "ข้อมูลให้รู้" ไม่ใช่จุดพัง
//    it.kg ยังต้องอยู่ในสูตรเพราะที่อื่นใช้เป็นตัวสลับ (formulaCF/boxPrice) — ค่าเก่าจึงค้างอยู่ได้โดยไม่กระทบเงิน
console.log("\n── ② (ข้อมูล) kg ที่ฝังในสูตร ≠ ตาราง กก./เส้น เกิน 3%: " + kgMismatch.length + " บรรทัด — เอนจินใช้ตารางแล้ว ไม่กระทบค่าอบ ──");
for (const r of kgMismatch)
  console.log("   " + r.pid.padEnd(14) + String(r.name).slice(0, 30).padEnd(32) + r.code.padEnd(10)
    + " สูตร " + String(r.itKg).padStart(7) + " · ตาราง " + String(r.tabKg).padStart(7) + "  (" + (r.pct > 0 ? "+" : "") + r.pct + "%)");

const bad = lenMismatch.length;
console.log("\n" + (bad ? "❌ มี " + bad + " บรรทัดที่ความยาวเส้นไม่ตรง" : "✅ ทุกบรรทัดใช้ความยาวเส้นถูกตัว (ค่าอบ = กก./ม. จากไฟล์ × ความยาวเส้นจริง)"));
process.exit(bad ? 1 : 0);
