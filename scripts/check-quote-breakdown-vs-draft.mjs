/**
 * check-quote-breakdown-vs-draft.mjs
 * ตรวจ "วิธีคิดราคา / แยกราคาแต่ละส่วน" ใน index.html เทียบดราฟ A
 * 4 มิติ: (1) toolbar 3 ปุ่ม (2) split=breakdown โชว์ถูกไหม
 *         (3) firm=qFirmHTML สร้างจริง (4) ผสมบาน base+opt+subItems = sell
 * READ-ONLY — node scripts/check-quote-breakdown-vs-draft.mjs
 */
import { JSDOM, VirtualConsole } from "jsdom";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const ROOT = join(dirname(fileURLToPath(import.meta.url)),"..");
const html = readFileSync(join(ROOT,"public/calculator/index.html"),"utf8");
const jsErrs=[]; const vc=new VirtualConsole();
vc.on("jsdomError",e=>{ if(!/scrollTo|Not implemented|scrollIntoView/i.test((e&&e.message)||"")) jsErrs.push((e&&e.message)||String(e)); });
const dom=new JSDOM(html,{runScripts:"dangerously",pretendToBeVisual:true,virtualConsole:vc,url:"http://localhost/calculator/index.html"});
await new Promise(r=>{ if(dom.window.document.readyState==="complete")r(); else dom.window.addEventListener("load",r); setTimeout(r,3000); });
const w=dom.window, doc=w.document;
const fire=(el,t)=>el.dispatchEvent(new w.Event(t,{bubbles:true}));
const noSvc=()=>["svc-protect","svc-lift","svc-travel","svc-ship"].forEach(id=>{const e=doc.getElementById(id);if(e&&e.checked){e.checked=false;fire(e,"change");}});
const fmt=n=>Math.round(n).toLocaleString("en-US");

const RESULTS = [];
function addResult(section, mode, status, detail, extra=""){
  RESULTS.push({section,mode,status,detail,extra});
  const sym = status==="OK"?"✅":status==="WARN"?"🟡":"🔴";
  console.log(`${sym} [${section}][${mode}] ${detail}${extra?" — "+extra:""}`);
}

// ===== helper: render 1 item fresh =====
function renderItem(grp, pid, W, H, opts=[], panels=null){
  doc.getElementById("items").innerHTML="";
  try{ w.addItem(doc.getElementById("items")); }catch(e){ return {err:e.message}; }
  let ch=doc.querySelector("#items .ch"); if(!ch) return {err:"no ch"};
  const gs=ch.querySelector(".i-group"); if(gs){ gs.value=String(grp); fire(gs,"change"); }
  ch=doc.querySelector("#items .ch");
  const ps=ch.querySelector(".i-prod");
  if(!ps||!ps.querySelector(`option[value="${pid}"]`)) return {err:`no product: ${pid}`};
  ps.value=pid; fire(ps,"change");
  ch=doc.querySelector("#items .ch");
  ch.querySelector(".i-w").value=W; fire(ch.querySelector(".i-w"),"input");
  ch.querySelector(".i-h").value=H; fire(ch.querySelector(".i-h"),"input");
  if(panels){ const pe=ch.querySelector(".i-panels"); if(pe){ pe.value=String(panels); fire(pe,"change"); } }
  (opts||[]).forEach(([cls,v])=>{
    const el=ch.querySelector(cls); if(!el) return;
    if(el.type==="checkbox"){ el.checked=(v===true||v==="1"); fire(el,"change"); }
    else { el.value=String(v); fire(el,"input"); fire(el,"change"); }
  });
  noSvc();
  return ch;
}

function doCalc(ch){
  try{ w.calcQuote&&w.calcQuote(); }catch(e){ return {err:"calcQuote: "+e.message}; }
  let it; try{ it=w.readItem(ch); }catch(e){ it=null; }
  return it;
}

function getQC(){ return doc.getElementById("quoteContent"); }

function getQCText(){
  const qc=getQC(); return qc?qc.textContent:"";
}

