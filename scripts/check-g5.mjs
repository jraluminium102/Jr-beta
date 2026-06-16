// check-g5.mjs — ตรวจงาน G5 (มุ้ง) ที่ dev แก้ใน index.html "เหมือนดราฟไหม"
// เทียบ 4 มิติ: ปุ่ม(4หมวด→รุ่น) · ออปชั่น · ราคา(vs golden) · อุปกรณ์เสริม
// เกณฑ์: ดราฟ G5 (DRAFT-G5-ux-FULL) + มติพี่นัท 15-16 มิ.ย. (memory g5-mosquito-formux) · ราคา = engine จริง (golden)
// ใช้:  node scripts/check-g5.mjs <วันที่>
import { JSDOM, VirtualConsole } from "jsdom";
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");
const OUTDIR = join(ROOT, "docs", "กลุ่ม5-มุ้ง");
const DATE = process.argv[2] || "today";
const OUT = join(OUTDIR, `CHECK-G5-vs-draft-${DATE}.html`);

// ===== สเปก G5 (source = ดราฟ + มติ 15-16 มิ.ย.) =====
// ปุ่ม: 4 หมวด drill-down (MOSQ_GRP_PRODS)
const EXPECTED_GROUPS = {
  frame: ["imp21","imp22","imp23","imp30"],
  pleat: ["imp28","mj_sd_basic","mj_screen_safety"],
  honey: ["mj_blackout","mj_sd_twoway","mj_keep_twoway","mj_keep_honey"],
  roll:  ["imp29","mj_kick_150","mj_kick_300","mj_kick_600"],
};
const HIDDEN = ["imp31","imp32","imp33","imp35"]; // ซ่อนจากชิปเมนู (เก็บ PRODUCTS+เรต · ใบเก่าเปิดได้)
// ออปชั่น/อุปกรณ์เสริม (on=ควรมี · off=ไม่ควรมี)
const EXPECTED_OPTS = [
  { cls:"o-screenfabric", label:"ผ้ามุ้ง (กันแมว/หนู/นิรภัย)", on:["imp21","imp23"], off:["mj_blackout","mj_screen_safety","imp29"], note:"เฉพาะมุ้งเฟรม imp21/22/23 (screen_addon) · มุ้งอื่นไม่มี" },
  { cls:"o-sfc-chipwrap", label:"สีผ้า (ตามชนิดผ้า)", on:["imp21"], off:["mj_blackout"], note:"เฉพาะเฟรม · sync ตามผ้า (กันแมว=ขาว/นิรภัย=ดำ)" },
  { cls:"o-mscolor", label:"สีกรอบมุ้ง", on:["imp21","imp28","mj_blackout","imp29"], off:["mj_screen_safety"], note:"เฉพาะ mscolor:true · จีบนิรภัย(screen_safety) ทำสีไม่ได้→ไม่มี" },
  { cls:"o-mosqopenstyle", label:"ลักษณะการเปิด (เลื่อน/เปิด · ขึ้นใบ)", on:["imp21","imp23"], off:["imp22","mj_blackout","imp29"], note:"เฉพาะมุ้งเฟรม imp21(เล็ก)/imp23(ใหญ่) · imp22 ติดตายไม่มี · label-only ต่อท้ายชื่อใบ 'บานเลื่อน'/'บานเปิด'" },
  { cls:"o-fcsides", label:"ครอบวงกบอลู (อุปกรณ์เสริม)", on:["imp21","mj_blackout","mj_screen_safety","imp29"], note:"ทุกสินค้ามุ้ง" },
  { cls:"o-screen_existing", label:"ติดบานเดิม โหมด B", on:["imp21","mj_blackout"], note:"ทุกตัว" },
  { cls:"o-extrawork", label:"งานเสริม/วิศวกรรม", on:["imp21","mj_blackout"], note:"ทุกตัว" },
  { cls:"o-removeold", label:"รื้อของเดิม", on:["imp21","mj_blackout"], note:"ทุกตัว" },
];

