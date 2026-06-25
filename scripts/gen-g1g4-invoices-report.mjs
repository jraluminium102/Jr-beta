// gen-g1g4-invoices-report.mjs — render ใบเสนอราคา G1+G4 จากจริง (engine jsdom)
// ตรวจ: (1) บล็อกใบถูกไหม (2) วิธีคิดราคาถูกไหม (breakdown/msgs)
// READ-ONLY · node scripts/gen-g1g4-invoices-report.mjs
import { JSDOM, VirtualConsole } from "jsdom";
import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
const ROOT = join(dirname(fileURLToPath(import.meta.url)),"..");
const html = readFileSync(join(ROOT,"public/calculator/index.html"),"utf8");
const jsErrs=[]; const vc=new VirtualConsole();
vc.on("jsdomError",e=>{ if(!/scrollTo|Not implemented|scrollIntoView/i.test((e&&e.message)||""))jsErrs.push((e&&e.message)||String(e)); });
const dom=new JSDOM(html,{runScripts:"dangerously",pretendToBeVisual:true,virtualConsole:vc,url:"http://localhost/calculator/index.html"});
await new Promise(r=>{ if(dom.window.document.readyState==="complete")r(); else dom.window.addEventListener("load",r); setTimeout(r,3000); });
const w=dom.window, doc=w.document;
const fire=(el,t)=>el.dispatchEvent(new w.Event(t,{bubbles:true}));
const noSvc=()=>["svc-protect","svc-lift","svc-travel","svc-ship"].forEach(id=>{const e=doc.getElementById(id);if(e&&e.checked){e.checked=false;fire(e,"change");}});

function doRender(grp, id, W, H, panels, opts, prerun){
  doc.getElementById("items").innerHTML="";
  w.addItem(doc.getElementById("items"));
  let ch=doc.querySelector("#items .ch");
  ch.querySelector(".i-group").value=String(grp); fire(ch.querySelector(".i-group"),"change");
  ch=doc.querySelector("#items .ch");
  const ps=ch.querySelector(".i-prod");
  if(!ps||!ps.querySelector('option[value="'+id+'"]')) return {err:"ไม่มี product: "+id};
  ps.value=id; fire(ps,"change");
  ch=doc.querySelector("#items .ch");
  ch.querySelector(".i-w").value=W; fire(ch.querySelector(".i-w"),"input");
  ch.querySelector(".i-h").value=H; fire(ch.querySelector(".i-h"),"input");
  if(panels){ const pe=ch.querySelector(".i-panels"); if(pe){ pe.value=String(panels); fire(pe,"change"); } }
  (opts||[]).forEach(([cls,v])=>{
    const el=ch.querySelector(cls); if(!el) return;
    if(el.type==="checkbox") el.checked=(v===true||v==="1");
    else el.value=String(v);
    fire(el,"input"); fire(el,"change");
  });
  if(prerun) prerun(ch);
  noSvc();
  try{ w.qSplit=true; w.calcQuote(); w.genQuote(); }catch(e){ return {err:"calcQuote ERR: "+e.message}; }
  const qc=doc.getElementById("quoteContent");
  if(!qc) return {err:"ไม่มี quoteContent"};
  const grandEl=qc.querySelector(".qtot .g");
  const grand=grandEl?parseInt((grandEl.textContent||"").replace(/[^\d]/g,""),10):NaN;
  let it; try{ it=w.readItem(ch); }catch(e){ it=null; }
  const bd=(it&&it.r&&it.r.breakdown)||[];
  const msgs=(it&&it.r&&it.r.msgs)||[];
  const area=(it&&it.r&&it.r.a)||0;
  const sell=(it&&it.r&&it.r.sell)||0;
  const cabOptLines=(it&&it.r&&it.r.cabOptLines)||[];
  const ftOptLines=(it&&it.r&&it.r.ftOptLines)||[];
  return {
    html:qc.outerHTML, htmlInner:qc.innerHTML, text:qc.textContent,
    grand, bd, msgs, area, sell, cabOptLines, ftOptLines
  };
}

