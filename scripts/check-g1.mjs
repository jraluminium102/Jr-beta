// check-g1.mjs — ตรวจงาน G1 ที่ dev แก้ใน index.html "เหมือนดราฟที่ส่งไปไหม"
// เทียบ 4 มิติ: ปุ่ม(6กลุ่ม→รุ่น) · ออปชั่น · ราคา(vs engine/golden) · อุปกรณ์เสริม
// เกณฑ์: สเปกดราฟ G1 (จาก HANDOFF-G1-FINAL-dev + g1-options-extras-master) · ราคา = engine จริง (golden baseline)
// ใช้:  node scripts/check-g1.mjs        → ออกรายงาน HTML + สรุปใน terminal
//       เปิด docs/กลุ่ม1-งานบาน-เลื่อนเปิดเฟี้ยม/CHECK-G1-vs-draft-<วันนี้>.html
import { JSDOM, VirtualConsole } from "jsdom";
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");
const OUTDIR = join(ROOT, "docs", "กลุ่ม1-งานบาน-เลื่อนเปิดเฟี้ยม");
const DATE = process.argv[2] || "today"; // ส่งวันที่เป็น arg ได้ (เลี่ยง Date ใน sandbox)
const OUT = join(OUTDIR, `CHECK-G1-vs-draft-${DATE}.html`);

// ===== สเปกดราฟ G1 (source of truth = handoff/master · 6 ปุ่ม → รุ่น) =====
const EXPECTED_GROUPS = {
  "บานเลื่อน": ["sliding_euro","sliding_sms","inner_top_stack","inner_top_slimlux","sliding_eseries"],
  "บานเปิด": ["casement_euro","casement_xseries","casement_velora","casement_flush_solid","casement_inset_solid","awning_euro","pivot"],
  "บานเฟี้ยม": ["folding_euro","folding","folding_xseries"],
  "ติดตาย/เปลือย": ["fixed_glass","frameless_fixed","frameless_door","wall_ext","wall_int","isowall"],
  "ดัดโค้ง": ["curved_double","curved_single","curved_fixed","curved_slim"],
  "อื่นๆ/พิเศษ": ["shower","lift_sms","lift_aluinch","pc_door_2","pc_door_4","ykk_vent","ykk_exhido","tostem_a01"],
};
// ออปชั่น/อุปกรณ์เสริมหลักที่ดราฟกำหนด (เช็คว่ามี control จริงไหม · บานที่ควรมี)
const EXPECTED_OPTS = [
  { cls:"o-gridmark", label:"คาดตาราง", on:["fixed_glass","frameless_fixed","casement_euro"], note:"ดราฟ: เปิดให้ติดตาย/เปลือยใช้ได้ (ยกเว้น shower)" },
  { cls:"o-mosq", label:"มุ้ง (14 แบบ)", on:["casement_euro","sliding_euro"], note:"ดราฟ: 3 กลุ่ม เฟรม/จีบ/ม้วน · เพิ่ม imp28+imp30 = 14" },
  { cls:"o-fcsides", label:"ครอบวงกบ (อุปกรณ์เสริม)", on:["casement_euro","sliding_euro","ykk_vent"], note:"มติ15มิ.ย.: YKK มีครอบวงกบเหมือนบานอื่น" },
  { cls:"o-dfm", label:"ดรอปพื้น", on:["ykk_vent"], note:"มติ15มิ.ย.: YKK มีดรอปพื้น (แก้ L3314 ให้ YKK ผ่านบล็อก)" },
];
// engine fixes (ธง B จาก handoff) — probe พฤติกรรมจริง
// ราคา: เทียบ golden baseline (engine จริง)

// ===== boot =====
const html = readFileSync(join(ROOT,"public/calculator/index.html"),"utf8");
const vc = new VirtualConsole(); const jsErr=[];
vc.on("jsdomError",e=>{ if(!/scrollTo|Not implemented/i.test(e.message)) jsErr.push(e.message); });
const dom = new JSDOM(html,{runScripts:"dangerously",pretendToBeVisual:true,virtualConsole:vc,url:"http://localhost/calculator/index.html"});
await new Promise(r=>{ if(dom.window.document.readyState==="complete")r(); else dom.window.addEventListener("load",r); setTimeout(r,2000); });
const w=dom.window, doc=w.document;
const fire=(el,t)=>el.dispatchEvent(new w.Event(t,{bubbles:true}));
const noSvc=()=>["svc-protect","svc-lift","svc-travel","svc-ship"].forEach(id=>{const e=doc.getElementById(id);if(e&&e.checked){e.checked=false;fire(e,"change");}});

