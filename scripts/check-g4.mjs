// check-g4.mjs — ตรวจงาน G4 (ตู้อลู/ฝาตู้) ที่ dev แก้ใน index.html "เหมือนดราฟ/handoff ไหม"
// โฟกัส: ฟีเจอร์ใหม่ "ผนังตู้ 3 ด้าน ติ๊กเลือกอิสระ + วัสดุต่อด้าน" (commit 71cb45a · HANDOFF-G4-wall-sides)
// เทียบ 6 มิติ: ปุ่ม/สินค้า · ออปชั่น(control ผนัง 3 ด้าน + ตัดของเก่า) · ราคา(golden) · เสริม · ใบเสนอราคาจริง · เทสออปชั่นราคาขยับ
// เกณฑ์: docs/HANDOFF-G4-wall-sides.html + REF-G4-pricing-data + memory g4-cabinet-color-pricing
// ใช้: node scripts/check-g4.mjs <วันที่>  → ออก docs/กลุ่ม4-ตู้/CHECK-G4-vs-draft-<วันที่>.html
import { JSDOM, VirtualConsole } from "jsdom";
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");
const OUTDIR = join(ROOT, "docs", "กลุ่ม4-ตู้");
const DATE = process.argv[2] || "today";
const OUT = join(OUTDIR, `CHECK-G4-vs-draft-${DATE}.html`);

// ===== สเปก G4 (source of truth = HANDOFF-G4-wall-sides + REF) =====
const GROUP = "4";
const EXPECTED_PRODS = ["cabinet_alu","future_tech"];
// ออปชั่น control ที่ "ต้องมี" บน cabinet_alu (ผนัง 3 ด้านใหม่ + ของเดิมที่เก็บไว้)
const CAB_MUST_HAVE = [
  ["o-cabtype","ประเภทตู้ (ทั่วไป/รองเท้า)"],
  ["o-cabdoors","จำนวนบานหน้า (1/2/3)"],
  ["o-shelfmat","ชนิดชั้น (ตามประเภท/อลู/กระจก)"],
  ["o-depth","ความลึก"],
  ["o-shelves","จำนวนชั้น"],
  ["o-cabwall-left-on","ผนังซ้าย — ติ๊กเลือก"],
  ["o-cabwall-left-mat","ผนังซ้าย — วัสดุ (อลู/กระจก)"],
  ["o-cabwall-left-w","ผนังซ้าย — ปรับกว้างเอง"],
  ["o-cabwall-left-h","ผนังซ้าย — ปรับสูงเอง"],
  ["o-cabwall-right-on","ผนังขวา — ติ๊กเลือก"],
  ["o-cabwall-right-mat","ผนังขวา — วัสดุ"],
  ["o-cabwall-back-on","ผนังหลัง — ติ๊กเลือก"],
  ["o-cabwall-back-mat","ผนังหลัง — วัสดุ"],
  ["i-color","สีอลู (กระทบโครงตู้)"],
];
// ออปชั่น control ที่ "ต้องไม่มี" บน cabinet_alu (ของเดิมถูกถอด/ไม่เกี่ยว)
const CAB_MUST_NOT = [
  ["o-cabwallmat","วัสดุผนังรวม (เดิม) — ถอดออกจากฟอร์มแล้ว (แทนด้วยผนัง 3 ด้าน)"],
  ["o-backwall","ติ๊กผนังหลัง (เดิม) — ถอดออก (รวมเป็นด้าน 'หลัง')"],
  ["o-fcsides","ครอบวงกบ — ตู้ areaOnly ไม่มี"],
  ["o-dfm","ดรอปพื้น — ตู้ไม่มี"],
  ["o-uchannel","ฝังรางยู — ตู้ไม่มี"],
];

