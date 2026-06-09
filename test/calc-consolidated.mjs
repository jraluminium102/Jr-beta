// Regression: งานรวมแชท 1 (ออปชั่นภาพรวม) — ข้อ 3,5,6,7,10,11,13
//   ทดสอบผ่าน DOM จริง · ยึดราคา/พฤติกรรมที่แก้ตาม HANDOFF-calculator-fixes-FINAL
import { JSDOM, VirtualConsole } from "jsdom";
import { readFileSync } from "node:fs";
const html = readFileSync(new URL("../public/calculator/index.html", import.meta.url), "utf8");
const vc = new VirtualConsole(); const errors = [];
vc.on("jsdomError", e => { if (!/scrollTo|Not implemented/.test(e.message)) errors.push(e.message); });
const dom = new JSDOM(html, { runScripts: "dangerously", pretendToBeVisual: true, virtualConsole: vc, url: "http://localhost/calculator/index.html" });
await new Promise(r => { if (dom.window.document.readyState === "complete") r(); else dom.window.addEventListener("load", r); setTimeout(r, 1500); });
const w = dom.window, doc = w.document;
const checks = [];
const want = (n, ok, d) => checks.push({ n, ok: !!ok, d: d || "" });
const fire = (el, t) => el.dispatchEvent(new w.Event(t, { bubbles: true }));
const noSvc = () => ["svc-protect","svc-lift","svc-travel","svc-ship"].forEach(id=>{const e=doc.getElementById(id); if(e&&e.checked){e.checked=false;fire(e,"change");}});
const subtotal = () => { noSvc(); w.calcQuote(); w.genQuote(); const m=doc.getElementById("quoteContent").innerHTML.match(/รวมเป็นเงิน<\/span><span>([\d,\.]+)/); return m?parseFloat(m[1].replace(/,/g,"")):0; };
const grand = () => { noSvc(); w.calcQuote(); w.genQuote(); const g=doc.querySelector("#quoteContent .qtot .g"); return g?parseInt((g.textContent||"").replace(/\.\d+/g,"").replace(/[^\d]/g,""),10):NaN; };
const setV = (root, sel, v) => { const el=root.querySelector(sel); if(!el) throw new Error("ไม่พบ "+sel); el.value=String(v); fire(el,"input"); fire(el,"change"); return el; };
function mk(group, prodId, W, H){ doc.getElementById("items").innerHTML=""; w.addItem(doc.getElementById("items")); const ch=doc.querySelector("#items .ch"); setV(ch,".i-group",group); const ps=ch.querySelector(".i-prod"); ps.value=prodId; fire(ps,"change"); setV(ch,".i-w",W); setV(ch,".i-h",H); return ch; }

// ===== ข้อ3: บานเปิด X-series ใส่มุ้งได้ (mosquito:1 ย้ายมาระดับ product) =====
{
  const ch = mk("1","casement_xseries",1.2,2.2);
  const mosq = ch.querySelector(".o-mosq");
  want("ข้อ3 X-series มีเมนูมุ้ง (o-mosq) + ตัวเลือก>1", !!mosq && mosq.options.length>1, mosq?("options="+mosq.options.length):"ไม่มี o-mosq");
}

// ===== ข้อ11: shower อุปกรณ์ = select เดียว (เงิน/ดำ/ทอง · ไม่ติ๊กซ้อน) =====
{
  const ch = mk("1","shower",1.2,2.0);
  const hw = ch.querySelector(".o-showerhw");
  want("ข้อ11 shower มี select อุปกรณ์ (o-showerhw)", !!hw && hw.options.length===3, hw?("opt="+hw.options.length):"ไม่มี");
  want("ข้อ11 ไม่มี checkbox blackhw/goldhw แล้ว", !ch.querySelector(".o-blackhw") && !ch.querySelector(".o-goldhw"), "");
  const b0 = subtotal();
  hw.value="1"; fire(hw,"change"); const bBlack = subtotal();   // ดำ +4,000
  hw.value="2"; fire(hw,"change"); const bGold = subtotal();    // ทอง +6,000
  hw.value="0"; fire(hw,"change"); const bSilver = subtotal();  // เงิน 0
  want("ข้อ11 ดำ = +4,000", bBlack-b0===4000, "Δ="+(bBlack-b0));
  want("ข้อ11 ทอง = +6,000 (ไม่ใช่ +10,000 ซ้อน)", bGold-b0===6000, "Δ="+(bGold-b0));
  want("ข้อ11 เงิน = +0", bSilver-b0===0, "Δ="+(bSilver-b0));
}

