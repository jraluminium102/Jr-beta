// g1-invoice-dump.mjs — ออกใบเสนอราคาจริง G1 หลายชนิด (เลือกออปชั่น/สี/กระจก/มุ้งครบ) → dump ข้อความบนใบ
// ใช้ตรวจว่าใบ G1 ตรง "แบบล่าสุด 3 ชั้น" (quote-item-structure) ไหม
import { JSDOM, VirtualConsole } from "jsdom";
import { readFileSync } from "node:fs";
const html = readFileSync(new URL("../public/calculator/index.html", import.meta.url), "utf8");
const vc = new VirtualConsole(); const errs=[]; vc.on("jsdomError",e=>{if(!/scrollTo|Not implemented/.test(e.message))errs.push(e.message);});
const dom = new JSDOM(html,{runScripts:"dangerously",pretendToBeVisual:true,virtualConsole:vc,url:"http://localhost/calculator/index.html"});
await new Promise(r=>{if(dom.window.document.readyState==="complete")r();else dom.window.addEventListener("load",r);setTimeout(r,2000);});
const w=dom.window,doc=w.document;
const fire=(el,t)=>el.dispatchEvent(new w.Event(t,{bubbles:true}));
const noSvc=()=>["svc-protect","svc-lift","svc-travel","svc-ship"].forEach(id=>{const e=doc.getElementById(id);if(e&&e.checked){e.checked=false;fire(e,"change");}});
function setOpt(ch,cls,v){const el=ch.querySelector(cls);if(!el)return false;if(el.type==="checkbox")el.checked=(v==="1"||v===true);else el.value=String(v);fire(el,"input");fire(el,"change");return true;}
function inv(id,W,H,opts){
  doc.getElementById("items").innerHTML="";w.addItem(doc.getElementById("items"));
  const ch=doc.querySelector("#items .ch");const gs=ch.querySelector(".i-group");gs.value="1";fire(gs,"change");
  const ps=ch.querySelector(".i-prod");if(!ps.querySelector('option[value="'+id+'"]'))return "(เลือก "+id+" ไม่ได้)";
  ps.value=id;fire(ps,"change");
  setOpt(ch,".i-w",W);setOpt(ch,".i-h",H);
  (opts||[]).forEach(o=>setOpt(ch,o[0],o[1]));
  noSvc();try{w.calcQuote();w.genQuote();}catch(e){return "ERR "+e.message;}
  const qc=doc.getElementById("quoteContent");
  // ดึงเฉพาะ row รายละเอียด (td ที่ 2) ของรายการแรก
  const m=(qc.textContent||"").replace(/\s+\n/g,"\n");
  return qc.textContent.replace(/[ \t]{2,}/g," ").split("\n").map(s=>s.trim()).filter(Boolean);
}
const CASES=[
  ["บานเปิด ยูโร +สีอบพิเศษ+กระจก+มุ้ง", ()=>inv("casement_euro",1.2,2.2,[[".i-color","10"],[".i-glass","glass_temp_green_6"],[".o-mosq","imp23"],[".o-mosqopenstyle","เปิด"]])],
  ["บานเลื่อน เซมิยูโร +สี+มุ้งจีบ+ครอบวงกบ", ()=>inv("sliding_sms",2.4,2.2,[[".i-color","2"],[".o-mosq","mj_sd_basic"],[".o-mosqopenstyle","เลื่อน"],[".o-fcsides","4"]])],
  ["กระจกติดตาย +สีลายไม้+คาดตาราง", ()=>inv("fixed_glass",1.5,2.0,[[".i-color","5"],[".o-gridmark","1"]])],
  ["ผนังเบาภายนอก", ()=>inv("wall_ext",3.0,3.0,[])],
];
for(const [label,fn] of CASES){
  console.log("\n========== "+label+" ==========");
  const out=fn();
  if(Array.isArray(out)) out.forEach(l=>console.log("  "+l)); else console.log("  "+out);
}
console.log("\n--- glass options (i-glass) ตัวอย่าง ---");
{ doc.getElementById("items").innerHTML="";w.addItem(doc.getElementById("items"));const ch=doc.querySelector("#items .ch");ch.querySelector(".i-group").value="1";fire(ch.querySelector(".i-group"),"change");const ps=ch.querySelector(".i-prod");ps.value="casement_euro";fire(ps,"change");const g=ch.querySelector(".i-glass");console.log(g?Array.from(g.options).slice(0,6).map(o=>o.value+"="+o.textContent.trim()).join(" | "):"ไม่มี i-glass");}
console.log("errs",errs.slice(0,2));