function genWithMode(mode){
  if(mode==="cust"){ w.qMode="cust"; w.qSplit=false; }
  else if(mode==="split"){ w.qMode="split"; w.qSplit=true; }
  else { w.qMode="firm"; w.qSplit=true; }
  try{ w.genQuote&&w.genQuote(true); }catch(e){}
  return getQC();
}

// ===== SECTION 1: toolbar 3 ปุ่มมีจริงไหม =====
console.log("\n===== SECTION 1: toolbar 3 ปุ่ม =====");
{
  const custBtn=doc.getElementById("qmCust");
  const splitBtn=doc.getElementById("qmSplit");
  const firmBtn=doc.getElementById("qmFirm");
  if(custBtn) addResult("toolbar","ปุ่ม","OK","qmCust (👤 ลูกค้า) มี");
  else addResult("toolbar","ปุ่ม","FAIL","qmCust ไม่มีใน DOM — ดราฟต้องการปุ่ม 👤 ลูกค้า");
  if(splitBtn) addResult("toolbar","ปุ่ม","OK","qmSplit (📊 แยกราคา) มี");
  else addResult("toolbar","ปุ่ม","FAIL","qmSplit ไม่มีใน DOM — ดราฟต้องการปุ่ม 📊 แยกราคา");
  if(firmBtn) addResult("toolbar","ปุ่ม","OK","qmFirm (🔍 วิธีคิดราคา) มี");
  else addResult("toolbar","ปุ่ม","FAIL","qmFirm ไม่มีใน DOM — ดราฟต้องการปุ่ม 🔍 วิธีคิดราคา");

  // เช็คฟังก์ชัน setQMode มีจริง
  if(typeof w.setQMode==="function") addResult("toolbar","fn","OK","setQMode() มีจริง");
  else addResult("toolbar","fn","FAIL","setQMode() ไม่มี — ดราฟต้องการ function setQMode(m)");

  // เช็คฟังก์ชัน qCalcStepLines + qFirmHTML
  if(typeof w.qCalcStepLines==="function") addResult("toolbar","fn","OK","qCalcStepLines() มีจริง");
  else addResult("toolbar","fn","FAIL","qCalcStepLines() ไม่มี");
  if(typeof w.qFirmHTML==="function") addResult("toolbar","fn","OK","qFirmHTML() มีจริง");
  else addResult("toolbar","fn","FAIL","qFirmHTML() ไม่มี");

  // เช็คว่า qMode default = cust
  if(w.qMode==="cust") addResult("toolbar","default","OK","qMode default = cust (ตรงดราฟ)");
  else addResult("toolbar","default","WARN","qMode default = '"+w.qMode+"' (ดราฟต้องการ cust)");

  // เช็คป้ายปุ่ม
  if(custBtn){
    const t=custBtn.textContent||"";
    if(t.includes("ลูกค้า")) addResult("toolbar","label","OK","qmCust label มีคำว่า 'ลูกค้า'");
    else addResult("toolbar","label","WARN","qmCust label = '"+t.trim()+"' — ดราฟ = '👤 ลูกค้า'");
  }
  if(splitBtn){
    const t=splitBtn.textContent||"";
    if(t.includes("แยกราคา")) addResult("toolbar","label","OK","qmSplit label มีคำว่า 'แยกราคา'");
    else addResult("toolbar","label","WARN","qmSplit label = '"+t.trim()+"' — ดราฟ = '📊 แยกราคา'");
  }
  if(firmBtn){
    const t=firmBtn.textContent||"";
    if(t.includes("วิธีคิดราคา")) addResult("toolbar","label","OK","qmFirm label มีคำว่า 'วิธีคิดราคา'");
    else addResult("toolbar","label","WARN","qmFirm label = '"+t.trim()+"' — ดราฟ = '🔍 วิธีคิดราคา'");
  }
}

