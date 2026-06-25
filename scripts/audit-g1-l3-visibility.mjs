// ตรวจ: เมื่อ L1 ติ๊ก L3 wrap ซ่อนไหม (อยู่นอก g1-rare-body)
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

const rareS=ch.querySelector(".g1-rare-section");
const rareBody=rareS.querySelector(".g1-rare-body");
const l3wrap=rareS.querySelector(".g1co-l3-wrap");
const l1cb=rareS.querySelector(".g1co-l1cb");

function status() {
  console.log(`  L1 checked=${l1cb.checked}`);
  console.log(`  rareBody display="${rareBody.style.display}"`);
  console.log(`  L3 wrap display="${l3wrap?l3wrap.style.display:"N/A"}"`);
  const l3det=rareS.querySelector(".g1co-l3det");
  console.log(`  L3 details open=${l3det?l3det.open:"N/A"}`);
}

console.log("=== State เริ่มต้น (L1 ติ๊ก) ===");
status();

// ปลด L1
console.log("\n=== หลังปลด L1 ===");
l1cb.checked=false; fire(l1cb,"change"); try{w.g1L1Change(l1cb);}catch(e){}
status();

// switch mode 🔵
console.log("\n=== switch mode 🔵ออปชั่น ===");
const radios=ch.querySelectorAll(".g1co-l2mode");
radios.forEach(r=>{ if(r.value==="opt"){r.checked=true; fire(r,"change"); try{w.g1L2ModeChange(r);}catch(e){}} else r.checked=false; });
status();

// กลับ L1 ติ๊ก
console.log("\n=== กลับ L1 ติ๊ก ===");
l1cb.checked=true; fire(l1cb,"change"); try{w.g1L1Change(l1cb);}catch(e){}
status();

console.log("\n=== วิเคราะห์ ===");
// ตรวจ code: g1L1Change ซ่อน L3 wrap ไหม
// L1213: var l3w=d.querySelector('.g1co-l3-wrap'); if(l3w) l3w.style.display='none';
// นั่นคือ g1L1Change ซ่อน l3wrap เมื่อ on=false (กลับ L1)
// แต่ขณะ L1 ติ๊กแรก rareS.innerHTML สร้าง l3wrap ภายใน g1-rare-body
// หลัง rebuild (buildItemOpts) ย้ายออก → l3wrap เป็น sibling ของ rareBody
// ผล: g1L1Change ยังหา '.g1co-l3-wrap' ใน ch ได้ → ซ่อนได้ปกติ
console.log("  l3wrap.parentNode === rareS:", l3wrap&&l3wrap.parentNode===rareS);
console.log("  g1L1Change ซ่อน l3wrap ผ่าน ch.querySelector('.g1co-l3-wrap') = ยังทำงานได้");
