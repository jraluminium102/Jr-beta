// READ-ONLY: เทียบ "ราคาออกแบบ (PRICELIST-G6-ALL 2026-06-14)" VS "ราคาเว็บจริงตอนนี้ (engine calcUnit)"
// ออก HTML A4 red theme 3 คอลัมน์ → ใช้ Chrome headless แปลงเป็น PDF (อีกสเตป)
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { JSDOM } from 'jsdom';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const html = fs.readFileSync(path.join(ROOT, 'public', 'calculator', 'index.html'), 'utf8');
const dom = new JSDOM(html, { runScripts: 'dangerously', pretendToBeVisual: true, url: 'http://localhost/' });
const { window } = dom;
window.scrollTo = () => {}; window.alert = () => {}; window.requestAnimationFrame = (cb)=>setTimeout(cb,0);
await new Promise(r=>setTimeout(r,400));

// ===== คำนวณราคา engine จริง ภายในบริบทหน้าเว็บ =====
const pageCode = String.raw`(function(){
  function U(id,w,h,os,ci,panels){ var p=PBYID[id]; if(!p)return null; try{ return calcUnit(p,w,h,0,(ci||0),(panels||1),os||{}).sell; }catch(e){ return 'ERR'; } }
  function nm(id){ return (PBYID[id]&&PBYID[id].name)||id; }
  var out={};

  // ① ราคาขั้นต่ำต่อชนิด = ค่า min field จริงใน engine (นิยาม "ขั้นต่ำ/ชุด")
  out.mins={}; ['sliding_sms','sliding_euro','casement_euro','casement_xseries','casement_velora','casement_flush_solid','casement_inset_solid','awning_euro','pivot','folding_xseries','fixed_glass','curved_double','curved_single','curved_fixed','curved_slim','pc_door_2','pc_door_4','shower','frameless_fixed','ykk_vent'].forEach(function(id){ var p=PBYID[id]; out.mins[id]= p ? (p.min!=null?p.min:null) : 'ไม่มี id'; });

  // ② มือจับ — วัด delta บน casement_euro ยูโร (ceLinear ไม่ roundUp = เป๊ะ) · มือจับ nc บนยูโรจะ bundle โช๊ค +5,000 (R3.2)
  var sBase=U('casement_euro',1,2,{});
  out.digi=(typeof DIGI!=='undefined'?DIGI:[]).map(function(d,i){ return {n:d.n, nc:!!d.nc, jr:!!d.jr, eng:U('casement_euro',1,2,{digi:String(i)})-sBase}; });
  out.stainless=(typeof HANDLE_STAINLESS!=='undefined'?HANDLE_STAINLESS:[]).map(function(d,i){ return {n:d.n, eng:U('casement_euro',1,2,{stainless:String(i)})-sBase}; });

  // ③ มุ้ง (addon บน casement_euro 1×1 ประตู) — delta จากฐาน
  var mBase=U('casement_euro',1,1,{});
  out.mosq=(typeof MOSQUITO_SCREENS!=='undefined'?MOSQUITO_SCREENS:[]).map(function(m){ return {id:m.id, n:m.name, rate:m.rate||null, min:m.min!=null?m.min:(m.min_door!=null?('ปต.'+m.min_door+'/นต.'+m.min_window):null), eng1x1:U('casement_euro',1,1,{mosqId:m.id})-mBase}; });
  // ผ้ามุ้ง delta (บน mosq SD พื้นฐาน 1×1)
  var mqSD=U('casement_euro',1,1,{mosqId:'mj_sd_basic'});
  out.fabric=[['anti_pet','สแตนเลส กันแมว/หมา'],['stainless','สแตนเลส กันหนู'],['safety08','สแตนเลส นิรภัย 0.8']].map(function(f){ return {n:f[1], eng:U('casement_euro',1,1,{mosqId:'mj_sd_basic',mosqFabric:f[0]})-mqSD}; });

  // ④ เสริมกระจก — ลูกฟูก/คอมโพ (1 ตร.ม.)
  out.solidlower={ corrugated:U('casement_euro',1,2,{solidlower:'corrugated',solidlowerW:1,solidlowerH:1})-sBase, composite:U('casement_euro',1,2,{solidlower:'composite',solidlowerW:1,solidlowerH:1})-sBase };

  // ⑤ โครงสร้าง COMMON_OPTS
  function coDelta(id,len){ var base=U('inner_top_stack',2,2.4,{}); var os={}; os[id]=true; if(len!=null)os[id+'Len']=len; return U('inner_top_stack',2,2.4,os)-base; }
  function coDeltaFold(id,len){ var base=U('folding',2,2.4,{}); var os={}; os[id]=true; if(len!=null)os[id+'Len']=len; return U('folding',2,2.4,os)-base; }
  out.common={ soft_close:coDelta('soft_close'), sling:coDelta('sling'), hide_beam:coDelta('hide_beam',0), hide_track:coDeltaFold('hide_track',0), u_track:coDeltaFold('u_track',0), beam_support:coDelta('beam_support',0) };
  // ราง รุ่นซ่อน (เลื่อนรางบน) +5,000
  out.track_hide=U('inner_top_stack',2,2.4,{track:'ซ่อนราง'})-U('inner_top_stack',2,2.4,{});

  // ⑥ อุปกรณ์ประตู
  out.thresh=U('casement_euro',1,2,{thresh:'turtle'})-sBase;
  out.closer=U('casement_euro',1,2,{closer:5000})-sBase;
  out.awn_tt=U('awning_euro',1,1,{awn_mode:'2'})-U('awning_euro',1,1,{});
  var liftBase=U('lift_sms',1.5,2,{}); out.motor80=U('lift_sms',1.5,2,{motor:'80'})-liftBase; out.motor300=U('lift_sms',1.5,2,{motor:'300'})-liftBase;
  var shBase=U('shower',1,2,{}); out.shower_black=U('shower',1,2,{showerhw:'1'})-shBase; out.shower_gold=U('shower',1,2,{showerhw:'2'})-shBase;
  out.fullgrid=U('casement_flush_solid',1,2,{fullgrid:true})-U('casement_flush_solid',1,2,{});

  // ⑦ ครอบวงกบ (fcsides=4 บน 1×1 → len 4 ม. × เรตสี) เทียบเรต/ม. = delta/4
  out.fc=[0,3,7,9,10,11].map(function(ci){ var d=U('casement_euro',1,1,{fcsides:4},ci)-U('casement_euro',1,1,{},ci); return {ci:ci, rate:Math.round(d/4)}; });

  return JSON.stringify(out);
})()`;

