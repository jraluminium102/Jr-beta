// สร้าง docs/_g6-option-detail.md จาก _g6-option-detail.json + _g6-catalogs.json
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const results = JSON.parse(fs.readFileSync(path.join(ROOT,'docs','_g6-option-detail.json'),'utf8'));
const cat = JSON.parse(fs.readFileSync(path.join(ROOT,'docs','_g6-catalogs.json'),'utf8'));

const fmt = n => Number(n).toLocaleString('en-US');

// catalog ที่แปะซ้ำในทุกบานที่มี flag (ดึงครั้งเดียวตอนต้น)
const DIGI = cat.DIGI.map(d=>`${d.n} +${fmt(d.p)}`);
const STAIN = cat.HANDLE_STAINLESS.map(s=>`${s.n} +${fmt(s.p)}`);
const MOSQ = cat.MOSQUITO_SCREENS.map(m=>{
  if(m.frame) return `${m.name} (เฟรม · min ประตู ${fmt(m.min_door)}/หน้าต่าง ${fmt(m.min_window)})`;
  return `${m.name} (${fmt(m.rate)}/ตร.ม. min ${fmt(m.min)})`;
});

const SIX_LABEL = {
  slide:'🔁 SLIDE — บานเลื่อน / เลื่อนภายใน',
  swing:'🚪 SWING — บานเปิด / หมุน / ยก / PC Door',
  fold:'🪗 FOLD — บานเฟี้ยม',
  fix:'⬛ FIX — ติดตาย / กระทุ้ง',
  curve:'🌙 CURVE — ดัดโค้ง',
  other:'➕ OTHER — บานเปลือย / shower / YKK / เส้นคาด / ลูกฟูกทึบ',
};
const SIX_ORDER = ['slide','swing','fold','fix','curve','other'];

// แยกประเภท control เป็นหมวด เพื่อจัดตาราง
function ctrlCategory(cls, label){
  if(/o-mosq/.test(cls)) return 'มุ้ง';
  if(/o-cmech|o-digi|o-stainless|o-xhandle|o-cmechawn|o-handlename|o-handleprice/.test(cls)) return 'มือจับ';
  if(/o-gridmark|o-gm-/.test(cls)) return 'เสริมกระจก';
  if(/o-solidlower|o-sl-/.test(cls)) return 'เสริมกระจก';
  if(/o-fcsides|o-fcm|o-dfm|o-removeold|o-extrawork|o-uchannel/.test(cls)) return 'อุปกรณ์เสริม';
  if(/o-hide_beam|o-hide_track|o-u_track|o-beam_support|o-soft_close|o-sling/.test(cls)) return 'อุปกรณ์เสริม';
  if(/o-fullgrid|o-solidlight|o-combo|o-bg_motor/.test(cls)) return 'เสริมกระจก';
  return 'ออปชั่นหลัก';
}

function describeControls(ctrls){ // คืน {หมวด: [บรรทัด...]}
  const out = { 'ออปชั่นหลัก':[], 'มือจับ':[], 'มุ้ง':[], 'เสริมกระจก':[], 'อุปกรณ์เสริม':[] };
  let mosqDone=false, handleDone=false;
  ctrls.forEach(c=>{
    const cls = c.controls.map(x=>x.cls).join(',');
    const k = ctrlCategory(cls, c.label);
    if(k==='มุ้ง'){
      if(mosqDone) return; mosqDone=true;
      out['มุ้ง'].push('**ชนิดมุ้ง (dropdown o-mosq):** '+MOSQ.join(' · '));
      out['มุ้ง'].push('**ผ้ามุ้ง (o-mosqfabric):** ไฟเบอร์เทา (default) · ไฟเบอร์ดำ · กันแมว/หมา +800 · สแตนกันหนู +1,200 · สแตนนิรภัย 0.8มม.');
      out['มุ้ง'].push('**สีกรอบมุ้ง (o-mosqcolor):** ตามสีบาน (ฟรี) · เทาซาฮาร่า · KL พิเศษ · KL ลายไม้');
      out['มุ้ง'].push('**จำนวนบานมุ้ง / กรอกขนาดเอง (กว้าง×ยาว) / ลักษณะการเปิด (label-only)**');
      return;
    }
    if(k==='มือจับ'){
      if(handleDone) return; handleDone=true;
      const has = cls;
      const parts=[];
      if(/o-cmech\b/.test(has)) parts.push('**Cmech** (ฝัง/เมโทร) สี: ดำ/ขาว/Silver/Champagne/Gold/Bronze/Copper (ชุบ)');
      if(/o-digi/.test(has)) parts.push('**ดิจิตอล (10 รุ่น):** '+DIGI.join(' · '));
      if(/o-stainless/.test(has)) parts.push('**สแตนอร่าม:** '+STAIN.join(' · '));
      if(/o-xhandle/.test(has)) parts.push('**X-series (ฟรี):** X-J · XO · XT');
      if(/o-cmechawn/.test(has)) parts.push('**Cmech หลบมุ้ง (กระทุ้ง):** ดำ/ขาว +600 · Silver/Champagne/Gold/Bronze/Copper ชุบ +840');
      if(/o-handlename/.test(has)) parts.push('**รุ่นอื่น ✎ (กรอกชื่อ+ราคาเอง)**');
      parts.forEach(p=>out['มือจับ'].push(p));
      return;
    }
    // อื่นๆ: render บรรทัด label + ถ้า select แตก options
    c.controls.forEach(x=>{
      if(x.type==='select'){
        const opts = x.options.filter(o=>o.t).map(o=>o.t+(o.sel?' ✓':'')).join(' | ');
        out[k].push(`**${c.label||x.cls}** (${x.cls}): ${opts}`);
      } else if(x.type==='checkbox'){
        out[k].push(`☐ ${c.label} (${x.cls})`);
      } else {
        out[k].push(`▭ ${c.label} (${x.cls} · ${x.type}${x.ph?' "'+x.ph+'"':''})`);
      }
    });
  });
  return out;
}

