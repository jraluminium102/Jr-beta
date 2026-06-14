// pricecheck-g3-render.mjs — render เคส G3 จาก engine จริง (index.html) ด้วย jsdom
// จับ: base (ขนาดเปล่า ไม่มีออปชั่น) + full (ใส่ออปชั่น) + msgs จริง + area
// ใช้: node scripts/pricecheck-g3-render.mjs  → เขียน scripts/pricecheck-g3-data.json
import { JSDOM, VirtualConsole } from "jsdom";
import { readFileSync, writeFileSync } from "node:fs";

const html = readFileSync("public/calculator/index.html", "utf8");
const vc = new VirtualConsole();
const errs = [];
vc.on("jsdomError", (e) => errs.push(e.message));
const dom = new JSDOM(html, { runScripts: "dangerously", pretendToBeVisual: true, virtualConsole: vc, url: "http://localhost/" });
await new Promise((r) => { dom.window.addEventListener("load", r); setTimeout(r, 1500); });
const w = dom.window, doc = w.document;
const fire = (el, t) => el.dispatchEvent(new w.Event(t, { bubbles: true }));
const setF = (ch, s, v) => { const el = ch.querySelector(s); if (el) { el.value = String(v); fire(el, "input"); fire(el, "change"); } };
const chk = (ch, s, b) => { const el = ch.querySelector(s); if (el) { el.checked = b; fire(el, "change"); } };

// ปิด svc-protect (ค่าบริการดูแล) กันบวกเข้ายอด
{ const sp = doc.getElementById("svc-protect"); if (sp && sp.checked) { sp.checked = false; fire(sp, "change"); } }

function mkItem(c, withOpts) {
  doc.getElementById("items").innerHTML = "";
  w.addItem(doc.getElementById("items"));
  const ch = [...doc.querySelectorAll("#items .ch")].pop();
  setF(ch, ".i-group", 3);
  const ps = ch.querySelector(".i-prod");
  if (!ps.querySelector('option[value="' + c.prod + '"]')) ps.innerHTML = w.prodOptionsG6("3");
  ps.value = c.prod; fire(ps, "change");
  setF(ch, ".i-w", c.w); setF(ch, ".i-h", c.h);
  if (withOpts) {
    for (const e of Object.entries(c.opts || {})) setF(ch, e[0], e[1]);
    for (const e of Object.entries(c.chk || {})) chk(ch, e[0], e[1]);
  }
  return ch;
}

function run(c) {
  // base = ขนาดเปล่า (ไม่มีออปชั่นใดๆ — แต่ฝ้าอลู/ผนัง ต้องตั้งสี/ความหนาเพื่อให้ engine คิดได้)
  const chBase = mkItem(c, false);
  // สำหรับฝ้าอลู (ceiling crates) ต้องเลือกสีก่อน base ถึงจะถูก → ใส่เฉพาะ opt ที่เป็น "พื้นฐานวัสดุ" ไม่ใช่ออปชั่นเสริม
  for (const e of Object.entries(c.baseOpts || {})) setF(chBase, e[0], e[1]);
  const rb = w.readItem(chBase).r;
  const base = Math.round(rb.sell);
  const area = +rb.a.toFixed(2);

  // full = ใส่ออปชั่นทั้งหมด
  const chFull = mkItem(c, true);
  const rf = w.readItem(chFull).r;
  const full = Math.round(rf.sell);
  const msgs = (rf.msgs || []).slice();
  return { id: c.id, grp: c.grp, prod: c.prod, name: w.PRODUCTS ? "" : "", size: c.w + "×" + c.h, area, base, full, msgs };
}

// ===== เคส =====
const STD_GUT = { ".o-roofend": "รางน้ำ", ".o-guttersys": "ท่อ", ".o-gutter-pipecolor": "ขาว" };
const C = [];