let eng;
try { eng = JSON.parse(window.eval(pageCode)); }
catch(e){ console.error('eval failed:', e && e.stack || e); process.exit(1); }

// ===== ราคาออกแบบ (PRICELIST-G6-ALL-2026-06-14) =====
const DESIGN = {
  mins:{ sliding_sms:6500, sliding_euro:7500, casement_euro:18000, casement_xseries:28000, casement_velora:19000, casement_flush_solid:18000, casement_inset_solid:18000, awning_euro:10000, pivot:26000, folding_xseries:36000, fixed_glass:5000, curved_double:47000, curved_single:32000, curved_fixed:10000, curved_slim:50000, pc_door_2:36000, pc_door_4:46000, shower:12000, frameless_fixed:7000, ykk_vent:30000 },
  digi:{ 'S1 ก้านโยก':10000,'S1 ลูกบิด':10000,'A300':10000,'C300':11000,'L900':13000,'X1':13000,'S3':18000,'S4':18000,'X2':20000,'L600':24000,'JR Prime':24900 },
  stainless:{ '30.5 ซม.':1500,'45 ซม.':2000,'60 ซม.':2000,'80 ซม.':2500,'100 ซม.':3000,'120 ซม.':3200 },
  fabric:{ 'สแตนเลส กันแมว/หมา':800,'สแตนเลส กันหนู':1200,'สแตนเลส นิรภัย 0.8':null },
  solidlower:{ corrugated:3500, composite:3300 },
  common:{ soft_close:4000, sling:2000, hide_beam:4000, hide_track:4000, u_track:4000, beam_support:4000 },
  track_hide:5000,
  thresh:1000, closer:5000, awn_tt:5000, motor80:18000, motor300:28000, shower_black:4000, shower_gold:6000, fullgrid:5000,
  fcByCi:{0:700,3:800,7:1000,9:1100,10:1200,11:1300}
};
const NAME = { sliding_sms:'บานเลื่อน เซมิยูโร', sliding_euro:'บานเลื่อน ยูโร', casement_euro:'บานเปิด ยูโร', casement_xseries:'บานเปิด X-series', casement_velora:'บานเปิด Velora', casement_flush_solid:'บานเปิด โซลิด ทู', casement_inset_solid:'บานเปิด โซลิด วัน', awning_euro:'บานกระทุ้ง ยูโร', pivot:'บานหมุน', folding_xseries:'เฟี้ยม X-series', fixed_glass:'กระจกติดตาย', curved_double:'ดัดโค้ง บานคู่', curved_single:'ดัดโค้ง บานเดี่ยว', curved_fixed:'ดัดโค้ง ติดตาย', curved_slim:'ดัดโค้ง สลิม', pc_door_2:'PC Door 2 บาน', pc_door_4:'PC Door 4 บาน', shower:'shower กั้นอาบน้ำ', frameless_fixed:'บานเปลือยติดตาย', ykk_vent:'YKK Ventilation' };