function renderProd(id){
  doc.getElementById("items").innerHTML="";
  try{ w.addItem(doc.getElementById("items")); }catch(e){ return null; }
  const ch=doc.querySelector("#items .ch"); if(!ch) return null;
  const gs=ch.querySelector(".i-group"); if(gs){ gs.value="1"; fire(gs,"change"); }
  const ps=ch.querySelector(".i-prod"); if(!ps||!ps.querySelector('option[value="'+id+'"]')) return {ch,ok:false};
  ps.value=id; fire(ps,"change");
  const wi=ch.querySelector(".i-w"),hi=ch.querySelector(".i-h");
  if(wi){wi.value="1.2";fire(wi,"input");fire(wi,"change");}
  if(hi){hi.value="2.2";fire(hi,"input");fire(hi,"change");}
  return {ch,ok:true,ps};
}
function group1Products(){ const r=renderProd("__none__"); if(!r)return []; return Array.from(r.ch.querySelector(".i-prod").options).map(o=>o.value).filter(Boolean); }
function optClasses(ch){ const set=new Set(); ch.querySelectorAll("*").forEach(e=>{ if(e.classList) e.classList.forEach(c=>{ if(/^o-/.test(c)) set.add(c); }); }); return [...set].sort(); }
function grand(){ noSvc(); try{ w.calcQuote&&w.calcQuote(); w.genQuote&&w.genQuote(); }catch(e){ return NaN; } const g=doc.querySelector("#quoteContent .qtot .g"); return g?parseInt((g.textContent||"").replace(/\.\d+/g,"").replace(/[^\d]/g,""),10):NaN; }
// เลือกออปชั่น 1 ตัว (select=set value · checkbox=ติ๊ก) → คืน true ถ้าตั้งค่าได้
function setOpt(ch,cls,val){ const el=ch.querySelector(cls); if(!el)return false; if(el.type==="checkbox"){ el.checked=(val===true||val==="1"||val===1); } else { el.value=String(val); } fire(el,"input"); fire(el,"change"); return true; }
// เปิดสินค้า + ตั้งขนาด + (ออปชั่น) → คืน {ch,grand}
function build(id,wd,ht,optPairs){
  doc.getElementById("items").innerHTML=""; w.addItem(doc.getElementById("items"));
  const ch=doc.querySelector("#items .ch"); if(!ch)return null;
  const gs=ch.querySelector(".i-group"); if(gs){gs.value="1";fire(gs,"change");}
  const ps=ch.querySelector(".i-prod"); if(!ps||!ps.querySelector('option[value="'+id+'"]'))return null;
  ps.value=id; fire(ps,"change");
  const wi=ch.querySelector(".i-w"),hi=ch.querySelector(".i-h");
  if(wi){wi.value=String(wd);fire(wi,"input");fire(wi,"change");}
  if(hi){hi.value=String(ht);fire(hi,"input");fire(hi,"change");}
  const applied=[]; for(const [cls,val] of (optPairs||[])){ applied.push({cls,ok:setOpt(ch,cls,val)}); }
  return {ch,applied};
}
// ออกใบเสนอราคาจริง → คืน HTML ใบ (#quoteContent) + ยอดรวม
function genQuoteOf(id,wd,ht,optPairs){
  const b=build(id,wd,ht,optPairs); if(!b)return null;
  const g=grand(); const qc=doc.getElementById("quoteContent");
  return { html: qc?qc.innerHTML:"", grand:g, applied:b.applied };
}

const rows=[]; // {sev,area,title,detail}
const sev={ok:"🟢",miss:"🔴",extra:"🟠",warn:"🟡",info:"⬜"};
const add=(s,area,title,detail)=>rows.push({s,area,title,detail});