// --- หลังคา (ขนาดยาว6×ยื่น3 = 18 ตร.ม.) ---
C.push({ id: "หลังคาไวนิล", grp: "หลังคา", prod: "roof_vinyl", w: 6, h: 3, opts: { ...STD_GUT } });
C.push({ id: "หลังคาดีไลท์", grp: "หลังคา", prod: "roof_delight", w: 6, h: 3, opts: { ...STD_GUT } });
C.push({ id: "หลังคาโพลีตัน 3มม.", grp: "หลังคา", prod: "roof_polyton", w: 6, h: 3, opts: { ...STD_GUT } });
C.push({ id: "หลังคากระจกลามิเนต (ฟิล์มใส 4+4)", grp: "หลังคา", prod: "roof_laminate", w: 6, h: 3, opts: { ".o-lamfilm": "ใส", ".o-lamthick": "4+4", ...STD_GUT } });
C.push({ id: "เมทัลชีท imp7 (1\" ท้องPVC)", grp: "หลังคา", prod: "imp7", w: 6, h: 3, opts: { ...STD_GUT } });
C.push({ id: "เมทัลชีท imp14 (2\" PU)", grp: "หลังคา", prod: "imp14", w: 6, h: 3, opts: { ...STD_GUT } });
C.push({ id: "ชินโคไลท์ imp15 (HeatCut)", grp: "หลังคา", prod: "imp15", w: 6, h: 3, opts: { ...STD_GUT } });
C.push({ id: "ชินโคไลท์ imp19 (Grand)", grp: "หลังคา", prod: "imp19", w: 6, h: 3, opts: { ...STD_GUT } });

// --- ออปชั่นหลังคาผสม / เลื่อน ---
C.push({ id: "หลังคาเลื่อน 4 บาน (ไวนิล)", grp: "ออปชั่นหลังคา", prod: "roof_vinyl", w: 6, h: 3, opts: { ...STD_GUT, ".o-spanels": "4" }, chk: { ".o-slide": true } });
C.push({ id: "หลังคาผสม ไวนิล + ลามิเนต 5 ตร.ม.", grp: "ออปชั่นหลังคา", prod: "roof_vinyl", w: 6, h: 3, opts: { ...STD_GUT, ".o-roof2": "roof_laminate", ".o-roof2area": "5" } });
C.push({ id: "ไวนิล + เสริม (เสาแผง2 + คานถัก6ม. + ครอบPVC6ม.)", grp: "ออปชั่นหลังคา", prod: "roof_vinyl", w: 6, h: 3, opts: { ...STD_GUT, ".o-rfpolep": "2", ".o-rfbeam": "2400", ".o-rfbeamlen": "6", ".o-rfpvc": "6" } });

// --- ฝ้า ---
C.push({ id: "ฝ้าฉาบเรียบ (ทาสีขาว)", grp: "ฝ้า", prod: "ceiling_smooth", w: 6, h: 3, opts: { ".o-ceilfinish": "ทาสีขาว" } });
C.push({ id: "ฝ้าอลู ตัวซี 15ซม. (ขาว-ดำ)", grp: "ฝ้า", prod: "ceil_cshape", w: 6, h: 3, baseOpts: { ".o-ckolor": "ขาว-ดำ" }, opts: { ".o-ckolor": "ขาว-ดำ" } });
C.push({ id: "ฝ้าไม้เทียม remood (ลายไม้)", grp: "ฝ้า", prod: "ceil_bsc", w: 6, h: 3, baseOpts: { ".o-ckolor": "ลายไม้/สีอื่น" }, opts: { ".o-ckolor": "ลายไม้/สีอื่น" } });

// --- ผนัง ---
C.push({ id: "ผนังเบาภายนอก (สมาร์ทบอร์ด12)", grp: "ผนัง", prod: "wall_ext", w: 3, h: 2.4, opts: { ".o-smartthick": "12", ".o-wallpaint": "ทาสีขาว" } });
C.push({ id: "ผนังเบาภายใน (สมาร์ทบอร์ด12)", grp: "ผนัง", prod: "wall_int", w: 3, h: 2.4, opts: { ".o-smartthick": "12", ".o-wallpaint": "ทาสีขาว" } });
C.push({ id: "ISOWALL หนา 10ซม. (สีขาว)", grp: "ผนัง", prod: "isowall", w: 3, h: 2.4, baseOpts: { ".o-isothick": "10", ".o-isocolor": "ขาว" }, opts: { ".o-isothick": "10", ".o-isocolor": "ขาว" } });

const out = C.map(run);
const realErrs = errs.filter((e) => !/Not implemented:|scrollTo/.test(e));
writeFileSync("scripts/pricecheck-g3-data.json", JSON.stringify({ cases: out, errs: realErrs }, null, 1), "utf8");
console.log("render " + out.length + " เคส · errs=" + realErrs.length + " · → scripts/pricecheck-g3-data.json");
for (const c of out) console.log("  " + c.id + " | area=" + c.area + " | base=" + c.base + " | full=" + c.full);