// ===== boot =====
const html = readFileSync(join(ROOT,"public/calculator/index.html"),"utf8");
const vc = new VirtualConsole(); const jsErr=[];
vc.on("jsdomError",e=>{ if(!/scrollTo|Not implemented/i.test(e.message)) jsErr.push(e.message); });
const dom = new JSDOM(html,{runScripts:"dangerously",pretendToBeVisual:true,virtualConsole:vc,url:"http://localhost/calculator/index.html"});
await new Promise(r=>{ if(dom.window.document.readyState==="complete")r(); else dom.window.addEventListener("load",r); setTimeout(r,2000); });
const w=dom.window, doc=w.document;
const fire=(el,t)=>el.dispatchEvent(new w.Event(t,{bubbles:true}));
const noSvc=()=>["svc-protect","svc-lift","svc-travel","svc-ship"].forEach(id=>{const e=doc.getElementById(id);if(e&&e.checked){e.checked=false;fire(e,"change");}});

function renderProd(id){
  doc.getElementById("items").innerHTML="";
  try{ w.addItem(doc.getElementById("items")); }catch(e){ return null; }
  const ch=doc.querySelector("#items .ch"); if(!ch) return null;
  const gs=ch.querySelector(".i-group"); if(gs){ gs.value="5"; fire(gs,"change"); }
  const ps=ch.querySelector(".i-prod"); if(!ps||!ps.querySelector('option[value="'+id+'"]')) return {ch,ok:false};
  ps.value=id; fire(ps,"change");
  const wi=ch.querySelector(".i-w"),hi=ch.querySelector(".i-h");
  if(wi){wi.value="1.0";fire(wi,"input");fire(wi,"change");}
  if(hi){hi.value="2.0";fire(hi,"input");fire(hi,"change");}
  return {ch,ok:true,ps};
}
function optClasses(ch){ const set=new Set(); ch.querySelectorAll("*").forEach(e=>{ if(e.classList) e.classList.forEach(c=>{ if(/^o-/.test(c)) set.add(c); }); }); return [...set].sort(); }

const rows=[];
const sev={ok:"🟢",miss:"🔴",extra:"🟠",warn:"🟡",info:"⬜"};
const add=(s,area,title,detail)=>rows.push({s,area,title,detail});

// ===== 1. ปุ่ม 4 หมวด + รุ่น (MOSQ_GRP_PRODS) =====
let MGP=null; try{ MGP=w.eval("MOSQ_GRP_PRODS"); }catch(e){}
if(!MGP){ add("miss","ปุ่ม","drill-down มุ้ง (MOSQ_GRP_PRODS)","ไม่พบ MOSQ_GRP_PRODS → มุ้งยังไม่ทำ drill-down หมวด→รุ่น"); }
else {
  const gotGroups=Object.keys(MGP);
  const wantGroups=Object.keys(EXPECTED_GROUPS);
  const missG=wantGroups.filter(g=>!gotGroups.includes(g)), extraG=gotGroups.filter(g=>!wantGroups.includes(g));
  if(missG.length) add("miss","ปุ่ม","หมวดมุ้งขาด","ขาดหมวด: "+missG.join(", ")+" (ควรมี 4: เฟรม/จีบ/จีบม่านรังผึ้ง/ม้วน)");
  else if(extraG.length) add("extra","ปุ่ม","หมวดมุ้งเกิน","เกินหมวด: "+extraG.join(", "));
  else add("ok","ปุ่ม","4 หมวดมุ้งครบ (เฟรม/จีบ/จีบม่านรังผึ้ง/ม้วน)", gotGroups.join(", "));
  for(const [grp,ids] of Object.entries(EXPECTED_GROUPS)){
    const got=(MGP[grp]||[]).map(x=>Array.isArray(x)?x[0]:x);
    const miss=ids.filter(id=>!got.includes(id)), extra=got.filter(id=>!ids.includes(id));
    if(miss.length) add("miss","ปุ่ม","["+grp+"] รุ่นขาด","ขาด: "+miss.join(", "));
    else if(extra.length) add("extra","ปุ่ม","["+grp+"] รุ่นเกิน","เกิน: "+extra.join(", ")+" (ควรมี "+ids.length+" รุ่น)");
    else add("ok","ปุ่ม","["+grp+"] รุ่นครบ", ids.length+" รุ่น: "+ids.join(", "));
  }
  // imp31/32/33/35 ต้องซ่อนจากชิป
  const allInChip=Object.values(MGP).flat().map(x=>Array.isArray(x)?x[0]:x);
  const leaked=HIDDEN.filter(id=>allInChip.includes(id));
  add(leaked.length?"miss":"ok","ปุ่ม","ซ่อน imp31/32/33/35 จากชิป", leaked.length?("ยังโผล่ในชิป: "+leaked.join(", ")+" → ต้องเอาออก (เก็บแค่ใน PRODUCTS)"):"ซ่อนครบ (จีบนิรภัย=mj_screen_safety ตัวเดียว · กันแมว/หนูเป็นผ้า) ✓");
}