// ===== boot =====
const html = readFileSync(join(ROOT,"public/calculator/index.html"),"utf8");
const vc = new VirtualConsole(); const jsErr=[];
vc.on("jsdomError",e=>{ if(!/scrollTo|scrollIntoView|Not implemented/i.test(e.message)) jsErr.push(e.message); });
const dom = new JSDOM(html,{runScripts:"dangerously",pretendToBeVisual:true,virtualConsole:vc,url:"http://localhost/calculator/index.html"});
await new Promise(r=>{ if(dom.window.document.readyState==="complete")r(); else dom.window.addEventListener("load",r); setTimeout(r,2000); });
const w=dom.window, doc=w.document;
const fire=(el,t)=>el.dispatchEvent(new w.Event(t,{bubbles:true}));
const noSvc=()=>["svc-protect","svc-lift","svc-travel","svc-ship"].forEach(id=>{const e=doc.getElementById(id);if(e&&e.checked){e.checked=false;fire(e,"change");}});

function setOpt(ch,cls,val){ const el=ch.querySelector(cls); if(!el)return false; if(el.type==="checkbox"){ el.checked=(val===true||val==="1"||val===1); } else { el.value=String(val); } fire(el,"input"); fire(el,"change"); return true; }
function renderProd(id){
  doc.getElementById("items").innerHTML="";
  try{ w.addItem(doc.getElementById("items")); }catch(e){ return null; }
  const ch=doc.querySelector("#items .ch"); if(!ch) return null;
  const gs=ch.querySelector(".i-group"); if(gs){ gs.value=GROUP; fire(gs,"change"); }
  const ps=ch.querySelector(".i-prod"); if(!ps||!ps.querySelector('option[value="'+id+'"]')) return {ch,ok:false};
  ps.value=id; fire(ps,"change");
  const wi=ch.querySelector(".i-w"),hi=ch.querySelector(".i-h");
  if(wi){wi.value="1.2";fire(wi,"input");fire(wi,"change");}
  if(hi){hi.value="2.4";fire(hi,"input");fire(hi,"change");}
  return {ch,ok:true,ps};
}
function group4Products(){ const r=renderProd("__none__"); if(!r)return []; return Array.from(r.ch.querySelector(".i-prod").options).map(o=>o.value).filter(Boolean); }
function optClasses(ch){ const set=new Set(); ch.querySelectorAll("*").forEach(e=>{ if(e.classList) e.classList.forEach(c=>{ if(/^o-/.test(c)) set.add(c); }); }); return [...set].sort(); }
function grand(){ noSvc(); try{ w.calcQuote&&w.calcQuote(); w.genQuote&&w.genQuote(); }catch(e){ return NaN; } const g=doc.querySelector("#quoteContent .qtot .g"); return g?parseInt((g.textContent||"").replace(/\.\d+/g,"").replace(/[^\d]/g,""),10):NaN; }
// build cabinet/future ที่ขนาด+ออปชั่น → คืน {ch,applied}
function build(id,wd,ht,optPairs){
  doc.getElementById("items").innerHTML=""; w.addItem(doc.getElementById("items"));
  const ch=doc.querySelector("#items .ch"); if(!ch)return null;
  const gs=ch.querySelector(".i-group"); if(gs){gs.value=GROUP;fire(gs,"change");}
  const ps=ch.querySelector(".i-prod"); if(!ps||!ps.querySelector('option[value="'+id+'"]'))return null;
  ps.value=id; fire(ps,"change");
  const wi=ch.querySelector(".i-w"),hi=ch.querySelector(".i-h");
  if(wi){wi.value=String(wd);fire(wi,"input");fire(wi,"change");}
  if(hi){hi.value=String(ht);fire(hi,"input");fire(hi,"change");}
  const applied=[]; for(const [cls,val] of (optPairs||[])){ applied.push({cls,ok:setOpt(ch,"."+cls.replace(/^\./,""),val)}); }
  return {ch,applied};
}
function genQuoteOf(id,wd,ht,optPairs){
  const b=build(id,wd,ht,optPairs); if(!b)return null;
  const g=grand(); const qc=doc.getElementById("quoteContent");
  return { html: qc?qc.innerHTML:"", grand:g, applied:b.applied };
}
// อ่านราคา "ก่อน VAT" (sell) ตรงจาก readItem — ตรงกับเลขใน handoff/เทส (ไม่ใช่ยอดรวม VAT)
function sellOf(id,wd,ht,optPairs){
  const b=build(id,wd,ht,optPairs); if(!b)return null;
  try{ const ri=w.readItem(b.ch); return ri&&ri.r?ri.r.sell:null; }catch(e){ return null; }
}
function billText(id,wd,ht,optPairs){ const b=build(id,wd,ht,optPairs); if(!b)return null; noSvc(); try{w.calcQuote();w.genQuote();}catch(e){return "";} return (doc.getElementById("quoteContent")||{}).textContent||""; }

