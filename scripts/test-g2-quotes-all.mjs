// test-g2-quotes-all.mjs — render ใบเสนอราคา G2 ครบ 4 ปุ่ม ทุกแบบ (≥10) + ตรวจความผิดปกติอัตโนมัติ
// READ-ONLY: อ่าน index.html ผ่าน jsdom · ไม่แก้ไฟล์ · รัน: node scripts/test-g2-quotes-all.mjs
import { JSDOM, VirtualConsole } from "jsdom";
import { readFileSync } from "node:fs";
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
function build(id,wd,ht,opts){
  doc.getElementById("items").innerHTML=""; w.addItem(doc.getElementById("items")); const ch=doc.querySelector("#items .ch");
  const gs=ch.querySelector(".i-group"); gs.value="2"; fire(gs,"change");
  const ps=ch.querySelector(".i-prod"); const ok=!!(ps&&ps.querySelector('option[value="'+id+'"]'));
  if(ok){ ps.value=id; fire(ps,"change"); }
  const wi=ch.querySelector(".i-w"),hi=ch.querySelector(".i-h"); if(wi){wi.value=wd;fire(wi,"input");} if(hi){hi.value=ht;fire(hi,"input");}
  (opts||[]).forEach(([c,v])=>setOpt(ch,c,v));
  ["svc-protect","svc-lift","svc-travel","svc-ship"].forEach(i=>{const e=doc.getElementById(i);if(e&&e.checked){e.checked=false;fire(e,"change");}});
  return {ch,selectable:ok,prod:(ch.querySelector(".i-prod")||{}).value};
}
const S=[
 {t:"① ประตูรั้ว · รางตรง + มอเตอร์1 + สายไฟ + สีอบขาว", id:"fence_gate", w:"1.8", h:"2.0", o:[["o-railtype","straight"],["o-gmotor","1"],["o-motorwire","เดินสายไฟจากตู้ควบคุม 15 ม."],["o-motorwireprice","8000"]]},
 {t:"① ประตูรั้ว · รางโค้ง + มอเตอร์2 + สีอบพิเศษ + OPTION ลายไม้", id:"fence_gate", w:"3.0", h:"2.4", o:[["o-railtype","curved"],["o-gmotor","2"],["o-gfin","อบสีพิเศษ"],["o-gatewood","19500"]]},
 {t:"① ประตูรั้ว · รางตรง + ใช้รางเดิม + ไม่มีมอเตอร์", id:"fence_gate", w:"2.0", h:"2.2", o:[["o-railtype","straight"],["o-railreuse","reuse"],["o-gmotor","0"]]},
 {t:"② ระแนงบังตา rn2 (รวมโครง) สีเทาซาฮาร่า", id:"rn2", w:"3.0", h:"2.0", o:[]},
 {t:"② ระแนงบังตา rn14 (นิ้ว)", id:"rn14", w:"2.4", h:"2.2", o:[]},
 {t:"② ระแนงผนัง rn37 (นิ้ว)", id:"rn37", w:"2.4", h:"2.2", o:[]},
 {t:"② เกล็ด Z rn85", id:"rn85", w:"2.0", h:"2.0", o:[["o-grdir","แนวตั้ง"]]},
 {t:"② ระแนง ทำเป็นบานเปิดยูโร 2 บาน", id:"rn2", w:"3.0", h:"2.2", o:[["o-doortype","casement_euro"],["i-panels","2"]]},
 {t:"② ระแนง ทำเป็นบานเฟี้ยม 3 บาน", id:"rn2", w:"3.6", h:"2.2", o:[["o-doortype","folding"],["i-panels","3"]]},
 {t:"③ ราวกันตก imp1 (เฉียง หมุด) กระจกอย่างเดียว", id:"imp1", w:"6", h:"1.1", o:[]},
 {t:"③ ราวกันตก imp3 (เสาตั้ง+ราวจับอลู) + ราวจับ + สีอลู", id:"imp3", w:"6", h:"1.1", o:[["o-handrail","box"],["o-railalucolor","สีดำ"]]},
 {t:"④ ระแนงพิเศษ bar_openclose + มอเตอร์ปรับมุม + สายไฟ", id:"bar_openclose", w:"2.4", h:"2.2", o:[["o-bocmotor","1"],["o-motorwire","เดินสายไฟ 10 ม."],["o-motorwireprice","6000"]]},
 {t:"④ ระแนงพิเศษ bar_grid_z (เกล็ดอลู ติดตาย)", id:"bar_grid_z", w:"2.4", h:"2.2", o:[]},
 {t:"④ ระแนงเลื่อน bar_slide + ทำเป็นบานเลื่อน SMS", id:"bar_slide", w:"3.0", h:"2.2", o:[["o-bsdoor","sliding_sms"]]},
];
function num(s){ return parseFloat(String(s).replace(/[^\d.]/g,""))||0; }
const issues=[];
for(const s of S){
  const {ch,selectable,prod}=build(s.id,s.w,s.h,s.o);
  if(!selectable){ console.log("\n========== "+s.t+" =========="); console.log("  ⚠ เลือกรุ่น "+s.id+" ไม่ได้ผ่าน i-prod กลุ่ม2 (ตรวจ family/prodsel)"); issues.push(s.t+" → เลือกรุ่นไม่ได้"); continue; }
  w.qSplit=true; w.calcQuote(); w.genQuote();
  const qc=doc.getElementById("quoteContent");
  const tr=qc.querySelector("table.qt tbody tr"); if(!tr){ console.log("\n========== "+s.t+" =========="); console.log("  ⚠ ไม่มีแถวในใบ"); issues.push(s.t+" → ไม่ออกใบ"); continue; }
  const cell=tr.querySelector("td:nth-child(2)");
  const unit=num(tr.querySelector("td:nth-child(4)").textContent);
  const bd=cell.querySelector(".q-bd");
  const lines=[...cell.children].filter(d=>!d.classList||!d.classList.contains("q-bd")).map(d=>d.textContent.replace(/\s+/g," ").trim()).filter(Boolean);
  console.log("\n========== "+s.t+" ==========");
  console.log("  รุ่นจริง:",prod," · ราคา/ชุด:",unit.toLocaleString());
  lines.forEach(l=>console.log("   "+l));
  let bdSum=0, bdRows=[];
  if(bd){ bdRows=[...bd.querySelectorAll("div")].map(d=>d.textContent.replace(/\s+/g," ").trim()).filter(t=>t&&t!=="แยกราคา"&&!/^\+ เพิ่ม/.test(t));
    console.log("   [แยกราคา]"); bdRows.forEach(r=>{ console.log("     "+r); var m=r.match(/([\d,]+)\s*$/); if(m)bdSum+=num(m[1]); });
  } else { console.log("   [แยกราคา] — ไม่มี"); }
  // ----- ตรวจอัตโนมัติ -----
  if(unit<=0) issues.push(s.t+" → ราคา 0/ติดลบ");
  if(!lines.length || !lines[0]) issues.push(s.t+" → รายการว่าง");
  if(bd && Math.abs(bdSum-unit)>1) issues.push(s.t+" → แตกราคารวม "+bdSum.toLocaleString()+" ≠ ราคา "+unit.toLocaleString());
  if(lines.some(l=>/###|undefined|NaN|\[object/.test(l))) issues.push(s.t+" → มีคำแปลก (###/undefined/NaN)");
  if(bdRows.some(r=>/###|undefined|NaN/.test(r))) issues.push(s.t+" → แตกราคามีคำแปลก");
}
console.log("\n\n=================== สรุปความผิดปกติ ===================");
if(jsErrs.length) console.log("JS errors:", jsErrs.join(" | "));
if(!issues.length && !jsErrs.length) console.log("✅ ไม่พบความผิดปกติ (ราคา>0 · รายการไม่ว่าง · แตกราคารวม=ราคา · ไม่มีคำแปลก)");
else { issues.forEach(i=>console.log("  🔴 "+i)); }
process.exit(0);
