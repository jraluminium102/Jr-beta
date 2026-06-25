import { JSDOM, VirtualConsole } from "jsdom";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");
const html = readFileSync(join(ROOT,"public/calculator/index.html"),"utf8");
const vc = new VirtualConsole();
vc.on("jsdomError", ()=>{});
const dom = new JSDOM(html, {runScripts:"dangerously",pretendToBeVisual:true,virtualConsole:vc,url:"http://localhost/calculator/index.html"});
await new Promise(r=>{ if(dom.window.document.readyState==="complete")r(); else dom.window.addEventListener("load",r); setTimeout(r,3000); });
const w=dom.window, doc=w.document;
const fire=(el,t)=>el.dispatchEvent(new w.Event(t,{bubbles:true}));

// render sliding_sms
doc.getElementById("items").innerHTML="";
w.addItem(doc.getElementById("items"));
const ch=doc.querySelector("#items .ch");
const gs=ch.querySelector(".i-group"); gs.value="1"; fire(gs,"change");
const ps=ch.querySelector(".i-prod"); ps.value="sliding_sms"; fire(ps,"change");
const wi=ch.querySelector(".i-w"),hi=ch.querySelector(".i-h");
if(wi){wi.value="1.2";fire(wi,"input");fire(wi,"change");}
if(hi){hi.value="2.2";fire(hi,"input");fire(hi,"change");}

// ข้อมูล product
const prod = w.PBYID ? w.PBYID["sliding_sms"] : null;
console.log("sliding_sms series:", prod ? prod.series : "n/a");
console.log("sliding_sms cat:", prod ? prod.cat : "n/a");

// นับ options ใน i-color
const ic = ch.querySelector(".i-color");
console.log("\ni-color options:", ic ? ic.options.length : "not found");
if(ic) {
  Array.from(ic.options).forEach(o => console.log(` [${o.value}] ${o.text.slice(0,40)}`));
}

// COLORS total
const colors = w.COLORS;
console.log("\nCOLORS total:", colors ? colors.length : "n/a");
if(colors) {
  colors.forEach((c,i)=>console.log(` [${i}] n=${c.n.slice(0,30)} series=${c.series||"-"}`));
}