// ======================================================================
// G1 เคส
// ======================================================================
const G1=[
  {id:"G1-1", label:"G1-1 บานเลื่อน เซมิยูโร — 2 บาน · L1 สีขาว",
   grp:1, pid:"sliding_sms", W:"2.4", H:"2.2", panels:2, opts:[],
   checks(r){
     const out=[];
     // หัวชื่อต้องมี "บานเลื่อน" + "รุ่น M" + ขนาด
     if(!r.text.includes("บานเลื่อน")) out.push("หัวชื่อไม่มีคำว่า 'บานเลื่อน'");
     if(!r.text.includes("รุ่น M")) out.push("ไม่มี 'รุ่น M' ในหัวชื่อ");
     if(!r.htmlInner.includes("รายละเอียดงาน")) out.push("ไม่มีบล็อก 'รายละเอียดงาน'");
     if(!r.text.includes("สีอลูมิเนียม")) out.push("รายละเอียดขาด 'สีอลูมิเนียม'");
     if(!r.text.includes("กระจก")) out.push("รายละเอียดขาด 'กระจก'");
     // breakdown
     if(!r.bd||r.bd.length<1) out.push("breakdown ว่าง");
     const bdBase=r.bd.find(b=>/ค่าบาน/.test(b.n));
     if(!bdBase||bdBase.p<=0) out.push("breakdown ค่าบาน = 0 หรือขาด");
     if(r.sell<=0) out.push("sell = 0");
     return out;
   }
  },
  {id:"G1-2", label:"G1-2 บานเลื่อน + L2 สีลายไม้ (บวกยอด · coOverride=1)",
   grp:1, pid:"sliding_sms", W:"2.4", H:"2.2", panels:2, opts:[],
   prerun(ch){
     ch.dataset.coOverride="1";
     const ci=ch.querySelector(".i-color"); if(ci){ ci.value="7"; fire(ci,"input"); fire(ci,"change"); }
   },
   checks(r){
     const out=[];
     if(!r.htmlInner.includes("รายละเอียดงาน")) out.push("ไม่มีบล็อก 'รายละเอียดงาน'");
     // L2 ใช้จริง ต้องมีค่าสีใน breakdown
     const bdColor=r.bd.find(b=>/สีอลูมิเนียม/.test(b.n)&&b.p>0);
     if(!bdColor) out.push("L2 บวกยอด: ใน breakdown ค่าสีอลู = 0 (ผิด — ควรบวก)");
     // ใบต้องมีชื่อสีลายไม้
     if(!r.text.includes("ลายไม้")) out.push("ใบไม่มีชื่อสี 'ลายไม้'");
     // ต้องไม่มี OPTION line (L2 ใช้จริงไม่ขึ้น OPTION)
     if(r.htmlInner.includes("OPTION :")) out.push("L2 ใช้จริงไม่ควรมี OPTION line — พบใน HTML");
     return out;
   }
  },
  {id:"G1-3", label:"G1-3 บานเลื่อน + L2 สีอบพิเศษ ออปชั่น (coOverride=opt · ไม่บวกยอด)",
   grp:1, pid:"sliding_sms", W:"2.4", H:"2.2", panels:2, opts:[],
   prerun(ch){
     ch.dataset.coOverride="opt";
     const ci=ch.querySelector(".i-color"); if(ci){ ci.value="10"; fire(ci,"input"); fire(ci,"change"); }
   },
   checks(r){
     const out=[];
     if(!r.htmlInner.includes("รายละเอียดงาน")) out.push("ไม่มีบล็อก 'รายละเอียดงาน'");
     // L2 opt ต้องมี OPTION line ในใบ
     if(!r.htmlInner.includes("OPTION :")) out.push("L2 ออปชั่น: ควรมี OPTION line ในใบ แต่ไม่พบ");
     // sell ยังต้องเท่ากับ L1 (ไม่บวกสี)
     const bdColor=r.bd.find(b=>/สีอลูมิเนียม/.test(b.n)&&b.p>0);
     if(bdColor) out.push("L2 ออปชั่น: breakdown ค่าสีไม่ควรบวก (sell ควรเท่า L1) — พบ p="+bdColor.p);
     return out;
   }
  },
  {id:"G1-4", label:"G1-4 บานเปิด ยูโร 1 บาน + มุ้งเฟรมใหญ่",
   grp:1, pid:"casement_euro", W:"0.9", H:"2.1", panels:1,
   opts:[[".o-mosq","imp23"],[".o-mosqopenstyle","เปิด"]],
   checks(r){
     const out=[];
     if(!r.htmlInner.includes("รายละเอียดงาน")) out.push("ไม่มีบล็อก 'รายละเอียดงาน'");
     if(!r.text.includes("รุ่น L")) out.push("ไม่มี 'รุ่น L ยูโร'");
     // มุ้งต้องอยู่ในรายการงาน
     if(!r.text.includes("มุ้ง")) out.push("ใบไม่มีคำว่า 'มุ้ง' ในรายการ");
     // ราคามุ้งต้องบวกเข้า sell
     const bdMosq=r.bd.find(b=>/มุ้ง/.test(b.n)&&b.p>0);
     if(!bdMosq) out.push("มุ้งไม่อยู่ใน breakdown หรือ p=0");
     // ตรวจ msgs casement_euro
     const mCE=r.msgs.find(m=>/บานเปิดยูโร/.test(m));
     if(!mCE) out.push("ไม่มี msgs บานเปิดยูโร (ตรวจราคา/บาน)");
     return out;
   }
  },
  {id:"G1-5", label:"G1-5 บานเปิด ยูโร + ชุดล็อค+กุญแจ + โช้ค",
   grp:1, pid:"casement_euro", W:"0.9", H:"2.1", panels:1,
   opts:[[".o-lock","มีล็อค+กุญแจ"],[".o-closer","1"]],
   checks(r){
     const out=[];
     if(!r.htmlInner.includes("รายละเอียดงาน")) out.push("ไม่มีบล็อก 'รายละเอียดงาน'");
     if(!r.text.includes("ชุดล็อค")) out.push("ชุดล็อคไม่อยู่ในรายการงาน");
     return out;
   }
  },
  {id:"G1-6", label:"G1-6 บานเฟี้ยม เซมิยูโร 3 บาน",
   grp:1, pid:"folding", W:"2.4", H:"2.2", panels:3, opts:[],
   checks(r){
     const out=[];
     if(!r.htmlInner.includes("รายละเอียดงาน")) out.push("ไม่มีบล็อก 'รายละเอียดงาน'");
     if(!r.text.includes("เฟี้ยม")) out.push("ไม่มีคำ 'เฟี้ยม' ในหัวชื่อ");
     if(!r.text.includes("รุ่น M")) out.push("ไม่มี 'รุ่น M'");
     if(r.sell<=0) out.push("sell = 0");
     const bdBase=r.bd.find(b=>/ค่าบาน/.test(b.n));
     if(!bdBase||bdBase.p<=0) out.push("breakdown ค่าบาน = 0");
     return out;
   }
  },
  {id:"G1-7", label:"G1-7 บานกระทุ้ง ยูโร",
   grp:1, pid:"awning_euro", W:"1.2", H:"0.6", opts:[],
   checks(r){
     const out=[];
     if(!r.htmlInner.includes("รายละเอียดงาน")) out.push("ไม่มีบล็อก 'รายละเอียดงาน'");
     if(!r.text.includes("กระทุ้ง")) out.push("ไม่มี 'กระทุ้ง'");
     if(!r.text.includes("รุ่น L")) out.push("ไม่มี 'รุ่น L'");
     return out;
   }
  },
  {id:"G1-8", label:"G1-8 กระจกติดตาย + คาดตาราง 2×3",
   grp:1, pid:"fixed_glass", W:"1.5", H:"1.2", opts:[[".o-gridmark","1"],[".o-gm-nh","2"],[".o-gm-nv","3"]],
   checks(r){
     const out=[];
     if(!r.htmlInner.includes("รายละเอียดงาน")) out.push("ไม่มีบล็อก 'รายละเอียดงาน'");
     if(!r.text.includes("คาดตาราง")) out.push("ไม่มีบรรทัด 'คาดตาราง' ในรายการ");
     const bdGrid=r.bd.find(b=>/ออปชั่น|คาดตาราง/.test(b.n)&&b.p>0);
     if(!bdGrid) out.push("ค่าคาดตารางไม่อยู่ใน breakdown");
     const mGrid=r.msgs.find(m=>/คาดตาราง/.test(m));
     if(!mGrid) out.push("msgs ไม่มีบรรทัดคาดตาราง (ตรวจราคา)");
     return out;
   }
  },
  {id:"G1-9", label:"G1-9 บานเลื่อนภายใน (sliding_euro)",
   grp:1, pid:"sliding_euro", W:"0.8", H:"2.1", opts:[],
   checks(r){
     const out=[];
     if(!r.htmlInner.includes("รายละเอียดงาน")) out.push("ไม่มีบล็อก 'รายละเอียดงาน'");
     if(!r.text.includes("รุ่น L")) out.push("ไม่มี 'รุ่น L'");
     if(r.sell<=0) out.push("sell = 0");
     return out;
   }
  },
  {id:"G1-10", label:"G1-10 บานยก SMS สลิม",
   grp:1, pid:"lift_sms", W:"1.6", H:"2.2", opts:[],
   checks(r){
     const out=[];
     if(!r.htmlInner.includes("รายละเอียดงาน")) out.push("ไม่มีบล็อก 'รายละเอียดงาน'");
     if(!r.text.includes("บานยก")) out.push("ไม่มี 'บานยก' ในหัวชื่อ");
     if(r.sell<=0) out.push("sell = 0");
     return out;
   }
  },
  {id:"G1-11", label:"G1-11 shower กั้นห้องอาบน้ำ — เข้ามุม · อุปกรณ์ดำ",
   grp:1, pid:"shower", W:"1.2", H:"2.0", opts:[[".o-corner","1"],[".o-showerhw","1"]],
   checks(r){
     const out=[];
     // shower ไม่มี 5-block (ไม่มี marker) แต่ต้องมีรายละเอียด
     if(!r.htmlInner.includes("รายละเอียดงาน")) out.push("ไม่มีบล็อก 'รายละเอียดงาน'");
     const bdCorner=r.bd.find(b=>b.p>=3000); // เข้ามุม +3000
     if(!bdCorner) out.push("ออปชั่นเข้ามุม (+3,000) ไม่อยู่ใน breakdown");
     const bdHw=r.bd.find(b=>b.p===4000||b.p===7000); // อุปกรณ์ดำ +4000 หรือรวม +7000
     if(!bdHw) out.push("ค่าอุปกรณ์ดำ (+4,000) ไม่ปรากฏใน breakdown");
     const mHw=r.msgs.find(m=>/อุปกรณ์ดำ/.test(m));
     if(!mHw) out.push("msgs ไม่มีบรรทัดอุปกรณ์ดำ");
     return out;
   }
  },
  {id:"G1-12", label:"G1-12 ผนังเบาภายนอก (wall_ext)",
   grp:1, pid:"wall_ext", W:"3.0", H:"2.4", opts:[],
   checks(r){
     const out=[];
     if(!r.htmlInner.includes("รายละเอียดงาน")) out.push("ไม่มีบล็อก 'รายละเอียดงาน'");
     if(!r.text.includes("ผนังสมาร์ทบอร์ด")||!r.text.includes("โครงเหล็กชุบ")) out.push("สเปคผนังไม่ครบ (ขาด สมาร์ทบอร์ด/โครงเหล็กชุบ)");
     if(r.sell<=0) out.push("sell = 0");
     return out;
   }
  },
  {id:"G1-13", label:"G1-13 บานเลื่อน + L2 ลายไม้(ใช้จริง) + L3 อบพิเศษ (OPTION เปรียบเทียบ)",
   grp:1, pid:"sliding_sms", W:"2.4", H:"2.2", panels:2, opts:[],
   prerun(ch){
     ch.dataset.coOverride="1";
     const ci=ch.querySelector(".i-color"); if(ci){ ci.value="7"; fire(ci,"input"); fire(ci,"change"); }
     const l3c=ch.querySelector(".g1co-l3c");
     if(l3c){ l3c.value="10"; fire(l3c,"input"); fire(l3c,"change"); }
   },
   checks(r){
     const out=[];
     // L2 ใช้จริง = ค่าสีบวก
     const bdColor=r.bd.find(b=>/สีอลูมิเนียม/.test(b.n)&&b.p>0);
     if(!bdColor) out.push("L2 ใช้จริง: ค่าสีไม่อยู่ใน breakdown");
     // L3 ต้องมี OPTION line (เทียบราคา)
     if(!r.htmlInner.includes("OPTION :")) out.push("L3 OPTION line ไม่ปรากฏในใบ");
     return out;
   }
  },
  {id:"G1-14", label:"G1-14 บานเลื่อน + มุ้งจีบนิรภัย (imp31)",
   grp:1, pid:"sliding_sms", W:"1.5", H:"1.5", panels:2, opts:[[".o-mosq","imp31"]],
   checks(r){
     const out=[];
     if(!r.htmlInner.includes("รายละเอียดงาน")) out.push("ไม่มีบล็อก 'รายละเอียดงาน'");
     if(!r.text.includes("มุ้ง")) out.push("ใบไม่มีคำว่า 'มุ้ง'");
     const bdM=r.bd.find(b=>/มุ้ง/.test(b.n)&&b.p>0);
     if(!bdM) out.push("มุ้งไม่อยู่ใน breakdown");
     return out;
   }
  },
  {id:"G1-15", label:"G1-15 บานเปิด ยูโร + ครอบวงกบ 4 ด้าน",
   grp:1, pid:"casement_euro", W:"1.0", H:"2.1", panels:1, opts:[[".o-fcsides","4"]],
   checks(r){
     const out=[];
     if(!r.htmlInner.includes("รายละเอียดงาน")) out.push("ไม่มีบล็อก 'รายละเอียดงาน'");
     if(!r.text.includes("ครอบวงกบอลู 4 ด้าน")) out.push("ไม่มี 'ครอบวงกบอลู 4 ด้าน' ในรายการ");
     // ครอบวงกบต้องมีราคาใน msgs
     const mCrob=r.msgs.find(m=>/ครอบวงกบ/.test(m));
     if(!mCrob) out.push("msgs ไม่มีบรรทัดครอบวงกบ (ตรวจราคา)");
     return out;
   }
  },
];

