// check-layout — ด่าน UI ทุกกลุ่ม (real browser/Playwright): ① ไม่มีกล่องล้นจอมือถือ ② ปุ่มที่โผล่ตรง baseline
// จับบั๊กชนิด "กล่อง G3 ล้นจอ 620px" + "ปุ่มหาย/เพิ่ม/สลับลำดับ" โดยไม่ต้องเข้ารหัสดราฟทั้งหมด
// รัน: node scripts/check-layout.mjs            → เทียบ baseline (ผ่าน/ฟ้อง · exit 0/1)
//      node scripts/check-layout.mjs --update   → เซฟ baseline ปุ่มใหม่ (ทำตอนยืนยันว่าถูกแล้ว)
import { chromium } from 'playwright';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
const __dirname = dirname(fileURLToPath(import.meta.url));
const fileUrl = 'file://' + resolve(__dirname, '../public/calculator/index.html').replace(/\\/g, '/');
const BASE = resolve(__dirname, 'check-layout.baseline.json');
const UPDATE = process.argv.includes('--update');
const VW = 380; // จอมือถือ

// กลุ่ม + สินค้าตัวแทน (ครอบฟอร์มหลักแต่ละแบบ)
const SCAN = [
  ['1', 'sliding_sms'], ['1', 'casement_euro'], ['1', 'cabinet'],
  ['2', 'fence_gate'], ['2', 'rn2'], ['2', 'bar_grid_z'], ['2', 'imp1'],
  ['3', 'roof_vinyl'], ['3', 'ceil_cshape'],
  ['4', 'cabinet_alu'], ['4', 'future_tech'],
  ['5', null], ['7', 'zipscreen'],
];

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: VW, height: 1600 }, deviceScaleFactor: 1 });
await page.goto(fileUrl);
await page.waitForFunction(() => typeof window.addItem === 'function', { timeout: 8000 });

const result = {}; const overflow = [];
for (const [group, prod] of SCAN) {
  const data = await page.evaluate(({ group, prod, VW }) => {
    const box = document.getElementById('items'); box.innerHTML = ''; window.addItem();
    let d = document.querySelector('#items .ch');
    const g = d.querySelector('.i-group'); g.value = group; g.dispatchEvent(new Event('change', { bubbles: true }));
    d = document.querySelector('#items .ch');
    const p = d.querySelector('.i-prod');
    if (prod && p && p.querySelector('option[value="' + prod + '"]')) { p.value = prod; p.dispatchEvent(new Event('change', { bubbles: true })); }
    d = document.querySelector('#items .ch');
    // เปิดทุก details + toggle ที่เผยกล่องซ้อน (L2/L3 · สีตู้)
    d.querySelectorAll('details').forEach(x => x.open = true);
    ['.rf-l2-cb', '.rf-l3-cb'].forEach(s => { const cb = d.querySelector(s); if (cb && !cb.checked) { cb.checked = true; cb.dispatchEvent(new Event('change', { bubbles: true })); } });
    const ff = d.querySelector('.o-cabcofollow'); if (ff && ff.checked) { ff.checked = false; ff.dispatchEvent(new Event('change', { bubbles: true })); }
    const l3d = d.querySelector('.cab-co-l3det'); if (l3d) l3d.open = true;
    d.querySelectorAll('details').forEach(x => x.open = true);
    // ① overflow: element ที่โผล่ + กว้างเกินจอ
    const over = [];
    d.querySelectorAll('*').forEach(el => {
      if (el.offsetParent === null) return;
      const w = el.getBoundingClientRect().width;
      if (w > VW + 2) { const cls = (el.className || '').toString().split(' ').filter(Boolean)[0] || el.tagName.toLowerCase(); over.push({ cls, w: Math.round(w) }); }
    });
    // ② ปุ่มที่โผล่ (chip/button) ตามลำดับ DOM
    const btns = [];
    d.querySelectorAll('.chip, button.c, button.b').forEach(b => { if (b.offsetParent !== null) btns.push(b.textContent.trim().replace(/\s+/g, ' ').slice(0, 20)); });
    return { over, btns };
  }, { group, prod, VW });
  const key = 'G' + group + (prod ? ':' + prod : '');
  result[key] = data.btns;
  // หา element กว้างสุดที่ล้น (ตัดซ้ำ)
  const worst = data.over.sort((a, b) => b.w - a.w).filter((v, i, a) => a.findIndex(x => x.cls === v.cls) === i).slice(0, 3);
  if (worst.length) overflow.push({ key, worst });
}
await browser.close();

// ── รายงาน ──
let fail = false;
console.log('=== ① ด่าน overflow (จอ ' + VW + 'px) ===');
if (overflow.length) {
  fail = true;
  overflow.forEach(o => console.log('  ✗ ' + o.key + ' — กล่องล้นจอ: ' + o.worst.map(w => w.cls + ' ' + w.w + 'px').join(' · ')));
} else console.log('  ✓ ไม่มีกล่องล้นจอมือถือทุกกลุ่ม');

console.log('\n=== ② ปุ่ม baseline ===');
if (UPDATE) {
  writeFileSync(BASE, JSON.stringify(result, null, 1));
  console.log('  💾 เซฟ baseline ปุ่มแล้ว (' + Object.keys(result).length + ' ฟอร์ม)');
} else if (!existsSync(BASE)) {
  console.log('  ⚠ ยังไม่มี baseline — รัน `node scripts/check-layout.mjs --update` ครั้งแรกก่อน');
} else {
  const base = JSON.parse(readFileSync(BASE, 'utf8'));
  for (const key of Object.keys(result)) {
    const a = (base[key] || []).join('|'), b = result[key].join('|');
    if (a !== b) {
      fail = true;
      const removed = (base[key] || []).filter(x => !result[key].includes(x));
      const added = result[key].filter(x => !(base[key] || []).includes(x));
      console.log('  ✗ ' + key + ' ปุ่มต่างจาก baseline:' + (removed.length ? ' หาย[' + removed.join(',') + ']' : '') + (added.length ? ' เพิ่ม[' + added.join(',') + ']' : '') + (!removed.length && !added.length ? ' (ลำดับสลับ)' : ''));
    }
  }
  if (!fail) console.log('  ✓ ปุ่มทุกฟอร์มตรง baseline (ครบ/ลำดับ/ไม่เกิน)');
}
console.log('');
process.exit(fail ? 1 : 0);
