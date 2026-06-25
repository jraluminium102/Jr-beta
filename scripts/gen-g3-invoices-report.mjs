// gen-g3-invoices-report.mjs — render ใบเสนอราคา G3 (หลังคา) จริง "ใบเดียว" รวมทุกแบบ → report กดดู
// READ-ONLY · รัน: node scripts/gen-g3-invoices-report.mjs → docs/กลุ่ม3-หลังคากันสาดฝ้า/REPORT-ใบจริง-G3-2026-06-23.html
import { JSDOM, VirtualConsole } from "jsdom";
import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
const ROOT = join(dirname(fileURLToPath(import.meta.url)),"..");
const html = readFileSync(join(ROOT,"public/calculator/index.html"),"utf8");
const jsErrs=[]; const vc=new VirtualConsole(); vc.on("jsdomError",e=>{ if(!/scrollTo/.test(e&&e.message||""))jsErrs.push(e&&e.message); });
const dom=new JSDOM(html,{runScripts:"dangerously",pretendToBeVisual:true,virtualConsole:vc,url:"http://localhost/calculator/index.html"});
await new Promise(r=>{ if(dom.window.document.readyState==="complete")r(); else dom.window.addEventListener("load",r); setTimeout(r,2500); });
const w=dom.window, doc=w.document;
const fire=(el,t)=>el.dispatchEvent(new w.Event(t,{bubbles:true}));
function setOpt(ch,c,v){
  if(c==="_coOverride"){ ch.dataset.coOverride=String(v); return true; }      // L2: กัน global sync ทับสีรายการ
  const el=ch.querySelector("."+c); if(!el)return false;
  if(el.type==="checkbox")el.checked=(v==="1"||v===true); else el.value=String(v);
  fire(el,"input");fire(el,"change"); return true;
}
function addRow(id,wd,ht,opts){
  const items=doc.getElementById("items"); w.addItem(items);
  let ch=[...doc.querySelectorAll("#items .ch")].pop();
  const gs=ch.querySelector(".i-group"); gs.value="3"; fire(gs,"change");
  try{ w.g3SyncProd(ch,id); }catch(e){}
  ch=[...doc.querySelectorAll("#items .ch")].pop();
  const wi=ch.querySelector(".i-w"),hi=ch.querySelector(".i-h"); if(wi){wi.value=wd;fire(wi,"input");} if(hi){hi.value=ht;fire(hi,"input");}
  (opts||[]).forEach(([c,v])=>setOpt(ch,c,v));
  w.calcQuote && w.calcQuote();   // recalc หลังตั้ง coOverride+สี
}
const S=[
 {t:"หลังคาโพลีตัน 4×3 พื้นฐาน (สีอบขาว · ฟรี)", id:"roof_polyton", w:"4", h:"3", o:[]},
 {t:"หลังคาโพลีตัน + L2 สีโครงเทาซาฮาร่า (เฉพาะข้อ · บวกยอด)", id:"roof_polyton", w:"4", h:"3", o:[["_coOverride","1"],["i-color","2"]]},
 {t:"หลังคาโพลีตัน + L3 เทียบราคาสีโครง→เทาซาฮาร่า (OPTION ไม่บวก)", id:"roof_polyton", w:"4", h:"3", o:[["o-rfcoopt","2"]]},
 {t:"หลังคาไวนิล + เสา4\" กลม 2 ต้น + รางน้ำ", id:"roof_vinyl", w:"4", h:"3", o:[["o-rfpole15","2"],["o-roofend","รางน้ำ"]]},
 {t:"หลังคาเมทัลชีท imp7 (PVC EPS 1\")", id:"imp7", w:"4", h:"3", o:[]},
 {t:"หลังคาชินโคไลท์ imp15 (Heat Cut 6มม.)", id:"imp15", w:"4", h:"3", o:[]},
 {t:"หลังคาโพลีตัน + ฝ้าในตัว (แยกรายการ)", id:"roof_polyton", w:"4", h:"3", o:[["o-ceilmode","sep"]]},
];
doc.getElementById("items").innerHTML="";
for(const s of S) addRow(s.id,s.w,s.h,s.o);
["svc-protect","svc-lift","svc-travel","svc-ship"].forEach(i=>{const e=doc.getElementById(i);if(e&&e.checked){e.checked=false;fire(e,"change");}});
w.qSplit=true; w.calcQuote(); w.genQuote();
const qc=doc.getElementById("quoteContent");
const invHTML=qc?qc.innerHTML:"(ไม่มีใบ)";
console.log("\n===== ใบเสนอราคา G3 รวม "+S.length+" รายการ (ใบเดียว) =====");
const rows=qc?[...qc.querySelectorAll("table.qt tbody tr")]:[];
console.log("จำนวนแถวในใบ:", rows.length, "(ควร = "+S.length+")");
console.log("JS errors:", jsErrs.length?jsErrs.join(" | "):"(ไม่มี)");
const legend='<ol style="margin:0;padding-left:20px;font-size:12px;color:#444;columns:2;column-gap:24px">'+S.map(s=>'<li style="margin:2px 0">'+s.t+'</li>').join("")+'</ol>';
const out='<!DOCTYPE html><html lang="th"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">'+
'<title>ใบเสนอราคา G3 หลังคา รวมใบเดียว — '+S.length+' รายการ · 23 มิ.ย.</title><style>'+
'body{font-family:-apple-system,"Segoe UI","Sarabun",Tahoma,sans-serif;margin:0;background:#eef0f3;color:#1f2937;}'+
'.hd{background:#b3122a;color:#fff;padding:14px 18px;font-weight:700}'+
'.wrap{max-width:900px;margin:0 auto;padding:16px 12px 60px}'+
'.card{background:#fff;border:1px solid #ddd;border-radius:10px;margin:14px 0;overflow:hidden}'+
'.ct{background:#fdecef;color:#b3122a;font-weight:700;font-size:13.5px;padding:9px 13px;border-bottom:1px solid #f0d0d6}'+
'.cb{padding:12px 14px;font-size:13px}'+
'table.qt{width:100%;border-collapse:collapse;font-size:12.5px}'+
'table.qt th{background:#b3122a;color:#fff;padding:6px 8px;text-align:left;font-weight:600}'+
'table.qt td{border-bottom:1px solid #eee;padding:6px 8px;vertical-align:top}'+
'table.qt .r{text-align:right;white-space:nowrap}'+
'.qmeta{margin:8px 0;font-size:12px;color:#444}.qtot,.l,.g{display:flex;justify-content:space-between;padding:2px 0;font-size:12.5px}.g{font-weight:700;color:#b3122a;border-top:1px solid #b3122a;margin-top:4px;padding-top:4px}'+
'.q-bd{margin:6px 0 2px 8px;border:1px solid #ecd4d8;border-radius:7px;overflow:hidden;max-width:360px}'+
'</style></head><body><div class="hd">ใบเสนอราคา G3 หลังคา — รวม '+S.length+' รายการในใบเดียว (engine render) · 23 มิ.ย.</div><div class="wrap">'+
'<div class="card"><div class="ct">📄 ใบเสนอราคา (ใบจริงจาก engine · แยกราคา ON)</div><div class="cb">'+invHTML+'</div></div>'+
'<div class="card"><div class="ct">รายการในใบ (ลำดับตรงกับใบด้านบน)</div><div class="cb">'+legend+'</div></div>'+
'</div></body></html>';
writeFileSync(join(ROOT,"docs/กลุ่ม3-หลังคากันสาดฝ้า/REPORT-ใบจริง-G3-2026-06-23.html"), out, "utf8");
console.log("\nReport: docs/กลุ่ม3-หลังคากันสาดฝ้า/REPORT-ใบจริง-G3-2026-06-23.html");
process.exit(0);
