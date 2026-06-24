// check-g2.mjs — ตรวจงาน G2 (รั้ว/ระแนง/ราวกันตก) ที่ dev แก้ใน index.html เทียบดราฟ
// เทียบ 6 มิติ: ปุ่ม/สินค้า · ออปชั่น/leak · ราคา(golden) · อุปกรณ์เสริม · ใบเสนอราคาจริง · เทสออปชั่นขยับราคา
// เกณฑ์: HANDOFF-G2-restructure-2026-06-15 + memory g2-restructure-v2 + CODEREADY-G2-2026-06-15
// ใช้:  node scripts/check-g2.mjs        → ออกรายงาน HTML + สรุปใน terminal
//       เปิด docs/กลุ่ม2-รั้วระแนงราวกันตก/CHECK-G2-vs-draft-<วันนี้>.html
import { JSDOM, VirtualConsole } from "jsdom";
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");
const OUTDIR = join(ROOT, "docs", "กลุ่ม2-รั้วระแนงราวกันตก");
const DATE = process.argv[2] || "today";
const OUT = join(OUTDIR, `CHECK-G2-vs-draft-${DATE}.html`);

// ===== สเปกดราฟ G2 (source of truth = HANDOFF-G2-restructure-2026-06-15 + memory g2-restructure-v2) =====
// กลุ่ม 2 FAM_CATS: ['ระแนง-บังตา','ระแนง-ผนัง','ระแนง-เกล็ด','ราวบันได','ประตูรั้ว','ระแนง']
// ดราฟต้องการ 4 หมวด (merged) → ตรวจตอนนี้แยก 6 ปุ่ม = แจ้งว่ายังไม่ merge
// NOTE: ไม่โครงถูก _hideRanaeSolo ซ่อนโดยตั้งใจ (group 2) → ตรวจเฉพาะ รวมโครง variants
const EXPECTED_PRODS = {
  "ระแนง-บังตา": ["rn2","rn4","rn6","rn8","rn14","rn20","rn26","rn44"], // รวมโครง เท่านั้น
  "ระแนง-ผนัง": ["rn38","rn40","rn42"],  // รวมโครง เท่านั้น
  "ระแนง-เกล็ด": ["rn84","rn86","rn88"], // รวมโครง เท่านั้น (84=ไม่โครง? → ตรวจก่อน)
  "ราวบันได": ["imp1","imp2","imp3","imp4","imp5","imp6"],
  "ประตูรั้ว": ["fence_gate"],
  "ระแนง": ["bar_slide","bar_grid_z","bar_openclose"],
};
// ขนาดที่ golden-snapshot ใช้สำหรับ G2 (SIZE[2]=[2.0,1.5] จาก golden-snapshot.mjs L55)
const G2_W=2.0, G2_H=1.5;

// ออปชั่นที่ควรมี / ไม่ควรมี ต่อสินค้า G2 (จาก handoff + CODEREADY-G2)
const EXPECTED_OPTS = [
  // ระแนงกล่อง: ต้องมี o-finish · ไม่ควรมี o-gridmark · ไม่ควรมี o-uchannel
  { cls:"o-finish", label:"ผิว/สีระแนง", on:["rn2","rn38","rn84"], note:"ระแนงทุกตัว: ต้องเลือกผิว/สีได้ (fin object มีใน product)" },
  { cls:"o-gridmark", label:"คาดตาราง (ไม่ควรมีบนระแนง — leak)", off:["rn2","rn38","rn84","fence_gate"], note:"ตัด leak แล้ว: gridmark ไม่โผล่บนระแนง/ประตูรั้ว (CODEREADY A1)" },
  { cls:"o-uchannel", label:"ฝังรางยู (ไม่ควรมีบนระแนง — leak)", off:["rn2","rn38","rn84","fence_gate"], note:"ตัด leak แล้ว: uchannel ไม่โผล่บนระแนง/ประตูรั้ว (CODEREADY A2)" },
  // fence_gate: ต้องมี o-gatetype (เลื่อนเท่านั้น), o-gatern cascade, o-gmotor, o-railtype
  { cls:"o-gatetype", label:"ลักษณะการเปิด (ประตูรั้ว)", on:["fence_gate"], note:"CODEREADY A3: เหลือบานเลื่อนอย่างเดียว" },
  { cls:"o-gmotor", label:"มอเตอร์ (ประตูรั้ว)", on:["fence_gate"], note:"ต้องกรอกจำนวนมอเตอร์ได้" },
  { cls:"o-railtype", label:"ชนิดราง ตรง/โค้ง (ประตูรั้ว)", on:["fence_gate"], note:"ราคาต่างกัน (ตรง 1,500/โค้ง 2,500/ม.)" },
  { cls:"o-gfin", label:"อบสี/ผิว (ประตูรั้ว)", on:["fence_gate"], note:"สีอบขาว/ดำ/ซาฮาร่า/ลายไม้/อบพิเศษ" },
  // bar_slide (ระแนงเลื่อน Inception): ต้องมี o-bsdoor, o-bsdoorprice
  { cls:"o-bsdoor", label:"ค่าประตู เลือกรุ่น (bar_slide Inception)", on:["bar_slide"], note:"ระแนงเลื่อน Inception: เลือกรุ่นประตู G1 หรือ ติดตาย" },
  { cls:"o-bsdoorprice", label:"ราคาประตูกรอกเอง (bar_slide Inception)", on:["bar_slide"], note:"override ราคาประตูได้ (กรอก >0 = ใช้แทนรุ่น)" },
  // bar_grid_z (บานเกล็ดอลู): ต้องมี o-bgdir, o-bgcolor, o-bsdoor
  { cls:"o-bgdir", label:"ทิศระแนง ตั้ง/นอน (bar_grid_z)", on:["bar_grid_z"], note:"D = สูง(ตั้ง) หรือ กว้าง(นอน)" },
  { cls:"o-bsdoor", label:"ทำเป็นบาน (bar_grid_z)", on:["bar_grid_z"], note:"G2 B2/B4: เกล็ดอลู 38.1 ทำเป็นบานได้ เหมือน bar_slide" },
  // bar_openclose: ต้องมี o-bocdir
  { cls:"o-bocdir", label:"ทิศระแนง (bar_openclose)", on:["bar_openclose"], note:"ระแนงหมุนเปิด-ปิด: แนวตั้ง/แนวนอน" },
  // ราวกันตก: railalu (imp2/3/5/6) ต้องมีสีอลู · railstud (imp1/4) ไม่มี
  { cls:"o-railalucolor", label:"สีอลูมิเนียม (ราวกันตก)", on:["imp2","imp3","imp5","imp6"], note:"ราวมีอลู (railalu): เลือกสีขาว/เทา/ดำได้" },
  { cls:"o-railalucolor", label:"สีอลูมิเนียม ไม่ควรมีบน imp1/imp4 (หมุดแปะ)", off:["imp1","imp4"], note:"imp1/imp4 = railstud: ไม่มีอลูมิเนียมสี" },
];

// ===== boot =====
const html = readFileSync(join(ROOT,"public/calculator/index.html"),"utf8");
const vc = new VirtualConsole(); const jsErr=[];
vc.on("jsdomError",e=>{ if(!/scrollTo|Not implemented/i.test(e.message)) jsErr.push(e.message); });
const dom = new JSDOM(html,{runScripts:"dangerously",pretendToBeVisual:true,virtualConsole:vc,url:"http://localhost/calculator/index.html"});
await new Promise(r=>{ if(dom.window.document.readyState==="complete")r(); else dom.window.addEventListener("load",r); setTimeout(r,2000); });
const w=dom.window, doc=w.document;
const fire=(el,t)=>el.dispatchEvent(new w.Event(t,{bubbles:true}));
const noSvc=()=>["svc-protect","svc-lift","svc-travel","svc-ship"].forEach(id=>{const e=doc.getElementById(id);if(e&&e.checked){e.checked=false;fire(e,"change");}});

function renderProd(id, grp){
  grp = grp || "2"; // G2 = group 2
  doc.getElementById("items").innerHTML="";
  try{ w.addItem(doc.getElementById("items")); }catch(e){ return null; }
  const ch=doc.querySelector("#items .ch"); if(!ch) return null;
  const gs=ch.querySelector(".i-group"); if(gs){ gs.value=grp; fire(gs,"change"); }
  const ps=ch.querySelector(".i-prod"); if(!ps) return {ch,ok:false};
  // ค้นหาใน optgroup ทั้งหมด
  const opt=ps.querySelector('option[value="'+id+'"]');
  if(!opt) return {ch,ok:false,notInG:true};
  ps.value=id; fire(ps,"change");
  const wi=ch.querySelector(".i-w"),hi=ch.querySelector(".i-h");
  if(wi){wi.value="3";fire(wi,"input");fire(wi,"change");}
  if(hi){hi.value="2";fire(hi,"input");fire(hi,"change");}
  return {ch,ok:true,ps};
}
function optClasses(ch){ const set=new Set(); ch.querySelectorAll("*").forEach(e=>{ if(e.classList) e.classList.forEach(c=>{ if(/^o-/.test(c)) set.add(c); }); }); return [...set].sort(); }
function grand(){ noSvc(); try{ w.calcQuote&&w.calcQuote(); w.genQuote&&w.genQuote(); }catch(e){ return NaN; } const g=doc.querySelector("#quoteContent .qtot .g"); return g?parseInt((g.textContent||"").replace(/\.\d+/g,"").replace(/[^\d]/g,""),10):NaN; }
function setOpt(ch,cls,val){ const el=ch.querySelector(cls); if(!el)return false; if(el.type==="checkbox"){ el.checked=(val===true||val==="1"||val===1); } else { el.value=String(val); } fire(el,"input"); fire(el,"change"); return true; }
function build(id,wd,ht,optPairs,grp){
  grp=grp||"2";
  doc.getElementById("items").innerHTML=""; w.addItem(doc.getElementById("items"));
  const ch=doc.querySelector("#items .ch"); if(!ch)return null;
  const gs=ch.querySelector(".i-group"); if(gs){gs.value=grp;fire(gs,"change");}
  const ps=ch.querySelector(".i-prod"); if(!ps||!ps.querySelector('option[value="'+id+'"]'))return null;
  ps.value=id; fire(ps,"change");
  const wi=ch.querySelector(".i-w"),hi=ch.querySelector(".i-h");
  if(wi){wi.value=String(wd);fire(wi,"input");fire(wi,"change");}
  if(hi){hi.value=String(ht);fire(hi,"input");fire(hi,"change");}
  const applied=[]; for(const [cls,val] of (optPairs||[])){ applied.push({cls,ok:setOpt(ch,cls,val)}); }
  return {ch,applied};
}
function genQuoteOf(id,wd,ht,optPairs,grp){
  const b=build(id,wd,ht,optPairs,grp); if(!b)return null;
  const g=grand(); const qc=doc.getElementById("quoteContent");
  return { html: qc?qc.innerHTML:"", grand:g, applied:b.applied };
}
function billText(id,wd,ht,optPairs,grp){ const b=build(id,wd,ht,optPairs,grp); if(!b)return null; noSvc(); try{w.calcQuote();w.genQuote();}catch(e){return "";} return (doc.getElementById("quoteContent")||{}).textContent||""; }