let md = '';
md += '# ออปชั่น/อุปกรณ์เสริมย่อย — บานทุกชนิด กลุ่ม 1 (งานบาน)\n\n';
md += '> READ-ONLY dump จากระบบจริง `public/calculator/index.html` (render ผ่าน buildItemOpts ใน jsdom) · '+results.length+' ชนิด · ราคาฝังในข้อความ option ตามจริง\n\n';
md += '> สร้างโดย `scripts/dump-g6-options.mjs` + `scripts/gen-g6-md.mjs` · ห้ามเดา ต้นฉบับ = index.html\n\n';

// catalog กลาง (อ้างอิงซ้ำ)
md += '## 📚 Catalog กลาง (ใช้ซ้ำในหลายบาน)\n\n';
md += '### มือจับดิจิตอล (10 รุ่น · o-digi)\n'+cat.DIGI.map(d=>`- ${d.n} — +${fmt(d.p)}${d.jr?' (JR)':''}`).join('\n')+'\n\n';
md += '### มือจับสแตนอร่าม (o-stainless)\n'+cat.HANDLE_STAINLESS.map(s=>`- ${s.n} — +${fmt(s.p)}`).join('\n')+'\n\n';
md += '### มุ้ง — catalog ในบาน (o-mosq · '+cat.MOSQUITO_SCREENS.length+' ชนิด)\n'+cat.MOSQUITO_SCREENS.map(m=>{
  const price = m.frame ? `เฟรม (min ประตู ${fmt(m.min_door)} / หน้าต่าง ${fmt(m.min_window)})` : `${fmt(m.rate)}/ตร.ม. min ${fmt(m.min)}`;
  return `- **${m.name}** — ${price}${m.itype?` · [${m.itype}]`:''}${m.overhang?' · ติดล้นนอกวงกบ':''}`;
}).join('\n')+'\n\n';
md += '### COMMON_OPTS (เสริมคาน/ราง/รางยู · ต่อบาน/ต่อความยาว)\n'+cat.COMMON_OPTS.map(o=>{
  const price = o.perLen ? `≤${o.freeLen}ม.=${fmt(o.base)} · เกิน +${o.lenRate}/ม.` : `+${fmt(o.price)}${o.perPanel?'/บาน':''}`;
  return `- **${o.label}** — ${price} · ใช้กับ: ${o.ids.join(', ')}`;
}).join('\n')+'\n\n';

// ครอบวงกบ (frame_wrap) — ดึงจาก PRODUCTS ราคาตามสี (ไม่ render ในบาน แต่ relevant)
md += '### ครอบวงกบ — ราคาตามสี (o-fcsides ในบาน = จำนวนด้าน · ราคาวงกบจริงตาม fw_* product)\n';
md += '- สีดำ/ขาว/ซาฮาร่า — 700/ม.\n- สีอื่นๆ สต๊อก — 800/ม.\n- สีอบพิเศษ — 1,200/ม.\n- ลายไม้อบพิเศษ — 1,300/ม.\n\n';

md += '---\n\n';

