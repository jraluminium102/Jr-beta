// ตรวจลำดับ DOM จริงใน g1-rare-body หลังปลด L1
import { JSDOM, VirtualConsole } from "jsdom";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");
const html = readFileSync(join(ROOT,"public/calculator/index.html"),"utf8");
const vc = new VirtualConsole(); vc.on("jsdomError",()=>{});
const dom = new JSDOM(html,{runScripts:"dangerously",pretendToBeVisual:true,virtualConsole:vc,url:"http://localhost/calculator/index.html"});
await new Promise(r=>{ if(dom.window.document.readyState==="complete")r(); else dom.window.addEventListener("load",r); setTimeout(r,3000); });
const w=dom.window, doc=w.document;
const fire=(el,t)=>el.dispatchEvent(new w.Event(t,{bubbles:true}));

const testProds = ["sliding_sms","casement_euro","fixed_glass"];

for (const prodId of testProds) {
  doc.getElementById("items").innerHTML="";
  w.addItem(doc.getElementById("items"));
  const ch=doc.querySelector("#items .ch");
  const gs=ch.querySelector(".i-group"); gs.value="1"; fire(gs,"change");
  const ps=ch.querySelector(".i-prod");
  if(ps.querySelector(`option[value="${prodId}"]`)) { ps.value=prodId; fire(ps,"change"); }
  const wi=ch.querySelector(".i-w"),hi=ch.querySelector(".i-h");
  if(wi){wi.value="1.2";fire(wi,"input");fire(wi,"change");}
  if(hi){hi.value="2.2";fire(hi,"input");fire(hi,"change");}

  // ปลด L1
  const l1cb=ch.querySelector(".g1co-l1cb");
  if(l1cb){l1cb.checked=false; fire(l1cb,"change"); try{w.g1L1Change(l1cb);}catch(e){}}

  const rareS=ch.querySelector(".g1-rare-section");
  const rareBody=rareS&&rareS.querySelector(".g1-rare-body");

  console.log(`\n=== ${prodId} ===`);
  if(!rareBody){console.log("  ERROR: ไม่พบ .g1-rare-body"); continue;}

  const kids=[...rareBody.children];
  kids.forEach((el,i)=>{
    const cls=Array.from(el.classList).join(" ")||"(no-class)";
    const tag=
      el.querySelector&&el.querySelector(".g1co-l2mode")?"[L2 mode radio]":
      el.classList.contains("i-color-wrap")?"[L2 สีอลู]":
      el.classList.contains("i-colorcode-wrap")?"[L2 codebox]":
      el.classList.contains("i-glass-wrap")?"[L2 กระจก]":
      el.classList.contains("g1co-l3-wrap")?"[L3 wrap]":"";
    console.log(`  [${i}] class="${cls.slice(0,40)}" display="${el.style.display||'(inherit)'}" ${tag}`);
  });

  const l3wrap=rareS.querySelector(".g1co-l3-wrap");
  console.log(`  L3 wrap display: "${l3wrap?l3wrap.style.display:"not found"}"`);
}

console.log("\n=== ดราฟ spec ลำดับที่ถูก ===");
console.log("  [0] L2 mode radio div");
console.log("  [1] L3 wrap (ซ่อน/โชว์ตาม mode)");
console.log("  [2] L2 สีอลู (i-color-wrap)");
console.log("  [3] L2 codebox (i-colorcode-wrap)");
console.log("  [4] L2 กระจก (i-glass-wrap)");
console.log("\nHOWEVER ดราฟ ORIGINAL แนะนำ:");
console.log("  mode → สีอลู → codebox → กระจก → L3");
console.log("เว็บ: mode → L3 wrap → สีอลู → codebox → กระจก  ← L3 wrap แทรกกลาง!");
