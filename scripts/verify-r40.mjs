// verify-r40.mjs — ด่านกันราคาเพี้ยน R4.0: เทียบผล engine กับค่าจริงในชีต xlsx (golden-snapshot)
// รัน:  node scripts/verify-r40.mjs  (ต้องผ่าน 71/71 ก่อน deploy ทุกครั้งที่แตะ calculator40)
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { computeCost, barsNeeded } from '../src/lib/calculator40/engine.mjs';
import { PRODUCTS } from '../src/lib/calculator40/products.mjs';
import { aluColorKeysFor, ALU_COLOR_KEYS } from '../src/lib/calculator40/alu-colors.ts';
import { buildBoxPrices, boxPriceOf } from '../src/lib/calculator40/box-link.ts';
import { stockColorOfCalc, buildPriceOverride, applyPriceOverride } from '../src/lib/calculator40/stock-link.ts';
import { ALU_FROM_CUTLIST, cutAluLines, cutRoofConsumLines, multiRoofArea } from '../src/lib/calculator40/alu-from-cutlist.ts';
import { cutInputFromRecipe } from '../src/lib/cutlist/from-recipe.ts';
import { CUT_SPEC_BY_ID } from '../src/lib/cutlist/products.ts';
import { RM } from '../src/lib/calculator40/products.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PB = JSON.parse(fs.readFileSync(path.join(__dirname, '../src/lib/calculator40/pricebook.json'), 'utf8'));

let pass = 0, fail = 0;
function check(label, got, want, tol = 1) {
  const ok = Math.abs(got - want) <= tol;
  console.log(`  ${ok ? '✅' : '❌'} ${label}: got=${got}  want=${want}${ok ? '' : '  <-- ไม่ตรง'}`);
  ok ? pass++ : fail++;
  return ok;
}

// ── ตารางค่าแรงต้นทาง: ชีต "ค่าแรง" ของ ถอดทุน_รวมทั้งหมด.xlsx (ส.ค.69) ──────
//   ชีตกรอกเป็น "ชั่วโมง × ค่าแรง/ชม. × จำนวนคน" แล้วให้คอลัมน์ B–E เป็นบาท:
//     B(ผลิตฐาน)=G×I×L · C(ผลิต/ตร.ม.)=J×I×L · D(ติดตั้งฐาน)=H×I×M · E(ติดตั้ง/ตร.ม.)=K×I×M
//   ⚠ ห้ามแก้ตัวเลขตรงนี้ด้วยมือ — ต้องมาจากไฟล์เท่านั้น (นี่คือด่านกัน pricebook หลุดจากไฟล์)
//   hp=ชม.ฐานผลิต jp=ชม.เพิ่มผลิต/ตร.ม. np=คนผลิต · hi/ki/ni=ฝั่งติดตั้ง · rate=ค่าแรง/ชม.
//   baht = ชีตกรอกเป็นบาทตรง ๆ [ผลิตฐาน, ผลิต/ตร.ม., ติดตั้งฐาน, ติดตั้ง/ตร.ม.]
const LABOR_SRC = {
  // ── ชีต "ค่าแรง" ในไฟล์ถอดทุน v20.1 (คอลัมน์ G/J/L ผลิต · H/K/M ติดตั้ง · I เรต/ชม.) ──
  //   ดึงตรงจากไฟล์ 3 ก.ย.69 (เจ้าของสั่ง "เอาตามไฟล์") — v20 ขึ้นไปรื้อชั่วโมงใหม่ + ใส่ตัวคูณ L/M
  //   ของเดิมในเทสเป็นตัวเลขจากไฟล์ ถอดทุน_รวมทั้งหมด.xlsx ตัวแรก (คนละรุ่น) จึงไม่ตรงกันทั้งตาราง
  "บานเลื่อน SMS": { hp: 6, jp: 0.33, np: 1.5, hi: 7, ki: 0.17, ni: 2, rate: 87.5 },
  "บานเลื่อน ยูโร": { hp: 6, jp: 0.38, np: 1.5, hi: 6, ki: 0.22, ni: 2, rate: 87.5 },
  "บานเลื่อนรางบน": { hp: 7, jp: 0.25, np: 1.5, hi: 7, ki: 0.25, ni: 3, rate: 87.5 },
  "SlimLux": { hp: 7, jp: 0.45, np: 1.5, hi: 7, ki: 0.25, ni: 3, rate: 87.5 },
  "Velora": { hp: 8, jp: 0.5, np: 1, hi: 6, ki: 0.25, ni: 2, rate: 87.5 },
  "บานเปิด (ยูโร)": { hp: 6, jp: 0.25, np: 1.5, hi: 7, ki: 0.25, ni: 2, rate: 87.5 },
  "เปิดดัดโค้ง": { hp: 0, jp: 0.4, np: 1.5, hi: 7, ki: 0.1, ni: 2, rate: 87.5 },
  "บานกระทุ้ง (ยูโร)": { hp: 6, jp: 0.27, np: 1.5, hi: 2.125, ki: 0.13, ni: 4, rate: 87.5 },
  "บานหมุน": { hp: 8, jp: 0.27, np: 1.5, hi: 8, ki: 0.27, ni: 3.5, rate: 87.5 },
  "บานเฟี้ยม (sms)": { hp: 3, jp: 0, np: 2, hi: 3, ki: 0, ni: 2, rate: 87.5 },
  "บานเฟี้ยมยูโร": { hp: 3, jp: 0, np: 2, hi: 3, ki: 0, ni: 2, rate: 87.5 },
  "บานเฟี้ยมยก": { hp: 14, jp: 0.29, np: 2.5, hi: 8, ki: 0.18, ni: 3.5, rate: 87.5 },
  "บานยก (เซมิ)": { hp: 16, jp: 0.27, np: 1.5, hi: 3.5, ki: 0.13, ni: 3.5, rate: 87.5 },
  "บานติดตาย": { hp: 6, jp: 0.495, np: 1.5, hi: 4, ki: 0.33, ni: 3.5, rate: 87.5 },
  "ตายดัดโค้ง": { hp: 8, jp: 0.4, np: 1.5, hi: 8, ki: 0.45, ni: 3.5, rate: 87.5 },
  "PC Door": { hp: 14, jp: 0.4, np: 1, hi: 8, ki: 0.3, ni: 2, rate: 87.5 },
  "บานโซลิด": { hp: 10, jp: 0.52, np: 1.5, hi: 7, ki: 0.23, ni: 2, rate: 87.5 },
  "บานระแนงเลื่อน": { hp: 8, jp: 0.5, np: 2.5, hi: 7, ki: 0.25, ni: 2, rate: 87.5 },
  "บานเกล็ด": { hp: 6, jp: 0.9, np: 0.5, hi: 5, ki: 0.3, ni: 2, rate: 87.5 },
  "บานเปลือย": { hp: 0, jp: 0, np: 2, hi: 14, ki: 0, ni: 3, rate: 87.5 },
  "บานตู้ Futuretech": { hp: 7, jp: 0.71, np: 0.5, hi: 7, ki: 0.14, ni: 2, rate: 87.5 },
  "มุ้งจีบ": { hp: 0, jp: 0, np: 2, hi: 5, ki: 0, ni: 2, rate: 87.5 },
  "มุ้งม้วน ขาว/ดำ/น้ำตาล": { hp: 0, jp: 0, np: 2, hi: 5, ki: 0, ni: 2, rate: 87.5 },
  "มุ้งม้วน ซาฮาร่า": { hp: 0, jp: 0, np: 2, hi: 5, ki: 0, ni: 2, rate: 87.5 },
  "มุ้งม้วน ลายไม้สักทอง": { hp: 0, jp: 0, np: 2, hi: 5, ki: 0, ni: 2, rate: 87.5 },
  "มุ้งม้วน ไลท์โอ๊ค": { hp: 0, jp: 0, np: 2, hi: 5, ki: 0, ni: 2, rate: 87.5 },
  "มุ้งจีบนิรภัย ≤3ม. ขาว/ดำ": { hp: 0, jp: 0, np: 2, hi: 5, ki: 0.5143, ni: 2, rate: 87.5 },
  "มุ้งจีบนิรภัย ≤3ม. ซาฮาร่า": { hp: 0, jp: 0, np: 2, hi: 5, ki: 0.5143, ni: 2, rate: 87.5 },
  "มุ้งจีบนิรภัย ≤3ม. สักทอง": { hp: 0, jp: 0, np: 2, hi: 5, ki: 0.5143, ni: 2, rate: 87.5 },
  "มุ้งจีบนิรภัย >3ม. ขาว/ดำ": { hp: 0, jp: 0, np: 2, hi: 5, ki: 0.5143, ni: 2, rate: 87.5 },
  "มุ้งจีบนิรภัย >3ม. ซาฮาร่า": { hp: 0, jp: 0, np: 2, hi: 5, ki: 0.5143, ni: 2, rate: 87.5 },
  "มุ้งจีบนิรภัย >3ม. สักทอง": { hp: 0, jp: 0, np: 2, hi: 5, ki: 0.5143, ni: 2, rate: 87.5 },
  "มุ้งเฟรมเล็ก": { hp: 1.3714, jp: 0.3429, np: 2, hi: 0.8, ki: 0.2057, ni: 2.5, rate: 87.5 },
  "มุ้งเฟรมใหญ่": { hp: 1.6, jp: 0, np: 2, hi: 0.5029, ki: 0, ni: 2.5, rate: 87.5 },
  "มุ้งนิรภัย": { hp: 1.0057, jp: 0, np: 2, hi: 0.5029, ki: 0, ni: 2.5, rate: 87.5 },
  "ระแนงสลับ": { hp: 12, jp: 0.82, np: 1.5, hi: 10, ki: 0.21, ni: 4, rate: 87.5 },
  "ระแนง": { hp: 10, jp: 0.43, np: 2, hi: 10, ki: 0.29, ni: 4, rate: 87.5 },
  "ระแนงหมุน": { hp: 11, jp: 0.75, np: 1.5, hi: 10, ki: 0.38, ni: 4, rate: 87.5 },
  "ประตูรั้ว": { hp: 14, jp: 0.83, np: 1.5, hi: 24, ki: 0.27, ni: 5, rate: 87.5 },
  "ราวกันตก": { hp: 4, jp: 0.27, np: 1.5, hi: 7, ki: 0.27, ni: 3.5, rate: 87.5 },
  "ชุด Shower": { hp: 0, jp: 0, np: 1.5, hi: 7, ki: 0.3334, ni: 2, rate: 87.5 },
  "หลังคา": { hp: 16, jp: 0.54, np: 2.5, hi: 24, ki: 0.28, ni: 5, rate: 87.5 },
  "หลังคาจั่ว": { hp: 20, jp: 0.73, np: 2.5, hi: 26, ki: 0.26, ni: 5, rate: 87.5 },
  "หลังคาเลื่อน": { hp: 20, jp: 0.65, np: 2, hi: 24, ki: 0.41, ni: 4, rate: 87.5 },
};
/** แปลงแถวในชีต "ค่าแรง" → บาท {pBase,pRate,iBase,iRate} (สูตรเดียวกับ B–E ในชีต) */
function laborFromSheet(s) {
  if (s.baht) return { pBase: s.baht[0], pRate: s.baht[1], iBase: s.baht[2], iRate: s.baht[3] };
  // ⚠ ห้ามปัดทศนิยม — เอนจินใช้ค่าเต็มจากตาราง (เช่น SlimLux ติดตั้ง/ตร.ม. = 65.625)
  //   ปัด 2 ตำแหน่งแล้วยอดขายเพี้ยนได้ 100 บาท จากการปัดร้อยชั้นถัดไป (เจอจริง 3 ก.ย.69)
  return {
    pBase: s.hp * s.rate * s.np, pRate: s.jp * s.rate * s.np,
    iBase: s.hi * s.rate * s.ni, iRate: s.ki * s.rate * s.ni,
  };
}