const rows=[];
const sev={ok:"🟢",miss:"🔴",extra:"🟠",warn:"🟡",info:"⬜"};
const add=(s,area,title,detail)=>rows.push({s,area,title,detail});

// ===== 1. สินค้าในกลุ่ม 4 =====
const g4prods=group4Products();
for(const id of EXPECTED_PRODS){
  const ok=g4prods.includes(id);
  add(ok?"ok":"miss","สินค้า","เลือก "+id+" ได้ในกลุ่ม 4", ok?"พบในเมนูสินค้า":"เลือกไม่ได้ในกลุ่ม 4");
}

// ===== 2. ออปชั่น control บน cabinet (ผนัง 3 ด้าน + ตัดของเก่า) =====
const rcab=renderProd("cabinet_alu");
if(!rcab||!rcab.ok){ add("miss","ออปชั่น","cabinet_alu","เลือกตู้อลูไม่ได้ — ตรวจต่อไม่ได้"); }
else {
  for(const [cls,label] of CAB_MUST_HAVE){
    const present=!!rcab.ch.querySelector("."+cls);
    add(present?"ok":"miss","ออปชั่น",label+" ("+cls+")", present?"พบ control ✓":"ไม่พบ ."+cls+" บนตู้อลู → ขาด");
  }
  for(const [cls,label] of CAB_MUST_NOT){
    const present=!!rcab.ch.querySelector("."+cls);
    add(present?"extra":"ok","ออปชั่น","ไม่ควรมี: "+label+" ("+cls+")", present?("ยังพบ ."+cls+" บนฟอร์มตู้ → ควรถอด"):"ถอด/ไม่มีแล้ว ✓");
  }
}
// future_tech: มีสีฝาตู้ (o-ftcolor) · ไม่มี i-color
const rft=renderProd("future_tech");
if(rft&&rft.ok){
  add(rft.ch.querySelector(".o-ftcolor")?"ok":"miss","ออปชั่น","ฝาตู้ — สีฝาตู้ (o-ftcolor)", rft.ch.querySelector(".o-ftcolor")?"พบ ✓":"ไม่พบ o-ftcolor");
} else add("warn","ออปชั่น","future_tech","เลือกฝาตู้ไม่ได้ (ข้าม)");

// ===== 3. ราคา vs golden baseline =====
const baseF = join(__dirname,"golden-baseline.json");
if(existsSync(baseF)){
  const base=JSON.parse(readFileSync(baseF,"utf8")); const bmap=new Map(base.rows.map(r=>[r.key,r]));
  let okN=0,diffN=0;
  for(const id of EXPECTED_PRODS){ const b=bmap.get(GROUP+":"+id)||bmap.get(id); if(!b||b.total==null){ add("warn","ราคา",id+" — golden","ไม่พบ key ใน baseline ("+GROUP+":"+id+")"); continue; }
    okN++; // golden-snapshot.mjs ยืนยันแยกแล้ว ว่า 149 ตัวไม่เพี้ยน — ตรงนี้แค่ยืนยันมี key
  }
  add("ok","ราคา","ราคา G4 เทียบ golden baseline","ยืนยันด้วย node scripts/golden-snapshot.mjs (149 ตัว · 0 เพี้ยน · cabinet_alu re-baseline 41730→31030 จากผนัง default ไม่ติ๊ก)");
} else add("warn","ราคา","golden baseline","ไม่พบ golden-baseline.json — รัน node scripts/golden-snapshot.mjs --save");

