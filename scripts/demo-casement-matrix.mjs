// demo-casement-matrix.mjs — เทสราคาบานเปิดยูโร หลายขนาด × จำนวนบาน 1-4 (READ-ONLY)
// ฐาน(พื้นที่)=render จริง · ส่วนเพิ่มทบต้น 5/10/5 + floor 18k/16k = จำลองตามสูตรพี่นัท
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { createRequire } from "node:module";

const ROOT = "C:/Users/Nut/Documents/Claude/Projects/Jr-beta";
const require = createRequire(join(ROOT, "package.json"));
const { JSDOM, VirtualConsole } = require("jsdom");
const calcHtml = readFileSync(join(ROOT, "public/calculator/index.html"), "utf8");
const dom = new JSDOM(calcHtml, { runScripts: "dangerously", pretendToBeVisual: true, virtualConsole: new VirtualConsole(), url: "http://localhost/" });
await new Promise(r => { dom.window.addEventListener("load", r); setTimeout(r, 1500); });
const w = dom.window, doc = w.document;
const fire = (el, t) => el.dispatchEvent(new w.Event(t, { bubbles: true }));
{ const sp = doc.getElementById("svc-protect"); if (sp && sp.checked) { sp.checked = false; fire(sp, "change"); } }
const setF = (ch, sel, v) => { const el = ch.querySelector(sel); if (el) { el.value = String(v); fire(el, "input"); fire(el, "change"); } };
const setF2 = (id, v) => { const el = doc.getElementById(id); if (el) { el.value = String(v); fire(el, "input"); fire(el, "change"); } };
w.eval("window.__P__=PRODUCTS; try{window.readItem=readItem;}catch(e){}");
const PBY = Object.fromEntries(w.__P__.map(p => [p.id, p]));
doc.getElementById("items").innerHTML = ""; setF2("custName", "ทดสอบ"); setF2("sellerName", "audit");

w.addItem(doc.getElementById("items"));
const ch = [...doc.querySelectorAll("#items .ch")].pop();
setF(ch, ".i-group", 1);
const ps = ch.querySelector(".i-prod");
ps.innerHTML = '<option value="casement_euro">บานเปิด ยูโร</option>'; ps.value = "casement_euro"; fire(ps, "change");

function baseAt(wd, ht) { // ราคาฐาน 1 บาน (พื้นที่ · addon=0) — render จริง
  setF(ch, ".i-w", wd); setF(ch, ".i-h", ht);
  const pn = ch.querySelector(".i-panels"); if (pn) { pn.value = "1"; fire(pn, "input"); fire(pn, "change"); }
  try { const it = w.readItem(ch); const u = (it && (it.r || it.u)) || {}; return u.sell; } catch (e) { return null; }
}

// สูตรพี่นัท
const ADDON = { 1: 0, 2: 5000, 3: 15000, 4: 20000 }; // ทบต้น (บาน2 +5k · บาน3 +10k · บาน4 +5k)
const floor = n => 18000 + 16000 * (n - 1);          // เดี่ยว 18,000 · บาน2+ 16,000/บาน (วงกบร่วม)

const SIZES = [
  [0.9, 2.0], [1.2, 2.2], [1.8, 2.2], [2.4, 2.2], [3.0, 2.4], [3.6, 2.4],
];
const rows = SIZES.map(([wd, ht]) => {
  const base = baseAt(wd, ht);
  const cells = [1, 2, 3, 4].map(n => {
    const a = base + ADDON[n];          // ฐาน + ส่วนเพิ่มทบต้น
    const fl = floor(n);
    return { n, addon: ADDON[n], a, floor: fl, withFloor: Math.max(a, fl), bumped: fl > a };
  });
  return { wd, ht, area: +(wd * ht).toFixed(2), base, cells };
});