// ── ANCHORS: ทุนวัสดุจากชีต "คิดทุน ___" (subagent self-verify diff≈0) ────────
//   ⚠ cost = ค่าจากชีต (ห้ามแก้ตามผล engine) · mfg/inst ไม่ฝังเลข — คิดสดจาก cost + ตารางค่าแรง
//     ตามสูตรในชีตคิดทุนแต่ละใบ: ขายผลิต = ROUNDUP((ทุน+ค่าแรงผลิต)×(1+กำไร%)/100)×100
//                                 ขาย+ติดตั้ง = ขายผลิต + ROUNDUP(ค่าแรงติดตั้ง×(1+กำไร%)/100)×100
//   labor: รูปแบบค่าแรงตามสูตรจริงในชีตคิดทุนของรุ่นนั้น
//     'rate'      = ฐาน + เรต×ตร.ม.        (ค่า default — ชีตส่วนใหญ่)
//     'baseXpanel'= ฐาน × จำนวนบาน          (ชีต "คิดทุน เฟี้ยม" D64/D65)
//     'baseOnly'  = ฐานเฉย ๆ                (ชีต "คิดทุน เฟี้ยมยูโร" E46/E47)
const ANCHORS = [
  // ⚠ ฐานราคาอลูเปลี่ยนที่มา 19 ส.ค.69 (เจ้าของสั่ง): ราคาเส้น = น้ำหนักจริง × เรต ฿/กก.
  //    น้ำหนัก = ชีต "น้ำหนักโปรไฟล์" (ชั่งจริง) ไม่ใช่คอลัมน์น้ำหนักในชีตราคาสี (= ราคา ÷ 187)
  //    ชีต "คิดทุน ___" ยังเขียนราคาเก่าอยู่ (ยังไม่ซิงก์) → anchor ชุดนี้จึงต่างจากชีตคิดทุน
  //    ตัวยึดที่ตรวจเลขได้เองอยู่ที่ ②g (ราคาขาว = กก. × 187)
  { id: 'sms_slide', in: { w: 600, h: 300, p: 3, form: 'อิสระ' }, cost: 18924.11 },
  { id: 'euro_slide', in: { w: 600, h: 300, p: 3, form: 'อิสระ' }, cost: 32996.23 },   // +134 จากชีต: เจ้าของเคาะ 21 ส.ค.69 (ฉากประกอบมุม 8→12/บาน · ยาง+วาวรูน้ำ อันละ ฿5)
  { id: 'slimlux', in: { w: 200, h: 200, p: 2, form: 'อิสระ' }, cost: 7555.67 },   // +165.42: กล่อง 4 หุน เคยคิดฟรี (฿0) — เจ้าของให้ราคา ฿210/เส้น 21 ส.ค.69
  { id: 'open_door', in: { w: 150, h: 200, p: 1, form: 'มีธรณี' }, cost: 7868.02 },   // +38: ธรณีใช้ราคาไฟล์ F7938(B) 1530 แทนราคาสำรอง 1400 (pricebook คีย์ตาม sku สโตร์)   // รื้อตามไฟล์ตัดประกอบ + ใส่ราคาอุปกรณ์ตามชีตถอดทุน v9 (ค่าอุปกรณ์ = 1,638 ตรงไฟล์เป๊ะ)
  //   ต่างจากไฟล์ 27 บาท = ค่าหักลบอลูตามไฟล์ตัดประกอบ (ชีตคิดทุนไม่หัก) — ตั้งใจต่าง
  // +252 (27 ส.ค.69): ผูกรหัสสโตร์ชุดอุปกรณ์หน้าต่างทั้งชุด ตามที่เจ้าของไล่เช็ค
  //   วิทโก้ 200 -> 360 (SC-304P ราคาจริง) +320 · มือจับ 140 -> 111 (KINGBO) · CDQ 150 -> 99 · +ฉากประคองมุม 8 ตัว
  // −320 (1 ก.ย.69): เจ้าของเคาะ "ตัดออกตามใบตัด" — ถอด แกนล็อค/แป้นรับล็อค/คลิปเข้ามุม/วาวล์ระบายน้ำ/ยาง foam
  //   5 ตัวนี้ชีตถอดทุน v20 มี แต่ไฟล์ตัดประกอบ 30-7 ไม่มี → บานกระทุ้งยึดใบตัด
  { id: 'awning', in: { w: 40, h: 40, p: 1, form: 'อิสระ' }, cost: 2143.41 },
  { id: 'folding', in: { w: 180, h: 280, p: 2, form: '2บาน: รวบเปิดซ้าย (2-0)' }, cost: 18710.26, labor: 'baseXpanel' },   // +1,257 (24 ส.ค.69): เสา/เสากุญแจ/เสากุญแจมือจับ/บังใบ นับจากตาราง config ในใบตัด (SMS240_CFG) แทนที่จะเดา 2×บาน — ของเดิมนับเสาขาด
  { id: 'fixed', in: { w: 150, h: 200, p: 1, form: 'กระจกล้วน' }, cost: 4302 },
  { id: 'topslide', in: { w: 360, h: 240, p: 2, form: 'เลื่อนซ้อน' }, cost: 21358.96 },
  // ระแนง/รั้ว: ชีตขายแบบตาราง R3.9 (ไม่ใช่ทุน×2) → ตรวจเฉพาะ "ทุนวัสดุ"
  // louver = BOM cost (ชีต "คิดทุน ระแนง") · default 1.6×4 โชว์1.6 ช่องห่าง5 ไม่โครง ขาว/ดำ → pitch9.06 · ใบ27 · เส้นใบ9 × กล่อง1220 = ทุนใบ 10,980
  { id: 'louver', in: { w: 200, h: 240, p: 1, form: 'นอน' }, cost: 10980, costOnly: true },
  // ประตูรั้ว รื้อใหม่ 24 ส.ค.69 ยึดไฟล์ตัดประกอบ — ตรึงคอนฟิกให้เทียบชีตถอดทุนได้ (นอน · กล่อง 1.6×4)
  //   ต่างจากชีต 49,448 อยู่ +320 = ผลรวมของ 2 จุดที่ไฟล์ตัดกับชีตไม่ตรงกัน (ไฟล์ตัดถูก)
  //     โครง 2×4  ชีต 2 เส้น → จริง 3 เส้น (ยาวรวม 12.93 ม.)            +1,540
  //     ใบระแนง  ชีต 20 ใบ (กระจายบนสูงบาน 180) → จริง 19 ใบ (กระจายบนเสาตั้ง 164.5)  −1,220
  //   3 ก.ย.69 v20.1: −6,000 = มอเตอร์ประตูรั้ว ชีตราคาออโต้ 10,000 (เว็บเคยค้าง 16,000) → 43,768
  { id: 'gate', in: { w: 350, h: 180, p: 1, form: 'นอน', material: '1.6x4' }, cost: 43768, costOnly: true },
  // กันสาด รื้อใหม่ 27 ส.ค.69 ยึดไฟล์ตัดประกอบ JR_กันสาด ชีต "กันสาดเพิง" — โครงแตกรายท่อนออกรหัสกล่อง (ดู scripts/verify-roof.mjs)
  //   ต่างจากของเดิม 38,286 อยู่ +1,893 มาจาก 2 จุดที่คิดราคาเดิมคิดน้อยกว่าใบตัด
  //     ระยะจันทันไวนิล  ชีตถอดทุนใช้ 100 → ไฟล์ตัดใช้ 75 (เจ้าของเคาะยึดไฟล์ตัด) จันทัน 5→7 แนว, แป 24→30 ท่อน
  //     นับเส้น          เดิมเหมายาวรวม÷6ม. → จัดชิ้นลงเส้นจริง (packBars) เหมือนใบตัด/ประตูรั้ว
  //   27 ส.ค.69 อีก −15,400: แผ่นไวนิลขายเป็นแผ่นยาว 7 ม. ตัดแบ่งเอง (เจ้าของยืนยัน) 16 แถบ → ซื้อจริง 6 แผ่น
  //   +1,880: รางน้ำอลู ราคาจริง 2,273/เส้น ตามชีต (เดิมผมใส่ 393 = ราคากล่อง 1×1½ ที่อยู่บรรทัดข้าง ๆ)
  //   3 ก.ย.69 v20.1: −602 = ฝาครอบไวนิล 16→6 เส้น (1 เส้น/แผ่น · E9 หารแผ่น) −2,450 + แผ่นไวนิล ×1.2 (buf_roof ที่เว็บไม่เคยคูณ) +1,848
  { id: 'roof', in: { w: 400, h: 200, p: 1, form: 'หลังคาเพิง' }, cost: 26057 },

  // ── รุ่นใหม่ (Wave 1+2) — subagent self-verify diff≈0 ──
  { id: 'eseries', in: { w: 600, h: 300, p: 3, form: 'อิสระ' }, cost: 21636.09 },
  { id: 'velora', in: { w: 220, h: 200, p: 1, form: 'เดี่ยว', color: 'sahara', glassType: 'เทมเปอร์ใส 6มม.' }, cost: 7111.6 },
  { id: 'pcdoor', in: { w: 150, h: 200, p: 2, form: 'แบ่ง 2' }, cost: 11414.12 },   // 24 ส.ค.69 ยึดใบตัด: +คาน 1"×4 +ชนกลาง B20046 (ของจริงที่ไม่เคยคิดเงิน) · กรอบ/คิ้ว แตกรายท่อนตามกระดานคำนวณ (หักเผื่อประกอบจริง → สั้นกว่าสูตรรวม 2PH+2W เดิมเล็กน้อย)
  // ⚠ เดิม 7,962 = ค่าจากไฟล์ v9 ที่ปัดขึ้นเต็มเส้นทุกบรรทัด · v20 เปลี่ยนเป็นยาวจริง÷6.4×1.3 → 4,297.55
  { id: 'banyok', in: { w: 100, h: 50, p: 1, form: 'เดี่ยว' }, cost: 4297.55, costOnly: true },
  { id: 'fold_euro', in: { w: 180, h: 280, p: 2, form: '2บาน: 2-0 พับข้างเดียว' }, cost: 19086.36, labor: 'baseOnly' },   // +815.70 (24 ส.ค.69): แยกเส้นรายท่อนตามใบตัด + อุปกรณ์ HD ผูกราคาสโตร์
  { id: 'banklet', in: { w: 300, h: 150, p: 2, form: 'นอน' }, cost: 9842.8 },
  { id: 'curve_fixed', in: { w: 100, h: 50, p: 1, form: 'กระจกล้วน' }, cost: 4200 },
  // เปิดดัดโค้ง: ชีตตัวอย่างใช้กำไร 30% (บานสั่งร้านอื่น) → ตรวจที่กำไร 30 ให้ตรงชีต
  { id: 'curve_open', in: { w: 90, h: 240, p: 1, form: 'ดัดโค้ง', glassType: 'เทมเปอร์ 6มม.', profitPct: 30 }, cost: 17050.48 },
  // ระแนงสลับ/หมุน: ชีตขาย R3.9/รวมค่าแรง → ตรวจเฉพาะทุนวัสดุ
  { id: 'louver_slip', in: { w: 400, h: 200, p: 1, form: 'นอน' }, cost: 11685, costOnly: true },
  //   3 ก.ย.69 v20.1 ระแนงหมุน: กล่อง 1.6"×4" (1,220) → 1"×4" (905) · โชว์ 1.6" → 4" (10.16 ซม.) ใบ 57→24 · เพลา (W/600)×1.3
  //     = ใบ 8×905 7,240 + เพลา 0.43×2,208 957 + มอเตอร์ 1,800 + อุปกรณ์หมุน 200×2 + 160×24 = 4,240 → 14,236.8 (เดิม 36,708)
  { id: 'louver_rotate', in: { w: 200, h: 240, p: 1, form: 'นอน' }, cost: 14236.8, costOnly: true },
  // ฝ้าระแนงอลู 3 รุ่น — พอร์ตจาก R3.9 (ราคา/ตร.ม.) มาเป็น R4.0 ถอดทุนจริง 28 ส.ค.69
  //   BOM = โมเดลใบตัด JR_บานระแนง_v2 (กล่อง→ด้านโชว์→ช่องห่าง) ตรึงค่าตามชื่อรุ่น · กำไร วัสดุ×2 ผลิต×1.5 ติดตั้ง×2 (ท้ายชีตคิดทุนระแนง)
  //   ยืนยันความถูก: 1.6" เว้น 5 ที่ 12 ตร.ม. ออก 3,708/ตร.ม. เทียบราคาเดิม R3.9 3,700 = ตรงกันแทบเป๊ะ
  // บานยก — ยึดไฟล์ถอดทุน v20 ชีต "คิดทุน บานยก" (เจ้าของส่ง 31 ส.ค.69)
  //   100×150 เดี่ยว เขียว 6มม. อบขาว/ดำ → ทุนรวม 5,282.64 (ช่อง D31 ในไฟล์)
  //   นับเส้น = ยาวจริง ÷ 6.4 × 1.3 (buf_scrap) ไม่ใช่ปัดเต็มเส้น
  { id: 'banyok', in: { w: 100, h: 150, p: 1, form: 'เดี่ยว', glassType: 'เขียว 6มม.' }, cost: 5282.64, costOnly: true },
  { id: 'ceil_ranae_1x5', in: { w: 300, h: 400, p: 1, form: 'มาตรฐาน' }, cost: 17000, costOnly: true },
  { id: 'ceil_ranae_16_5', in: { w: 300, h: 400, p: 1, form: 'มาตรฐาน' }, cost: 13095, costOnly: true },
  { id: 'ceil_ranae_16_2', in: { w: 300, h: 400, p: 1, form: 'มาตรฐาน' }, cost: 21825, costOnly: true },
  // กลาสเฮ้าส์ (เพิงตรง) — เส้นอลูดึงจากใบตัด JR_กลาสเฮ้าส์ · ต้องส่ง aluLines/consumLines เข้ามา
  //   จึงตรวจแยกในบล็อก ⑦ ข้างล่าง ไม่ใช่ anchor ปกติ
  // หลังคาจั่ว รื้อใหม่ 27 ส.ค.69 ยึดใบตัด "หลังคาจั่วตรง" — โครงแตกรายท่อนออกรหัสกล่อง (ดู scripts/verify-roof.mjs ⑤)
  //   ต่างจากของเดิม 50,936 อยู่ −1,239 มาจาก 3 จุด
  //     จันทัน       เดิม 2×แนว×⌈เฉียง/6ม.⌉ = 6 เส้น → จัดชิ้นลงเส้นจริง 4 เส้น            −2,440
  //     คานตัว T     เดิมเหมา ⌈แนว/2⌉ เส้น → ใบตัดแยก คานนอน + เสาตั้ง ตามจริง             +2,335
  //     ระยะจันทันไวนิล 100 → 75 ตามใบตัด (แนว 3 → 4) + แป/รัดรอบ/รางน้ำ ตามใบตัด          −1,134
  //   27 ส.ค.69 อีก −12,320: แผ่นไวนิลตัดจากแผ่นยาว 7 ม. (16 แถบ → 8 แผ่น · แถบยาวเท่าเฉียง 250)
  //   +3,760: รางน้ำอลู 2 เส้น ราคาจริง 2,273 (เดิม 393)
  //   3 ก.ย.69 v20.1: +504 = แผ่นไวนิล 8 แผ่น ×1.2 (+2,464) − ฝาครอบไวนิล 16→8 เส้น (1 เส้น/แผ่น · −1,960)
  { id: 'roof_gable', in: { w: 400, h: 200, p: 1, form: 'หลังคาจั่ว' }, cost: 41641 },
  // หลังคาเลื่อน รื้อใหม่ 27 ส.ค.69 ยึดชีต "คิดทุน หลังคาเลื่อน" (ไม่มีไฟล์ตัดประกอบ — เจ้าของยืนยัน)
  //   ตรวจเฉพาะทุนวัสดุ · ค่าแรงเช็คแยกใน verify-roof-slide.mjs · มอเตอร์เป็น addon บวกยอดขายทีหลัง
  //   ต่างจากของเดิม 88,836 มาจาก 4 จุดที่เว็บไม่ตรงชีต
  //     แผ่นไวนิล   นับ 1 แถบ = 1 แผ่น → ชีตตัดจากแผ่นยาว 7 ม. ได้หลายแถบ (ติดตาย 16→6 แผ่น)
  //     ราง        ปัดขึ้นเต็มเส้น 2 เส้น → ชีตคิดตามสัดส่วน + เผื่อเศษ 30% (8,160 → 2,652)
  //     ค่าแรง     ฝังเป็นบรรทัดวัสดุ 15.4/ตร.ม. = 193 บาททั้งงาน → ตารางค่าแรงจริง 804/1,530 ต่อ ตร.ม.
  //     ส่วนเลื่อน  ตรึง 150×150 → กรอกได้ (ยังเหลือต่างชีต 660 = กล่องเหล็ก 1×1 สโตร์ 110 vs ชีต 170)
  { id: 'roof_slide', in: { w: 400, h: 200, p: 2, form: 'เลื่อนยื่น', addons: { slide_motor: { kw: '80' } } }, cost: 55592, costOnly: true },   // 3 ก.ย.69 v20.1: −1,330 = ฝาครอบไวนิล 1 เส้น/แผ่น (ติดตาย 16→6 · เลื่อน) − แผ่น ×1.2 buf_roof   // 50,722 + มอเตอร์ 80 กก. 6,200 (ราคา 4,500 + ค่าส่ง 1,700 ตรงชีต D13)
  // มุ้ง: ทุนวัสดุตรง (ค่าแรงต่างชีตที่คิดต่อใบ)
  { id: 'screen', in: { w: 600, h: 300, p: 3, form: 'อิสระ' }, cost: 3689, costOnly: true },
];

