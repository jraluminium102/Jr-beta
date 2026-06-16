// _verify-g4quote.mjs — sandbox: splice โค้ดใหม่ลงสำเนา index.html แล้วทดสอบใบ cabinet
// ไม่แตะ public/calculator/index.html จริง · พิสูจน์ "เหมือน target + ราคาไม่เพี้ยน" ก่อนส่ง dev
import { JSDOM, VirtualConsole } from "jsdom";
import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");
const SRC = join(ROOT, "public/calculator/index.html");
const orig = readFileSync(SRC, "utf8");

// ---- splice ----
function spliceBetween(html, startAnchor, endAnchor, replacement){
  const s = html.indexOf(startAnchor);
  if(s<0) throw new Error("start anchor not found: "+startAnchor.slice(0,40));
  const e = html.indexOf(endAnchor, s+startAnchor.length);
  if(e<0) throw new Error("end anchor not found: "+endAnchor.slice(0,40));
  return html.slice(0,s) + replacement + html.slice(e);
}
const fragCab = readFileSync(join(__dirname,"_frag-cabinet.txt"),"utf8");
const fragQrow = readFileSync(join(__dirname,"_frag-qrow.txt"),"utf8");

let patched = orig;
// 1) cabinet branch
patched = spliceBetween(patched, "    else if(it.p.cabinet){", "    else if(it.p.future_tech){", fragCab);
// 2) qrow det block
patched = spliceBetween(patched, "  if (glass && glass !== '-') {", "  if(optText){ content +=", fragQrow);
// 3) _sz override cabinet
patched = patched.replace("    if(it.lumpsum) _sz='(เหมา)';", "    if(it.lumpsum) _sz='(เหมา)';\n    else if(it.p.cabinet) _sz='';");

const TMP = join(__dirname,"_tmp-g4quote.html");
writeFileSync(TMP, patched, "utf8");

// ---- boot helper ----
async function boot(html, url){
  const vc=new VirtualConsole(); const err=[];
  vc.on("jsdomError",e=>{ if(!/scrollTo|scrollIntoView|Not implemented/i.test(e.message)) err.push(e.message); });
  const dom=new JSDOM(html,{runScripts:"dangerously",pretendToBeVisual:true,virtualConsole:vc,url});
  await new Promise(r=>{ if(dom.window.document.readyState==="complete")r(); else dom.window.addEventListener("load",r); setTimeout(r,2000); });
  return {w:dom.window, doc:dom.window.document, err};
}
function buildCab(W,doc,w,opts){
  const fire=(el,t)=>el.dispatchEvent(new w.Event(t,{bubbles:true}));
  doc.getElementById("items").innerHTML=""; w.addItem(doc.getElementById("items"));
  const ch=doc.querySelector("#items .ch");
  const gs=ch.querySelector(".i-group"); gs.value="4"; fire(gs,"change");
  const ps=ch.querySelector(".i-prod"); ps.value="cabinet_alu"; fire(ps,"change");
  const set=(sel,val)=>{ const el=ch.querySelector(sel); if(!el)return; if(el.type==="checkbox")el.checked=(val===true); else el.value=String(val); fire(el,"input"); fire(el,"change"); };
  set(".i-w",opts.w||"1.2"); set(".i-h",opts.h||"2.4");
  set(".o-depth",opts.depth||"0.6"); set(".o-cabdoors",opts.doors||"2"); set(".o-shelves",opts.shelves||"5");
  if(opts.color!=null) set(".i-color",opts.color);
  if(opts.code!=null) set(".i-colorcode",opts.code);
  for(const k of (opts.walls||[])){ set(".o-cabwall-"+k[0]+"-on",true); set(".o-cabwall-"+k[0]+"-mat",k[1]); }
  ["svc-protect","svc-lift","svc-travel","svc-ship"].forEach(id=>{const e=doc.getElementById(id);if(e&&e.checked){e.checked=false;fire(e,"change");}});
  try{ w.calcQuote(); w.genQuote(); }catch(e){ return {ch,err:String(e)}; }
  const qc=doc.getElementById("quoteContent");
  const g=doc.querySelector("#quoteContent .qtot .g");
  return { ch, text:(qc?qc.textContent:""), grand: g?parseInt((g.textContent||"").replace(/\.\d+/g,"").replace(/[^\d]/g,""),10):NaN };
}

const CFG_MAIN={w:"1.2",h:"2.4",depth:"0.6",doors:"2",shelves:"5",color:"10",code:"KL10232A",walls:[["left","alu"],["right","glass"],["back","alu"]]};

