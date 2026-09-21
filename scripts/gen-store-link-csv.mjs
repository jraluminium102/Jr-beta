/**
 * gen-store-link-csv — CSV "ผูกสโตร์รายบาน" ให้เจ้าของไล่ตรวจ (เจ้าของสั่ง 1 ก.ย.69)
 *   ฝั่งซ้าย  = คิดราคา 4.0 (ชื่อ/รหัส/ราคา/จำนวน)
 *   ฝั่งขวา  = ไฟล์ตัดประกอบ 30-7-2026 (ผ่าน CutSpec ที่พอร์ตจากไฟล์ · รหัส/จำนวน)
 *   แถวที่ใบตัดมีแต่คิดราคาไม่มี → ต่อท้ายด้วยหมวด "มีแต่ในใบตัด"
 *   ยกเว้น บานเลื่อน SMS ตามที่เจ้าของสั่ง
 *   ออก: docs/csv-ผูกสโตร์/<รุ่น>.csv + ไฟล์รวม + Excel แท็บละบาน (เจ้าของเปิด csv ไม่ได้)
 */
import fs from 'node:fs'; import path from 'node:path';
import { PRODUCTS } from '../src/lib/calculator40/products.mjs';
import { computeCost } from '../src/lib/calculator40/engine.mjs';
import * as CUTP from '../src/lib/cutlist/products.ts';
import { CUT_SPEC_BY_ID } from '../src/lib/cutlist/products.ts';
import { cutInputFromRecipe } from '../src/lib/cutlist/from-recipe.ts';
import { createRequire } from 'node:module';
import { writeXlsx, S } from './xlsxwrite.mjs';
import { cutHardwareLines } from '../src/lib/calculator40/hardware-from-cutlist.ts';
import { cutAluLines, cutRoofConsumLines, cutUncodedLines, multiRoofArea, ALU_FROM_CUTLIST } from '../src/lib/calculator40/alu-from-cutlist.ts';
import { RM } from '../src/lib/calculator40/products.mjs';

// ยี่ห้อ/สีมือจับที่ใช้เทียบ — ต้องเป็นตัวเดียวกันทั้ง 2 ฝั่ง ไม่งั้นรหัสมือจับคนละตัว
//   แล้วรายงานจะฟ้อง "อีกฝั่งไม่มีรายการนี้" ทั้งที่เป็นของชิ้นเดียวกัน (เจอ 21 ก.ย.69 · 16 แถวหลอก)
//   ใช้ค่าตั้งต้นของหน้าคิดราคา (HANDLE_FIELDS def) = Align · อบขาว
// ยี่ห้อมือจับเป็น "ตัวเลือก" ไม่ใช่ของตกหล่น — สูตรคิดราคามีทุกยี่ห้อ ใบตัดเลือกได้ยี่ห้อเดียว
//   ถ้ารายงานลองแค่ยี่ห้อเดียว จะขึ้นว่า "คิดราคามีมือจับเมโทร แต่ใบตัดไม่มี" ทั้งที่แค่คนละตัวเลือก (21 ก.ย.69)
const HANDLE_BRANDS = ['Align', 'เมโทร'];
const HB0 = { handleBrand: 'Align', handleColor: 'อบขาว' };
const PB = createRequire(import.meta.url)('../src/lib/calculator40/pricebook.json');

const MAP = { awning:'FUJI_SWING', open_door:'FUJI_DOOR', bansolid:'SOLID_DOOR', topslide:'TOPRAIL_FRAME',
  pcdoor:'PC_DOOR', velora:'VELORA_SWING', fixed:'FIXED_PANEL', slimlux:'SLIMLUX_SLIDE',
  folding:'SMS240_BIFOLD', fold_euro:'EURO_BIFOLD', fold_lift:'EURO_LIFT', banyok:'FUJI_HUNG',
  gate:'GATE_SLIDE', euro_slide:'FUJI_SLIDE' };
const FILEOF = { FUJI_SWING:'JR_FUJI_บานเปิดบานกระทุ้ง_1', FUJI_DOOR:'JR_FUJI_บานเปิดบานกระทุ้ง_1',
  SOLID_DOOR:'JR_บานโซลิด_3', TOPRAIL_FRAME:'JR_รางบนเฟรมปกติ_1', PC_DOOR:'JR_PCDoor',
  VELORA_SWING:'JR_Velora_บานเปิด', FIXED_PANEL:'JR_บานติดตาย', SLIMLUX_SLIDE:'JR_SlimLux_บานเลื่อน',
  SMS240_BIFOLD:'JR_เฟี้ยม_SMS_รวม', EURO_BIFOLD:'JR_เฟี้ยมยูโร', EURO_LIFT:'JR_เฟี้ยมยก',
  FUJI_HUNG:'JR_บานยก_ฟูจิ', GATE_SLIDE:'JR_ประตูรั้ว', FUJI_SLIDE:'JR_FUJI_บานเลื่อน' };


