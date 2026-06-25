// render 3 เคส G6 เทียบใบจริง (READ-ONLY audit)
import { JSDOM, VirtualConsole } from "jsdom";
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const html = readFileSync(join(ROOT, "public/calculator/index.html"), "utf8");

async function makeDOM() {
  const vc = new VirtualConsole();
  const dom = new JSDOM(html, { runScripts: "dangerously", pretendToBeVisual: true, virtualConsole: vc, url: "http://localhost/" });
  await new Promise(r => { dom.window.addEventListener("load", r); setTimeout(r, 2000); });
  return dom;
}

const fire = (dom, el, t) => el && el.dispatchEvent(new dom.window.Event(t, { bubbles: true }));

// ============================
// เคส 1: คุณโอ๋ — ประตูบานเลื่อนสลับ + กระจกลามิเนต 5+5 + ดรอปพื้นฝังธรณี · ราคาเหมา 80,000
// ============================
async function case1_oo() {
  const dom = await makeDOM();
  const w = dom.window, doc = w.document;
  const cn = doc.getElementById("custName"); if (cn) { cn.value = "คุณโอ๋ (ทดสอบ)"; fire(dom, cn, 'input'); }
  const qd = doc.getElementById("qdate"); if (qd) { qd.value = "23-01-68"; fire(dom, qd, 'input'); }
  doc.getElementById("items").innerHTML = "";
  
  const d = w.addGlasshouseSet();
  const st = d.__g6state;
  // ด้าน A: ประตูบานเลื่อนสลับ 3 บาน + ช่องแสงด้านบน
  st.sides = [
    { type:'glass', cols:[
      // บานเลื่อนสลับ รางล่าง (รุ่นกันน้ำา) — ใช้ sliding_euro กว้าง 3.2, สูง 2.1
      { pcs:[{ cat:'บานเลื่อน', id:'sliding_euro', w:3.2, h:2.1, opt:{ thresh:'turtle' } }] },
      // ช่องแสงด้านบน (กระจกติดตาย)
      { pcs:[{ cat:'ติดตาย', id:'fixed_glass', w:3.2, h:0.5, opt:{} }] },
    ]},
  ];
  // กระจกลามิเนต — ใส่ใน note เพราะเป็น OPTION สเปกพิเศษ
  st.roof = { on:0 };
  st.elec = { down:0, sw:0 };
  w.calcQuote(); w.genQuote();
  
  const qc = doc.getElementById("quoteContent");
  const text = qc ? qc.textContent.replace(/\s+/g,' ').trim() : '';
  return { name:'คุณโอ๋', text };
}

// ============================
// เคส 2: คุณยี — ISOWALL + ระแนง + หลังคาเมทัลชีท + พื้น · ราคาเหมา 2 รายการ 1,045,000 + 140,000
// ============================
async function case2_yee() {
  const dom = await makeDOM();
  const w = dom.window, doc = w.document;
  const cn = doc.getElementById("custName"); if (cn) { cn.value = "คุณยี (ทดสอบ)"; fire(dom, cn, 'input'); }
  doc.getElementById("items").innerHTML = "";
  
  // รายการ 1: ห้องชั้น 2 ใหญ่
  const d1 = w.addGlasshouseSet();
  const st1 = d1.__g6state;
  st1.sides = [
    { type:'glass', cols:[
      { pcs:[{ cat:'บานเลื่อน', id:'sliding_euro', w:2.0, h:2.4, opt:{ mosq:1, mosqId:'mj_sd_basic' } }] },
      { pcs:[{ cat:'ติดตาย', id:'fixed_glass', w:1.0, h:2.4, opt:{} }] },
    ]},
    { type:'wall', aw:3.0, ah:2.8, cols:[] }, // ISOWALL ด้าน C
  ];
  // หลังคาเมทัลชีท
  st1.roof = { on:1, matId:'roof_metal', w:6, l:4, frame:'โครงอลูมิเนียม', gut:0, gutlen:0, eave:0, ex:{} };
  // พื้นสมาร์ทบอร์ด
  if (!st1.floor) st1.floor = {};
  st1.floor = { on:1, mat:'smart', w:4, l:6, disc:'' };
  // พื้นไม้เทียม
  if (!st1.fan) st1.fan = {};
  st1.fan = { on:0 };
  w.calcQuote(); w.genQuote();
  
  const qc = doc.getElementById("quoteContent");
  const text = qc ? qc.textContent.replace(/\s+/g,' ').trim() : '';
  return { name:'คุณยี', text };
}

// ============================
// เคส 3: คุณใบเฟริล — หลังคาโพลีตัน + พัดลมดูดอากาศ · ราคา 111,000 + 66,000 + ส่วนลด 2,000
// ============================
async function case3_baifern() {
  const dom = await makeDOM();
  const w = dom.window, doc = w.document;
  const cn = doc.getElementById("custName"); if (cn) { cn.value = "คุณใบเฟริล (ทดสอบ)"; fire(dom, cn, 'input'); }
  doc.getElementById("items").innerHTML = "";
  
  // รายการ 1: กั้นห้อง + หลังคาโพลีตัน
  const d = w.addGlasshouseSet();
  const st = d.__g6state;
  st.sides = [
    { type:'glass', cols:[
      { pcs:[{ cat:'บานเลื่อน', id:'sliding_euro', w:2.0, h:2.2, opt:{} }] },
      { pcs:[{ cat:'ติดตาย', id:'fixed_glass', w:1.0, h:2.2, opt:{} }] },
    ]},
    { type:'glass', cols:[
      // ด้าน B: หน้าต่างบานเลื่อนสลับ + พัดลม
      { pcs:[{ cat:'บานเลื่อน', id:'sliding_euro', w:2.0, h:2.0, opt:{} }] },
    ]},
    { type:'glass', cols:[
      // ด้าน C: ประตูบานเปิด
      { pcs:[{ cat:'บานเปิด', id:'casement_euro', w:0.9, h:2.1, opt:{ thresh:'turtle' } }] },
    ]},
  ];
  st.roof = { on:1, matId:'roof_vinyl', w:4, l:3, frame:'โครงอลูมิเนียม', gut:0, gutlen:0, eave:0, ex:{} };
  // พัดลม
  if (!st.fan) st.fan = {};
  st.fan = { on:1, qty:1, price:2500, size:'8' };
  if (!st.floor) st.floor = {};
  st.floor = { on:0 };
  w.calcQuote(); w.genQuote();
  
  const qc = doc.getElementById("quoteContent");
  const text = qc ? qc.textContent.replace(/\s+/g,' ').trim() : '';
  return { name:'คุณใบเฟริล', text };
}

// run all
const results = [];
for (const fn of [case1_oo, case2_yee, case3_baifern]) {
  const r = await fn();
  results.push(r);
  console.log(`\n======= ${r.name} =======`);
  console.log(r.text.substring(0, 2000));
}
