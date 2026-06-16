// G6 งานพื้น + พัดลม (มติ 16มิ.ย. · ในโมดูล g6r room)
import { JSDOM, VirtualConsole } from "jsdom";
import { readFileSync } from "node:fs";
const html = readFileSync(new URL("../public/calculator/index.html", import.meta.url), "utf8");
const vc=new VirtualConsole(); const errs=[]; vc.on("jsdomError",e=>{if(!/Not implemented:|scrollIntoView|scrollTo/.test(e.message))errs.push(e.message);});
const dom=new JSDOM(html,{runScripts:"dangerously",pretendToBeVisual:true,virtualConsole:vc,url:"http://localhost/calculator/index.html"});
await new Promise(r=>{if(dom.window.document.readyState==='complete')r();else dom.window.addEventListener('load',r);setTimeout(r,1500);});
const w=dom.window,doc=w.document;
const C=[]; const want=(n,ok,d)=>C.push({n,ok:!!ok,d:d||""});
function room(){ doc.getElementById("items").innerHTML=""; const d=w.addGlasshouseSet(); return d; }
function totWith(floor,fan){ const d=room(); const st=d.__g6state; const base=w.g6rRoomTotal(d); if(floor)st.floor=floor; if(fan)st.fan=fan; const t=w.g6rRoomTotal(d); return {base,t,delta:t-base,d,st}; }
// 1) พื้น smart 4×5=20 ตร.ม. → 20×5000=100,000 ลด auto 10% = 90,000
let r=totWith({on:1,mat:'smart',w:4,l:5,rate:0,disc:''});
want("พื้น smart 20 ตร.ม. → +90,000 (ลด auto 10%)", r.delta===90000, "Δ="+r.delta);
// 2) พื้น 2×2=4 (<5) → min 5 → 5×5000=25,000 ไม่ลด
r=totWith({on:1,mat:'smart',w:2,l:2,rate:0,disc:''});
want("พื้นเล็ก 4 ตร.ม. → min 5 → +25,000", r.delta===25000, "Δ="+r.delta);
// 3) พื้น ไม้เทียม 3×6=18 → 18×5000=90,000 (<20 ไม่ลด)
r=totWith({on:1,mat:'wood',w:3,l:6,rate:0,disc:''});
want("พื้นไม้เทียม 18 ตร.ม. → +90,000 (ไม่ลด)", r.delta===90000, "Δ="+r.delta);
// 4) พื้น spc กรอกเรต 800 · 3×3=9 → 9×800=7,200
r=totWith({on:1,mat:'spc',w:3,l:3,rate:800,disc:''});
want("พื้น SPC เรตเอง 800 · 9 ตร.ม. → +7,200", r.delta===7200, "Δ="+r.delta);
// 5) ส่วนลดแก้เอง: 20 ตร.ม. disc 5% → 100,000×0.95=95,000
r=totWith({on:1,mat:'smart',w:4,l:5,rate:0,disc:'5'});
want("พื้น 20 ตร.ม. ส่วนลดแก้เป็น 5% → +95,000", r.delta===95000, "Δ="+r.delta);
// 6) พัดลม qty 2 × 1500 = 3,000
r=totWith(null,{on:1,size:'8',qty:2,price:1500});
want("พัดลม 2 ตัว × 1,500 → +3,000", r.delta===3000, "Δ="+r.delta);
// 7) invoice มีบรรทัดพื้น+พัดลม
const d2=room(); d2.__g6state.floor={on:1,mat:'smart',w:4,l:5,rate:0,disc:''}; d2.__g6state.fan={on:1,size:'8',qty:1,price:2000};
const detail=w.g6rRoomDetail(d2);
want("ใบมีบรรทัดงานปูพื้น + ไม่รับประกัน", /งานปูพื้น/.test(detail)&&/ไม่รับประกัน/.test(detail), detail.split('\n').filter(l=>/พื้น/.test(l))[0]||"");
want("ใบมีบรรทัดพัดลมดูดอากาศ", /พัดลมดูดอากาศ/.test(detail), detail.split('\n').filter(l=>/พัดลม/.test(l))[0]||"");
want("0 JS error", errs.length===0, errs.slice(0,2).join(" | "));
let pass=0; for(const c of C){console.log((c.ok?"✅":"❌")+" "+c.n+"  ["+c.d+"]"); if(c.ok)pass++;}
console.log(`\n${pass}/${C.length} ผ่าน`+(errs.length?` · jsErrors:${errs.length}`:""));
process.exit(pass===C.length?0:1);
