/**
 * verify-store-link-report — ตรวจว่า "รายงานผูกสโตร์" ขัดแย้งกันเองไหม
 *
 * ทำไมต้องมี (เจ้าของท้วง 1 ก.ย.69):
 *   รายงานเคยบอกว่า "มือจับ Align JR00378 → ใบตัดไม่มีรายการนี้" พร้อมกับ
 *   "มือจับ ล็อค (Align) JR00378 → คิดราคาไม่มีรายการนี้" ในบานเดียวกัน
 *   รหัสเดียวกันแท้ ๆ แต่พูดสวนกันเอง — เจ้าของต้องมานั่งจับผิดเอง แก้ทีละจุดไม่มีวันจบ
 *   → ตัวนี้ไล่ทุกบาน ทุกแถว เทียบกับ "ของจริง" (สูตรคิดราคา + สเปกใบตัด) แล้วฟ้องเอง
 *
 * ตรวจแยกจากตัวออกรายงาน: อ่าน CSV ที่ออกมาแล้ว + คำนวณชุดรหัสจากต้นทางใหม่เอง
 *   ถ้าตัวออกรายงานจับคู่ผิด ตัวนี้จะจับได้ (ไม่ได้ใช้โค้ดจับคู่ตัวเดียวกัน)
 *
 *   node --import tsx scripts/verify-store-link-report.mjs [ไฟล์.csv]
 */
import fs from 'node:fs';
import { PRODUCTS } from '../src/lib/calculator40/products.mjs';
import { computeCost } from '../src/lib/calculator40/engine.mjs';
import { CUT_SPEC_BY_ID } from '../src/lib/cutlist/products.ts';
import * as CUTP from '../src/lib/cutlist/products.ts';
import { cutInputFromRecipe } from '../src/lib/cutlist/from-recipe.ts';
import { createRequire } from 'node:module';
const PB = createRequire(import.meta.url)('../src/lib/calculator40/pricebook.json');

const MAP = { awning:'FUJI_SWING', open_door:'FUJI_DOOR', bansolid:'SOLID_DOOR', topslide:'TOPRAIL_FRAME',
  pcdoor:'PC_DOOR', velora:'VELORA_SWING', fixed:'FIXED_PANEL', slimlux:'SLIMLUX_SLIDE',
  folding:'SMS240_BIFOLD', fold_euro:'EURO_BIFOLD', fold_lift:'EURO_LIFT', banyok:'FUJI_HUNG',
  gate:'GATE_SLIDE', euro_slide:'FUJI_SLIDE' };

const val = (f,o) => { try { return typeof f==='function' ? f(o) : f; } catch { return ''; } };
const up = s => String(s||'').trim().toUpperCase();
const isCode = t => /^(JR\d{5}|[A-Z]{1,4}-?\d{3,5}[A-Z]?|OPK-[A-Z0-9-]+|XSW\d+|HD-\d+)$/i.test(t);

/** ชุดรหัสฝั่งคิดราคา (รวมรหัสทุกสีจากสูตร sku) + ฝั่งใบตัด ต่อรุ่น */
function codeSetsOf(p) {
  const calc = new Set(), cut = new Set();
  for (const g of ['hardware','consum']) for (const it of (p[g]||[])) {
    const raw = String(it.sku ?? '');
    if (raw.includes('?')) for (const m of raw.matchAll(/'([^']+)'|"([^"]+)"/g)) {
      const t = m[1] ?? m[2]; if (isCode(t)) calc.add(up(t));
    } else if (raw) calc.add(up(raw));
  }
  for (const a of (p.alu||[])) {
    const raw = String(a.code ?? '');
    if (raw.includes('?')) for (const m of raw.matchAll(/'([^']+)'|"([^"]+)"/g)) { const t=m[1]??m[2]; if (isCode(t)) calc.add(up(t)); }
    else if (raw) calc.add(up(raw));
  }
  const d = p.defaults || { w:150, h:150, p:1 };
  let spec = MAP[p.id] ? CUTP[MAP[p.id]] : null, co = null, mult = 1;
  const rec = cutInputFromRecipe({ kind:'std', prodId:p.id, w:d.w, h:d.h, p:d.p||1,
    form:p.defForm, spec:{}, glassType:p.defGlass }, { rawCompare:true });
  if (rec && CUT_SPEC_BY_ID[rec.spec_id]) { spec = CUT_SPEC_BY_ID[rec.spec_id]; co = { ...spec.defaults, ...rec.input }; mult = rec.multiplier||1; }
  else if (spec) co = { ...spec.defaults, W:d.w, H:d.h, N:d.p||1 };
  if (spec) {
    for (const h of (spec.hardware||[])) {
      if ((Number(val(h.qty,co))||0)*mult <= 0) continue;
      const s = up(val(h.sku,co)); if (s) cut.add(s);
    }
    for (const pr of (spec.profiles||[])) {
      if ((Number(val(pr.qty,co))||0)*mult <= 0) continue;
      const c = up(val(pr.code,co)); if (c && c !== '-') cut.add(c);
    }
  }
  return { calc, cut, hasSpec: !!spec };
}