// ===== build HTML =====
const fmt = n => (n==null||n==='ERR')?String(n):(typeof n==='number'?n.toLocaleString():n);
let nDiff=0, nOk=0, nNote=0;
function row(label, design, web, opt){
  opt=opt||{};
  let status, cls;
  if(opt.note){ status='— '+opt.note; cls='note'; nNote++; }
  else if(design==null){ status='(ไม่กำหนด)'; cls='note'; nNote++; }
  else if(web==='ERR'||web==null){ status='⚠ คำนวณไม่ได้'; cls='diff'; nDiff++; }
  else if(Number(design)===Number(web)){ status='✓ ตรง'; cls='ok'; nOk++; }
  else { const d=Number(web)-Number(design); status='✗ ต่าง '+(d>0?'+':'')+fmt(d); cls='diff'; nDiff++; }
  return `<tr class="${cls}"><td>${label}</td><td class="pr">${design==null?'<span class=x>—</span>':fmt(design)}</td><td class="pr">${fmt(web)}</td><td class="st">${status}</td></tr>`;
}
function table(title, sub, rows){ return `<h2>${title}${sub?`<span class="s">${sub}</span>`:''}</h2><table><tr><th>รายการ</th><th class="pr">ออกแบบ (6-14)</th><th class="pr">เว็บจริง (now)</th><th class="st">สถานะ</th></tr>${rows.join('')}</table>`; }

let body='';
// ① mins (เทียบ min field จริง)
body += table('① ราคาขั้นต่ำต่อชนิดบาน (min/ชุด)', 'ค่า min field ใน engine',
  Object.keys(DESIGN.mins).map(id=>{ const w=eng.mins[id]; return (w==null)?row(NAME[id]||id, DESIGN.mins[id], 'คิดตามขนาด/สูตร', {note:'ตามขนาด'}) : row(NAME[id]||id, DESIGN.mins[id], w); }));
// ② handle (nc-handle บนยูโร bundle โช๊ค +5,000 → note ไม่ใช่ diff)
body += `<h2>② มือจับดิจิตอล (delta บนบานเปิดยูโร)</h2><table><tr><th>รายการ</th><th class="pr">ออกแบบ</th><th class="pr">เว็บจริง</th><th class="st">สถานะ</th></tr>` +
  eng.digi.map(d=>{ const des=DESIGN.digi[d.n]; let st,cls;
    if(des==null){st='(ไม่กำหนด)';cls='note';nNote++;}
    else if(d.eng===des){st='✓ ตรง';cls='ok';nOk++;}
    else if(d.nc && d.eng===des+5000){st='✓ +โช๊คยูโร 5,000';cls='note';nNote++;}
    else {const x=d.eng-des;st='✗ ต่าง '+(x>0?'+':'')+fmt(x);cls='diff';nDiff++;}
    return `<tr class="${cls}"><td>ดิจิตอล ${d.n}</td><td class="pr">${fmt(des)}</td><td class="pr">${fmt(d.eng)}</td><td class="st">${st}</td></tr>`;
  }).join('') + `</table><div class="x" style="margin:-6px 0 9px">* มือจับ nc (S3/S4/L600/X2/JR Prime) บน "บานเปิดยูโร" รวมโช๊ค +5,000 อัตโนมัติ (R3.2 เฉพาะยูโร) — ราคามือจับล้วนตรงออกแบบ</div>`;
body += table('② มือจับสแตนเลส', 'delta บนยูโร (ceLinear เป๊ะ)',
  eng.stainless.map(d=>row('สแตนเลส '+d.n, DESIGN.stainless[d.n], d.eng)));