// ต่อกลุ่ม 6 ปุ่ม
for(const six of SIX_ORDER){
  const list = results.filter(r=>r.six===six);
  if(!list.length) continue;
  md += `## ${SIX_LABEL[six]}\n\n`;
  for(const r of list){
    md += `### ${r.name}\n`;
    md += `\`${r.id}\` · cat: ${r.cat} · method: ${r.method||'-'}${r.min?' · min '+fmt(r.min):''} · `;
    md += `สี:${r.meta.showColor?'✓':'✗'} กระจก:${r.meta.showGlass?'✓':'✗'} หลายบาน:${r.meta.usesPanels?'✓':'✗'}\n\n`;
    const cats = describeControls(r.ctrls);
    for(const k of ['ออปชั่นหลัก','มือจับ','มุ้ง','เสริมกระจก','อุปกรณ์เสริม']){
      if(!cats[k].length) continue;
      md += `**${k}:**\n`;
      cats[k].forEach(line=>md += `- ${line}\n`);
      md += '\n';
    }
    md += '\n';
  }
  md += '---\n\n';
}

// ===== GAP ANALYSIS เทียบ P object ในดราฟ DRAFT-G6-ux-REAL =====
// อ่านดราฟเพื่อดึง key ของ P object ที่มีอยู่
const draftPath = path.join(ROOT,'docs','DRAFT-G6-ux-REAL-2026-06-13.html');
let draftKeys = [];
try {
  const draft = fs.readFileSync(draftPath,'utf8');
  const m = draft.match(/var P=\{([\s\S]*?)\n\}/);
  if(m){ draftKeys = [...m[1].matchAll(/^\s*(\w+):\{/gm)].map(x=>x[1]); }
} catch(e){}

md += '## 🔴 GAP ANALYSIS — ดราฟ DRAFT-G6-ux-REAL ปัจจุบันขาดอะไร\n\n';
md += 'P object ในดราฟมี key: `'+draftKeys.join('` `')+'`\n\n';
md += 'จุดที่ดราฟ "ข้อมูลย่อยไม่ครบ" เทียบของจริง (ไล่จาก dump):\n\n';

const gaps = [
  ['fold / foldX (บานเฟี้ยม)', 'ดราฟมีแค่ ทิศเปิด+ธรณี. **ของจริงมีเพิ่ม:** มุ้งเต็ม catalog · เสริมคานซัพพอร์ท/ซ่อนคาน/ซ่อนราง/ฝังรางยู (COMMON_OPTS · 4,000+500/ม.) · คาดตาราง (o-gm) · แผ่นทึบล่าง (ลูกฟูก 3,500/คอมโพสิท 3,300 + สีลูกฟูก 5 ระดับ) · ครอบวงกบ · ดรอปพื้น. foldX เพิ่มมือจับ X-series (ฟรี).'],
  ['inner / innerX (เลื่อนภายในรางบน)', 'ดราฟ inner มี ลักษณะการเปิด+ราง; innerX มีแค่ราง. **ของจริง inner_top_stack:** Soft Close +4,000 · สลิงเปิดซ้อน +2,000/บาน · ซ่อนคาน · เสริมคานซัพพอร์ท · ชุดล็อค · คาดตาราง · ครอบวงกบ. **inner_top_slimlux/xseries:** มือจับ X-series ฟรี · ฝังรางยู (U-Track) · ซ่อนคาน · เสริมคาน · ชุดล็อค. หมายเหตุ: รางบน (โชว์/ซ่อน +5,000) อยู่ใน sliding-main-block ของ inner_top เท่านั้น (รางล่าง inner_bottom ไม่มี).'],
  ['slide (บานเลื่อน)', 'ดราฟครบระดับหลัก. **ของจริงเพิ่ม:** ราง รุ่นกันน้ำ/รางเตี้ย 7มม. (o-bottomrail) · ฝังรางยูในพื้น (o-uchannel) · แผ่นทึบล่าง+สีลูกฟูก · คาดตาราง 4 ช่อง (เส้นนอน/ตั้ง/ราคา/โค้ง) · มือจับเต็ม (Cmech+10 ดิจิตอล+สแตนอร่าม 6 ขนาด).'],
  ['swing (บานเปิด)', 'ดราฟมี ธรณี+โช้ค. **ของจริงเพิ่ม:** มือจับเต็ม (Cmech ฝัง/เมโทร 7 สี + ดิจิตอล 10 รุ่น + สแตนอร่าม) · โช้ค 3 แบบ (แขนยื่น/รางเลื่อน/บานพับ +5,000) · combo บานกระทุ้งเข้าใน+มุ้งนิรภัย · คาดตาราง · แผ่นทึบล่าง. โซลิดวัน/ทู (casement_flush/inset_solid) เพิ่ม: ตารางเต็มบาน +5,000 · ช่องแสงกระจก (พื้นที่).'],
  ['pc (PC Door)', 'ดราฟมี lock+handle+mosq. **ของจริงเพิ่ม:** เสริมคานซัพพอร์ท (COMMON_OPTS) · ชุดล็อค (มีกุญแจ/ไม่มี) · คาดตาราง · แผ่นทึบล่าง.'],
  ['lift (บานยก)', 'ดราฟมี มอเตอร์. **ของจริง:** มอเตอร์ 0/80กก.+18,000/300กก.+28,000 (ชิป o-motor) · มุ้ง · คาดตาราง · ครอบวงกบ. ไม่มีดรอปพื้น/มือจับดิจิตอล.'],
  ['awning (บานกระทุ้ง)', 'ดราฟมี ลักษณะเปิด 3 แบบ. **ของจริง:** awn_mode (เปิดล่าง/เปิดข้าง/tilt&turn +5,000) · มือจับ Cmech หลบมุ้ง (o-cmechawn · ดำ/ขาว +600 · ชุบ +840) · มุ้ง · เสริมแขนค้ำ (awning_brace +500/ชุด แยก product) · คาดตาราง.'],
  ['curve (ดัดโค้ง)', 'ดราฟมี handle+glass. **ของจริง:** บานคู่/เดี่ยว มีมือจับดิจิตอล (digihandle) · บานติดตายดัดโค้งไม่มีมือจับ · คาดตาราง · ครอบวงกบ. กระจก default 60 (เทมเปอร์).'],
  ['ykk (YKK)', 'ดราฟมี โช้ค. **ของจริง:** ทั้ง 3 รุ่น (Vent/Exhido/Tostem A01) มี o-closer (โช้ค 3 แบบ +5,000) · ดรอปพื้น · รื้อ. ไม่มีมุ้ง/มือจับ/คาดตาราง/ครอบวงกบ (areaOnly).'],
  ['shower', 'ดราฟครบ (รูปแบบ+อุปกรณ์). ของจริงเพิ่ม: ประเภทประตู (บานเปิด/เลื่อน · o-shdoortype) · มือจับสแตนอร่าม.'],
  ['frame / frfix (บานเปลือย)', 'frfix: กระจก+สีเฟรม. frame: ประเภท สวิง/เลื่อน + สีเฟรม 6 สี (ขาว/ดำ/บรอนซ์/แชมเปญ/เทาซาฮาร่า/อบพิเศษ) + มือจับสแตนอร่าม.'],
  ['ขาดใน P object เลย (ไม่มี profile)', '**เส้นคาด (grid_bars)** และ **ลูกฟูก+คอมโพสิททึบ (rn89-92)** — อยู่ในกลุ่ม 1 cat list แต่ดราฟ G6 ไม่มี profile. ทั้งคู่เป็น "ออปชั่นบานกระจก" (คาดตาราง o-gm-* / ลูกฟูก o-sl-*) ตามมติ master — ถ้าจะใส่ใน G6 ควรเป็น add-on ไม่ใช่บานเดี่ยว.'],
];
gaps.forEach(g=>{ md += `### ${g[0]}\n${g[1]}\n\n`; });

fs.writeFileSync(path.join(ROOT,'docs','_g6-option-detail.md'), md, 'utf8');
console.log('Wrote docs/_g6-option-detail.md ('+md.length+' chars)');

// ===== P-object JSON (โครงพร้อมแปะในดราฟ) =====
// สร้างจาก dump จริง → รูปแบบ {profileKey:{main:[[label,[opts]]],handle,mosq,glass,ex:[...]}}
function buildP(){
  const map={
    sliding_euro:'slide', inner_top_stack:'inner', inner_top_slimlux:'innerX',
    casement_euro:'swing', casement_xseries:'swingX', casement_velora:'swingV',
    awning_euro:'awning', pivot:'pivot', folding:'fold', folding_xseries:'foldX',
    fixed_glass:'fix', frameless_fixed:'frfix', frameless_door:'frame',
    curved_single:'curve', lift_sms:'lift', pc_door_2:'pc', shower:'shower', ykk_vent:'ykk',
    casement_flush_solid:'solid'
  };
  const P={};
  for(const [id,key] of Object.entries(map)){
    const r=results.find(x=>x.id===id); if(!r) continue;
    const main=[];
    r.ctrls.forEach(c=>{
      const cls=c.controls.map(x=>x.cls).join(',');
      const k=ctrlCategory(cls,c.label);
      if(k!=='ออปชั่นหลัก') return;
      c.controls.forEach(x=>{
        if(x.type==='select' && x.options.length>1){
          const opts=x.options.filter(o=>o.t && !/^—/.test(o.t)).map(o=>o.t);
          main.push([c.label.replace(/\s*\(.*$/,'').trim()||x.cls, opts]);
        }
      });
    });
    const o={};
    if(main.length) o.main=main;
    if(r.flags.digihandle) o.handle=1;
    if(r.flags.mosquito) o.mosq=1;
    if(r.meta.showGlass) o.glass=1;
    P[key]=o;
  }
  return P;
}
fs.writeFileSync(path.join(ROOT,'docs','_g6-P-object.json'), JSON.stringify(buildP(),null,2),'utf8');
console.log('Wrote docs/_g6-P-object.json');
