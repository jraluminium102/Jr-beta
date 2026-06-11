// g3-test-gendoc.mjs — แปลง g3-test-data.json → ตารางเทส HTML (แตกราคาย่อย + รวม + validate)
import { readFileSync, writeFileSync } from "node:fs";
const D = JSON.parse(readFileSync("scripts/g3-test-data.json","utf8"));
const RATES = {
  ROOF_STD:[[5,10,6500],[10,15,6000],[15,30,5500],[30,9999,5000]],
  ROOF_POLY:[[5,10,7500],[10,15,6500],[15,30,6000],[30,9999,5700]],
  ROOF_LAM:[[5,10,11000],[10,15,10500],[15,9999,10000]],
  ROOF_SLIDE:[[5,10,5000],[10,15,4700],[15,20,4400],[20,25,4100],[25,30,3800],[30,9999,3500]],
  IMP7:[[0,10,6300],[10,15,5800],[15,30,5300],[30,9999,4800]],IMP8:[[0,10,6400],[10,15,5900],[15,30,5400],[30,9999,4900]],
  IMP9:[[0,10,6600],[10,15,6100],[15,30,5600],[30,9999,5100]],IMP10:[[0,10,6700],[10,15,6200],[15,30,5700],[30,9999,5200]],
  IMP11:[[0,10,6300],[10,15,5800],[15,30,5300],[30,9999,4800]],IMP12:[[0,10,6600],[10,15,6100],[15,30,5600],[30,9999,5100]],
  IMP13:[[0,10,7300],[10,15,6800],[15,30,6300],[30,9999,5800]],IMP14:[[0,10,7500],[10,15,7000],[15,30,6500],[30,9999,6000]],
  IMP15:[[0,10,11000],[10,15,10500],[15,9999,10000]],IMP16:[[0,10,10600],[10,15,10000],[15,9999,9600]],
  IMP17:[[0,10,10800],[10,15,10200],[15,9999,9800]],IMP18:[[0,10,10100],[10,15,9500],[15,9999,9100]],
  IMP19:[[0,10,14000],[10,15,13500],[15,9999,13000]],IMP20:[[0,10,14000],[10,15,13500],[15,9999,13000]],
  CEILING:[[10,20,1200],[20,9999,1150]],ISOWALL:[[1,1.5,7000],[1.5,2,6500],[2,2.5,6000],[2.5,3,5500],[3,3.5,5000],[3.5,9999,4500]],
  WALL_EXT:[[3,4.5,4500],[4.5,6,4200],[6,7.5,3900],[7.5,9999,3600]],WALL_INT:[[3,4.5,4100],[4.5,6,3800],[6,7.5,3500],[7.5,9999,3200]],
};
const PROD = {roof_vinyl:{r:"ROOF_STD",min:28000},roof_delight:{r:"ROOF_STD",min:28000},roof_polyton:{r:"ROOF_POLY",min:30000},roof_laminate:{r:"ROOF_LAM",min:45000},ceiling_smooth:{r:"CEILING",min:12000},isowall:{r:"ISOWALL",min:7000},wall_ext:{r:"WALL_EXT",min:13500},wall_int:{r:"WALL_INT",min:13500}};
for(let i=7;i<=20;i++) PROD["imp"+i]={r:"IMP"+i,min:0};
const CRATES={ceil_cshape:{"ขาว-ดำ":2100,"ลายไม้":2700},ceil_bsc:{"มาตรฐาน(ขาว-ซิลเวอร์)":2600,"ลายไม้/สีอื่น":2800}};
const rateOf=(a,t)=>{ if(a<t[0][0])return t[0][2]; for(const r of t){ if(a>=r[0]&&a<r[1])return r[2]; } return t[t.length-1][2]; };
const monoRate=(a,t)=>{ let v=a*rateOf(a,t); for(const r of t){ if(r[1]<=a){ const e=r[1]*r[2]; if(e>v)v=e; } } return v; };
const fmt=n=>Math.round(n).toLocaleString("en-US");
function breakdown(c){
  const a=c.area, L=[]; let raw=0;
  const add=(label,amt,note)=>{ L.push({label,amt,note:note||""}); if(typeof amt==="number") raw+=amt; };
  if(CRATES[c.prod]){ const keys=Object.keys(CRATES[c.prod]); const ck=keys.find(k=>c.detail.includes(k))||keys[0]; const rate=CRATES[c.prod][ck]; const A=Math.max(a,10); add(`ฝ้า ${a} ตร.ม.${a<10?" (ขั้นต่ำ 10)":""} × ${fmt(rate)}`, A*rate); }
  else { const p=PROD[c.prod];
    const isMix=c.msgs.some(m=>m.startsWith("หลังคาผสม")), isSlide=c.msgs.some(m=>m.startsWith("หลังคาเลื่อน"));
    if(isMix){ const m=c.msgs.find(x=>x.startsWith("หลังคาผสม")); const nums=[...m.matchAll(/\(([\d,]+)\)/g)].map(x=>+x[1].replace(/,/g,"")); const parts=m.replace("หลังคาผสม:","").split("+").map(s=>s.trim()); parts.forEach((p2,i)=>add(p2.replace(/\([\d,]+\)/,"").trim(), nums[i]||0)); }
    else { const t=RATES[p.r], mr=monoRate(a,t), base=Math.max(p.min,mr); let lbl=`ฐาน ${a} ตร.ม. × ${fmt(rateOf(a,t))}`; if(mr>a*rateOf(a,t)) lbl+=" (กันราคาช่วง)"; if(base>mr) lbl=`ฐาน (ขั้นต่ำ ${fmt(p.min)})`; add(lbl, base);
      if(isSlide){ const m=c.msgs.find(x=>x.startsWith("หลังคาเลื่อน")); const N=+((m.match(/เลื่อน (\d+) บาน/)||[])[1]||2); const mo=m.match(/มอเตอร์ (\d+)×([\d,]+)/); const mq=mo?+mo[1]:1, me=mo?+mo[2].replace(/,/g,""):0; const tier=a<=10?4500:a<=20?6750:a<=30?9000:11250; add(`ระบบเลื่อน ${N} บาน`, monoRate(a,RATES.ROOF_SLIDE)+(N-1)*tier); add(`มอเตอร์ ${mq} ตัว`, mq*me); }
    }
  }
  if(/รางน้ำ \(/.test(c.detail)) add("รางน้ำหลัก + ตะแกรง + ท่อ PVC", 0, "รวมในราคาหลังคา");
  for(const m of c.msgs){ if(m.startsWith("หลังคาผสม")||m.startsWith("หลังคาเลื่อน")) continue; let amt=0;
    if(/เสาแผง (\d+) ต้น/.test(m)) amt=(+m.match(/เสาแผง (\d+)/)[1])*4000;
    else if(/เสา 4x8 (\d+) ต้น/.test(m)) amt=(+m.match(/เสา 4x8 (\d+)/)[1])*2000;
    else { const n=m.match(/([\d,]+)\s*$/); amt=n?+n[1].replace(/,/g,""):0; }
    add(m.replace(/\s+[\d,]+$/,""), amt);
  }
  if(/ฉนวน/.test(c.detail)) add("ฉนวนกันร้อน 600 × "+a, 600*a);
  const total=Math.ceil(raw/1000)*1000;
  return {L, raw, total, ok: total===c.sell};
}
const order=["หลังคาหลัก","เมทัลชีท","ชินโคไลท์","สีวัสดุมุง","ลามิเนต","ออปชั่นหลังคา","ฝ้า","ผนัง"];
const byGrp={}; for(const c of D){ (byGrp[c.grp]=byGrp[c.grp]||[]).push(c); }
let rows="",bad=0;
for(const g of order){ const arr=byGrp[g]||[]; if(!arr.length) continue;
  rows+=`<tr><td colspan="5" class="grp">${g} (${arr.length} เคส)</td></tr>`;
  for(const c of arr){ const b=breakdown(c); if(!b.ok) bad++;
    const det=c.detail.split(" / ").map(s=>s.trim()).filter(s=>s&&s!=="รายละเอียดงาน");
    const head=det[0]||""; const body=det.slice(1).join("<br>");
    let bd=b.L.map(x=>`<div class="bl"><span>${x.label}</span><span class="a">${x.note?('<i>'+x.note+'</i>'):("฿"+fmt(x.amt))}</span></div>`).join("");
    bd+=`<div class="bl tot"><span>รวม (ปัดขึ้นพัน)</span><span class="a">฿${fmt(b.total)}</span></div>`;
    if(!b.ok) bd+=`<div class="bl" style="color:#B3151D;">⚠ ไม่ตรง engine (฿${fmt(c.sell)})</div>`;
    rows+=`<tr><td class="id">${c.id}</td><td class="sz">${c.size} ม.<br><span class="ar">${c.area} ตร.ม.</span></td><td class="dt"><b>${head}</b><br>${body}</td><td class="ca">${bd}</td><td class="pr">฿${fmt(c.sell)}</td></tr>`;
  }
}
const tpl=readFileSync("scripts/g3-test-tpl.html","utf8").replace("{{ROWS}}",rows).replace(/{{N}}/g,String(D.length)).replace("{{DATE}}","11 มิ.ย. 2026");
writeFileSync("docs/TEST-G3-full-2026-06-11.html",tpl,"utf8");
console.log("เขียน docs/TEST-G3-full-2026-06-11.html · "+D.length+" เคส · validate ไม่ตรง engine = "+bad+" เคส");