// ===== 2. ออปชั่น + อุปกรณ์เสริม (on ต้องมี · off ต้องไม่มี) =====
for(const o of EXPECTED_OPTS){
  for(const id of (o.on||[])){
    const r=renderProd(id); if(!r||!r.ok){ add("warn","ออปชั่น",o.label+" บน "+id,"เลือกรุ่นนี้ไม่ได้ (ข้าม)"); continue; }
    const present=!!r.ch.querySelector("."+o.cls);
    add(present?"ok":"miss","ออปชั่น",o.label+" บน "+id, present?("พบ ."+o.cls+" · "+o.note):("ไม่พบ ."+o.cls+" → ควรมี: "+o.note));
  }
  for(const id of (o.off||[])){
    const r=renderProd(id); if(!r||!r.ok) continue;
    const present=!!r.ch.querySelector("."+o.cls);
    if(present) add("extra","ออปชั่น",o.label+" โผล่ผิดที่ บน "+id, "พบ ."+o.cls+" ทั้งที่ไม่ควรมี → "+o.note);
    else add("ok","ออปชั่น",o.label+" ไม่โผล่บน "+id+" (ถูก)", o.note);
  }
}

// ===== 3. probe เฉพาะ G5 =====
// 3a. นิรภัย (mj_screen_safety) ห้ามมีผ้ามุ้ง/สีกรอบ
{ const r=renderProd("mj_screen_safety");
  if(r&&r.ok){ const fab=r.ch.querySelector(".o-screenfabric"), msc=r.ch.querySelector(".o-mscolor");
    add((!fab&&!msc)?"ok":"warn","ออปชั่น","จีบนิรภัย ไม่มีผ้ามุ้ง/สีกรอบ", (!fab&&!msc)?"ถูก (นิรภัยกรอบทำสีไม่ได้ · ไม่ใช่เฟรม)":("ยังพบ: "+[fab?"ผ้ามุ้ง":"",msc?"สีกรอบ":""].filter(Boolean).join("+")));
  }
}
// 3b. OPTION ทางเลือกลูกค้า — มุ้งต้อง "ระบุเอง" (ไม่มี กระจก/มือจับ/หลังคา)
{ const r=renderProd("mj_blackout");
  if(r&&r.ok&&w.ocCatOptions){ const cats=(w.ocCatOptions(r.ch).match(/value="(\w+)"/g)||[]).map(x=>x.replace(/value="|"/g,"")).filter(Boolean);
    const bad=cats.filter(c=>["glass","handle","roof"].includes(c));
    add(bad.length?"miss":"ok","ออปชั่น","OPTION ทางเลือกลูกค้า มุ้ง = ระบุเอง", bad.length?("ยังมีหมวดของบาน: "+bad.join(", ")+" (มุ้งไม่มีกระจก/มือจับ/หลังคา) → filter ผิด"):("มุ้งเหลือแค่ "+cats.join(",")+" (ไม่มีกระจก/มือจับ/หลังคา) ✓"));
    const sum=r.ch.querySelector(".oc-block summary");
    if(sum){ const txt=sum.textContent; const hasGlass=/กระจก|มือจับ|หลังคา/.test(txt);
      add(hasGlass?"miss":"ok","ออปชั่น","หัวข้อ OPTION มุ้ง ไม่พูดกระจก/มือจับ", hasGlass?("หัวข้อยังเขียน: "+txt.slice(0,45)+" → แก้ให้ตรง dropdown จริง"):("หัวข้อ: "+txt.replace("＋ OPTION ทางเลือกลูกค้า","").trim()+" ✓"));
    }
  }
}

