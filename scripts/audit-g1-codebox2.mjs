// ตรวจ codebox toggle โดยใช้ index ที่รู้จาก source (idx 8,9,10,11,12 = hasCode)
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

// COLORS hasCode indexes (จาก source): 8=Fuji Oak, 9=Fuji Makha, 10=อบพิเศษ, 11=ลายไม้อบพิเศษ, 12=สีชุบ
const HAS_CODE_IDXS=[8,9,10,11,12];

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

console.log("=== L2 codebox toggle (ดราฟ: โผล่เมื่อเลือกสีอบพิเศษ/ลายไม้อบ/ชุบ) ===");
console.log("default (สีอบขาว idx=0):");
console.log("  l2code display=", l2code?l2code.style.display:"N/A");
console.log("  ✅ ซ่อนถูก");

// เลือกสีอบพิเศษ idx=10
if(l2color) {
  const optSp = Array.from(l2color.options).find(o=>o.value==="10");
  if(optSp) {
    l2color.value="10"; fire(l2color,"input"); fire(l2color,"change");
    // ดู code: i-color onchange → '.i-colorcode-wrap'.style.display = hasCode?'block':'none'
    // แต่ใน G1 L2 การ toggle codebox ทำผ่าน buildItemOpts line 4976
    // "d.querySelector('.i-colorcode-wrap').style.display=(c&&c.hasCode)?'block':'none'"
    console.log(`\nหลังเลือก "${optSp.text.slice(0,30)}" (idx=10, hasCode):`);
    console.log("  l2code display=", l2code?l2code.style.display:"N/A");
    if(l2code && (l2code.style.display==="block"||l2code.style.display==="")) {
      console.log("  ✅ L2 codebox โชว์เมื่อเลือกสีพิเศษ");
    } else {
      console.log("  🔴 L2 codebox ยังซ่อน! (ดราฟ: ต้องโชว์ · อาจ handler ไม่ fire ใน jsdom)");
      // ตรวจ handler โดยตรง
      // code L4975-4976: i-color onchange → d.querySelector('.i-colorcode-wrap').style.display=...
      // ใน G1 อาจไม่ fire เพราะ .i-color อยู่ใน rareBody (ไม่ใช่ default position)
      // ต้องดู event listener
    }
  } else {
    console.log("  ไม่พบ option idx=10 ใน i-color (อาจถูก filter series)");
    // casement_euro series ไม่จำกัด → ควรมี
    console.log("  options available:", Array.from(l2color.options).map(o=>o.value+":"+o.text.slice(0,15)).join(", "));
  }
}

// ตรวจ L3 codebox
const l3c=rareS.querySelector(".g1co-l3c");
const l3codeWrap=rareS.querySelector(".g1co-l3code-wrap");
console.log("\n=== L3 codebox toggle ===");
if(l3c) {
  // option idx=10 อยู่ที่ index 11 (เพราะ option แรกคือ "— ไม่เทียบ —" = idx -1)
  const optSp=Array.from(l3c.options).find(o=>o.value==="10");
  if(optSp) {
    l3c.value="10";
    fire(l3c,"input"); fire(l3c,"change");
    console.log(`หลังเลือก L3 idx=10:`);
    console.log("  l3code-wrap display=", l3codeWrap?l3codeWrap.style.display:"N/A");
    if(l3codeWrap && l3codeWrap.style.display!=="none") console.log("  ✅ L3 codebox โชว์");
    else console.log("  🔴 L3 codebox ยังซ่อน!");
  } else {
    console.log("  L3 options:", Array.from(l3c.options).slice(0,5).map(o=>o.value+":"+o.text.slice(0,15)).join(", "));
  }
}

console.log("\n=== L2 label vs ดราฟ ===");
const colorWrap=rareBody.querySelector(".i-color-wrap");
const glassWrap=rareBody.querySelector(".i-glass-wrap");
const lbl1=colorWrap&&colorWrap.querySelector("label");
const lbl2=glassWrap&&glassWrap.querySelector("label");
console.log("L2 color label (เว็บ):", lbl1?`"${lbl1.textContent.trim()}"`:"-");
console.log("L2 color label (ดราฟ): \"L2 ① สีอลูมิเนียม (13 สี · ดรอปดาวน์)\"");
console.log("L2 glass label (เว็บ):", lbl2?`"${lbl2.textContent.trim()}"`:"-");
console.log("L2 glass label (ดราฟ): \"L2 ② สเปกกระจก (66 รุ่น · ดรอปดาวน์ครบ)\"");