// ===== SECTION 2: cust mode — ไม่โชว์ breakdown box / firm block =====
console.log("\n===== SECTION 2: cust mode (G1 บานเลื่อน) =====");
{
  const ch=renderItem(1,"sliding_sms","1.8","2.1",null,2);
  if(ch.err){ addResult("cust","render","FAIL","render sliding_sms ล้มเหลว: "+ch.err); }
  else {
    const it=doCalc(ch);
    noSvc();
    if(it&&it.r&&it.r.sell>0) addResult("cust","sell","OK","sell = "+fmt(it.r.sell)+" บาท");
    else addResult("cust","sell","FAIL","sell = 0 หรือ render พัง");

    // cust mode
    w.setQMode("cust");
    const qc=genWithMode("cust");
    const qcH=qc?qc.innerHTML:"";
    // ต้องไม่มี q-bd (breakdown box)
    const hasBd=qcH.includes("q-bd");
    if(!hasBd) addResult("cust","breakdown","OK","cust mode ไม่โชว์กล่อง q-bd (ถูกต้อง)");
    else addResult("cust","breakdown","FAIL","cust mode โชว์กล่อง q-bd ทั้งที่ควรซ่อน (ดราฟ cust = ไม่มีกล่องแยกราคา)");
    // ต้องไม่มี qcs-block (firm block)
    const hasFirm=qcH.includes("qcs-block");
    if(!hasFirm) addResult("cust","firm_block","OK","cust mode ไม่โชว์ qcs-block (ถูกต้อง)");
    else addResult("cust","firm_block","FAIL","cust mode โชว์ qcs-block ทั้งที่ควรซ่อน");
  }
}

// ===== SECTION 3: split mode — G1 บานเลื่อน (L1 · ไม่มีออปชั่น) =====
console.log("\n===== SECTION 3: split mode — G1 บานเลื่อน L1 =====");
{
  const ch=renderItem(1,"sliding_sms","1.8","2.1",null,2);
  if(!ch.err){
    const it=doCalc(ch);
    noSvc();
    w.setQMode("split");
    const qc=genWithMode("split");
    const qcH=qc?qc.innerHTML:"";
    // ต้องมี q-bd
    if(qcH.includes("q-bd")) addResult("split","breakdown_box","OK","split mode โชว์กล่อง q-bd");
    else addResult("split","breakdown_box","FAIL","split mode ไม่มีกล่อง q-bd (ดราฟ split ต้องแตกราคาย่อย)");
    // ดึง breakdown จาก engine
    if(it&&it.r){
      const bd=it.r.breakdown||[];
      const sell=it.r.sell||0;
      addResult("split","breakdown_lines","OK","breakdown มี "+bd.length+" บรรทัด: "+bd.map(b=>b.n+" "+fmt(b.p)).join(" | "));
      if(bd.length>=1){
        const bdSum=bd.reduce((s,b)=>s+b.p,0);
        const diff=Math.abs(sell-bdSum);
        if(diff<=1500) addResult("split","reconcile","OK","sum breakdown = "+fmt(bdSum)+" vs sell = "+fmt(sell)+" (diff="+diff+" ≤ 1,500 OK)");
        else addResult("split","reconcile","FAIL","sum breakdown = "+fmt(bdSum)+" vs sell = "+fmt(sell)+" (diff="+diff+" เกิน 1,500 — ยอดไม่ตรง)");
      }
    }
    // ต้องไม่มี qcs-block ใน split mode
    if(!qcH.includes("qcs-block")) addResult("split","firm_block","OK","split mode ไม่โชว์ qcs-block (ถูกต้อง)");
    else addResult("split","firm_block","FAIL","split mode โชว์ qcs-block ทั้งที่ไม่ควร");
  }
}