// ── ANCHOR ชุดที่ 2: ทุนวัสดุ @150×150 ซม. จากชีต "บันทึกราคาขึ้น" ───────────
//   ทำไมต้องมี: anchor ชุดแรกตรวจรุ่นละ 1 ขนาด — ทุนต่อ ตร.ม. ไม่คงที่ (มีของตายตัวอย่างราง/มือจับ)
//   ขนาดเดียวจึงจับบั๊กที่โผล่เฉพาะบางขนาด/บางสีไม่ได้ (เจอจริง: Velora สีขาวไม่คิดค่าอบ — anchor เดิมใช้สีเทาเลยรอด)
//   ชีตนี้ล็อกทุนวัสดุจริงไว้ที่ 150×150 ทุกรุ่น = จุดยึดที่ 2 ฟรี ๆ จากไฟล์
//   ⚠ ไม่ใส่ เฟี้ยม/เฟี้ยมยูโร — ชีตเขียนกำกับเองว่า "สูตร live ประมาณ" (ไม่ใช่เลขเป๊ะ)
const ANCHORS150 = [
  { id: 'sms_slide', in: { p: 2, form: 'อิสระ' }, cost: 5414.95 },   // 9,190.85 − 285 (ยึดราคาสี/สโตร์)
  { id: 'euro_slide', in: { p: 2, form: 'อิสระ' }, cost: 8491.93 },   // +36 จากชีต (ฉาก 12/บาน + ยาง/วาวรูน้ำ ฿5) — เจ้าของเคาะ 21 ส.ค.69
  { id: 'eseries', in: { p: 2, form: 'อิสระ' }, cost: 7060.06 },
  { id: 'velora', in: { p: 2, form: 'เดี่ยว', color: 'white' }, cost: 7045.15 },   // ใบตัด: 1 บาน = 1 ชุดวงกบ (ไม่ใช้วงกบร่วม) — เจ้าของสั่งยึดใบตัด 21 ส.ค.69      // สีขาว = ต้องมีค่าอบเรตเทา (rawAlu)
  { id: 'velora', in: { p: 2, form: 'เดี่ยว', color: 'sahara' }, cost: 7045.15 },     // เทา = เท่ากันเป๊ะตามสูตรชีต
  { id: 'open_door', in: { p: 2, form: 'มีธรณี' }, cost: 9624.99 },   // F7938 ราคาไฟล์ 1530
  { id: 'pcdoor', in: { p: 1, form: 'แบ่ง 2', spec: { pcsill: 'มีธรณี', pcsoft: 'ใส่' } }, cost: 8120.75 },   // 24 ส.ค.69: +คาน +ชนกลาง B20046 · กรอบ/คิ้วแตกรายท่อนตามใบตัด
  { id: 'awning', in: { p: 1, form: 'อิสระ' }, cost: 5305.39 },   // −364: ถอด 5 รายการที่ใบตัดไม่มี (เจ้าของเคาะ 1 ก.ย.69)
  { id: 'banyok', in: { p: 1, form: 'เดี่ยว' }, cost: 6098.14 },   // ขนาดดีฟอลต์ 100×150 (v20)
  { id: 'fixed', in: { p: 1, form: 'กระจกล้วน' }, cost: 4004 },
  { id: 'topslide', in: { p: 2, form: 'เลื่อนซ้อน' }, cost: 12897 },
  { id: 'curve_fixed', in: { p: 1, form: 'กระจกล้วน' }, cost: 5100 },
];

// ── ① ค่าแรงใน pricebook ต้องตรงชีต "ค่าแรง" เป๊ะ ────────────────────────────
//   ถ้าใครแก้ pricebook.LABOR ด้วยมือโดยไม่แก้ไฟล์ → ตรงนี้แดงทันที
console.log('═══ ① ค่าแรงใน pricebook ↔ ชีต "ค่าแรง" (ถอดทุน_รวมทั้งหมด.xlsx) ═══');
for (const [key, src] of Object.entries(LABOR_SRC)) {
  const want = laborFromSheet(src);
  const got = PB.LABOR[key];
  if (!got) { console.log(`  ❌ ${key}: ไม่มีคีย์นี้ใน pricebook.LABOR`); fail++; continue; }
  const bad = ['pBase', 'pRate', 'iBase', 'iRate'].filter((k) => Math.abs((got[k] ?? 0) - want[k]) > 0.5);
  const fmt = (o) => `ผลิต ${o.pBase}+${o.pRate}/ตร.ม. · ติดตั้ง ${o.iBase}+${o.iRate}/ตร.ม.`;
  if (bad.length) { console.log(`  ❌ ${key}: got ${fmt(got)}  want ${fmt(want)}  <-- ${bad.join(',')} ไม่ตรงไฟล์`); fail++; }
  else { console.log(`  ✅ ${key}: ${fmt(want)}`); pass++; }
}

console.log('\n═══ ② ด่านตรวจราคา R4.0 (engine ↔ xlsx) — ' + ANCHORS.length + ' รุ่น ═══\n');
const ceil100 = (n) => Math.ceil(n / 100) * 100;
for (const a of ANCHORS) {
  const prod = PRODUCTS[a.id];
  if (!prod) { console.log('❌ ไม่พบรุ่น', a.id); fail++; continue; }
  const r = computeCost(PB, prod, a.in);
  console.log(`▶ ${prod.name} (${a.in.w}×${a.in.h} ${a.in.p}บาน):`);
  check('ทุนรวม', r.cost.total, a.cost, 1);
  if (a.costOnly) { console.log('     (ขายใช้ตาราง R3.9 / มี add-on — ข้าม · ทุนวัสดุตรวจแล้ว)'); continue; }

  // คาดคะเนราคาขาย "จากไฟล์" ล้วน ๆ: ทุนชีต + ค่าแรงชีต + สูตรในชีตคิดทุน — ไม่แตะผลลัพธ์ engine
  const L = laborFromSheet(LABOR_SRC[prod.laborKey] ?? {});
  const area = (a.in.w * a.in.h) / 10000;
  const shape = a.labor || 'rate';
  const lp = shape === 'baseXpanel' ? a.in.p : 1;
  const rateOn = shape === 'rate' ? 1 : 0;
  const wProd = Math.max(0, L.pBase + L.pRate * area * rateOn) * lp;
  const wInst = Math.max(0, L.iBase + L.iRate * area * rateOn) * lp;
  // กำไรแยก 3 ส่วน ตามบล็อก "⚙ ตั้งค่ากำไร" ท้ายชีตคิดทุน (ไฟล์ v9)
  //   ปัดร้อย "ทีละก้อน" — วัสดุ / ค่าแรงผลิต / ค่าแรงติดตั้ง (ตรวจตรงเป๊ะกับชีต SMS + ยูโร)
  const DP = PB.PROFIT[a.id] ?? PB.PROFIT.__default;
  const pM = a.in.profitPct ?? DP.mat, pP = a.in.profitPct ?? DP.prod, pI = a.in.profitPct ?? DP.inst;
  const wantMat = ceil100(a.cost * (1 + pM / 100));
  const wantMfg = wantMat + ceil100(wProd * (1 + pP / 100));
  const wantInst = wantMfg + ceil100(wInst * (1 + pI / 100));
  check(`ค่าแรงผลิต (${shape})`, r.labor.prod, Math.round(wProd * 100) / 100, 1);
  check('ค่าแรงติดตั้ง', r.labor.install, Math.round(wInst * 100) / 100, 1);
  check('ขายผลิตอย่างเดียว (ตามชีต)', r.sell.mfgOnly, wantMfg, 1);
  check('ขายผลิต+ติดตั้ง', r.sell.withInstall, wantInst, 1);
  // ราคาขายส่ง = ยอดผลิตอย่างเดียว ลดอีก WHOLESALE_DISCOUNT_PCT (นโยบายขาย ไม่ใช่สูตรทุน)
  check(`ขายส่ง (ลด ${PB.WHOLESALE_DISCOUNT_PCT}%)`, r.sell.mfgOnlyNet, ceil100(wantMfg * (1 - (PB.WHOLESALE_DISCOUNT_PCT || 0) / 100)), 1);
}

// ── เทสพฤติกรรมกลาง ─────────────────────────────────────────────────────────
console.log('\n═══ เทสพฤติกรรม cost engine ═══');
console.log('▶ แก้อลู SMS 187→200 (กระจก/อุปกรณ์ต้องนิ่ง):');
{
  const base = computeCost(PB, PRODUCTS.sms_slide, { w: 600, h: 300, p: 3, form: 'อิสระ' });
  const PB2 = JSON.parse(JSON.stringify(PB)); PB2.ALU.SMS = 200;
  const r = computeCost(PB2, PRODUCTS.sms_slide, { w: 600, h: 300, p: 3, form: 'อิสระ' });
  check('ทุนอลู = 12325.71×200/187', r.cost.alu, 12325.71 * 200 / 187, 1);   // ฐานขาว SMS (นับเส้นแบบไฟล์ + เฟรมข้าง 2 ด้าน · 20 ส.ค.69)
  check('กระจกนิ่ง', r.cost.glass, base.cost.glass, 0.01);
  check('อุปกรณ์นิ่ง', r.cost.hardware + r.cost.consum, base.cost.hardware + base.cost.consum, 0.01);
  check('ราคาแพงขึ้น (36100→' + r.sell.withInstall + ')', r.sell.withInstall > base.sell.withInstall ? 1 : 0, 1, 0);
}
console.log('▶ จำนวนบานมากขึ้นแพงขึ้น (SMS 600×300):');
{
  const p2 = computeCost(PB, PRODUCTS.sms_slide, { w: 600, h: 300, p: 2, form: 'อิสระ' });
  const p4 = computeCost(PB, PRODUCTS.sms_slide, { w: 600, h: 300, p: 4, form: 'อิสระ' });
  check('4บาน(' + p4.cost.total + ') > 2บาน(' + p2.cost.total + ')', p4.cost.total > p2.cost.total ? 1 : 0, 1, 0);
}
console.log('▶ กำไร 100% = ceil100(ทุน×2):');
{
  const r = computeCost(PB, PRODUCTS.sms_slide, { w: 600, h: 300, p: 3, form: 'อิสระ', profitPct: 100 });
  check('ขายก่อนค่าแรง', r.sell.beforeLabor, Math.ceil(r.cost.total * 2 / 100) * 100, 0);
}

