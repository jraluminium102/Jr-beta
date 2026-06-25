#!/usr/bin/env node
// check-g6.mjs — ตรวจงาน G6 (กั้นห้องกระจก) เทียบดราฟ/มติ + ออกรายงานรวม (repeatable)
// G6 = paged room builder (.g6room / G6R) โครงต่างจาก G1-G5 (per-item .i-prod/.o-*)
// → ไม่ clone check-g1 · เป็น meta-runner รวมชุดเทสเฉพาะห้อง = 6 มิติ + audit (เช็คซ้ำแล้ว)
// ใช้: node scripts/check-g6.mjs [วันที่]
import { execSync } from 'node:child_process';
import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const DATE = process.argv[2] || '2026-06-17';

function run(cmd){ try { return { ok:true, out:execSync(cmd,{cwd:ROOT,encoding:'utf8',stdio:['ignore','pipe','pipe']}) }; }
  catch(e){ return { ok:false, out:(e.stdout||'')+(e.stderr||'') }; } }
function tail(s,n=1){ return s.trim().split('\n').slice(-n).join(' ').trim(); }
function pass(s){ const m=s.match(/(\d+)\s*\/\s*(\d+)/); return m?(m[1]===m[2]):/ไม่มีความเปลี่ยนแปลง|ปลอดภัย|OK/.test(s); }

// 6 มิติ G6 ← ชุดเทสเฉพาะห้อง (มิติ = สิ่งที่ตรวจ · cmd = หลักฐาน)
const CHECKS = [
  { dim:'3 · ราคา (กันเพี้ยนทั้งระบบ)', cmd:'node scripts/golden-snapshot.mjs', note:'golden baseline 149 ตัว — แก้ engine ร่วมแล้วราคาไม่ขยับ' },
  { dim:'1+2 · ปุ่ม/ออปชั่นบาน + parity ราคา G1', cmd:'node test/g6-room-options.mjs', note:'ชนิดบาน/รุ่น/มือจับ/ครอบวงกบ/ธรณี ในห้อง = เท่า G1' },
  { dim:'5 · ใบแตกรายบาน (รายการงาน)', cmd:'node test/g6-room-quote-detail.mjs', note:'ด้าน/บาน/ออปชั่น แตกบรรทัดถูก ขึ้น work block' },
  { dim:'4+6 · อุปกรณ์เสริม + เทสราคาขยับ', cmd:'node test/g6-floor-fan.mjs', note:'งานพื้น 5,000/ตร.ม. ลด10% · พัดลม custom · กดแล้วราคาขยับจริง' },
  { dim:'2 · มุ้ง + ผ้ามุ้ง (เฟส B)', cmd:'node test/g6-phaseB-flags.mjs', note:'มุ้งเฟรม/จีบ/ม้วน + กันแมว/หนู/นิรภัย = ผ้ามุ้ง' },
];

const results = CHECKS.map(c=>{ const r=run(c.cmd); return { ...c, ok:r.ok&&pass(r.out), line:tail(r.out, /golden/.test(c.cmd)?1:1) }; });
const allPass = results.every(r=>r.ok);

// audit (เช็คซ้ำแล้ว · D3/D4 agent over-flag → กรอง) — 🔴 ส่งคิวกลาง ไม่ใช่ผลรัน
const AUDIT = [
  { lv:'🔴', t:'สเปคสีอลู/กระจกในใบ = ค่ามาตรฐานตายตัว (D1/D2)', d:'g6rRoomSpec L6735 hardcode → มติ ทาง2 เพิ่ม roomColor/roomGlass · ดราฟ DRAFT-G6-สเปคสีกระจกรวมห้อง' },
  { lv:'🟡', t:'ขาดข้อความ disclaimer งานห้อง (D4)', d:'ไม่รวมย้ายแอร์/ผนัง/ระบบน้ำ/เทพื้น → เพิ่ม REMARK_PRESETS' },
  { lv:'🟡', t:'สี/รหัสหลังคาไม่อยู่บล็อกรายละเอียด (D5)', d:'หลังคาขึ้นรายการงานแล้ว · สเปคสีหลังคายังไม่ push' },
  { lv:'✅', t:'ระแนง/ราวกันตก (D7)', d:'เคาะ: ระแนง=item G2 แยก (รองรับแล้ว) · ราวเหล็ก=ไม่ทำ → ปิด' },
];
const RESOLVED = ['Protection→หมายเหตุไทย (ไม่มีบรรทัดราคาอังกฤษ · ไม่ซ้ำ REMARK)','พัดลม+ฝาครอบขึ้นรายการงาน','"ไม่รับประกันพื้นแอ่น" auto เมื่อมีงานพื้น','ใบ 5 บล็อก: รายการงานขึ้นบน · สเปคลงล่าง'];