// ===== SECTION 4: firm mode — G1 บานเลื่อน =====
console.log("\n===== SECTION 4: firm mode — G1 บานเลื่อน =====");
{
  const ch=renderItem(1,"sliding_sms","1.8","2.1",null,2);
  if(!ch.err){
    const it=doCalc(ch);
    noSvc();
    // เรียก qFirmHTML โดยตรง
    let firmLines=[];
    if(it&&typeof w.qFirmHTML==="function"){
      w.qMode="firm";
      const fh=w.qFirmHTML(it);
      if(fh&&fh.length>10){
        addResult("firm","qFirmHTML","OK","qFirmHTML สร้าง block ได้ ("+fh.length+" chars)");
        // ดูว่ามีบรรทัดพื้นที่ + เรต + ปัดขึ้น
        const hasArea=fh.includes("พื้นที่") || fh.includes("ตร.ม.");
        const hasRound=fh.includes("ปัดขึ้น");
        if(hasArea) addResult("firm","step_area","OK","firm block มีบรรทัดพื้นที่");
        else addResult("firm","step_area","FAIL","firm block ขาดบรรทัดพื้นที่ — ดราฟต้องการ 'พื้นที่ = W × H = X ตร.ม.'");
        if(hasRound) addResult("firm","step_round","OK","firm block มีบรรทัดปัดขึ้นพัน");
        else addResult("firm","step_round","FAIL","firm block ขาดบรรทัดปัดขึ้นพัน");
      } else {
        addResult("firm","qFirmHTML","FAIL","qFirmHTML คืน empty ทั้งที่ qMode=firm + sell>0");
      }
    }
    // genQuote firm — ตรวจ qcs-block
    w.setQMode("firm");
    const qc=genWithMode("firm");
    const qcH=qc?qc.innerHTML:"";
    if(qcH.includes("qcs-block")) addResult("firm","render","OK","firm mode โชว์ qcs-block ในใบ");
    else addResult("firm","render","FAIL","firm mode ไม่มี qcs-block ในใบ — ดราฟต้องการ 🔍 วิธีคิดราคา block");
    // ต้องมี q-bd ด้วย (firm = split + firm)
    if(qcH.includes("q-bd")) addResult("firm","split_box","OK","firm mode ยังโชว์ q-bd (split) ด้วย");
    else addResult("firm","split_box","WARN","firm mode ไม่มี q-bd — ดราฟ firm = split + วิธีคิด (ควรมีทั้งคู่)");
  }
}

// ===== SECTION 5: firm mode — G3 หลังคา =====
console.log("\n===== SECTION 5: firm mode — G3 หลังคา =====");
{
  const ch=renderItem(3,"imp7","4.0","3.0");
  if(ch.err){ addResult("G3-firm","render","FAIL","render G3 ล้มเหลว: "+ch.err); }
  else {
    const it=doCalc(ch);
    noSvc();
    if(it&&it.r&&it.r.sell>0){
      addResult("G3-firm","sell","OK","G3 หลังคา sell = "+fmt(it.r.sell));
      const bd=it.r.breakdown||[];
      addResult("G3-firm","breakdown","OK","breakdown "+bd.length+" บรรทัด: "+bd.map(b=>b.n+" "+fmt(b.p)).join(" | "));
      // firm
      w.qMode="firm";
      const fh=typeof w.qFirmHTML==="function"?w.qFirmHTML(it):"";
      if(fh&&fh.length>10) addResult("G3-firm","qFirmHTML","OK","G3 firm block สร้างได้");
      else addResult("G3-firm","qFirmHTML","FAIL","G3 qFirmHTML ว่าง — หลังคาควรมีบรรทัด เรต×พื้นที่");
      // ดูว่ามีเรต
      if(fh.includes("ตร.ม.")) addResult("G3-firm","step_sqm","OK","G3 firm มีบรรทัด ตร.ม.");
      else addResult("G3-firm","step_sqm","FAIL","G3 firm ขาดบรรทัด ตร.ม.");
    } else {
      addResult("G3-firm","sell","FAIL","G3 sell=0 หรือ render พัง");
    }
  }
}