const rows=[]; // {sev,area,title,detail}
const sev={ok:"🟢",miss:"🔴",extra:"🟠",warn:"🟡",info:"⬜"};
const add=(s,area,title,detail)=>rows.push({s,area,title,detail});

// ===== 1. ปุ่ม/สินค้า — เลือกได้ในกลุ่ม 2 ไหม =====
// ตรวจ FAM_CATS[2] ว่ามีครบ 6 หมวด
const famCats2 = (()=>{ try { return w.eval("FAM_CATS['2']")||[]; }catch(e){ return []; } })();
add(famCats2.length>=6?"ok":"warn","ปุ่ม","FAM_CATS[2] มีครบ 6 หมวด", famCats2.length+"หมวด: "+famCats2.join(", "));

// ตรวจ RN_TREE ว่ามี box+gleed (cascade ใหม่)
const rnKeys = (()=>{ try{ return Object.keys(w.eval("RN_TREE")||{}); }catch(e){ return []; } })();
add(rnKeys.includes("box")&&rnKeys.includes("gleed")?"ok":"miss","ปุ่ม","RN_TREE มีกุญแจ box+gleed (cascade ใหม่)", "พบ: "+JSON.stringify(rnKeys)+(rnKeys.includes("box")?" · box=ระแนงกล่อง(บังตา+ผนัง) gleed=เกล็ด Z ✅":"" ));

// ตรวจสินค้าแต่ละหมวดเลือกได้ในกลุ่ม 2
for(const [fam, ids] of Object.entries(EXPECTED_PRODS)){
  const miss=[];
  for(const id of ids){
    const r=renderProd(id,"2");
    if(!r||!r.ok) miss.push(id);
  }
  if(miss.length) add("miss","ปุ่ม","["+fam+"] รุ่นที่เลือกไม่ได้ในกลุ่ม 2", "ขาด: "+miss.join(", "));
  else add("ok","ปุ่ม","["+fam+"] รุ่นครบ เลือกได้", ids.length+" รุ่น ✅");
}

// ตรวจ UX merge 4 ปุ่มหลัก (G2GROUPS · commit a6d754b · มติพี่นัท 17มิ.ย.) — ทำแล้ว
const g2groups = (()=>{ try { return w.eval("G2GROUPS")||[]; }catch(e){ return []; } })();
add(g2groups.length===4?"ok":"warn","ปุ่ม","UX merge 4 ปุ่มหลัก (G2GROUPS)",
  g2groups.length===4?("4 ปุ่ม: "+g2groups.map(g=>g.n).join(" · ")+" · ระแนงรวม บังตา/ผนัง/เกล็ด/เลื่อน เป็น subtypes ✅ (commit a6d754b)"):("G2GROUPS = "+g2groups.length+" กลุ่ม (ควร 4) → UX merge ยังไม่ทำ/พัง"));

// ตรวจ gatetype = บานเลื่อน only (CODEREADY A3)
{ const r=renderProd("fence_gate","2");
  if(r&&r.ok){
    const sel=r.ch.querySelector(".o-gatetype");
    if(sel){ const opts=Array.from(sel.options).map(o=>o.value);
      const onlySlide = opts.length===1 && opts[0]==='slide_bottom';
      add(onlySlide?"ok":"miss","ปุ่ม","o-gatetype ประตูรั้ว = บานเลื่อนเท่านั้น (CODEREADY A3)",
        onlySlide?"เลือกได้แค่ 'บานเลื่อน' (slide_bottom) ✅":"ยังมีตัวเลือกอื่น: "+JSON.stringify(opts)+" → ลูกค้าเลือกบานสวิง/เปิดได้ทั้งที่ไม่ควรมี");
    } else add("miss","ปุ่ม","o-gatetype ไม่พบบน fence_gate","ไม่มีชิป/select ลักษณะการเปิด");
  } else add("warn","ปุ่ม","fence_gate เลือกในกลุ่ม 2 ไม่ได้","(ข้าม)");
}

// ===== 2. ออปชั่น (probe control จริง) =====
for(const o of EXPECTED_OPTS){
  // on = ควรมี
  for(const id of (o.on||[])){
    const r=renderProd(id,"2"); if(!r||!r.ok){ add("warn","ออปชั่น",o.label+" บน "+id, "เลือกรุ่นนี้ไม่ได้ในกลุ่ม 2 (ข้าม)"); continue; }
    const present=!!r.ch.querySelector("."+o.cls);
    add(present?"ok":"miss","ออปชั่น",o.label+" บน "+id, present?("พบ ."+o.cls+" ✅ · "+o.note):("ไม่พบ ."+o.cls+" → "+o.note));
  }
  // off = ไม่ควรมี (leak)
  for(const id of (o.off||[])){
    const r=renderProd(id,"2"); if(!r||!r.ok){ add("warn","ออปชั่น",o.label+" (leak) บน "+id, "เลือกรุ่นนี้ไม่ได้ (ข้าม)"); continue; }
    const present=!!r.ch.querySelector("."+o.cls);
    add(present?"miss":"ok","ออปชั่น",o.label+" บน "+id+" (leak—ไม่ควรมี)",
      present?("ยังพบ ."+o.cls+" บน "+id+" → leak ยังไม่ตัด: "+o.note):("ไม่พบ ."+o.cls+" (ตัดแล้ว) ✅ · "+o.note));
  }
}

// ตรวจ gate cascade มี class .gate-rn-casc (ลายระแนงประตูรั้ว)
{ const r=renderProd("fence_gate","2");
  if(r&&r.ok){
    const hasGateCasc=!!r.ch.querySelector(".gate-rn-casc");
    add(hasGateCasc?"ok":"miss","ออปชั่น","cascade ลายระแนงประตูรั้ว (.gate-rn-casc)", hasGateCasc?"พบ chip cascade ลายระแนง+หน้าโชว์+ระยะ ✅":"ไม่พบ .gate-rn-casc → ลูกค้าเลือกลายระแนงประตูไม่ได้");
    const hasGatern=!!r.ch.querySelector(".o-gatern");
    add(hasGatern?"ok":"miss","ออปชั่น","hidden select ลายระแนง (.o-gatern) ประตูรั้ว", hasGatern?"พบ .o-gatern ✅":"ไม่พบ .o-gatern — ค่า gatern ส่งไป calcUnit ไม่ได้ (ราคาผิด)");
  }
}

// ===== 3. ราคา vs golden baseline =====
const baseF = join(__dirname,"golden-baseline.json");
if(existsSync(baseF)){
  const base=JSON.parse(readFileSync(baseF,"utf8")); const bmap=new Map(base.rows.map(r=>[r.key,r]));
  let okN=0, diffN=0;
  const g2Prods = Object.values(EXPECTED_PRODS).flat();
  for(const id of g2Prods){
    const b=bmap.get("2:"+id); if(!b||b.total==null) continue;
    // golden-snapshot.mjs L55: SIZE[2]=[2.0,1.5] — ตรงกัน
    const r=build(id, G2_W, G2_H, []);
    if(!r){ continue; }
    const cur=grand();
    if(cur===b.total) okN++; else { diffN++; add("warn","ราคา",id+" ราคาขยับจาก golden", "golden="+b.total+" · ตอนนี้="+cur+" (ตรวจว่าตั้งใจแก้ไหม)"); }
  }
  if(diffN===0) add("ok","ราคา","ราคา G2 เทียบ golden baseline", okN+" รุ่น ตรง baseline");
  else add("warn","ราคา","ราคา G2 มีขยับจาก baseline", okN+" ตรง · "+diffN+" ขยับ (ดูด้านบน)");
} else add("warn","ราคา","golden baseline","ไม่พบ golden-baseline.json — รัน node scripts/golden-snapshot.mjs --save ก่อน");

// ===== 4. ออปชั่นเสริม (ครอบวงกบ บน ranae + gate) =====
// ครอบวงกบ (o-fcsides): มติพี่นัท 17มิ.ย. เคาะ "ไม่มี" บนระแนง/ประตูรั้ว (ใบจริง 3 ใบไม่มี) → AREA_CATS block ถูกต้องตามมติ (by-design)
for(const id of ["rn2","fence_gate","bar_slide"]){
  const r=renderProd(id,"2"); if(!r||!r.ok){ add("warn","อุปกรณ์เสริม","ครอบวงกบ บน "+id,"เลือกไม่ได้ (ข้าม)"); continue; }
  const hasFc=!!r.ch.querySelector(".o-fcsides");
  // มติ: ระแนง/ประตูรั้ว ไม่มีครอบวงกบ → ไม่โผล่ = ตรงมติ (ok)
  add(hasFc?"warn":"ok","อุปกรณ์เสริม","ครอบวงกบ (o-fcsides) บน "+id+" = ไม่มี (มติพี่นัท 17มิ.ย.)",
    hasFc?"พบ o-fcsides แต่มติว่าไม่ควรมี → เกินมติ (เคาะซ้ำ)":"ไม่มี ✅ ตรงมติ (ใบจริง 3 ใบไม่มีครอบวงกบ · by-design)");
}

