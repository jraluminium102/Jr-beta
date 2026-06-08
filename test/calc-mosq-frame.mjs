// P1-2 + FIX มุ้งเข้ายอด: มุ้งต่อบาน (o-mosq addon) ต้องบวกเข้า sell จริง
//   - เฟรม imp21/22/23: rate tier ตามพื้นที่ + min ตาม ประตู/หน้าต่าง × จำนวนบาน (เท่า product)
//   - ราคามุ้ง roundUp ทีละชิ้น แล้วบวกเข้า line (เดิมตกหล่น ไม่เก็บเงิน — บั๊ก refactor)
//   - regression: มุ้งจีบเดิม (mj_sd_basic) ต้องบิลด้วย
import { JSDOM, VirtualConsole } from "jsdom";
import { readFileSync } from "node:fs";

const html = readFileSync(new URL("../public/calculator/index.html", import.meta.url), "utf8");
const vc = new VirtualConsole();
const errors = [];
vc.on("jsdomError", (e) => { if (!/scrollTo|Not implemented/.test(e.message)) errors.push(e.message); });
const dom = new JSDOM(html, { runScripts: "dangerously", pretendToBeVisual: true, virtualConsole: vc, url: "http://localhost/calculator/index.html" });
await new Promise((r) => { if (dom.window.document.readyState === "complete") r(); else dom.window.addEventListener("load", r); setTimeout(r, 1500); });

const w = dom.window, doc = w.document;
const PBYID = w.eval("PBYID");
const checks = [];
const want = (name, ok, detail) => checks.push({ name, ok: !!ok, detail: detail || "" });
const fire = (el, t) => el.dispatchEvent(new w.Event(t, { bubbles: true }));
const roundUp = (x) => Math.ceil(x / 1000) * 1000;

// delta ของ sell เมื่อใส่มุ้ง vs ไม่ใส่ (itype เดียวกัน → แยกเฉพาะค่ามุ้ง)
function mosqDelta(prodId, wd, ht, panels, itype, mosqId, fabric) {
  const base = { mosqFabric: fabric || "fiber_gray", itype };
  const rNo = w.calcUnit(PBYID[prodId], String(wd), String(ht), 0, 0, panels, { ...base, mosqId: "" }, false);
  const rYes = w.calcUnit(PBYID[prodId], String(wd), String(ht), 0, 0, panels, { ...base, mosqId }, false);
  return { delta: rYes.sell - rNo.sell, no: rNo.sell, yes: rYes.sell };
}

// ---------- เฟรมมุ้ง: delta = roundUp(ราคาดิบตามสูตร) ----------
// imp21 ประตู 1.0×2.2: A=2.2 → tier[1.5,2.5]=1700 ×2.2=3740 (min_door 2400 ไม่ถึง) → roundUp 4000
want("M1 imp21 ประตู 2.2ตร.ม. → +4000", mosqDelta("casement_euro",1.0,2.2,1,"door","imp21").delta===4000, "delta="+mosqDelta("casement_euro",1.0,2.2,1,"door","imp21").delta);
// imp21 หน้าต่าง 1.0×1.0: A=1.0 → tier[0,1.5]=2200 (min_window 1200) → roundUp 3000
want("M2 imp21 หน้าต่าง 1ตร.ม. → +3000", mosqDelta("casement_euro",1.0,1.0,1,"window","imp21").delta===3000, "delta="+mosqDelta("casement_euro",1.0,1.0,1,"window","imp21").delta);
// imp23 ประตู 2.0×2.2 p2: A=4.4 → tier[3.0,∞]=3500 ×4.4=15400 (min_door 7200×2=14400) → roundUp 16000
want("M3 imp23 ประตู 4.4ตร.ม. p2 → +16000", mosqDelta("casement_euro",2.0,2.2,2,"door","imp23").delta===16000, "delta="+mosqDelta("casement_euro",2.0,2.2,2,"door","imp23").delta);
// imp22 หน้าต่างเล็ก 0.5×0.5: A=0.25 ×1200=300 < min_window 800 → ใช้ min 800 → roundUp 1000
want("M4 imp22 min_window มีผล → +1000", mosqDelta("casement_euro",0.5,0.5,1,"window","imp22").delta===1000, "delta="+mosqDelta("casement_euro",0.5,0.5,1,"window","imp22").delta);
// imp21 หน้าต่าง 1.0×1.0 p2: base 2200 < min_window 1200×2=2400 → ใช้ min×panels 2400 → roundUp 3000
want("M5 imp21 min×จำนวนบาน → +3000", mosqDelta("casement_euro",1.0,1.0,2,"window","imp21").delta===3000, "delta="+mosqDelta("casement_euro",1.0,1.0,2,"window","imp21").delta);
// ผ้ากันแมว/หมา flat +800: imp21 ประตู 2.2 → 3740+800=4540 → roundUp 5000
want("M6 ผ้ากันแมว/หมา +800 → +5000", mosqDelta("casement_euro",1.0,2.2,1,"door","imp21","anti_pet").delta===5000, "delta="+mosqDelta("casement_euro",1.0,2.2,1,"door","imp21","anti_pet").delta);