// ===== 4. ราคา vs golden baseline =====
const baseF = join(__dirname,"golden-baseline.json");
if(existsSync(baseF)){
  const base=JSON.parse(readFileSync(baseF,"utf8")); const bmap=new Map(base.rows.map(r=>[r.key,r]));
  const allIds=[...Object.values(EXPECTED_GROUPS).flat(),...HIDDEN];
  let okN=0,diffN=0,chk=0;
  for(const id of allIds){ const b=bmap.get("5:"+id); if(!b||b.total==null) continue; chk++;
    doc.getElementById("items").innerHTML=""; w.addItem(doc.getElementById("items"));
    const ch=doc.querySelector("#items .ch"); const gs=ch.querySelector(".i-group"); gs.value="5"; fire(gs,"change");
    const ps=ch.querySelector(".i-prod"); if(!ps.querySelector('option[value="'+id+'"]')) continue; ps.value=id; fire(ps,"change");
    const dim=base.dims&&base.dims["5"]||[1.0,2.0];
    const wi=ch.querySelector(".i-w"),hi=ch.querySelector(".i-h"); wi.value=String(dim[0]);fire(wi,"input");fire(wi,"change"); hi.value=String(dim[1]);fire(hi,"input");fire(hi,"change");
    ["svc-protect","svc-lift","svc-travel","svc-ship"].forEach(s=>{const e=doc.getElementById(s);if(e&&e.checked){e.checked=false;fire(e,"change");}});
    let cur=NaN; try{ w.calcQuote&&w.calcQuote(); w.genQuote&&w.genQuote(); const g=doc.querySelector("#quoteContent .qtot .g"); cur=g?parseInt((g.textContent||"").replace(/\.\d+/g,"").replace(/[^\d]/g,""),10):NaN; }catch(e){}
    if(cur===b.total) okN++; else { diffN++; add("warn","ราคา",id+" ราคาขยับจาก golden","golden="+b.total+" · ตอนนี้="+cur); }
  }
  add(diffN===0?"ok":"warn","ราคา","ราคามุ้งเทียบ golden baseline", chk?(diffN===0?(okN+" รุ่น ตรง baseline (ราคาไม่เพี้ยน)"):(okN+" ตรง · "+diffN+" ขยับ)")):"ไม่พบ key 5:* ใน golden (รัน golden-snapshot --save?)");
} else add("warn","ราคา","golden baseline","ไม่พบ golden-baseline.json — รัน node scripts/golden-snapshot.mjs --save");