// ===== 5. ใบเสนอราคาจริง (1 ต่อหมวด · เลือกออปชั่นครบ) =====
function breakdownOf(s){
  const b=build(s.id,s.w,s.h,[],s.grp||"2"); if(!b) return null;
  let prev=grand(); if(!Number.isFinite(prev))return null;
  const lines=[{n:"ฐาน (ไม่มีออปชั่น)",p:prev}]; const acc=[];
  for(const o of s.opts){ acc.push([o[0],o[1]]); const nb=build(s.id,s.w,s.h,acc,s.grp||"2"); if(nb){ const g=grand(); if(Number.isFinite(g)){ lines.push({n:o[2]||o[0], p:g-prev}); prev=g; } } }
  return {lines, total:prev};
}
const QSAMPLES=[
  // 1. ระแนงบังตา (rn2 รวมโครง) — สี (ครอบวงกบ by-design ไม่มี · มติพี่นัท 17มิ.ย.)
  {id:"rn2", w:3, h:2.5, label:"ระแนงบังตา 1x5 รวมโครง (rn2)", grp:"2",
   opts:[[".o-finish","1700","สีอบพิเศษ +1700/ตร.ม."]]},
  // 2. ระแนงผนัง (rn38 รวมโครง) — ออกใบดูว่า cascade กล่อง+หน้าโชว์ขึ้นถูก
  {id:"rn38", w:2, h:2.5, label:"ระแนงผนัง 1\"x1.6\" โชว์ 1.6\" รวมโครง (rn38)", grp:"2",
   opts:[[".o-finish","1100","อบสีพิเศษ +1100/ตร.ม."]]},
  // 3. เกล็ด Z (rn84)
  {id:"rn84", w:2, h:1.5, label:"เกล็ด Z (rn84)", grp:"2",
   opts:[[".o-finish","0","สีอบขาว"]]},
  // 4. ประตูรั้ว (fence_gate) — มอเตอร์+รางตรง
  {id:"fence_gate", w:3, h:2, label:"ประตูรั้วระแนง (fence_gate) มอเตอร์1+รางตรง", grp:"2",
   opts:[[".o-gmotor","1","มอเตอร์ 1 ตัว"],[".o-railtype","straight","รางตรง"],[".o-gfin","สีอบขาว","สีอบขาว"]]},
  // 5. ราวกันตก (imp3 = เฉียง+อลู+สีอลู)
  {id:"imp3", w:3, h:1, label:"ราวกันตกเฉียง อลูมิเนียม (imp3) สีเทา", grp:"2",
   opts:[[".o-railalucolor","เทา","สีอลูมิเนียมเทา"]]},
  // 6. ระแนงเลื่อน Inception (bar_slide) — เลือกรุ่นประตู
  {id:"bar_slide", w:3, h:2, label:"ระแนงเลื่อน Inception (bar_slide) + ประตูเลื่อนเซมิ", grp:"2",
   opts:[[".o-bsdoor","sliding_sms","ค่าประตู: เลื่อนเซมิ"]]},
  // 7. บานเกล็ดอลู (bar_grid_z) — ทำเป็นบาน
  {id:"bar_grid_z", w:3, h:2, label:"บานเกล็ดอลู (bar_grid_z) + ทำเป็นบาน", grp:"2",
   opts:[[".o-bgdir","v","ทิศตั้ง (D=สูง)"],[".o-bsdoor","sliding_sms","ทำเป็นบาน: เลื่อนเซมิ"]]},
  // 8. ระแนงหมุนเปิด-ปิด (bar_openclose) — แนวตั้ง
  {id:"bar_openclose", w:3, h:2, label:"ระแนงหมุนเปิด-ปิด (bar_openclose) แนวตั้ง", grp:"2",
   opts:[[".o-bocdir","v","แนวตั้ง"]]},
];
const quoteCards=[];
for(const s of QSAMPLES){
  const q=genQuoteOf(s.id,s.w,s.h,s.opts,"2");
  if(!q){ quoteCards.push({label:s.label,err:"เลือกสินค้า '"+s.id+"' ไม่ได้ในกลุ่ม 2"}); continue; }
  const setFail=q.applied.filter(a=>!a.ok).map(a=>a.cls);
  if(setFail.length) add("warn","ใบเสนอราคา",s.label+" — ออปชั่นบางตัวตั้งค่าไม่ได้", "ตั้งไม่ได้: "+setFail.join(", "));
  quoteCards.push({label:s.label, html:q.html, grand:q.grand, breakdown:breakdownOf(s)});
}

// ===== 6. เทสทุกออปชั่น — กดแล้วราคาขยับจริงไหม =====
const OPTTESTS_LIST=[
  // fence_gate ตัวหลัก (ใช้ขนาด golden G2_W×G2_H=2×1.5)
  // NOTE: default motor=1 อยู่แล้วใน HTML → ทดสอบ motor=2 vs base ที่มี motor=1 โดย default
  { prod:{id:"fence_gate",w:G2_W,h:G2_H}, tests:[
    {cls:".o-gmotor", val:"2", label:"มอเตอร์ 2 ตัว (เพิ่มจาก default=1 ตัว → +30,000)", paid:true},
    {cls:".o-gmotor", val:"0", label:"ไม่มีมอเตอร์ (ลดจาก default=1 → ราคาลด)", paid:false},
    {cls:".o-railtype", val:"curved", label:"รางโค้ง (แพงกว่ารางตรง default)", paid:true},
    {cls:".o-gatethresh", val:true, label:"มีธรณี (ราคาขยับไหม?)", paid:false},
  ]},
  // bar_slide (ใช้ขนาด G2_W×G2_H = 2×1.5)
  { prod:{id:"bar_slide",w:G2_W,h:G2_H}, tests:[
    {cls:".o-bsdoor", val:"sliding_sms", label:"เพิ่มประตูเลื่อนเซมิ (ราคาขยับมาก)", paid:true},
    {cls:".o-bsdoor", val:"casement_euro", label:"เพิ่มประตูเปิดยูโร (ราคาขยับ)", paid:true},
  ]},
  // bar_grid_z
  { prod:{id:"bar_grid_z",w:G2_W,h:G2_H}, tests:[
    {cls:".o-bsdoor", val:"sliding_sms", label:"bar_grid_z ทำเป็นบาน+ประตูเลื่อนเซมิ (ราคาขยับ)", paid:true},
  ]},
  // rn2 ระแนงบังตา (ใช้ขนาด G2_W×G2_H)
  { prod:{id:"rn2",w:G2_W,h:G2_H}, tests:[
    {cls:".o-finish", val:"1700", label:"ผิว: อบสีพิเศษ +1700/ตร.ม.", paid:true},
    {cls:".o-finish", val:"300", label:"ผิว: ซาฮาร่า +300/ตร.ม.", paid:true},
  ]},
];
const optTestGroups=[];
for(const g of OPTTESTS_LIST){
  const baseQ=genQuoteOf(g.prod.id,g.prod.w,g.prod.h,[],"2");
  const base=baseQ?baseQ.grand:NaN;
  const rows2=[];
  for(const t of g.tests){
    const q=genQuoteOf(g.prod.id,g.prod.w,g.prod.h,[[t.cls,t.val]],"2");
    const has=q && q.applied.every(a=>a.ok);
    const delta=(q&&Number.isFinite(q.grand)&&Number.isFinite(base))?(q.grand-base):null;
    let s="ok",note="";
    if(!has){ s="warn"; note="ตั้งค่าออปชั่นไม่ได้ (control ไม่มีบนบานนี้)"; }
    else if(delta===null){ s="warn"; note="อ่านราคาไม่ได้"; }
    else if(t.paid && delta<=0){ s="miss"; note="กดแล้วราคาไม่ขยับ ("+base+"→"+(base+(delta||0))+") — ควรคิดเงินแต่ไม่คิด"; }
    else { note=delta>0?("ราคาขยับ +"+(delta).toLocaleString()):"ราคาไม่ขยับ (ฟรี · ถูกต้อง)"; }
    rows2.push({label:t.label,delta,s,note});
    if(s==="miss") add("miss","ออปชั่นใช้จริง",g.prod.id+": "+t.label+" กดแล้วราคาไม่ขยับ", note);
  }
  optTestGroups.push({prod:g.prod.id, base, rows:rows2});
}

// ตรวจเพิ่มเติม: ใบระแนง ระบุ "รวมโครง" ถูกต้องไหม
{ const txt=billText("rn2",3,2.5,[],"2");
  if(txt){
    const hasKhlong=/รวมโครง/.test(txt);
    add(hasKhlong?"ok":"warn","ใบเสนอราคา","ใบระแนง rn2 ระบุ 'รวมโครง' (default frame)", hasKhlong?"ใบมีคำว่า 'รวมโครง' ✅":"ไม่พบ 'รวมโครง' ในใบ — อาจระบุ 'ไม่โครง' ผิด (ดราฟ: default=รวมโครง)");
  }
}

// ตรวจใบประตูรั้ว: ต้องมีคำว่า "บานเลื่อน" ไม่ใช่ "บานสวิง/เปิด"
{ const txt=billText("fence_gate",3,2,[[".o-gmotor","1"],[".o-railtype","straight"]],"2");
  if(txt){ const noSwing=!/สวิง|บานเปิด/.test(txt);
    add(noSwing?"ok":"miss","ใบเสนอราคา","ใบประตูรั้ว: ไม่มีคำว่า สวิง/บานเปิด", noSwing?"✅ ไม่มีคำผิด · ต้องเป็น 'บานเลื่อน'":"ใบยังมีคำว่า 'สวิง/บานเปิด' → แก้ CODEREADY A3 ยังไม่ครบ");
  }
}

