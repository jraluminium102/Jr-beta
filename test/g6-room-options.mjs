// G6 room builder — ออปชั่นต่อบาน ราคาตรง engine (delta ตรงสูตร calcUnit + parity กับ G1)
import { JSDOM, VirtualConsole } from "jsdom";
import { readFileSync } from "node:fs";
const html = readFileSync(new URL("../public/calculator/index.html", import.meta.url), "utf8");
const vc = new VirtualConsole(); const errs = [];
vc.on("jsdomError", e => { if (!/Not implemented:|scrollIntoView|scrollTo/.test(e.message)) errs.push(e.message); });
const dom = new JSDOM(html, { runScripts: "dangerously", pretendToBeVisual: true, virtualConsole: vc, url: "http://localhost/calculator/index.html" });
await new Promise(r => { if (dom.window.document.readyState === 'complete') r(); else dom.window.addEventListener('load', r); setTimeout(r, 1500); });
const w = dom.window, doc = w.document;
const C = []; const want = (n, ok, d) => C.push({ n, ok: !!ok, d: d || "" });
function sf(ch, sel, v) { const e = ch.querySelector(sel); if (!e) return; e.value = String(v); e.dispatchEvent(new w.Event('input', { bubbles: true })); e.dispatchEvent(new w.Event('change', { bubbles: true })); }

// ===== room: helper เซ็ตบานเดียว + อ่านราคาห้อง =====
function room(cat, id, ww, hh, opt) {
  doc.getElementById("items").innerHTML = "";
  const d = w.addGlasshouseSet();
  const st = d.__g6state;
  st.roof = { on: 0 }; st.elec = { down: 0, sw: 0 };
  st.sides = [{ type: 'glass', cols: [{ pcs: [{ cat, id, w: ww, h: hh, opt: opt || {} }] }] }];
  return w.readItem(d).r.sell;
}

// ครอบวงกบ 4 ด้าน บนบานเปิด 1×1 (สีขาว ci=0 → เรต 700) : len=2(1+1)=4 → +2,800
const base = room('บานเปิด', 'casement_euro', 1, 1, {});
const fc4 = room('บานเปิด', 'casement_euro', 1, 1, { fcsides: 4 });
want("ครอบวงกบ 4 ด้าน 1×1 → +2,800 (4ม.×700)", fc4 - base === 2800, "ฐาน=" + base + " fc4=" + fc4 + " Δ=" + (fc4 - base));

// ดรอปพื้น 2 ม. → +5,000
const dfm = room('บานเปิด', 'casement_euro', 1, 1, { dfm: 2 });
want("ดรอปพื้น 2ม. → +5,000", dfm - base === 5000, "Δ=" + (dfm - base));

// โช๊ค (casement closer) → +5,000
const cl = room('บานเปิด', 'casement_euro', 1, 1, { closer: 5000 });
want("โช๊ค → +5,000", cl - base === 5000, "Δ=" + (cl - base));

// มุ้ง imp28 (จีบ 4,500/ตร.ม.) 1×1 → addon roundUp(4500)=+5,000 (มุ้งปัดหลักพันในตัว)
const mq = room('บานเปิด', 'casement_euro', 1, 1, { mosq: 1, mosqId: 'imp28', qty: 1 });
want("มุ้ง imp28 1×1 → +5,000 (roundUp 4,500)", mq - base === 5000, "Δ=" + (mq - base));

// ผ้ามุ้งกันแมว (+800) → roundUp(4500+800)−roundUp(4500) = 6000−5000 = +1,000
const mqPet = room('บานเปิด', 'casement_euro', 1, 1, { mosq: 1, mosqId: 'imp28', mosqFabric: 'anti_pet', qty: 1 });
want("ผ้ากันแมว → +1,000 (roundUp 5,300−4,500)", mqPet - mq === 1000, "Δ=" + (mqPet - mq));

// มือจับเพิ่ม (digihandle) +3,500
const hp = room('บานเปิด', 'casement_euro', 1, 1, { handleprice: 3500 });
want("มือจับเพิ่ม 3,500 → +3,500", hp - base === 3500, "Δ=" + (hp - base));

// ===== ออปชั่นต่อชนิดบาน (engine จริง · delta คูณพันรอด roundUp เป๊ะ) =====
const th = room('บานเปิด','casement_euro',1,1,{thresh:'turtle'});
want("ธรณีหลังเต่า บานเปิด → +1,000", th-base===1000, "Δ="+(th-base));

const awBase = room('บานกระทุ้ง','awning_euro',1,1,{});
const awTT = room('บานกระทุ้ง','awning_euro',1,1,{awn_mode:'2'});
want("บานกระทุ้ง Tilt&Turn → +5,000/บาน", awTT-awBase===5000, "ฐาน="+awBase+" Δ="+(awTT-awBase));

const liBase = room('บานยก','lift_sms',2,2,{});
const liMot = room('บานยก','lift_sms',2,2,{motor:'300'});
want("บานยก มอเตอร์ 300กก → +28,000", liMot-liBase===28000, "Δ="+(liMot-liBase));

const soBase = room('บานเปิด','casement_flush_solid',1,2,{});
const soFg = room('บานเปิด','casement_flush_solid',1,2,{fullgrid:true});
want("ตารางเต็มบาน (โซลิด) → +5,000", soFg-soBase===5000, "Δ="+(soFg-soBase));

const waBase = room('ฝ้า-ผนัง','wall_ext',2,2.5,{});
const waIns = room('ฝ้า-ผนัง','wall_ext',2,2.5,{insul:true});
want("ฉนวนผนัง 5 ตร.ม. → +3,000 (600×5)", waIns-waBase===3000, "Δ="+(waIns-waBase));

