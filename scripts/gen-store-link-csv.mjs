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
import { createRequire } from 'node:module';
import { writeXlsx } from './xlsxwrite.mjs';
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

const norm = s => String(s||'').replace(/[\s\-–—()"'·.]/g,'').toLowerCase();
const val = (f,o) => { try { return typeof f==='function' ? f(o) : f; } catch { return ''; } };
const n2 = v => (typeof v === "number" && Number.isFinite(v)) ? Math.round(v*100)/100 : v;   // เลขทศนิยมยาว ๆ อ่านไม่รู้เรื่องใน Excel
const HEAD = ['รุ่น','หมวด','ชื่อรายการ','รหัสสโตร์','มีรหัสไหม','ราคา/หน่วย','หน่วย','จำนวน','ยอดเงิน',
  'ขนาดที่ใช้คิด','รหัสในใบตัด','จำนวนในใบตัด','ตรงกันไหม','ไฟล์ตัดประกอบ'];
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
  const sn = MAP[p.id], spec = sn ? CUTP[sn] : null;
  const co = spec ? { ...spec.defaults, W:d.w, H:d.h, N:d.p||1 } : null;
  const cutList = [];
  if (spec) for (const h of (spec.hardware||[])) {
    const q = Number(val(h.qty,co))||0; if (q<=0) continue;
    cutList.push({ name:String(val(h.name,co)), sku:String(val(h.sku,co)||''), qty:q, unit:h.unit||'' });
  }
  const used = new Set();
  const rows = [];
  for (const l of (calc.lines||[])) {
    if (l.cat === 'labor') continue;
    const cat = l.cat==='alu' ? 'อลูมิเนียม' : l.cat==='glass' ? 'กระจก' : 'อุปกรณ์/สิ้นเปลือง';
    const code = String(l.code || l.sku || '');
    const i = cutList.findIndex((c,ix)=>!used.has(ix) && (norm(c.name)===norm(l.name)
      || norm(c.name).includes(norm(l.name)) || norm(l.name).includes(norm(c.name))));
    const hit = i>=0 ? (used.add(i), cutList[i]) : null;
    const same = !spec ? 'ยังไม่ผูกไฟล์' : !hit ? 'ใบตัดไม่มีรายการนี้'
      : !code ? 'คิดราคายังไม่มีรหัส' : !hit.sku ? 'ใบตัดไม่ให้รหัส'
      : code.toUpperCase()===hit.sku.toUpperCase() ? 'ตรง' : 'รหัสไม่ตรง';
    rows.push([ p.name, cat, l.name, code, code?'มี':'ยังไม่มี', n2(l.unitPrice ?? ''), l.unit || '',
      n2(l.qty ?? ''), n2(l.amount ?? ''), sz, hit?(hit.sku||'—'):'', hit?n2(hit.qty):'', same, sn?FILEOF[sn]:'' ]);
  }
  cutList.forEach((c,ix)=>{ if(used.has(ix)) return;
    rows.push([ p.name, 'มีแต่ในใบตัด', c.name, '', 'ยังไม่มี', '', c.unit, '', '', sz,
      c.sku||'—', n2(c.qty), 'คิดราคาไม่มีรายการนี้', FILEOF[sn] ]); });
  if (!rows.length) continue;
  fs.writeFileSync(path.join(outDir, safe(p.name)+'.csv'),
    '\ufeff' + [HEAD, ...rows].map(r=>r.map(esc).join(',')).join('\r\n') + '\r\n');
  all.push(...rows);
}
fs.writeFileSync(`docs/ผูกสโตร์-ทุกบาน-1ก.ย.69${SUFFIX}.csv`,
  '\ufeff' + [HEAD, ...all].map(r=>r.map(esc).join(',')).join('\r\n') + '\r\n');

// ── Excel: แท็บ "สรุป" + "รวมทุกบาน" + แท็บละบาน (เจ้าของเปิด CSV ไม่ได้) ──
const STATUS = ["ตรง","รหัสไม่ตรง","คิดราคายังไม่มีรหัส","ใบตัดไม่ให้รหัส","ใบตัดไม่มีรายการนี้","คิดราคาไม่มีรายการนี้","ยังไม่ผูกไฟล์"];
const prodNames = [...new Set(all.map(r=>r[0]))];
const summary = [["รุ่น","แถวรวม", ...STATUS, "ไฟล์ตัดประกอบ"]];
for (const n of prodNames) {
  const rs = all.filter(r=>r[0]===n);
  summary.push([n, rs.length, ...STATUS.map(k=>rs.filter(r=>r[12]===k).length || ""), rs.find(r=>r[13])?.[13] || "— ไม่มีไฟล์ตัดประกอบ —"]);
}
const W = [22,12,34,16,11,12,10,10,12,16,16,13,22,26];
const sheets = [
  { name:"สรุป", rows:summary, widths:[30,9,7,10,14,12,16,16,12,26] },
  { name:"รวมทุกบาน", rows:[HEAD, ...all], widths:W },
  ...prodNames.map(n=>({ name:n, rows:[HEAD, ...all.filter(r=>r[0]===n)], widths:W })),
];
writeXlsx(`docs/ผูกสโตร์-ทุกบาน-1ก.ย.69${SUFFIX}.xlsx`, sheets);
console.log("Excel:", sheets.length, "แท็บ");
const c = k => all.filter(r=>r[12]===k).length;
console.log('รุ่น', fs.readdirSync(outDir).length, '· แถวรวม', all.length);
for (const k of ['ตรง','รหัสไม่ตรง','ใบตัดไม่มีรายการนี้','คิดราคาไม่มีรายการนี้','คิดราคายังไม่มีรหัส','ใบตัดไม่ให้รหัส','ยังไม่ผูกไฟล์'])
  console.log('  '+k+' = '+c(k));