// รหัสทั้งหมดของบรรทัดนี้ (สูตร sku เลือกตามสีได้ เช่น "CKEY==='black'?'JR00316':'JR00318'")
//   คืนรายการรหัสทุกสี — ใช้จับคู่กับใบตัด และโชว์ให้เจ้าของรู้ว่าต้องกรอกกี่รหัส
const skuVariants = (line, rawItem) => {
  const rawSku = String(rawItem?.sku ?? "");
  // เอาเฉพาะที่หน้าตาเป็น "รหัส" — สูตรมีค่าเงื่อนไขปนด้วย (เช่น 'black') ห้ามหลุดไปโชว์เป็นรหัส
  const isCode = t => /^(JR\d{5}|[A-Z]{1,4}-?\d{3,5}[A-Z]?|OPK-[A-Z0-9-]+|XSW\d+|HD-\d+)$/i.test(t);
  if (rawSku.includes("?")) return [...rawSku.matchAll(/'([^']+)'|"([^"]+)"/g)].map(m=>(m[1]??m[2]).toUpperCase()).filter(isCode);
  const one = String(line.sku || line.code || rawSku || "").toUpperCase();
  return one ? [one] : [];
};
const norm = s => String(s||'').replace(/[\s\-–—()"'·.]/g,'').toLowerCase();
const val = (f,o) => { try { return typeof f==='function' ? f(o) : f; } catch { return ''; } };
const n2 = v => (typeof v === "number" && Number.isFinite(v)) ? Math.round(v*100)/100 : v;   // เลขทศนิยมยาว ๆ อ่านไม่รู้เรื่องใน Excel
const HEAD = ['ต้องเช็ค','รุ่น','หมวด','ชื่อรายการ','รหัส (คิดราคา)','รหัสอื่นตามสี','ราคา/หน่วย','หน่วย','จำนวน','ยอดเงิน',
  'ขนาดที่ใช้คิด','รหัส (ใบตัด)','จำนวนในใบตัด','หน่วยในใบตัด','ตรงกันไหม','ไฟล์ตัดประกอบ'];

// ธง + สีตามสถานะ — เจ้าของขอ "ไฮไลท์ให้รู้ว่าต้องดูตรงไหน" (1 ก.ย.69)
// ⚠ เดิมเหมาว่า "ใบตัดไม่มีรายการนี้ = ไม่ต้องทำ" — ผิด (เจ้าของท้วง 1 ก.ย.69)
//   คิดราคาคิดเงินของที่ใบตัดไม่ได้เบิก = อาจคิดเกิน ต้องเช็ค ไม่ใช่ปล่อย
//   แยกออกเป็น 2 กรณี: ของที่ใบตัด "ไม่ลงประเภทนี้อยู่แล้ว" (กระจก/ซิลิโคน) = ดูเฉย ๆ
//                     นอกนั้น = ฟ้า "เช็คว่าคิดเกินไหม"
const LEVEL = {
  "รหัสไม่ตรง":        { flag:"🔴 ต้องแก้",   style:S.RED },
  "จำนวนต่าง":         { flag:"🔴 ต้องแก้",   style:S.RED },
  // 21 ก.ย.69: คิดราคานับ "เส้น 6.4 ม. ที่ต้องซื้อ" · ใบตัดนับ "ท่อนที่ตัด" — ของชิ้นเดียวกันคนละหน่วย
  //   ยอดเงินถูกตรวจโดยหน้าเทียบคิดราคา↔ใบตัด (sweep-compare) อยู่แล้ว → ไม่ใช่แถวที่ต้องแก้
  "นับคนละหน่วย":      { flag:"⚪ ปกติ (คนละหน่วย)", style:S.GREY },
  "ไฟล์รวมบรรทัด":     { flag:"⚪ ปกติ (ไฟล์รวมบรรทัด)", style:S.GREY },
  // ไฟล์ถอดทุนไม่ตั้งราคาให้ → เครื่องคิดราคาขึ้นธง "ยังไม่มีราคา" และไปดึงจากสโตร์ให้เอง
  //   (รายงานนี้รันโดยไม่มีข้อมูลสโตร์ จึงเห็นเป็นของที่ยังไม่ถูกคิดเงิน)
  "ราคามาจากสโตร์":     { flag:"🟡 ราคามาจากสโตร์", style:S.YELLOW },
  // ของชิ้นเดียวกันแต่คนละสี/ตัวเลือก (มือจับดำ-เงิน · คิ้วกระจกหนา-บาง) — ตรวจไปแล้วที่รหัสพี่น้องชื่อเดียวกัน
  "รหัสสำรองตามสี":     { flag:"⚪ ตรวจแล้วที่รหัสพี่น้อง", style:S.GREY },
  // ของสั่งตามงาน (orderOnly) — เจ้าของสั่ง 21 ก.ย.69 "มอเตอร์ประตูรั้วไม่สต็อค ไม่ลงสโตร์ แค่เอาราคาไว้"
  "สั่งตามงาน":         { flag:"⚪ สั่งตามงาน (ไม่ลงสโตร์)", style:S.GREY },
  "คิดราคาไม่มีรายการนี้": { flag:"🟠 ต้องเติม",  style:S.ORANGE },
  "คิดราคายังไม่มีรหัส":  { flag:"🟡 ต้องเคาะ",  style:S.YELLOW },
  "ใบตัดไม่ให้รหัส":     { flag:"🟡 ต้องเคาะ",  style:S.YELLOW },
  "ตรง":               { flag:"✓ ผ่าน",       style:S.GREEN },
  "ใบตัดไม่มีรายการนี้":  { flag:"🔵 เช็คว่าคิดเกินไหม", style:S.BLUE },
  "ใบตัดไม่ลงประเภทนี้":  { flag:"⚪ ดูเฉย ๆ",      style:S.GREY },
  "ยังไม่ผูกไฟล์":       { flag:"⚪ ยังตรวจไม่ได้", style:S.GREY },
  "ยังไม่ได้ตรวจ":       { flag:"🟣 ยังไม่ได้ตรวจ", style:S.YELLOW },
};
const FLAG = st => (LEVEL[st]?.flag) || "";
// รหัสที่ไฟล์ถอดทุน "รวมเป็นบรรทัดเดียว" แต่ใบตัดแยกบรรทัด → ไม่ใช่ของตกหล่น
const FILE_MERGED = {
  'fold_euro|F7962': 'ชีตคิดทุน เฟี้ยมยูโร D19 รวม F7961+F7962 เป็นบรรทัดเดียว (คิดเงินที่ F7961 ด้วยราคา F7962) — เจ้าของสั่งตามไฟล์ 18 ก.ย.69',
};
const STYLE = st => (LEVEL[st]?.style) ?? 0;
const esc = v => { const s=String(v??''); return /[",\n]/.test(s) ? '"'+s.replace(/"/g,'""')+'"' : s; };
const SUFFIX = process.argv[2] || '';   // เลี่ยงไฟล์ถูกล็อกตอนเจ้าของเปิดค้างใน Excel
const outDir = 'docs/csv-ผูกสโตร์';
fs.rmSync(outDir, { recursive:true, force:true }); fs.mkdirSync(outDir, { recursive:true });
const safe = s => String(s).replace(/[\/:*?"<>|]/g,'-');
const all = [];

// ⚠ ต้องสุ่มหลายขนาด/หลายรูปแบบต่อรุ่น (เจ้าของท้วง 1 ก.ย.69)
//   เดิมคิดขนาดเดียวต่อรุ่น → ของที่ใช้เฉพาะบางรูปแบบ (ชายล่างตอนไม่มีธรณี · ชนกลางตอน 2 บาน ·
//   กล่องระแนงขนาดอื่น) ออกมาจำนวน 0 แล้วถูกติดป้าย "ไม่ต้องทำ" ทั้งที่ยังไม่เคยถูกตรวจเลย
//   → ไล่ทุกรูปแบบ + จำนวนบานต่ำสุด/สูงสุด แล้วเก็บผลที่ "ตรวจได้จริง" ที่สุดของแต่ละรหัส
function samplesOf(p) {
  const d = p.defaults || { w: 150, h: 150, p: 1 };
  const forms = (p.forms && p.forms.length ? p.forms : [p.defForm]).slice(0, 5);
  const panels = [...new Set([d.p || 1, p.minP, p.maxP].filter((x) => Number.isFinite(x) && x > 0))].slice(0, 3);
  const out = [];
  for (const form of forms) for (const pn of panels) {
    out.push({ w: d.w, h: d.h, p: pn, form, label: `${d.w}×${d.h} ${pn} บาน${form ? ` · ${form}` : ''}` });
    if (out.length >= 12) return out;      // กันรุ่นที่มีรูปแบบเยอะจนช้า
  }
  return out.length ? out : [{ w: d.w, h: d.h, p: d.p || 1, form: p.defForm, label: `${d.w}×${d.h} ${d.p || 1} บาน` }];
}
// สถานะไหน "ตรวจได้จริง" มากกว่ากัน — เลขน้อย = ดีกว่า (ใช้ merge ผลจากหลายขนาด)
const RANK0 = { 'ตรง':0, 'นับคนละหน่วย':0.5, 'ไฟล์รวมบรรทัด':0.6, 'ราคามาจากสโตร์':0.7, 'รหัสสำรองตามสี':0.8, 'สั่งตามงาน':0.9, 'จำนวนต่าง':1, 'รหัสไม่ตรง':2, 'คิดราคาไม่มีรายการนี้':3, 'ใบตัดไม่มีรายการนี้':4,
  'คิดราคายังไม่มีรหัส':5, 'ใบตัดไม่ให้รหัส':6, 'ใบตัดไม่ลงประเภทนี้':7, 'ยังไม่ผูกไฟล์':8, 'ยังไม่ได้ตรวจ':9 };

for (const p of Object.values(PRODUCTS)) {
  if (p.id === 'sms_slide') continue;
  const merged = new Map();     // คีย์ = หมวด|ชื่อ|รหัส → แถวที่สถานะดีที่สุดจากทุกขนาดที่ลอง
  for (const SMP of samplesOf(p)) {
  for (const HBRAND of HANDLE_BRANDS) {
  const HB = { ...HB0, handleBrand: HBRAND };
  const d = SMP;
  const sz = SMP.label;
  const sn = MAP[p.id];
  // ใช้ตัวแปลง "คิดราคา → ใบตัด" ตัวจริง (from-recipe) ก่อน — ตัวเดียวกับหน้าเทียบ
  //   ถ้าเดา input เอง (แค่ยัด W/H/N) รุ่นที่ใบตัดนับคนละฐาน (เลื่อนยูโร ฯลฯ) จะออกมาผิดเป็นกอง
  let spec = sn ? CUTP[sn] : null, co = null;
  const rec = cutInputFromRecipe({ kind:'std', prodId:p.id, w:d.w, h:d.h, p:d.p||1,
    form:SMP.form || p.defForm, spec:{}, glassType:p.defGlass }, { rawCompare:true });
  if (rec && CUT_SPEC_BY_ID[rec.spec_id]) { spec = CUT_SPEC_BY_ID[rec.spec_id]; co = { ...spec.defaults, ...rec.input }; }
  else if (spec) co = { ...spec.defaults, W:d.w, H:d.h, N:d.p||1 };
  // บังคับยี่ห้อมือจับให้ตรงกับรอบที่กำลังลอง (ค่า default ของใบตัดคือ Align เสมอ → ถ้าไม่บังคับ รอบเมโทรจะไม่เกิดผล)
  if (co) { co.handleBrand = HB.handleBrand; if (co.handleColor == null) co.handleColor = HB.handleColor; }
  const mult = (rec && rec.multiplier) || 1;
  // ── ฝั่งคิดราคา: คิดแบบเดียวกับหน้าเว็บจริง (21 ก.ย.69) ─────────────────
  //   หน้าคิดราคาส่ง "อุปกรณ์จากใบตัด" ให้รุ่นที่ผูกใบตัด + ดึงเส้นอลู/แผ่นจากใบตัด (หลังคาหลายด้าน)
  //   เดิมรายงานเรียก computeCost เปล่า ๆ → เทียบสูตรสำรองกับใบตัด ขึ้นไม่ตรงหลายสิบแถวทั้งที่ของจริงตรง
  let calc; try {
    // ถ้ารุ่นนี้มีตัวเลือก "ยี่ห้อมือจับ" ในฝั่งคิดราคา ต้องตั้งให้ตรงกับรอบที่ลอง (เหมือนใบตัด)
    const specC = {};
    for (const o of (p.specOpts || [])) if (/ยี่ห้อมือจับ/.test(String(o.label||'')) && (o.opts||[]).includes(HB.handleBrand)) specC[o.key] = HB.handleBrand;
    const optC = { w:d.w, h:d.h, p:d.p||1, form:SMP.form, color:'white', colorKey:'white', spec:specC };
    try {
      const hwl = cutHardwareLines({ prodId:p.id, w:d.w, h:d.h, p:d.p||1, form:SMP.form || p.defForm, spec:{}, cut:HB });
      if (hwl?.length) optC.hardwareLines = hwl;
    } catch { /* รุ่นไม่ผูกใบตัด */ }
    if (ALU_FROM_CUTLIST[p.id] && rec && rec.input) {
      const ci = rec.input, ar = multiRoofArea(p.id, ci);
      const al = cutAluLines({ prodId:p.id, cutInput:ci }); if (al?.length) optC.aluLines = al;
      const cl = cutRoofConsumLines({ prodId:p.id, cutInput:ci, material:String(p.defMaterial || 'ไวนิล'), rm:RM, planArea:ar });
      if (cl?.length) optC.consumLines = cl;
      const un = cutUncodedLines({ prodId:p.id, cutInput:ci }); if (un?.length) optC.consumLines = [...(optC.consumLines ?? p.consum ?? []), ...un];
      if (ar > 0 || p.multiSide) optC.areaOverride = ar;
    }
    calc = computeCost(PB, p, optC);
  } catch { continue; }
  // ⚠ ต้องเก็บทั้ง hardware (อุปกรณ์) และ profiles (อลูรายเส้น)
  //   บั๊กเดิม (เจ้าของจับได้ 1 ก.ย.69): อ่านแค่ spec.hardware → บรรทัดอลูทุกเส้นขึ้น
  //   "ใบตัดไม่มีรายการนี้" ทั้งที่ใบตัดมีครบ ทำให้รายงานหลอกตาไป 120+ แถว
  //   ⚠ รวมตามรหัสด้วย — ใบตัดเขียนของชิ้นเดียวกันหลายบรรทัดได้ (ยางกรอบบาน + ยางวงกบ = JR00770)
  //     ถ้าไม่รวม บรรทัดคิดราคาบรรทัดเดียวจะจับได้แค่แถวแรก อีกแถวค้างเป็น "คิดราคาไม่มี" ทั้งที่มี
  const cutList = [];
  const cutBySku = new Map();
  if (spec) for (const h of (spec.hardware||[])) {
    const q = (Number(val(h.qty,co))||0)*mult; if (q<=0) continue;
    const sku = String(val(h.sku,co)||''), nm = String(val(h.name,co));
    const key = sku ? sku.toUpperCase() : null;
    if (key && cutBySku.has(key)) { const e = cutBySku.get(key); e.qty += q; e._names.push(nm); continue; }
    const e = { name:nm, sku, qty:q, unit:h.unit||'', _names:[nm] };
    cutList.push(e); if (key) cutBySku.set(key, e);
  }
  for (const e of cutList) if (e._names.length > 1) e.name = e._names.join(' + ');
  // อลู: รวมทุกบรรทัดที่ใช้รหัสเดียวกัน (ขวางบน+ขวางล่าง ฯลฯ) → จำนวน "ชิ้น" ต่อรหัส
  const cutProf = new Map();
  if (spec) for (const pr of (spec.profiles||[])) {
    const c = String(val(pr.code,co)||'').toUpperCase(); if (!c || c === '-') continue;
    const q = (Number(val(pr.qty,co))||0)*mult; if (q<=0) continue;
    const e = cutProf.get(c) || { sku:c, qty:0, unit:'ชิ้น', name:String(val(pr.name,co)) };
    e.qty += q; cutProf.set(c, e);
  }
  const fileLabel = (sn && FILEOF[sn]) || (spec ? 'ใบตัด: '+spec.id : '');
  const rawBy = new Map();
  for (const g of ["hardware","consum"]) for (const it of (p[g]||[])) if (!rawBy.has(it.name)) rawBy.set(it.name, it);
  const rawAlu = new Map();
  for (const it of (p.alu||[])) if (!rawAlu.has(it.name)) rawAlu.set(it.name, it);
  const used = new Set(), usedProf = new Set();
  const rows = [];
  // อลูฝั่งคิดราคาต้อง "รวมตามรหัส" ก่อนเทียบ — รหัสเดียวมักถูกเขียนหลายบรรทัด (เสา/ขวาง/คิ้ว ใช้ F7935 ร่วมกัน)
  //   ถ้าไม่รวม แต่ละบรรทัดจะไปเทียบกับยอดรวมของใบตัด → ขึ้น "จำนวนต่าง" หลอก ๆ ทั้งกอง
  //   (หน้าเทียบคิดราคา↔ใบตัด รวมตามรหัสอยู่แล้ว — ทำให้ตรงกัน)
  const lines = [];
  const aluByCode = new Map();
  //   ⚠ อุปกรณ์ก็ต้องรวมตามรหัสเหมือนกัน — สูตรเขียนของชิ้นเดียวกันหลายบรรทัดได้
  //     (ยางกรอบบาน + ยางวงกบ = JR00771) ถ้ารวมแค่ฝั่งใบตัด ฝั่งคิดราคาจะเหลือบรรทัดที่หาคู่ไม่เจอ
  for (const l of (calc.lines||[])) {
    if (l.cat === 'labor') continue;
    const c = String(l.cat === 'alu' ? (l.code||'') : (l.code || l.sku || '')).toUpperCase();
    if (!c || l.cat === 'glass') { lines.push(l); continue; }
    const e = aluByCode.get(c);
    if (!e) { aluByCode.set(c, { ...l, _names:[l.name] }); lines.push(aluByCode.get(c)); continue; }
    e.qty = (e.qty||0) + (l.qty||0); e.pieces = (e.pieces||0) + (l.pieces||0);
    e.amount = (e.amount||0) + (l.amount||0); e._names.push(l.name);
  }
  for (const e of aluByCode.values()) if (e._names.length > 1) e.name = e._names.join(' + ');
  // ── จับคู่ 2 รอบ ──
  //   รอบ 1 จับด้วย "รหัส" ให้ครบทุกบรรทัดก่อน · รอบ 2 ค่อยเดาด้วยชื่อจากที่เหลือ
  //   ถ้าไม่แยกรอบ บรรทัดที่ไม่มีรหัส (เช่น "รางบน Hafele") จะเดาชื่อไปคว้าแถว JR00544
  //   ตัดหน้าบรรทัด "ล้อรางบน Hafele 100kg" ที่มีรหัสตรงเป๊ะ → ของจริงเลยขึ้นว่าใบตัดไม่มี
  const hitOf = new Map();
  for (const l of lines) {
    if (l.cat === 'alu') continue;
    const mine = skuVariants(l, rawBy.get(l.name));
    if (!mine.length) continue;
    const i = cutList.findIndex((c,ix)=>!used.has(ix) && c.sku && mine.includes(String(c.sku).toUpperCase()));
    if (i>=0) { used.add(i); hitOf.set(l, cutList[i]); continue; }
    // 21 ก.ย.69: ของชิ้นเดียวกันอยู่คนละหมวดได้ — คิดราคาลง "อุปกรณ์" (รางบน Hafele JR03141)
    //   แต่ใบตัดลงเป็น "เส้นอลูที่ต้องตัด" → ถ้าไม่จับข้ามหมวด จะขึ้นสองแถวว่าต่างฝ่ายต่างไม่มี
    const pc = mine.map(c=>cutProf.get(c)).find(Boolean);
    if (pc) { usedProf.add(String(pc.sku).toUpperCase()); hitOf.set(l, pc); }
  }
  for (const l of lines) {
    if (l.cat === 'alu' || hitOf.has(l)) continue;
    const i = cutList.findIndex((c,ix)=>!used.has(ix) && (norm(c.name)===norm(l.name)
      || norm(c.name).includes(norm(l.name)) || norm(l.name).includes(norm(c.name))));
    if (i>=0) { used.add(i); hitOf.set(l, cutList[i]); }
  }
  for (const l of lines) {
    const cat = l.cat==='alu' ? 'อลูมิเนียม' : l.cat==='glass' ? 'กระจก' : 'อุปกรณ์/สิ้นเปลือง';
    const code = String(l.code || l.sku || '');
    const raw = rawBy.get(l.name);
    // อลูก็มีรหัสสำรองตามสี/ความหนากระจก (เช่น คิ้ว F7919 กระจกบาง · F7917 กระจกหนา) → กางให้ครบ
    const variants = l.cat === 'alu'
      ? skuVariants({ code }, { sku: (rawAlu.get(String(l._names?.[0] ?? l.name))||{}).code })
      : skuVariants(l, raw);
    let hit = null;
    if (l.cat === 'alu') {
      // อลูจับคู่ด้วย "รหัสเส้น" ไม่ใช่ชื่อ (ชื่อสองฝั่งเรียกคนละแบบ) · เทียบกันที่ "จำนวนชิ้น"
      const e = cutProf.get(code.toUpperCase());
      if (e) { hit = e; usedProf.add(code.toUpperCase()); }
    } else {
      // จับคู่มาแล้ว 2 รอบด้านบน (รหัสก่อน แล้วค่อยชื่อ) — ตรงนี้แค่หยิบผลมาใช้
      hit = hitOf.get(l) || null;
    }
    // อลูเทียบชิ้นต่อชิ้น (คิดราคาเก็บ pieces มาให้แล้ว) · อุปกรณ์เทียบจำนวนตรง ๆ
    const myQty = l.cat === 'alu' ? Number(l.pieces)||0 : Number(l.qty)||0;
    // ใบตัดไม่เคยลง "กระจก / ซิลิโคน / ค่าอบสี" อยู่แล้ว — ไม่ใช่ของตกหล่น
    // 21 ก.ย.69: ใบตัดหลังคา/กลาสเฮ้าส์/จั่ว มีแต่ "เส้นอลูที่ต้องตัด" ไม่มีช่องอุปกรณ์เลย
    //   → ของกินของใช้ (แผ่นไวนิล เพลทเหล็ก รางน้ำ ฝาครอบ) ไม่ใช่ของตกหล่น แต่ใบตัดไม่ลงประเภทนี้อยู่แล้ว
    const cutHasHardware = !!(spec && (spec.hardware || []).length);
    const notInCutByNature = l.cat === 'glass' || /ซิลิโคน|ค่าอบ|ค่าเปิดตู้อบ|ค่าดัด|ปัดขึ้น/.test(String(l.name))
      || (l.cat !== 'alu' && !cutHasHardware);
    // ของสั่งตามงาน = ไม่ต้องมีรหัสสโตร์ ไม่ต้องตัดสต็อก (เก็บไว้แค่ราคา)
    const orderOnly = !!(raw && raw.orderOnly) || !!l.orderOnly;
    const same = orderOnly && !code ? 'สั่งตามงาน'
      : !spec ? 'ยังไม่ผูกไฟล์' : !hit ? (notInCutByNature ? 'ใบตัดไม่ลงประเภทนี้' : 'ใบตัดไม่มีรายการนี้')
      : !code ? 'คิดราคายังไม่มีรหัส' : !hit.sku ? 'ใบตัดไม่ให้รหัส'
      : code.toUpperCase()!==String(hit.sku).toUpperCase() ? 'รหัสไม่ตรง'
      : Math.abs(myQty - hit.qty) <= Math.max(0.05, hit.qty*0.02) ? 'ตรง'
      : (String(l.unit||'').includes('เส้น') && String(hit.unit||'').includes('ชิ้น')) ? 'นับคนละหน่วย'
      : 'จำนวนต่าง';
    rows.push([ FLAG(same), p.name, cat, l.name, code, variants.filter(v=>v!==code.toUpperCase()).join(" · "), n2(l.unitPrice ?? ''), l.unit || '',
      n2(l.cat==='alu' ? myQty : (l.qty ?? '')), n2(l.amount ?? ''), sz,
      hit?(hit.sku||'—'):'', hit?n2(hit.qty):'', hit?(hit.unit||''):'', same, fileLabel ]);
  }
  // ⚠ แยก 2 กรณีของ "ใบตัดมี แต่ฝั่งคิดราคาไม่โผล่":
  //   (ก) สูตรไม่มีรหัสนี้เลย        → "คิดราคาไม่มีรายการนี้" (ต้องเติมของเข้าสูตร)
  //   (ข) สูตรมีบรรทัดนี้ แต่คิดออก 0 → "จำนวนต่าง" (เงื่อนไขในสูตรไม่เข้า ทั้งที่ใบตัดเบิกจริง)
  //   ถ้าเหมาเป็น (ก) ทั้งหมด จะขัดกับความจริง — validator จับได้ (เคส F7962 บานเฟี้ยมยูโร)
  const calcAllCodes = new Set();
  for (const it of (p.alu||[])) for (const c of skuVariants({}, { sku: it.code })) calcAllCodes.add(c);
  for (const g of ['hardware','consum']) for (const it of (p[g]||[])) for (const c of skuVariants({}, it)) calcAllCodes.add(c);
  const hwMissing = new Set((calc.hwMissing || []).map(m => String(m.sku||'').toUpperCase()));
  const cutOnlySt = (sku) => {
    const c = String(sku||'').toUpperCase();
    if (c && hwMissing.has(c)) return 'ราคามาจากสโตร์';
    if (c && FILE_MERGED[`${p.id}|${c}`]) return 'ไฟล์รวมบรรทัด';
    return (c && calcAllCodes.has(c)) ? 'จำนวนต่าง' : 'คิดราคาไม่มีรายการนี้';
  };
  cutList.forEach((c,ix)=>{ if(used.has(ix)) return;
    const st = cutOnlySt(c.sku);
    rows.push([ FLAG(st), p.name, 'มีแต่ในใบตัด', c.name, c.sku||'', '', '', c.unit||'', st==='จำนวนต่าง'?0:'', '', sz,
      c.sku||'—', n2(c.qty), c.unit||'', st, fileLabel ]); });
  for (const [c,e] of cutProf) { if (usedProf.has(c)) continue;
    const st = cutOnlySt(e.sku);
    rows.push([ FLAG(st), p.name, 'มีแต่ในใบตัด (อลู)', e.name, e.sku||'', '', '', e.unit||'', st==='จำนวนต่าง'?0:'', '', sz,
      e.sku, n2(e.qty), e.unit, st, fileLabel ]); }
  // เก็บผลของขนาดนี้เข้ากอง merge — คีย์ตามรหัส (ไม่มีรหัสใช้ชื่อ) เก็บอันที่สถานะ "ตรวจได้จริง" สุด
  for (const r of rows) {
    // ⚠ คีย์ต้องเป็น "รหัส" ล้วน ห้ามเอาหมวดมาผสม — ของชิ้นเดียวกันเปลี่ยนหมวดได้ระหว่างขนาด
    //   (ขนาดหนึ่งจำนวน 0 → ไปโผล่หมวด "มีแต่ในใบตัด" · อีกขนาดใช้จริง → หมวด "อลูมิเนียม")
    //   ถ้าใส่หมวดในคีย์ สองแถวนี้จะไม่ merge กัน แล้วขัดกันเองในไฟล์เดียว (validator จับได้ 7 จุด)
    const key = String(r[4] || r[11] || `ชื่อ:${r[3]}`).toUpperCase();
    const cur = merged.get(key);
    if (!cur || (RANK0[r[14]] ?? 99) < (RANK0[cur[14]] ?? 99)) merged.set(key, r);
  }
  }   // ← จบลูปยี่ห้อมือจับ
  }   // ← จบลูปขนาดตัวอย่าง

  // ⚠ ของที่ "ไม่โผล่เลยสักขนาดที่ลอง" — ไม่ใช่ของไม่ต้องทำ แต่คือ "ยังไม่ได้ตรวจ" (เจ้าของท้วง 1 ก.ย.69)
  //   เดิมติดป้าย "ไม่ต้องทำ" ทั้งที่ยังไม่เคยถูกเทียบกับใบตัดเลยแม้แต่ครั้งเดียว
  const rows = [...merged.values()];
  const fileLabel0 = rows[0]?.[15] ?? '';
  {
    const shown = new Set();
    for (const r of rows) for (const c of [String(r[4]||"").toUpperCase(), String(r[11]||"").toUpperCase()]) if (c) shown.add(c);
    for (const v of String(rows.map(r=>r[5]).join(" · ")).split("·")) { const t=v.trim().toUpperCase(); if (t) shown.add(t); }
    const seenX = new Set();
    const goodCodes = new Set();
    for (const r of rows) if (['ตรง','นับคนละหน่วย'].includes(r[14]))
      for (const c of [String(r[4]||'').toUpperCase(), String(r[11]||'').toUpperCase()]) if (c) goodCodes.add(c);
    for (const g of ["alu","hardware","consum"]) for (const it of (p[g]||[])) {
      // รหัสอลูเป็นสูตรเลือกตามสี/ความหนากระจกได้ → ต้องกางออก ไม่งั้นได้สูตรดิบมาโชว์เป็น "รหัส"
      const codes = g === "alu" ? skuVariants({}, { sku: it.code }) : skuVariants({}, it);
      for (const c of codes) {
        if (!c || shown.has(c) || seenX.has(c)) continue;
        seenX.add(c);
        // 21 ก.ย.69: ถ้าของชื่อเดียวกัน "ตรวจผ่านแล้ว" ที่รหัสอื่น (คนละสี/คนละตัวเลือก) ไม่ต้องให้เจ้าของไล่ซ้ำ
        // พี่น้อง = รหัสอื่นของ "ของชิ้นเดียวกัน" (สูตรเลือกตามสี/ความหนากระจก) หรือชื่อเดียวกันที่ตรวจผ่านแล้ว
        const twin = codes.some(c2 => goodCodes.has(c2)) || rows.some(r => r[3] === it.name && ['ตรง','นับคนละหน่วย'].includes(r[14]));
        const st0 = twin ? "รหัสสำรองตามสี" : "ยังไม่ได้ตรวจ";
        rows.push([ FLAG(st0), p.name, g==="alu"?"อลูมิเนียม":"อุปกรณ์/สิ้นเปลือง",
          it.name, c, "", n2(it.price ?? ""), it.unit || "",
          "", "", twin ? "— ตรวจแล้วที่รหัสพี่น้องชื่อเดียวกัน —" : "— ไม่โผล่ในขนาด/รูปแบบที่ลอง —", "", "", "",
          st0, fileLabel0 ]);
      }
    }
  }
  if (!rows.length) continue;
  fs.writeFileSync(path.join(outDir, safe(p.name)+'.csv'),
    '\ufeff' + [HEAD, ...rows].map(r=>r.map(esc).join(',')).join('\r\n') + '\r\n');
  all.push(...rows);
}
fs.writeFileSync(`docs/ผูกสโตร์-ทุกบาน-21ก.ย.69${SUFFIX}.csv`,
  '\ufeff' + [HEAD, ...all].map(r=>r.map(esc).join(',')).join('\r\n') + '\r\n');

// ── Excel: แท็บ "สรุป" + "รวมทุกบาน" + แท็บละบาน (เจ้าของเปิด CSV ไม่ได้) ──
const STATUS = ["ตรง","จำนวนต่าง","รหัสไม่ตรง","คิดราคายังไม่มีรหัส","ใบตัดไม่ให้รหัส","ใบตัดไม่มีรายการนี้","คิดราคาไม่มีรายการนี้","ยังไม่ได้ตรวจ","ใบตัดไม่ลงประเภทนี้","ยังไม่ผูกไฟล์", "นับคนละหน่วย", "ไฟล์รวมบรรทัด", "ราคามาจากสโตร์", "รหัสสำรองตามสี"];
const prodNames = [...new Set(all.map(r=>r[1]))];
const summary = [["รุ่น","แถวรวม", ...STATUS, "ไฟล์ตัดประกอบ"]];
for (const n of prodNames) {
  const rs = all.filter(r=>r[1]===n);
  summary.push([n, rs.length, ...STATUS.map(k=>rs.filter(r=>r[14]===k).length || ""), rs.find(r=>r[15])?.[15] || "— ไม่มีไฟล์ตัดประกอบ —"]);
}
const W = [13,22,14,34,16,11,12,10,10,12,16,16,13,13,22,26];
const sty = rs => [0, ...rs.map(r=>STYLE(r[14]))];
// เรียง "ต้องเช็คก่อน" ในแท็บรวมและแท็บต้องเช็ค
const RANK = { "รหัสไม่ตรง":0, "จำนวนต่าง":1, "คิดราคาไม่มีรายการนี้":2, "ใบตัดไม่มีรายการนี้":3, "คิดราคายังไม่มีรหัส":4, "ใบตัดไม่ให้รหัส":5, "ยังไม่ได้ตรวจ":6, "ตรง":7, "ใบตัดไม่ลงประเภทนี้":8, "ยังไม่ผูกไฟล์":9 };
const todo = all.filter(r=>RANK[r[14]] <= 6)
  .sort((a,b)=> RANK[a[14]]-RANK[b[14]] || String(a[1]).localeCompare(String(b[1]),"th"));
// แท็บอธิบาย — เจ้าของถาม 21 ก.ย.69 "ต้องเช็คคือไร เยอะไปไหม"
const HOWTO = [
  ["ป้าย", "แปลว่าอะไร", "ต้องทำอะไร"],
  ["✓ ผ่าน", "คิดราคากับใบตัดใช้รหัสเดียวกัน จำนวนตรงกัน", "ไม่ต้องทำอะไร"],
  ["⚪ ปกติ (คนละหน่วย)", "คิดราคานับ \"เส้น 6.4 ม. ที่ต้องซื้อ\" · ใบตัดนับ \"ท่อนที่ตัด\" — ของชิ้นเดียวกัน", "ไม่ต้องทำอะไร (ยอดเงินถูกตรวจโดยหน้าเทียบคิดราคา↔ใบตัดแล้ว)"],
  ["⚪ ปกติ (ไฟล์รวมบรรทัด)", "ไฟล์ถอดทุนรวม 2 บรรทัดเป็นบรรทัดเดียว เว็บตามไฟล์", "ไม่ต้องทำอะไร"],
  ["⚪ ตรวจแล้วที่รหัสพี่น้อง", "ของชิ้นเดียวกันคนละสี/คนละตัวเลือก ตรวจผ่านแล้วที่อีกรหัส", "ไม่ต้องทำอะไร"],
  ["⚪ ดูเฉย ๆ", "ใบตัดไม่ลงของประเภทนี้อยู่แล้ว (กระจก ซิลิโคน ค่าอบสี แผ่นไวนิล เพลทเหล็ก)", "ไม่ต้องทำอะไร"],
  ["🟡 ราคามาจากสโตร์", "ไฟล์ถอดทุนไม่ได้ตั้งราคาให้ เว็บไปดึงราคาจากสโตร์เอง", "เช็คว่าสโตร์ตั้งราคาไว้แล้ว ไม่งั้นจะคิดเป็น 0"],
  ["🔵 เช็คว่าคิดเกินไหม", "คิดราคาคิดเงินของชิ้นนี้ แต่ใบตัดไม่ได้เบิก", "ดูว่าของจริงใช้ไหม ถ้าไม่ใช้ = คิดเกิน"],
  ["🟠 ต้องเติม", "ใบตัดเบิกของ แต่คิดราคาไม่ได้คิดเงิน", "ดูว่าควรคิดเงินไหม (ไฟล์ถอดทุนไม่มีบรรทัดนี้)"],
  ["🟡 ต้องเคาะ", "คิดราคายังไม่มีรหัสสโตร์ให้ของชิ้นนี้", "เจ้าของบอกรหัส แล้วผมผูกให้"],
  ["🟣 ยังไม่ได้ตรวจ", "ของชิ้นนี้ไม่โผล่ในขนาด/รูปแบบที่รายงานสุ่มลอง", "ยังไม่ต้องทำ — ไม่ได้แปลว่าพัง"],
  ["⚪ ยังตรวจไม่ได้", "รุ่นนี้ยังไม่มีไฟล์ตัดประกอบ เลยไม่มีอะไรให้เทียบ", "รอไฟล์ตัดของรุ่นนั้น"],
];
const sheets = [
  { name:"อ่านยังไง", rows:HOWTO, widths:[24,66,54] },
  { name:"🔴 ต้องเช็ค", rows:[HEAD, ...todo], widths:W, rowStyles:sty(todo) },
  { name:"สรุป", rows:summary, widths:[30,9,7,10,10,10,14,12,16,16,12,26] },
  { name:"รวมทุกบาน", rows:[HEAD, ...all], widths:W, rowStyles:sty(all) },
  ...prodNames.map(n=>{ const rs=all.filter(r=>r[1]===n); return { name:n, rows:[HEAD, ...rs], widths:W, rowStyles:sty(rs) }; }),
];
writeXlsx(`docs/ผูกสโตร์-ทุกบาน-21ก.ย.69${SUFFIX}.xlsx`, sheets);
console.log("Excel:", sheets.length, "แท็บ · แถวที่ต้องเช็ค", todo.length);
const c = k => all.filter(r=>r[14]===k).length;
console.log('รุ่น', fs.readdirSync(outDir).length, '· แถวรวม', all.length);
for (const k of ['ตรง','รหัสไม่ตรง','ใบตัดไม่มีรายการนี้','คิดราคาไม่มีรายการนี้','คิดราคายังไม่มีรหัส','ใบตัดไม่ให้รหัส','ยังไม่ผูกไฟล์'])
  console.log('  '+k+' = '+c(k));
