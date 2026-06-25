// test-g2-colorname.mjs — ทดสอบช่องกรอกชื่อสีพิเศษ G2 (3 จุด × กรอก/ไม่กรอก)
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
  const ps=ch.querySelector(".i-prod"); if(!ps||!ps.querySelector('option[value="'+id+'"]'))return "(เลือกไม่ได้)";
  ps.value=id; fire(ps,"change");
  const wi=ch.querySelector(".i-w"),hi=ch.querySelector(".i-h");
  if(wi){wi.value=String(wd);fire(wi,"input");fire(wi,"change");}
  if(hi){hi.value=String(ht);fire(hi,"input");fire(hi,"change");}
  for(const [cls,val] of (optPairs||[])){ setOpt(ch,cls,val); }
  noSvc(); try{w.calcQuote();w.genQuote();}catch(e){return "ERR:"+e.message;}
  const qc=doc.getElementById("quoteContent");
  const rows=[...qc.querySelectorAll("tr")].map(tr=>tr.textContent.replace(/\s+/g," ").trim()).filter(Boolean);
  return rows.join("\n");
}

// helper: สกัดบรรทัดที่มีคีย์เวิร์ดออกจาก output
function extract(out, kw){ return out.split("\n").filter(l=>l.includes(kw)).join(" | ") || "(ไม่พบ)"; }

let pass=0, fail=0;
function check(label, out, expect){
  const found = out.includes(expect);
  console.log((found?"  ✅":"  ❌")+" "+label);
  if(!found) console.log("     คาด: "+expect+"\n     ได้ : "+extract(out, expect.split(" ")[0]));
  found?pass++:fail++;
}

console.log("\n=== VERIFY 4: ชื่อสีพิเศษ G2 ===\n");

// ─── จุด 1: ประตูรั้ว (o-gfin) ───────────────────────────────────────────────
console.log("【จุด 1】 ประตูรั้ว (o-gfin)");

// กรอกชื่อ (o-gfin value = string "อบสีพิเศษ")
const gate_named = bill("fence_gate",3,2,[["o-gfin","อบสีพิเศษ"],["o-gfin-colorname","Golden Teak SMS"]]);
check("สีอบพิเศษ + กรอกชื่อ → '(Golden Teak SMS)'", gate_named, "(Golden Teak SMS)");

// ไม่กรอก
const gate_empty = bill("fence_gate",3,2,[["o-gfin","อบสีพิเศษ"]]);
check("สีอบพิเศษ + ไม่กรอก → '⚠ ระบุชื่อสี'", gate_empty, "⚠ ระบุชื่อสี");

// ลายไม้ + กรอกชื่อ
const gate_wood = bill("fence_gate",3,2,[["o-gfin","อบสีลายไม้"],["o-gfin-colorname","Walnut Brown"]]);
check("สีลายไม้อบพิเศษ + กรอกชื่อ → '(Walnut Brown)'", gate_wood, "(Walnut Brown)");

// สีปกติ → ไม่มี ⚠
const gate_normal = bill("fence_gate",3,2,[["o-gfin","สีเทาซาฮาร่า"]]);
const gate_no_warn = !gate_normal.includes("⚠");
console.log((gate_no_warn?"  ✅":"  ❌")+" สีเทาซาฮาร่า (ปกติ) → ไม่มี ⚠"); gate_no_warn?pass++:fail++;

// ─── จุด 2: ระแนง cascade (o-finish) ─────────────────────────────────────────
console.log("\n【จุด 2】 ระแนง (o-finish)");

// rn2 fin: {"สีเทาซาฮาร่า":300,"อบสีพิเศษ":1700,"อบสีลายไม้":2400}
// ต้องใช้ค่า numeric ของ o-finish (1700 = อบสีพิเศษ, 2400 = อบสีลายไม้)
const rn_named = bill("rn2",3,2,[["o-finish","1700"],["o-finish-colorname","Golden Teak SMS"]]);
check("rn2 อบสีพิเศษ + กรอกชื่อ → '(Golden Teak SMS)'", rn_named, "(Golden Teak SMS)");

// ไม่กรอก
const rn_empty = bill("rn2",3,2,[["o-finish","1700"]]);
check("rn2 อบสีพิเศษ + ไม่กรอก → '⚠ ระบุชื่อสี'", rn_empty, "⚠ ระบุชื่อสี");