// ===== SECTION 6: firm mode — G5 มุ้ง =====
console.log("\n===== SECTION 6: firm mode — G5 มุ้ง =====");
{
  const ch=renderItem(5,"imp21","1.0","2.0");
  if(ch.err){ addResult("G5-firm","render","FAIL","render G5 ล้มเหลว: "+ch.err); }
  else {
    const it=doCalc(ch);
    noSvc();
    if(it&&it.r&&it.r.sell>0){
      addResult("G5-firm","sell","OK","G5 มุ้ง sell = "+fmt(it.r.sell));
      w.qMode="firm";
      const fh=typeof w.qFirmHTML==="function"?w.qFirmHTML(it):"";
      if(fh&&fh.length>10) addResult("G5-firm","qFirmHTML","OK","G5 firm block สร้างได้");
      else addResult("G5-firm","qFirmHTML","WARN","G5 qFirmHTML ว่าง — มุ้งน่าจะมีบรรทัดเรต×พื้นที่");
    } else {
      addResult("G5-firm","sell","WARN","G5 sell=0 (อาจต้องการ imp22/imp23 แทน)");
      // ลอง imp22
      const ch2=renderItem(5,"imp22","1.0","2.0");
      if(!ch2.err){
        const it2=doCalc(ch2);
        noSvc();
        if(it2&&it2.r&&it2.r.sell>0){
          addResult("G5-firm","sell_imp22","OK","G5 imp22 sell = "+fmt(it2.r.sell));
          w.qMode="firm";
          const fh2=typeof w.qFirmHTML==="function"?w.qFirmHTML(it2):"";
          if(fh2&&fh2.length>10) addResult("G5-firm","qFirmHTML_imp22","OK","G5 imp22 firm block สร้างได้");
          else addResult("G5-firm","qFirmHTML_imp22","WARN","G5 imp22 firm block ว่าง");
        }
      }
    }
  }
}

// ===== SECTION 7: ผสมบาน — G1 sliding_sms + subItem กระจกติดตาย =====
// เคสเดิมที่เคยพัง: base + opt ≠ ยอดรวม (subItems ไม่นับ)
console.log("\n===== SECTION 7: ผสมบาน (subItems check) =====");
{
  // สร้าง setbox ผสมบาน (2 บานในชุด): sliding_sms + fixed_glass
  doc.getElementById("items").innerHTML="";
  try{
    w.addItem(doc.getElementById("items"));
    // set group
    let ch=doc.querySelector("#items .ch");
    ch.querySelector(".i-group").value="1"; fire(ch.querySelector(".i-group"),"change");
    ch=doc.querySelector("#items .ch");
    const ps=ch.querySelector(".i-prod");
    ps.value="sliding_sms"; fire(ps,"change");
    ch=doc.querySelector("#items .ch");
    ch.querySelector(".i-w").value="1.8"; fire(ch.querySelector(".i-w"),"input");
    ch.querySelector(".i-h").value="2.1"; fire(ch.querySelector(".i-h"),"input");
    noSvc();
    // อ่าน subItems
    let it; try{ it=w.readItem(ch); }catch(e){ it=null; }
    if(it){
      const sub=it.subItems||[];
      const sell=it.r&&it.r.sell||0;
      const bd=it.r&&it.r.breakdown||[];
      addResult("ผสมบาน","subItems","OK","subItems count = "+sub.length+" (งานเดี่ยวนี้ปกติ 0)");
      addResult("ผสมบาน","sell","OK","sell = "+fmt(sell));
      // ตรวจ qFirmHTML ว่า subItems ไม่มีก็ไม่ crash
      w.qMode="firm";
      let crash=false;
      try{ const fh=w.qFirmHTML(it); if(fh!==null&&fh!==undefined) {} }catch(e){ crash=true; addResult("ผสมบาน","qFirmHTML","FAIL","qFirmHTML crash: "+e.message); }
      if(!crash) addResult("ผสมบาน","qFirmHTML","OK","qFirmHTML(it) ไม่ crash");

      // ตรวจ qBdGet ว่า reconcile ถูก
      if(typeof w.qBdGet==="function"){
        const iid=ch.dataset&&ch.dataset.id;
        if(iid){
          const lines=w.qBdGet(it,iid,sell);
          if(lines&&lines.length>0){
            const bdSum=lines.reduce((s,l)=>s+(l.p||0),0);
            const diff=Math.abs(sell-bdSum);
            addResult("ผสมบาน","qBdGet","OK","qBdGet คืน "+lines.length+" บรรทัด sum="+fmt(bdSum)+" vs sell="+fmt(sell)+" diff="+diff);
            if(diff>1500) addResult("ผสมบาน","reconcile","FAIL","diff="+diff+" เกิน 1,500 — breakdown ไม่ match sell");
            else addResult("ผสมบาน","reconcile","OK","diff ≤ 1,500 ผ่าน");
          } else {
            addResult("ผสมบาน","qBdGet","WARN","qBdGet คืน [] (อาจ normal ถ้า breakdown ว่าง)");
          }
        }
      }
    }
  }catch(e){ addResult("ผสมบาน","render","FAIL","exception: "+e.message); }
}