// ===== ข้อ6: มุ้งม้วนเตะ maxWidth — กว้างเกิน → ไม่คิดราคา + เตือน =====
{
  // mj_kick_150 addon: maxWidth 1.5 · บานเปิดยูโร
  const chOk = mk("1","casement_euro",1.0,2.0);
  const mq1 = chOk.querySelector(".o-mosq"); mq1.value="mj_kick_150"; fire(mq1,"change");
  const okSell = subtotal();
  const chOver = mk("1","casement_euro",1.0,2.0);  // base เท่ากัน (กว้างเท่ากัน 1.0)
  const overBase = subtotal();
  // เปลี่ยนกว้างเป็น 2.0 (>1.5) แล้วใส่มุ้ง → ไม่ควรบวกมุ้ง · เทียบ base กว้าง 2.0 ไม่ใส่มุ้ง
  const chW2 = mk("1","casement_euro",2.0,2.0); const w2base = subtotal();
  const mq2 = chW2.querySelector(".o-mosq"); mq2.value="mj_kick_150"; fire(mq2,"change"); const w2mosq = subtotal();
  want("ข้อ6 มุ้งกว้างเกิน maxWidth → ไม่บวกราคา (Δ=0)", w2mosq-w2base===0, "Δ="+(w2mosq-w2base));
  const warn = (doc.querySelector("#items .ch .chmsg")||{}).textContent||"";
  want("ข้อ6 มีคำเตือนเปลี่ยนรุ่นมุ้ง", /เปลี่ยนรุ่นมุ้ง|รับกว้าง/.test(warn), warn.slice(0,60));
}

// ===== ข้อ10: สีกรอบมุ้ง addon — เลือกสีแล้วบวกค่าทำสี =====
{
  const ch = mk("1","casement_euro",1.0,2.0);
  const mq = ch.querySelector(".o-mosq"); mq.value="mj_sd_basic"; fire(mq,"change"); // มุ้งจีบ มี mscolor
  const c0 = subtotal();
  const mc = ch.querySelector(".o-mosqcolor");
  want("ข้อ10 มี select สีกรอบมุ้ง addon (o-mosqcolor)", !!mc, "");
  if(mc){ mc.value="sahara"; fire(mc,"change"); const cSahara = subtotal();
    want("ข้อ10 เลือกสีกรอบ (ซาฮาร่า) → ราคาเพิ่ม", cSahara>c0, "Δ="+(cSahara-c0)); }
}

// ===== ข้อ5: OPTION ระดับชุด (set-optdelta) บวกเข้ายอดจริง =====
{
  doc.getElementById("items").innerHTML="";
  const setBox = w.addSet();
  const parts = setBox.querySelector(".set-parts");
  w.addItem(parts);
  [...setBox.querySelectorAll(".ch")].forEach(ch=>{ setV(ch,".i-group","1"); const ps=ch.querySelector(".i-prod"); ps.value="casement_euro"; fire(ps,"change"); setV(ch,".i-w",2); setV(ch,".i-h",2); });
  setV(setBox,".set-name","ชุดทดสอบ");
  const before = subtotal();
  setV(setBox,".set-optdelta","5000");
  const after = subtotal();
  want("ข้อ5 OPTION ชุด +5,000 บวกเข้ายอดจริง (ครั้งเดียว)", after-before===5000, "Δ="+(after-before));
}

// ===== ข้อ13: discFlat ส่วนลดเกินยอด → ยอดรวมไม่ติดลบ =====
{
  mk("1","casement_euro",2,2);
  const sub = subtotal();
  doc.getElementById("discFlat").value=String(sub+999999); fire(doc.getElementById("discFlat"),"input");
  const g = grand();
  want("ข้อ13 discFlat เกินยอด → รวมทั้งสิ้น ≥ 0 (ไม่ติดลบ)", g>=0, "grand="+g);
  doc.getElementById("discFlat").value="0"; fire(doc.getElementById("discFlat"),"input");
}

// ===== ข้อ7: กั้นห้องกระจก ป้ายด้าน auto A/B/C =====
{
  doc.getElementById("items").innerHTML="";
  const box = w.addGlasshouseSet();
  // เพิ่มบานที่ 2, 3 ผ่านปุ่ม + เพิ่มบาน (set-addpart)
  const addBtn = box.querySelector(".set-addpart");
  if(addBtn){ addBtn.click(); addBtn.click(); }
  const sides = [...box.querySelectorAll(".set-parts .ch")].map(ch=>(ch.querySelector(".i-position")||{}).value);
  want("ข้อ7 ป้ายด้าน auto = A, B, C (ไม่ซ้ำ A ทุกบาน)", sides[0]==="ด้าน A" && sides[1]==="ด้าน B" && sides[2]==="ด้าน C", "ได้ "+JSON.stringify(sides));
}

want("Z jsdom ไม่มี error", errors.length === 0, errors.join(" | "));

let pass = 0;
checks.forEach(c => { console.log((c.ok ? "[PASS] " : "[FAIL] ") + c.n + (c.ok ? "" : "  → " + c.d)); if (c.ok) pass++; });
console.log(`\nผ่าน ${pass}/${checks.length}`);
process.exit(pass === checks.length ? 0 : 1);