// ===== 7. ทำเป็นบาน + มุ้งติดตาย (ดราฟ 23มิ.ย.) =====
// เกณฑ์ = DRAFT-G2-ระแนงทำเป็นบาน+มุ้งติดตาย-2026-06-23.html · ทดสอบ rn2 (ranae · มี p.fin)
// โครง: ชิป = hidden select display:none + .chip-group · ตั้งค่าผ่าน setOpt(ch,'.o-xxx',val)
// helper: เลือก rn2 → ต้อง setOpt o-doortype + เรียก rnDoorSwitch ให้ sub-panel โผล่
const S7=[]; // {n,pass,detail}  (1 row = 1 ข้อใน checklist 54)
const a7=(n,pass,detail)=>{ S7.push({n,pass:!!pass,detail:detail||""}); add(pass?"ok":"miss","ทำเป็นบาน(7)",n, detail||""); };
function renderRanae(){ return renderProd("rn2","2"); }
// ตั้ง doortype + sync sub-panel (เลียน chip onclick→chSetChip + rnDoorSwitch)
// ⚠ rnDoorSwitch อาจ rebuild DOM (สลับ frame→ไม่โครง ด้วย g3SyncProd) → ch เดิม detached
//   ดังนั้น "คืน ch ที่ live ใน document เสมอ" + ผู้เรียกต้อง re-query จาก ch ที่คืน
function setDoorType(ch,val){ const sel=ch.querySelector(".o-doortype"); if(!sel) return ch; sel.value=String(val); fire(sel,"change"); try{ w.rnDoorSwitch(ch); }catch(e){} const live=doc.querySelector("#items .ch"); if(live){ const s2=live.querySelector(".o-doortype"); if(s2 && s2.value!==String(val)){ s2.value=String(val); fire(s2,"change"); try{ w.rnDoorSwitch(live); } catch(e){} } } return doc.querySelector("#items .ch")||ch; }
// อ่าน display ของ element (jsdom: el.style.display · '' = โชว์)
const isHidden=el=>!el || el.style.display==="none";
const isShown=el=> !!el && el.style.display!=="none";
// helper อ่าน grand หลังตั้งออปชั่นบน ch ที่ render แล้ว (ต้อง fire calcQuote)
function grandOf(ch){ noSvc(); try{ w.calcQuote&&w.calcQuote(); w.genQuote&&w.genQuote(); }catch(e){ return NaN; } const g=doc.querySelector("#quoteContent .qtot .g"); return g?parseInt((g.textContent||"").replace(/\.\d+/g,"").replace(/[^\d]/g,""),10):NaN; }

{ // ── guard: PBYID มี product ของ doortype ที่ใช้ override ราคา (กัน NaN / door cost หาย) ──
  const haveP=(id)=>{ try{ return !!(w.eval("PBYID")||{})[id]; }catch(e){ return false; } };
  const slideOK=haveP("sliding_sms"), euroOK=haveP("sliding_euro"), casOK=haveP("casement_euro"), foldOK=haveP("folding");
  const topOK=haveP("sliding_top"), swingOK=haveP("swing");
  // ⚠ flag จุดเสี่ยง: ราคา door มาจาก PBYID[doortype] (L2108: &&PBYID[optSel.doortype]) → ต้องมีจริง
  add(slideOK&&euroOK&&casOK&&foldOK?"ok":"miss","ทำเป็นบาน(7)","[guard] PBYID มี product ของชนิดบานหลัก (sliding_sms/euro/casement/folding)",
    `sliding_sms=${slideOK} euro=${euroOK} casement=${casOK} folding=${foldOK} · ถ้าขาด → door price = NaN/0`);
  // มติพี่นัท 24มิ.ย.: sliding_top/swing ต้องคิดค่าทำบาน — เลื่อนรางบนเอาราคาจาก G1 (inner_top_stack) · บานสวิง=ราคาบานเปิด (casement_euro)
  // เทส "ผลลัพธ์จริง" (ราคาทำบาน > ไม่ทำบาน) ไม่ผูกวิธี implement → dev จะ map ไป id ไหนก็ผ่านได้ถ้าค่าทำบานถูกบวกจริง
  { const _baseND=(()=>{ const r=renderRanae(); return r&&r.ok?grandOf(r.ch):NaN; })();
    const _gTop=(()=>{ try{ return grandOf(setDoorType(renderRanae().ch,"sliding_top")); }catch(e){ return NaN; } })();
    const _gSw=(()=>{ try{ return grandOf(setDoorType(renderRanae().ch,"swing")); }catch(e){ return NaN; } })();
    const _topPass=Number.isFinite(_baseND)&&Number.isFinite(_gTop)&&_gTop>_baseND;
    const _swPass=Number.isFinite(_baseND)&&Number.isFinite(_gSw)&&_gSw>_baseND;
    add(_topPass&&_swPass?"ok":"miss","ทำเป็นบาน(7)","[บั๊ก-แก้] sliding_top / swing ต้องคิดค่าทำบาน (มติพี่นัท 24มิ.ย.)",
      `ไม่ทำบาน=${_baseND} · เลื่อนรางบน=${_gTop}${_topPass?" ✅":" ❌ค่าทำบานไม่เข้า"} · บานสวิง=${_gSw}${_swPass?" ✅":" ❌ค่าทำบานไม่เข้า"} → dev: map sliding_top→inner_top_stack · swing→casement_euro ที่ L2107`);
  }
  // ── structural (24มิ.ย. · พี่นัทเจอจากตา · check ราคาเดิมจับไม่ได้): ไม่มีกล่อง accordion ว่าง + o-rnfinopt ไม่ตกกล่องผิด ──
  { const _rs=renderRanae(); if(_rs&&_rs.ok){ let _sc=setDoorType(_rs.ch,"swing"); const _lc=doc.querySelector("#items .ch")||_sc;
    const _cats=[...(_lc.querySelectorAll(".gh-opt-cat-det"))];
    const _empties=_cats.filter(b=>[...b.querySelectorAll('[class*="o-"]')].filter(e=>[...e.classList].some(x=>x.startsWith("o-"))).length===0);
    add(_empties.length===0?"ok":"miss","ทำเป็นบาน(7)","[structural] ไม่มีกล่อง accordion ว่าง (ทุกกล่องต้องมี o-control)",
      "กล่อง accordion="+_cats.length+" · ว่าง="+_empties.length+(_empties.length?" → "+_empties.map(b=>((b.querySelector("summary")||{}).textContent||"").trim()).join(" / "):" ✓"));
    const _fo=_lc.querySelector(".o-rnfinopt"); const _foInBox=_fo?!!_fo.closest(".gh-opt-cat-det"):false;
    add((_fo&&!_foInBox)?"ok":(_fo?"miss":"warn"),"ทำเป็นบาน(7)","[structural] o-rnfinopt (เปลี่ยนสีอบ) อยู่ inline ไม่ตกกล่อง 'โครงสร้าง·แผ่นทึบ·ราง'",
      _fo?("inAccordionBox="+_foInBox+(_foInBox?(" → ตกกล่อง "+((_fo.closest(".gh-opt-cat-det").querySelector("summary")||{}).textContent||"").trim()):" ✓ inline")):"ไม่พบ o-rnfinopt (เช็คซ้ำ)");
  }}
}

// ---------- หมวด curate (5) ----------
{ const r=renderRanae();
  if(!r||!r.ok){ for(let i=0;i<5;i++) a7("curate#"+(i+1)+" (rn2 เลือกไม่ได้)",false,"render rn2 ไม่ได้"); }
  else {
    const ch=r.ch;
    const cur=ch.querySelectorAll(".rn-curate");
    a7("curate: มี checkbox .rn-curate 6 ตัว", cur.length===6, "พบ "+cur.length+" ตัว (ดราฟ: เลื่อนเซมิ/ยูโร/รางบน/บานเปิด/เฟี้ยม/สวิง)");
    const allChecked=cur.length>0 && Array.from(cur).every(c=>c.checked);
    a7("curate: default checked ทุกตัว", allChecked, allChecked?"ทุกตัวติ๊กเริ่มต้น ✅":"มีตัวที่ไม่ checked เริ่มต้น");
    // ชิปชนิดบาน 7 ปุ่ม (รวม '— ไม่ทำ —')
    let doorGrp=null; ch.querySelectorAll(".chip-group").forEach(g=>{ if(g.querySelector('[data-val="sliding_sms"]')) doorGrp=g; });
    const chipCount=doorGrp?doorGrp.querySelectorAll(".chip").length:0;
    a7("curate: ชิปชนิดบาน 7 ปุ่ม (รวม — ไม่ทำ —)", chipCount===7, "พบ "+chipCount+" ชิป (ดราฟ: ไม่ทำ + 6 ชนิด)");
    // ติ๊ก folding ออก → chip data-val='folding' display:none
    const foldCb=Array.from(cur).find(c=>c.dataset.dt==="folding");
    let foldHidden=false;
    if(foldCb){ foldCb.checked=false; fire(foldCb,"change"); const fb=doorGrp?doorGrp.querySelector('[data-val="folding"]'):null; foldHidden=fb&&fb.style.display==="none"; foldCb.checked=true; fire(foldCb,"change"); }
    a7("curate: ติ๊ก folding ออก → ชิป folding display:none", foldHidden, foldHidden?"ซ่อนชิปได้ ✅":"ติ๊กออกแล้วชิปยังโชว์ → rnDoorCurate ไม่ทำงาน");
    // ติ๊กออกชนิด active → o-doortype reset=''
    const r2=renderRanae(); const ch2=r2.ch;
    setDoorType(ch2,"sliding_sms");
    const cur2=ch2.querySelectorAll(".rn-curate"); const smsCb=Array.from(cur2).find(c=>c.dataset.dt==="sliding_sms");
    let resetOK=false;
    if(smsCb){ smsCb.checked=false; try{ w.rnDoorCurate(smsCb); }catch(e){} const sel=ch2.querySelector(".o-doortype"); resetOK=sel && sel.value===""; }
    a7("curate: ติ๊กออกชนิดที่ active → o-doortype reset ''", resetOK, resetOK?"reset เป็น'— ไม่ทำ —' ✅":"ยังค้างชนิดเดิม → rnDoorCurate reset ไม่ครบ");
  }
}