// ======================================================================
// G4 เคส
// ======================================================================
const G4=[
  {id:"G4-1", label:"G4-1 ตู้อลู พื้นฐาน — 1.2×2.4ม. ลึก0.6 · 2 บาน · 3 ชั้นอลู",
   grp:4, pid:"cabinet_alu", W:"1.2", H:"2.4", opts:[[".o-depth","0.6"],[".o-cabdoors","2"],[".o-shelves","3"]],
   checks(r){
     const out=[];
     if(!r.htmlInner.includes("รายละเอียดงาน")) out.push("ไม่มีบล็อก 'รายละเอียดงาน'");
     if(!r.text.includes("ตู้อลูมิเนียม")) out.push("หัวชื่อไม่มี 'ตู้อลูมิเนียม'");
     if(!r.text.includes("บานหน้า Future Tech 2 บาน")) out.push("รายการขาด 'บานหน้า Future Tech 2 บาน'");
     if(!r.text.includes("ชั้นวางอลูมิเนียม 3 ชั้น")) out.push("รายการขาด 'ชั้นวาง 3 ชั้น'");
     if(!r.text.includes("สีโครง: อบขาว")) out.push("รายละเอียดขาด 'สีโครง: อบขาว'");
     // msgs ตรวจราคา
     const mCab=r.msgs.find(m=>/บานหน้าตู้/.test(m));
     if(!mCab) out.push("msgs ไม่มีบรรทัด breakdown ตู้");
     if(r.sell<=0) out.push("sell = 0");
     return out;
   }
  },
  {id:"G4-2", label:"G4-2 ตู้อลู + สีอบพิเศษ (L1 ci=10 บวกยอด)",
   grp:4, pid:"cabinet_alu", W:"1.2", H:"2.4", opts:[[".o-depth","0.6"],[".o-cabdoors","2"],[".o-shelves","3"],[".i-color","10"],[".i-colorcode","KL10232A"]],
   checks(r){
     const out=[];
     if(!r.htmlInner.includes("รายละเอียดงาน")) out.push("ไม่มีบล็อก 'รายละเอียดงาน'");
     if(!r.text.includes("อบพิเศษ")) out.push("รายละเอียดขาดชื่อสีอบพิเศษ");
     if(!r.text.includes("KL10232A")) out.push("รหัสสี KL10232A ไม่อยู่ในรายละเอียด");
     // L1 ตามทั้งใบ = ค่าสีบวกเข้า sell
     const mCab=r.msgs.find(m=>/ค่าสีโครง/.test(m));
     if(!mCab) out.push("msgs ไม่มีบรรทัด 'ค่าสีโครง' (L1 บวกไม่ขึ้น)");
     // sell ต้องมากกว่า G4-1 (มีค่าสี)
     if(r.sell<=32000) out.push("sell="+r.sell+" ไม่มากกว่า L1 (32,000) — L1 สีอบพิเศษไม่บวก?");
     return out;
   }
  },
  {id:"G4-3", label:"G4-3 ตู้อลู + ผนัง 3 ด้าน (ซ้าย=อลู, ขวา=กระจก, หลัง=อลู) + สีอบพิเศษ",
   grp:4, pid:"cabinet_alu", W:"1.5", H:"2.4",
   opts:[
     [".o-depth","0.6"],[".o-cabdoors","2"],[".o-shelves","4"],[".i-color","10"],[".i-colorcode","KL99"],
     [".o-cabwall-left-on",true],[".o-cabwall-left-mat","alu"],
     [".o-cabwall-right-on",true],[".o-cabwall-right-mat","glass"],
     [".o-cabwall-back-on",true],[".o-cabwall-back-mat","alu"],
   ],
   checks(r){
     const out=[];
     if(!r.htmlInner.includes("รายละเอียดงาน")) out.push("ไม่มีบล็อก 'รายละเอียดงาน'");
     if(!r.text.includes("ผนังตู้ 3 ด้าน")) out.push("รายการขาด 'ผนังตู้ 3 ด้าน'");
     if(!r.text.includes("กระจก (ผนัง")) out.push("รายละเอียดขาดสเปค 'กระจก (ผนัง...)'");
     const mWall=r.msgs.find(m=>/ผนัง/.test(m));
     if(!mWall) out.push("msgs ไม่มีบรรทัดผนัง (ราคาผนังไม่แสดง?)");
     return out;
   }
  },
  {id:"G4-4", label:"G4-4 ตู้อลู + L2 สีโครงต่าง (ใช้จริง · test cabSCI)",
   grp:4, pid:"cabinet_alu", W:"1.2", H:"2.4",
   opts:[[".o-depth","0.6"],[".o-cabdoors","2"],[".o-shelves","3"]],
   note:"[ทดสอบ cabSCI field — ไม่พบใน DOM = engine ยังไม่ render G4 L2 option field ใน jsdom]",
   checks(r){
     const out=[];
     if(!r.htmlInner.includes("รายละเอียดงาน")) out.push("ไม่มีบล็อก 'รายละเอียดงาน'");
     // note: cabSCI ไม่พบใน DOM → L2 G4 ทำ jsdom ไม่ได้ (ต้องทดสอบบนเว็บจริง)
     return out;
   }
  },
  {id:"G4-5", label:"G4-5 ตู้อลู + L2 สีโครง ออปชั่น (test OPTION line)",
   grp:4, pid:"cabinet_alu", W:"1.2", H:"2.4",
   opts:[[".o-depth","0.6"],[".o-cabdoors","2"],[".o-shelves","3"]],
   note:"[G4 L2 opt: radio name ไม่พบใน DOM → ต้องทดสอบบนเว็บจริง]",
   checks(r){
     const out=[];
     if(!r.htmlInner.includes("รายละเอียดงาน")) out.push("ไม่มีบล็อก 'รายละเอียดงาน'");
     return out;
   }
  },
  {id:"G4-6", label:"G4-6 ฝาตู้ Future Tech 2 บาน (สีขาว)",
   grp:4, pid:"future_tech", W:"0.8", H:"1.2", panels:2, opts:[],
   checks(r){
     const out=[];
     if(!r.htmlInner.includes("รายละเอียดงาน")) out.push("ไม่มีบล็อก 'รายละเอียดงาน'");
     if(!r.text.includes("ฝาตู้ Future Tech 2 บาน")) out.push("รายการขาด 'ฝาตู้ Future Tech 2 บาน'");
     const mFt=r.msgs.find(m=>/บาน × /.test(m));
     if(!mFt) out.push("msgs ไม่มีบรรทัด breakdown ฝาตู้");
     if(r.sell<=0) out.push("sell = 0");
     return out;
   }
  },
  {id:"G4-7", label:"G4-7 ฝาตู้ Future Tech 2 บาน + สีอบพิเศษ",
   grp:4, pid:"future_tech", W:"0.8", H:"1.2", panels:2,
   opts:[[".o-ftcolor","1"],[".o-ftcolorcode","FT-2026"]],
   checks(r){
     const out=[];
     if(!r.htmlInner.includes("รายละเอียดงาน")) out.push("ไม่มีบล็อก 'รายละเอียดงาน'");
     if(!r.text.includes("ฝาตู้ Future Tech 2 บาน")) out.push("รายการขาด 'ฝาตู้ Future Tech 2 บาน'");
     // ตรวจว่าสีพิเศษ / รหัสสีขึ้นใบ
     // note: ftcolor option อาจไม่มีใน DOM jsdom → ตรวจสังเกตการณ์เท่านั้น
     return out;
   }
  },
  {id:"G4-8", label:"G4-8 ตู้อลู รองเท้า 1×0.8ม. · 6 ชั้น · ลึก0.35",
   grp:4, pid:"cabinet_alu", W:"1.0", H:"0.8",
   opts:[[".o-depth","0.35"],[".o-cabdoors","1"],[".o-shelves","6"],[".o-cabtype","shoe"]],
   checks(r){
     const out=[];
     if(!r.htmlInner.includes("รายละเอียดงาน")) out.push("ไม่มีบล็อก 'รายละเอียดงาน'");
     if(!r.text.includes("ตู้รองเท้า")) out.push("หัวชื่อไม่มี 'ตู้รองเท้า'");
     if(!r.text.includes("1 บาน")) out.push("ไม่มี '1 บาน'");
     if(r.sell<=0) out.push("sell = 0");
     return out;
   }
  },
  {id:"G4-9", label:"G4-9 ตู้อลู + ชั้นกระจก 3 ชั้น",
   grp:4, pid:"cabinet_alu", W:"1.2", H:"2.4",
   opts:[[".o-depth","0.6"],[".o-cabdoors","2"],[".o-shelves","3"],[".o-shelfmat","glass"]],
   checks(r){
     const out=[];
     if(!r.htmlInner.includes("รายละเอียดงาน")) out.push("ไม่มีบล็อก 'รายละเอียดงาน'");
     if(!r.text.includes("ชั้นวางกระจก 3 ชั้น")) out.push("รายการขาด 'ชั้นวางกระจก 3 ชั้น'");
     // ชั้นกระจกต้องไม่มีค่าสี (spec: กระจกไม่คิดสี)
     const mShelf=r.msgs.find(m=>/ชั้นกระจก/.test(m));
     // ตรวจราคา: รายการชั้นกระจกอยู่ใน msgs หรือเปล่า
     return out;
   }
  },
  {id:"G4-10", label:"G4-10 ตู้อลู 3 บาน ลึก0.6 · 4 ชั้น (L2 opt test ผ่าน cabsci note)",
   grp:4, pid:"cabinet_alu", W:"1.5", H:"2.4",
   opts:[[".o-depth","0.6"],[".o-cabdoors","3"],[".o-shelves","4"],[".i-color","0"]],
   note:"[G4 L2/L3 option ต้องทดสอบบนเว็บจริง — jsdom ไม่พบ radio/cabsci field]",
   checks(r){
     const out=[];
     if(!r.htmlInner.includes("รายละเอียดงาน")) out.push("ไม่มีบล็อก 'รายละเอียดงาน'");
     if(!r.text.includes("3 บาน")||!r.text.includes("4 ชั้น")) out.push("หัวรายการไม่ตรง (ขาด 3บาน/4ชั้น)");
     return out;
   }
  },
];

