// demo-g2-round4.mjs — render ระบบจริง (jsdom) ดึงเลข 3 จุด R4 แล้วออก HTML เทียบ ก่อน→หลัง (READ-ONLY)
// usage: node scripts/demo-g2-round4.mjs
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
const ALL = w.__P__;
const PBY = Object.fromEntries(ALL.map(p => [p.id, p]));
doc.getElementById("items").innerHTML = ""; setF2("custName", "ทดสอบ"); setF2("sellerName", "audit");

function add(pid, groupNum) {
  w.addItem(doc.getElementById("items"));
  const ch = [...doc.querySelectorAll("#items .ch")].pop();
  setF(ch, ".i-group", groupNum);
  const ps = ch.querySelector(".i-prod");
  ps.innerHTML = '<option value="' + pid + '">' + PBY[pid].name + '</option>'; ps.value = pid; fire(ps, "change");
  return ch;
}
function readSell(ch) {
  try { const it = w.readItem(ch); const u = (it && (it.r || it.u)) || {}; return { sell: u.sell, msgs: (u.msgs || []).slice(), addon: u.addonLabel || '' }; }
  catch (e) { return { sell: null, msgs: [], addon: '', err: String(e) }; }
}

// ===== R4-1: บานเปิดยูโร — ราคาตามจำนวนบาน 1..4 (set .i-panels ตรงๆ = simulate pn.max=4) =====
const cw = 2.4, chh = 2.2; // ขนาดทดสอบ (พื้นที่รวม 5.28 ตร.ม.)
const chE = add("casement_euro", 1);
setF(chE, ".i-w", cw); setF(chE, ".i-h", chh);
const panelRows = [];
for (let n = 1; n <= 4; n++) {
  const pn = chE.querySelector(".i-panels");
  if (pn) { pn.value = String(n); fire(pn, "input"); fire(pn, "change"); }
  const r = readSell(chE);
  // แตก addon ออกจาก sell เพื่อโชว์ฐาน
  let addonAmt = 0; const am = (r.addon || '').match(/([\d,]+)\s*$/);
  // addonCalc: (n-1)*5000
  addonAmt = (n - 1) * 5000;
  panelRows.push({ n, sell: r.sell, base: (r.sell != null ? r.sell - addonAmt : null), addon: addonAmt, addonLabel: r.addon });
}
const panelMaxNow = (() => { const pn = chE.querySelector(".i-panels"); return pn ? (pn.getAttribute("max") || "ไม่จำกัด") : "?"; })();

// ===== R4-2: imp1 detail (สแตนเลสซ้ำ) =====
const chR = add("imp1", 2);
setF(chR, ".i-w", 1.8); // ความยาว 1.8 ม.
const rImp = readSell(chR);
w.calcQuote(); w.genQuote();
// ดึง detail ของ imp1 จาก #quoteContent
let imp1Detail = "";
{
  const rows = [...doc.querySelectorAll("#quoteContent table tr")];
  for (const tr of rows) { const t = tr.textContent; if (/ราวกันตกกระจกเฉียง หมุดแปะข้าง/.test(t)) { imp1Detail = t.replace(/\s+/g, ' ').trim(); break; } }
}
// บรรทัด detail — อ่าน innerHTML ของ cell แล้วแยกด้วย <br> (jsdom innerText ไม่แปลง <br>→\n)
let imp1Head = "ราวกันตกกระจกเฉียง หมุดแปะข้าง (ยาว 1.8 ม.)";
let imp1Lines = [];
{
  const rows = [...doc.querySelectorAll("#quoteContent table tr")];
  for (const tr of rows) {
    const tds = [...tr.querySelectorAll("td")];
    // cell รายละเอียด = td ที่ "มีหมุดสแตนเลส" แต่ "ไม่มีราคา/ชุด" (กันหยิบ cell ที่รวมราคา)
    const cell = tds.find(x => /หมุดสแตนเลส|อุปกรณ์มาตรฐาน/.test(x.textContent || '') && !/\d[\d,]*\.\d\d/.test(x.textContent || ''));
    if (!cell) continue;
    const txt = (cell.textContent || '').replace(/\s+/g, ' ').trim();
    const sp = txt.split('รายละเอียดงาน');
    imp1Head = (sp[0] || imp1Head).replace(/^จุดที่ \d+\s*-?\s*/, '').replace(/^- /, '').trim();
    imp1Lines = (sp[1] || sp[0]).split('- ').map(s => s.trim()).filter(Boolean);
    break;
  }
}

