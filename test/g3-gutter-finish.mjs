// รอบ3 ข้อ2 (18มิ.ย.) — ปิดซ่อนรางน้ำ (roof_gutter_cover): เดิม orphan + dead → ฿0/เลือกสีไม่ได้
// แก้: g:3 ให้โผล่ G3 + render ออปชั่นจริง + readItem + chipify สีอบ → คิดเงินถูก (ล็อก regression สีอบ)
import { JSDOM, VirtualConsole } from "jsdom";
import { readFileSync } from "node:fs";
const html = readFileSync(new URL("../public/calculator/index.html", import.meta.url), "utf8");
const vc = new VirtualConsole(); const errs = [];
vc.on("jsdomError", e => { if (!/Not implemented:|scrollIntoView|scrollTo/.test(e.message)) errs.push(e.message); });
const dom = new JSDOM(html, { runScripts: "dangerously", pretendToBeVisual: true, virtualConsole: vc, url: "http://localhost/calculator/index.html" });
await new Promise(r => { if (dom.window.document.readyState === 'complete') r(); else dom.window.addEventListener('load', r); setTimeout(r, 1500); });
const w = dom.window, doc = w.document;
function sf(ch, sel, v) { const e = ch.querySelector(sel); if (!e) return false; e.value = String(v); e.dispatchEvent(new w.Event('input', { bubbles: true })); e.dispatchEvent(new w.Event('change', { bubbles: true })); return true; }
const C = []; const want = (n, ok, d) => C.push({ n, ok: !!ok, d: d || '' });

w.addItem(); const chs = doc.querySelectorAll('#items .ch'); const d = chs[chs.length - 1];
sf(d, '.i-group', '3');
const ps = d.querySelector('.i-prod');
want('ปิดซ่อนรางน้ำ เลือกได้ใน G3 (เดิม orphan)', [...ps.options].some(o => o.value === 'roof_gutter_cover'));
sf(d, '.i-prod', 'roof_gutter_cover');
const box = d.querySelector('.i-opts');
want('render ช่องขนาดราง (o-gcwidth)', !!box.querySelector('.o-gcwidth'));
want('render สีอบปิดราง (o-gcfinish)', !!box.querySelector('.o-gcfinish'));
want('o-gcfinish chipify แล้ว (chipped=1)', (box.querySelector('.o-gcfinish') || {}).dataset && box.querySelector('.o-gcfinish').dataset.chipped === '1');

sf(d, '.i-w', '10'); // ยาวรวม 10 ม.
let r = w.readItem(d);
want('อ่าน gcWidth/gcHeight/gcFinish (เดิมไม่เคยอ่าน → ฿0)', r && r.optSel && r.optSel.gcWidth === 0.15 && r.optSel.gcHeight === 0.1, 'w=' + (r && r.optSel && r.optSel.gcWidth) + ' h=' + (r && r.optSel && r.optSel.gcHeight));
want('ราคา default (15+10ซม × 10ม · สีอบขาวฟรี) = 7,000 [lock]', r && r.r && r.r.sell === 7000, 'sell=' + (r && r.r && r.r.sell));

// เลือกสีอบพิเศษ +2,500/ตร.ม. (สีลายไม้สต๊อก) → ราคาต้องขึ้น (บั๊กการเงินเดิม: ไม่เคยคิดสี)
const fin = box.querySelector('.o-gcfinish'); fin.value = '2500'; fin.dispatchEvent(new w.Event('change', { bubbles: true }));
r = w.readItem(d);
want('สีอบ +2,500 → คิดเงินเพิ่ม (เดิมหาย)', r && r.r && r.r.sell === 11000, 'sell=' + (r && r.r && r.r.sell));
want('gcFinish = 2500', r && r.optSel && String(r.optSel.gcFinish) === '2500', 'gcFinish=' + (r && r.optSel && r.optSel.gcFinish));

want('ไม่มี JS error', errs.length === 0, errs.slice(0, 2).join(' / '));

let pass = 0;
console.log('\n=== ปิดซ่อนรางน้ำ: render + คิดเงินสีอบ (รอบ3 ข้อ2) ===');
for (const c of C) { console.log((c.ok ? '  ✓ ' : '  ✗ ') + c.n + (c.d ? '  [' + c.d + ']' : '')); if (c.ok) pass++; }
console.log('\nสรุป: ผ่าน ' + pass + '/' + C.length);
process.exit(pass === C.length ? 0 : 1);
