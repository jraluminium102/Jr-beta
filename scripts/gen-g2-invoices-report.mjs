// gen-g2-invoices-report.mjs — render ใบเสนอราคา G2 จริง (หลายแบบ) → หน้า report กดดู + dump วิเคราะห์
// READ-ONLY · รัน: node scripts/gen-g2-invoices-report.mjs → docs/กลุ่ม2-.../REPORT-ใบจริง-G2-2026-06-22.html
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
function setOpt(ch,c,v){ const el=ch.querySelector("."+c); if(!el)return false; if(el.type==="checkbox")el.checked=(v==="1"||v===true); else el.value=String(v); fire(el,"input");fire(el,"change"); return true; }
function one(id,wd,ht,opts,split){
  doc.getElementById("items").innerHTML=""; w.addItem(doc.getElementById("items")); let ch=doc.querySelector("#items .ch");
  const gs=ch.querySelector(".i-group"); gs.value="2"; fire(gs,"change");
  try{ w.g3SyncProd(ch,id); }catch(e){}
  ch=doc.querySelector("#items .ch");
  const wi=ch.querySelector(".i-w"),hi=ch.querySelector(".i-h"); if(wi){wi.value=wd;fire(wi,"input");} if(hi){hi.value=ht;fire(hi,"input");}
  (opts||[]).forEach(([c,v])=>setOpt(ch,c,v));
  ["svc-protect","svc-lift","svc-travel","svc-ship"].forEach(i=>{const e=doc.getElementById(i);if(e&&e.checked){e.checked=false;fire(e,"change");}});
  w.qSplit=!!split; w.calcQuote(); w.genQuote();
  const qc=doc.getElementById("quoteContent");
  return {html:qc?qc.innerHTML:"(ไม่มีใบ)", text:qc?[...qc.querySelectorAll("tr,div.qtot,.l,.g")].map(e=>e.textContent.replace(/\s+/g," ").trim()).filter(Boolean):[]};
}
const S=[
 {t:"① ประตูรั้ว · รางตรง + มอเตอร์1 + สายไฟ + สีอบขาว", id:"fence_gate", w:"1.8", h:"2.0", o:[["o-railtype","straight"],["o-gmotor","1"],["o-motorwire","เดินสายไฟจากตู้ควบคุม 15 ม."],["o-motorwireprice","8000"]], split:1},
 {t:"① ประตูรั้ว · รางโค้ง + มอเตอร์2 + สีอบพิเศษ + OPTION ลายไม้", id:"fence_gate", w:"3.6", h:"2.4", o:[["o-railtype","curved"],["o-gmotor","2"],["o-gfin","อบสีพิเศษ"],["o-gatewood","19500"]], split:1},
 {t:"① ประตูรั้ว · ใช้รางเดิม + ไม่มีมอเตอร์ (เล็ก 0.9×2.0)", id:"fence_gate", w:"0.9", h:"2.0", o:[["o-railtype","straight"],["o-railreuse","reuse"],["o-gmotor","0"]], split:1},
 {t:"② ระแนงบังตา rn2 รวมโครง (ไม่ split)", id:"rn2", w:"3.0", h:"2.0", o:[], split:0},
 {t:"② ระแนงบังตา rn14 นิ้ว (split)", id:"rn14", w:"2.4", h:"2.2", o:[], split:1},
 {t:"② ระแนงผนัง rn37", id:"rn37", w:"2.4", h:"2.2", o:[], split:1},
 {t:"② เกล็ด Z rn85 + ทิศแนวตั้ง", id:"rn85", w:"2.0", h:"2.0", o:[["o-grdir","แนวตั้ง"]], split:1},
 {t:"② ระแนง ทำเป็นบานเปิดยูโร 2 บาน", id:"rn2", w:"3.0", h:"2.2", o:[["o-doortype","casement_euro"],["i-panels","2"]], split:1},
 {t:"② ระแนง ทำเป็นบานเฟี้ยม 3 บาน", id:"rn2", w:"3.6", h:"2.2", o:[["o-doortype","folding"],["i-panels","3"]], split:1},
 {t:"② ระแนง ทำเป็นบานเลื่อน SMS", id:"rn2", w:"3.0", h:"2.2", o:[["o-doortype","sliding_sms"],["i-panels","2"]], split:1},
 {t:"③ ราวกันตก imp1 เฉียง หมุด (กระจกอย่างเดียว)", id:"imp1", w:"6", h:"1.1", o:[], split:1},
 {t:"③ ราวกันตก imp3 เสาตั้ง+ราวจับอลู + ราวจับกล่อง + สีดำ", id:"imp3", w:"6", h:"1.1", o:[["o-handrail","box"],["o-railalucolor","สีดำ"]], split:1},
 {t:"③ ราวกันตก imp5 ตรง ยูเหล็ก + กระจก12มม.", id:"imp5", w:"4", h:"1.1", o:[["o-railglass","12"]], split:1},
 {t:"④ ระแนงพิเศษ bar_openclose + มอเตอร์ปรับมุม + สายไฟ", id:"bar_openclose", w:"2.4", h:"2.2", o:[["o-bocmotor","1"],["o-motorwire","เดินสายไฟ 10 ม."],["o-motorwireprice","6000"]], split:1},
 {t:"④ ระแนงพิเศษ bar_grid_z เกล็ดอลู ติดตาย", id:"bar_grid_z", w:"2.4", h:"2.2", o:[], split:1},
 {t:"④ ระแนงเลื่อน bar_slide + ทำเป็นบานเลื่อน SMS", id:"bar_slide", w:"3.0", h:"2.2", o:[["o-bsdoor","sliding_sms"]], split:1},
];
let body="";
for(const s of S){
  const r=one(s.id,s.w,s.h,s.o,s.split);
  console.log("\n===== "+s.t+" =====");
  r.text.forEach(t=>console.log("  "+t));
  body+='<div class="samp"><div class="st">'+s.t+(s.split?' · [แยกราคา ON]':'')+'</div><div class="inv">'+r.html+'</div></div>';
}
console.log("\nJS errors:", jsErrs.length?jsErrs.join(" | "):"(ไม่มี)");
const out='<!DOCTYPE html><html lang="th"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">'+
'<title>ใบเสนอราคา G2 จริง — ทุกแบบ (เทส) · 22 มิ.ย.</title><style>'+
'body{font-family:-apple-system,"Segoe UI","Sarabun",Tahoma,sans-serif;margin:0;background:#eef0f3;color:#1f2937;}'+
'.hd{background:#b3122a;color:#fff;padding:14px 18px;font-weight:700}'+
'.wrap{max-width:900px;margin:0 auto;padding:16px 12px 60px}'+
'.samp{background:#fff;border:1px solid #ddd;border-radius:10px;margin:14px 0;overflow:hidden}'+
'.st{background:#fdecef;color:#b3122a;font-weight:700;font-size:13.5px;padding:9px 13px;border-bottom:1px solid #f0d0d6}'+
'.inv{padding:12px 14px;font-size:13px}'+
'table.qt{width:100%;border-collapse:collapse;font-size:12.5px}'+
'table.qt th{background:#b3122a;color:#fff;padding:6px 8px;text-align:left;font-weight:600}'+
'table.qt td{border-bottom:1px solid #eee;padding:6px 8px;vertical-align:top}'+
'table.qt .r{text-align:right;white-space:nowrap}'+
'.qmeta{margin:8px 0;font-size:12px;color:#444}.qtot,.l,.g{display:flex;justify-content:space-between;padding:2px 0;font-size:12.5px}.g{font-weight:700;color:#b3122a;border-top:1px solid #b3122a;margin-top:4px;padding-top:4px}'+
'.q-bd{margin:6px 0 2px 8px;border:1px solid #ecd4d8;border-radius:7px;overflow:hidden;max-width:360px}'+
'</style></head><body><div class="hd">ใบเสนอราคา G2 จริง (engine render) — '+S.length+' แบบ · 22 มิ.ย. · สำหรับไล่หาข้อผิด</div><div class="wrap">'+body+'</div></body></html>';
writeFileSync(join(ROOT,"docs/กลุ่ม2-รั้วระแนงราวกันตก/REPORT-ใบจริง-G2-2026-06-22.html"), out, "utf8");
console.log("\nReport: docs/กลุ่ม2-รั้วระแนงราวกันตก/REPORT-ใบจริง-G2-2026-06-22.html");
process.exit(0);