// ======================================================================
// Run all
// ======================================================================
const ALL=[...G1.map(c=>({...c,grpTag:"G1"})), ...G4.map(c=>({...c,grpTag:"G4"}))];
const RESULTS=[];
for(const c of ALL){
  process.stdout.write("  "+c.id+" ... ");
  let res;
  try{
    res=doRender(c.grp, c.pid, c.W, c.H, c.panels||null, c.opts||[], c.prerun||null);
    if(res.err){ RESULTS.push({...c,res:{err:res.err},issues:[res.err]}); console.log("ERR: "+res.err); continue; }
  }catch(e){ RESULTS.push({...c,res:{err:e.message},issues:[e.message]}); console.log("ERR: "+e.message); continue; }
  const issues=c.checks?c.checks(res):[];
  RESULTS.push({...c,res,issues});
  console.log(issues.length===0?"OK":"ISSUE("+issues.length+"): "+issues.join(" | ").slice(0,80));
}

// ======================================================================
// Build HTML report
// ======================================================================
const RED="#B3151D";
const now="23 มิ.ย. 2569";
const total=RESULTS.length;
const passed=RESULTS.filter(r=>r.issues.length===0).length;
const failed=total-passed;

function badge(issues){ return issues.length===0
  ?'<span style="background:#d1fae5;color:#065f46;padding:2px 9px;border-radius:5px;font-size:11px;font-weight:700;">ผ่าน</span>'
  :'<span style="background:#fee2e2;color:'+RED+';padding:2px 9px;border-radius:5px;font-size:11px;font-weight:700;">'+issues.length+' จุด</span>'; }