const P=await boot(patched,"http://localhost/calculator/index.html");
const O=await boot(orig,"http://localhost/calculator/index.html");

const pm=buildCab(null,P.doc,P.w,CFG_MAIN);
const om=buildCab(null,O.doc,O.w,CFG_MAIN);

const checks=[];
const want=(n,ok,d="")=>checks.push({n,ok:!!ok,d});

// ราคาไม่เพี้ยน
want("ราคาไม่เพี้ยน (patched = original)", Number.isFinite(pm.grand)&&pm.grand===om.grand, "patched="+pm.grand+" original="+om.grand);
// โครงสร้าง target
const T=pm.text;
want("หัว: ชื่อ+ประเภท+ขนาด+ลึก", /ตู้อลูมิเนียม \(ตู้เสื้อผ้า\) ขนาด 1\.2 × 2\.4 ม\. ลึก 0\.6 ม\./.test(T));
want("รายการ: บานหน้า Future Tech 2 บาน", T.includes("บานหน้า Future Tech 2 บาน"));
want("รายการ: ชั้นวางอลูมิเนียม 5 ชั้น", T.includes("ชั้นวางอลูมิเนียม 5 ชั้น"));
want("รายการ: ผนังตู้ 3 ด้าน (ซ้าย / ขวา / หลัง)", T.includes("ผนังตู้ 3 ด้าน (ซ้าย / ขวา / หลัง)"));
want("รายการ: ผนัง · ไม่ถูกตัดที่ ·", T.includes("ผนัง: ซ้าย อลูทึบ · ขวา กระจก · หลัง อลูทึบ"));
want("มีหัวข้อ 'รายละเอียด'", T.includes("รายละเอียด"));
want("สเปค: สีโครง + รหัส", T.includes("สีโครง: อบพิเศษ · รหัส KL10232A"));
want("สเปค: ชั้นอลูมิเนียม สี", T.includes("ชั้นอลูมิเนียม: อบพิเศษ"));
want("สเปค: กระจกผนังขวา default", T.includes("กระจก (ผนังขวา): กระจกใส/ใสเขียว หนา 5–6 มม."));
want("ไม่มีขนาดซ้ำ (1.2 × 2.4 ม.) แบบวงเล็บ", !T.includes("(1.2 × 2.4 ม.)"));
want("ไม่มี marker ดิบ ###", !T.includes("###"));
want("ไม่มีหัวเก่า 'รายละเอียดงาน'", !T.includes("รายละเอียดงาน"));
want("ไม่มี JS error", P.err.length===0, P.err.slice(0,2).join(" | "));

// เคส 2: รหัสว่าง → เตือน
const p2=buildCab(null,P.doc,P.w,{...CFG_MAIN,code:""});
want("รหัสว่าง → ⚠ ต้องระบุรหัสสี", p2.text.includes("⚠ ต้องระบุรหัสสี"));

// เคส 3: ไม่ติ๊กผนัง → ไม่มีกระจก + ข้อความชนปูน
const p3=buildCab(null,P.doc,P.w,{...CFG_MAIN,walls:[]});
want("ไม่ติ๊กผนัง → 'ไม่ติ๊ก (ทุกด้านชนผนังปูน)'", p3.text.includes("ผนัง: ไม่ติ๊ก (ทุกด้านชนผนังปูน)"));
want("ไม่ติ๊กผนัง → ไม่มีบรรทัดกระจก", !p3.text.includes("กระจกใส/ใสเขียว"));

// เคส 4: สีขาว (idx 0) → ไม่มีรหัส ไม่มีเตือน
const p4=buildCab(null,P.doc,P.w,{...CFG_MAIN,color:"0",code:""});
want("สีขาว → ไม่มีเตือนรหัส", !p4.text.includes("⚠ ต้องระบุรหัสสี"));

let pass=0;
console.log("\n=== VERIFY G4 ใบ รายการ/รายละเอียด (sandbox) ===");
for(const c of checks){ console.log((c.ok?"  ✓ ":"  ✗ ")+c.n+(c.d?"  ["+c.d+"]":"")); if(c.ok)pass++; }
console.log("\nสรุป: ผ่าน "+pass+"/"+checks.length);
console.log("\n--- ใบ cabinet (เคสหลัก · ข้อความ #quoteContent ส่วนรายการ) ---");
// โชว์เฉพาะส่วนรายการ (ตัด header ใบ)
const seg=pm.text.replace(/\s+/g," ");
const i=seg.indexOf("ตู้อลูมิเนียม"); console.log(seg.slice(i, i+400));
process.exit(pass===checks.length?0:1);