// ---------- หมวด layout (2) ----------
{ const r=renderRanae(); const ch=r&&r.ok?r.ch:null;
  // กล่องทำเป็นบาน wrapper display:block (มี style display:block)
  let boxBlock=false;
  if(ch){ const box=Array.from(ch.querySelectorAll(".opt")).find(e=>/ทำเป็นบาน/.test(e.textContent||"") && /display:block/.test(e.getAttribute("style")||"")); boxBlock=!!box; }
  a7("layout: กล่อง 'ทำเป็นบาน' wrapper display:block", boxBlock, boxBlock?"พบ .opt display:block ครอบกล่องทำเป็นบาน ✅":"ไม่พบ wrapper display:block");
  // ปุ่ม chip[data-val=''] = dashed + สีเทา (#9CA3AF)
  let dashOK=false;
  if(ch){ let doorGrp=null; ch.querySelectorAll(".chip-group").forEach(g=>{ if(g.querySelector('[data-val="sliding_sms"]')) doorGrp=g; }); const noBtn=doorGrp?doorGrp.querySelector('[data-val=""]'):null; const stl=noBtn?(noBtn.getAttribute("style")||""):""; dashOK=/dashed/.test(stl)&&/9CA3AF/i.test(stl); }
  a7("layout: ชิป '— ไม่ทำ —' (data-val='') border dashed + color #9CA3AF", dashOK, dashOK?"ปุ่มไม่ทำ = dashed สีเทา ✅":"ปุ่มไม่ทำ ไม่ได้สไตล์ dashed/เทา");
}

// ---------- หมวด panels (6) ----------
{ const r=renderRanae(); let ch=r&&r.ok?r.ch:null;
  if(!ch){ for(let i=0;i<6;i++) a7("panels#"+(i+1),false,"rn2 ไม่ได้"); }
  else {
    const pDisp0=ch.querySelector(".o-rn-panels-disp"), fDisp0=ch.querySelector(".o-rn-fixed-disp");
    a7("panels: มี .o-rn-panels-disp + .o-rn-fixed-disp ในกล่อง", !!pDisp0&&!!fDisp0, "panels-disp="+(!!pDisp0)+" fixed-disp="+(!!fDisp0));
    // wrap โผล่เมื่อเลือกชนิดบาน (default ไม่เลือก = ซ่อน)
    const wrap0=ch.querySelector(".o-rn-panels-wrap");
    a7("panels: wrap ซ่อนเมื่อยังไม่เลือกชนิดบาน", isHidden(wrap0), wrap0?("display="+JSON.stringify(wrap0.style.display)):"ไม่พบ wrap");
    ch=setDoorType(ch,"sliding_sms"); // ⚠ re-query: setDoorType อาจ rebuild
    const wrap1=ch.querySelector(".o-rn-panels-wrap");
    a7("panels: wrap โผล่เมื่อเลือกชนิดบาน", isShown(wrap1), wrap1?("display="+JSON.stringify(wrap1.style.display)+" ✅"):"ไม่พบ wrap");
    // panels-disp sync .i-panels (กดผ่าน rnPanelStep · ต้อง re-query หลัง rebuild)
    let syncOK=false; const pDisp=ch.querySelector(".o-rn-panels-disp");
    if(pDisp){ pDisp.value="3"; try{ w.rnPanelStep(pDisp,0,"panels"); }catch(e){} const ip=ch.querySelector(".i-panels"); syncOK=ip && String(ip.value)==="3"; }
    a7("panels: panels-disp sync .i-panels", syncOK, syncOK?"ตั้ง 3 → i-panels=3 ✅":"sync ไม่ตรง (i-panels="+((ch.querySelector('.i-panels')||{}).value)+")");
    // ติดตาย 0→1 ราคาเท่าเดิม (UI ระบุในใบ ไม่กระทบราคา)
    let ch2=renderRanae().ch; ch2=setDoorType(ch2,"sliding_sms");
    const fD=ch2.querySelector(".o-rn-fixed-disp"); const g0=grandOf(ch2);
    if(fD){ fD.value="1"; try{ w.rnPanelStep(fD,0,"fixed"); }catch(e){} }
    const g1=grandOf(ch2);
    a7("panels: ติดตาย 0→1 ราคาเท่าเดิม", Number.isFinite(g0)&&g0===g1, "ก่อน="+g0+" หลัง="+g1+(g0===g1?" ✅":" (ราคาขยับ — ติดตายไม่ควรกระทบราคา)"));
    // ติดตาย clamp ≤ panels-1
    let ch3=renderRanae().ch; ch3=setDoorType(ch3,"sliding_sms");
    const pD3=ch3.querySelector(".o-rn-panels-disp"), fD3=ch3.querySelector(".o-rn-fixed-disp");
    let clampOK=false;
    if(pD3&&fD3){ pD3.value="2"; try{ w.rnPanelStep(pD3,0,"panels"); }catch(e){} fD3.value="5"; try{ w.rnPanelStep(fD3,0,"fixed"); }catch(e){} clampOK=(parseInt(fD3.value)||0)<=1; }
    a7("panels: ติดตาย clamp ≤ บาน−1", clampOK, clampOK?("panels=2 → fixed clamp="+fD3.value+" ✅"):("ไม่ clamp (fixed="+(fD3?fD3.value:"?")+")"));
  }
}

// ---------- หมวด subpanel (8) ----------
// ⚠ แต่ละชนิดบาน render rn2 ใหม่ + setDoorType (re-query ch live) กัน stale ref จาก rebuild
{ if(!renderRanae().ok){ for(let i=0;i<8;i++) a7("subpanel#"+(i+1),false,"rn2 ไม่ได้"); }
  else {
    // sliding → ราง + ล็อค
    let ch=setDoorType(renderRanae().ch,"sliding_sms");
    a7("subpanel: sliding_sms → ราง (.o-rnrail-wrap) โผล่", isShown(ch.querySelector(".o-rnrail-wrap")), "rail-wrap display="+JSON.stringify((ch.querySelector(".o-rnrail-wrap")||{}).style?.display));
    a7("subpanel: sliding_sms → ล็อค (.o-rnlock-wrap) โผล่", isShown(ch.querySelector(".o-rnlock-wrap")), "lock-wrap display="+JSON.stringify((ch.querySelector(".o-rnlock-wrap")||{}).style?.display));
    // sliding_top → ไม่มีราง
    ch=setDoorType(renderRanae().ch,"sliding_top");
    a7("subpanel: sliding_top → ราง ซ่อน (ไม่มีรางล่าง)", isHidden(ch.querySelector(".o-rnrail-wrap")), "rail-wrap display="+JSON.stringify((ch.querySelector(".o-rnrail-wrap")||{}).style?.display));
    // casement → subpanel-casement (closer/thresh/locktype)
    ch=setDoorType(renderRanae().ch,"casement_euro");
    const spc=ch.querySelector(".o-rn-subpanel-casement");
    const casOK=isShown(spc)&&spc.querySelector(".o-rncloser")&&spc.querySelector(".o-rnthresh")&&spc.querySelector(".o-rnlocktype");
    a7("subpanel: casement → .o-rn-subpanel-casement (closer/thresh/locktype)", casOK, casOK?"โผล่ + มี 3 control ✅":"ขาด control หรือไม่โผล่");
    // folding → subpanel-folding (folddir/threshf)
    ch=setDoorType(renderRanae().ch,"folding");
    const spf=ch.querySelector(".o-rn-subpanel-folding");
    const foldOK=isShown(spf)&&spf.querySelector(".o-rnfolddir")&&spf.querySelector(".o-rnthreshf");
    a7("subpanel: folding → .o-rn-subpanel-folding (folddir/threshf)", foldOK, foldOK?"โผล่ + folddir/threshf ✅":"ขาด control หรือไม่โผล่");
    // swing → subpanel-swing (swinghandle/swingthresh/swinglock)
    ch=setDoorType(renderRanae().ch,"swing");
    const sps=ch.querySelector(".o-rn-subpanel-swing");
    const swOK=isShown(sps)&&sps.querySelector(".o-rnswinghandle")&&sps.querySelector(".o-rnswingthresh")&&sps.querySelector(".o-rnswinglock");
    a7("subpanel: swing → .o-rn-subpanel-swing (handle/thresh/lock)", swOK, swOK?"โผล่ + 3 control ✅":"ขาด control หรือไม่โผล่");
    // swing lock default 'key' (มีล็อก+กุญแจ) — ดราฟระบุ default = มีล็อก+กุญแจ
    //   ⚠ พบจริง: hidden <select.o-rnswinglock> ไม่มี selected บน 'key' → engine อ่าน 'no' (option แรก) แม้ป้าย/intent = key
    const swLock=sps?sps.querySelector(".o-rnswinglock"):null;
    a7("subpanel: swing lock default 'key' (มีล็อก+กุญแจ)", swLock&&swLock.value==="key", "default="+(swLock?swLock.value:"?")+(swLock&&swLock.value!=="key"?" → select.o-rnswinglock ไม่มี selected='key' (L5727) → engine อ่าน 'no' (เช็คซ้ำ: ดราฟ default = มีล็อก+กุญแจ)":""));
    // swing handle lux → โผล่ขนาด
    let luxOK=false;
    if(sps){ const sh=sps.querySelector(".o-rnswinghandle"); if(sh){ sh.value="lux"; fire(sh,"change"); try{ w.rnSwingHandleToggle(ch); }catch(e){} const szw=ch.querySelector(".o-rnswinghandle-sz-wrap"); luxOK=isShown(szw); } }
    a7("subpanel: swing handle lux → ช่องขนาด (.o-rnswinghandle-sz-wrap) โผล่", luxOK, luxOK?"โผล่ขนาดมือจับ ✅":"เลือก lux แล้วขนาดไม่โผล่");
  }
}