// ===== 1. ปุ่ม 6 กลุ่ม + รุ่น =====
const has6btn = ("G1GROUPS" in w);
add(has6btn?"ok":"miss","ปุ่ม","6 ปุ่มชนิดบานแบบดราฟ (G1GROUPS)", has6btn?"พบ G1GROUPS (ทำ 6 ปุ่มแล้ว)":"ไม่พบ G1GROUPS → G1 ยังใช้เมนู cat เดิม (ยังไม่ทำ 6 ปุ่มกลุ่มแบบดราฟ/G6)");
const g1prods = group1Products();
for(const [grp,ids] of Object.entries(EXPECTED_GROUPS)){
  const miss = ids.filter(id=>!g1prods.includes(id));
  if(miss.length) add("miss","ปุ่ม","["+grp+"] รุ่นที่เลือกไม่ได้ในกลุ่ม 1", "ขาด: "+miss.join(", "));
  else add("ok","ปุ่ม","["+grp+"] รุ่นครบเลือกได้", ids.length+" รุ่น");
}
// ผนังเบาในกลุ่ม 1 (ธง B6)
const wallIn1 = ["wall_ext","wall_int","isowall"].filter(id=>g1prods.includes(id));
add(wallIn1.length===3?"ok":"miss","ปุ่ม","ผนังเบาทึบในกลุ่ม 1 (B6)", wallIn1.length===3?"wall_ext/wall_int/isowall เลือกได้ในกลุ่ม 1":"ขาด: "+["wall_ext","wall_int","isowall"].filter(id=>!g1prods.includes(id)).join(", "));

// ===== 2. ออปชั่น (probe control จริง) =====
for(const o of EXPECTED_OPTS){
  for(const id of o.on){
    const r=renderProd(id); if(!r||!r.ok){ add("warn","ออปชั่น",o.label+" บน "+id, "เลือกรุ่นนี้ไม่ได้ (ข้าม)"); continue; }
    const present = !!r.ch.querySelector("."+o.cls);
    add(present?"ok":"miss","ออปชั่น",o.label+" บน "+id, present?("พบ ."+o.cls+" · "+o.note):("ไม่พบ ."+o.cls+" → "+o.note));
  }
}
// มุ้ง 14 แบบ + imp28/imp30
{ const r=renderProd("casement_euro");
  if(r&&r.ok){ const m=r.ch.querySelector(".o-mosq");
    if(m){ const opts=Array.from(m.options).map(o=>o.value); const has28=opts.includes("imp28"), has30=opts.includes("imp30");
      add((has28&&has30)?"ok":"miss","ออปชั่น","มุ้งเพิ่ม imp28(จีบ)+imp30(เฟรม) (B5)", "o-mosq มี "+opts.length+" ตัวเลือก · imp28="+(has28?"✓":"✗")+" imp30="+(has30?"✓":"✗"));
    } else add("warn","ออปชั่น","มุ้ง o-mosq","ไม่พบ o-mosq บน casement_euro");
  }
}

// ===== 3. engine fixes (ธง B) =====
// o-solidlight (มติพี่นัท 2026-06-15: เก็บไว้ · ให้บานทึบกรอกช่องกระจกได้ในตัว · ยึดมติ G6 ที่ใหม่กว่า)
{ let found=[]; for(const id of g1prods){ const r=renderProd(id); if(r&&r.ok&&r.ch.querySelector(".o-solidlight")) found.push(id); }
  add(found.length?"ok":"miss","engine","o-solidlight (ช่องแสงบานทึบ)", found.length?("เก็บไว้ถูกต้องตามมติ 15 มิ.ย. · พบบน: "+found.join(", ")):"ไม่พบ — ควรเก็บไว้ (บานทึบกรอกขนาดช่องกระจก) → dev เผลอลบ?");
}
// o-solidlower (แผ่นทึบล่าง · มติ 15 มิ.ย.: ตัดทิ้ง — ซ้ำลูกฟูก · คนละตัวกับ solidlight)
{ let found=[]; for(const id of g1prods){ const r=renderProd(id); if(r&&r.ok&&r.ch.querySelector(".o-solidlower")) found.push(id); }
  add(found.length?"miss":"ok","engine","o-solidlower (แผ่นทึบล่าง) ตัดทิ้ง", found.length?("ยังพบบน: "+found.slice(0,6).join(", ")+(found.length>6?` …(${found.length} บาน)`:"")+" → dev ตัด render ทิ้ง (มติ 15 มิ.ย.)"):"ตัดออกแล้ว ✓");
}
// B4 เฟี้ยม เปิดซ้าย/ขวา
{ const r=renderProd("folding"); if(r&&r.ok){ const txt=r.ch.innerHTML; const has=/เปิดซ้าย|เปิดขวา/.test(txt)||r.ch.querySelector(".o-foldopen,.o-foldlr");
    add(has?"ok":"miss","engine","บานเฟี้ยม เปิดซ้าย/ขวา (B4)", has?"พบช่องระบุเปิดซ้าย/ขวา":"ไม่พบ → ยังมีแค่จำนวนบาน");
  } else add("warn","engine","เฟี้ยม","เลือก folding ไม่ได้");
}
// B2 บานเปลือย โชว์สีเฟรม
{ const r=renderProd("frameless_fixed"); if(r&&r.ok){ const c=r.ch.querySelector(".i-color"); const vis=c&&c.offsetParent!==null||(c&&!(c.closest("[style*='display:none']")));
    add(c?"ok":"warn","engine","บานเปลือยโชว์สีเฟรม (B2)", c?"พบช่องสี .i-color (ตรวจตาว่าโชว์สีเฟรมจริง)":"ไม่พบช่องสี (อยู่ NO_COLOR_CATS?) — ถ้าจะโชว์สีเฟรมต้องเอาออก");
  } }