// ── ระแนง/ประตูรั้ว: ระยะ@ (ช่องห่าง) + กล่อง + โครง (ตรงชีต Excel) ─────────────
//   ล็อกว่า: UI-seeded default = golden เดิม · ห่างมาก→ใบน้อยลง→ถูกลง · ถี่ขึ้น→แพงขึ้น
console.log('▶ ระแนงบังตา — ระยะ@/กล่อง/โครง (200×240 นอน):');
{
  const L = (spec) => computeCost(PB, PRODUCTS.louver, { w: 200, h: 240, p: 1, form: 'นอน', spec }).cost.total;
  check('UI default spec = golden 10980', L({ rnBox: '1.6x4', rnFace: '4.06', rnGap: '5', rnFrame: 'ไม่รวมโครง' }), 10980, 1);
  check('ระยะ@15 (ห่างขึ้น→ใบน้อยลง)', L({ rnGap: '15' }), 6100, 1);
  check('ระยะ@2 (ถี่ขึ้น→ใบเยอะขึ้น)', L({ rnGap: '2' }), 17080, 1);
  check('กล่อง 1×1 (ถูกกว่า 1.6×4)', L({ rnBox: '1x1' }), 2790, 1);
  check('รวมโครง = +โครงดาม 485', L({ rnFrame: 'รวมโครง' }), 11465, 1);
}
console.log('▶ ประตูรั้ว — ระยะ@ ระแนง (350×180 นอน):');
{
  const G = (spec) => computeCost(PB, PRODUCTS.gate, { w: 350, h: 180, p: 1, form: 'นอน', material: '1.6x4', spec }).cost.total;
  // 3 ก.ย.69 v20.1: ทั้ง 3 ค่า −6,000 = มอเตอร์ประตูรั้ว 16,000 → 10,000 (ชีตราคาออโต้)
  check('UI default spec = golden 43768', G({ rnFace: '4.06', rnGap: '5', drive: 'มอเตอร์อัตโนมัติ', gaterail: 'รางใหม่' }), 43768, 1);
  check('ระยะ@15 (ห่างขึ้น→ใบน้อยลง→ถูกลง)', G({ rnGap: '15' }), 31568, 1);
  check('ระยะ@2 (ถี่ขึ้น→ใบเยอะ→แพงขึ้น)', G({ rnGap: '2' }), 54748, 1);
}
// ระแนงสลับ (คละกล่อง 2 แบบ) — เลือกกล่อง A/B + ด้านโชว์ + จำนวน/ชุด + ระยะห่างเป้า + โครง (ตรงชีต "คิดทุน ระแนงสลับ")
console.log('▶ ระแนงสลับ — คละกล่อง/ระยะ/โครง (400×200 นอน):');
{
  const P = PRODUCTS.louver_slip;
  const def = {}; (P.specOpts || []).forEach((o) => { def[o.key] = o.def; });
  const S = (spec) => computeCost(PB, P, { w: 400, h: 200, p: 1, form: 'นอน', spec: { ...def, ...spec } }).cost.total;
  check('UI default spec = golden 11685', S({}), 11685, 1);
  check('ระยะห่างเป้า 6 (ห่างขึ้น→ท่อนน้อยลง→ถูกลง)', S({ rnGap: '6' }), 8275, 1);
  check('รวมโครง = +โครงดาม', S({ rnFrame: 'รวมโครง' }), 12655, 1);
  check('กล่อง A→1×1 (ถูกลง)', S({ boxA: '1x1', showA: '2.54' }), 9580, 1);
  check('คละ 4ต่อ4', S({ cntA: '4', cntB: '4' }), 11935, 1);
}

// ── ② ตาข่ายกันพังทุกรุ่น: ทุก product ต้องคิดออกราคาสมเหตุผล (ไม่ crash/NaN/ติดลบ/ขาย<ทุน) ──
// เสริม anchor (แม่นเฉพาะ 24 รุ่น) → sweep นี้คลุม "ทุกรุ่น" กันราคาพังเงียบ (รุ่นที่ไม่มี anchor)
// ── ②b ทุนวัสดุที่ขนาดที่ 2 (150×150) + ตัวคูณต่อขนาด ─────────────────────────
console.log('\n═══ ②b ทุนวัสดุ @150×150 ↔ ชีต "บันทึกราคาขึ้น" (จุดยึดขนาดที่ 2) ═══');
for (const a of ANCHORS150) {
  const prod = PRODUCTS[a.id];
  if (!prod) { console.log('❌ ไม่พบรุ่น', a.id); fail++; continue; }
  const r = computeCost(PB, prod, { w: 150, h: 150, ...a.in });
  check(`${prod.name}${a.in.color ? ' (' + a.in.color + ')' : ''} ${a.in.p}บาน`, r.cost.total, a.cost, 1);
}

// ── ②c ราคาต้องขึ้นตามขนาด (ตัวคูณต่อ ตร.ม. ไม่เท่ากันทุกขนาด — เจ้าของสั่งให้เช็ค) ──
//   ทุนต่อ ตร.ม. ต้องลดเมื่อบานใหญ่ขึ้น (ของตายตัวเฉลี่ยได้มากขึ้น) · ราคารวมต้องเพิ่มเสมอ
console.log('\n═══ ②c ไล่ราคาหลายขนาดต่อรุ่น (ใหญ่ขึ้น→แพงขึ้น · ทุน/ตร.ม. ถูกลง) ═══');
for (const [id, form] of [['sms_slide', 'อิสระ'], ['euro_slide', 'อิสระ'], ['open_door', 'มีธรณี'], ['fixed', 'กระจกล้วน']]) {
  const prod = PRODUCTS[id];
  const sizes = [[140, 150, 2], [200, 200, 2], [240, 200, 2], [270, 300, 3], [390, 300, 3], [600, 300, 3]]
    .filter((s) => s[2] <= (prod.maxP ?? 9) && s[2] >= (prod.minP ?? 1));
  // เกณฑ์: ① ใหญ่ขึ้นราคารวมต้องเพิ่มเสมอ (เข้ม)
  //        ② ทุน/ตร.ม. ตัวใหญ่สุดต้องถูกกว่าตัวเล็กสุด (ดูแนวโน้มรวม ไม่ไล่ทีละขั้น)
  //           — ไล่ทีละขั้นใช้ไม่ได้ เพราะบางรุ่นมีเส้นที่โผล่เฉพาะขนาดใหญ่ (ยูโร: โหนกเกี่ยว ≥3ม.)
  let prevSell = -1, firstPer = null, lastPer = null, ok = true, detail = [];
  for (const [w, h, p] of sizes) {
    const r = computeCost(PB, prod, { w, h, p, form });
    const per = r.cost.total / r.input.area;
    if (r.sell.withInstall <= prevSell) { ok = false; detail.push(`${w}×${h} ราคารวมไม่เพิ่ม`); }
    prevSell = r.sell.withInstall;
    if (firstPer == null) firstPer = per;
    lastPer = per;
  }
  if (!(lastPer < firstPer)) { ok = false; detail.push(`ทุน/ตร.ม. ไม่ถูกลงเมื่อบานใหญ่ขึ้น (${Math.round(firstPer)}→${Math.round(lastPer)})`); }
  check(`${prod.name} — ${sizes.length} ขนาด${detail.length ? ' · ' + detail.join(' · ') : ''}`, ok ? 1 : 0, 1, 0);
}

// ── ②d ราคาตามสี: เส้นที่มีราคาสีในตาราง ใช้ราคานั้น · เส้นที่ไม่มี ใช้ ขาว+ค่าอบ×กก. ─
//   ชีตคิดทุนผสม 2 แบบจริง (SMS/ยูโร VLOOKUP คอลัมน์สี · บานเปิด F7863/F7864 ใช้ +rate_grey×กก.)
//   คิดคาดหวังเองจาก BOM สีขาว + ตาราง PB.ALUCOLOR/PB.BAKE → ไม่พึ่งสาขาสีของ engine
//   ⚠ ค่าคาดหวังตรึงไว้ (ห้ามคิดสดจาก PB.ALUCOLOR — จะกลายเป็นด่านหลอก ลบตารางสีแล้วยังเขียว)
//   ที่มาของเลข: ทุนสีขาว + Σ บาร์×(ราคาสี−ราคาขาว) จากชีต "ราคาสี" คอลัมน์ E/H
//                + Σ บาร์×กก.×ค่าอบ สำหรับเส้นที่ชีตไม่ได้ VLOOKUP (เช่น F7863/F7864 ของบานเปิด)
console.log('\n═══ ②d ราคาตามสี (เทาซาฮาร่า / ลายไม้สต็อค) ═══');
const ANCHORS_COLOR = [
  // SMS ขยับ −285 ทุกสีเท่ากัน (ฐานขาวเปลี่ยน · ตารางราคาสีเท่าเดิม) — ยึดชีตราคาสี v9
  ['sms_slide', { w: 150, h: 150, p: 2, form: 'อิสระ' }, { white: 5414.95, sahara: 5723.42, woodStock: 7560.96 }],
  ['euro_slide', { w: 150, h: 150, p: 2, form: 'อิสระ' }, { white: 8491.93, sahara: 8923.34, woodStock: 11177.57 }],   // +36 ทุกสี · +324 ชิ้นส่วนมือจับ (1 ก.ย.69) — ของที่เพิ่มไม่ขึ้นกับสี
  ['open_door', { w: 150, h: 150, p: 2, form: 'มีธรณี' }, { white: 9624.99, sahara: 11924.07, woodStock: 13191.78 }],   // sahara ลด: ธรณีใช้ราคาสีสำเร็จจากไฟล์ (1635) แทน ขาว+ค่าอบ
];
for (const [id, inp, want] of ANCHORS_COLOR) {
  const prod = PRODUCTS[id];
  for (const col of ['white', 'sahara', 'woodStock']) {
    const KEY = { white: 'white', sahara: 'sahara', woodStock: 'wood_teak' };
    const r = computeCost(PB, prod, { ...inp, color: col, colorKey: KEY[col] });
    const up = Math.round((r.cost.total / want.white - 1) * 1000) / 10;
    check(`${prod.name} ${col}${col === 'white' ? '' : ' (+' + up + '% จากขาว)'}`, r.cost.total, want[col], 1);
  }
}

// ── ②e ราง 2 แบบ ต้องใช้เฟรมล่าง+ตบราง คนละรหัส (เจ้าของยืนยัน 8 ส.ค.69) ──────
//   รางกันน้ำ (นอก) = B20041 + F7994 · รางเตี้ย (งานใน) = B20047 + B20050
//   ของเดิมเลือกรางแล้ววัสดุไม่เปลี่ยนเลย → รางเตี้ยคิดราคาเฟรมล่างกันน้ำ แพงเกิน
console.log('\n═══ ②e ราง กันน้ำ / เตี้ย ต้องสลับวัสดุจริง ═══');
{
  const codesOf = (spec) => {
    const r = computeCost(PB, PRODUCTS.sms_slide, { w: 300, h: 220, p: 3, form: 'อิสระ', spec });
    const out = new Set();
    for (const l of r.lines.filter((x) => x.cat === 'alu')) {
      const it = PRODUCTS.sms_slide.alu.find((a) => l.name.startsWith(a.name));
      if (it?.code && l.qty > 0) out.add(it.code);
    }
    return { codes: out, cost: r.cost.total };
  };
  const out = codesOf({ bottomrail: 'รางกันน้ำ' });
  const low = codesOf({ bottomrail: 'รางเตี้ย (งานใน)' });
  check('รางกันน้ำ ใช้ B20041 (เฟรมล่างกันน้ำ)', out.codes.has('B20041') ? 1 : 0, 1, 0);
  check('รางกันน้ำ ใช้ F7994 (ตบรางล้อ)', out.codes.has('F7994') ? 1 : 0, 1, 0);
  check('รางกันน้ำ ต้องไม่มี B20047/B20050', (out.codes.has('B20047') || out.codes.has('B20050')) ? 0 : 1, 1, 0);
  check('รางเตี้ย ใช้ B20047 (เฟรมล่างภายใน)', low.codes.has('B20047') ? 1 : 0, 1, 0);
  check('รางเตี้ย ใช้ B20050 (ตบปิดรางเตี้ย)', low.codes.has('B20050') ? 1 : 0, 1, 0);
  check('รางเตี้ย ต้องไม่มี B20041/F7994', (low.codes.has('B20041') || low.codes.has('F7994')) ? 0 : 1, 1, 0);
  check('รางเตี้ยต้องถูกกว่ารางกันน้ำ (ต่าง 851)', Math.round(out.cost - low.cost), 851, 1);
  check('ไม่ระบุราง = รางกันน้ำ (ค่ามาตรฐาน)', codesOf({}).cost, out.cost, 0.01);
}

// ── ②f เส้นสีเงินไม่อบสี (F7994) — ราคาเดียวทุกสี ห้ามบวกค่าอบ ─────────────────
console.log('\n═══ ②f F7994 ตบรางล้อ สีเงิน — ราคาเดียวทุกสี ═══');
{
  check('อยู่ในรายการไม่คิดค่าสี', (PB.ALUCODE_NOCOLOR || []).includes('F7994') ? 1 : 0, 1, 0);
  // SMS สีเทา: ค่าอบต้องมาจาก B20001+B20003 เท่านั้น (2 เส้นที่ยังไม่มีราคาสี)
  //   ถ้า F7994 (3 เส้น × 0.833 กก.) หลุดเข้าไปด้วย ค่าอบจะเกินมา 250 บาท
  const smsBake = computeCost(PB, PRODUCTS.sms_slide, { w: 300, h: 220, p: 3, form: 'อิสระ', color: 'sahara' }).cost.bake;
  check('ค่าอบ SMS สีเทา = เฉพาะ B20001+B20003 (F7994 ไม่ปน)', Math.round(smsBake * 100) / 100, Math.round((barsNeeded(3, 1, 6.4, true) * 6.86111 + barsNeeded(2.2, 2, 6.4, true) * 5.80556) * 100 * 100) / 100, 0.5);
  const f = PRODUCTS.euro_slide.alu.find((a) => a.code === 'F7994');
  const white = computeCost(PB, PRODUCTS.euro_slide, { w: 600, h: 300, p: 3, form: 'อิสระ', color: 'white' });
  const line = white.lines.find((l) => l.name.startsWith(f.name));
  for (const c of ['sahara', 'woodStock', 'special']) {
    const r = computeCost(PB, PRODUCTS.euro_slide, { w: 600, h: 300, p: 3, form: 'อิสระ', color: c });
    check(`ราคาต่อเส้น F7994 สี ${c} = เท่าสีขาว`, r.lines.find((l) => l.name.startsWith(f.name)).unitPrice, line.unitPrice, 0.01);
  }
}