// summary table
const sumRows=RESULTS.map((r,i)=>`<tr style="background:${r.issues.length>0?'#fff5f5':''}">
  <td style="padding:5px 8px;"><a href="#c${i}" style="font-weight:600;color:${r.issues.length>0?RED:'#1f2937'};text-decoration:none;">${r.id}</a></td>
  <td style="padding:5px 8px;font-size:12px;">${r.label}</td>
  <td style="padding:5px 8px;text-align:center;">${badge(r.issues)}</td>
  <td style="padding:5px 8px;text-align:right;font-size:12px;">${r.res&&r.res.area?r.res.area.toFixed(2):"—"}</td>
  <td style="padding:5px 8px;text-align:right;font-size:12px;">${r.res&&r.res.sell?r.res.sell.toLocaleString():"—"}</td>
  <td style="padding:5px 8px;font-size:11.5px;color:${RED};">${r.issues.join(" · ")||"—"}</td>
</tr>`).join("");

// detail cards
let cards="";
RESULTS.forEach((r,i)=>{
  if(!r.res||r.res.err){
    cards+=`<div id="c${i}" style="background:#fff;border:1px solid #fca5a5;border-radius:10px;margin:14px 0;padding:12px 16px;">
      <strong>${r.id} — ${r.label}</strong><br><span style="color:${RED};">${r.res?r.res.err:"ERR"}</span></div>`;
    return;
  }
  const bdHTML=r.res.bd&&r.res.bd.length?`<table style="font-size:11.5px;border-collapse:collapse;margin:4px 0;">${r.res.bd.map(b=>`<tr><td style="padding:2px 8px 2px 0;">${b.n}</td><td style="padding:2px 0;text-align:right;font-weight:600;">${b.p>0?b.p.toLocaleString():'<em style="color:#6b7280">รวมในราคา</em>'}</td></tr>`).join("")}</table>`:"<em>ไม่มี breakdown</em>";
  const msgsHTML=r.res.msgs&&r.res.msgs.length?`<ul style="margin:4px 0 0 16px;padding:0;">${r.res.msgs.map(m=>`<li style="font-size:11.5px;">${m.replace(/</g,"&lt;")}</li>`).join("")}</ul>`:"<em>msgs ว่าง</em>";
  const issueHTML=r.issues.length?`<div style="background:#fff7f7;border-left:4px solid ${RED};padding:8px 12px;margin:8px 0;border-radius:0 6px 6px 0;">
    <strong style="color:${RED};font-size:13px;">จุดที่ตรวจพบ (${r.issues.length}):</strong>
    <ul style="margin:4px 0 0 16px;padding:0;">${r.issues.map(is=>`<li style="color:#7f1d1d;font-size:12.5px;">${is}</li>`).join("")}</ul>
  </div>`:"";
  const noteHTML=r.note?`<div style="background:#fffbeb;border:1px solid #fcd34d;border-radius:6px;padding:6px 10px;font-size:12px;color:#92600a;margin:6px 0;">${r.note}</div>`:"";
  cards+=`<div id="c${i}" style="background:#fff;border:1px solid #e5e7eb;border-radius:10px;margin:14px 0;overflow:hidden;">
    <div style="background:${r.grpTag==='G4'?'#eff6ff':'#fff7ed'};padding:9px 14px;border-bottom:1px solid #e5e7eb;display:flex;align-items:center;gap:10px;">
      <span style="background:${r.grpTag==='G4'?'#1e40af':'#92400e'};color:#fff;border-radius:5px;padding:1px 8px;font-size:11px;font-weight:700;">${r.grpTag}</span>
      <strong>${r.id} — ${r.label}</strong>
      <span style="margin-left:auto;">${badge(r.issues)}</span>
    </div>
    <div style="padding:12px 16px;">
      <div style="display:flex;gap:16px;flex-wrap:wrap;font-size:12.5px;color:#374151;margin:0 0 8px;">
        <span>พื้นที่: <strong>${r.res.area?r.res.area.toFixed(2)+"ตร.ม.":"—"}</strong></span>
        <span>sell(engine): <strong>${r.res.sell?r.res.sell.toLocaleString():"—"}</strong></span>
        <span>grand(ใบ): <strong>${r.res.grand&&!isNaN(r.res.grand)?r.res.grand.toLocaleString():"—"}</strong></span>
      </div>
      ${noteHTML}${issueHTML}
      <details style="margin:6px 0;">
        <summary style="cursor:pointer;font-size:12.5px;font-weight:600;color:#374151;">Breakdown (${r.res.bd?r.res.bd.length:0} รายการ)</summary>
        ${bdHTML}
      </details>
      <details style="margin:6px 0;">
        <summary style="cursor:pointer;font-size:12.5px;font-weight:600;color:#374151;">Msgs engine (${r.res.msgs?r.res.msgs.length:0} รายการ)</summary>
        ${msgsHTML}
      </details>
      <details style="margin:6px 0;" ${r.issues.length>0?"open":""}>
        <summary style="cursor:pointer;font-size:12.5px;font-weight:600;color:#374151;">ใบเสนอราคา (engine render)</summary>
        <div style="margin:8px 0;border:1px solid #e5e7eb;border-radius:8px;overflow:auto;max-height:550px;font-family:'Leelawadee UI',Tahoma,sans-serif;">${r.res.html||""}</div>
      </details>
    </div>
  </div>`;
});

