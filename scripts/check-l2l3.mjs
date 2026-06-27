// check-l2l3 — ตัวเช็คอัตโนมัติ "ป้าย L2/L3 ทุกกลุ่มใช้สีตรง token (แดง/น้ำเงิน)"
// ใช้ real browser (Playwright/chromium) เพราะ jsdom มองไม่เห็น computed style/visibility
// รัน: node scripts/check-l2l3.mjs   ·   ผ่าน=exit 0 / ไม่ตรง=exit 1 (ใช้เป็น gate ได้)
import { chromium } from 'playwright';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
const __dirname = dirname(fileURLToPath(import.meta.url));
const fileUrl = 'file://' + resolve(__dirname, '../public/calculator/index.html').replace(/\\/g, '/');

// สีที่ถูกต้องตาม token (--l2 แดง / --l3 น้ำเงิน) — ดราฟ DRAFT-G4-สี-L1L2L3-คลีน + G3
const RED = 'rgb(179, 18, 42)';   // #b3122a = --l2
const BLUE = 'rgb(30, 64, 175)';  // #1e40af = --l3

// กลุ่มที่มีกล่อง L2/L3 + วิธีตั้งค่า (เพิ่มกลุ่มใหม่ที่นี่ได้)
const CASES = [
  { name: 'G3 หลังคา', group: '3', prod: 'roof_vinyl',
    open: `var l2=d.querySelector('.rf-l2-cb'); if(l2){l2.checked=true;l2.dispatchEvent(new Event('change',{bubbles:true}));}
           var l3=d.querySelector('.rf-l3-cb'); if(l3){l3.checked=true;l3.dispatchEvent(new Event('change',{bubbles:true}));}` },
  { name: 'G4 ตู้', group: '4', prod: 'cabinet_alu',
    open: `var ff=d.querySelector('.o-cabcofollow'); if(ff&&ff.checked){ff.checked=false;ff.dispatchEvent(new Event('change',{bubbles:true}));}
           var l3d=d.querySelector('.cab-co-l3det'); if(l3d)l3d.open=true;` },
];

const browser = await chromium.launch();
const page = await browser.newPage();
await page.goto(fileUrl);
await page.waitForFunction(() => typeof window.addItem === 'function', { timeout: 8000 });

const fails = [];
for (const c of CASES) {
  const labels = await page.evaluate(({ group, prod, open }) => {
    const cs = getComputedStyle;
    const box = document.getElementById('items'); box.innerHTML = ''; window.addItem();
    let d = document.querySelector('#items .ch');
    const g = d.querySelector('.i-group'); g.value = group; g.dispatchEvent(new Event('change', { bubbles: true }));
    d = document.querySelector('#items .ch');
    const p = d.querySelector('.i-prod'); if (p && p.querySelector('option[value="' + prod + '"]')) { p.value = prod; p.dispatchEvent(new Event('change', { bubbles: true })); }
    d = document.querySelector('#items .ch');
    // eslint-disable-next-line no-eval
    eval(open);
    const out = [];
    d.querySelectorAll('*').forEach(el => {
      if (el.offsetParent === null) return;
      const t = [...el.childNodes].filter(n => n.nodeType === 3).map(n => n.textContent).join('').trim();
      if (/^L2\b|^L3\b|ใช้สีต่าง|เทียบราคา OPTION/.test(t) && t.length < 40) {
        out.push({ txt: t.slice(0, 24), color: cs(el).color, lvl: /^L3|เทียบราคา/.test(t) ? 'L3' : 'L2' });
      }
    });
    return out;
  }, c);

  for (const l of labels) {
    const want = l.lvl === 'L2' ? RED : BLUE;
    const ok = l.color === want;
    if (!ok) fails.push(`${c.name} · "${l.txt}" (${l.lvl}) = ${l.color} · ควร ${want}`);
  }
  const n = labels.length;
  console.log(`  ${labels.every(l => l.color === (l.lvl === 'L2' ? RED : BLUE)) ? '✓' : '✗'} ${c.name} — ป้าย L2/L3 ${n} อัน`);
}

await browser.close();
console.log('');
if (fails.length) {
  console.log('✗ พบป้าย L2/L3 สีไม่ตรง token (' + fails.length + '):');
  fails.forEach(f => console.log('   • ' + f));
  process.exit(1);
} else {
  console.log('✅ ผ่าน — ป้าย L2/L3 ทุกกลุ่มสีตรง token (L2=แดง · L3=น้ำเงิน)');
  process.exit(0);
}