// ── ③ สวิตช์ "คิดค่าแรงแบบไหน" ในหน้าคิดราคา — ราคาที่ขึ้นใบต้องเปลี่ยนตามจริง ──
//   เคยพลาดมาแล้ว: ทำปุ่มสวย ๆ แต่ลืมต่อสาย → กดแล้วราคาไม่ขยับ · ตรงนี้อ่านซอร์สจริง
// ── ②g ราคาแยกสีจริงจากไฟล์ v9 (ALUCOLOR_KEY) — เจ้าของเคาะ 19 ส.ค.69 "เอา" ──
//   ค่าตรึงจากชีต "ราคาสี" v9 บล็อก "ปัจจุบัน" (คอลัมน์ L–R) · ห้ามคิดสดจาก PB (ลบตารางแล้วต้องแดง)
console.log('\n═══ ②g ราคาเส้นแยกสีจริง 6 สี (ไฟล์ v9 ชีตราคาสี) ═══');
{
  const WANT = {
    B20001: { sahara: 1272.6, sahara_black: 1272.6, aztec: 2250.2, wood_teak: 1896, wood_maho: 2356.2, wood_whiteoak: 2356.2 },
    B20003: { sahara: 986.9, sahara_black: 986.9, aztec: 1740, wood_teak: 1449.2, wood_maho: 1822.1, wood_whiteoak: 1822.1 },
    B20041: { sahara: 2342.7, wood_teak: 3557.2 },
  };
  for (const [code, m] of Object.entries(WANT))
    for (const [col, px] of Object.entries(m))
      check(code + ' ' + col, PB.ALUCOLOR_KEY?.[col]?.[code], px, 0.01);
  // ราคาขาว = น้ำหนักจริง (ชีต "น้ำหนักโปรไฟล์") × เรต 187 ฿/กก. — เลขตรวจเองได้จากไฟล์
  check('ฐานขาว B20001 = 6.25 กก. × 187', PB.ALUCODE?.B20001, 6.25 * 187, 0.05);
  check('ฐานขาว B20003 = 4.833 กก. × 187', PB.ALUCODE?.B20003, 4.833 * 187, 0.05);
  check('ฐานขาว B20041 = 11.5 กก. × 187', PB.ALUCODE?.B20041, 11.5 * 187, 0.05);
  check('ครบ 6 สี', Object.keys(PB.ALUCOLOR_KEY ?? {}).length, 6, 0);
  check('ไม่ดึงระบบราคาประเมิน — SlimLux WM-K04 ต้องไม่โผล่', PB.ALUCOLOR_KEY?.sahara?.['WM-K04'] == null ? 1 : 0, 1, 0);
  check('ไม่ดึง E-series — E-03 ต้องไม่โผล่', PB.ALUCOLOR_KEY?.sahara?.['E-03'] == null ? 1 : 0, 1, 0);
  check('SlimLux ราคาขาวไม่ถูกทับด้วยราคาประเมิน', PB.ALUCODE?.['WM-K04'] == null ? 1 : 0, 1, 0);

  const sell = (key, bake) => computeCost(PB, PRODUCTS.sms_slide,
    { w: 600, h: 300, p: 3, form: 'อิสระ', color: bake, colorKey: key }).sell.withInstall;
  const teak = sell('wood_teak', 'woodStock'), maho = sell('wood_maho', 'woodStock');
  check('ลายไม้สักทอง ≠ มะฮอกกานี (แยกราคาได้แล้ว)', maho > teak ? 1 : 0, 1, 0);
  // 3 ก.ย.69 ทุกตัว +3,200 = ค่าแรง SMS ตามไฟล์ v20.1 (ผลิต 787.5+43.31 · ติดตั้ง 1,225+29.75)
  //   เดิมเป็นค่าแรงจากไฟล์ ถอดทุน_รวมทั้งหมด.xlsx ตัวแรก · ทุนวัสดุไม่ขยับ (ด่านทุนอยู่ ANCHORS)
  check('SMS ลายไม้สักทอง', teak, 61100, 1);
  check('SMS มะฮอกกานี', maho, 70400, 1);
  check('SMS เทาซาฮาร่า', sell('sahara', 'sahara'), 48500, 1);
  check('SMS สีขาว', sell('white', 'white'), 46400, 1);

  const az = computeCost(PB, PRODUCTS.sms_slide, { w: 600, h: 300, p: 3, form: 'อิสระ', color: 'special', colorKey: 'aztec' });
  check('Aztec: ค่าเปิดตู้อบยังคิดอยู่ (คงที่ ไม่ผูก กก.)', az.cost.openOven, PB.BAKE_OPEN_OVEN, 0.01);
  check('Aztec: ไม่คิดค่าอบซ้ำ (ราคาสีรวมค่าอบแล้ว)', az.cost.bake, 0, 0.01);
  check("น้ำหนัก กก./เส้น (ชีตน้ำหนักโปรไฟล์ = ชั่งจริง)", Object.keys(PB.ALUWEIGHT ?? {}).length, 130, 0);
  check("น้ำหนัก B20001 = 6.25 กก./เส้น (ไม่ใช่ 6.016 ที่เป็นราคา÷187)", PB.ALUWEIGHT?.B20001, 6.25, 0.001);
  // ── 3 รหัสที่น้ำหนักในชีตไม่ใช่ของชั่งจริง → ถอดจาก "ราคาลายไม้สักทอง" ที่เจ้าของแจ้ง 19 ส.ค.69
  //    วิธี: ลายไม้แพงกว่าขาวกี่เท่า (ของรหัสนั้นเอง) × 187 = เรตลายไม้ ฿/กก. · น้ำหนัก = ราคาจริง ÷ เรต
  //    ราคาลายไม้ที่คิดออกมาต้องเท่าที่เจ้าของบอกเป๊ะ ไม่งั้นแปลว่าถอดผิด
  for (const [code, teak] of Object.entries({ F7988: 120, F7986: 360, F7935: 630 }))
    check(`${code} ลายไม้สักทอง = ${teak} ฿ (ราคาจริงจากเจ้าของ)`, PB.ALUCOLOR_KEY?.wood_teak?.[code], teak, 0.5);
  check("F7935 น้ำหนักถอดใหม่ 2.424 (ชีตเขียน 0.285 = ไม่ใช่ของชั่ง)", PB.ALUWEIGHT?.F7935, 2.424, 0.002);
  check("F7986 น้ำหนักถอดใหม่ 1.03 (ชีตเขียน 1.5)", PB.ALUWEIGHT?.F7986, 1.03, 0.002);
  check("F7988 น้ำหนักถอดใหม่ 0.377 (ชีตเขียน 0.667)", PB.ALUWEIGHT?.F7988, 0.377, 0.002);
}

// ── ②h กำไรแยก 3 ส่วน (ไฟล์ v9 บล็อก "⚙ ตั้งค่ากำไร" ท้ายชีตคิดทุนทุกใบ) ──
//   ค่าตรึงจากไฟล์: SMS 100/100/200 · ยูโร 80/100/200 · SlimLux 120/100/200 · หลังคา/ระแนง 100/50/100
//   ⚠ หลังคา/ระแนง เคยตั้งกำไรค่าของ = 0 ซึ่งไม่ตรงไฟล์ (ชีต "คิดทุน หลังคา" เขียน ราคาขาย = ทุน×2
//     ชีต "คิดทุน ระแนงหมุน" เขียน วัสดุ×2) — เว็บบังเอิญคิด 100 อยู่แล้วเพราะบั๊ก Number(x)||100
//     แก้ข้อมูลให้ตรงไฟล์ 28 ส.ค.69 → ราคาบนเว็บไม่ขยับ แต่ตัวเลขกับไฟล์ตรงกันจริง
//   สูตร: ปัดร้อย "ทีละก้อน" ไม่ใช่ปัดทีเดียวตอนท้าย
console.log("\n═══ ②h กำไรแยก 3 ส่วน — ค่าของ / ค่าผลิต / ค่าติดตั้ง ═══");
{
  const WANT = {
    sms_slide: [100, 100, 200], euro_slide: [80, 100, 200], slimlux: [120, 100, 200],
    fixed: [120, 100, 200], velora: [120, 100, 200], pcdoor: [120, 100, 200],
    roof: [100, 50, 100], louver_rotate: [100, 50, 100],
  };
  for (const [id, [m, p, i2]] of Object.entries(WANT)) {
    const t = PB.PROFIT?.[id];
    check(`${id} กำไร ของ/ผลิต/ติดตั้ง = ${m}/${p}/${i2}`,
      t ? (t.mat === m && t.prod === p && t.inst === i2 ? 1 : 0) : 0, 1, 0);
  }
  check("มีค่าตั้งต้นกลางไว้ให้รุ่นที่ยังไม่ได้ตั้ง", PB.PROFIT?.__default?.inst, 200, 0);

  // ทวนกับตัวเลขในชีตตรง ๆ — SMS 600×300 3บาน: ทุน 18,865.12 · ผลิต 962.45 · ติดตั้ง 1,093.70
  //   ชีตเขียน: ขายวัสดุ 37,800 · ผลิตอย่างเดียว 39,800 · ผลิต+ติดตั้ง 43,100
  const sheetMat = ceil100(18865.11875 * 2);
  const sheetMfg = sheetMat + ceil100(962.4475 * 2);
  const sheetAll = sheetMfg + ceil100(1093.6975 * 3);
  check("ทวนสูตรกับชีต SMS: ขายวัสดุ", sheetMat, 37800, 0);
  check("ทวนสูตรกับชีต SMS: ผลิตอย่างเดียว", sheetMfg, 39800, 0);
  check("ทวนสูตรกับชีต SMS: ผลิต+ติดตั้ง", sheetAll, 43100, 0);
  // ยูโร (กำไรวัสดุ 80%) — ชีตเขียน 62,200 / 67,100
  const eM = ceil100(32989.55625 * 1.8);
  const eMfg = eM + ceil100(1400 * 2);
  check("ทวนสูตรกับชีต ยูโร: ผลิตอย่างเดียว", eMfg, 62200, 0);
  check("ทวนสูตรกับชีต ยูโร: ผลิต+ติดตั้ง", eMfg + ceil100(1602.4 * 3), 67100, 0);

  // engine ต้องคิดแบบเดียวกัน + ปรับ % แยกส่วนได้จริง
  const run = (o) => computeCost(PB, PRODUCTS.sms_slide,
    { w: 600, h: 300, p: 3, form: "อิสระ", color: "white", colorKey: "white", ...o });
  const base = run({});
  check("engine ใช้ค่าตั้งต้นของรุ่น (100/100/200)", base.profit3.inst, 200, 0);
  check("ขายวัสดุ = ปัดร้อย(ทุน × 2)", base.sell.beforeLabor, ceil100(base.cost.total * 2), 1);
  check("ผลิตอย่างเดียว = ขายวัสดุ + ปัดร้อย(ค่าแรงผลิต × 2)",
    base.sell.mfgOnly, base.sell.beforeLabor + ceil100(base.labor.prod * 2), 1);
  check("ผลิต+ติดตั้ง = ผลิตอย่างเดียว + ปัดร้อย(ค่าแรงติดตั้ง × 3)",
    base.sell.withInstall, base.sell.mfgOnly + ceil100(base.labor.install * 3), 1);
  // แยกส่วนได้จริง — ขยับทีละตัวต้องกระทบเฉพาะก้อนนั้น
  const upMat = run({ profitMat: 200 });
  check("ขึ้นกำไรค่าของ → ขายวัสดุขยับ", upMat.sell.beforeLabor > base.sell.beforeLabor ? 1 : 0, 1, 0);
  const upProd = run({ profitProd: 300 });
  check("ขึ้นกำไรค่าผลิต → ขายวัสดุต้องนิ่ง", upProd.sell.beforeLabor, base.sell.beforeLabor, 0.01);
  check("ขึ้นกำไรค่าผลิต → ผลิตอย่างเดียวขยับ", upProd.sell.mfgOnly > base.sell.mfgOnly ? 1 : 0, 1, 0);
  const upInst = run({ profitInst: 400 });
  check("ขึ้นกำไรค่าติดตั้ง → ผลิตอย่างเดียวต้องนิ่ง", upInst.sell.mfgOnly, base.sell.mfgOnly, 0.01);
  check("ขึ้นกำไรค่าติดตั้ง → ราคาพร้อมติดตั้งขยับ", upInst.sell.withInstall > base.sell.withInstall ? 1 : 0, 1, 0);
  check("กำไร 0% = ขายเท่าทุน (ปัดร้อย)", run({ profitMat: 0, profitProd: 0, profitInst: 0 }).sell.beforeLabor,
    ceil100(base.cost.total), 1);
  // ใบเก่าที่ส่ง profitPct มาตัวเดียว ต้องยังใช้ได้ (ใช้กับทั้ง 3 ก้อน)
  const legacy = run({ profitPct: 50 });
  check("ใบเก่าส่งกำไรตัวเดียว → ใช้กับทั้ง 3 ก้อน", legacy.profit3.inst, 50, 0);
}

