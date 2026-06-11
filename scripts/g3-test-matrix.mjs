// g3-test-matrix.mjs — render เคสเทส G3 ทุก product+option (แบบงานจริง · มีรางน้ำ) → JSON
// ใช้: node scripts/g3-test-matrix.mjs   → เขียน scripts/g3-test-data.json
import { JSDOM, VirtualConsole } from "jsdom";
import { readFileSync, writeFileSync } from "node:fs";
const dom = new JSDOM(readFileSync("public/calculator/index.html","utf8"),{runScripts:"dangerously",pretendToBeVisual:true,virtualConsole:new VirtualConsole(),url:"http://localhost/"});
await new Promise(r=>{dom.window.addEventListener("load",r);setTimeout(r,1500);});
const w=dom.window, doc=w.document;
const fire=(el,t)=>el.dispatchEvent(new w.Event(t,{bubbles:true}));
const setF=(ch,s,v)=>{const el=ch.querySelector(s); if(el){el.value=String(v);fire(el,"input");fire(el,"change");}};
const setF2=(id,v)=>{const el=doc.getElementById(id); if(el){el.value=String(v);fire(el,"input");fire(el,"change");}};
const chk=(ch,s,b)=>{const el=ch.querySelector(s); if(el){el.checked=b;fire(el,"change");}};
{const sp=doc.getElementById("svc-protect"); if(sp&&sp.checked){sp.checked=false;fire(sp,"change");}}
setF2("custName","เทสครบ");setF2("qdate","11-06-69");setF2("sellerName","เฟิร์น");
function run(c){
  doc.getElementById("items").innerHTML="";
  w.addItem(doc.getElementById("items"));
  const ch=[...doc.querySelectorAll("#items .ch")].pop();
  setF(ch,".i-group",3);
  const ps=ch.querySelector(".i-prod"); if(!ps.querySelector('option[value="'+c.prod+'"]')) ps.innerHTML=w.prodOptionsG6("3");
  ps.value=c.prod; fire(ps,"change");
  setF(ch,".i-w",c.w); setF(ch,".i-h",c.h);
  const col=ch.querySelector(".i-color"); if(col&&col.options.length>1){col.value=col.options[1].value;fire(col,"change");}
  for(const e of Object.entries(c.opts||{})) setF(ch,e[0],e[1]);
  for(const e of Object.entries(c.chk||{})) chk(ch,e[0],e[1]);
  w.calcQuote(); w.genQuote();
  const html=doc.getElementById("quoteContent").innerHTML;
  let detail="";
  for(const r of [...html.matchAll(/<tr[^>]*>([\s\S]*?)<\/tr>/g)].map(m=>m[1])){
    const tds=[...r.matchAll(/<td[^>]*>([\s\S]*?)<\/td>/g)].map(m=>m[1].replace(/<\/div>/g,"\n").replace(/<[^>]+>/g,"").replace(/&nbsp;/g," ").replace(/[ \t]+/g," ").split("\n").map(s=>s.trim()).filter(Boolean).join(" / "));
    if(tds.length>=2 && /หลังคา|ฝ้า|ผนัง|ISOWALL|เมทัลชีท|ชินโคไลท์/.test(tds[1]||"")){ detail=tds[1]; break; }
  }
  const it=w.readItem(ch);
  return { id:c.id, grp:c.grp, prod:c.prod, size:c.w+"×"+c.h, detail, msgs:(it&&it.r&&it.r.msgs)?it.r.msgs.slice():[], sell:(it&&it.r)?Math.round(it.r.sell):0, area:(it&&it.r)?+it.r.a.toFixed(2):0 };
}
const C=[];
const STD=()=>({".o-roofend":"รางน้ำ",".o-guttersys":"ท่อ",".o-gutter-pipecolor":"ขาว",".o-rfdrain":"ดำ"});
const STDCHK={".o-rfleaf":true};
const merge=(...o)=>Object.assign({},...o);
const rb=(grp,prod,w_,h_,id,extra,xchk)=>({id,grp,prod,w:w_,h:h_,opts:merge(STD(),extra||{}),chk:merge(STDCHK,xchk||{})});
C.push(rb("หลังคาหลัก","roof_vinyl",4,3,"ไวนิล (รางน้ำท่อ + ท่อ PVC — งานจริง)"));
C.push({id:"ไวนิล (ปลายปล่อย ยื่นไม่มีราง)",grp:"หลังคาหลัก",prod:"roof_vinyl",w:4,h:3,opts:{".o-roofend":"ปล่อย"}});
C.push(rb("หลังคาหลัก","roof_delight",4,3,"ดีไลท์ (รางน้ำท่อ — งานจริง)"));
C.push(rb("หลังคาหลัก","roof_polyton",4,3,"โพลีตัน (รางน้ำท่อ — งานจริง)"));
C.push(rb("หลังคาหลัก","roof_laminate",4,3,"กระจกลามิเนต (รางน้ำท่อ — งานจริง)"));
for(let i=7;i<=14;i++) C.push(rb("เมทัลชีท","imp"+i,4,3,"เมทัลชีท imp"+i+" (รางน้ำท่อ)"));
for(let i=15;i<=20;i++) C.push(rb("ชินโคไลท์","imp"+i,4,3,"ชินโคไลท์ imp"+i+" (รางน้ำท่อ)"));
C.push({id:"ฝ้าอลู ไทยทิพย์ สีขาว-ดำ",grp:"ฝ้า",prod:"ceil_cshape",w:4,h:3,opts:{".o-ckolor":"ขาว-ดำ"}});
C.push({id:"ฝ้าอลู ไทยทิพย์ สีลายไม้",grp:"ฝ้า",prod:"ceil_cshape",w:4,h:3,opts:{".o-ckolor":"ลายไม้"}});
C.push({id:"ฝ้าไม้เทียม remood มาตรฐาน",grp:"ฝ้า",prod:"ceil_bsc",w:4,h:3,opts:{".o-ckolor":"มาตรฐาน(ขาว-ซิลเวอร์)"}});
C.push({id:"ฝ้าไม้เทียม remood ลายไม้/สีอื่น",grp:"ฝ้า",prod:"ceil_bsc",w:4,h:3,opts:{".o-ckolor":"ลายไม้/สีอื่น"}});
C.push({id:"ฝ้าฉาบเรียบ ทาสีขาว",grp:"ฝ้า",prod:"ceiling_smooth",w:4,h:3,opts:{".o-ceilfinish":"ทาสีขาว"}});
C.push({id:"ฝ้าฉาบเรียบ +เฉียง +ฉนวน",grp:"ฝ้า",prod:"ceiling_smooth",w:4,h:3,opts:{".o-ceilfinish":"ทาสีรองพื้นสีขาว"},chk:{".o-ceilslope":true,".o-insul":true}});
C.push({id:"ISOWALL 10ซม. สีขาว",grp:"ผนัง",prod:"isowall",w:3,h:2.4,opts:{".o-isothick":"10",".o-isocolor":"ขาว"}});
C.push({id:"ISOWALL 10 +เหล็กชุบ +ฉนวน",grp:"ผนัง",prod:"isowall",w:3,h:2.4,opts:{".o-isothick":"10",".o-isocolor":"ขาว",".o-wallframe":"เหล็กชุบ"},chk:{".o-insul":true}});
C.push({id:"ผนังภายนอก สมาร์ท12 ทาขาว",grp:"ผนัง",prod:"wall_ext",w:3,h:2.4,opts:{".o-smartthick":"12",".o-wallpaint":"ทาสีขาว"}});
C.push({id:"ผนังภายนอก +ฉนวน +เหล็กชุบ",grp:"ผนัง",prod:"wall_ext",w:3,h:2.4,opts:{".o-smartthick":"12",".o-wallpaint":"ทาสีรองพื้นสีขาว",".o-wallframe":"เหล็กชุบ"},chk:{".o-insul":true}});
C.push({id:"ผนังภายใน สมาร์ท12 ทาขาว",grp:"ผนัง",prod:"wall_int",w:3,h:2.4,opts:{".o-smartthick":"12",".o-wallpaint":"ทาสีขาว"}});
C.push({id:"ผนังภายใน +ฉนวน",grp:"ผนัง",prod:"wall_int",w:3,h:2.4,opts:{".o-smartthick":"12",".o-wallpaint":"ทาสีขาว"},chk:{".o-insul":true}});
const V=(id,extra,xchk)=>C.push({id,grp:"ออปชั่นหลังคา",prod:"roof_vinyl",w:6,h:3.5,opts:merge(STD(),extra||{}),chk:merge(STDCHK,xchk||{})});
V("แปเดี่ยว (+รางน้ำท่อ)",{".o-roofbatten":"แปเดี่ยว"});
V("โครงเหล็กชุบซิงค์ (+รางน้ำท่อ)",{".o-roofframe":"โครงเหล็กชุบซิงค์"});
V("รางน้ำ โซ่ ทิวลิป สีน้ำตาล",{".o-guttersys":"โซ่",".o-gutter-chainpat":"ทิวลิป",".o-gutter-chaincolor":"น้ำตาล",".o-rfdrain":"ขาว"});
V("รางน้ำ โซ่ โลตัส สีขาว",{".o-guttersys":"โซ่",".o-gutter-chainpat":"โลตัส",".o-gutter-chaincolor":"ขาว"});
V("รางน้ำท่อ สีดำ + ท่อทิ้งเทา",{".o-gutter-pipecolor":"ดำ",".o-rfdrain":"เทา"});
V("เสริม เสาแผง 2 ต้น (+รางน้ำ)",{".o-rfpolep":"2"});
V("เสริม เสา 4นิ้วx8 จำนวน 2 ต้น (+รางน้ำ)",{".o-rfpole4":"2"});
V("เสริม คานเหล็กถัก รุ่น1 ยาว6 (+รางน้ำ)",{".o-rfbeam":"2400",".o-rfbeamlen":"6"});
V("เสริม โซ่รางน้ำ 2 เส้น (+รางน้ำ)",{".o-rfchain":"2"});
V("เสริม ครอบท่อ PVC ยาว6 (+รางน้ำ)",{".o-rfpvc":"6"});
V("เสริม ซ่อนสโลป คอมโพสิต (+รางน้ำ)",{".o-rfhs":"comp",".o-rfhsh":"0.3",".o-rfhsl":"6",".o-rfhsn":"2"});
V("เสริม ซ่อนสโลป สมาร์ทบอร์ด (+รางน้ำ)",{".o-rfhs":"smart",".o-rfhsh":"0.3",".o-rfhsl":"6",".o-rfhsn":"2"});
V("เสริม ปิดซ่อนราง 20ซม.x6ม. (+รางน้ำ)",{".o-rfgcw":"20",".o-rfgch":"10",".o-rfgcl":"6"});
V("เสริม ครอบคาน 0.3x6 (+รางน้ำ)",{".o-rfbcw":"0.3",".o-rfbcl":"6"});
V("เสริม วัสดุปิดรอยต่อ สีขาว (+รางน้ำ)",{},{".o-rfsealer":true});
V("เสริม เพลทเหล็กล่าง + เหล็กดึง (+รางน้ำ)",{},{".o-rfplate":true,".o-rfpull":true});
C.push({id:"เสริม รางน้ำเสริม อลู ยาว6 (ปลายปล่อย)",grp:"ออปชั่นหลังคา",prod:"roof_vinyl",w:6,h:3.5,opts:{".o-roofend":"ปล่อย",".o-rfgut":"1000",".o-rfgutlen":"6"}});
C.push({id:"เสริม ปิดปลายกันน้ำ ยาว6 (ปลายปล่อย)",grp:"ออปชั่นหลังคา",prod:"roof_vinyl",w:6,h:3.5,opts:{".o-roofend":"ปล่อย",".o-rfeave":"6"}});
V("หลังคาเลื่อน 2 บาน (+รางน้ำ)",{".o-spanels":"2"},{".o-slide":true});
V("หลังคาเลื่อน 4 บาน (+รางน้ำ)",{".o-spanels":"4"},{".o-slide":true});
V("หลังคาเลื่อน 6 บาน (+รางน้ำ)",{".o-spanels":"6"},{".o-slide":true});
V("หลังคาผสม ไวนิล+ลามิเนต 5ตร.ม. (+รางน้ำ)",{".o-roof2":"roof_laminate",".o-roof2area":"5"});
V("หลังคาผสม ไวนิล+โพลีตัน 8ตร.ม. (+รางน้ำ)",{".o-roof2":"roof_polyton",".o-roof2area":"8"});
const SC=(id,prod,extra)=>C.push({id,grp:"สีวัสดุมุง",prod,w:4,h:3,opts:merge(STD(),extra),chk:merge({},STDCHK)});
SC("สีไวนิล สีเทา","roof_vinyl",{".o-roofcolor":"สีเทา"});
SC("สีไวนิล สีน้ำตาล","roof_vinyl",{".o-roofcolor":"สีน้ำตาล"});
SC("สีดีไลท์ DG-4 เทาโซล่าร์","roof_delight",{".o-roofcolor":"DG-4 สีเทาโซล่าร์"});
SC("สีโพลีตัน Clear 101 ใส","roof_polyton",{".o-roofcolor":"Clear 101 สีใส (แสงผ่าน 83%)"});
SC("สีโพลีตัน Bronze 107 ชาใส","roof_polyton",{".o-roofcolor":"Bronze 107 สีชาใส (แสงผ่าน 30%)"});
SC("สีเมทัลชีท imp7 สีน้ำตาล","imp7",{".o-roofcolor":"สีน้ำตาล"});
SC("สีชินโค imp15 สี Light Grey","imp15",{".o-roofcolor":"สี Light Grey"});
SC("สีชินโค imp16 สี Modern Grey","imp16",{".o-roofcolor":"สี Modern Grey"});
C.push(rb("ลามิเนต","roof_laminate",4,3,"ลามิเนต ฟิล์มใส 4+4 (+รางน้ำ)",{".o-lamfilm":"ใส",".o-lamthick":"4+4"}));
C.push(rb("ลามิเนต","roof_laminate",4,3,"ลามิเนต ฟิล์มเขียว 5+5 (+รางน้ำ)",{".o-lamfilm":"เขียว",".o-lamthick":"5+5"}));
const out=C.map(run);
writeFileSync("scripts/g3-test-data.json",JSON.stringify(out,null,1),"utf8");
console.log("รวม "+out.length+" เคส · บันทึก scripts/g3-test-data.json");