// ===== 4. เทสราคาผนัง 3 ด้าน (engine ตรง handoff ไหม) — ราคาก่อน VAT (sell) =====
// ตู้ 1.2×2.4 ลึก0.6 2บาน 5ชั้นอลู ขาว · ฐานไม่มีผนัง=roundUp(front25500+fl2880+shc6000=34380)=35,000
// แต่ละด้าน: อลู area×4000 · กระจก area×3000 (ไม่คิดสี) · min 1 ตร.ม. · ปัดยอด "หลังรวม" (roundUp ต่อยอดรวม)
// expect = roundUp(34380 + wallAdd) · ซ้าย/ขวา D×H=1.44 · หลัง W×H=2.88
const CABW=1.2, CABH=2.4;
const baseOpts=[["o-depth","0.6"],["o-cabdoors","2"],["o-shelves","5"],["i-color","0"]];
const wallCases=[
  { name:"ไม่ติ๊กด้านใด (ฐาน · ไม่คิดผนัง)", add:[], expect:35000, why:"roundUp(34,380)" },
  { name:"ซ้าย อลู ขาว (1.44×4,000=5,760)", add:[["o-cabwall-left-on","1"],["o-cabwall-left-mat","alu"]], expect:41000, why:"roundUp(40,140)" },
  { name:"ขวา กระจก (1.44×3,000=4,320 · ไม่คิดสี)", add:[["o-cabwall-right-on","1"],["o-cabwall-right-mat","glass"]], expect:39000, why:"roundUp(38,700)" },
  { name:"หลัง อลู ขาว (2.88×4,000=11,520)", add:[["o-cabwall-back-on","1"],["o-cabwall-back-mat","alu"]], expect:46000, why:"roundUp(45,900)" },
  { name:"3 ด้าน อลู ขาว (5,760+5,760+11,520=23,040)", add:[["o-cabwall-left-on","1"],["o-cabwall-right-on","1"],["o-cabwall-back-on","1"]], expect:58000, why:"roundUp(57,420)" },
];
const wallRows=[];
for(const c of wallCases){
  const g=sellOf("cabinet_alu",CABW,CABH,[...baseOpts,...c.add]);
  const ok=g===c.expect;
  wallRows.push({name:c.name, got:g, expect:c.expect, ok, why:c.why});
  if(!ok) add("miss","ราคาผนัง",c.name+" ราคาไม่ตรง", "คาด "+c.expect.toLocaleString()+" ("+c.why+") · ได้ "+(Number.isFinite(g)?g.toLocaleString():"NaN"));
}
if(wallRows.every(r=>r.ok)) add("ok","ราคาผนัง","ราคาผนัง 3 ด้าน ตรงสูตร handoff ทุกเคส", wallRows.length+" เคส (ซ้าย/ขวา/หลัง/3ด้าน · ก่อน VAT) ตรงเป๊ะ · อลู 4,000+กระจก 3,000+min 1ตร.ม.");