// ===== SECTION 8: ผสมบาน 2 ชนิด (setbox) — ตรวจ subItemsTotal vs sell =====
// สร้าง setbox manual: บาน 1 (sliding_sms) + บาน 2 (fixed_glass subItem)
console.log("\n===== SECTION 8: subItemsTotal vs sell (setbox 2 บาน) =====");
{
  // render sliding_sms แล้วกรอก sub-item
  doc.getElementById("items").innerHTML="";
  try{
    w.addItem(doc.getElementById("items"));
    let ch=doc.querySelector("#items .ch");
    ch.querySelector(".i-group").value="1"; fire(ch.querySelector(".i-group"),"change");
    ch=doc.querySelector("#items .ch");
    ch.querySelector(".i-prod").value="sliding_sms"; fire(ch.querySelector(".i-prod"),"change");
    ch=doc.querySelector("#items .ch");
    ch.querySelector(".i-w").value="1.8"; fire(ch.querySelector(".i-w"),"input");
    ch.querySelector(".i-h").value="2.1"; fire(ch.querySelector(".i-h"),"input");
    // เพิ่ม sub-item (กระจกติดตาย)
    const addSub=ch.querySelector(".add-sub"); // ปุ่มเพิ่มบานย่อย
    if(addSub){ fire(addSub,"click"); }
    noSvc();
    let it; try{ it=w.readItem(ch); }catch(e){ it=null; }
    if(it){
      const sub=it.subItems||[];
      const sell=it.r&&it.r.sell||0;
      const subTotal=it.r&&it.r.subItemsTotal||0;
      addResult("setbox","subItems","OK","subItems.length = "+sub.length);
      addResult("setbox","sell","OK","sell = "+fmt(sell)+" (รวม subItemsTotal="+fmt(subTotal)+")");
      // firm block ต้องรวม subItems
      w.qMode="firm";
      const fh=typeof w.qFirmHTML==="function"?w.qFirmHTML(it):"";
      if(sub.length>0){
        // ตรวจว่า firm block มีบรรทัด subItems
        const hasSubLine=fh.includes("ผสมบาน");
        if(hasSubLine) addResult("setbox","firm_subItems","OK","firm block มีบรรทัด '(ผสมบาน)' สำหรับบานย่อย");
        else addResult("setbox","firm_subItems","FAIL","firm block ขาดบรรทัด '(ผสมบาน)' — ดราฟ mติ 24มิ.ย.: ต้องโชว์ทุกบานในชุด");
        // ตรวจ sum: breakdown + subItems = sell
        const bd=it.r&&it.r.breakdown||[];
        const bdSum=bd.reduce((s,b)=>s+b.p,0);
        const subSum=sub.reduce((s,s2)=>s+(s2.price||0),0);
        const total=bdSum+subSum;
        const diff=Math.abs(sell-total);
        addResult("setbox","reconcile_sub","OK","bd sum="+fmt(bdSum)+" + subSum="+fmt(subSum)+" = "+fmt(total)+" vs sell="+fmt(sell)+" diff="+diff);
        if(diff>5000) addResult("setbox","reconcile_sub","FAIL","diff="+diff+" ใหญ่เกิน — base+opt+subItems ≠ sell (bug เดิม)");
      } else {
        addResult("setbox","subItems","WARN","ไม่มี sub-item (อาจเพราะ .add-sub ไม่มีหรือ DOM ต่าง)");
      }
    }
  }catch(e){ addResult("setbox","render","FAIL","exception: "+e.message); }
}