const row = r=>`<tr><td>${r.ok?'🟢':'🔴'}</td><td><b>มิติ ${r.dim}</b><div class="lg">${r.note}</div></td><td class="c">${r.ok?'ผ่าน':'ไม่ผ่าน'}</td><td class="mono">${r.line.replace(/</g,'&lt;')}</td></tr>`;
const arow = a=>`<tr><td class="c">${a.lv}</td><td><b>${a.t}</b></td><td>${a.d}</td></tr>`;

const html=`<!DOCTYPE html><html lang="th"><head><meta charset="utf-8"><title>CHECK G6 vs ดราฟ — ${DATE}</title><style>
*{font-family:"Leelawadee UI","Tahoma",sans-serif;box-sizing:border-box}body{color:#1a1a1a;font-size:13px;margin:0;padding:18px;background:#f5f5f7}
.wrap{max-width:960px;margin:0 auto}h1{color:#B3151D;font-size:22px;margin:0 0 2px}.meta{color:#666;font-size:12px;margin:0 0 14px}
h2{color:#fff;background:#B3151D;font-size:15px;margin:16px 0 6px;padding:5px 11px;border-radius:6px}
table{border-collapse:collapse;width:100%;background:#fff;font-size:12.5px;margin-bottom:8px}
th,td{border:1px solid #e0d5d5;padding:6px 9px;text-align:left;vertical-align:top}th{background:#fbeeee;color:#B3151D}
td.c{text-align:center;white-space:nowrap}.mono{font-family:Consolas,monospace;font-size:11px;color:#444}.lg{font-size:11px;color:#777;margin-top:2px}
.banner{padding:10px 14px;border-radius:8px;font-weight:700;font-size:15px;margin-bottom:12px}
.b-ok{background:#F0FDF4;color:#15803D;border:1px solid #86EFAC}.b-bad{background:#fef2f2;color:#B3151D;border:1px solid #fca5a5}
ul{margin:4px 0;padding-left:18px}li{margin:3px 0}</style></head><body><div class="wrap">
<h1>CHECK G6 (กั้นห้องกระจก) เทียบดราฟ/มติ</h1>
<div class="meta">${DATE} · meta-runner เฉพาะ room builder (.g6room) · READ-ONLY · แชท G6</div>
<div class="banner ${allPass?'b-ok':'b-bad'}">${allPass?'✅ 6 มิติผ่านครบ — เงินไม่เพี้ยน · ออปชั่น/ใบ/เทสราคา OK':'🔴 มีมิติไม่ผ่าน — ดูตาราง'}</div>
<h2>ผลรัน 6 มิติ (รันสด · หลักฐานจริง)</h2>
<table><tr><th></th><th>มิติ (สิ่งที่ตรวจ)</th><th class="c">ผล</th><th>หลักฐาน</th></tr>${results.map(row).join('')}</table>
<h2>จุดเทียบใบจริง (audit · เช็คโค้ดซ้ำแล้ว · 🔴 ส่งคิวกลาง)</h2>
<table><tr><th class="c">ระดับ</th><th>จุด</th><th>รายละเอียด/มติ</th></tr>${AUDIT.map(arow).join('')}</table>
<div class="lg">⚠ audit ของ agent over-flag 2 จุด — กรองแล้ว: D3 VAT 0% (มีจริง L400) · D4 (มี preset · ขาดแค่ข้อความ) · ใบคิวกลาง: เข้าคิวกลาง-จากG6-audit-2026-06-17.md</div>
<h2>✅ แก้แล้วถูก (commit 17 มิ.ย.)</h2><ul>${RESOLVED.map(x=>`<li>${x}</li>`).join('')}</ul>
</div></body></html>`;

const outPath = join(ROOT,`docs/กลุ่ม6-กั้นห้องกระจก/CHECK-G6-vs-draft-${DATE}.html`);
writeFileSync(outPath, html, 'utf8');
console.log('\n=== CHECK G6 ===');
results.forEach(r=>console.log(`  ${r.ok?'🟢':'🔴'} มิติ ${r.dim} — ${r.line}`));
console.log(`\n  ${allPass?'✅ 6 มิติผ่านครบ':'🔴 มีมิติไม่ผ่าน'} · audit 🔴 1 (D1/D2) · 🟡 2 · ✅ปิด 1`);
console.log(`  รายงาน → ${outPath}`);
