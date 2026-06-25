// ตรวจ codebox toggle เมื่อเลือกสีอบพิเศษ (hasCode=1) ใน L2 และ L3
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

const l1cb=ch.querySelector(".g1co-l1cb");
l1cb.checked=false; fire(l1cb,"change"); try{w.g1L1Change(l1cb);}catch(e){}

const rareS=ch.querySelector(".g1-rare-section");
const rareBody=rareS.querySelector(".g1-rare-body");
const l2color=rareBody.querySelector(".i-color");
const l2code=rareBody.querySelector(".i-colorcode-wrap");

console.log("=== L2 codebox toggle ===");
console.log("default (สีอบขาว idx=0):");
console.log("  l2color value=", l2color?l2color.value:"N/A");
console.log("  codebox display=", l2code?l2code.style.display:"N/A");

// เลือกสีอบพิเศษ (idx=10 = สีอบพิเศษ hasCode=1)
if(l2color) {
  const optSpecial=Array.from(l2color.options).find(o=>{
    const ci=parseInt(o.value); const c=w.COLORS&&w.COLORS[ci]; return c&&c.hasCode;
  });
  if(optSpecial) {
    l2color.value=optSpecial.value;
    fire(l2color,"input"); fire(l2color,"change");
    console.log(`\nหลังเลือก "${optSpecial.text.slice(0,30)}" (hasCode):`);
    console.log("  codebox display=", l2code?l2code.style.display:"N/A");
    // ดราฟ: codebox โชว์เมื่อเลือกสีพิเศษ
    if(l2code && l2code.style.display!=="none") console.log("  ✅ codebox โชว์ถูกต้อง");
    else console.log("  🔴 codebox ยังซ่อน! (ดราฟ: ต้องโชว์เมื่อเลือกสีพิเศษ)");
  } else {
    console.log("  ไม่พบ option hasCode");
  }
}

// ตรวจ L3 codebox
const l3c=rareS.querySelector(".g1co-l3c");
const l3codeWrap=rareS.querySelector(".g1co-l3code-wrap");
console.log("\n=== L3 codebox toggle ===");
if(l3c) {
  const optSpecialL3=Array.from(l3c.options).find(o=>{
    const ci=parseInt(o.value); const c=w.COLORS&&w.COLORS[ci]; return c&&c.hasCode&&ci>=0;
  });
  if(optSpecialL3) {
    l3c.value=optSpecialL3.value;
    fire(l3c,"input"); fire(l3c,"change");
    console.log(`หลังเลือก L3 "${optSpecialL3.text.slice(0,30)}" (hasCode):`);
    console.log("  l3code-wrap display=", l3codeWrap?l3codeWrap.style.display:"N/A");
    if(l3codeWrap && l3codeWrap.style.display!=="none") console.log("  ✅ L3 codebox โชว์");
    else console.log("  🔴 L3 codebox ยังซ่อน!");
  }
}

console.log("\n=== ตรวจ L2 สีอลู label text ===");
// ดราฟ: label L2 สีอลู = "L2 ① สีอลูมิเนียม (13 สี · ดรอปดาวน์)"
// เว็บ: label ใน i-color-wrap = "สีอลูมิเนียม (รายการนี้)"
const colorWrap=rareBody.querySelector(".i-color-wrap");
if(colorWrap) {
  const lbl=colorWrap.querySelector("label");
  console.log("L2 color label:", lbl?lbl.textContent.trim():"not found");
  // ดราฟ spec: "L2 ① สีอลูมิเนียม" แต่เว็บใช้ label เดิม "สีอลูมิเนียม (รายการนี้)"
  // ไม่ใช่ bug ร้ายแรง แต่ label ไม่ตรงดราฟ
}

const glassWrap=rareBody.querySelector(".i-glass-wrap");
if(glassWrap) {
  const lbl=glassWrap.querySelector("label");
  console.log("L2 glass label:", lbl?lbl.textContent.trim():"not found");
}
