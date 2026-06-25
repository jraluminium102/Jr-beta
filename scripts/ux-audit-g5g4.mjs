// ux-audit-g5g4.mjs — ตรวจ UX แม่แบบร่วม ข้อ 5-12 · G5(ตัวเอง)+G4(สลับ) · READ-ONLY
// ดึง: ดรอปดาวน์ที่เหลือ(option≤6 ควรชิป) · ชื่อยาว · สีเป็น select/chip · OPTION block · ใบ5บล็อก
// ใช้: node scripts/ux-audit-g5g4.mjs
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

function renderProd(id){
  doc.getElementById("items").innerHTML="";
  try{ w.addItem(doc.getElementById("items")); }catch(e){ return null; }
  const ch=doc.querySelector("#items .ch"); if(!ch) return null;
  const gs=ch.querySelector(".i-group");
  // ลองทุก group value จน prod โผล่
  let ok=false;
  for(const opt of (gs?[...gs.options]:[])){
    gs.value=opt.value; fire(gs,"change");
    const ps=ch.querySelector(".i-prod");
    if(ps && ps.querySelector('option[value="'+id+'"]')){ ps.value=id; fire(ps,"change"); ok=true; break; }
  }
  if(!ok) return {ch,ok:false};
  const wi=ch.querySelector(".i-w"),hi=ch.querySelector(".i-h");
  if(wi){wi.value="2.0";fire(wi,"input");fire(wi,"change");}
  if(hi){hi.value="2.0";fire(hi,"input");fire(hi,"change");}
  return {ch,ok:true};
}

// เช็คซ่อน: ไล่ parent หา hidden attr / style.display:none / style.visibility:hidden
function isHidden(el){
  let n=el;
  while(n && n.nodeType===1){
    if(n.hasAttribute&&n.hasAttribute("hidden")) return true;
    const st=n.getAttribute&&n.getAttribute("style")||"";
    if(/display\s*:\s*none/i.test(st)||/visibility\s*:\s*hidden/i.test(st)) return true;
    if(n.style&&(n.style.display==="none"||n.style.visibility==="hidden")) return true;
    n=n.parentElement;
  }
  return false;
}
// select ที่ "โชว์จริง" (ไม่นับ i-group/i-prod · ไม่นับ select ที่ซ่อน/มีชิป sync)
function selectsOf(ch){
  return [...ch.querySelectorAll("select")].filter(s=>!s.classList.contains("i-group")&&!s.classList.contains("i-prod")&&!isHidden(s))
    .map(s=>{ const cls=[...s.classList].find(c=>/^o-|^i-/.test(c))||s.className||"?"; return {cls, n:s.options.length}; });
}
function nameOf(id){ try{ const p=w.PBYID?w.PBYID[id]:null; return p?p.name:id; }catch(e){ return id; } }

const G5=[["imp21","เฟรมเล็ก"],["imp23","เฟรมใหญ่"],["imp28","จีบตีนตะขาบ"],["mj_blackout","Blackout"],["imp29","ม้วน"],["mj_screen_safety","จีบนิรภัย"],["mj_kick_300","ม้วนเตะ300"]];
const G4=[["cabinet_alu","ตู้อลู"],["future_tech","ฝาตู้ FutureTech"]];

function audit(label, list){
  console.log("\n========== "+label+" ==========");
  for(const [id,nm] of list){
    const r=renderProd(id);
    if(!r||!r.ok){ console.log(`\n[${id}] ${nm} — ⚠ เลือกไม่ได้`); continue; }
    const full=nameOf(id);
    const longName = full.length>40;
    const sels=selectsOf(r.ch);
    const dropFlags=sels.filter(s=>s.n>=2&&s.n<=6); // ดรอปดาวน์ตัวเลือกน้อย ควรเป็นชิป
    const chips=r.ch.querySelectorAll(".chip").length;
    const optBlock=!!r.ch.querySelector(".oc-block, .oc-cat, [class*='oc-']");
    console.log(`\n[${id}] ${nm}`);
    console.log(`   ชื่อ(${full.length}ตัว): ${full}${longName?"  🟡ยาว>40":""}`);
    console.log(`   ดรอปดาวน์เหลือ: ${sels.length?sels.map(s=>s.cls+"("+s.n+")").join(", "):"ไม่มี"}`);
    if(dropFlags.length) console.log(`   🟡 ดรอปดาวน์ ≤6 ตัวเลือก (ควรเป็นชิป): ${dropFlags.map(s=>s.cls+"="+s.n).join(", ")}`);
    console.log(`   ชิป(.chip): ${chips} · OPTION block: ${optBlock?"มี":"ไม่มี"}`);
    // ใบ 5 บล็อก
    let has5=false;
    try{ w.calcQuote&&w.calcQuote(); w.genQuote&&w.genQuote(); const qc=doc.getElementById("quoteContent"); has5=qc&&/###|รายละเอียด/.test(qc.innerHTML||""); }catch(e){}
    console.log(`   ใบ 5 บล็อก (มี รายละเอียด/marker): ${has5?"✅":"🔴 ไม่พบ"}`);
  }
}
audit("G5 มุ้ง (กลุ่มตัวเอง)", G5);
audit("G4 ตู้ (สลับดู)", G4);
console.log("\nเสร็จ");