// ===== 4. ราคา vs golden baseline (engine จริง) =====
const baseF = join(__dirname,"golden-baseline.json");
if(existsSync(baseF)){
  const base=JSON.parse(readFileSync(baseF,"utf8")); const bmap=new Map(base.rows.map(r=>[r.key,r]));
  let okN=0,diffN=0;
  for(const id of g1prods){ const b=bmap.get("1:"+id); if(!b||b.total==null) continue;
    // golden ใช้ขนาด g1=[1.5,2.0] · render ที่ขนาดเดียวกันเพื่อเทียบ
    doc.getElementById("items").innerHTML=""; w.addItem(doc.getElementById("items"));
    const ch=doc.querySelector("#items .ch"); const gs=ch.querySelector(".i-group"); gs.value="1"; fire(gs,"change");
    const ps=ch.querySelector(".i-prod"); if(!ps.querySelector('option[value="'+id+'"]')) continue; ps.value=id; fire(ps,"change");
    const wi=ch.querySelector(".i-w"),hi=ch.querySelector(".i-h"); wi.value="1.5";fire(wi,"input");fire(wi,"change"); hi.value="2.0";fire(hi,"input");fire(hi,"change");
    const cur=grand();
    if(cur===b.total) okN++; else { diffN++; add("warn","ราคา",id+" ราคาขยับจาก golden", "golden="+b.total+" · ตอนนี้="+cur+" (ตรวจว่าตั้งใจแก้ไหม)"); }
  }
  add(diffN===0?"ok":"warn","ราคา","ราคา G1 เทียบ golden baseline", diffN===0?(okN+" รุ่น ตรง baseline (ไม่เพี้ยน)"):(okN+" ตรง · "+diffN+" ขยับ (ดูด้านบน)"));
} else add("warn","ราคา","golden baseline","ไม่พบ golden-baseline.json — รัน node scripts/golden-snapshot.mjs --save");

// ===== 5. dump ออปชั่นต่อรุ่น (ให้เทียบดราฟด้วยตา) =====
const dump=[];
for(const id of g1prods){ const r=renderProd(id); if(!r||!r.ok){ dump.push({id,opts:"(เลือกไม่ได้)"}); continue; } dump.push({id,opts:optClasses(r.ch).join(" ")||"(ไม่มี o-*)"}); }

