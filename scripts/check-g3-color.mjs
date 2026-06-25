// check-g3-color.mjs — ตรวจ G3 สีโครง L1/L2/L3 vs ดราฟ
// READ-ONLY audit — ไม่แก้ index.html
import { JSDOM, VirtualConsole } from "jsdom";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");

const html = readFileSync(join(ROOT,"public/calculator/index.html"),"utf8");
const vc = new VirtualConsole();
vc.on("jsdomError", () => {});
const dom = new JSDOM(html,{
  runScripts:"dangerously",
  pretendToBeVisual:true,
  virtualConsole:vc,
  url:"http://localhost/calculator/index.html"
});

await new Promise(r=>{
  if(dom.window.document.readyState==="complete") r();
  else dom.window.addEventListener("load",r);
  setTimeout(r,2500);
});

const w = dom.window;
const doc = dom.window.document;
const fire = (el,t) => el.dispatchEvent(new w.Event(t,{bubbles:true}));

function renderG3(pid){
  doc.getElementById("items").innerHTML="";
  try { w.addItem(doc.getElementById("items")); } catch(e){ return null; }
  const ch = doc.querySelector("#items .ch"); if(!ch) return null;
  const gs = ch.querySelector(".i-group");
  if(gs){ gs.value="3"; fire(gs,"change"); }
  const ps = ch.querySelector(".i-prod");
  if(!ps) return null;
  const opt = ps.querySelector('option[value="'+pid+'"]');
  if(!opt){ return {ch, ok:false, reason:"no option "+pid}; }
  ps.value=pid; fire(ps,"change");
  const wi=ch.querySelector(".i-w"), hi=ch.querySelector(".i-h");
  if(wi){ wi.value="4"; fire(wi,"input"); fire(wi,"change"); }
  if(hi){ hi.value="3"; fire(hi,"input"); fire(hi,"change"); }
  return {ch, ok:true};
}

function inspectColorBox(ch){
  const cb = ch.querySelector(".rf-colorbox");
  if(!cb) return {found:false};

  const l1row  = cb.querySelector(".rf-l1row");
  const l2cb   = cb.querySelector(".rf-l2-cb");
  const l2host = cb.querySelector(".rf-l2-host");
  const l3cb   = cb.querySelector(".rf-l3-cb");
  const l3host = cb.querySelector(".rf-l3-host");

  return {
    found: true,
    l1: {
      row: !!l1row,
      name: (cb.querySelector(".rf-l1name")||{}).textContent||"N/A",
      cycleBtn: l1row ? !!l1row.querySelector("button") : false,
    },
    l2: {
      cb: !!l2cb,
      label: l2cb ? ((l2cb.closest("label")||{}).textContent||"").trim().substring(0,120) : "N/A",
      host: !!l2host,
      hostHidden: l2host ? (l2host.style.display==="none") : false,
      hasModeSelector: cb.innerHTML.includes("ใช้จริง") ||
                       cb.innerHTML.includes("ออปชั่น"),
    },
    l3: {
      cb: !!l3cb,
      label: l3cb ? ((l3cb.closest("label")||{}).textContent||"").trim().substring(0,120) : "N/A",
      cbVisible: l3cb ? ((l3cb.closest("label")||{}).style||{}).display !== "none" : false,
      host: !!l3host,
      hostHidden: l3host ? (l3host.style.display==="none") : false,
      insideL2host: l2host ? !!l2host.querySelector(".rf-l3-cb") : false,
      insideColorbox: !!cb.querySelector(".rf-l3-cb"),
      colorChipCount: l3host ? l3host.querySelectorAll(".chip[data-val]").length : 0,
      hasMatSel: l3host ? !!l3host.querySelector(".o-rfmatopt") : false,
      hasCodeRow: l3host ? !!l3host.querySelector(".l3coderow") : false,
    },
  };
}