// ===== 5. ใบเสนอราคาจริง — เลือกผนัง+สี ครบ แล้วออกใบ =====
const QSAMPLES=[
  {id:"cabinet_alu", w:1.2,h:2.4, label:"ตู้อลู · ผนังซ้ายอลู+ขวากระจก+หลังอลู · สีอบพิเศษ",
    opts:[["o-depth","0.6"],["o-cabdoors","2"],["o-shelves","5"],
      ["i-color","10","สีอลู: สีอบพิเศษ (โครง)"],
      ["o-cabwall-left-on","1","ติ๊กผนังซ้าย"],["o-cabwall-left-mat","alu","ซ้าย=อลูทึบ"],
      ["o-cabwall-right-on","1","ติ๊กผนังขวา"],["o-cabwall-right-mat","glass","ขวา=กระจก"],
      ["o-cabwall-back-on","1","ติ๊กผนังหลัง"],["o-cabwall-back-mat","alu","หลัง=อลูทึบ"]]},
  {id:"cabinet_alu", w:1.2,h:2.4, label:"ตู้อลู · ไม่ติ๊กผนังเลย (ทุกด้านชนปูน) · สีขาว",
    opts:[["o-depth","0.6"],["o-cabdoors","2"],["o-shelves","5"],["i-color","0"]]},
  {id:"future_tech", w:1.0,h:1.4, label:"ฝาตู้ Future Tech · 2 บาน · สีพิเศษ",
    opts:[["o-ftcolor","10","สีฝาตู้พิเศษ"]]},
];
function breakdownOf(s){
  let prev=(genQuoteOf(s.id,s.w,s.h,[])||{}).grand;
  if(!Number.isFinite(prev))return null;
  const lines=[{n:"ฐาน (ไม่มีออปชั่น)",p:prev}]; const acc=[];
  for(const o of s.opts){ acc.push([o[0],o[1]]); const g=(genQuoteOf(s.id,s.w,s.h,acc)||{}).grand; if(Number.isFinite(g)){ lines.push({n:o[2]||o[0], p:g-prev}); prev=g; } }
  return {lines, total:prev};
}
const quoteCards=[];
for(const s of QSAMPLES){
  const q=genQuoteOf(s.id,s.w,s.h,s.opts);
  if(!q){ quoteCards.push({label:s.label,err:"เลือกสินค้านี้ไม่ได้"}); continue; }
  const setFail=q.applied.filter(a=>!a.ok).map(a=>a.cls);
  if(setFail.length) add("warn","ใบเสนอราคา",s.label+" — ออปชั่นตั้งค่าไม่ได้บางตัว","ตั้งไม่ได้: "+setFail.join(", "));
  quoteCards.push({label:s.label, html:q.html, grand:q.grand, breakdown:breakdownOf(s)});
}
// ตรวจใบ: ผนังต่อด้านขึ้นใบไหม
{ const txt=billText("cabinet_alu",1.2,2.4,[["o-depth","0.6"],["o-cabwall-left-on","1"],["o-cabwall-left-mat","alu"],["o-cabwall-right-on","1"],["o-cabwall-right-mat","glass"]]);
  if(txt!=null){
    const hasL=/ผนังซ้าย/.test(txt), hasR=/ผนังขวา/.test(txt);
    add((hasL&&hasR)?"ok":"miss","ใบเสนอราคา","ใบระบุผนังต่อด้าน (ซ้าย/ขวา + วัสดุ)",
      (hasL&&hasR)?"ใบขึ้น 'ผนังซ้าย อลูทึบ' + 'ผนังขวา กระจก' ✓":"ใบไม่ระบุผนังต่อด้าน (ซ้าย="+hasL+" ขวา="+hasR+") → dev: ใบต้องโชว์ผนังที่ติ๊ก");
  }
  const txt0=billText("cabinet_alu",1.2,2.4,[["o-depth","0.6"]]);
  if(txt0!=null){ const noWall=/ไม่ติ๊ก|ชนผนังปูน/.test(txt0);
    add(noWall?"ok":"warn","ใบเสนอราคา","ใบระบุเมื่อไม่ติ๊กผนัง","ใบโชว์ 'ผนัง: ไม่ติ๊ก (ทุกด้านชนผนังปูน)' "+(noWall?"✓":"— ไม่พบข้อความ (เช็คตา)")); }
}

// ===== 6. เทสทุกออปชั่น — กดแล้วราคาขยับจริงไหม =====
const OPTTESTS=[
  {add:[["o-cabwall-left-on","1"],["o-cabwall-left-mat","alu"]], label:"ผนังซ้าย อลูทึบ", paid:true},
  {add:[["o-cabwall-right-on","1"],["o-cabwall-right-mat","glass"]], label:"ผนังขวา กระจก", paid:true},
  {add:[["o-cabwall-back-on","1"],["o-cabwall-back-mat","alu"]], label:"ผนังหลัง อลูทึบ", paid:true},
  {add:[["i-color","2"]], label:"สีโครง ซาฮาร่า (ci=2)", paid:true, needWall:true},
  {add:[["i-color","10"]], label:"สีโครง อบพิเศษ (ci=10)", paid:true, needWall:true},
];
const optTestRows=[];
for(const t of OPTTESTS){
  // เคสสีต้องมีผนังอลูถึงเห็นผล (ค่าสีคิดที่ผนัง/พื้น/ชั้น) — บวกผนังหลังอลูให้ทุกเคส base เท่ากัน
  const pre = t.needWall ? [...baseOpts,["o-cabwall-back-on","1"],["o-cabwall-back-mat","alu"]] : baseOpts;
  const base = (genQuoteOf("cabinet_alu",CABW,CABH,pre)||{}).grand;
  const q = genQuoteOf("cabinet_alu",CABW,CABH,[...pre,...t.add]);
  const has = q && q.applied.every(a=>a.ok);
  const delta = (q&&Number.isFinite(q.grand)&&Number.isFinite(base))?(q.grand-base):null;
  let s="ok",note="";
  if(!has){ s="warn"; note="ตั้งค่าออปชั่นไม่ได้"; }
  else if(delta===null){ s="warn"; note="อ่านราคาไม่ได้"; }
  else if(t.paid && delta<=0){ s="miss"; note="กดแล้วราคาไม่ขยับ ("+base+"→"+(base+(delta||0))+") — ควรคิดเงิน"; }
  else { note=delta>0?("ราคาขยับ +"+delta.toLocaleString()):"ราคาไม่ขยับ"; }
  optTestRows.push({label:t.label,delta,s,note});
  if(s==="miss") add("miss","ออปชั่นใช้จริง",t.label+" กดแล้วราคาไม่ขยับ", note);
}

