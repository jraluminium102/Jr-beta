// ตรวจตำแหน่ง L3 wrap ว่าอยู่ที่ไหนใน DOM
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

doc.getElementById("items").innerHTML="";
w.addItem(doc.getElementById("items"));
const ch=doc.querySelector("#items .ch");
const gs=ch.querySelector(".i-group"); gs.value="1"; fire(gs,"change");
const ps=ch.querySelector(".i-prod"); ps.value="casement_euro"; fire(ps,"change");
const wi=ch.querySelector(".i-w"),hi=ch.querySelector(".i-h");
if(wi){wi.value="1.2";fire(wi,"input");fire(wi,"change");}
if(hi){hi.value="2.2";fire(hi,"input");fire(hi,"change");}

// ปลด L1
const l1cb=ch.querySelector(".g1co-l1cb");
l1cb.checked=false; fire(l1cb,"change"); try{w.g1L1Change(l1cb);}catch(e){}

const rareS=ch.querySelector(".g1-rare-section");
const rareBody=rareS.querySelector(".g1-rare-body");
const l3wrap=rareS.querySelector(".g1co-l3-wrap");

console.log("=== ตำแหน่ง L3 wrap ===");
console.log("l3wrap.parentNode.className:", l3wrap?Array.from(l3wrap.parentNode.classList).join(" "):"not found");
console.log("l3wrap อยู่ใน rareBody:", l3wrap&&rareBody&&rareBody.contains(l3wrap));
console.log("l3wrap อยู่ใน rareS:", l3wrap&&rareS&&rareS.contains(l3wrap));
console.log("l3wrap.style.display:", l3wrap?l3wrap.style.display:"n/a");

// ดู parent chain
if(l3wrap) {
  let el=l3wrap; let depth=0;
  while(el && depth<6) {
    console.log(`  parent[${depth}]: tag=${el.tagName} class="${Array.from(el.classList).join(" ").slice(0,40)}"`);
    el=el.parentNode; depth++;
  }
}

// children ของ rareS ทั้งหมด
console.log("\n=== children ของ .g1-rare-section ===");
[...rareS.children].forEach((el,i)=>{
  const cls=Array.from(el.classList).join(" ")||"(no-class)";
  const tag=
    el.classList.contains("g1-rare-body")?"[g1-rare-body]":
    el.classList.contains("g1co-l3-wrap")?"[L3 wrap!]":
    el.querySelector&&el.querySelector(".g1co-l1cb")?"[L1 label]":
    el.querySelector&&el.querySelector(".g1co-l2mode")?"[L2 mode]":"";
  console.log(`  [${i}] tag=${el.tagName} class="${cls.slice(0,50)}" disp="${el.style.display}" ${tag}`);
});
