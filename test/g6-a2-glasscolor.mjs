// A2 (18มิ.ย.) — ห้องกระจก G6: เลือกกระจก+สีอลู ต่อช่อง + สีโครงหลังคา default=สีห้อง
// ล็อกราคาห้อง (regression) เพราะ golden-snapshot ตัด G6 ออก (room-builder flow)
// ใช้: node test/g6-a2-glasscolor.mjs
import { JSDOM, VirtualConsole } from "jsdom";
import { readFileSync } from "node:fs";
const html = readFileSync(new URL("../public/calculator/index.html", import.meta.url), "utf8");
const vc = new VirtualConsole(); const errs = [];
vc.on("jsdomError", e => { if (!/Not implemented:|scrollIntoView|scrollTo/.test(e.message)) errs.push(e.message); });
const dom = new JSDOM(html, { runScripts: "dangerously", pretendToBeVisual: true, virtualConsole: vc, url: "http://localhost/calculator/index.html" });
await new Promise(r => { if (dom.window.document.readyState === 'complete') r(); else dom.window.addEventListener('load', r); setTimeout(r, 1500); });
const w = dom.window, doc = w.document;
const C = []; const want = (n, ok, d) => C.push({ n, ok: !!ok, d: d || '' });

// ── สร้างห้อง ──
w.setMode && w.setMode('quote');
w.addGlasshouseSet();
const el = [...doc.querySelectorAll('*')].find(e => e.__g6state);
want('สร้างห้องได้ (มี __g6state)', !!el);
const st = el.__g6state;

// หา glass piece แรก
let pc = null; st.sides.forEach(s => { if (s.type === 'glass') s.cols.forEach(c => c.pcs.forEach(p => { if (!pc) pc = p; })); });
want('ห้องมีช่องกระจก', !!pc);

// ── baseline (กระจก/สี default 0) ──
const total0 = w.g6rRoomTotal(el);
want('ราคาห้อง baseline = 20,000 (default เขียว6/อบขาว)', total0 === 20000, 'total0=' + total0);

// ── ตั้งกระจกพิเศษ (ลามิเนต 5+5 ฟิล์มเขียว/ใส) + สีพิเศษ ci5 ── (GLASS/PRODUCTS = const → ใช้ page scope ผ่าน w.eval)
const giLam = w.eval('(function(){for(var i=0;i<GLASS.length;i++){if(/ลามิเนต 5\\+5 มม\\. ฟิล์มเขียว\\/ใส 0\\.38/.test(GLASS[i].n))return i;}return -1;})()');
const giLamS = giLam >= 0 ? w.eval('GLASS[' + giLam + '].s') : 0;
want('เจอ glass ลามิเนต 5+5 ฟิล์มเขียว/ใส', giLam >= 0, 'gi=' + giLam + ' s=' + giLamS);
pc.opt = pc.opt || {}; pc.opt.glassIdx = giLam; pc.opt.colorIdx = 5;
const total1 = w.g6rRoomTotal(el);
want('ราคาห้อง ขยับขึ้นเมื่อเลือกกระจก/สีพิเศษ', total1 > total0, total0 + '→' + total1);
want('ราคาห้องพิเศษ = 30,500 (lock regression · ลามิเนต gi32 s2700 + สี ci5)', total1 === 30500, 'total1=' + total1);
// ล็อกค่า: glassUp delta = (GLASS[gi].s - GLASS[0].s)×area + colorPrice(5,area) → ปัดร้อย
const spec1 = w.g6rRoomSpec(el);
want('spec ไม่มี "สีสี" ซ้ำ', !/สีสี/.test(spec1), spec1);
want('spec โชว์ชื่อกระจกจริง (ลามิเนต 5+5)', /ลามิเนต 5\+5/.test(spec1), spec1.split('\n')[1]);
want('spec โชว์สีอลูจริง (ลายไม้สต๊อก)', /ลายไม้สต๊อก/.test(spec1), spec1.split('\n')[0]);

// ── สีโครงหลังคา default = สีห้อง (มติพี่นัท) ──
st.roof.on = 1; st.roof.frame = 'โครงอลูมิเนียม';
const rpId = w.eval("(function(){var p=PRODUCTS.find(function(p){return /^หลังคา/.test(p.name||'')||p.cat==='หลังคา';});return p?p.id:'';})()"); if (rpId) st.roof.matId = rpId;
const specR = w.g6rRoomSpec(el);
want('หลังคามี "สีโครง" ในใบ', /สีโครง/.test(specR), specR.split('\n').pop());
want('สีโครงหลังคา = สีห้อง (ลายไม้สต๊อก · default)', /สีโครง ลายไม้สต๊อก/.test(specR), specR.split('\n').pop());

// ── เปลี่ยนเป็นโครงเหล็กชุบ → ไม่คิดสี (ไม่มีสีโครงในใบ) ──
st.roof.frame = 'โครงเหล็กชุบซิงค์';
const specSteel = w.g6rRoomSpec(el);
want('โครงเหล็กชุบ = ไม่มี "สีโครง" (ไม่คิดสี)', !/สีโครง/.test(specSteel), specSteel.split('\n').pop());

want('ไม่มี JS error', errs.length === 0, errs.slice(0, 2).join(' / '));

let pass = 0;
console.log('\n=== A2 ห้องกระจก G6: กระจก/สีต่อช่อง + สีโครงหลังคา ===');
for (const c of C) { console.log((c.ok ? '  ✓ ' : '  ✗ ') + c.n + (c.d ? '  [' + c.d + ']' : '')); if (c.ok) pass++; }
console.log('\nสรุป: ผ่าน ' + pass + '/' + C.length);
process.exit(pass === C.length ? 0 : 1);