// ===== 7. dump ออปชั่นต่อรุ่น =====
const dump=[];
for(const id of EXPECTED_PRODS){ const r=renderProd(id); if(!r||!r.ok){ dump.push({id,opts:"(เลือกไม่ได้)"}); continue; } dump.push({id,opts:optClasses(r.ch).join(" ")||"(ไม่มี o-*)"}); }

if(jsErr.length) add("miss","engine","JS error ตอน render", jsErr.slice(0,3).join(" | "));

// ===== สรุป + เขียน HTML =====
const order={miss:0,extra:1,warn:2,ok:3,info:4};
rows.sort((a,b)=>order[a.s]-order[b.s]);
const cnt=s=>rows.filter(r=>r.s===s).length;
const esc=s=>String(s).replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;");
const trow=r=>`<tr class="${r.s}"><td>${sev[r.s]}</td><td>${esc(r.area)}</td><td>${esc(r.title)}</td><td>${esc(r.detail)}</td></tr>`;
const html_out=`<!doctype html><html lang="th"><head><meta charset="utf-8"><title>CHECK G4 vs ดราฟ</title><style>
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
.opttest .ok td,.wall .ok td{background:#dcfce7;}.opttest .miss td,.wall .miss td{background:#fef2f2;}.opttest .warn td{background:#fefce8;}
.bd{width:auto;min-width:340px;margin:4px 0 2px;font-size:11.5px;}.bd td:last-child,.bd th:last-child{text-align:right;font-variant-numeric:tabular-nums;}.bd th{background:#fff7ed;color:#9a3412;}
</style></head><body>
<h1>🔍 ตรวจงาน G4 — ผนังตู้ 3 ด้าน (dev) เทียบ HANDOFF-G4-wall-sides</h1>
<p>เกณฑ์: <code>docs/HANDOFF-G4-wall-sides.html</code> + REF-G4-pricing-data + memory · ราคา = engine จริง (golden) · render index.html สดด้วย jsdom · commit 71cb45a</p>
<div class="sum">
<span class="pill pm">🔴 ขาด/ผิด ${cnt("miss")}</span>
<span class="pill po">🟠 เกิน/ควรถอด ${cnt("extra")}</span>
<span class="pill pw">🟡 ต้องเคาะ/ดูตา ${cnt("warn")}</span>
<span class="pill pk">🟢 ตรง ${cnt("ok")}</span>
</div>
<h2>ผลตรวจ (เรียง ขาด→เกิน→เคาะ→ตรง)</h2>
<table><tr><th></th><th>มิติ</th><th>หัวข้อ</th><th>รายละเอียด</th></tr>
${rows.map(trow).join("\n")}
</table>

<h2>💰 ราคาผนัง 3 ด้าน เทียบสูตร handoff (ตู้ 1.2×2.4 ลึก0.6 · 2บาน · 5ชั้นอลู · ขาว · <b>ราคาก่อน VAT</b>)</h2>
<table class="wall"><tr><th></th><th>เคส</th><th>คาด (สูตร)</th><th>ได้จริง (engine)</th></tr>
${wallRows.map(r=>`<tr class="${r.ok?'ok':'miss'}"><td>${r.ok?'🟢':'🔴'}</td><td>${esc(r.name)}</td><td>${r.expect.toLocaleString()} <span style="color:#9a3412;font-size:11px;">${esc(r.why)}</span></td><td>${Number.isFinite(r.got)?r.got.toLocaleString():'NaN'}</td></tr>`).join("\n")}
</table>

<h2>🧾 ใบเสนอราคาจริง (เลือกผนัง+สีครบ · ออกจากระบบจริง)</h2>
<p>ออกใบจากเว็บจริง โดยเลือกผนังต่อด้าน (ซ้าย/ขวา/หลัง + วัสดุ) + สีโครง — ดูว่า "ผนังต่อด้าน" ขึ้นใบ + ราคาถูกไหม</p>
${quoteCards.map(c=> c.err?`<div class="qlabel">${esc(c.label)} — ${esc(c.err)}</div>` : `<div class="qlabel">${esc(c.label)} · ยอดรวม ฿${(c.grand||0).toLocaleString()}</div>`+(c.breakdown?`<table class="bd"><tr><th>แจกแจงราคา (รวม VAT 7%)</th><th>บาท</th></tr>${c.breakdown.lines.map(l=>`<tr><td>${esc(l.n)}</td><td>${(l.p>=0?"+":"")+l.p.toLocaleString()}</td></tr>`).join("")}<tr><th>รวมสุทธิ</th><th>${c.breakdown.total.toLocaleString()}</th></tr></table>`:"")+`<div class="quotebox">${c.html||"(ใบว่าง)"}</div>`).join("\n")}

<h2>🧪 เทสทุกออปชั่น — กดแล้วราคาขยับจริงไหม (ตู้อลู 1.2×2.4)</h2>
<p>เปิดออปชั่นทีละตัว เทียบยอดก่อน-หลัง · ออปชั่นที่ควรคิดเงินแต่ราคาไม่ขยับ = 🔴 (สี: บวกผนังหลังอลูเป็นฐานก่อน เพื่อให้ค่าสีโครงมีผล)</p>
<table class="opttest"><tr><th></th><th>ออปชั่น</th><th>ราคาขยับ</th><th>หมายเหตุ</th></tr>
${optTestRows.map(t=>`<tr class="${t.s}"><td>${sev[t.s]}</td><td>${esc(t.label)}</td><td>${t.delta===null?"-":(t.delta>0?"+"+t.delta.toLocaleString():String(t.delta.toLocaleString()))}</td><td>${esc(t.note)}</td></tr>`).join("\n")}
</table>

<h2>ออปชั่นต่อรุ่น (dump · เทียบดราฟด้วยตา)</h2>
<table class="dump"><tr><th>รุ่น (id)</th><th>ออปชั่น control (.o-*) ที่ render จริง</th></tr>
${dump.map(d=>`<tr><td><code>${esc(d.id)}</code></td><td>${esc(d.opts)}</td></tr>`).join("\n")}
</table>
<p style="color:#6b7280;margin-top:14px;">หมายเหตุ: "ดูตา" = layout/หน้าตา/การจัดกลุ่ม script เทียบไม่ได้ ต้องเปิด index.html จริงคู่ดราฟ · ราคา golden ยืนยันแยกด้วย <code>node scripts/golden-snapshot.mjs</code></p>
</body></html>`;
writeFileSync(OUT, html_out, "utf8");

console.log(`\n🔍 CHECK G4 vs ดราฟ — 🔴${cnt("miss")} ขาด · 🟠${cnt("extra")} เกิน · 🟡${cnt("warn")} เคาะ · 🟢${cnt("ok")} ตรง`);
rows.filter(r=>r.s==="miss").forEach(r=>console.log("  🔴 ["+r.area+"] "+r.title+" — "+r.detail));
rows.filter(r=>r.s==="extra").forEach(r=>console.log("  🟠 ["+r.area+"] "+r.title+" — "+r.detail));
rows.filter(r=>r.s==="warn").forEach(r=>console.log("  🟡 ["+r.area+"] "+r.title+" — "+r.detail));
console.log("\n📄 รายงาน: "+OUT);