// ===== 6. ใบเสนอราคาตัวอย่าง (genQuote · เลือกออปชั่นครบ ให้เห็นว่าออปชั่น+สีอลูขึ้นใบจริง) =====
const QSAMPLES=[["imp21","มุ้งเฟรมเล็ก ไฟเบอร์"],["mj_blackout","มุ้งจีบ Blackout รังผึ้ง"],["mj_kick_300","มุ้งม้วนเตะ 300"]];
function setOpt(ch,sel,val){var e=ch.querySelector(sel);if(e){e.value=val;fire(e,"change");return true;}return false;}
let quotesHtml="";
for(const [id,nm] of QSAMPLES){
  const r=renderProd(id);
  if(!r||!r.ok){ quotesHtml+=`<h3>${nm} (${id})</h3><p style="color:#999">เลือกรุ่นนี้ไม่ได้</p>`; continue; }
  const ch=r.ch; const picked=[];
  // เลือกออปชั่นครบ: ผ้ามุ้ง(เฉพาะเฟรม) · สีกรอบอลู(สีพิเศษ) · ครอบวงกบ
  if(setOpt(ch,".o-screenfabric","cat")) picked.push("ผ้ากันแมว/หมา");
  const msc=ch.querySelector(".o-mscolor"); if(msc&&msc.options.length>2){ msc.value=msc.options[2].value; fire(msc,"change"); picked.push("สีกรอบอลู: "+(msc.options[2].text||"").replace(/\(.*/,"").trim()); }
  if(setOpt(ch,".o-fcsides","3")) picked.push("ครอบวงกบ 3 ด้าน");
  noSvc(); let qc=null;
  try{ w.calcQuote&&w.calcQuote(); w.genQuote&&w.genQuote(); qc=doc.getElementById("quoteContent"); }catch(e){}
  quotesHtml+=`<h3>${nm} (<code>${id}</code>) · 1.0×2.0 ม. · <span style="color:#185FA5;font-weight:400;font-size:12px;">เลือก: ${picked.join(" + ")||"ไม่มีออปชั่น"}</span></h3><div class="quotebox">${qc&&qc.innerHTML&&qc.innerHTML.trim()?qc.innerHTML:'<p style="color:#999">ใบว่าง — genQuote ไม่ออก</p>'}</div>`;
}

// ===== 5. dump ออปชั่นต่อรุ่น =====
const dump=[];
for(const id of [...Object.values(EXPECTED_GROUPS).flat(),...HIDDEN]){ const r=renderProd(id); if(!r||!r.ok){ dump.push({id,opts:"(เลือกไม่ได้)"}); continue; } dump.push({id,opts:optClasses(r.ch).join(" ")||"(ไม่มี o-*)"}); }
if(jsErr.length) add("miss","engine","JS error ตอน render", jsErr.slice(0,3).join(" | "));

// ===== สรุป + HTML =====
const order={miss:0,extra:1,warn:2,ok:3,info:4};
rows.sort((a,b)=>order[a.s]-order[b.s]);
const cnt=s=>rows.filter(r=>r.s===s).length;
const esc=s=>String(s).replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;");
const trow=r=>`<tr class="${r.s}"><td>${sev[r.s]}</td><td>${esc(r.area)}</td><td>${esc(r.title)}</td><td>${esc(r.detail)}</td></tr>`;
const html_out=`<!doctype html><html lang="th"><head><meta charset="utf-8"><title>CHECK G5 vs ดราฟ</title><style>
body{font-family:'Leelawadee UI',Tahoma,sans-serif;font-size:13px;color:#1f2937;max-width:980px;margin:0 auto;padding:16px;background:#f9fafb;}
h1{color:#B3151D;font-size:20px;border-bottom:3px solid #B3151D;padding-bottom:6px;}
.sum{display:flex;gap:8px;flex-wrap:wrap;margin:10px 0;}
.pill{padding:6px 12px;border-radius:20px;font-weight:700;}
.pm{background:#fee2e2;color:#991b1b;}.po{background:#ffedd5;color:#9a3412;}.pw{background:#fef9c3;color:#854d0e;}.pk{background:#dcfce7;color:#166534;}
table{border-collapse:collapse;width:100%;background:#fff;margin:8px 0;font-size:12.5px;}
th,td{border:1px solid #e5e7eb;padding:6px 8px;text-align:left;vertical-align:top;}
th{background:#fbe9ea;color:#B3151D;}
tr.miss td{background:#fef2f2;}tr.warn td{background:#fefce8;}tr.extra td{background:#fff7ed;}
h2{color:#B3151D;font-size:15px;margin-top:18px;}
code{background:#f3f4f6;padding:0 4px;border-radius:3px;font-size:11.5px;}
.dump td{font-size:11px;}
.quotebox{border:1px solid #e5e7eb;border-radius:8px;padding:10px;margin:6px 0 16px;background:#fff;overflow-x:auto;}
.quotebox table{font-size:11.5px;}
h3{color:#7A1015;font-size:13.5px;margin:14px 0 4px;}
</style></head><body>
<h1>🔍 ตรวจงาน G5 (มุ้ง) — index.html (dev) เทียบ ดราฟ G5</h1>
<p>เกณฑ์: ดราฟ G5 (DRAFT-G5-ux-FULL) + มติพี่นัท 15-16 มิ.ย. · ราคา = engine จริง (golden baseline) · render index.html สดด้วย jsdom</p>
<div class="sum">
<span class="pill pm">🔴 ขาด/ผิด ${cnt("miss")}</span>
<span class="pill po">🟠 เกิน/ผิดที่ ${cnt("extra")}</span>
<span class="pill pw">🟡 ต้องเคาะ/ดูตา ${cnt("warn")}</span>
<span class="pill pk">🟢 ตรง ${cnt("ok")}</span>
</div>
<h2>ผลตรวจ (เรียง ขาด→เกิน→เคาะ→ตรง)</h2>
<table><tr><th></th><th>มิติ</th><th>หัวข้อ</th><th>รายละเอียด</th></tr>
${rows.map(trow).join("\n")}
</table>
<h2>📄 ใบเสนอราคาตัวอย่าง (จาก engine จริง · genQuote)</h2>
<p style="color:#6b7280;">ใบที่ระบบออกจริง — ดูรายการ/ราคา/ข้อความว่าถูกไหม (เฟรม/จีบ/ม้วน อย่างละ 1 ตัว · ขนาด 1.0×2.0 ม.)</p>
${quotesHtml}
<h2>ออปชั่นต่อรุ่น (dump · เทียบดราฟด้วยตา)</h2>
<table class="dump"><tr><th>รุ่น (id)</th><th>ออปชั่น control (.o-*) ที่ render จริง</th></tr>
${dump.map(d=>`<tr><td><code>${esc(d.id)}</code></td><td>${esc(d.opts)}</td></tr>`).join("\n")}
</table>
<p style="color:#6b7280;margin-top:14px;">หมายเหตุ: "ดูตา" = layout/หน้าตา script เทียบไม่ได้ → เปิดดราฟคู่ index.html (mirror) · imp31/32/33/35 = ซ่อนจากชิป แต่ยังอยู่ PRODUCTS (ใบเก่าเปิดได้)</p>
</body></html>`;
writeFileSync(OUT, html_out, "utf8");

console.log(`\n🔍 CHECK G5 vs ดราฟ — 🔴${cnt("miss")} ขาด · 🟠${cnt("extra")} เกิน/ผิดที่ · 🟡${cnt("warn")} เคาะ · 🟢${cnt("ok")} ตรง`);
rows.filter(r=>r.s==="miss").forEach(r=>console.log("  🔴 ["+r.area+"] "+r.title+" — "+r.detail));
rows.filter(r=>r.s==="extra").forEach(r=>console.log("  🟠 ["+r.area+"] "+r.title+" — "+r.detail));
rows.filter(r=>r.s==="warn").forEach(r=>console.log("  🟡 ["+r.area+"] "+r.title+" — "+r.detail));
console.log("\n📄 รายงาน: "+OUT);