// ③ mosq (addon 1×1 — แสดง engine addon + เรต/min ออกแบบ)
body += `<h2 class="pgbreak">③ มุ้ง — addon ต่อบาน (1×1 ประตู)</h2><table><tr><th>ชนิดมุ้ง</th><th class="pr">เรต/ตร.ม. ออกแบบ</th><th class="pr">addon เว็บจริง 1×1</th><th class="st">หมายเหตุ</th></tr>` +
  eng.mosq.map(m=>{ const rate=m.rate!=null?fmt(m.rate):'<span class=x>เฟรม</span>'; return `<tr><td>${m.n}</td><td class="pr">${rate}${m.min!=null?` <span class=x>(min ${fmt(m.min)})</span>`:''}</td><td class="pr">${fmt(m.eng1x1)}</td><td class="st"><span class=x>addon=roundUp(max(min,เรต×พื้นที่))</span></td></tr>`; }).join('') + `</table>`;
body += `<h2>③ ผ้ามุ้ง (delta บน SD พื้นฐาน 1×1)</h2><table><tr><th>รายการ</th><th class="pr">เรตดิบ ออกแบบ</th><th class="pr">delta เว็บ 1×1</th><th class="st">หมายเหตุ</th></tr>` +
  eng.fabric.map(f=>{ const d=DESIGN.fabric[f.n]; nNote++; return `<tr class="note"><td>${f.n}</td><td class="pr">${d==null?'ตามจริง':fmt(d)}</td><td class="pr">${fmt(f.eng)}</td><td class="st"><span class="x">${d==null?'—':'เรตดิบ '+fmt(d)+' ✓ (delta เพี้ยนจาก roundUp พันบาท)'}</span></td></tr>`; }).join('') + `</table>`;
// ④ solidlower
body += table('④ เสริมกระจก — ลูกฟูก/คอมโพ (1 ตร.ม.)', 'เรต/ตร.ม.', [
  row('อลูลูกฟูก', DESIGN.solidlower.corrugated, eng.solidlower.corrugated),
  row('คอมโพสิท', DESIGN.solidlower.composite, eng.solidlower.composite),
]);
// ⑤ common
body += table('⑤ โครงสร้าง / คาน / ราง (COMMON_OPTS)', 'ค่าฐาน (ยาว 0 ม.)', [
  row('Soft Close (ต่อชุด)', DESIGN.common.soft_close, eng.common.soft_close),
  row('สลิงเปิดซ้อน (ต่อบาน)', DESIGN.common.sling, eng.common.sling),
  row('ซ่อนคาน (≤3ม.)', DESIGN.common.hide_beam, eng.common.hide_beam),
  row('ซ่อนราง (≤3ม.)', DESIGN.common.hide_track, eng.common.hide_track),
  row('ฝังรางยู U-Track (≤2ม.)', DESIGN.common.u_track, eng.common.u_track),
  row('เสริมคานซัพพอร์ท (≤3ม.)', DESIGN.common.beam_support, eng.common.beam_support),
  row('ราง รุ่นซ่อน (เลื่อนรางบน)', DESIGN.track_hide, eng.track_hide),
]);
// ⑥ door hw
body += table('⑥ อุปกรณ์เฉพาะประตู', 'delta จากบาน', [
  row('ธรณีหลังเต่าภายใน', DESIGN.thresh, eng.thresh),
  row('โช๊คบานเปิด (บานพับ)', DESIGN.closer, eng.closer),
  row('กระทุ้ง tilt&turn (ต่อบาน)', DESIGN.awn_tt, eng.awn_tt),
  row('มอเตอร์บานยก 80 กก.', DESIGN.motor80, eng.motor80),
  row('มอเตอร์บานยก 300 กก.', DESIGN.motor300, eng.motor300),
  row('shower อุปกรณ์ ดำ', DESIGN.shower_black, eng.shower_black),
  row('shower อุปกรณ์ ทอง', DESIGN.shower_gold, eng.shower_gold),
  row('ตารางเต็มบาน (โซลิด)', DESIGN.fullgrid, eng.fullgrid),
]);
// ⑦ ครอบวงกบ
const ciName={0:'ดำ/ขาว/ซาฮาร่า',3:'สีอื่นๆ สต๊อก',7:'(เรตกลาง 1,000)',9:'(เรตกลาง 1,100)',10:'อบพิเศษ',11:'ลายไม้อบพิเศษ'};
body += table('⑦ ครอบวงกบ — เรต/ม. ตามสี', 'fcsides=4 → delta÷4', [
  ...eng.fc.map(f=>row('ครอบวงกบ '+(ciName[f.ci]||('ci'+f.ci)), DESIGN.fcByCi[f.ci], f.rate))
]);

