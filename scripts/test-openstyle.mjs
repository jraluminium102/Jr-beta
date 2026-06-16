// test-openstyle.mjs — verify ลักษณะการเปิดมุ้งเฟรมขายเดี่ยว (imp21/imp23 มี · imp22/mj_blackout ไม่มี) + ชื่อขึ้นใบ
import { JSDOM, VirtualConsole } from "jsdom";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");
const html = readFileSync(join(ROOT,"public/calculator/index.html"),"utf8");
const vc = new VirtualConsole();
const dom = new JSDOM(html,{runScripts:"dangerously",pretendToBeVisual:true,virtualConsole:vc,url:"http://localhost/calculator/index.html"});
await new Promise(r=>{ if(dom.window.document.readyState==="complete")r(); else dom.window.addEventListener("load",r); setTimeout(r,2000); });
const w=dom.window, doc=w.document;
const fire=(el,t)=>el.dispatchEvent(new w.Event(t,{bubbles:true}));

function render(id){
  doc.getElementById("items").innerHTML="";
  w.addItem(doc.getElementById("items"));
  const ch=doc.querySelector("#items .ch");
  const gs=ch.querySelector(".i-group"); gs.value="5"; fire(gs,"change");
  const ps=ch.querySelector(".i-prod");
  if(!ps.querySelector('option[value="'+id+'"]')) return null;
  ps.value=id; fire(ps,"change");
  const wi=ch.querySelector(".i-w"),hi=ch.querySelector(".i-h");
  wi.value="1.0";fire(wi,"input");fire(wi,"change");
  hi.value="2.0";fire(hi,"input");fire(hi,"change");
  return ch;
}

let pass=0, fail=0;
function check(cond,msg){ if(cond){pass++;console.log("  ✅ "+msg);}else{fail++;console.log("  🔴 "+msg);} }

// 1) มี/ไม่มี row
console.log("=== 1. row ลักษณะการเปิด มี/ไม่มี ===");
for(const [id,want] of [["imp21",true],["imp23",true],["imp22",false],["mj_blackout",false],["imp29",false]]){
  const ch=render(id); const row=ch&&ch.querySelector(".mosq-openstyle-row");
  check(!!row===want, `${id} — ${want?"ต้องมี":"ต้องไม่มี"} row · ${row?"มี":"ไม่มี"}`);
}

// 2) เลือก "เปิด" แล้วชื่อขึ้นใบ
console.log("=== 2. เลือกลักษณะการเปิด → ชื่อในใบ ===");
function quoteName(id,style){
  const ch=render(id);
  const btn=[...ch.querySelectorAll(".mosq-openstyle-row .chip")].find(b=>b.dataset.val===style);
  if(btn) btn.click();
  w.calcQuote&&w.calcQuote(); w.genQuote&&w.genQuote();
  // ชื่อรายการแรกในใบ
  const qc=doc.getElementById("quoteContent");
  return qc?qc.textContent:"";
}
const t21s=quoteName("imp21","เลื่อน");
check(/มุ้งเฟรมเล็ก.*บานเลื่อน/.test(t21s) && !/กระทุ้ง\/ยก/.test(t21s.split("บานเลื่อน")[0].slice(-40)), "imp21 เลือกเลื่อน → ชื่อมี 'บานเลื่อน' + ตัดวงเล็บตัวเลือกรกออก");
console.log("     ชื่อ imp21:", (t21s.match(/มุ้งเฟรมเล็ก[^\n]{0,60}/)||[""])[0].trim());
const t21o=quoteName("imp21","เปิด");
check(/มุ้งเฟรมเล็ก.*บานเปิด/.test(t21o), "imp21 เลือกเปิด → ชื่อมี 'บานเปิด'");
const t23s=quoteName("imp23","เลื่อน");
check(/มุ้งเฟรมใหญ่ บานเลื่อน/.test(t23s) && !/กระทุ้ง/.test(t23s.split("บานเลื่อน")[0]), "imp23 เลือกเลื่อน → 'มุ้งเฟรมใหญ่ บานเลื่อน' (วงเล็บ technical ถูกตัด)");
console.log("     ชื่อ imp23:", (t23s.match(/มุ้งเฟรมใหญ่[^\n]{0,40}/)||[""])[0].trim());

// 3) default = เลื่อน, mscolor/ผ้ามุ้งไม่พัง (มี o-screenfabric)
console.log("=== 3. ไม่กระทบออปชั่นเดิม ===");
const ch21=render("imp21");
check(!!ch21.querySelector(".o-screenfabric"), "imp21 ยังมีผ้ามุ้ง (o-screenfabric)");
check(ch21.querySelector(".o-mosqopenstyle")?.value==="เลื่อน", "imp21 default ลักษณะการเปิด = เลื่อน");

console.log(`\n=== สรุป: ${pass} ผ่าน · ${fail} fail ===`);
process.exit(fail?1:0);