// ── อ่าน CSV (มี BOM · มีฟิลด์ครอบ ") ──
function readCsv(file) {
  const txt = fs.readFileSync(file, 'utf8').replace(/^﻿/, '');
  const rows = []; let row = [], cell = '', q = false;
  for (let i = 0; i < txt.length; i++) {
    const ch = txt[i];
    if (q) { if (ch === '"') { if (txt[i+1] === '"') { cell += '"'; i++; } else q = false; } else cell += ch; continue; }
    if (ch === '"') { q = true; continue; }
    if (ch === ',') { row.push(cell); cell = ''; continue; }
    if (ch === '\r') continue;
    if (ch === '\n') { row.push(cell); rows.push(row); row = []; cell = ''; continue; }
    cell += ch;
  }
  if (cell || row.length) { row.push(cell); rows.push(row); }
  return rows.filter(r => r.length > 1);
}

const file = process.argv[2] || fs.readdirSync('docs').filter(f=>/^ผูกสโตร์-ทุกบาน.*\.csv$/.test(f)).sort().pop();
const path = file.includes('/') ? file : 'docs/' + file;
const rows = readCsv(path);
const H = rows[0];
const C = Object.fromEntries(H.map((h,i)=>[h,i]));
const need = ['ต้องเช็ค','รุ่น','ชื่อรายการ','รหัส (คิดราคา)','รหัส (ใบตัด)','ตรงกันไหม'];
for (const k of need) if (C[k] == null) { console.error('❌ ไม่มีคอลัมน์ "'+k+'" ในไฟล์ '+path); process.exit(1); }

const byName = new Map(Object.values(PRODUCTS).map(p => [p.name, p]));
const sets = new Map();
const bad = [];
const push = (kind, r, why) => bad.push({ kind, prod:r[C['รุ่น']], item:r[C['ชื่อรายการ']],
  a:r[C['รหัส (คิดราคา)']], b:r[C['รหัส (ใบตัด)']], st:r[C['ตรงกันไหม']], why });

// ① แถวต่อแถว — สถานะต้องไม่ขัดกับของจริง
for (const r of rows.slice(1)) {
  const p = byName.get(r[C['รุ่น']]); if (!p) continue;
  if (!sets.has(p.id)) sets.set(p.id, codeSetsOf(p));
  const { calc, cut, hasSpec } = sets.get(p.id);
  const a = up(r[C['รหัส (คิดราคา)']]), b = up(r[C['รหัส (ใบตัด)']]), st = r[C['ตรงกันไหม']];

  if (st === 'ใบตัดไม่มีรายการนี้' && a && cut.has(a))
    push('ขัดกันเอง', r, `บอกว่าใบตัดไม่มี แต่ใบตัดมีรหัส ${a} อยู่จริง`);
  if (st === 'คิดราคาไม่มีรายการนี้' && b && calc.has(b))
    push('ขัดกันเอง', r, `บอกว่าคิดราคาไม่มี แต่สูตรคิดราคามีรหัส ${b} อยู่จริง`);
  if (st === 'ตรง' && a && b && a !== b)
    push('ติดป้ายผิด', r, `ขึ้นว่า "ตรง" ทั้งที่รหัสคนละตัว (${a} vs ${b})`);
  if (st === 'รหัสไม่ตรง' && a && b && a === b)
    push('ติดป้ายผิด', r, `ขึ้นว่า "รหัสไม่ตรง" ทั้งที่รหัสเดียวกัน (${a})`);
  if (st === 'ยังไม่ผูกไฟล์' && hasSpec)
    push('ติดป้ายผิด', r, 'ขึ้นว่าไม่มีไฟล์ใบตัด ทั้งที่รุ่นนี้ผูกสเปกใบตัดไว้แล้ว');
  if (st === 'คิดราคายังไม่มีรหัส' && a)
    push('ติดป้ายผิด', r, `ขึ้นว่ายังไม่มีรหัส ทั้งที่ช่องรหัสมี ${a}`);
}

// ② รหัสเดียวกันในบานเดียวกัน ต้องไม่โผล่ทั้งฝั่ง "ใบตัดไม่มี" และ "คิดราคาไม่มี"
const seen = new Map();   // รุ่น|รหัส -> [สถานะ]
for (const r of rows.slice(1)) {
  for (const code of [up(r[C['รหัส (คิดราคา)']]), up(r[C['รหัส (ใบตัด)']])]) {
    if (!code) continue;
    const k = r[C['รุ่น']] + '|' + code;
    if (!seen.has(k)) seen.set(k, []);
    seen.get(k).push({ st:r[C['ตรงกันไหม']], item:r[C['ชื่อรายการ']] });
  }
}
for (const [k, list] of seen) {
  const st = new Set(list.map(x=>x.st));
  if (st.has('ใบตัดไม่มีรายการนี้') && st.has('คิดราคาไม่มีรายการนี้')) {
    const [prod, code] = k.split('|');
    bad.push({ kind:'ขัดกันเอง', prod, item:list.map(x=>x.item).join(' / '), a:code, b:code,
      st:[...st].join(' + '), why:`รหัส ${code} โผล่ 2 แถวในบานเดียวกัน แถวหนึ่งบอกใบตัดไม่มี อีกแถวบอกคิดราคาไม่มี` });
  }
}

