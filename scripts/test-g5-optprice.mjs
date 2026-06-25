// test-g5-optprice.mjs — เทส "ออปชั่น G5 มุ้ง กดแล้วราคาขยับจริงไหม" (delta ก่อน-หลัง) + ออกใบระบบ
// READ-ONLY: render index.html สดด้วย jsdom · ไม่แก้ไฟล์ · ออกผล terminal + ใบ HTML
// ใช้: node scripts/test-g5-optprice.mjs
import { JSDOM, VirtualConsole } from "jsdom";
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");
const OUT = join(ROOT, "docs", "กลุ่ม5-มุ้ง", "TEST-G5-optprice-2026-06-17.html");

const html = readFileSync(join(ROOT,"public/calculator/index.html"),"utf8");
const vc = new VirtualConsole(); const jsErr=[];
vc.on("jsdomError",e=>{ if(!/scrollTo|Not implemented/i.test(e.message)) jsErr.push(e.message); });
const dom = new JSDOM(html,{runScripts:"dangerously",pretendToBeVisual:true,virtualConsole:vc,url:"http://localhost/calculator/index.html"});
await new Promise(r=>{ if(dom.window.document.readyState==="complete")r(); else dom.window.addEventListener("load",r); setTimeout(r,2000); });
const w=dom.window, doc=w.document;
const fire=(el,t)=>el.dispatchEvent(new w.Event(t,{bubbles:true}));
const noSvc=()=>["svc-protect","svc-lift","svc-travel","svc-ship"].forEach(id=>{const e=doc.getElementById(id);if(e&&e.checked){e.checked=false;fire(e,"change");}});

function renderProd(id, wv="1.0", hv="2.0"){
  doc.getElementById("items").innerHTML="";
  try{ w.addItem(doc.getElementById("items")); }catch(e){ return null; }
  const ch=doc.querySelector("#items .ch"); if(!ch) return null;
  const gs=ch.querySelector(".i-group"); if(gs){ gs.value="5"; fire(gs,"change"); }
  const ps=ch.querySelector(".i-prod"); if(!ps||!ps.querySelector('option[value="'+id+'"]')) return {ch,ok:false};
  ps.value=id; fire(ps,"change");
  const wi=ch.querySelector(".i-w"),hi=ch.querySelector(".i-h");
  if(wi){wi.value=wv;fire(wi,"input");fire(wi,"change");}
  if(hi){hi.value=hv;fire(hi,"input");fire(hi,"change");}
  return {ch,ok:true,ps};
}
function setOpt(ch,sel,val){var e=ch.querySelector(sel);if(e){e.value=val;fire(e,"change");return true;}return false;}
function setChk(ch,sel,on){var e=ch.querySelector(sel);if(e){e.checked=!!on;fire(e,"change");return true;}return false;}
// อ่านยอดขายต่อ item (ผ่าน readItem ของระบบ — เงินจริงก่อน svc/vat)
function sellOf(ch){
  try{ const r=w.readItem(ch); return r&&r.r?Math.round(r.r.sell):NaN; }catch(e){ return NaN; }
}

const log=[]; const P=(...a)=>{ log.push(a.join(" ")); console.log(...a); };

// ===================== ส่วน 1: เทสออปชั่นราคาขยับ =====================
P("===== เทส G5: ออปชั่นกดแล้วราคาขยับจริงไหม (delta) =====\n");
const optResults=[];
function testOpt(id, label, apply, opts){
  const r=renderProd(id, (opts&&opts.w)||"1.0", (opts&&opts.h)||"2.0"); if(!r||!r.ok){ optResults.push({id,label,base:"-",after:"-",delta:"-",verdict:"⚠ เลือกรุ่นไม่ได้"}); return; }
  noSvc();
  const base=sellOf(r.ch);
  apply(r.ch);
  const after=sellOf(r.ch);
  const delta=(isNaN(base)||isNaN(after))?NaN:after-base;
  let verdict;
  if(isNaN(delta)) verdict="🔴 อ่านราคาไม่ได้";
  else if(opts&&opts.expectZero) verdict=(delta===0)?"🟢 ไม่คิดเงิน (ถูก)":("🟡 ขยับ "+delta+" (คาดว่า 0)");
  else verdict=(delta>0)?("🟢 +"+delta.toLocaleString()):("🔴 ไม่ขยับ (ควรเพิ่มเงิน)");
  optResults.push({id,label,base:isNaN(base)?"-":base.toLocaleString(),after:isNaN(after)?"-":after.toLocaleString(),delta:isNaN(delta)?"-":(delta>=0?"+":"")+delta.toLocaleString(),verdict});
  P(`[${id}] ${label}: ${isNaN(base)?"-":base.toLocaleString()} → ${isNaN(after)?"-":after.toLocaleString()}  (Δ ${isNaN(delta)?"-":delta.toLocaleString()})  ${verdict}`);
}