// อบสีลายไม้ + กรอก
const rn_wood = bill("rn2",3,2,[["o-finish","2400"],["o-finish-colorname","Teak Natural"]]);
check("rn2 อบสีลายไม้ + กรอกชื่อ → '(Teak Natural)'", rn_wood, "(Teak Natural)");

// สีปกติ (ซาฮาร่า) → ไม่มี ⚠ (rn2 fin["สีเทาซาฮาร่า"]=300)
const rn_normal = bill("rn2",3,2,[["o-finish","300"]]);
const rn_no_warn = !rn_normal.includes("⚠");
console.log((rn_no_warn?"  ✅":"  ❌")+" สีเทาซาฮาร่า (ปกติ) → ไม่มี ⚠"); rn_no_warn?pass++:fail++;

// ─── จุด 3a: ระแนงเกล็ด bar_grid (o-bgcolor) ──────────────────────────────────
console.log("\n【จุด 3a】 ระแนงเกล็ด bar_grid (o-bgcolor)");

const bg_named = bill("bar_grid_z",3,2,[["o-bgcolor","สีอบพิเศษ"],["o-bgcolor-colorname","Golden Teak SMS"]]);
check("bar_grid_z สีอบพิเศษ + กรอก → '(Golden Teak SMS)'", bg_named, "สีอบพิเศษ (Golden Teak SMS)");

const bg_empty = bill("bar_grid_z",3,2,[["o-bgcolor","สีอบพิเศษ"]]);
check("bar_grid_z สีอบพิเศษ + ไม่กรอก → '⚠ ระบุชื่อสี'", bg_empty, "สีอบพิเศษ ⚠ ระบุชื่อสี");

const bg_wood = bill("bar_grid_z",3,2,[["o-bgcolor","สีลายไม้อบพิเศษ"],["o-bgcolor-colorname","Dark Walnut"]]);
check("bar_grid_z สีลายไม้อบพิเศษ + กรอก → '(Dark Walnut)'", bg_wood, "สีลายไม้อบพิเศษ (Dark Walnut)");

// ─── จุด 3b: ระแนงหมุน bar_openclose (o-bocfinish) ────────────────────────────
console.log("\n【จุด 3b】 ระแนงหมุน bar_openclose (o-bocfinish)");

const boc_named = bill("bar_openclose",3,2,[["o-bocfinish","3000"],["o-bocfinish-colorname","Golden Teak SMS"]]);
check("bar_openclose สีอบพิเศษ + กรอก → '(Golden Teak SMS)'", boc_named, "สีอบพิเศษ (Golden Teak SMS)");

const boc_empty = bill("bar_openclose",3,2,[["o-bocfinish","3000"]]);
check("bar_openclose สีอบพิเศษ + ไม่กรอก → '⚠ ระบุชื่อสี'", boc_empty, "สีอบพิเศษ ⚠ ระบุชื่อสี");

// ─── จุด 3c: ระแนงเลื่อน bar_slide (o-bsfinish) ──────────────────────────────
console.log("\n【จุด 3c】 ระแนงเลื่อน bar_slide (o-bsfinish)");

const bs_named = bill("bar_slide",3,2,[["o-bsfinish","1600"],["o-bsfinish-colorname","Golden Teak SMS"]]);
check("bar_slide สีอบพิเศษ + กรอก → '(Golden Teak SMS)'", bs_named, "สีอบพิเศษ (Golden Teak SMS)");

const bs_empty = bill("bar_slide",3,2,[["o-bsfinish","1600"]]);
check("bar_slide สีอบพิเศษ + ไม่กรอก → '⚠ ระบุชื่อสี'", bs_empty, "สีอบพิเศษ ⚠ ระบุชื่อสี");

const bs_wood = bill("bar_slide",3,2,[["o-bsfinish","2200"],["o-bsfinish-colorname","Maple"]]);
check("bar_slide สีลายไม้อบพิเศษ + กรอก → '(Maple)'", bs_wood, "สีลายไม้อบพิเศษ (Maple)");

// ─── สรุป ─────────────────────────────────────────────────────────────────────
console.log("\n─────────────────────────────────────────────");
console.log("ผล: ✅"+pass+" ผ่าน · "+(fail>0?"❌"+fail+" ล้มเหลว":"🎉 ผ่านทั้งหมด"));
if(fail>0) process.exit(1);
process.exit(0);