// ===== 6. ใบเสนอราคาจริง — เลือกออปชั่น+สีครบ แล้วออกใบ (มติ 16 มิ.ย.) =====
// สีอลู .i-color=10 (สีอบพิเศษ · มีราคา) · ครอบวงกบ 4 ด้าน · มุ้ง · ดรอปพื้น — ดูว่าขึ้นใบ + คิดเงินจริงไหม
// opts = [selector, value, ชื่อแจกแจงราคา] · ใส่รหัสสี (.i-colorcode) + มุ้งเลื่อน/เปิด (.o-mosqopenstyle) ให้ใบสมบูรณ์
const QSAMPLES=[
  {id:"sliding_euro", w:2.4,h:2.2, label:"บานเลื่อน ยูโร", opts:[[".i-color","10","สีอลู: สีอบพิเศษ"],[".i-colorcode","JR-7012","→ รหัสสี"],[".o-fcsides","4","ครอบวงกบ 4 ด้าน"],[".o-mosq","mj_sd_basic","มุ้งจีบ SD"],[".o-mosqopenstyle","เลื่อน","→ มุ้งเลื่อน"]]},
  {id:"casement_euro", w:1.2,h:2.2, label:"บานเปิด ยูโร", opts:[[".i-color","10","สีอลู: สีอบพิเศษ"],[".i-colorcode","JR-7012","→ รหัสสี"],[".o-mosq","imp23","มุ้งเฟรมใหญ่"],[".o-mosqopenstyle","เปิด","→ มุ้งเปิด"],[".o-mosqfabric","cat","ผ้ามุ้งกันแมว"]]},
  {id:"fixed_glass", w:1.5,h:2.0, label:"กระจกติดตาย", opts:[[".i-color","5","สีอลู: สีลายไม้สต๊อก"],[".o-gridmark","1","คาดตาราง"]]},
  {id:"folding", w:3.0,h:2.2, label:"บานเฟี้ยม", opts:[[".i-color","10","สีอลู: สีอบพิเศษ"],[".i-colorcode","JR-7012","→ รหัสสี"]]},
  {id:"ykk_vent", w:1.0,h:2.2, label:"ประตู YKK", opts:[[".i-color","10","สีอลู: สีอบพิเศษ"],[".i-colorcode","JR-7012","→ รหัสสี"]]},
  {id:"wall_ext", w:3.0,h:3.0, label:"ผนังเบาภายนอก", opts:[]},
];
// แจกแจงราคาแบบสะสม: ฐาน + ทีละออปชั่น (delta) → รวม = ยอดบนใบ (ตรง engine)
function breakdownOf(s){
  let prev=(genQuoteOf(s.id,s.w,s.h,[])||{}).grand;
  if(!Number.isFinite(prev))return null;
  const lines=[{n:"ฐาน (สีขาว · ไม่มีออปชั่น)",p:prev}]; const acc=[];
  for(const o of s.opts){ acc.push([o[0],o[1]]); const g=(genQuoteOf(s.id,s.w,s.h,acc)||{}).grand; if(Number.isFinite(g)){ lines.push({n:o[2]||o[0], p:g-prev}); prev=g; } }
  return {lines, total:prev};
}
const quoteCards=[];
for(const s of QSAMPLES){
  const q=genQuoteOf(s.id,s.w,s.h,s.opts);
  if(!q){ quoteCards.push({label:s.label,err:"เลือกสินค้านี้ไม่ได้ในกลุ่ม 1"}); continue; }
  const setFail=q.applied.filter(a=>!a.ok).map(a=>a.cls);
  if(setFail.length) add("warn","ใบเสนอราคา",s.label+" — ออปชั่นบางตัวตั้งค่าไม่ได้", "ตั้งไม่ได้: "+setFail.join(", ")+" (control อาจไม่มีบนบานนี้)");
  quoteCards.push({label:s.label, html:q.html, grand:q.grand, breakdown:breakdownOf(s)});
}