// ── ②j กล่อง/ฉาก ที่สโตร์ตั้งราคา "สีนั้น" ไว้แล้ว — ห้ามบวกค่าอบซ้ำ ─────────────
//   สโตร์ตั้งชื่อกล่องแยกสีอยู่แล้ว (กล่อง 1"x4"-เทาซาฮาร่า) = ราคาสำเร็จรวมอบมาแล้ว
//   ถ้ายังเอา กก. ของกล่องไปเข้ากองค่าอบ = คิดค่าอบซ้ำ (หลักเดียวกับ Aztec ที่ ②e)
console.log('\n═══ ②j กล่อง/ฉาก ราคาตามสีจากสโตร์ — ไม่คิดค่าอบซ้ำ ═══');
{
  const OPT = { w: 300, h: 240, p: 3, form: 'อิสระ', color: 'sahara', colorKey: 'sahara', glassType: 'เทมเปอร์ 6มม.' };
  const base = computeCost(PB, PRODUCTS.slimlux, OPT);
  const beam = PRODUCTS.slimlux.alu.find((a) => a.box === 'กล่อง|1X4');
  const beamKg = barsNeeded(3, 1, 6.4, true) * beam.kg;      // คาน seg=W=3 ม. × 1 ท่อน
  // ① สโตร์มีกล่องสีเทา → ค่าอบต้องหายไปเท่ากับ กก.ของคาน × เรตเทา
  const withColor = JSON.parse(JSON.stringify(PB));
  withColor.BOXPRICE = { 'กล่อง|1X4': { 'เทาซาฮาร่า': 2000 } };
  const r1 = computeCost(withColor, PRODUCTS.slimlux, { ...OPT, stockColor: 'เทาซาฮาร่า' });
  check('กล่องสีเทาจากสโตร์ → กก. เข้ากองค่าอบน้อยลงเท่าคาน', r1.aluKg, base.aluKg - beamKg, 0.02);
  check('ค่าอบลดลงตาม (ไม่คิดซ้ำ)', r1.cost.bake, base.cost.bake - beamKg * PB.BAKE.sahara, 1);
  check('ราคากล่องใช้ของสโตร์', r1.lines.find((l) => l.name.startsWith(beam.name)).unitPrice, 2000, 0.01);
  // ② สโตร์มีแค่ "มิว" (สีดิบ) → ตกมาใช้ราคามิว แต่ยังต้องอบ → กองค่าอบเท่าเดิม
  const rawOnly = JSON.parse(JSON.stringify(PB));
  rawOnly.BOXPRICE = { 'กล่อง|1X4': { 'มิว': 1200 } };
  const r2 = computeCost(rawOnly, PRODUCTS.slimlux, { ...OPT, stockColor: 'เทาซาฮาร่า' });
  check('กล่องมิว (สีดิบ) → ยังคิดค่าอบเต็ม', r2.aluKg, base.aluKg, 0.02);
  check('ราคากล่องมิวมาจากสโตร์', r2.lines.find((l) => l.name.startsWith(beam.name)).unitPrice, 1200, 0.01);
  // ③ กล่องที่สโตร์ยังไม่มีราคา = ต้องไม่พลอยหลุดจากกองค่าอบ
  const r3 = computeCost(withColor, PRODUCTS.slimlux, { ...OPT, stockColor: 'เทาซาฮาร่า' });
  const post = PRODUCTS.slimlux.alu.find((a) => a.box === 'กล่อง|1X3');
  check('กล่อง 1x3 ที่ไม่มีราคาสี ยังอยู่ในกองค่าอบ', r3.aluKg > barsNeeded(2.375, 2, 6.4, true) * post.kg ? 1 : 0, 1, 0);
  // สีที่ชื่อมีเว้นวรรค (Aztec gray) ต้องจับคู่ได้ ไม่ตกไปใช้ราคามิว/ขาว (เจอจริง 21 ส.ค.69)
  const bpA = buildBoxPrices([{ name: 'กล่อง 4 หุน-Aztec gray', unit_cost: 400 }, { name: 'กล่อง 4 หุน-มิว', unit_cost: 300 }]);
  check('Aztec gray: กล่องใช้ราคาสีตัวเอง (ไม่ตกไปมิว)', boxPriceOf(bpA, 'กล่อง|4หุน', stockColorOfCalc('aztec')), 400, 0.01);
  check('สีที่สโตร์ไม่มี: ตกไปใช้ราคามิว', boxPriceOf(bpA, 'กล่อง|4หุน', stockColorOfCalc('sahara')), 300, 0.01);
}

// ── ②i สีพิเศษ 3 สี เลือกได้เฉพาะรุ่นยูโร/Fuji (เจ้าของยืนยัน 19 ส.ค.69) ──
//   Aztec gray · มะฮอกกานี · ไวท์โอ๊ค = อบพิเศษ ทำได้เฉพาะโปรไฟล์รหัส F####
//   รุ่นที่ทำได้: บานเปิด · บานเลื่อน ยูโร · บานเฟี้ยมยูโร เท่านั้น
//   ⚠ ไฟล์ถอดทุนใส่ราคา 3 สีนี้ให้ทุกรหัส (ขาว+ค่าอบ) — ถ้าไม่กรอง เซลล์จะเสนอสีที่ทำไม่ได้
console.log("\n═══ ②i สีพิเศษ (Aztec/มะฮอกกานี/ไวท์โอ๊ค) เลือกได้เฉพาะรุ่นยูโร ═══");
{
  const has = (id, k) => aluColorKeysFor(id).includes(k);
  for (const id of ["open_door", "euro_slide", "fold_euro", "awning", "pcdoor", "pivot", "fold_lift", "bansolid"])
    for (const k of ["aztec", "wood_maho", "wood_whiteoak"])
      check(`${id} เลือก ${k} ได้`, has(id, k) ? 1 : 0, 1, 0);
  for (const id of ["sms_slide", "slimlux", "velora", "fixed", "banyok", "eseries", "roof", "folding", "topslide"])
    for (const k of ["aztec", "wood_maho", "wood_whiteoak"])
      check(`${id} ต้องเลือก ${k} ไม่ได้`, has(id, k) ? 0 : 1, 1, 0);
  // สีปกติต้องยังเลือกได้ครบทุกรุ่น
  for (const k of ["white", "black", "sahara", "wood_teak", "special"])
    check(`ทุกรุ่นยังเลือก ${k} ได้`, aluColorKeysFor("sms_slide").includes(k) ? 1 : 0, 1, 0);
  check("รุ่นยูโรเห็นครบ 13 สี", aluColorKeysFor("euro_slide").length, ALU_COLOR_KEYS.length, 0);
  check("รุ่นอื่นเห็น 10 สี (ตัด 3 สีพิเศษ)", aluColorKeysFor("sms_slide").length, ALU_COLOR_KEYS.length - 3, 0);
  check("ไม่ระบุรุ่น = ปลอดภัยไว้ก่อน (ไม่โชว์สีพิเศษ)", aluColorKeysFor(null).includes("aztec") ? 0 : 1, 1, 0);
}