const trBase = room('เลื่อนภายใน','inner_top_stack',2,2.4,{});
const trHide = room('เลื่อนภายใน','inner_top_stack',2,2.4,{track:'ซ่อนราง'});
want("ซ่อนรางบน → +5,000", trHide-trBase===5000, "Δ="+(trHide-trBase));

// มุ้งเฟรม imp21 (เดิมถูก filter หาย) — ตอนนี้เลือกได้ + คิดราคาจริง
const mqNo = room('บานเปิด','casement_euro',1,2,{});
const mqFrame = room('บานเปิด','casement_euro',1,2,{mosq:1,mosqId:'imp21',qty:1});
want("มุ้งเฟรม imp21 เลือกได้ + คิดราคา >0", mqFrame-mqNo>0, "Δ="+(mqFrame-mqNo));

// default มุ้ง = mj_sd_basic (โชว์ตรงกับราคา · กันบั๊ก default imp21 ที่ถูกกรองหาย)
const mqDef = room('บานเปิด','casement_euro',1,2,{mosq:1,qty:1});
const mqSD  = room('บานเปิด','casement_euro',1,2,{mosq:1,mosqId:'mj_sd_basic',qty:1});
want("default มุ้ง = SD พื้นฐาน (display=price)", mqDef===mqSD && mqDef>mqNo, "def="+mqDef+" sd="+mqSD);

// ===== รอบ 2: มือจับ/COMMON_OPTS/ทาสี (engine จริง) =====
// Soft Close เลื่อนภายในรางบน → +4,000
const scBase = room('เลื่อนภายใน','inner_top_stack',2,2.4,{});
const scOn = room('เลื่อนภายใน','inner_top_stack',2,2.4,{soft_close:true});
want("Soft Close (inner_top_stack) → +4,000", scOn-scBase===4000, "Δ="+(scOn-scBase));

// มือจับดิจิตอล A300 (index 5 · +10,000 ไม่มี nc) บนบานเปิดยูโร
const diBase = room('บานเปิด','casement_euro',1,2,{});
const diOn = room('บานเปิด','casement_euro',1,2,{digi:'5'});
want("มือจับดิจิตอล A300 → +10,000", diOn-diBase===10000, "Δ="+(diOn-diBase));

// มือจับสแตนเลส 30.5ซม (index 0 · +1,500) — casement ceLinear ไม่ roundUp → เป๊ะ
const stOn = room('บานเปิด','casement_euro',1,2,{stainless:'0'});
want("มือจับสแตนเลส 30.5ซม → +1,500", stOn-diBase===1500, "Δ="+(stOn-diBase));

// ทาสีผนัง ฝ้า-ผนัง กรอก 3,000 → +3,000
const wpBase = room('ฝ้า-ผนัง','wall_ext',2,2.5,{});
const wpOn = room('ฝ้า-ผนัง','wall_ext',2,2.5,{wallpaintprice:3000});
want("ทาสีผนัง 3,000 → +3,000", wpOn-wpBase===3000, "Δ="+(wpOn-wpBase));

// บานหมุน/ดัดโค้ง เข้าถึงได้ใน room builder (FCATS ขยาย) + คิดราคา >0
const pv = room('บานหมุน','pivot',1.2,2.2,{});
const cv = room('ดัดโค้ง','curved_single',1.5,2.2,{});
want("บานหมุน pivot คิดราคา >0", pv>0, "pivot="+pv);
want("ดัดโค้ง curved_single คิดราคา >0", cv>0, "curve="+cv);

// ===== restructure ดราฟ FULL: ลูกฟูก/คอมโพ + Cmech (engine จริง) =====
const slBase = room('บานเปิด','casement_euro',1,2,{});
const sl = room('บานเปิด','casement_euro',1,2,{solidlower:'corrugated',solidlowerW:1,solidlowerH:1});
want("ลูกฟูกล่าง 1 ตร.ม. → +3,500 (ใส่กลับตามดราฟ)", sl-slBase===3500, "Δ="+(sl-slBase));

const cm = room('บานเปิด','casement_euro',1,2,{cmech:'embed',cmechcolor:'black'});
want("มือจับ Cmech ฝัง ดำ → คิดราคา >0", cm-slBase>0, "Δ="+(cm-slBase));

// ===== parity กับ G1: บานเปิด 1×1 + ครอบวงกบ 4 = g6rPrice เท่ากัน =====
w.addItem(); const chs = doc.querySelectorAll('#items .ch'); const g1 = chs[chs.length - 1];
sf(g1, '.i-group', '1'); sf(g1, '.i-prod', 'casement_euro'); sf(g1, '.i-w', '1'); sf(g1, '.i-h', '1');
if (g1.querySelector('.o-fcsides')) sf(g1, '.o-fcsides', '4');
const g1sell = w.readItem(g1).r.sell;
want("parity: G1 casement+ครอบ4 = room เท่ากัน", g1sell === fc4, "G1=" + g1sell + " room=" + fc4);

want("ไม่มี JS error", errs.length === 0, errs.slice(0, 2).join(" / "));

let pass = 0;
console.log("\n=== G6 room options (ราคา engine จริง) ===");
for (const c of C) { console.log((c.ok ? "  ✓ " : "  ✗ ") + c.n + (c.d ? "  [" + c.d + "]" : "")); if (c.ok) pass++; }
console.log("\nสรุป: ผ่าน " + pass + "/" + C.length);
process.exit(pass === C.length ? 0 : 1);