// ===== 7. เทสทุกออปชั่น — กดแล้วราคาขยับจริงไหม (ของจริงใช้ได้ไหม) =====
// เทียบยอดก่อน-หลังเปิดออปชั่น · ออปชั่นที่ควรคิดเงินแต่ราคาไม่ขยับ = 🔴 (ไม่ผูกราคา/พัง)
const OPTTEST_PROD={id:"casement_euro", w:1.2, h:2.2};
const OPTTESTS=[
  {cls:".i-color", val:"10", label:"สีอลู: สีอบพิเศษ", paid:true},
  {cls:".i-color", val:"5",  label:"สีอลู: สีลายไม้สต๊อก", paid:true},
  {cls:".o-fcsides", val:"4", label:"ครอบวงกบ 4 ด้าน", paid:true},
  {cls:".o-mosq", val:"imp23", label:"มุ้งเฟรมใหญ่", paid:true},
  {cls:".o-mosq", val:"mj_sd_basic", label:"มุ้งจีบ SD", paid:true},
  {cls:".o-dfm", val:"8", label:"ดรอปพื้น 8 ม.", paid:true},
  {cls:".o-gridmark", val:"1", label:"คาดตาราง (ติ๊ก)", paid:false},
];
const optTestRows=[];
{ const base=(genQuoteOf(OPTTEST_PROD.id,OPTTEST_PROD.w,OPTTEST_PROD.h,[])||{}).grand;
  for(const t of OPTTESTS){
    const q=genQuoteOf(OPTTEST_PROD.id,OPTTEST_PROD.w,OPTTEST_PROD.h,[[t.cls,t.val]]);
    const has=q && q.applied.every(a=>a.ok);
    const delta=(q&&Number.isFinite(q.grand)&&Number.isFinite(base))?(q.grand-base):null;
    let s="ok",note="";
    if(!has){ s="warn"; note="ตั้งค่าออปชั่นนี้ไม่ได้ (control ไม่มีบนบานเปิด)"; }
    else if(delta===null){ s="warn"; note="อ่านราคาไม่ได้"; }
    else if(t.paid && delta<=0){ s="miss"; note="กดแล้วราคาไม่ขยับ ("+base+"→"+(base+ (delta||0))+") — ควรคิดเงินแต่ไม่คิด"; }
    else { note=delta>0?("ราคาขยับ +"+delta.toLocaleString()):"ราคาไม่ขยับ (ฟรี · ถูกต้อง)"; }
    optTestRows.push({label:t.label,delta,s,note});
    if(s==="miss") add("miss","ออปชั่นใช้จริง",t.label+" กดแล้วราคาไม่ขยับ", note);
  }
}

// ===== 8. จุดที่พี่นัทเจอผิด (16 มิ.ย.) — ตรวจบนใบจริง =====
function billText(id,wd,ht,optPairs){ const b=build(id,wd,ht,optPairs); if(!b)return null; noSvc(); try{w.calcQuote();w.genQuote();}catch(e){return "";} return (doc.getElementById("quoteContent")||{}).textContent||""; }
// (ก) มุ้ง: เลือกแล้วต้องระบุ "เลื่อน" หรือ "เปิด" บนใบ — ไม่ใช่โชว์ชื่อรุ่นรวมๆ "(เลื่อน/เปิด/กระทุ้ง/ยก)"
{ const txt=billText("casement_euro",1.2,2.2,[[".o-mosq","imp23"],[".o-mosqopenstyle","เปิด"]]);
  if(txt!=null){ const generic=/เลื่อน\/เปิด\/กระทุ้ง/.test(txt);
    add(generic?"miss":"ok","มุ้งบนใบ","มุ้งระบุ เลื่อน/เปิด บนใบ (ที่เลือก 'เปิด')",
      generic?"ใบยังโชว์ชื่อรุ่นรวมๆ '(เลื่อน/เปิด/กระทุ้ง/ยก)' — ไม่ระบุว่าบานนี้เป็นมุ้งเลื่อนหรือมุ้งเปิดที่เลือกไว้ → dev: ให้ใบเอาค่ามุ้งเลื่อน/เปิด (ชื่อในโค้ด o-mosqopenstyle) มาแสดงแทนชื่อรุ่นรวม":"ใบระบุชนิดมุ้งที่เลือกแล้ว ✓"); }
}
// (ข) สีอบพิเศษ (hasCode) ต้องกรอกรหัส + รหัสต้องขึ้นใบ
{ const ch0=build("casement_euro",1.2,2.2,[[".i-color","10"]]);  // เลือกสีอบพิเศษ ยังไม่กรอกรหัส
  const hasField= ch0 && !!ch0.ch.querySelector(".i-colorcode");
  add(hasField?"ok":"miss","สีบนใบ","มีช่องกรอกรหัสสีอบพิเศษ (.i-colorcode)", hasField?"พบช่องรหัสสี (โผล่เมื่อเลือกสี hasCode) ✓":"ไม่พบช่องรหัส — สีอบพิเศษ/ลายไม้อบ/สีชุบ ต้องกรอกรหัส");
  const txt=billText("casement_euro",1.2,2.2,[[".i-color","10"],[".i-colorcode","JR-7012"]]);
  if(txt!=null){ const shows=txt.includes("JR-7012");
    add(shows?"ok":"miss","สีบนใบ","รหัสสีอบพิเศษ ขึ้นใบเสนอราคา (กรอก JR-7012)",
      shows?"รหัสขึ้นใบแล้ว ✓":"กรอกรหัสสีแล้วแต่ 'ไม่ขึ้นใบ' — ลูกค้า/โรงงานไม่เห็นรหัสสี → dev: เอารหัสสี (i-colorcode) มาแสดงบนใบหลังชื่อสี"); }
}