console.log('\n═══ ③ สวิตช์ค่าแรงในหน้าคิดราคา 4.0 (ต่อสายครบไหม) ═══');
{
  const src = fs.readFileSync(path.join(__dirname, '../src/components/Calculator40Client.tsx'), 'utf8');
  const has = (label, re) => { const ok = re.test(src); console.log(`  ${ok ? '✅' : '❌'} ${label}`); ok ? pass++ : fail++; };
  has('ค่าตั้งต้น = ค่าแรงรวม (useState "all")', /useState<"all" \| "mfg">\("all"\)/);
  // ⚠ ต้องใช้ mfgOnlyNet (ราคาหลังลดขายส่ง) ไม่ใช่ mfgOnly (ค่าดิบตามชีต) — ใช้ผิด = ลืมลด 10%
  has('ราคาต่อหน่วยที่ขึ้นใบ = ราคาขายส่งหลังลด', /perUnit:\s*\(laborMode === "mfg" \? result\.sell\.mfgOnlyNet : result\.sell\.withInstall\)/);
  has('หลังคาช่วงเพิ่ม (subLines) ใช้ราคาหลังลดด้วย', /laborMode === "mfg" \? sr\.sell\.mfgOnlyNet : sr\.sell\.withInstall/);
  has('การ์ดราคาโชว์ราคาขายส่งหลังลด', /baht\(result\.sell\.mfgOnlyNet\)/);
  has('ยอดรวม (มีรายการเสริม) ใช้ราคาหลังลด', /laborMode === "mfg" \? result\.sell\.mfgOnlyNet : result\.sell\.withInstall\) \+ \(\(result as any\)\.subSell/);
  has('เลือก "ผลิตอย่างเดียว" แล้วเขียนกำกับลงใบว่าไม่รวมติดตั้ง', /laborMode === "mfg"\)\s*jobLines\.push\("- ราคานี้ไม่รวมค่าติดตั้ง/);
  has('บันทึกลงสูตร (recipe) เพื่อกลับมาแก้ข้อได้', /profit, profitProd, profitInst, laborMode,/);
  has('มีช่องกรอกกำไรแยก 3 ส่วนบนหน้าจอ', /กำไร ค่าของ %[\s\S]*กำไร ค่าผลิต %[\s\S]*กำไร ค่าติดตั้ง %/);
  has('เปลี่ยนรุ่นแล้วตั้งกำไรตั้งต้นของรุ่นนั้นให้', /setProfitProd\(String\(dp\.prod\)\)/);
  // กางวิธีคิดทีละก้อน (เจ้าของสั่ง 20 ส.ค.69) — ค่าของกางรายการ+รหัสสโตร์ · ค่าแรงกางสูตร
  has('มีปุ่มกางวิธีคิดทั้ง 3 ก้อน', /setHowOpen\(howOpen === label \? null : label\)/);
  has('ค่าของ: กางรายการของ + รหัสสโตร์', /howOpen === "ค่าของ"[\s\S]*l\.sku \|\| l\.code/);
  has('ค่าของ: ตัวไม่มีราคาโชว์ให้เห็น (ไม่ซ่อน)', /howOpen === "ค่าของ"[\s\S]*noPrice[\s\S]*bg-amber-50/);
  // เจ้าของแจ้ง 20 ส.ค.69: กางแล้วไม่เห็นราคา เพราะราคาไปผูกกับปุ่ม 💰 ดูทุน/กำไร ที่ปิดอยู่
  //   ตารางนี้ต้องโชว์ราคาเสมอ (กว่าจะเห็นต้องกด "ดูวิธีคิด" อยู่แล้ว)
  has('ค่าของ: โชว์ ฿/หน่วย + รวม ในตาราง', /ของที่ใช้ทั้งหมด[\s\S]{0,2600}baht\(l\.unitPrice\)[\s\S]{0,300}baht\(l\.amount\)/);
  has('ค่าของ: หัวตารางราคาไม่ผูกกับปุ่มดูทุน', /<th className="text-right">฿\/หน่วย<\/th><th className="text-right">รวม<\/th>/);
  has('ค่าผลิต/ค่าติดตั้ง: กางสูตรค่าแรงจากไฟล์', /howOpen === "ค่าผลิต"[\s\S]*laborCalc[\s\S]*ตร\.ม\./);
  has('กางสูตรแล้วบอกด้วยว่าบวกกำไรกี่ %', /บวกกำไร \{pct\}%/);
  has('ใบเก่าไม่มี 2 ช่องใหม่ → ใช้กำไรเดิม (ผลเท่าเดิม)', /r\.profitProd \?\? r\.profit/);
  has('โหลดสูตรเก่ากลับมาแล้วตั้งค่าสวิตช์คืน', /setLaborMode\(r\.laborMode === "mfg"/);
  has('โชว์ค่าแรงแยก ผลิต/ติดตั้ง/รวม', /result\.labor\.prod \+ result\.labor\.install/);
}

console.log('\n═══ ④ ตาข่ายทุกรุ่น: sanity sweep (คิดออกราคาได้ · ไม่ติดลบ · ขาย≥ทุน) ═══');
let sweepPass = 0, sweepFail = 0;
for (const [id, prod] of Object.entries(PRODUCTS)) {
  if (!prod || typeof prod !== 'object' || !prod.name) continue;
  const form = prod.defForm || (prod.forms && prod.forms[0]);
  let r;
  try { r = computeCost(PB, prod, { w: 200, h: 200, p: 1, form }); }
  catch (e) { console.log(`  ❌ ${id} (${prod.name}) CRASH: ${String(e.message).slice(0, 60)}`); sweepFail++; continue; }
  const c = r && r.cost ? r.cost.total : NaN, s = r && r.sell ? r.sell.withInstall : NaN;
  if (!Number.isFinite(c) || !Number.isFinite(s)) { console.log(`  ❌ ${id}: NaN (cost=${c} sell=${s})`); sweepFail++; continue; }
  if (c < 0 || s < 0) { console.log(`  ❌ ${id}: ติดลบ (cost=${c} sell=${s})`); sweepFail++; continue; }
  if (c > 0 && s < c - 1) { console.log(`  ❌ ${id}: ขาย<ทุน (cost=${c} sell=${s})`); sweepFail++; continue; }
  sweepPass++;
}
console.log(`  ✅ ${sweepPass} รุ่นคิดออกราคาได้สมเหตุผล · ❌ ${sweepFail} พัง`);


// ── ⑥ วัสดุมุง = ชีต "ราคาหลังคา" v20.1 เป๊ะ + ผูกตารางราคากลาง ──────────────
//    เจ้าของสั่ง 3 ก.ย.69 "เอาทุกอย่างอ้างอิงตามไฟล์ล่าสุด อะไรที่ไฟล์ล่าสุดไม่มีก็ไม่ต้องมี"
//    ⚠ ห้ามเพิ่มวัสดุมุงที่ไม่มีในชีต — ถ้าจะเพิ่ม ต้องเพิ่มในไฟล์ถอดทุนก่อน
console.log("");
console.log("═══ ⑥ ชินโคร์/รางหลังคาเลื่อน ผูกตารางราคากลาง ═══");
{
  // ตัวช่วยเช็คแบบ true/false (ไฟล์นี้ใช้ check() เทียบตัวเลขเป็นหลัก)
  const okb = (label, cond, extra = "") => check(label + (cond ? "" : " [" + extra + "]"), cond ? 1 : 0, 1, 0);
  const roof = PRODUCTS.roof;
  // ^ ไม่นับ "ฝาครอบชินโคร์ Prime" (บรรทัดใหม่ v20.1 3 ก.ย.69) — ตรวจเฉพาะแผ่น 4 รุ่น
  const shin = (roof.consum || []).filter((c) => /^ชินโคร์ (Shade|Prime)/.test(c.name));
  okb("ชินโคร์ไลท์ 2 รุ่นในไฟล์ (Shade/Prime) ผูก ROOFMAT ครบ", shin.length === 2 && shin.every((c) => /^ROOFMAT\./.test(String(c.ref || ""))),
    shin.map((c) => c.name + ":" + (c.ref || "-")).join(" · "));
  const shade = shin.find((c) => /Shade/.test(c.name)), prime = shin.find((c) => /Prime/.test(c.name));
  okb("Shade 4มม ราคา 1,050 (ไฟล์ v9)", shade?.price === 1050, String(shade?.price));
  okb("Prime 10มม ราคา 4,348 (ไฟล์ v9)", prime?.price === 4348, String(prime?.price));
  // เลือก Shade/Prime แล้วต้องมีทุนแผ่นมุงจริง ไม่ใช่ 0
  for (const [m, min] of [["ชินโคร์ Shade 4มม", 12000], ["ชินโคร์ Prime 10มม", 50000]]) {
    const r = computeCost(PB, roof, { w: 400, h: 300, p: 1, form: "เพิง", material: m });
    const sheet = r.lines.filter((l) => /ชินโคร์/.test(l.name)).reduce((a, l) => a + l.amount, 0);
    okb(`${m} คิดทุนแผ่นมุงจริง (≥${min})`, sheet >= min, String(Math.round(sheet)));
  }
  // Nature/Grand ถอดออก 3 ก.ย.69 — ไฟล์ v20.1 ไม่มี → ต้องไม่โผล่ในตัวเลือก/ตารางราคาอีก
  for (const m of ["ชินโคร์ Nature 6มม", "ชินโคร์ Grand 10มม"]) {
    okb(`${m} ถูกถอดออกจากตัวเลือกวัสดุมุง (ไฟล์ v20.1 ไม่มี)`, !roof.materials.includes(m), roof.materials.join(","));
    okb(`${m} ไม่เหลือในตารางราคากลาง ROOFMAT`, !(PB.ROOFMAT || {})[m], String((PB.ROOFMAT || {})[m]));
    // ใบเสนอเก่าที่บันทึกชื่อนี้ไว้ ต้องขึ้นเตือน ไม่ใช่ทุนแผ่นหาย 0 เงียบ ๆ
    const r = computeCost(PB, roof, { w: 400, h: 300, p: 1, form: "เพิง", material: m });
    okb(`${m} (ใบเสนอเก่า) ขึ้นเตือน "ไม่มีในไฟล์ล่าสุด"`,
      (r.hwMissing || []).some((x) => /ไม่มีในไฟล์ถอดทุนล่าสุด/.test(String(x.name))), JSON.stringify(r.hwMissing));
  }
  // วัสดุมุงทั้ง 3 รุ่นหลังคา = 12 ชนิดตามชีต "ราคาหลังคา" v20.1 เป๊ะ ทุกชนิดมีราคาในตารางกลาง
  const MAT_FILE = ["ไวนิล", "ดีไลท์", "โพลีตัน", "ชินโคร์ HC", "ชินโคร์ Sup", "ชินโคร์ Shade 4มม", "ชินโคร์ Prime 10มม",
    "เมทัลชีท EPS 2 นิ้ว เหล็ก", "เมทัลชีท EPS 2 นิ้ว PVC", "เมทัลชีท EPS 1 นิ้ว PVC", "กระจก 4+4", "กระจก 5+5"];
  for (const id of ["roof", "roof_gable", "roof_slide"])
    okb(`${id} วัสดุมุง 12 ชนิดตรงชีตราคาหลังคา v20.1`,
      JSON.stringify(PRODUCTS[id].materials) === JSON.stringify(MAT_FILE), PRODUCTS[id].materials.join(","));
  for (const m of MAT_FILE) {
    const r = computeCost(PB, roof, { w: 400, h: 300, p: 1, form: "เพิง", material: m });
    // หาชื่อบรรทัดแผ่นของวัสดุนี้จากนิยาม consum (บรรทัดที่ ref = ROOFMAT.<วัสดุ>) แล้วหายอดในผลลัพธ์
    const defName = (roof.consum || []).find((c) => c.ref === "ROOFMAT." + m)?.name;
    const sheet = r.lines.filter((l) => l.name === defName).reduce((a, l) => a + l.amount, 0);
    okb(`${m} คิดทุนแผ่นมุงจริง (ไม่ใช่ 0)`, sheet > 0, String(Math.round(sheet)));
    okb(`${m} ไม่ขึ้นเตือนวัสดุหาย`, !(r.hwMissing || []).some((x) => /ไม่มีในไฟล์ถอดทุนล่าสุด/.test(String(x.name))), "");
  }
  // ชื่อเมทัลชีทเก่าที่แค่ "เปลี่ยนชื่อ" ต้องยังคิดราคาได้ (materialAlias) ไม่ใช่ทุนหาย
  for (const [old_, now] of [['เมทัล 1" PVC', "เมทัลชีท EPS 1 นิ้ว PVC"], ['เมทัล 2" PVC', "เมทัลชีท EPS 2 นิ้ว PVC"], ['เมทัล 2" เหล็ก-EPS', "เมทัลชีท EPS 2 นิ้ว เหล็ก"]]) {
    const a = computeCost(PB, roof, { w: 400, h: 300, p: 1, form: "เพิง", material: old_ }).cost.total;
    const b = computeCost(PB, roof, { w: 400, h: 300, p: 1, form: "เพิง", material: now }).cost.total;
    okb(`ใบเสนอเก่า "${old_}" คิดเท่า "${now}" (materialAlias)`, Math.round(a) === Math.round(b) && a > 0, `${Math.round(a)} vs ${Math.round(b)}`);
  }
  // รางน้ำสแตนเลส M/L มีในชีต v20.1 → ต้องผูกตารางราคากลาง ไม่ใช่ฝังเลขในโค้ด
  for (const [name, price] of [["รางน้ำสแตนเลส M", 990], ["รางน้ำสแตนเลส L", 1035]]) {
    const c = (roof.consum || []).find((x) => x.name === name);
    okb(`${name} ผูก ROOFMAT (${price})`, c?.ref === "ROOFMAT." + name && (PB.ROOFMAT || {})[name] === price, `${c?.ref} / ${(PB.ROOFMAT || {})[name]}`);
  }
  const rail = (PRODUCTS.roof_slide.consum || []).find((c) => c.name === "ราง (2 ฝั่ง)");
  okb("รางหลังคาเลื่อนผูก ROOFMAT", String(rail?.ref) === "ROOFMAT.รางหลังคาเลื่อน", String(rail?.ref));
}


// ── ⑦ กลาสเฮ้าส์ (เพิงตรง) — รุ่นใหม่ 28 ส.ค.69 · ใบตัดมีมานาน แต่คิดราคา 4.0 ไม่มี ────────
//    เส้นอลู/แผ่นมุง/ราง ดึงจากเอนจินใบตัด JR_กลาสเฮ้าส์ ตรง ๆ (ตรงกันโดยโครงสร้าง)
console.log("");
console.log("═══ ⑦ กลาสเฮ้าส์ (เพิงตรง) ═══");
{
  const okb = (label, cond, extra = "") => check(label + (cond ? "" : " [" + extra + "]"), cond ? 1 : 0, 1, 0);
  const p = PRODUCTS.glasshouse;
  okb("มีรุ่น glasshouse ในคิดราคา 4.0", !!p, "");
  // กลาสเฮ้าส์ = ห้องกระจก (G6) ไม่ใช่หลังคา (G3) — เจ้าของทัก 28 ส.ค.69
  okb("กลาสเฮ้าส์เพิงตรง อยู่ G6 ห้องกระจก", p.group === 6, "group=" + p.group);
  okb("กลาสเฮ้าส์หลายด้าน อยู่ G6 ด้วย", PRODUCTS.glasshouse_multi.group === 6, "group=" + PRODUCTS.glasshouse_multi.group);
  okb("กลาสเฮ้าส์ทั้ง 2 รุ่น โผล่เป็นการ์ดใน G6 (ไม่ซ่อน)",
    !p.pickerHide && !PRODUCTS.glasshouse_multi.pickerHide, "");
  okb("ไม่โผล่ในแถบทรงหลังคาแล้ว", !p.roofShape && !PRODUCTS.glasshouse_multi.roofShape, "");
  okb("ผูกใบตัด glasshouse", ALU_FROM_CUTLIST.glasshouse === "glasshouse", String(ALU_FROM_CUTLIST.glasshouse));
  const spec = { hiH: "270", loH: "240" };
  const map = cutInputFromRecipe({ kind: "std", prodId: "glasshouse", w: 400, h: 300, p: 1,
    form: "กลาสเฮ้าส์", spec, material: "ไวนิล", color: "อบขาว" }, { rawCompare: true });
  okb("แปลงค่าเข้าใบตัดได้", !!map && map.spec_id === "glasshouse", JSON.stringify(map));
  const ci = map.input;
  okb("กว้าง→W · ยื่น→D (ยาวทิศลาด)", ci.W === 400 && ci.D === 300, JSON.stringify(ci));
  const ar = multiRoofArea("glasshouse", ci);
  okb("พื้นที่ผัง = กว้าง×ยาวลาด (12 ตร.ม.)", Math.abs(ar - 12) < 0.01, String(ar));
  const al = cutAluLines({ prodId: "glasshouse", cutInput: ci });
  okb("ได้เส้นอลูจากใบตัด 6 บรรทัด", (al || []).length === 6, String((al || []).length));
  const cl = cutRoofConsumLines({ prodId: "glasshouse", cutInput: ci, material: "ไวนิล", rm: RM, planArea: ar }) || [];
  okb("รางน้ำอลู (ขอบต่ำ) ไม่หาย — คิด 2,273/เส้น", cl.some((x) => /^ราง/.test(x.name) && x.price === 2273),
    cl.map((x) => x.name + ":" + x.price).join(" · "));
  okb("รุ่นด้านเดียว ไม่ต่อท้าย (ทุกด้าน)", !cl.some((x) => /ทุกด้าน/.test(x.name)), cl.map((x) => x.name).join(" · "));
  // ราง ขายเป็นเส้น 6 ม. — งานกว้างเกิน 6 ม. ต้องต่อ 2 เส้น (เดิมนับ 1 เส้นเสมอ = ขาดเงิน)
  {
    const wide = cutInputFromRecipe({ kind: "std", prodId: "glasshouse", w: 800, h: 300, p: 1,
      form: "กลาสเฮ้าส์", spec, material: "ไวนิล", color: "อบขาว" }, { rawCompare: true }).input;
    const cw = cutRoofConsumLines({ prodId: "glasshouse", cutInput: wide, material: "ไวนิล", rm: RM,
      planArea: multiRoofArea("glasshouse", wide) }) || [];
    const rw = cw.find((x) => /^ราง/.test(x.name));
    okb("กว้าง 8 ม. → ราง 2 เส้น (ตัดจากเส้น 6 ม. ไม่พอ)", rw?.count === 2, JSON.stringify(rw));
    okb("ชื่อบรรทัดรางบอกชัดว่า (เท่ากว้าง) คือความยาว", /ยาวเท่าความกว้าง/.test(String(rw?.name)), String(rw?.name));
  }
  const r = computeCost(PB, p, { w: 400, h: 300, p: 1, form: "กลาสเฮ้าส์", material: "ไวนิล", spec,
    aluLines: al, consumLines: cl, areaOverride: ar });
  check("ทุนรวม 400×300 ไวนิล", r.cost.total, 40803, 1);
  okb("ค่าแรงไม่เป็นศูนย์ (พื้นที่ส่งเข้าถูก)", (r.labor?.total ?? (r.labor?.make ?? 0) + (r.labor?.install ?? 0)) > 0,
    JSON.stringify(r.labor));
}


// ── ⑧ บรรทัดที่ผูก "ตารางราคากลาง" ต้องมีรหัสสโตร์ติดตัว (เจ้าของท้วง 28 ส.ค.69) ──────────
//    เดิม แผ่นไวนิล/ฝาครอบ/เหล็ก/มอเตอร์/กระจก ผูกด้วย ref เท่านั้น ไม่มีรหัส
//    → หน้าเทียบใบตัดขึ้น "ไม่มีรหัสในสโตร์" ทั้งที่สโตร์มี (JR00134 ไวนิล · JR00138 ฝาครอบ) และหักสต็อกไม่ได้
console.log("");
console.log("═══ ⑧ ref → รหัสสโตร์ (REFSKU) ═══");
{
  const okb = (label, cond, extra = "") => check(label + (cond ? "" : " [" + extra + "]"), cond ? 1 : 0, 1, 0);
  const stock = [
    { name: "ไวนิล", sku: "JR00134", unit_cost: 1540 },
    { name: "ฝาครอบไวนิล", sku: "JR00138", unit_cost: 245 },
    { name: "ชินโคร์ Shade 4มม", sku: "JR00150", unit_cost: 0 },     // ยังไม่ตั้งราคา — รหัสต้องติดอยู่ดี
    { name: "เขียว 6มม.", sku: "JR00900", unit_cost: 300 },
  ];
  const ov = buildPriceOverride(stock, PB);
  okb("เก็บรหัสวัสดุมุงได้", ov.REFSKU["ROOFMAT.ไวนิล"] === "JR00134", JSON.stringify(ov.REFSKU));
  okb("เก็บรหัสฝาครอบได้", ov.REFSKU["ROOFMAT.ฝาครอบไวนิล"] === "JR00138", "");
  okb("ของราคา 0 ก็ต้องเก็บรหัส", ov.REFSKU["ROOFMAT.ชินโคร์ Shade 4มม"] === "JR00150", "");
  okb("กระจกก็เก็บรหัส", ov.REFSKU["GLASS.เขียว 6มม."] === "JR00900", "");

  const PB3 = applyPriceOverride(JSON.parse(JSON.stringify(PB)), ov);
  const r = computeCost(PB3, PRODUCTS.roof, { w: 400, h: 300, p: 1, form: "เพิง", material: "ไวนิล" });
  const vin = r.lines.find((l) => /^แผ่นไวนิล/.test(l.name));
  const cap = r.lines.find((l) => /^ฝาครอบไวนิล/.test(l.name));
  okb("บรรทัดแผ่นไวนิลมีรหัส JR00134", vin?.sku === "JR00134", JSON.stringify(vin));
  okb("บรรทัดฝาครอบมีรหัส JR00138", cap?.sku === "JR00138", JSON.stringify(cap));
  // ราคาต้องไม่เพี้ยน — รหัสมาจากแถวเดียวกับที่ให้ราคาตาราง
  const base = computeCost(PB, PRODUCTS.roof, { w: 400, h: 300, p: 1, form: "เพิง", material: "ไวนิล" });
  check("ใส่รหัสแล้วทุนไม่ขยับ", r.cost.total, base.cost.total, 1);
}


// ── ⑨ เฟี้ยม SMS: รหัสสโตร์ต้องตรงไฟล์ตัดประกอบ JR_เฟี้ยม_SMS_รวม.xlsx (เจ้าของส่งไฟล์ยืนยัน 31 ส.ค.69) ──
//    ตาราง ⑤ ในไฟล์ (แถว 47-57) — รหัส JR ต่อสี: สูตร IF($F$5="ดำ", <ดำ>, <เงิน>)
console.log("");
console.log("═══ ⑨ เฟี้ยม SMS ↔ ไฟล์ตัดประกอบ ═══");
{
  const okb = (label, cond, extra = "") => check(label + (cond ? "" : " [" + extra + "]"), cond ? 1 : 0, 1, 0);
  const spec = CUT_SPEC_BY_ID.sms240_bifold;
  const hw = spec.hardware || [];
  // คู่ ดำ/เงิน ตามไฟล์ (D47-D54)
  const WANT = [
    ["ชุดบานพับ (ระดับเดียว)", "JR00602", "JR00610"],
    ["ชุดบานพับ (ต่างระดับ)", "JR00603", "JR00611"],
    ["ล้อแขวนบานตาย ซ้าย", "JR00604", "JR00612"],
    ["ล้อแขวนบานตาย ขวา", "JR00605", "JR00613"],
    ["ล้อแขวนปลาย ซ้าย", "JR00606", "JR00614"],
    ["ล้อแขวนปลาย ขวา", "JR00607", "JR00615"],
    ["ล้อแขวนบานกลาง (Meeting)", "JR00608", "JR00616"],
    ["ล้อแขวนบานกลาง (Inter)", "JR00609", "JR00617"],
  ];
  for (const [nm, bk, wh] of WANT) {
    const it = hw.find((h) => h.name === nm);
    const gb = it && typeof it.sku === "function" ? it.sku({ hwColor: "ดำ" }) : null;
    const gw = it && typeof it.sku === "function" ? it.sku({ hwColor: "อบขาว" }) : null;
    okb(`${nm} = ${bk}/${wh}`, gb === bk && gw === wh, gb + "/" + gw);
  }
  const tb = hw.find((h) => /Twin Bolt/.test(String(h.name)));
  okb("ชุดสลักล็อค (05-014) = JR00563 ตามไฟล์", tb?.sku === "JR00563", String(tb?.sku));
  const rb1 = hw.find((h) => /^ยางเฟรม/.test(String(h.name)));
  const rb2 = hw.find((h) => /^ยางกรอบบาน/.test(String(h.name)));
  okb("ยางเฟรม = JR00804", rb1?.sku === "JR00804", String(rb1?.sku));
  okb("ยางกรอบบาน = JR00805", rb2?.sku === "JR00805", String(rb2?.sku));
  // โปรไฟล์ตามไฟล์ (แถว 14-25)
  const P = { "เฟรมบน": "B24001", "บังใบบน": "B24002", "เฟรมล่าง": "B24003", "ตัวตับธรณี": "B24004" };
  for (const [nm, code] of Object.entries(P)) {
    const it = (spec.profiles || []).find((x) => x.name === nm);
    okb(`${nm} = ${code}`, it?.code === code, String(it?.code));
  }
}


// ── ⑩ บรรทัดที่ผูก "กล่อง/ฉาก" (ชนิด+ขนาด) ต้องมีรหัสสโตร์ติดตัว ─────────────────
//    เจ้าของท้วง 31 ส.ค.69: หลังคาจั่ว ฉาก 6 หุน / แซด 4" / รางน้ำอลู มีรหัสในสโตร์แล้ว
//    แต่หน้าเทียบใบตัดขึ้นว่า "ยังไม่มีรหัสสโตร์" — เพราะผูกด้วยชนิด+ขนาด ไม่มีรหัสติดบรรทัด
console.log("");
console.log("═══ ⑩ box → รหัสสโตร์ (BOXSKU) ═══");
{
  const okb = (label, cond, extra = "") => check(label + (cond ? "" : " [" + extra + "]"), cond ? 1 : 0, 1, 0);
  const stock = [
    { name: 'ฉาก 6 หุน-อบขาว', sku: "JR02988", color: "อบขาว", unit_cost: 140 },
    { name: 'ตัวZ 4"-อบขาว', sku: "JR02993", color: "อบขาว", unit_cost: 140 },   // สโตร์ตั้งชื่อ "ตัวZ" (สูตรเรียก "แซด")
    { name: 'กล่องเปิด 4"-อบขาว', sku: "JR02987", color: "อบขาว", unit_cost: 2273 },
  ];
  const ov = buildPriceOverride(stock, PB);
  okb("เก็บรหัสฉาก 6 หุน", ov.BOXSKU?.["ฉาก|6หุน"]?.["อบขาว"] === "JR02988", JSON.stringify(ov.BOXSKU));
  okb('เก็บรหัสแซด 4"', ov.BOXSKU?.["ตัวZ|4"]?.["อบขาว"] === "JR02993", "");
  const PB4 = applyPriceOverride(JSON.parse(JSON.stringify(PB)), ov);
  const r = computeCost(PB4, PRODUCTS.roof_gable, { w: 400, h: 300, p: 1, form: "จั่ว", material: "ไวนิล", stockColor: "อบขาว" });
  const pick = (re) => r.lines.find((l) => re.test(l.name));
  const chak = pick(/^ฉาก 6 หุน/), zed = pick(/^แซด 4/), gut = pick(/^รางน้ำอลู/);
  okb("หลังคาจั่ว: ฉาก 6 หุน มีรหัส JR02988", chak?.sku === "JR02988", JSON.stringify(chak));
  okb('หลังคาจั่ว: แซด 4" มีรหัส JR02993', zed?.sku === "JR02993", JSON.stringify(zed));
  okb("หลังคาจั่ว: รางน้ำอลู มีรหัส JR02987", gut?.sku === "JR02987", JSON.stringify(gut));
  const base = computeCost(PB, PRODUCTS.roof_gable, { w: 400, h: 300, p: 1, form: "จั่ว", material: "ไวนิล" });
  check("ติดรหัสแล้วทุนไม่ขยับ", r.cost.total, base.cost.total, 1);
}


// ── ⑪ บานยก: จำนวนเส้น 3 บรรทัดที่ "ตั้งใจต่างจากใบตัด" — เจ้าของเคาะ 31 ส.ค.69 ให้ยึดไฟล์ v20 ──
//    กันคนมาแก้ตามใบตัดทีหลังโดยไม่รู้ว่าเคาะไว้แล้ว (ถ้าแก้ ทุนจะขยับ 5,282.64 → 5,546.06)
console.log("");
console.log("═══ ⑪ บานยก: ยึดไฟล์ v20 ไม่ใช่ใบตัด (เจ้าของเคาะ) ═══");
{
  const okb = (label, cond, extra = "") => check(label + (cond ? "" : " [" + extra + "]"), cond ? 1 : 0, 1, 0);
  const alu = PRODUCTS.banyok.alu;
  const g = (code) => alu.find((a) => a.code === code);
  okb("B28015 กล่องร่องมีสกรู = 1 ท่อน ยาวเท่ากว้าง", g("B28015")?.seg === "W" && g("B28015")?.count === "1",
    JSON.stringify(g("B28015")));
  okb("B28012 อแดปเตอร์รูสกรู = 1 ท่อน", g("B28012")?.seg === "W" && g("B28012")?.count === "1", JSON.stringify(g("B28012")));
  okb("B28011 กรอบบาน = 2 ท่อน ยาว 2*(W+H/2)", g("B28011")?.seg === "2*(W+H/2)" && g("B28011")?.count === "2",
    JSON.stringify(g("B28011")));
  okb("เปิดเผื่อเศษอลู (aluWaste) ตาม buf_scrap ในไฟล์", PRODUCTS.banyok.aluWaste === true, "");
  okb("ค่าดำเนินการ 30% เปิดเฉพาะบานยก", PRODUCTS.banyok.opCostPct === 30
    && Object.values(PRODUCTS).filter((p) => p.opCostPct).length === 1, "");
}


// ── ⑫ ห้ามเอา "รหัสที่สร้างเอง" กลับเข้าสูตร (เจ้าของสั่ง 1 ก.ย.69) ──────────────
//    เจ้าของสั่ง: ยึดไฟล์ตัดประกอบเท่านั้น · ไฟล์ไม่ให้รหัส = ปล่อยว่าง + needCode แล้วเจ้าของไล่เติมเอง
//    เหตุผล: JR030xx ที่ผู้ช่วยสร้างเองในสโตร์ เสี่ยงซ้ำกับของที่มีอยู่แล้ว
console.log("");
console.log("═══ ⑫ ไม่มีรหัสที่สร้างเองหลงเหลือในสูตร (เจ้าของสั่ง 1 ก.ย.69) ═══");
{
  const okc = (label, cond, extra = "") => check(label + (cond ? "" : " [" + extra + "]"), cond ? 1 : 0, 1, 0);
  const src = fs.readFileSync(path.join(__dirname, "../src/lib/calculator40/products.mjs"), "utf8");
  const leak1 = (src.match(/JR030dd/g) || []);
  okc("ไม่มี JR030xx (รหัสที่สร้างเอง) ในสูตรคิดราคา", leak1.length === 0, leak1.join(","));
  const cut = fs.readFileSync(path.join(__dirname, "../src/lib/cutlist/products.ts"), "utf8");
  const leak2 = (cut.match(/JR030dd/g) || []);
  okc("ไม่มี JR030xx ในสูตรใบตัด", leak2.length === 0, leak2.join(","));
  let need = 0; const zero = [];
  for (const p of Object.values(PRODUCTS)) {
    for (const a of (p.alu || [])) if (a.needCode) need++;
    for (const g of ["hardware", "consum"]) for (const it of (p[g] || [])) {
      if (!it.needCode) continue;
      need++;
      if (!(Number(it.price) > 0)) zero.push((p.name || p.id) + "/" + it.name);
    }
  }
  check("บรรทัดที่รอเจ้าของเติมรหัส (needCode)", need, 74, 0);   // 79 → 74: บานกระทุ้งตัด 5 รายการตามใบตัด (เจ้าของเคาะ 1 ก.ย.69)
  okc("ทุกบรรทัด needCode ยังมีราคาสำรองในสูตร (ทุนไม่หายเงียบ)", zero.length === 0, zero.join(" · "));
}

console.log(`\n═══ สรุป: ✅ ${pass} anchor ผ่าน · ❌ ${fail} ไม่ผ่าน · ② sweep ${sweepPass} รุ่นดี/${sweepFail} พัง ═══`);
process.exit((fail + sweepFail) > 0 ? 1 : 0);