const f = n => n == null ? "—" : Number(Math.round(n)).toLocaleString();
const html = `<!DOCTYPE html><html lang="th"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>เทสราคาบานเปิดยูโร — ขนาด × จำนวนบาน</title><style>
@page{size:A4 landscape;margin:9mm;}*{box-sizing:border-box;}
body{font-family:"Leelawadee UI","Tahoma",sans-serif;color:#1F2937;font-size:11.5px;margin:0;padding:14px;background:#F9FAFB;}
h1{font-size:18px;color:#B3151D;margin:0 0 2px;}.sub{color:#6B7280;font-size:11px;margin-bottom:10px;}
.real{display:inline-block;background:#1F2937;color:#fff;font-size:9px;padding:1px 7px;border-radius:9px;}
table{width:100%;border-collapse:collapse;margin:8px 0;background:#fff;}
th,td{border:1px solid #D1D5DB;padding:6px 8px;text-align:center;font-variant-numeric:tabular-nums;}
th{background:#B3151D;color:#fff;font-size:11px;}th.g{background:#374151;}
td.sz{background:#F3F4F6;font-weight:700;text-align:left;white-space:nowrap;}
td.base{background:#EFF6FF;font-weight:700;color:#1D4ED8;}
.tot{font-weight:800;color:#B3151D;}.bump{background:#FEF2F2;color:#991B1B;}.ok{background:#F0FDF4;}
.legend{background:#fff;border:1px solid #E5E7EB;border-radius:8px;padding:10px 13px;font-size:11px;margin:8px 0;}
.legend b{color:#B3151D;}code{font-family:Consolas,monospace;background:#F3F4F6;padding:0 4px;border-radius:3px;color:#B3151D;font-size:10px;}
.note{background:#FFF7ED;border:1px solid #FDBA74;border-radius:6px;padding:8px 11px;font-size:11px;margin:8px 0;}
</style></head><body>
<h1>เทสราคาบานเปิดยูโร — ขนาด × จำนวนบาน 1-4 <span class="real">ฐาน=render จริง</span></h1>
<div class="sub">ฐาน(พื้นที่) ดึงจากระบบจริง · ส่วนเพิ่ม "ทบต้น" + floor = จำลองตามสูตรพี่นัท (ยังไม่ใส่ในโค้ด) · 11 มิ.ย. 2026</div>

<div class="legend">
<b>สูตรที่จำลอง:</b> ส่วนเพิ่มทบต้น — บาน2 <b>+5,000</b> · บาน3 <b>+10,000</b> (รวม +15,000) · บาน4 <b>+5,000</b> (รวม +20,000) →
ราคา = <code>ฐานพื้นที่ + ส่วนเพิ่ม</code><br>
<b>ขั้นต่ำ (floor):</b> บานเดี่ยว ≥ 18,000 · บานที่ 2 ขึ้นไป 16,000/บาน (ใช้วงกบร่วม) → <code>floor(n) = 18,000 + 16,000×(n−1)</code>
= 18,000 / 34,000 / 50,000 / 66,000
</div>

<table>
<tr><th class="g" rowspan="2">ขนาด (กว้าง×สูง)</th><th class="g" rowspan="2">พื้นที่<br>ตร.ม.</th><th class="g" rowspan="2">ฐาน<br>(1 บาน)</th><th colspan="4">ราคา = ฐาน + ส่วนเพิ่มทบต้น</th></tr>
<tr><th>1 บาน</th><th>2 บาน</th><th>3 บาน</th><th>4 บาน</th></tr>
${rows.map(r => `<tr>
<td class="sz">${r.wd} × ${r.ht}</td><td>${r.area}</td><td class="base">${f(r.base)}</td>
${r.cells.map(c => `<td><span class="tot">${f(c.a)}</span>${c.addon > 0 ? `<br><span style="font-size:9px;color:#6B7280;">+${f(c.addon)}</span>` : ''}</td>`).join('')}
</tr>`).join('')}
</table>

<div class="note"><b>⚠ ถ้าใส่ floor (ขั้นต่ำ 16,000/บาน) ด้วย</b> — ช่องที่ราคาต่ำกว่าขั้นต่ำจะถูกดันขึ้น (พื้นหลังแดง):</div>
<table>
<tr><th class="g" rowspan="2">ขนาด</th><th colspan="4">ราคาหลังกันขั้นต่ำ = max(ฐาน+เพิ่ม, floor)</th></tr>
<tr><th>1 บาน<br><span style="font-weight:400;">min 18k</span></th><th>2 บาน<br><span style="font-weight:400;">min 34k</span></th><th>3 บาน<br><span style="font-weight:400;">min 50k</span></th><th>4 บาน<br><span style="font-weight:400;">min 66k</span></th></tr>
${rows.map(r => `<tr><td class="sz">${r.wd} × ${r.ht}</td>
${r.cells.map(c => `<td class="${c.bumped ? 'bump' : 'ok'}"><span class="tot">${f(c.withFloor)}</span>${c.bumped ? '<br><span style="font-size:9px;">↑ ดันถึง min</span>' : ''}</td>`).join('')}
</tr>`).join('')}
</table>

<div class="note"><b>จุดที่ต้องเคาะ:</b> เคสตัวอย่าง 2.4×2.2 (ฐาน ${f(rows[3].base)}) — แบบ "ฐาน+เพิ่ม" ได้ 3 บาน = <b>${f(rows[3].cells[2].a)}</b> ตรงเป้าพี่นัท
แต่ถ้าใส่ floor 16k/บาน → 3 บาน = <b>${f(rows[3].cells[2].withFloor)}</b> (floor ดันขึ้น) → <b>floor กับเป้า 45,000 ขัดกัน</b> ที่ขนาดนี้ · ต้องเลือกว่า floor ใช้เฉพาะบานเล็ก หรือ override เป้า</div>
</body></html>`;

const OUT = join(ROOT, "docs/TEST-casement-price-matrix-2026-06-11.html");
writeFileSync(OUT, html, "utf8");
console.log("OK:", OUT);
rows.forEach(r => console.log(`${r.wd}x${r.ht} (${r.area}) base=${r.base} | 1-4: ${r.cells.map(c => c.a).join('/')} | floor: ${r.cells.map(c => c.withFloor).join('/')}`));
