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
  "คิดราคาไม่มีรายการนี้": { flag:"🟠 ต้องเติม",  style:S.ORANGE },
  "คิดราคายังไม่มีรหัส":  { flag:"🟡 ต้องเคาะ",  style:S.YELLOW },
  "ใบตัดไม่ให้รหัส":     { flag:"🟡 ต้องเคาะ",  style:S.YELLOW },
  "ตรง":               { flag:"✓ ผ่าน",       style:S.GREEN },
  "ใบตัดไม่มีรายการนี้":  { flag:"🔵 เช็คว่าคิดเกินไหม", style:S.BLUE },
  "ใบตัดไม่ลงประเภทนี้":  { flag:"⚪ ดูเฉย ๆ",      style:S.GREY },
  "ยังไม่ผูกไฟล์":       { flag:"⚪ ยังตรวจไม่ได้", style:S.GREY },
  "ไม่ได้ใช้ที่ขนาดนี้":   { flag:"⚪ ดูเฉย ๆ",      style:S.GREY },
};
const FLAG = st => (LEVEL[st]?.flag) || "";
const STYLE = st => (LEVEL[st]?.style) ?? 0;
const esc = v => { const s=String(v??''); return /[",\n]/.test(s) ? '"'+s.replace(/"/g,'""')+'"' : s; };
const SUFFIX = process.argv[2] || '';   // เลี่ยงไฟล์ถูกล็อกตอนเจ้าของเปิดค้างใน Excel
const outDir = 'docs/csv-ผูกสโตร์';
fs.rmSync(outDir, { recursive:true, force:true }); fs.mkdirSync(outDir, { recursive:true });
const safe = s => String(s).replace(/[\/:*?"<>|]/g,'-');
const all = [];

for (const p of Object.values(PRODUCTS)) {
  if (p.id === 'sms_slide') continue;
  const d = p.defaults || { w:150, h:150, p:1 };
  const sz = `${d.w}×${d.h} ${d.p||1} บาน`;
  let calc; try {
    calc = computeCost(PB, p, { w:d.w, h:d.h, p:d.p||1, form:p.defForm, color:'white', colorKey:'white' });
  } catch { continue; }
  const sn = MAP[p.id];
  // ใช้ตัวแปลง "คิดราคา → ใบตัด" ตัวจริง (from-recipe) ก่อน — ตัวเดียวกับหน้าเทียบ
  //   ถ้าเดา input เอง (แค่ยัด W/H/N) รุ่นที่ใบตัดนับคนละฐาน (เลื่อนยูโร ฯลฯ) จะออกมาผิดเป็นกอง
  let spec = sn ? CUTP[sn] : null, co = null;
  const rec = cutInputFromRecipe({ kind:'std', prodId:p.id, w:d.w, h:d.h, p:d.p||1,
    form:p.defForm, spec:{}, glassType:p.defGlass }, { rawCompare:true });
  if (rec && CUT_SPEC_BY_ID[rec.spec_id]) { spec = CUT_SPEC_BY_ID[rec.spec_id]; co = { ...spec.defaults, ...rec.input }; }
  else if (spec) co = { ...spec.defaults, W:d.w, H:d.h, N:d.p||1 };
  const mult = (rec && rec.multiplier) || 1;
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
    if (i>=0) { used.add(i); hitOf.set(l, cutList[i]); }
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
    const notInCutByNature = l.cat === 'glass' || /ซิลิโคน|ค่าอบ|ค่าดัด|ปัดขึ้น/.test(String(l.name));
    const same = !spec ? 'ยังไม่ผูกไฟล์' : !hit ? (notInCutByNature ? 'ใบตัดไม่ลงประเภทนี้' : 'ใบตัดไม่มีรายการนี้')
      : !code ? 'คิดราคายังไม่มีรหัส' : !hit.sku ? 'ใบตัดไม่ให้รหัส'
      : code.toUpperCase()!==String(hit.sku).toUpperCase() ? 'รหัสไม่ตรง'
      : Math.abs(myQty - hit.qty) <= Math.max(0.05, hit.qty*0.02) ? 'ตรง' : 'จำนวนต่าง';
    rows.push([ FLAG(same), p.name, cat, l.name, code, variants.filter(v=>v!==code.toUpperCase()).join(" · "), n2(l.unitPrice ?? ''), l.unit || '',
      n2(l.cat==='alu' ? myQty : (l.qty ?? '')), n2(l.amount ?? ''), sz,
      hit?(hit.sku||'—'):'', hit?n2(hit.qty):'', hit?(hit.unit||''):'', same, fileLabel ]);
  }
  cutList.forEach((c,ix)=>{ if(used.has(ix)) return;
    rows.push([ FLAG("คิดราคาไม่มีรายการนี้"), p.name, 'มีแต่ในใบตัด', c.name, c.sku||'', '', '', c.unit||'', '', '', sz,
      c.sku||'—', n2(c.qty), c.unit||'', 'คิดราคาไม่มีรายการนี้', fileLabel ]); });
  for (const [c,e] of cutProf) { if (usedProf.has(c)) continue;
    rows.push([ FLAG("คิดราคาไม่มีรายการนี้"), p.name, 'มีแต่ในใบตัด (อลู)', e.name, e.sku||'', '', '', e.unit||'', '', '', sz,
      e.sku, n2(e.qty), e.unit, 'คิดราคาไม่มีรายการนี้', fileLabel ]); }
  // ⚠ ของที่สูตรมีแต่ "จำนวน = 0" ที่ขนาดตัวอย่าง (เช่น เสาเปิดกลาง ใช้เฉพาะ 2 บานขึ้นไป)
  //   ต้องโชว์ด้วย ไม่งั้นเจ้าของไม่มีทางรู้ว่ารุ่นนี้ยังใช้รหัสอะไรอีก — "หายเงียบ" คือบั๊กที่แย่ที่สุด
  {
    const shown = new Set();
    for (const r of rows) for (const c of [String(r[4]||"").toUpperCase(), String(r[11]||"").toUpperCase()]) if (c) shown.add(c);
    for (const v of String(rows.map(r=>r[5]).join(" · ")).split("·")) { const t=v.trim().toUpperCase(); if (t) shown.add(t); }
    const seenX = new Set();
    for (const g of ["alu","hardware","consum"]) for (const it of (p[g]||[])) {
      // รหัสอลูเป็นสูตรเลือกตามสี/ความหนากระจกได้ → ต้องกางออก ไม่งั้นได้สูตรดิบมาโชว์เป็น "รหัส"
      const codes = g === "alu" ? skuVariants({}, { sku: it.code }) : skuVariants({}, it);
      for (const c of codes) {
        if (!c || shown.has(c) || seenX.has(c)) continue;
        seenX.add(c);
        rows.push([ FLAG("ไม่ได้ใช้ที่ขนาดนี้"), p.name, g==="alu"?"อลูมิเนียม (ไม่ได้ใช้)":"อุปกรณ์ (ไม่ได้ใช้)",
          it.name, c, "", n2(it.price ?? ""), it.unit || "", 0, 0, sz, "", "", "",
          "ไม่ได้ใช้ที่ขนาดนี้", fileLabel ]);
      }
    }
  }
  if (!rows.length) continue;
  fs.writeFileSync(path.join(outDir, safe(p.name)+'.csv'),
    '\ufeff' + [HEAD, ...rows].map(r=>r.map(esc).join(',')).join('\r\n') + '\r\n');
  all.push(...rows);
}
fs.writeFileSync(`docs/ผูกสโตร์-ทุกบาน-1ก.ย.69${SUFFIX}.csv`,
  '\ufeff' + [HEAD, ...all].map(r=>r.map(esc).join(',')).join('\r\n') + '\r\n');

// ── Excel: แท็บ "สรุป" + "รวมทุกบาน" + แท็บละบาน (เจ้าของเปิด CSV ไม่ได้) ──
const STATUS = ["ตรง","จำนวนต่าง","รหัสไม่ตรง","คิดราคายังไม่มีรหัส","ใบตัดไม่ให้รหัส","ใบตัดไม่มีรายการนี้","คิดราคาไม่มีรายการนี้","ใบตัดไม่ลงประเภทนี้","ยังไม่ผูกไฟล์","ไม่ได้ใช้ที่ขนาดนี้"];
const prodNames = [...new Set(all.map(r=>r[1]))];
const summary = [["รุ่น","แถวรวม", ...STATUS, "ไฟล์ตัดประกอบ"]];
for (const n of prodNames) {
  const rs = all.filter(r=>r[1]===n);
  summary.push([n, rs.length, ...STATUS.map(k=>rs.filter(r=>r[14]===k).length || ""), rs.find(r=>r[15])?.[15] || "— ไม่มีไฟล์ตัดประกอบ —"]);
}
const W = [13,22,14,34,16,11,12,10,10,12,16,16,13,13,22,26];
const sty = rs => [0, ...rs.map(r=>STYLE(r[14]))];
// เรียง "ต้องเช็คก่อน" ในแท็บรวมและแท็บต้องเช็ค
const RANK = { "รหัสไม่ตรง":0, "จำนวนต่าง":1, "คิดราคาไม่มีรายการนี้":2, "ใบตัดไม่มีรายการนี้":3, "คิดราคายังไม่มีรหัส":4, "ใบตัดไม่ให้รหัส":5, "ตรง":6, "ใบตัดไม่ลงประเภทนี้":7, "ยังไม่ผูกไฟล์":8, "ไม่ได้ใช้ที่ขนาดนี้":9 };
const todo = all.filter(r=>RANK[r[14]] <= 5)
  .sort((a,b)=> RANK[a[14]]-RANK[b[14]] || String(a[1]).localeCompare(String(b[1]),"th"));
const sheets = [
  { name:"🔴 ต้องเช็ค", rows:[HEAD, ...todo], widths:W, rowStyles:sty(todo) },
  { name:"สรุป", rows:summary, widths:[30,9,7,10,10,10,14,12,16,16,12,26] },
  { name:"รวมทุกบาน", rows:[HEAD, ...all], widths:W, rowStyles:sty(all) },
  ...prodNames.map(n=>{ const rs=all.filter(r=>r[1]===n); return { name:n, rows:[HEAD, ...rs], widths:W, rowStyles:sty(rs) }; }),
];
writeXlsx(`docs/ผูกสโตร์-ทุกบาน-1ก.ย.69${SUFFIX}.xlsx`, sheets);
console.log("Excel:", sheets.length, "แท็บ · แถวที่ต้องเช็ค", todo.length);
const c = k => all.filter(r=>r[14]===k).length;
console.log('รุ่น', fs.readdirSync(outDir).length, '· แถวรวม', all.length);
for (const k of ['ตรง','รหัสไม่ตรง','ใบตัดไม่มีรายการนี้','คิดราคาไม่มีรายการนี้','คิดราคายังไม่มีรหัส','ใบตัดไม่ให้รหัส','ยังไม่ผูกไฟล์'])
  console.log('  '+k+' = '+c(k));