// ===== R4-3: imp1 ออปชั่นที่ render (หา leak) =====
const optLabels = [...chR.querySelectorAll("label.opt, span.opt")].map(l => (l.innerText || l.textContent).replace(/\s+/g, ' ').trim()).filter(Boolean);
const LEAK = [
  { kw: /มีคาดตาราง/, name: "คาดตาราง (มีคาดตาราง คิดตามสูตร)" },
  { kw: /ฝังรางยู/, name: "ฝังรางยู (ในพื้น)" },
  { kw: /ครอบวงกบอลู/, name: "ครอบวงกบอลู (ไม่มี/3/4 ด้าน)" },
  { kw: /ดรอปพื้น/, name: "ดรอปพื้น (ม.)" },
];
const KEEP = [/ความหนากระจก/, /ราวมือจับ/, /สีอลูมิเนียม/, /งานเสริม\/วิศวกรรม/, /รื้อของเดิม/];
const optClassified = optLabels.map(t => {
  const leak = LEAK.find(L => L.kw.test(t));
  const keep = KEEP.some(k => k.test(t));
  return { t: t.slice(0, 70), leak: !!leak, keep };
});

const f = n => n == null ? "—" : Number(Math.round(n)).toLocaleString();
const esc = s => String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

// ===== สร้าง HTML =====
const html = `<!DOCTYPE html><html lang="th"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>DEMO G2 รอบ 4 — เทส ก่อน→หลัง (render จริง)</title>
<style>
@page{size:A4;margin:11mm;}*{box-sizing:border-box;}
body{font-family:"Leelawadee UI","Tahoma",sans-serif;color:#1F2937;font-size:12px;line-height:1.55;margin:0;padding:14px;background:#F9FAFB;}
h1{font-size:19px;color:#B3151D;margin:0 0 2px;}.sub{color:#6B7280;font-size:11px;margin-bottom:12px;}
h2{font-size:15px;margin:18px 0 6px;padding:6px 11px;border-radius:6px;color:#fff;background:#B3151D;}
.card{background:#fff;border:1px solid #E5E7EB;border-radius:10px;padding:13px 15px;margin:8px 0;box-shadow:0 1px 2px rgba(0,0,0,.04);}
.ba{display:flex;gap:12px;flex-wrap:wrap;}.col{flex:1;min-width:230px;}
.lab{font-size:11px;font-weight:700;margin-bottom:4px;}.before .lab{color:#B3151D;}.after .lab{color:#166534;}
.before{background:#FEF2F2;border:1px solid #FECACA;border-radius:8px;padding:9px 11px;}
.after{background:#F0FDF4;border:1px solid #BBF7D0;border-radius:8px;padding:9px 11px;}
table{width:100%;border-collapse:collapse;margin:5px 0;}th,td{border:1px solid #E5E7EB;padding:5px 8px;font-size:11.5px;text-align:left;}
th{background:#F3F4F6;}td.n{text-align:right;font-variant-numeric:tabular-nums;white-space:nowrap;}
.tot{font-weight:800;color:#B3151D;}.lock{color:#9CA3AF;text-decoration:line-through;}
.dim{color:#6B7280;font-size:10.5px;}code{font-family:Consolas,monospace;font-size:10px;background:#F3F4F6;padding:0 4px;border-radius:3px;color:#B3151D;}
.line{padding:2px 0;border-bottom:1px dashed #F3F4F6;}.del{color:#B3151D;text-decoration:line-through;opacity:.7;}.dup{background:#FEE2E2;border-radius:3px;padding:0 3px;}
.kept{color:#166534;}.leak{color:#B3151D;font-weight:700;}.chip{display:inline-block;font-size:10px;padding:1px 7px;border-radius:9px;margin:2px 3px 2px 0;}
.chip.k{background:#DCFCE7;color:#166534;}.chip.x{background:#FEE2E2;color:#991B1B;text-decoration:line-through;}
.note{background:#FFF7ED;border:1px solid #FDBA74;border-radius:6px;padding:7px 10px;font-size:11px;margin:6px 0;}
.real{display:inline-block;background:#1F2937;color:#fff;font-size:9px;padding:1px 7px;border-radius:9px;}
</style></head><body>
<h1>DEMO G2 รอบ 4 — เทส ก่อน→หลัง <span class="real">เลขจาก render จริง</span></h1>
<div class="sub">render <code>public/calculator/index.html</code> ด้วย jsdom · โชว์ผล "หลังแก้" โดยจำลอง (engine คิดเหมือนกัน แค่ UI ปลดล็อก) · 11 มิ.ย. 2026 · ยังไม่ส่ง dev</div>

<h2>R4-1 · บานเปิดยูโร — จำนวนบาน 1→4 (ขนาดทดสอบ ${cw}×${chh} = ${(cw*chh).toFixed(2)} ตร.ม.)</h2>
<div class="card">
<div class="note">ตอนนี้ช่องจำนวนบานล็อก <code>max=${panelMaxNow}</code> → กรอกได้แค่ 1–2 · แถว 3–4 คือ <b>ราคาที่ engine จะคิดให้หลังปลดล็อก <code>pn.max=4</code></b> (คิด <code>(บาน−1)×5,000</code> อยู่แล้วจาก R3-1)</div>
<table>
<tr><th>จำนวนบาน</th><th>ฐาน (ตามพื้นที่ · min 18,000)</th><th>เพิ่มบาน (บาน−1)×5,000</th><th>รวม/ชุด</th><th>สถานะตอนนี้</th></tr>
${panelRows.map(r => `<tr><td>${r.n} บาน</td><td class="n">${f(r.base)}</td><td class="n">${r.addon > 0 ? '+ ' + f(r.addon) : '—'}</td><td class="n tot">${f(r.sell)}</td><td class="${r.n > 2 ? 'lock' : ''}">${r.n <= 2 ? '✅ กรอกได้' : '🔒 ล็อก (แก้แล้วได้)'}</td></tr>`).join('')}
</table>
<div class="dim">addon label ที่ระบบออก: ${panelRows.filter(r => r.addonLabel).map(r => r.n + 'บาน="' + esc(r.addonLabel) + '"').join(' · ') || '—'}</div>
</div>

<h2>R4-2 · ราวกันตก imp1 (หมุดแปะข้าง) — "สแตนเลสสีเงิน" ซ้ำ</h2>
<div class="card"><div class="dim" style="margin-bottom:6px;">รายการ: <b>${esc(imp1Head)}</b></div><div class="ba">
<div class="col before"><div class="lab">🔴 ก่อนแก้ (render จริงตอนนี้)</div>
${imp1Lines.length ? imp1Lines.map(l => `<div class="line">- ${/สแตนเลสสีเงิน/.test(l) ? esc(l).replace(/(สแตนเลสสีเงิน)/, '<span class="dup">$1</span>') : esc(l)}</div>`).join('') : '<div class="dim">(อ่าน detail ไม่ได้)</div>'}
<div class="dim" style="margin-top:5px;">↑ "สแตนเลสสีเงิน" โผล่ 2 บรรทัด</div></div>
<div class="col after"><div class="lab">🟢 หลังแก้ (R4-2)</div>
${imp1Lines.map(l => /อุปกรณ์มาตรฐานผู้ผลิต สแตนเลสสีเงิน/.test(l) ? `<div class="line"><span class="del">- ${esc(l)}</span> <span class="dim">(ตัด)</span></div>` : `<div class="line">- ${esc(l)}</div>`).join('')}
<div class="dim" style="margin-top:5px;">เหลือ "หมุดสแตนเลสสีเงิน" บรรทัดเดียว</div></div>
</div></div>

<h2>R4-3 · ราวกันตก imp1 — ออปชั่นที่ render (หา leak)</h2>
<div class="card">
<div class="dim" style="margin-bottom:6px;">ออปชั่นทั้งหมดที่โผล่ในฟอร์ม imp1 (render จริง ${optClassified.length} ตัว) — <span class="leak">แดง=ตัด</span> · <span class="kept">เขียว=เก็บ</span></div>
${optClassified.map(o => `<span class="chip ${o.leak ? 'x' : (o.keep ? 'k' : '')}" title="${esc(o.t)}">${o.leak ? '✕ ' : (o.keep ? '✓ ' : '')}${esc(o.t.slice(0, 38))}</span>`).join('')}
<div class="ba" style="margin-top:10px;">
<div class="col before"><div class="lab">🔴 ตัดทิ้ง 4 ตัว (leak จากบาน/หน้าต่าง)</div>
${LEAK.map(L => `<div class="line"><span class="leak">✕</span> ${esc(L.name)} <span class="dim">${optClassified.some(o => o.leak && L.kw.test(o.t)) ? '(พบในฟอร์มจริง)' : '(ไม่พบ?)'}</span></div>`).join('')}
</div>
<div class="col after"><div class="lab">🟢 เก็บไว้ (ถูกต้อง)</div>
<div class="line"><span class="kept">✓</span> ความหนากระจก 10/12 (ราวกันตก=กระจก)</div>
<div class="line"><span class="kept">✓</span> ราวมือจับด้านบน</div>
<div class="line"><span class="kept">✓</span> สีอลู 3 สี (imp2/3/5/6)</div>
<div class="line"><span class="kept">✓</span> งานเสริม/วิศวกรรม</div>
<div class="line"><span class="kept">✓</span> รื้อของเดิม (รายการนี้) — มติพี่นัท</div>
</div></div>
</div>

<div class="dim" style="margin-top:14px;">เลขราคา/ข้อความ/รายการออปชั่น = ดึงจากการ render ระบบจริง · ส่วน "หลังแก้" = จำลองผลที่ handoff R4 ระบุ (ยังไม่แตะ index.html)</div>
</body></html>`;

const OUT = join(ROOT, "docs/DEMO-G2-ROUND4-test-2026-06-11.html");
writeFileSync(OUT, html, "utf8");
console.log("OK:", OUT);
console.log("panelRows:", JSON.stringify(panelRows));
console.log("imp1Lines:", JSON.stringify(imp1Lines));
console.log("imp1 sell:", rImp.sell, "| msgs:", JSON.stringify(rImp.msgs));
console.log("leak found:", LEAK.filter(L => optClassified.some(o => o.leak && L.kw.test(o.t))).map(L => L.name));
console.log("optLabels count:", optLabels.length);