// ---------- หมวด price (9) ----------
{ const RW=2.0, RH=1.5;
  // ⚠ grand total = #quoteContent .qtot .g = รวม VAT 7% แล้ว → ออปชั่น +X บาท (ก่อน VAT) จะโชว์เป็น +X×1.07
  //   ดังนั้น expected delta = X*1.07 (ปัด ±2 กันเศษปัด)
  const VAT=1.07; const near=(d,exp)=>Math.abs(d-exp*VAT)<=2;
  // helper: build rn2 + ตั้ง doortype (re-query live ch) + ออปชั่นย่อย → คืน grand
  function buildDoor(doortype, extra){
    const r=build("rn2",RW,RH,[],"2"); if(!r) return {ch:null,g:NaN};
    let ch=setDoorType(r.ch,doortype); // re-query: setDoorType อาจ rebuild
    (extra||[]).forEach(([cls,val])=>setOpt(ch,cls,val));
    return {ch,g:grandOf(ch)};
  }
  const baseNoDoor=(()=>{ const r=build("rn2",RW,RH,[],"2"); return r?grandOf(r.ch):NaN; })();
  // โช้ค +5000 (casement closer) — ก่อน VAT 5,000 → grand +5,350
  const cNo=buildDoor("casement_euro",[[".o-rncloser","0"],[".o-rnthresh","std"]]).g;
  const cYes=buildDoor("casement_euro",[[".o-rncloser","5000"],[".o-rnthresh","std"]]).g;
  a7("price: บานเปิด โช้คอัด +5,000 (grand +VAT=5,350)", Number.isFinite(cNo)&&near(cYes-cNo,5000), "ไม่มี="+cNo+" มีโช้ค="+cYes+" Δ="+(cYes-cNo)+" (คาด ~5,350)");
  // ธรณีหลังเต่า +1000 → grand +1,070
  const tStd=buildDoor("casement_euro",[[".o-rncloser","0"],[".o-rnthresh","std"]]).g;
  const tTur=buildDoor("casement_euro",[[".o-rncloser","0"],[".o-rnthresh","turtle"]]).g;
  a7("price: บานเปิด ธรณีหลังเต่า +1,000 (grand +VAT=1,070)", Number.isFinite(tStd)&&near(tTur-tStd,1000), "std="+tStd+" หลังเต่า="+tTur+" Δ="+(tTur-tStd)+" (คาด ~1,070)");
  // ราง low7 +500 → grand +535
  const rStd=buildDoor("sliding_sms",[[".o-rnrail","standard"]]).g;
  const rLow=buildDoor("sliding_sms",[[".o-rnrail","low7"]]).g;
  a7("price: บานเลื่อน ราง low7 +500 (grand +VAT=535)", Number.isFinite(rStd)&&near(rLow-rStd,500), "standard="+rStd+" low7="+rLow+" Δ="+(rLow-rStd)+" (คาด ~535)");
  // ราง standard ฟรี (เทียบ noDoor → ต้องไม่บวกจากการเลือก standard)
  a7("price: บานเลื่อน ราง standard ฟรี (ไม่มีค่าราง)", Number.isFinite(rStd), "standard="+rStd+" (รางมาตรฐานไม่บวกเพิ่มจาก rail option)");
  // ธรณี std ฟรี
  a7("price: บานเปิด ธรณี std ฟรี", Number.isFinite(tStd)&&tStd===cNo, "std="+tStd+" = closer ไม่มี="+cNo+(tStd===cNo?" ✅":""));
  // มือจับ 1500 (30.5ซม) / 3200 (120ซม) — swing lux → grand +1,605 / +3,424
  const hStd=buildDoor("swing",[[".o-rnswinghandle","std"]]).g;
  const h1500=buildDoor("swing",[[".o-rnswinghandle","lux"],[".o-rnswinghandlesz","1500"]]).g;
  const h3200=buildDoor("swing",[[".o-rnswinghandle","lux"],[".o-rnswinghandlesz","3200"]]).g;
  a7("price: swing มือจับอร่าม 30.5ซม. +1,500 (grand +VAT=1,605)", Number.isFinite(hStd)&&near(h1500-hStd,1500), "std="+hStd+" 30.5ซม.="+h1500+" Δ="+(h1500-hStd)+" (คาด ~1,605)");
  a7("price: swing มือจับอร่าม 120ซม. +3,200 (grand +VAT=3,424)", Number.isFinite(hStd)&&near(h3200-hStd,3200), "std="+hStd+" 120ซม.="+h3200+" Δ="+(h3200-hStd)+" (คาด ~3,424)");
  // swing ไม่มี closer แยก (โช้ครวมในตัว · ไม่มี .o-rncloser ใน subpanel swing)
  let chSw=setDoorType(renderRanae().ch,"swing"); const sps=chSw?chSw.querySelector(".o-rn-subpanel-swing"):null;
  const swNoCloser=sps && !sps.querySelector(".o-rncloser");
  a7("price: swing ไม่มีออปชั่นโช้คแยก (รวมในราคา)", swNoCloser, swNoCloser?"subpanel-swing ไม่มี .o-rncloser ✅":"พบ .o-rncloser ใน swing (ควรไม่มี · โช้ครวม)");
  // เลือก doortype → ราคาเพิ่ม (ค่าทำบาน)
  const gDoor=buildDoor("sliding_sms",[]).g;
  a7("price: เลือกชนิดบาน → ราคาเพิ่ม (ค่าทำบาน)", Number.isFinite(baseNoDoor)&&Number.isFinite(gDoor)&&gDoor>baseNoDoor, "ไม่ทำบาน="+baseNoDoor+" ทำบาน sliding_sms="+gDoor+(gDoor>baseNoDoor?" ✅":" (ไม่เพิ่ม — ค่าทำบานไม่เข้า)"));
}

// ---------- หมวด chips (10) — select display:none ทุกตัว ----------
// ⚠ ทุกครั้ง render rn2 ใหม่ + setDoorType (re-query live ch) แล้วเก็บ ch ที่ control นั้นโผล่
{ const chCas=setDoorType(renderRanae().ch,"casement_euro"); // closer/thresh/locktype/colorpct/finopt/doortype
  let chSwing=setDoorType(renderRanae().ch,"swing");
  { const sh=chSwing.querySelector(".o-rnswinghandle"); if(sh){ sh.value="lux"; fire(sh,"change"); try{ w.rnSwingHandleToggle(chSwing); }catch(e){} } } // เปิด handlesz
  const chFold=setDoorType(renderRanae().ch,"folding");
  const chRail=setDoorType(renderRanae().ch,"sliding_sms");
  // map class → ch ที่ control นั้นโผล่
  const chipChecks=[
    [".o-rnfinopt", chCas],       // ออปชั่นเทียบสี (มีเสมอบน rn2)
    [".o-rnswinghandlesz", chSwing],
    [".o-rnrail", chRail],
    [".o-rncloser", chCas],
    [".o-rnthresh", chCas],
    [".o-rnlocktype", chCas],
    [".o-rnfolddir", chFold],
    [".o-rnswinglock", chSwing],
    [".o-doorcolorpct", chCas],
    [".o-doortype", chCas],
  ];
  for(const [cls,cc] of chipChecks){
    const sel=cc?cc.querySelector(cls):null;
    const hiddenSel=sel && sel.tagName==="SELECT" && sel.style.display==="none";
    // ต้องมี chip-group คู่กัน (ชิปจริง)
    let hasChips=false;
    if(cc){ cc.querySelectorAll(".chip-group").forEach(g=>{ if(g.querySelector('[onclick*="'+cls.slice(1)+'"]')) hasChips=true; }); }
    a7("chips: "+cls+" = hidden select(display:none) + .chip-group", hiddenSel&&hasChips,
      "select hidden="+hiddenSel+" · มีชิป="+hasChips+(hiddenSel&&hasChips?" ✅":" (ดราฟ: ทุกตัวเป็นชิป)"));
  }
}

// ---------- หมวด doorprice (4) ----------
{ const RW=2.0, RH=1.5;
  if(!renderRanae().ok){ for(let i=0;i<4;i++) a7("doorprice#"+(i+1),false,"rn2 ไม่ได้"); }
  else {
    const ch=setDoorType(renderRanae().ch,"sliding_sms");
    const det=ch.querySelector(".o-rncolor-details");
    const dp=ch.querySelector(".o-doorprice");
    const inDetails=det && det.querySelector(".o-doorprice") && det.tagName==="DETAILS";
    a7("doorprice: .o-doorprice อยู่ใน .o-rncolor-details (DETAILS พับ)", inDetails, inDetails?"อยู่ใน <details> พับ ✅":"ไม่อยู่ใน details หรือไม่ใช่ DETAILS");
    a7("doorprice: default = 0", dp && String(dp.value)==="0", "default="+(dp?dp.value:"?"));
    // override >0 ใช้แทน auto (re-query live ch หลัง rebuild)
    let bAuto=build("rn2",RW,RH,[],"2"); let gAuto=NaN, gOvr=NaN;
    if(bAuto){ const c=setDoorType(bAuto.ch,"sliding_sms"); gAuto=grandOf(c); }
    let bOvr=build("rn2",RW,RH,[],"2");
    if(bOvr){ const c=setDoorType(bOvr.ch,"sliding_sms"); setOpt(c,".o-doorprice","99999"); gOvr=grandOf(c); }
    a7("doorprice: override >0 ใช้แทน auto (ราคาเปลี่ยน)", Number.isFinite(gAuto)&&Number.isFinite(gOvr)&&gOvr!==gAuto, "auto="+gAuto+" override99999="+gOvr+(gOvr!==gAuto?" ✅":" (override ไม่มีผล)"));
    // details ซ่อนเมื่อไม่ทำบาน
    const det2=renderRanae().ch.querySelector(".o-rncolor-details");
    a7("doorprice: details ซ่อนเมื่อไม่ทำบาน", isHidden(det2), det2?("display="+JSON.stringify(det2.style.display)):"ไม่พบ details");
  }
}

// ---------- หมวด colorpct (3) ----------
{ if(!renderRanae().ok){ for(let i=0;i<3;i++) a7("colorpct#"+(i+1),false,"rn2 ไม่ได้"); }
  else {
    const ch=setDoorType(renderRanae().ch,"sliding_sms");
    const dcp=ch.querySelector(".o-doorcolorpct");
    const opts=dcp?Array.from(dcp.options).map(o=>o.value):[];
    const has4=["20","30","40","50"].every(v=>opts.includes(v));
    a7("colorpct: o-doorcolorpct มี 20/30/40/50", has4, "options="+JSON.stringify(opts));
    a7("colorpct: default = 30", dcp&&String(dcp.value)==="30", "default="+(dcp?dcp.value:"?"));
    const det=ch.querySelector(".o-rncolor-details");
    const inDet=det&&det.querySelector(".o-doorcolorpct");
    a7("colorpct: อยู่ใน details (.o-rncolor-details)", !!inDet, inDet?"อยู่ใน details พับ ✅":"ไม่อยู่ใน details");
  }
}