// ===== SECTION 9: VAT ในใบ (cust/split/firm) =====
console.log("\n===== SECTION 9: VAT และ Grand Total =====");
{
  const ch=renderItem(1,"sliding_sms","1.8","2.1",null,2);
  if(!ch.err){
    doCalc(ch); noSvc();
    for(const mode of ["cust","split","firm"]){
      w.setQMode(mode);
      const qc=genWithMode(mode);
      const txt=qc?qc.textContent:"";
      const hasVat=txt.includes("VAT")||txt.includes("ภาษี")||txt.includes("7%");
      const hasGrand=txt.includes("รวมทั้งสิ้น")||txt.includes("รวมสุทธิ");
      if(hasVat) addResult("VAT",mode,"OK","mode="+mode+" โชว์ VAT");
      else addResult("VAT",mode,"WARN","mode="+mode+" ไม่เห็น VAT ในใบ");
      if(hasGrand) addResult("grand",mode,"OK","mode="+mode+" โชว์ยอดรวมทั้งสิ้น");
      else addResult("grand",mode,"WARN","mode="+mode+" ไม่เห็น 'รวมทั้งสิ้น'");
    }
  }
}

// ===== SECTION 10: no-print guard (firm block ไม่ควรพิมพ์) =====
console.log("\n===== SECTION 10: no-print guard =====");
{
  const ch=renderItem(1,"sliding_sms","1.8","2.1",null,2);
  if(!ch.err){
    const it=doCalc(ch); noSvc();
    w.qMode="firm";
    const fh=typeof w.qFirmHTML==="function"?w.qFirmHTML(it):"";
    if(fh.includes("no-print")||fh.includes("ไม่พิมพ์")) addResult("no-print","firm_block","OK","firm block มี no-print class / ข้อความ 'ไม่พิมพ์'");
    else addResult("no-print","firm_block","WARN","firm block ไม่เห็น no-print — ดราฟกำหนด: firm block ไม่พิมพ์ให้ลูกค้า");
  }
}

// ===== SECTION 11: qmCust active state default =====
console.log("\n===== SECTION 11: active state toolbar =====");
{
  // reset mode = cust
  if(typeof w.setQMode==="function") w.setQMode("cust");
  const custBtn=doc.getElementById("qmCust");
  const splitBtn=doc.getElementById("qmSplit");
  if(custBtn&&splitBtn){
    const custBg=custBtn.style.background||"";
    const splitBg=splitBtn.style.background||"";
    addResult("active","qmCust","OK","qmCust bg='"+custBg+"' (คาดว่า active=#B3151D)");
    addResult("active","qmSplit","OK","qmSplit bg='"+splitBg+"' (คาดว่า inactive=#fff)");
    // ตรวจ active
    if(custBg.includes("#B3151D")||custBg.toLowerCase().includes("b3151d"))
      addResult("active","cust_active","OK","cust mode active (bg=#B3151D) ตรงดราฟ");
    else if(custBg) addResult("active","cust_active","WARN","cust bg='"+custBg+"' ไม่ใช่ #B3151D");
    else addResult("active","cust_active","WARN","bg ว่าง (อาจตั้งผ่าน class ไม่ใช่ style)");
  }
}

// ===== สรุป =====
console.log("\n===== SUMMARY =====");
const fails=RESULTS.filter(r=>r.status==="FAIL");
const warns=RESULTS.filter(r=>r.status==="WARN");
const oks=RESULTS.filter(r=>r.status==="OK");
console.log("FAIL: "+fails.length+" | WARN: "+warns.length+" | OK: "+oks.length+" / total: "+RESULTS.length);
if(fails.length>0){
  console.log("\n--- FAIL items ---");
  fails.forEach(r=>console.log("  🔴 ["+r.section+"]["+r.mode+"] "+r.detail));
}
if(warns.length>0){
  console.log("\n--- WARN items ---");
  warns.forEach(r=>console.log("  🟡 ["+r.section+"]["+r.mode+"] "+r.detail));
}
if(jsErrs.length>0) console.log("\njsdom errors: "+jsErrs.length+" ("+jsErrs.slice(0,3).join("; ")+")");