// ---------- regression: มุ้งจีบเดิม (mj_sd_basic) ต้องบิล ----------
// rate 2500/ตร.ม. min 3500 · ประตู 1.5×2.2 A=3.3 ×2500=8250 → roundUp 9000
want("M7 มุ้งจีบเดิมบิลจริง (เคยตกหล่น)", mosqDelta("casement_euro",1.5,2.2,1,"door","mj_sd_basic").delta===9000, "delta="+mosqDelta("casement_euro",1.5,2.2,1,"door","mj_sd_basic").delta);
want("M8 ไม่ใส่มุ้ง delta=0", mosqDelta("casement_euro",1.5,2.2,1,"door","").delta===0, "delta="+mosqDelta("casement_euro",1.5,2.2,1,"door","").delta);
// addonLines.p = ราคาที่บิล (rounded) ตรงกับ delta
const rChk = w.calcUnit(PBYID["casement_euro"], "1.0","2.2",0,0,1,{mosqId:"imp21",mosqFabric:"fiber_gray",itype:"door"},false);
const alP = (rChk.addonLines||[]).find(a=>a.mosqArea!==undefined);
want("M9 addonLines.p = ราคาบิล 4000", alP && alP.p===4000, "p="+(alP?alP.p:"NONE"));
want("M10 ไม่มี NaN ในราคา", Number.isFinite(rChk.sell) && !/NaN/.test(String(rChk.sell)), "");

// ---------- dropdown มีตัวเลือกเฟรม + ป้ายไม่มี NaN ----------
doc.getElementById("items").innerHTML = "";
w.addItem(doc.getElementById("items"));
const ch = doc.querySelector("#items .ch");
const ps = ch.querySelector(".i-prod"); ps.value = "casement_euro"; fire(ps, "change");
const mosqSel = ch.querySelector(".o-mosq");
want("M11 dropdown มี imp21/22/23", mosqSel && ["imp21","imp22","imp23"].every(id => !!mosqSel.querySelector('option[value="'+id+'"]')), mosqSel ? "options="+mosqSel.options.length : "ไม่พบ .o-mosq");
want("M12 ป้าย dropdown ไม่มี NaN + มีป้ายเฟรม", mosqSel && !/NaN/.test(mosqSel.innerHTML) && /เฟรม · คิดตามขนาดบาน/.test(mosqSel.innerHTML), "ป้ายผิด");

// ---------- หัวข้อใบขึ้น "พร้อมมุ้งเฟรมใหญ่" + ราคารวมมีมุ้ง ----------
ch.querySelector(".i-w").value = "1.0"; fire(ch.querySelector(".i-w"),"input");
ch.querySelector(".i-h").value = "2.2"; fire(ch.querySelector(".i-h"),"input");
mosqSel.value = "imp23"; fire(mosqSel,"change");
["svc-protect","svc-lift","svc-travel","svc-ship"].forEach((id)=>{ const e=doc.getElementById(id); if(e&&e.checked){e.checked=false; fire(e,"change");} });
w.calcQuote(); w.genQuote();
const gen = doc.getElementById("quoteContent").innerHTML;
want("M13 หัวข้อใบขึ้น 'พร้อมมุ้งเฟรมใหญ่'", /พร้อมมุ้งเฟรมใหญ่/.test(gen), "ไม่พบในใบ");
want("M14 ใบไม่มี NaN", !/NaN/.test(gen), "พบ NaN ในใบ");
want("M15 jsdom ไม่มี error", errors.length === 0, errors.join(" | "));

let pass = 0;
checks.forEach(c => { console.log((c.ok ? "[PASS] " : "[FAIL] ") + c.name + (c.ok ? "" : "  → " + c.detail)); if (c.ok) pass++; });
console.log(`\nผ่าน ${pass}/${checks.length}`);
process.exit(pass === checks.length ? 0 : 1);