function openL2(ch){
  const l2cb = ch.querySelector(".rf-l2-cb");
  if(!l2cb) return null;
  l2cb.checked = true;
  fire(l2cb,"change");
  try { w.rfL2CbToggle(l2cb); } catch(e){}
  return inspectColorBox(ch);
}

function openL3(ch){
  const l3cb = ch.querySelector(".rf-l3-cb");
  if(!l3cb) return null;
  l3cb.checked = true;
  fire(l3cb,"change");
  try { w.rfL3CbToggle(l3cb); } catch(e){}
  return inspectColorBox(ch);
}

const PIDS = ["roof_vinyl","roof_polyton","imp7","imp15"];
const results = {};

for(const pid of PIDS){
  const r = renderG3(pid);
  if(!r || !r.ok){
    results[pid] = { error: r ? r.reason : "render failed" };
    continue;
  }
  const before  = inspectColorBox(r.ch);
  const afterL2 = openL2(r.ch);
  const afterL3 = openL3(r.ch);
  results[pid] = { before, afterL2, afterL3 };
}

// === print ===
console.log("\n=== G3 สีโครง L1/L2/L3 AUDIT ===\n");

for(const pid of PIDS){
  const d = results[pid];
  console.log("--- "+pid+" ---");
  if(d.error){ console.log("  ERROR:", d.error); continue; }
  const b = d.before;
  if(!b.found){ console.log("  colorbox: NOT FOUND"); continue; }

  console.log("L1 row:", b.l1.row, "| name:", b.l1.name, "| cycleBtn:", b.l1.cycleBtn);
  console.log("L2 cb:", b.l2.cb, "| hostHidden(default):", b.l2.hostHidden, "| modeChips:", b.l2.hasModeSelector);
  console.log("  label:", b.l2.label.substring(0,80));
  console.log("L3 cb:", b.l3.cb, "| hostHidden(default):", b.l3.hostHidden, "| insideL2host:", b.l3.insideL2host);
  console.log("  label:", b.l3.label.substring(0,80));

  if(d.afterL2){
    const a2 = d.afterL2;
    console.log("After L2 open => l2 host visible:", !a2.l2.hostHidden, "| l3 insideL2host:", a2.l3.insideL2host);
  }
  if(d.afterL3){
    const a3 = d.afterL3;
    console.log("After L3 open => chips:", a3.l3.colorChipCount, "| matSel:", a3.l3.hasMatSel, "| codeRow:", a3.l3.hasCodeRow);
  }
  console.log();
}

// === สรุป PASS/FAIL ===
console.log("=== FINDINGS vs ดราฟ ===");
const ref = results["roof_vinyl"];
if(ref && !ref.error && ref.before.found){
  const b = ref.before;
  const a2 = ref.afterL2;
  const a3 = ref.afterL3;

  const checks = [
    ["F1","L1 row+name+cycleBtn",  b.l1.row && b.l1.name!=="N/A" && b.l1.cycleBtn],
    ["F2","L2 hidden by default",  b.l2.hostHidden],
    ["F3","L2 mode (ใช้จริง/ออปชั่น)", b.l2.hasModeSelector],
    ["F4","L3 ซ้อนใน L2-host",    b.l3.insideL2host],
    ["F5","L3 toggle ซ่อนเมื่อ L2 ปิด", b.l3.insideL2host],
    ["F6","L3 host hidden default", b.l3.hostHidden],
    ["F7","L3 color chips > 0",    a3 ? a3.l3.colorChipCount > 0 : false],
    ["F8","L3 เทียบวัสดุมุง",      a3 ? a3.l3.hasMatSel : false],
    ["F9","L3 codeRow (สีพิเศษ)", a3 ? a3.l3.hasCodeRow : false],
  ];

  for(const [id,label,pass] of checks){
    console.log((pass ? "PASS" : "FAIL")+" ["+id+"] "+label);
  }

  const fails = checks.filter(c=>!c[2]);
  console.log("\n=> FAIL count:", fails.length, "of", checks.length);
}