// (ค) ผนังเบาใน G1 ต้องไม่ลากฝ้าหลังคามาด้วย — เทสผ่าน "ปุ่มจริง" (chip cascade · บั๊กอยู่ตรงนี้ มติ 16 มิ.ย.)
{ doc.getElementById("items").innerHTML=""; w.addItem(doc.getElementById("items"));
  const ch=doc.querySelector("#items .ch"); const gs=ch.querySelector(".i-group"); if(gs){gs.value="1";fire(gs,"change");}
  let s="ok",note="";
  const fixBtn=ch.querySelector('[data-g1grp="fix"]');
  if(!fixBtn){ s="warn"; note="ไม่พบปุ่มกลุ่ม ติดตาย/ทึบ (G1GROUPS)"; }
  else { fixBtn.click();
    const wallChip=Array.from(doc.querySelector("#items .ch").querySelectorAll(".chip-grid .chip")).find(b=>(b.textContent||"").trim()==="ผนังเบา");
    if(!wallChip){ s="warn"; note="ไม่พบชิป 'ผนังเบา' ในกลุ่ม ติดตาย/ทึบ"; }
    else { wallChip.click(); const t=doc.querySelector("#items .ch").innerText||"";
      const hasCeil=/ตัวซี|ฉาบเรียบ|remood|ไม้เทียม/.test(t);
      const hasRoofTab=/รุ่นฝ้า-ผนัง|กลุ่มวัสดุ/.test(t); // g3SelectorHTML markers (หลังคา/ฝ้า-ผนัง tabs)
      const hasWallSel=/ผนังเบาภายนอก|ISOWALL/.test(t);   // g1WallSelectorHTML markers
      if(hasCeil||hasRoofTab){ s="miss"; note="กดผนังเบา (ผ่านปุ่ม) แล้วโผล่ฝ้าหลังคา (ตัวซี/ฉาบเรียบ/ไม้เทียม) + selector หลังคา/ฝ้า-ผนัง → กดต่อเจอฝ้าหลังคา (ผิด) · dev: เมื่อกลุ่ม=1 + cat 'ฝ้า-ผนัง' อย่า render selector แบบ G3 · โชว์เฉพาะผนังเบา wall_ext/wall_int/isowall แบบ profile solid"; }
      else if(hasWallSel){ s="ok"; note="G1 ผนังเบา = selector เฉพาะ 3 ตัว (ผนังนอก/ใน/ISOWALL) · ไม่มีฝ้าหลังคา/แท็บ G3 (ธง4 มติ 16มิ.ย.)"; }
      else { s="warn"; note="jsdom ไม่เจอฝ้าหลังคา แต่ก็ไม่เจอ selector ผนังเบา — เช็คเบราว์เซอร์จริง"; } }
  }
  add(s,"ผนังเบา G1","ผนังเบาใน G1 (กดผ่านปุ่ม) ไม่ลากฝ้าหลังคา", note);
}

if(jsErr.length) add("miss","engine","JS error ตอน render", jsErr.slice(0,3).join(" | "));

