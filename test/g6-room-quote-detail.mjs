// G6: ห้องต่อเติมต้อง "แตกรายการบาน" ในใบเสนอราคา (ชนิด/ขนาด/ออปชั่น ต่อบาน) ไม่ใช่ lumpsum บรรทัดเดียว
import { JSDOM, VirtualConsole } from "jsdom";
import { readFileSync } from "node:fs";
const html = readFileSync(new URL("../public/calculator/index.html", import.meta.url), "utf8");
const vc = new VirtualConsole(); const errs = [];
vc.on("jsdomError", e => { if (!/Not implemented:|scrollIntoView|scrollTo/.test(e.message)) errs.push(e.message); });
const dom = new JSDOM(html, { runScripts: "dangerously", pretendToBeVisual: true, virtualConsole: vc, url: "http://localhost/calculator/index.html" });
await new Promise(r => { if (dom.window.document.readyState === 'complete') r(); else dom.window.addEventListener('load', r); setTimeout(r, 1500); });
const w = dom.window, doc = w.document;
const C = []; const want = (n, ok, d) => C.push({ n, ok: !!ok, d: d || "" });

// ปิดค่าบริการรบกวน
["svc-protect","svc-lift","svc-travel","svc-ship"].forEach(id=>{ const e=doc.getElementById(id); if(e&&e.checked){e.checked=false; e.dispatchEvent(new w.Event('change',{bubbles:true}));} });
doc.getElementById('items').innerHTML='';

// สร้างห้อง: ด้าน A (3 บานต่างชนิด+ออปชั่น) + ด้าน B ผนังเบา + หลังคา + ไฟ
const d = w.addGlasshouseSet();
const st = d.__g6state;
st.sides = [
  { type:'glass', cols:[
    { pcs:[{ cat:'บานเปิด', id:'casement_euro', w:0.9, h:2.1, opt:{ thresh:'turtle', mosq:1, mosqId:'mj_sd_basic', fcsides:4 } }] },
    { pcs:[{ cat:'ติดตาย', id:'fixed_glass', w:1.2, h:2.5, opt:{} }] },
    { pcs:[{ cat:'บานกระทุ้ง', id:'awning_euro', w:1.0, h:0.6, opt:{ awn_mode:'2' } }] },
  ]},
  { type:'wall', aw:3, ah:2.6, cols:[] },
];
st.roof = { on:1, matId:'roof_vinyl', w:6, l:3, frame:'โครงอลูมิเนียม', gut:0, gutlen:0, eave:0, ex:{} };
st.elec = { down:4, sw:2 };
w.calcQuote(); w.genQuote();

// อ่านใบ
const qc = doc.getElementById('quoteContent');
const detailText = [...qc.querySelectorAll('table.qt tbody tr td:nth-child(2)')].map(td=>(td.textContent||'').replace(/\s+/g,' ').trim()).join(' ');
const priceRaw = (qc.querySelector('table.qt tbody tr td:nth-child(5)')||{}).textContent||'';
const price = parseInt(priceRaw.replace(/[^\d]/g,''))||0;

// ===== ต้องแตกรายการบานครบ =====
want("มีหัวข้อ ด้าน A", /ด้าน\s*A/.test(detailText), "");
want("มีหัวข้อ ด้าน B", /ด้าน\s*B/.test(detailText), "");
want("โชว์บานเปิดยูโร", /ยูโร/.test(detailText), "");
want("โชว์กระจกติดตาย", /กระจกติดตาย/.test(detailText), "");
want("โชว์บานกระทุ้ง", /กระทุ้ง/.test(detailText), "");
want("โชว์ขนาดบาน (0.9×2.1)", /0\.9\s*×\s*2\.1/.test(detailText), "");
want("โชว์ออปชั่น มุ้ง", /มุ้ง/.test(detailText), "");
want("โชว์ออปชั่น ครอบวงกบ", /ครอบวงกบ/.test(detailText), "");
want("โชว์ออปชั่น ธรณีหลังเต่า", /หลังเต่า/.test(detailText), "");
want("โชว์ Tilt&Turn", /Tilt&Turn/i.test(detailText), "");
want("โชว์ ผนังเบา (ด้าน B)", /ผนังเบา/.test(detailText), "");
want("โชว์ หลังคา/ฝ้า", /หลังคา/.test(detailText), "");
want("โชว์ งานไฟ (ดาวน์ไลท์)", /ดาวน์ไลท์|งานไฟ/.test(detailText), "");
want("ราคารวม > 0", price > 0, "price=" + price.toLocaleString());

// breakdown จาก g6rRoomDetail ตรง (มีบรรทัด • หลายบรรทัด)
const detail = w.g6rRoomDetail ? w.g6rRoomDetail(d) : '';
const bullets = (detail.match(/•/g)||[]).length;
want("g6rRoomDetail แตก ≥3 บรรทัดบาน (•)", bullets >= 3, "bullets=" + bullets);
want("ไม่มี JS error", errs.length === 0, errs.slice(0,2).join(' / '));

let pass = 0;
console.log("\n=== G6 room quote detail (ห้องแตกรายการบานในใบ) ===");
for (const c of C) { console.log((c.ok ? "  ✓ " : "  ✗ ") + c.n + (c.d ? "  [" + c.d + "]" : "")); if (c.ok) pass++; }
console.log("\nสรุป: ผ่าน " + pass + "/" + C.length);
if (pass < C.length) console.log("\n--- detailText (debug) ---\n" + detailText.slice(0, 600));
process.exit(pass === C.length ? 0 : 1);