// imp21 เฟรมเล็ก (screen_addon · มี ผ้า/สีกรอบ/ลักษณะเปิด/ครอบวงกบ/โหมดB)
// หมายเหตุ: ขนาดเล็ก 1.0×2.0 ค่าสี ~540 ถูก roundUp(พัน) กลืน → Δ0 (ไม่ใช่บั๊ก) · เคสใหญ่ด้านล่างพิสูจน์ว่าคิดจริง
testOpt("imp21","สีกรอบมุ้ง (สีพิเศษ index 2 · ขนาดเล็ก 1.0×2.0)", ch=>{ const m=ch.querySelector(".o-mscolor"); if(m&&m.options.length>2){ m.value=m.options[2].value; fire(m,"change"); } });
testOpt("imp21","สีกรอบมุ้ง (สีพิเศษ index 2 · ขนาดใหญ่ 3.0×2.0)", ch=>{ const m=ch.querySelector(".o-mscolor"); if(m&&m.options.length>2){ m.value=m.options[2].value; fire(m,"change"); } }, {w:"3.0",h:"2.0"});
testOpt("imp21","ผ้ามุ้ง → กันแมว (cat)", ch=>{ setOpt(ch,".o-screenfabric","cat"); });
testOpt("imp23","ผ้ามุ้ง → นิรภัย (safety)", ch=>{ setOpt(ch,".o-screenfabric","safety"); });
testOpt("imp21","ครอบวงกบ 3 ด้าน", ch=>{ setOpt(ch,".o-fcsides","3"); }, {expectZero:false});
testOpt("imp21","ลักษณะเปิด=บานเปิด (label-only)", ch=>{ setOpt(ch,".o-mosqopenstyle","บานเปิด"); }, {expectZero:true});
testOpt("imp21","โหมด B ติดบานเดิม", ch=>{ setChk(ch,".o-screen_existing",true); });
// มุ้งจีบ/รังผึ้ง/ม้วน — สีกรอบ
testOpt("imp28","สีกรอบมุ้ง (จีบตีนตะขาบ)", ch=>{ const m=ch.querySelector(".o-mscolor"); if(m&&m.options.length>2){ m.value=m.options[2].value; fire(m,"change"); } });
testOpt("mj_blackout","สีกรอบมุ้ง (Blackout รังผึ้ง)", ch=>{ const m=ch.querySelector(".o-mscolor"); if(m&&m.options.length>2){ m.value=m.options[2].value; fire(m,"change"); } });
testOpt("imp29","สีกรอบมุ้ง (ม้วนไฟเบอร์)", ch=>{ const m=ch.querySelector(".o-mscolor"); if(m&&m.options.length>2){ m.value=m.options[2].value; fire(m,"change"); } });

// ===================== ส่วน 2: เทส "คิดต่อบาน" (bug ที่ audit เจอ) =====================
P("\n===== เทส 'คิดต่อบาน': เฟรมใหญ่ imp23 ขนาดเท่ากัน 1 บาน vs 2 บาน =====");
function panelTest(id){
  // 1 บาน 2.4x2.0
  let r=renderProd(id,"2.4","2.0"); if(!r||!r.ok){ P(`[${id}] เลือกไม่ได้`); return; }
  const pn1=r.ch.querySelector(".i-panels"); if(pn1){ pn1.value="1"; fire(pn1,"input"); fire(pn1,"change"); }
  noSvc(); const s1=sellOf(r.ch);
  // 2 บาน 2.4x2.0 (พื้นที่รวมเท่าเดิม)
  r=renderProd(id,"2.4","2.0");
  const pn2=r.ch.querySelector(".i-panels"); const hasPanels=!!pn2;
  if(pn2){ pn2.value="2"; fire(pn2,"input"); fire(pn2,"change"); }
  noSvc(); const s2=sellOf(r.ch);
  P(`[${id}] มีช่องจำนวนบาน(.i-panels): ${hasPanels?"มี":"ไม่มี"}`);
  P(`   1 บาน 2.4×2.0 = ${isNaN(s1)?"-":s1.toLocaleString()}  ·  2 บาน 2.4×2.0 = ${isNaN(s2)?"-":s2.toLocaleString()}`);
  P(`   → ${s2>s1?"🟢 2 บานแพงกว่า (คิดต่อบานแล้ว)":(s2===s1?"🔴 ราคาเท่ากัน (ยังคิดพื้นที่รวม · bug)":"🟡 2 บานถูกกว่า??")}`);
  return {id,hasPanels,s1,s2};
}
const pt23=panelTest("imp23");
const pt21=panelTest("imp21");