// ===== สรุป + เขียน HTML =====
const order={miss:0,extra:1,warn:2,ok:3,info:4};
rows.sort((a,b)=>order[a.s]-order[b.s]);
const cnt=s=>rows.filter(r=>r.s===s).length;
const esc=s=>String(s).replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;");
const trow=r=>`<tr class="${r.s}"><td>${sev[r.s]}</td><td>${esc(r.area)}</td><td>${esc(r.title)}</td><td>${esc(r.detail)}</td></tr>`;
const html_out=`<!doctype html><html lang="th"><head><meta charset="utf-8"><title>CHECK G1 vs ดราฟ</title><style>
body{font-family:'Leelawadee UI',Tahoma,sans-serif;font-size:13px;color:#1f2937;max-width:980px;margin:0 auto;padding:16px;background:#f9fafb;}
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
</style></head><body>
<h1>🔍 ตรวจงาน G1 — index.html (dev) เทียบ ดราฟ G1</h1>
<p>เกณฑ์: สเปกดราฟ G1 (HANDOFF-G1-FINAL-dev + master) · ราคา = engine จริง (golden baseline) · render index.html สดด้วย jsdom</p>
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

<h2>🧾 ใบเสนอราคาจริง (เลือกออปชั่น+สีครบ · ออกจากระบบจริง)</h2>
<p>ออกใบจากเว็บจริง โดยเลือก สีอลู/มุ้ง/ครอบวงกบ ให้ครบก่อน — ดูว่ารายการ/ราคา/สี ขึ้นใบถูกไหม (ไม่ใช่แค่ตารางเช็ค)</p>
${quoteCards.map(c=> c.err?`<div class="qlabel">${esc(c.label)} — ${esc(c.err)}</div>` : `<div class="qlabel">${esc(c.label)} · ยอดรวม ฿${(c.grand||0).toLocaleString()}</div>`+(c.breakdown?`<table class="bd"><tr><th>แจกแจงราคา (รวม VAT 7%)</th><th>บาท</th></tr>${c.breakdown.lines.map(l=>`<tr><td>${esc(l.n)}</td><td>${(l.p>=0?"+":"")+l.p.toLocaleString()}</td></tr>`).join("")}<tr><th>รวมสุทธิ</th><th>${c.breakdown.total.toLocaleString()}</th></tr></table>`:"")+`<div class="quotebox">${c.html||"(ใบว่าง)"}</div>`).join("\n")}

<h2>🧪 เทสทุกออปชั่น — กดแล้วราคาขยับจริงไหม (ทดสอบบนบานเปิด ยูโร)</h2>
<p>เปิดออปชั่นทีละตัว เทียบยอดก่อน-หลัง · ออปชั่นที่ควรคิดเงินแต่ราคาไม่ขยับ = 🔴 (ของจริงใช้ไม่ได้/ไม่ผูกราคา)</p>
<table class="opttest"><tr><th></th><th>ออปชั่น</th><th>ราคาขยับ</th><th>หมายเหตุ</th></tr>
${optTestRows.map(t=>`<tr class="${t.s}"><td>${sev[t.s]}</td><td>${esc(t.label)}</td><td>${t.delta===null?"-":(t.delta>0?"+"+t.delta.toLocaleString():String(t.delta.toLocaleString()))}</td><td>${esc(t.note)}</td></tr>`).join("\n")}
</table>

<h2>ออปชั่นต่อรุ่น (dump · เทียบดราฟด้วยตา)</h2>
<table class="dump"><tr><th>รุ่น (id)</th><th>ออปชั่น control (.o-*) ที่ render จริง</th></tr>
${dump.map(d=>`<tr><td><code>${esc(d.id)}</code></td><td>${esc(d.opts)}</td></tr>`).join("\n")}
</table>
<p style="color:#6b7280;margin-top:14px;">หมายเหตุ: 🟡 บางจุด (เช่น o-solidlight) สเปก G1 vs G6 ขัดกัน → ต้องเคาะพี่นัท · "ดูตา" = layout/หน้าตา/การจัดกลุ่ม script เทียบไม่ได้ ต้องเปิดดราฟคู่ index.html</p>
</body></html>`;
writeFileSync(OUT, html_out, "utf8");

console.log(`\n🔍 CHECK G1 vs ดราฟ — 🔴${cnt("miss")} ขาด · 🟠${cnt("extra")} เกิน · 🟡${cnt("warn")} เคาะ · 🟢${cnt("ok")} ตรง`);
rows.filter(r=>r.s==="miss").forEach(r=>console.log("  🔴 ["+r.area+"] "+r.title+" — "+r.detail));
rows.filter(r=>r.s==="warn").forEach(r=>console.log("  🟡 ["+r.area+"] "+r.title+" — "+r.detail));
console.log("\n📄 รายงาน: "+OUT);
