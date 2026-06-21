// show-g2-quote.mjs — พิมพ์ "ใบเสนอราคา G2 ปัจจุบัน" ออกมาเป็น text ให้ดู (READ-ONLY)
// ใช้ดูว่าใบตอนนี้ออกมายังไง ก่อนแก้เป็น 5 บล็อก
import { JSDOM, VirtualConsole } from "jsdom";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");
const html = readFileSync(join(ROOT,"public/calculator/index.html"),"utf8");
const vc = new VirtualConsole();
vc.on("jsdomError",()=>{});
const dom = new JSDOM(html,{runScripts:"dangerously",pretendToBeVisual:true,virtualConsole:vc,url:"http://localhost/calculator/index.html"});
await new Promise(r=>{ if(dom.window.document.readyState==="complete")r(); else dom.window.addEventListener("load",r); setTimeout(r,2000); });
const w=dom.window, doc=w.document;
const fire=(el,t)=>el.dispatchEvent(new w.Event(t,{bubbles:true}));
const noSvc=()=>["svc-protect","svc-lift","svc-travel","svc-ship"].forEach(id=>{const e=doc.getElementById(id);if(e&&e.checked){e.checked=false;fire(e,"change");}});
const setOpt=(ch,cls,val)=>{ const el=ch.querySelector(cls.startsWith(".")?cls:"."+cls); if(!el)return false; if(el.type==="checkbox"){el.checked=(val===true||val==="1");}else{el.value=String(val);} fire(el,"input");fire(el,"change"); return true; };

function bill(id,wd,ht,optPairs){
  doc.getElementById("items").innerHTML=""; w.addItem(doc.getElementById("items"));
  const ch=doc.querySelector("#items .ch"); if(!ch)return null;
  const gs=ch.querySelector(".i-group"); if(gs){gs.value="2";fire(gs,"change");}
  const ps=ch.querySelector(".i-prod"); if(!ps||!ps.querySelector('option[value="'+id+'"]'))return "(เลือกไม่ได้ในกลุ่ม2)";
  ps.value=id; fire(ps,"change");
  const wi=ch.querySelector(".i-w"),hi=ch.querySelector(".i-h");
  if(wi){wi.value=String(wd);fire(wi,"input");fire(wi,"change");}
  if(hi){hi.value=String(ht);fire(hi,"input");fire(hi,"change");}
  const dbg=[];
  for(const [cls,val] of (optPairs||[])){ const ok=setOpt(ch,cls,val); const el=ch.querySelector("."+cls); dbg.push(cls+"="+(el?(el.type==="checkbox"?el.checked:el.value):"(ไม่มี el)")+(ok?"":" ✗ตั้งไม่ติด")); }
  noSvc(); try{w.calcQuote();w.genQuote();}catch(e){return "ERR:"+e.message;}
  const qc=doc.getElementById("quoteContent");
  const rows=[...qc.querySelectorAll("tr")].map(tr=>tr.textContent.replace(/\s+/g," ").trim()).filter(Boolean);
  return (dbg.length?("[opt: "+dbg.join(" · ")+"]\n"):"")+rows.join("\n");
}

const SAMPLES=[
  {t:"① ประตูรั้ว: รางตรง + วางรางใหม่ + มอเตอร์1 + สายไฟ + สีอบขาว(default)", id:"fence_gate", w:1.8, h:2.7, opts:[["o-railtype","straight"],["o-gmotor","1"],["o-motorwire","เดินสายไฟจากตู้ควบคุม 15 ม."],["o-motorwireprice","8000"]]},
  {t:"① ประตูรั้ว: รางโค้ง + มอเตอร์2 + OPTION ลายไม้ Golden Teak (gatewood 19500)", id:"fence_gate", w:3, h:2.4, opts:[["o-railtype","curved"],["o-gmotor","2"],["o-gfin","อบสีพิเศษ"],["o-gatewood","19500"]]},
  {t:"① ประตูรั้ว: รางตรง + ใช้รางเดิม (railC=0 · ราคาต้องลด 2×1.8×1500=5,400 → 73,600)", id:"fence_gate", w:1.8, h:2.7, opts:[["o-railtype","straight"],["o-gmotor","1"],["o-railreuse","reuse"]]},
  {t:"② ระแนงบังตา rn14 (นิ้ว) + สีเทาซาฮาร่า", id:"rn14", w:3, h:2, opts:[["o-gridcolor","x"]]},
  {t:"② ระแนง rn2 ทำเป็นบานเปิดยูโร 2 บาน (#3 ราคาต้องคูณบาน + โชว์ในใบ)", id:"rn2", w:3, h:2.2, opts:[["o-doortype","casement_euro"],["i-panels","2"]]},
  {t:"② ระแนง rn2 ทำเป็นบานเฟี้ยม 3 บาน", id:"rn2", w:3, h:2.2, opts:[["o-doortype","folding"],["i-panels","3"]]},
  {t:"② ระแนงผนัง rn37 (นิ้ว ไม่อบสี)", id:"rn37", w:3, h:2, opts:[]},
  {t:"② เกล็ด Z rn85 (1.6 นิ้ว) + ทิศแนวตั้ง", id:"rn85", w:3, h:2, opts:[["o-grdir","แนวตั้ง"]]},
  {t:"③ ราวกันตก imp3 (เสาตั้ง+ราวจับอลู)", id:"imp3", w:3, h:1.1, opts:[["o-railalucolor","สีดำ"]]},
  {t:"④ ระแนงพิเศษ bar_openclose + มอเตอร์ปรับมุม + สายไฟ", id:"bar_openclose", w:2.4, h:2.2, opts:[["o-bocmotor","1"],["o-motorwire","เดินสายไฟจากตู้ควบคุม 10 ม."],["o-motorwireprice","6000"]]},
  {t:"④ ระแนงพิเศษ bar_grid_z (เกล็ดอลู ติดตาย)", id:"bar_grid_z", w:2.4, h:2.2, opts:[]},
];

for(const s of SAMPLES){
  console.log("\n========== "+s.t+" ==========");
  console.log(bill(s.id,s.w,s.h,s.opts));
}
process.exit(0);