// ③ ห้ามมีของหาย — ทุกรหัสในสูตร และทุกรหัสในใบตัด ต้องโผล่ในรายงานของบานนั้น
//    (บั๊กที่น่ากลัวที่สุดคือ "ตกไปเงียบ ๆ" เพราะเจ้าของไม่มีทางรู้ว่าขาด)
const rowsByProd = new Map();
for (const r of rows.slice(1)) {
  const k = r[C['รุ่น']];
  if (!rowsByProd.has(k)) rowsByProd.set(k, new Set());
  for (const c of [up(r[C['รหัส (คิดราคา)']]), up(r[C['รหัส (ใบตัด)']])]) if (c) rowsByProd.get(k).add(c);
  for (const c of String(r[C['รหัสอื่นตามสี']] ?? '').split('·')) { const t = up(c); if (t) rowsByProd.get(k).add(t); }
}
for (const [name, p] of byName) {
  if (p.id === 'sms_slide') continue;
  const inReport = rowsByProd.get(name);
  if (!inReport) continue;                       // รุ่นที่คิดราคาไม่ออก — ข้ามไปแล้วตั้งแต่ตอนออกรายงาน
  if (!sets.has(p.id)) sets.set(p.id, codeSetsOf(p));
  const { calc, cut } = sets.get(p.id);
  for (const c of calc) if (!inReport.has(c))
    bad.push({ kind:'ของหาย', prod:name, item:'(รหัสในสูตรคิดราคา)', a:c, b:'', st:'',
      why:`รหัส ${c} อยู่ในสูตรคิดราคา แต่ไม่โผล่ในรายงานเลย` });
  for (const c of cut) if (!inReport.has(c))
    bad.push({ kind:'ของหาย', prod:name, item:'(รหัสในใบตัด)', a:'', b:c, st:'',
      why:`รหัส ${c} อยู่ในใบตัด แต่ไม่โผล่ในรายงานเลย` });
}

// ④ ตัวเลขต้องสอดคล้องกับป้าย — "ตรง" ห้ามจำนวนต่าง · "จำนวนต่าง" ห้ามจำนวนเท่ากัน
const iQ = C['จำนวน'], iCQ = C['จำนวนในใบตัด'];
if (iQ != null && iCQ != null) for (const r of rows.slice(1)) {
  const st = r[C['ตรงกันไหม']];
  const a = Number(r[iQ]), b = Number(r[iCQ]);
  if (!Number.isFinite(a) || !Number.isFinite(b)) continue;
  const near = Math.abs(a-b) <= Math.max(0.05, b*0.02);
  if (st === 'ตรง' && !near) push('ติดป้ายผิด', r, `ขึ้นว่า "ตรง" แต่จำนวนต่างกัน (${a} vs ${b})`);
  if (st === 'จำนวนต่าง' && near) push('ติดป้ายผิด', r, `ขึ้นว่า "จำนวนต่าง" แต่จำนวนเท่ากัน (${a} vs ${b})`);
}

// ⑤ รหัสเดียวกันในบานเดียวกัน ห้ามโผล่ซ้ำหลายแถวฝั่งคิดราคา (ต้องรวมให้แล้ว)
const dup = new Map();
for (const r of rows.slice(1)) {
  const c = up(r[C['รหัส (คิดราคา)']]); if (!c) continue;
  if (String(r[C['หมวด']]).startsWith('มีแต่ในใบตัด')) continue;
  const k = r[C['รุ่น']] + '|' + c;
  dup.set(k, (dup.get(k)||0) + 1);
}
for (const [k, n] of dup) if (n > 1) {
  const [prod, code] = k.split('|');
  bad.push({ kind:'ซ้ำซ้อน', prod, item:'(ฝั่งคิดราคา)', a:code, b:'', st:'',
    why:`รหัส ${code} โผล่ ${n} แถวฝั่งคิดราคา — ต้องรวมเป็นแถวเดียวก่อนเทียบ` });
}

// ── รายงาน ──
console.log('\n═══ ตรวจรายงานผูกสโตร์: ' + path + ' ═══');
console.log('แถวข้อมูล ' + (rows.length-1) + ' · รุ่น ' + new Set(rows.slice(1).map(r=>r[C['รุ่น']])).size);
if (!bad.length) { console.log('\n✅ ไม่พบจุดขัดกันเอง'); process.exit(0); }
const byKind = {};
for (const b of bad) (byKind[b.kind] ||= []).push(b);
for (const k of Object.keys(byKind)) {
  console.log('\n❌ ' + k + ' — ' + byKind[k].length + ' จุด');
  for (const b of byKind[k].slice(0, 40)) console.log(`   [${b.prod}] ${b.item} · ${b.why}`);
  if (byKind[k].length > 40) console.log('   … อีก ' + (byKind[k].length-40) + ' จุด');
}
console.log('\n═══ รวม ❌ ' + bad.length + ' จุด ═══');
process.exit(1);