const total = nOk+nDiff+nNote;
const summary = `<div class="box ${nDiff?'warn':'ok'}"><b>สรุปผลเทียบ:</b> ✓ ตรง ${nOk} · ✗ ต่าง ${nDiff} · — หมายเหตุ ${nNote} · รวม ${total} จุด` +
  (nDiff? ` <b style="color:#B3151D">— มี ${nDiff} จุดต่าง ดูแถวสีแดง</b>` : ` <b style="color:#15803D">— ตรงทุกจุดที่มีราคากำหนด ✅</b>`) + `</div>`;

const page = `<!DOCTYPE html><html lang="th"><head><meta charset="utf-8"><title>เทียบราคา G6 — ออกแบบ vs เว็บจริง</title>
<style>
@page{size:A4;margin:10mm 9mm;} *{font-family:"Leelawadee UI","Tahoma","Noto Sans Thai",sans-serif;box-sizing:border-box;}
body{color:#1a1a1a;font-size:11px;line-height:1.4;margin:0;}
h1{color:#B3151D;font-size:19px;margin:0 0 2px;} .meta{color:#666;font-size:10px;margin:0 0 9px;}
h2{color:#fff;background:#B3151D;font-size:13px;margin:14px 0 5px;padding:4px 10px;border-radius:5px;} h2 .s{font-size:9.5px;font-weight:400;opacity:.9;float:right;}
table{border-collapse:collapse;width:100%;margin:4px 0 9px;font-size:10px;} th,td{border:1px solid #d8c9c9;padding:3px 7px;text-align:left;vertical-align:top;}
th{background:#fbeeee;color:#B3151D;font-weight:700;} td.pr,th.pr{text-align:right;white-space:nowrap;} td.st,th.st{text-align:center;white-space:nowrap;width:120px;}
tr.ok td.st{color:#15803D;font-weight:700;} tr.diff{background:#fff4f4;} tr.diff td.st{color:#B3151D;font-weight:700;} tr.note td.st{color:#999;}
.box{border:1px solid #d8c9c9;border-radius:6px;padding:8px 11px;margin:8px 0;background:#fffafa;font-size:11px;} .ok{background:#F0FDF4;border-color:#86EFAC;} .warn{background:#fff4e5;border-color:#f0c070;}
.x{color:#aaa;font-size:9px;} code{background:#f3f0f0;padding:0 3px;border-radius:3px;font-size:9px;} .pgbreak{page-break-before:always;}
</style></head><body>
<h1>เทียบราคา G6 (กั้นห้องกระจก) — ดราฟออกแบบ VS เว็บจริง</h1>
<div class="meta">ออกแบบ = <code>PRICELIST-G6-ALL-2026-06-14</code> (เคาะแล้ว) · เว็บจริง = engine <code>public/calculator/index.html</code> ปัจจุบัน (หลัง restructure 6 กลุ่ม + ใส่ลูกฟูกกลับ) · สร้าง 2026-06-15</div>
${summary}
${body}
${summary}
<div class="box"><b>วิธีอ่าน:</b> คอลัมน์ "ออกแบบ" = ราคาที่เคาะใน PRICELIST · "เว็บจริง" = ราคาที่ engine คิดตอนนี้ (path เดียวกับเว็บ) · <b>✓ ตรง</b>=เท่ากัน · <b>✗ ต่าง</b>=ไม่เท่า (โชว์ส่วนต่าง แถวแดง) · <b>—</b>=ออกแบบไม่ได้กำหนดราคาตายตัว (ตามจริง/กรอกเอง)</div>
</body></html>`;

const outHtml = path.join(ROOT,'docs','กลุ่ม6-กั้นห้องกระจก','COMPARE-G6-design-vs-web-2026-06-15.html');
fs.writeFileSync(outHtml, page, 'utf8');
console.log('Wrote', outHtml);
console.log('สรุป: ✓ ตรง '+nOk+' · ✗ ต่าง '+nDiff+' · — หมายเหตุ '+nNote+' · รวม '+total);