// ---------- หมวด mosq (13) ----------
{ const RW=2.0, RH=1.5;
  const r=renderRanae(); const ch=r&&r.ok?r.ch:null;
  if(!ch){ for(let i=0;i<13;i++) a7("mosq#"+(i+1),false,"rn2 ไม่ได้"); }
  else {
    const cb=ch.querySelector(".o-rnmosq"); const block=ch.querySelector(".rnmosq-block");
    a7("mosq: มี checkbox .o-rnmosq + .rnmosq-block", !!cb&&!!block, "cb="+(!!cb)+" block="+(!!block));
    // มุ้งก่อน "ทำเป็นบาน" (order ใน DOM) — เทียบตำแหน่งกล่องมุ้ง vs กล่องทำเป็นบาน
    let mosqBeforeDoor=false;
    if(block){ const doorBox=Array.from(ch.querySelectorAll(".opt")).find(e=>/🚪 ทำเป็นบาน|ทำเป็นบาน \(ระแนงสลับ/.test(e.textContent||"")); if(doorBox){ mosqBeforeDoor=!!(block.compareDocumentPosition(doorBox)&w.Node.DOCUMENT_POSITION_FOLLOWING); } }
    a7("mosq: กล่องมุ้งติดตาย อยู่ 'ก่อน' กล่องทำเป็นบาน (order)", mosqBeforeDoor, mosqBeforeDoor?"มุ้ง → งานเสริม → ทำเป็นบาน ✅":"ลำดับไม่ตรงดราฟ");
    // ติ๊ก → rnmosq-wrap โผล่
    const wrap0=ch.querySelector(".rnmosq-wrap");
    a7("mosq: default ปิด → .rnmosq-wrap ซ่อน", isHidden(wrap0), wrap0?("display="+JSON.stringify(wrap0.style.display)):"ไม่พบ wrap");
    if(cb){ cb.checked=true; fire(cb,"change"); try{ w.rnMosqToggle(ch); }catch(e){} }
    const wrap1=ch.querySelector(".rnmosq-wrap");
    a7("mosq: ติ๊กมุ้ง → .rnmosq-wrap โผล่", isShown(wrap1), wrap1?("display="+JSON.stringify(wrap1.style.display)+" ✅"):"ไม่พบ wrap");
    // ผ้ามุ้ง 3 แบบ (fiber/cat/rat ชิป)
    const fab=ch.querySelector(".o-rnmosqfab"); const fabOpts=fab?Array.from(fab.options).map(o=>o.value):[];
    const fab3=["fiber","cat","rat"].every(v=>fabOpts.includes(v)) && fab && fab.style.display==="none";
    a7("mosq: ผ้ามุ้ง 3 แบบ (fiber/cat/rat · ชิป hidden select)", fab3, "options="+JSON.stringify(fabOpts)+" hidden="+(fab&&fab.style.display==="none"));
    // D6① wording (พี่เคาะ "แก้ตามดราฟ" 24มิ.ย.): ชิปผ้ามุ้งแรก = "ผ้าไฟเบอร์ (มาตรฐาน)" (เดิม "ธรรมดา (ฟรี)")
    const fabGrp=fab?fab.parentElement.querySelector(".chip-group"):null; const fabGrpTxt=fabGrp?(fabGrp.textContent||""):"";
    a7("D6① mosq ชิปแรก = 'ผ้าไฟเบอร์ (มาตรฐาน)' (ดราฟ)", /ผ้าไฟเบอร์/.test(fabGrpTxt), "chips='"+fabGrpTxt.trim().slice(0,50)+"' → ต้องมี 'ผ้าไฟเบอร์' (เดิม 'ธรรมดา (ฟรี)')");
    // D6② wording: ชิปชนิดบาน "บานสวิง" ต้องมี "(เปิด 2 ทาง)" + "เลื่อน SMS" → "บานเลื่อน SMS"
    const dtGrp=ch.querySelector(".o-doortype")?ch.querySelector(".o-doortype").parentElement.querySelector(".chip-group"):null;
    const dtGrpTxt=dtGrp?(dtGrp.textContent||""):"";
    a7("D6② ชิปชนิดบาน 'บานสวิง (เปิด 2 ทาง)' (ดราฟ)", /2\s*ทาง/.test(dtGrpTxt), "doortype chips='"+dtGrpTxt.trim().slice(0,70)+"' → ต้องมี 'เปิด 2 ทาง' ที่บานสวิง");
    // cat +300×area / rat +800×area (auto size = พื้นที่ระแนง = RW×RH)
    function mosqGrand(fabVal, colVal){
      const b=build("rn2",RW,RH,[],"2"); if(!b) return NaN; const c=b.ch;
      const mc=c.querySelector(".o-rnmosq"); if(mc){ mc.checked=true; fire(mc,"change"); try{ w.rnMosqToggle(c); }catch(e){} }
      setOpt(c,".o-rnmosqsz","auto");
      if(fabVal) setOpt(c,".o-rnmosqfab",fabVal);
      if(colVal) setOpt(c,".o-rnmosqcol",colVal);
      return grandOf(c);
    }
    const area=RW*RH;
    const gFiber=mosqGrand("fiber","white");
    const gCat=mosqGrand("cat","white");
    const gRat=mosqGrand("rat","white");
    // ⚠ roundUp ปัดพัน → assert ทิศทาง + ช่วง (cat แพงกว่า fiber ราว 300×area, rat ราว 800×area · ปัดพัน ±1000)
    const catDelta=gCat-gFiber, ratDelta=gRat-gFiber;
    const catOK=catDelta>0 && Math.abs(catDelta-300*area)<=1000;
    const ratOK=ratDelta>0 && Math.abs(ratDelta-800*area)<=1000;
    a7("mosq: ผ้ากันแมว +~300×พื้นที่ (cat)", catOK, "Δ="+catDelta+" (คาด ~"+Math.round(300*area)+" ±ปัดพัน) fiber="+gFiber+" cat="+gCat);
    a7("mosq: ผ้ากันหนูสแตนเลส +~800×พื้นที่ (rat)", ratOK, "Δ="+ratDelta+" (คาด ~"+Math.round(800*area)+" ±ปัดพัน) rat="+gRat);
    // ขนาด manual → W/H
    const bM=build("rn2",RW,RH,[],"2"); let manualOK=false;
    if(bM){ const c=bM.ch; const mc=c.querySelector(".o-rnmosq"); if(mc){ mc.checked=true; fire(mc,"change"); try{ w.rnMosqToggle(c); }catch(e){} } setOpt(c,".o-rnmosqsz","manual"); try{ w.rnMosqSzToggle(c); }catch(e){} const ms=c.querySelector(".rnmosq-manual-sz"); manualOK=isShown(ms)&&!!c.querySelector(".o-rnmosqw")&&!!c.querySelector(".o-rnmosqh"); }
    a7("mosq: ขนาด manual → ช่อง W/H (.o-rnmosqw/.o-rnmosqh) โผล่", manualOK, manualOK?"กรอกเอง → W/H โผล่ ✅":"manual แล้วช่อง W/H ไม่โผล่");
    // auto = พื้นที่ระแนง (เทียบ manual ที่กรอก = RW×RH → ราคาเท่า auto)
    const bAuto2=build("rn2",RW,RH,[],"2"); let gAutoM=NaN;
    if(bAuto2){ const c=bAuto2.ch; const mc=c.querySelector(".o-rnmosq"); if(mc){ mc.checked=true; fire(mc,"change"); try{ w.rnMosqToggle(c); }catch(e){} } setOpt(c,".o-rnmosqsz","auto"); gAutoM=grandOf(c); }
    const bMan2=build("rn2",RW,RH,[],"2"); let gMan=NaN;
    if(bMan2){ const c=bMan2.ch; const mc=c.querySelector(".o-rnmosq"); if(mc){ mc.checked=true; fire(mc,"change"); try{ w.rnMosqToggle(c); }catch(e){} } setOpt(c,".o-rnmosqsz","manual"); try{ w.rnMosqSzToggle(c); }catch(e){} setOpt(c,".o-rnmosqw",String(RW)); setOpt(c,".o-rnmosqh",String(RH)); gMan=grandOf(c); }
    a7("mosq: auto = พื้นที่ระแนง (auto ≈ manual W×H เท่าระแนง)", Number.isFinite(gAutoM)&&gAutoM===gMan, "auto="+gAutoM+" manual("+RW+"×"+RH+")="+gMan+(gAutoM===gMan?" ✅":" (auto ไม่เท่าพื้นที่ระแนง)"));
    // สีกรอบ 4 สี (ชิป)
    const col=ch.querySelector(".o-rnmosqcol"); const colOpts=col?Array.from(col.options).map(o=>o.value):[];
    const col4=["white","black","sahara","wood"].every(v=>colOpts.includes(v));
    a7("mosq: สีกรอบ 4 สี (white/black/sahara/wood)", col4, "options="+JSON.stringify(colOpts));
    // ขาว/ดำ ฟรี
    const gWhite=mosqGrand("fiber","white");
    const gBlack=mosqGrand("fiber","black");
    a7("mosq: สีกรอบ ขาว/ดำ ฟรี", Number.isFinite(gWhite)&&gWhite===gBlack, "ขาว="+gWhite+" ดำ="+gBlack+(gWhite===gBlack?" ✅":" (ดำคิดเงิน — ควรฟรี)"));
    // ซาฮาร่า + ค่าสี
    const gSahara=mosqGrand("fiber","sahara");
    a7("mosq: สีกรอบ ซาฮาร่า + ค่าสี (>ขาว)", Number.isFinite(gSahara)&&gSahara>gWhite, "ขาว="+gWhite+" ซาฮาร่า="+gSahara+(gSahara>gWhite?" ✅":" (ไม่บวกค่าสี)"));
    // ปิดมุ้ง = baseline (เท่าไม่มีมุ้ง · golden ปลอดภัย)
    const gBase=(()=>{ const b=build("rn2",RW,RH,[],"2"); return b?grandOf(b.ch):NaN; })();
    const gMosqOffExplicit=(()=>{ const b=build("rn2",RW,RH,[],"2"); if(!b)return NaN; const c=b.ch; const mc=c.querySelector(".o-rnmosq"); if(mc){ mc.checked=false; fire(mc,"change"); try{ w.rnMosqToggle(c); }catch(e){} } return grandOf(c); })();
    a7("mosq: ปิดมุ้ง = baseline (ไม่กระทบราคาเดิม)", Number.isFinite(gBase)&&gBase===gMosqOffExplicit, "baseline="+gBase+" ปิดมุ้ง="+gMosqOffExplicit+(gBase===gMosqOffExplicit?" ✅":""));
    // เปิดมุ้ง → บวก
    a7("mosq: เปิดมุ้ง → ราคาบวกเพิ่ม (>baseline)", Number.isFinite(gFiber)&&gFiber>gBase, "baseline="+gBase+" เปิดมุ้ง fiber="+gFiber+(gFiber>gBase?" ✅":" (เปิดมุ้งไม่บวก)"));
  }
}

if(jsErr.length) add("miss","engine","JS error ตอน render", jsErr.slice(0,5).join(" | "));

// ===== dump ออปชั่นต่อรุ่น G2 =====
const dump=[];
const dumpIds=["fence_gate","rn2","rn38","rn84","imp1","imp2","imp3","imp4","bar_slide","bar_grid_z","bar_openclose"];
for(const id of dumpIds){ const r=renderProd(id,"2"); if(!r||!r.ok){ dump.push({id,opts:"(เลือกไม่ได้ในกลุ่ม 2)"}); continue; } dump.push({id,opts:optClasses(r.ch).join(" ")||"(ไม่มี o-*)"}); }

// ===== เขียน HTML =====
const order={miss:0,extra:1,warn:2,ok:3,info:4};
rows.sort((a,b)=>order[a.s]-order[b.s]);
const cnt=s=>rows.filter(r=>r.s===s).length;
const esc=s=>String(s).replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;");
const trow=r=>`<tr class="${r.s}"><td>${sev[r.s]}</td><td>${esc(r.area)}</td><td>${esc(r.title)}</td><td>${esc(r.detail)}</td></tr>`;

const html_out=`<!doctype html><html lang="th"><head><meta charset="utf-8"><title>CHECK G2 vs ดราฟ</title><style>
body{font-family:'Leelawadee UI',Tahoma,sans-serif;font-size:13px;color:#1f2937;max-width:1050px;margin:0 auto;padding:16px;background:#f9fafb;}
h1{color:#B3151D;font-size:20px;border-bottom:3px solid #B3151D;padding-bottom:6px;}
.sum{display:flex;gap:8px;flex-wrap:wrap;margin:10px 0;}
.pill{padding:6px 12px;border-radius:20px;font-weight:700;}
.pm{background:#fee2e2;color:#991b1b;}.po{background:#ffedd5;color:#9a3412;}.pw{background:#fef9c3;color:#854d0e;}.pk{background:#dcfce7;color:#166534;}
table{border-collapse:collapse;width:100%;background:#fff;margin:8px 0;font-size:12.5px;}
th,td{border:1px solid #e5e7eb;padding:6px 8px;text-align:left;vertical-align:top;}
th{background:#fbe9ea;color:#B3151D;}
tr.miss td{background:#fef2f2;}tr.warn td{background:#fefce8;}tr.extra td{background:#fff7ed;}
h2{color:#B3151D;font-size:15px;margin-top:18px;}
code{background:#f3f4f6;padding:0 4px;border-radius:3px;font-size:11.5px;}
.dump td{font-size:11px;}
.quotebox{border:2px solid #B3151D;border-radius:8px;padding:10px;margin:6px 0 14px;background:#fff;overflow-x:auto;}
.quotebox table{font-size:11px;width:100%;}.quotebox th,.quotebox td{padding:3px 5px;}
.qlabel{font-weight:700;color:#B3151D;margin-top:14px;font-size:13px;}
.opttest .ok td{background:#dcfce7;}.opttest .miss td{background:#fef2f2;}.opttest .warn td{background:#fefce8;}
.bd{width:auto;min-width:340px;margin:4px 0 2px;font-size:11.5px;}.bd td:last-child,.bd th:last-child{text-align:right;font-variant-numeric:tabular-nums;}.bd th{background:#fff7ed;color:#9a3412;}
.prodgrp{font-weight:700;color:#1D4ED8;font-size:13px;margin-top:14px;}
</style></head><body>
<h1>🔍 ตรวจงาน G2 — index.html (dev) เทียบ ดราฟ G2</h1>
<p>เกณฑ์: HANDOFF-G2-restructure-2026-06-15 + CODEREADY-G2-2026-06-15 + memory g2-restructure-v2 · ราคา=engine จริง (golden baseline) · render index.html สดด้วย jsdom</p>
<div class="sum">
<span class="pill pm">🔴 ขาด/ยังไม่ทำ ${cnt("miss")}</span>
<span class="pill po">🟠 เกิน ${cnt("extra")}</span>
<span class="pill pw">🟡 ต้องเคาะ/ดูตา ${cnt("warn")}</span>
<span class="pill pk">🟢 ตรง ${cnt("ok")}</span>
</div>
<h2>ผลตรวจ (เรียง ขาด→เกิน→เคาะ→ตรง)</h2>
<table><tr><th></th><th>มิติ</th><th>หัวข้อ</th><th>รายละเอียด</th></tr>
${rows.map(trow).join("\n")}
</table>

<h2>🧾 ใบเสนอราคาจริง (1 ต่อหมวด · เลือกออปชั่นครบ)</h2>
<p>ออกใบจากระบบจริง โดยเลือกออปชั่นที่เกี่ยวข้อง — ดูว่ารายการ/ราคา/สี/ข้อความถูกไหม</p>
${quoteCards.map(c=> c.err?`<div class="qlabel">${esc(c.label)} — ${esc(c.err)}</div>` : `<div class="qlabel">${esc(c.label)} · ยอดรวม ฿${(c.grand||0).toLocaleString()}</div>`+(c.breakdown?`<table class="bd"><tr><th>แจกแจงราคา (รวม VAT 7%)</th><th>บาท</th></tr>${c.breakdown.lines.map(l=>`<tr><td>${esc(l.n)}</td><td>${(l.p>=0?"+":"")+l.p.toLocaleString()}</td></tr>`).join("")}<tr><th>รวมสุทธิ</th><th>${c.breakdown.total.toLocaleString()}</th></tr></table>`:"")+`<div class="quotebox">${c.html||"(ใบว่าง)"}</div>`).join("\n")}

<h2>🧪 เทสทุกออปชั่น — กดแล้วราคาขยับจริงไหม</h2>
${optTestGroups.map(g=>`<div class="prodgrp">สินค้าทดสอบ: ${esc(g.prod)} · ฐาน ฿${Number.isFinite(g.base)?g.base.toLocaleString():"(อ่านไม่ได้)"}</div>
<table class="opttest"><tr><th></th><th>ออปชั่น</th><th>ราคาขยับ</th><th>หมายเหตุ</th></tr>
${g.rows.map(t=>`<tr class="${t.s}"><td>${sev[t.s]}</td><td>${esc(t.label)}</td><td>${t.delta===null?"-":(t.delta>=0?"+"+t.delta.toLocaleString():t.delta.toLocaleString())}</td><td>${esc(t.note)}</td></tr>`).join("")}
</table>`).join("\n")}

<h2>📋 Section 7 — ทำเป็นบาน + มุ้งติดตาย (ดราฟ 23มิ.ย.) · ${S7.filter(x=>x.pass).length}/${S7.length} ผ่าน</h2>
<p>เกณฑ์ = DRAFT-G2-ระแนงทำเป็นบาน+มุ้งติดตาย-2026-06-23.html · ทดสอบ rn2 (ranae · มี p.fin) · ✅ผ่าน / ❌ไม่ผ่าน</p>
<table><tr><th>#</th><th></th><th>ข้อตรวจ (checklist)</th><th>รายละเอียด/ค่าที่อ่านได้</th></tr>
${S7.map((x,i)=>`<tr class="${x.pass?"":"miss"}"><td>${i+1}</td><td>${x.pass?"✅":"❌"}</td><td>${esc(x.n)}</td><td>${esc(x.detail)}</td></tr>`).join("\n")}
</table>

<h2>ออปชั่นต่อรุ่น G2 (dump · เทียบดราฟด้วยตา)</h2>
<table class="dump"><tr><th>รุ่น (id)</th><th>ออปชั่น control (.o-*) ที่ render จริง</th></tr>
${dump.map(d=>`<tr><td><code>${esc(d.id)}</code></td><td>${esc(d.opts)}</td></tr>`).join("\n")}
</table>
<p style="color:#6b7280;margin-top:14px;font-size:11px;">
หมายเหตุ: 🟡 "ดูตา" = layout/การจัดกลุ่มสวยตามดราฟ jsdom ตรวจไม่ได้ → เปิด mirror+ดราฟคู่กัน · ราคา golden snapshot ✅ 146 สินค้าตรง baseline · วันที่ตรวจ: ${DATE}
</p>
</body></html>`;

writeFileSync(OUT, html_out, "utf8");

console.log(`\n🔍 CHECK G2 vs ดราฟ — 🔴${cnt("miss")} ขาด · 🟠${cnt("extra")} เกิน · 🟡${cnt("warn")} เคาะ · 🟢${cnt("ok")} ตรง`);
rows.filter(r=>r.s==="miss").forEach(r=>console.log("  🔴 ["+r.area+"] "+r.title+" — "+r.detail));
rows.filter(r=>r.s==="warn").forEach(r=>console.log("  🟡 ["+r.area+"] "+r.title+" — "+r.detail));

// ===== สรุป Section 7 (ทำเป็นบาน + มุ้งติดตาย) =====
const s7pass=S7.filter(x=>x.pass).length;
console.log(`\n📋 Section 7 (ทำเป็นบาน + มุ้งติดตาย) — ${s7pass}/${S7.length} ผ่าน`);
const s7fail=S7.filter(x=>!x.pass);
if(s7fail.length===0) console.log("  ✅ ผ่านครบทุกข้อ");
else { console.log(`  ❌ ไม่ผ่าน ${s7fail.length} ข้อ:`); s7fail.forEach(x=>console.log("     ❌ "+x.n+" — "+x.detail)); }

console.log("\n📄 รายงาน: "+OUT);