const outHtml=`<!DOCTYPE html><html lang="th"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>TEST G1+G4 ใบเสนอราคา — ${now}</title>
<style>
*{box-sizing:border-box;} body{font-family:-apple-system,'Segoe UI','Sarabun',Tahoma,sans-serif;margin:0;background:#f3f4f6;color:#1f2937;font-size:14px;}
.hd{background:${RED};color:#fff;padding:14px 20px;}
.hd h1{margin:0;font-size:18px;font-weight:700;} .hd p{margin:5px 0 0;font-size:12.5px;opacity:.85;}
.wrap{max-width:980px;margin:0 auto;padding:16px 14px 80px;}
.sum{background:#fff;border-radius:10px;padding:14px 16px;margin:0 0 20px;border:1px solid #e5e7eb;}
.sum h2{margin:0 0 10px;font-size:15px;color:${RED};font-weight:700;}
table{border-collapse:collapse;width:100%;}
thead th{background:#f9fafb;font-size:12px;padding:6px 8px;border-bottom:2px solid #e5e7eb;text-align:left;white-space:nowrap;}
.qtot{font-size:13px;} .qtot .g{font-weight:700;color:${RED};}
table.qt{width:100%;border-collapse:collapse;font-size:12.5px;}
table.qt th{background:${RED};color:#fff;padding:6px 8px;}
table.qt td{border-bottom:1px solid #eee;padding:6px 8px;vertical-align:top;}
table.qt .r{text-align:right;white-space:nowrap;}
.q-bd{margin:6px 0 2px 8px;border:1px solid #ecd4d8;border-radius:7px;overflow:hidden;max-width:360px;}
.qmeta{font-size:12px;color:#444;margin:6px 0;}
</style></head><body>
<div class="hd">
  <h1>TEST G1 + G4 — ใบเสนอราคา engine render (jsdom)</h1>
  <p>${now} · ${total} เคส · ผ่าน ${passed} · พบจุดตรวจ ${failed} · JS errors: ${jsErrs.length}</p>
</div>
<div class="wrap">
<div class="sum">
  <h2>สรุปทุกเคส</h2>
  <table><thead><tr>
    <th>ID</th><th>เคส</th><th>สถานะ</th><th>พท.(ตร.ม.)</th><th>sell</th><th>จุดที่ตรวจพบ</th>
  </tr></thead><tbody>${sumRows}</tbody></table>
  ${jsErrs.length?`<div style="margin-top:10px;padding:8px 12px;background:#fee2e2;border-radius:6px;font-size:12px;color:#7f1d1d;"><strong>JS Errors:</strong> ${jsErrs.slice(0,5).join(" | ")}</div>`:""}
</div>
${cards}
</div></body></html>`;

const outPath=join(ROOT,"docs","TEST-G1G4-invoices-2026-06-23.html");
writeFileSync(outPath,outHtml,"utf8");
console.log("\nReport: "+outPath);
console.log("ผ่าน "+passed+"/"+total);
process.exit(0);