// ===================== ส่วน 3: ออกใบระบบ (เทียบใบจริง) =====================
P("\n===== ออกใบระบบ G5 (ดูข้อความที่พิมพ์ลงใบ) =====");
const QSAMPLES=[
  ["imp21","มุ้งเฟรมเล็ก",ch=>{ setOpt(ch,".o-screenfabric","fiber"); setOpt(ch,".o-mosqopenstyle","บานเลื่อน"); }],
  ["imp23","มุ้งเฟรมใหญ่ นิรภัย",ch=>{ setOpt(ch,".o-screenfabric","safety"); setOpt(ch,".o-mosqopenstyle","บานเปิด"); }],
  ["mj_screen_safety","มุ้งจีบนิรภัย",ch=>{}],
  ["imp28","มุ้งจีบตีนตะขาบ",ch=>{ const m=ch.querySelector(".o-mscolor"); if(m&&m.options.length>2){ m.value=m.options[2].value; fire(m,"change"); } }],
];
let quotesHtml="";
for(const [id,nm,applyOpt] of QSAMPLES){
  const r=renderProd(id);
  if(!r||!r.ok){ quotesHtml+=`<h3>${nm} (${id})</h3><p style="color:#999">เลือกไม่ได้</p>`; P(`[${id}] ${nm}: เลือกไม่ได้`); continue; }
  applyOpt(r.ch); noSvc();
  let qc=null;
  try{ w.calcQuote&&w.calcQuote(); w.genQuote&&w.genQuote(); qc=doc.getElementById("quoteContent"); }catch(e){}
  // ดึงข้อความรายการแรกจากใบ (text)
  let itemTxt="";
  try{ const cells=qc?qc.querySelectorAll("td"):[]; itemTxt=[...cells].map(c=>c.textContent.trim()).filter(Boolean).slice(0,8).join(" | "); }catch(e){}
  P(`[${id}] ${nm}:`);
  P(`   ใบ → ${itemTxt.slice(0,180)}`);
  quotesHtml+=`<h3>${nm} (<code>${id}</code>)</h3><div class="quotebox">${qc&&qc.innerHTML&&qc.innerHTML.trim()?qc.innerHTML:'<p style="color:#999">ใบว่าง</p>'}</div>`;
}

if(jsErr.length) P("\n⚠ JS error:", jsErr.slice(0,3).join(" | "));

// ===================== HTML =====================
const optRow=r=>`<tr><td><code>${r.id}</code></td><td>${r.label}</td><td style="text-align:right">${r.base}</td><td style="text-align:right">${r.after}</td><td style="text-align:right;font-weight:700">${r.delta}</td><td>${r.verdict}</td></tr>`;
const out=`<!doctype html><html lang="th"><head><meta charset="utf-8"><title>เทสราคาออปชั่น G5</title><style>
body{font-family:'Leelawadee UI',Tahoma,sans-serif;font-size:13px;color:#1f2937;max-width:980px;margin:0 auto;padding:16px;background:#f9fafb;}
h1{color:#B3151D;font-size:20px;border-bottom:3px solid #B3151D;padding-bottom:6px;}
h2{color:#B3151D;font-size:15px;margin-top:20px;}
h3{color:#7A1015;font-size:13.5px;margin:14px 0 4px;}
table{border-collapse:collapse;width:100%;background:#fff;margin:8px 0;font-size:12.5px;}
th,td{border:1px solid #e5e7eb;padding:6px 8px;text-align:left;vertical-align:top;}
th{background:#fbe9ea;color:#B3151D;}
code{background:#f3f4f6;padding:0 4px;border-radius:3px;font-size:11.5px;}
.quotebox{border:1px solid #e5e7eb;border-radius:8px;padding:10px;margin:6px 0 16px;background:#fff;overflow-x:auto;}
.quotebox table{font-size:11.5px;}
pre{background:#1e293b;color:#e2e8f0;padding:10px;border-radius:8px;overflow-x:auto;font-size:11.5px;line-height:1.5;}
</style></head><body>
<h1>🧪 เทสราคาออปชั่น G5 มุ้ง — กดแล้วขยับจริงไหม + คิดต่อบาน + ใบระบบ</h1>
<p>render <code>index.html</code> สดด้วย jsdom · ยอด = readItem().r.sell (เงินก่อน svc/vat) · 2026-06-17</p>
<h2>1. ออปชั่นกดแล้วราคาขยับ (delta)</h2>
<table><tr><th>รุ่น</th><th>ออปชั่น</th><th>ก่อน</th><th>หลัง</th><th>Δ</th><th>ผล</th></tr>
${optResults.map(optRow).join("\n")}
</table>
<h2>2. คิดต่อบาน (1 บาน vs 2 บาน · พื้นที่เท่ากัน 2.4×2.0)</h2>
<table><tr><th>รุ่น</th><th>ช่องจำนวนบาน</th><th>1 บาน</th><th>2 บาน</th><th>ผล</th></tr>
${[pt23,pt21].filter(Boolean).map(p=>`<tr><td><code>${p.id}</code></td><td>${p.hasPanels?"มี":"ไม่มี"}</td><td style="text-align:right">${isNaN(p.s1)?"-":p.s1.toLocaleString()}</td><td style="text-align:right">${isNaN(p.s2)?"-":p.s2.toLocaleString()}</td><td>${p.s2>p.s1?"🟢 คิดต่อบาน":(p.s2===p.s1?"🔴 พื้นที่รวม (bug)":"🟡")}</td></tr>`).join("\n")}
</table>
<h2>3. ใบระบบ (ดูข้อความที่ลงใบ)</h2>
${quotesHtml}
<h2>log</h2><pre>${log.join("\n").replace(/&/g,"&amp;").replace(/</g,"&lt;")}</pre>
</body></html>`;
writeFileSync(OUT, out, "utf8");
P("\n📄 รายงาน:", OUT);
