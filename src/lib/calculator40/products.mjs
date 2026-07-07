// products.mjs — สเปก BOM ต่อรุ่น (ดึงจากสูตรในชีต "คิดทุน ___" ของไฟล์ทุน xlsx)
// ──────────────────────────────────────────────────────────────────────────────
// expression ใช้ตัวแปร: W,H (ม.) · P (จำนวนบาน) · form (string) · area (=W*H) + vars ที่ประกาศ · Math.*
// อลูแต่ละเส้น {name,price,kg,seg,count}: engine ตัด stock (prod.stockLen ?? 6.4ม.) แล้ว ×ราคา×mult
//   seg=ความยาวชิ้น(ม.) [หรือใส่ความยาวรวม count:'1' ก็ได้] · count=จำนวนชิ้น
// กระจก glass = expr พื้นที่กระจก(ตร.ม.) หรือ null · hardware/consum = count×price (คงที่)
// flag พิเศษ: stockLen (เส้น stock), laborPerPanel (ค่าแรง×จำนวนบาน)
//
// ✅ ทุกรุ่น self-verify ตรงชีต xlsx (cost ±1฿) — ดู verify-cost.mjs
// 🎯 ANCHOR: SMS 600×300 3บาน อิสระ → ทุน 16,733.4 · ขาย+ติดตั้ง 36,100
// ──────────────────────────────────────────────────────────────────────────────

// ตัวแปรนับบานแบบบานเลื่อน (SMS / ยูโร)
const SLIDE_VARS = {
  F2: "(form==='อิสระ'||form==='สลับ')?P:(form==='ลากจูง'?P-1:P-2)",   // จำนวนบานเลื่อน (ล้อ/ราง) · สลับ=เลื่อนทุกบาน เหมือนอิสระ
  F3: "form==='ลากจูง'?1:2",                          // คู่มือจับ
  F4: "(form==='อิสระ'||form==='สลับ')?2:1",                           // ชุดล็อค · สลับ เหมือนอิสระ
  F5: "form==='เปิดคู่กลาง'?4:2",                      // เสากุญแจ
  F6: "form==='เปิดคู่กลาง'?P-2:P-1",                  // เสาเกี่ยว
};
// ── ค่าคงที่ที่ใช้ซ้ำหลายรุ่น (รวมไว้ที่เดียว · แก้ครั้งเดียวมีผลทุกรุ่น) ──
const CF_EXPR = "mult*((({white:1,sahara:1.5208,woodStock:1.5859,special:1.9010,woodSpecial:1.9896})[color])||1)";   // ปัจจัยสีกล่อง (R3.9)
const SILICONE = { name: 'ซิลิโคน', price: 90, unit: 'หลอด', count: 'Math.ceil(2*(W+H)*2/12.5)' };                  // ซิลิโคนรอบวงกบ (เส้นรอบรูป×2)
const PERIM_VARS = { PERIM: '2*(W+H)' };                                                                            // เส้นรอบรูป (ฝ้า/ผนัง)
const FAB_SPEC = { key: 'fabcolor', label: 'สีผ้ามุ้ง', opts: ['ดำ', 'เทา', 'ขาว', 'เงิน'], def: 'ดำ', optsByMaterial: { 'ไฟเบอร์': ['ดำ', 'เทา'], 'ไนล่อน': ['ดำ', 'เทา'], 'สแตนเลส': ['เงิน'], 'กันแมว': ['ขาว'], 'กันหนู': ['เงิน', 'ดำ'] } };   // สีผ้ามุ้งตามชนิด (มุ้งทุกรุ่น)
const SCREEN_FABRIC_ROWS = [   // ผ้ามุ้ง 5 ชนิด (screen/screen_big ใช้ร่วม · ราคาตรงชีต)
  { name: 'ผ้ามุ้ง ไฟเบอร์', price: 23, unit: 'ตร.ม.', count: "material==='ไฟเบอร์'?FABQ:0" },
  { name: 'ผ้ามุ้ง ไนล่อน', price: 38, unit: 'ตร.ม.', count: "material==='ไนล่อน'?FABQ:0" },
  { name: 'ผ้ามุ้ง สแตนเลส', price: 352, unit: 'ตร.ม.', count: "material==='สแตนเลส'?FABQ:0" },
  { name: 'ผ้ามุ้ง กันแมว', price: 82, unit: 'ตร.ม.', count: "material==='กันแมว'?FABQ:0" },
  { name: 'ผ้ามุ้ง กันหนู (สแตนเลส)', price: 352, unit: 'ตร.ม.', count: "material==='กันหนู'?FABQ:0" },
];

// แผ่นมุงหลังคา — ราคา fallback/หน่วย ต่อวัสดุ (ราคาจริงมาจาก PB.ROOFMAT ผ่าน ref) · แหล่งเดียว ใช้ทั้ง roof/roof_gable/roof_slide (count ต่างกันต่อรุ่น)
const RM = {
  'ไวนิล': { p: 1540, u: 'แผ่น' }, 'ฝาครอบไวนิล': { p: 245, u: 'เส้น' }, 'ดีไลท์': { p: 4700, u: 'แผ่น' },
  'โพลีตัน': { p: 1200, u: 'ม.' }, 'ครอบโพลีตัน': { p: 420, u: 'จุด' },
  'ชินโคร์ HC': { p: 2800, u: 'ตร.ม.' }, 'ชินโคร์ Sup': { p: 2100, u: 'ตร.ม.' },
  'เมทัล 1" PVC': { p: 948, u: 'ตร.ม.' }, 'เมทัล 2" PVC': { p: 1067, u: 'ตร.ม.' },
  'เมทัล 1" เหล็ก-EPS': { p: 1244, u: 'ตร.ม.' }, 'เมทัล 2" เหล็ก-EPS': { p: 1364, u: 'ตร.ม.' },
  'เมทัล 1" ฟอยล์-PU': { p: 1002, u: 'ตร.ม.' }, 'เมทัล 2" ฟอยล์-PU': { p: 1262, u: 'ตร.ม.' },
  'เมทัล 1" เหล็ก-PU': { p: 1917, u: 'ตร.ม.' }, 'เมทัล 2" เหล็ก-PU': { p: 2117, u: 'ตร.ม.' },
  'กระจก 4+4': { p: 1065, u: 'ตร.ม.' }, 'กระจก 5+5': { p: 1270, u: 'ตร.ม.' }, 'เมทัลชีท': { p: 2200, u: 'ตร.ม.' },
};
const rm = (key, name, count) => ({ name, price: RM[key].p, ref: 'ROOFMAT.' + key, unit: RM[key].u, count });
// สีวัสดุมุงที่เหมือนกันทุกรุ่นหลังคา (label พิมพ์ลงใบ · ไม่กระทบทุน) — แหล่งเดียว (ไวนิล/ดีไลท์/เมทัล · โพลีตัน/ชินโคร์ ต่างกันต่อรุ่น คงไว้ในรุ่น)
const SC_VINYL = [{ n: 'สีขาว', dot: '#f3f4f6' }, { n: 'สีเทา', dot: '#6b7280' }, { n: 'สีน้ำตาล', dot: '#92400e' }];
const SC_DELIGHT = [{ n: 'DG-2 สีฟ้าคราม', dot: '#1d4ed8' }, { n: 'DG7 สีเทาโมเดิร์น', dot: '#374151' }];
const SC_METAL = [{ n: 'สีน้ำตาล', dot: '#92400e' }, { n: 'สีขาว', dot: '#f3f4f6' }, { n: 'สีเทา', dot: '#6b7280' }];

export const PRODUCTS = {

  // ═══════════════════════ G1 บาน ═══════════════════════
  sms_slide: {
    id: 'sms_slide', group: 1, name: 'บานเลื่อน SMS', brand: 'SMS', laborKey: 'บานเลื่อน SMS',
    icon: '🪟', defForm: 'อิสระ', forms: ['อิสระ', 'สลับ', 'ลากจูง', 'เปิดคู่กลาง'],
    specOpts: [{ key: 'bottomrail', label: 'ราง', opts: ['รางกันน้ำ', 'รางเตี้ย (งานใน)'], def: 'รางกันน้ำ' }], // R3.9 label-only · รางเตี้ย=งานในระบุในใบ
    addons: ['mosquito', 'cmech', 'stainless', 'digihandle', 'frame_wrap', 'drop_floor', 'demolish'],   // ห้องกระจก G6 พาริตี้ (2ก.ค.) — มุ้ง/มือจับ/ครอบวงกบ/ดรอปพื้น/รื้อของเดิม (engine computeAddon รองรับอยู่แล้ว)
    defaults: { w: 600, h: 300, p: 3 }, defGlass: 'เขียว 6มม.', minP: 2, maxP: 6,
    vars: SLIDE_VARS,
    alu: [
      { name: 'เฟรมบน', price: 1235, kg: 6.86111, seg: 'W', count: '1' },
      { name: 'เฟรมข้าง', price: 1045, kg: 5.80556, seg: 'H', count: '1' },
      { name: 'เฟรมล่างกันน้ำ', price: 2070, kg: 11.5, seg: 'W', count: '1' },
      { name: 'เสากุญแจ ML', price: 885, kg: 4.91667, seg: 'H', count: 'F5' },
      { name: 'เสาเกี่ยวธรรมดา', price: 745, kg: 4.13889, seg: 'H', count: 'H>2.4?F6:2*F6' },
      { name: 'เสาเกี่ยวรับแรง', price: 1235, kg: 6.86111, seg: 'H', count: 'H>2.4?F6:0' },
      { name: 'ขวางบน/ล่าง', price: 1060, kg: 5.88889, seg: 'W/P', count: '2*P' },
      { name: 'ตบปิดเฟรม', price: 175, kg: 0.97222, seg: 'H', count: '4' },
      { name: 'ตบราง', price: 150, kg: 0.833, seg: 'W', count: 'F2' },
    ],
    glass: '(W+(P-1)*0.1)*H',
    hardware: [
      { name: 'ล้อ 27 (2/บาน)', price: 80, unit: 'ลูก', count: '2*F2' },
      { name: 'มือจับ Align', price: 99, unit: 'ตัว', count: '2*F3' },
      { name: 'ชุดล็อค', price: 189, unit: 'ชุด', count: 'F4' },
    ],
    consum: [
      { name: 'สักหลาด', price: 1.5, unit: 'ม.', count: '6*H+9*W+2*(F5+F6)*H' },
      { name: 'น็อต', price: 1, unit: 'ตัว', count: '8+4*P' },
      SILICONE,
    ],
  },

  euro_slide: {
    id: 'euro_slide', group: 1, name: 'บานเลื่อน ยูโร', brand: 'EURO', laborKey: 'บานเลื่อน ยูโร',
    icon: '🪟', defForm: 'อิสระ', forms: ['อิสระ', 'สลับ', 'ลากจูง', 'เปิดคู่กลาง'],
    specOpts: [{ key: 'bottomrail', label: 'ราง', opts: ['รางกันน้ำ', 'รางเตี้ย (งานใน)'], def: 'รางกันน้ำ' }], // R3.9 label-only · รางเตี้ย=งานในระบุในใบ
    addons: ['mosquito', 'cmech', 'stainless', 'digihandle', 'frame_wrap', 'drop_floor', 'demolish'],   // ห้องกระจก G6 พาริตี้ (2ก.ค.)
    defaults: { w: 600, h: 300, p: 3 }, defGlass: 'เขียว 6มม.', minP: 2, maxP: 6,
    vars: SLIDE_VARS,
    alu: [
      { name: 'กรอบบาน (รอบ)', price: 1445, kg: 7.81081, seg: '2*H*P+2*W', count: '1' },
      { name: 'คิ้วกระจก', price: 200, kg: 1.08108, seg: '2*H*P+2*W', count: '1' },
      { name: 'เฟรมบน', price: 2615, kg: 14.13514, seg: 'W', count: '1' },
      { name: 'เฟรมล่างนอก', price: 2615, kg: 14.13514, seg: 'W', count: '1' },
      { name: 'เฟรมข้าง', price: 935, kg: 5.05405, seg: '2*H', count: '1' },
      { name: 'เดือย', price: 285, kg: 1.54054, seg: 6.4, count: '1' },
      { name: 'ตบเกี่ยว', price: 465, kg: 2.51351, seg: 6.4, count: "form==='เปิดคู่กลาง'?2:(P-1)" },
      { name: 'โหนกเกี่ยว(≥3ม.)', price: 2020, kg: 10.91892, seg: 6.4, count: 'H>=3?F6:0' },
      { name: 'ตบปิดน๊อต F7988', price: 120, kg: 0.66667, seg: 6.4, count: '2*Math.max(P-1,0)' },
      { name: 'ตบปิดราง F7993', price: 120, kg: 0.66667, seg: 'F2*W', count: '1' },
      { name: 'ตบราง F7994', price: 150, kg: 0.83333, seg: 'F2*W', count: '1' },
      { name: 'ตบปิดร่องบน', price: 505, kg: 2.72973, seg: 6.4, count: '1' },
      { name: 'ชนกลาง(เปิดคู่กลาง)', price: 1230, kg: 6.64865, seg: 6.4, count: "form==='เปิดคู่กลาง'?1:0" },
      { name: 'ตบปิดเฟรมร่องใน', price: 345, kg: 1.86486, seg: 6.4, count: "form==='เปิดคู่กลาง'?2:0" },
      { name: 'ตบปิดเฟรมร่องกลาง', price: 355, kg: 1.91892, seg: 6.4, count: "form==='เปิดคู่กลาง'?2:0" },
    ],
    glass: '((W)+(P-1)*0.1)*H',
    hardware: [
      { name: 'ล้อ 27 (2/บาน)', price: 80, unit: 'ลูก', count: '2*F2' },
      { name: 'มือจับ Align (2/บาน)', price: 99, unit: 'ตัว', count: '2*F3' },
      { name: 'ชุดล็อค', price: 189, unit: 'ชุด', count: 'F4' },
      { name: 'มุมเลื่อน (8/บาน)', price: 2, unit: 'ตัว', count: '8*P' },
      { name: 'สปริงก็อต (4/บาน)', price: 29, unit: 'ตัว', count: '4*P' },
    ],
    consum: [
      { name: 'สักหลาด', price: 1.5, unit: 'ม.', count: '6*H+9*W+2*(F5+F6)*H' },
      { name: 'น็อต', price: 1, unit: 'ตัว', count: '8+4*P' },
      SILICONE,
    ],
  },

  slimlux: {
    id: 'slimlux', group: 1, name: 'บานเลื่อนเฟรมบาง SlimLux', brand: 'SLIMLUX', laborKey: 'SlimLux',
    icon: '🪟', defForm: 'อิสระ', forms: ['อิสระ', 'ลากจูง', 'เปิดคู่กลาง'],   // LUT รองรับ ลากจูง(3-5)/เปิดคู่กลาง(4,6) — ไม่มีสลับ
    specOpts: [{ key: 'slxhandle', label: 'มือจับ', opts: ['มือจับล็อค (มาตรฐาน)', 'X-J', 'ลูกค้าเตรียมเอง'], def: 'มือจับล็อค (มาตรฐาน)' }], // มด dropdown B7 · label (ลูกค้าเตรียมเอง=ไม่รวมมือจับ · เช็คซ้ำราคา)
    defaults: { w: 200, h: 200, p: 2 }, defGlass: 'เทมเปอร์ 6มม.', minP: 2, maxP: 5,
    vars: {
      ZERO: '({h:0,i:0,j:0,k:0,l:0,m:0,n:0,o:0,p:0,q:0,r:0,s:0,t:0,u:0,v:0,w:0,x:0})',
      T: "(({'อิสระ-2':{h:1,i:2,j:1,k:1,l:1,m:1,n:1,o:1,p:2,q:2,r:1,s:2,t:1,u:8,v:4,w:2,x:0},'อิสระ-3':{h:1,i:3,j:1,k:2,l:2,m:2,n:1,o:1,p:2,q:2,r:1,s:1,t:1,u:12,v:6,w:2,x:1},'อิสระ-4':{h:2,i:4,j:1,k:3,l:3,m:2,n:2,o:2,p:2,q:2,r:1,s:1,t:1,u:16,v:8,w:2,x:1},'อิสระ-5':{h:2,i:5,j:1,k:4,l:4,m:2,n:3,o:2,p:3,q:2,r:2,s:1,t:1,u:20,v:10,w:2,x:1},'ลากจูง-3':{h:1,i:3,j:1,k:1,l:2,m:1,n:1,o:1,p:2,q:1,r:1,s:1,t:1,u:8,v:4,w:1,x:1},'ลากจูง-4':{h:2,i:4,j:1,k:2,l:3,m:2,n:2,o:2,p:2,q:1,r:1,s:1,t:1,u:12,v:6,w:1,x:1},'ลากจูง-5':{h:2,i:5,j:1,k:3,l:4,m:2,n:2,o:2,p:2,q:1,r:2,s:1,t:1,u:16,v:8,w:1,x:1},'เปิดคู่กลาง-4':{h:2,i:4,j:2,k:2,l:2,m:1,n:2,o:2,p:2,q:2,r:1,s:2,t:1,u:8,v:4,w:2,x:0},'เปิดคู่กลาง-6':{h:2,i:6,j:2,k:4,l:4,m:2,n:3,o:2,p:2,q:2,r:1,s:2,t:1,u:16,v:8,w:2,x:1}})[form+'-'+P]) || ZERO",
    },
    alu: [
      { name: 'ขวางบน/ล่าง (WM-K04)', price: 733, kg: 4.7, seg: 5, count: 'T.h' },
      { name: 'เสาบาน (WM-K01)', price: 500, kg: 2.95, seg: 5, count: 'T.i' },
      { name: 'ตบเรียบ (WM-K02)', price: 343, kg: 1.57, seg: 5, count: 'T.j' },
      { name: 'ตบเกี่ยว (WM-K03)', price: 343, kg: 1.69, seg: 5, count: 'T.k' },
      { name: 'ฝาล่างเล็ก (WM-K20)', price: 197, kg: 0.5, seg: 5, count: 'T.m' },
      { name: 'ฝาล่างใหญ่ (WM-K21A)', price: 233, kg: 0.8, seg: 5, count: 'T.n' },
      { name: 'ฉากปิดราง', price: 320, kg: 1, seg: 5, count: 'T.o' },
      { name: 'กล่องเฟรม/คาน', price: 1400, kg: 5.98, seg: 5, count: 'T.p' },
    ],
    glass: 'W*H',
    hardware: [
      { name: 'รางแขวน (WM-K15)', price: 988, unit: 'เส้น', count: 'T.l' },
      { name: '9072 หัวบาน', price: 750, unit: 'เส้น', count: 'T.q' },
      { name: '9073 กลางบาน', price: 850, unit: 'เส้น', count: 'T.r' },
      { name: 'ตัวต่อ+สักหลาด (ชุด)', price: 100, unit: 'ชุด', count: 'T.t' },
      { name: 'ข้อต่อบาน', price: 42, unit: 'ตัว', count: 'T.u' },
      { name: 'ล้อล่าง (ตัว)', price: 100, unit: 'ตัว', count: 'T.v' },
      { name: 'soft close (ชุด)', price: 650, unit: 'ชุด', count: 'T.w' },
      { name: 'สลิง (ชุด)', price: 700, unit: 'ชุด', count: 'T.x' },
      { name: 'มือจับล็อค', price: 200, unit: 'ชุด', count: 'T.s' },
    ],
    consum: [
      SILICONE,
    ],
    note: 'P รองรับ: อิสระ 2-5 · ลากจูง 3-5 · เปิดคู่กลาง 4,6',
  },

  open_door: {
    id: 'open_door', group: 1, name: 'บานเปิด', brand: 'EURO', laborKey: 'บานเปิด (ยูโร)',
    icon: '🚪', defForm: 'มีธรณี', forms: ['มีธรณี', 'ไม่มีธรณี'],
    addons: ['thresh', 'closer', 'mosquito', 'cmech', 'stainless', 'digihandle', 'frame_wrap', 'drop_floor', 'demolish'],   // ห้องกระจก G6 พาริตี้ (2ก.ค.) — ธรณีหลังเต่า/โช้คอัพ/มือจับ/มุ้ง
    defaults: { w: 150, h: 200, p: 1 }, defGlass: 'เขียว 6มม.', minP: 1, maxP: 4,
    vars: {
      S: "form==='มีธรณี'?1:0",
      HG: '(H>3||(W/P)>1.2)?5:4',
    },
    alu: [
      { name: 'วงกบ 3 ด้าน F7859', price: 1100, kg: 6.11111, seg: 'W+2*H', count: '1' },
      { name: 'ธรณี F7938B', price: 1400, kg: 7.77778, seg: 'W', count: 'S' },
      { name: 'ตบธรณี F7960', price: 575, kg: 3.19444, seg: 'W', count: 'S' },
      { name: 'เสริมใต้บาน F7863', price: 435, kg: 2.41667, seg: 'W', count: '1-S' },
      { name: 'กรอบประตู 7864', price: 1995, kg: 11.08333, seg: '2*P*H+2*W', count: '1' },
      { name: 'คิ้ว F7935', price: 360, kg: 2, seg: '2*P*H+2*W', count: '1' },
      { name: 'เปิดกลาง F7945c', price: 775, kg: 4.30556, seg: 'H', count: 'P>1?1:0' },
    ],
    glass: 'W*H',
    hardware: [
      { name: 'บานพับ hyda', price: 117, unit: 'ตัว', count: 'HG*P' },
      { name: 'มือจับ+ล็อค ใบหลัก', price: 1045, unit: 'ชุด', count: '1' },
      { name: 'ชุดกลอน ใบลอง', price: 450, unit: 'ชุด', count: 'Math.max(P-1,0)' },
      { name: 'น็อตเฟรม', price: 1, unit: 'ตัว', count: 'S?8:6' },
    ],
    consum: [
      { name: 'ยาง', price: 11, unit: 'ม.', count: 'Math.round(2*(W+H)*P)' },
      SILICONE,
    ],
  },

  awning: {
    id: 'awning', group: 1, name: 'บานกระทุ้ง', brand: 'EURO', laborKey: 'บานกระทุ้ง (ยูโร)',
    icon: '🪟', defForm: 'เปิดล่าง', forms: ['เปิดล่าง', 'เปิดข้าง'], // แบบเปิด (R3.9 awn_mode) · Tilt&Turn = ออปชั่น awn_tt (+5,000/บาน)
    addons: ['awn_tt', 'awn_brace', 'awn_auto', 'mosquito', 'frame_wrap', 'drop_floor', 'demolish'],   // ห้องกระจก G6 พาริตี้ (2ก.ค.) — Tilt&Turn/แขนค้ำ/ชุดออโต้/มุ้ง
    defaults: { w: 40, h: 40, p: 1 }, defGlass: 'เขียว 6มม.', minP: 1, maxP: 4,
    vars: {},
    alu: [
      { name: 'วงกบ 3 ด้าน F7859', price: 1100, kg: 6.11111, seg: '(W+2*H)', count: '1' },
      { name: 'ธรณี F7939B', price: 1400, kg: 7.77778, seg: 'W', count: '1' },
      { name: 'กรอบ 7943B', price: 1480, kg: 8.22222, seg: '(2*P*H+2*W)', count: '1' },
      { name: 'คิ้ว F7935', price: 360, kg: 2, seg: '(2*P*H+2*W)', count: '1' },
      { name: 'เปิดกลาง F7945c', price: 775, kg: 4.30556, seg: 'H', count: '(P>1?1:0)' },
    ],
    glass: 'W*H',
    hardware: [
      { name: 'มือจับ', price: 140, unit: 'ตัว', count: '1' },
      { name: 'วิทโก้', price: 200, unit: 'ตัว', count: '2*P' },
      { name: 'CDQ', price: 150, unit: 'ชุด', count: 'P' },
      { name: 'รับล็อคลูกเบี้ยว', price: 15, unit: 'ตัว', count: '2' },
      { name: 'ลูกเบี้ยว', price: 17, unit: 'ตัว', count: '2' },
      { name: 'แกนล็อค', price: 63, unit: 'ตัว', count: '2*P' },
      { name: 'แป้นรับล็อค', price: 45, unit: 'ตัว', count: '2*P' },
      { name: 'สปริก็อต', price: 12, unit: 'ตัว', count: '4*P' },
      { name: 'คลิปเข้ามุม', price: 5, unit: 'ตัว', count: '12*P' },
      { name: 'น็อตประกอบบาน', price: 1, unit: 'ตัว', count: '8' },
      { name: 'วาวล์ระบายน้ำ', price: 14, unit: 'ตัว', count: '2' },
    ],
    consum: [
      { name: 'ยางอัดกระจก', price: 11, unit: 'ม.', count: 'Math.round(2*(W+H)*10)/10' },
      { name: 'ยาง foam', price: 5, unit: 'ม.', count: 'Math.round(4*(W+H)*10)/10' },
      SILICONE,
    ],
  },

  folding: {
    id: 'folding', group: 1, name: 'บานเฟี้ยม', brand: 'EURO', laborKey: 'บานเฟี้ยม (sms)',
    icon: '🪟', laborPerPanel: true, pFromForm: true,
    specOpts: [ // สเปก label เท่านั้น (R3.9 folddir/threshf — ไม่กระทบราคา · พิมพ์ลงใบ) · threshf ตรง มด (ธรณี/หลังเต่า/รางยู)
      { key: 'folddir', label: 'ทิศเปิด', opts: ['เปิดขวา', 'เปิดซ้าย', 'แยกกลาง'], def: 'เปิดซ้าย' },
      { key: 'threshf', label: 'ธรณีเฟี้ยม', opts: ['ธรณีกันน้ำ', 'ธรณีหลังเต่า', 'รางยู'], def: 'ธรณีกันน้ำ' }, // มด dropdown B6 (label · รางยู/หลังเต่า เช็คซ้ำราคา)
    ],
    addons: ['mosquito', 'frame_wrap', 'drop_floor', 'demolish'],   // ห้องกระจก G6 พาริตี้ (2ก.ค.)
    defForm: '2บาน: รวบเปิดซ้าย (2-0)',
    // เฟี้ยมเปิด 3 แบบ (พี่สั่ง 1ก.ค.): รวบเปิดซ้าย (X-0) · รวบเปิดขวา (0-X · ราคาเท่ารวบซ้าย mirror) · เปิดกลาง (แยกครึ่ง) · เลิก "พับสลับ" · โค้ด (X-Y) คงไว้ให้ HW parse
    forms: ['2บาน: รวบเปิดซ้าย (2-0)', '2บาน: รวบเปิดขวา (0-2)', '2บาน: เปิดกลาง (1-1)', '3บาน: รวบเปิดซ้าย (3-0)', '3บาน: รวบเปิดขวา (0-3)', '3บาน: เปิดกลาง (2-1)', '4บาน: รวบเปิดซ้าย (4-0)', '4บาน: รวบเปิดขวา (0-4)', '4บาน: เปิดกลาง (2-2)', '5บาน: รวบเปิดซ้าย (5-0)', '5บาน: รวบเปิดขวา (0-5)', '5บาน: เปิดกลาง (3-2)', '6บาน: รวบเปิดซ้าย (6-0)', '6บาน: รวบเปิดขวา (0-6)', '6บาน: เปิดกลาง (3-3)'],
    defaults: { w: 180, h: 280, p: 2 }, defGlass: 'เขียว 6มม.', minP: 2, maxP: 6,
    vars: {
      // อุปกรณ์เฟี้ยม (ชุด) — ค่า "รวบข้างเดียว" (X-0/0-X) calibrate ตรง matrix มด เป๊ะ (1755/1755 · ดู r40-matrix-verify) · เปิดกลาง(แยกครึ่ง) คงค่าเดิม (matrix ไม่มี grid ให้เทียบ)
      HW: "(function(){var f=form;var open=f.indexOf('เปิดกลาง')>=0;if(f.indexOf('2บาน')===0)return 5230;if(f.indexOf('3บาน')===0)return (f.indexOf('3-0')>=0||f.indexOf('0-3')>=0)?6362:9112;if(f.indexOf('4บาน')===0)return open?11916:((f.indexOf('4-0')>=0||f.indexOf('0-4')>=0)?8702:9658);if(f.indexOf('5บาน')===0)return (f.indexOf('5-0')>=0||f.indexOf('0-5')>=0)?10014:13462;if(f.indexOf('6บาน')===0)return (f.indexOf('6-0')>=0||f.indexOf('0-6')>=0)?12354:14008;return 5230;})()",
    },
    alu: [
      { name: 'B24001 เฟรมบน', price: 2105, kg: 11.69444, seg: 'W', count: '1' },
      { name: 'B24002 คิ้วเฟรมบน', price: 320, kg: 1.77778, seg: 'W', count: '1' },
      { name: 'เฟรมล่าง (ธรณี)', price: 1445, kg: 8.0278, seg: 'W', count: '1' },
      { name: 'B24004 ตบธรณี', price: 570, kg: 3.16667, seg: 'W', count: '1' },
      { name: 'B24005 เฟรมข้าง', price: 1000, kg: 5.55556, seg: 'H', count: '2' },
      { name: 'B24006 คิ้วเฟรมข้าง', price: 280, kg: 1.55556, seg: 'H', count: '2' },
      { name: 'B24007 เสาบาน', price: 1210, kg: 6.72222, seg: '2*(H*P+W)', count: '1' },
      { name: 'B24008 คิ้วตบกระจก', price: 265, kg: 1.47222, seg: '2*(H*P+W)', count: '1' },
      { name: 'B24009 ต่อกลาง', price: 325, kg: 1.80556, seg: 'H', count: 'P%2===0?1:0' },
    ],
    glass: 'W*H',
    hardware: [
      { name: 'ยาง', price: 11, unit: 'ม.', count: 'Math.round(2*(H*P+W)*10)/10' },
      { name: 'อุปกรณ์เฟี้ยม (ชุด)', price: 1, unit: 'ชุด', count: 'HW' },
    ],
    consum: [
      SILICONE,
    ],
  },

  fixed: {
    id: 'fixed', group: 1, name: 'บานติดตาย', brand: 'MTONG', laborKey: 'บานติดตาย',
    icon: '🟦', defForm: 'กระจกล้วน', forms: ['กระจกล้วน'], stockLen: 6.0,
    addons: ['frame_wrap', 'demolish'],   // ห้องกระจก G6 พาริตี้ (2ก.ค.) — ติดตาย: ครอบวงกบ/รื้อของเดิม เท่านั้น (ไม่มีมือจับ/ล็อค/มุ้ง)
    defaults: { w: 150, h: 200, p: 1 }, defGlass: 'เขียว 6มม.', minP: 1, maxP: 6,
    alu: [
      { name: 'กล่อง 1.6"x3" (วิ่งรอบ)', price: 1240, kg: 0, seg: 'W', count: '2' },
      { name: 'กล่อง 1.6"x3" (เสา)', price: 1240, kg: 0, seg: 'H', count: 'P+1' },
      { name: '9014 ตบหน้ากระจก (บน-ล่าง)', price: 380, kg: 0, seg: 'W/P', count: '2*P' },
      { name: '9014 ตบหน้ากระจก (ข้าง)', price: 380, kg: 0, seg: 'H', count: '2*P' },
    ],
    glass: 'W*H',
    hardware: [
      { name: 'ฉาก อลู 1"x1" (4 มุม/ช่อง)', price: 5, unit: 'มุม', count: '4*P' },
    ],
    consum: [
      { name: 'เทปหนุนกระจก', price: 10, unit: 'ม.', count: 'Math.round((2*W + 2*P*H)*10)/10' },
      { name: 'ซิลิโคน ใน+นอก', price: 90, unit: 'หลอด', count: 'Math.ceil((2*W + 2*P*H)*2/12.5)' },
    ],
  },

  topslide: {
    id: 'topslide', group: 1, name: 'บานเลื่อนรางบน', brand: 'MTONG', laborKey: 'บานเลื่อนรางบน',
    icon: '🚪', defForm: 'เลื่อนซ้อน', forms: ['เลื่อนซ้อน'],
    defaults: { w: 360, h: 240, p: 2 }, defGlass: 'เขียว 6มม.', minP: 2, maxP: 6,
    vars: {},
    alu: [],
    glass: 'W*H',
    hardware: [
      { name: 'รางบน Hafele', price: 2010, unit: 'เส้น', count: 'Math.ceil(W*2/6)*P' },
      { name: 'ล้อ Hafele', price: 1170, unit: 'กล่อง', count: 'P' },
      { name: 'เสารับ 1"x4"', price: 905, unit: 'เส้น', count: 'Math.ceil(H/6)' },
      { name: 'คานรับราง 1.6"x4"', price: 1220, unit: 'เส้น', count: 'Math.ceil(W*2/6)' },
      { name: 'กรอบบาน เสากุญแจ 20051', price: 885, unit: 'เส้น', count: 'Math.ceil(2*(W+P*H)/6)' },
      { name: 'ชนกลางรับบาน', price: 300, unit: 'ท่อน', count: 'Math.ceil(H/6)' },
      { name: 'ฉาก 4" ปิดราง', price: 280, unit: 'ท่อน', count: '2*Math.ceil(W*2/6)' },
      { name: 'มือจับ Align', price: 99, unit: 'ตัว', count: '2*P' },
      { name: 'ชุดล็อค', price: 189, unit: 'ชุด', count: 'P' },
    ],
    consum: [
      SILICONE,
    ],
  },

  eseries: {
    id: 'eseries', group: 1, name: 'บานเลื่อน E-series', brand: 'SMS', laborKey: 'บานเลื่อน SMS',
    icon: '🪟', defForm: 'อิสระ', forms: ['อิสระ', 'สลับ', 'ลากจูง', 'เปิดคู่กลาง'],
    specOpts: [{ key: 'bottomrail', label: 'ราง', opts: ['รางกันน้ำ', 'รางเตี้ย (งานใน)'], def: 'รางกันน้ำ' }], // R3.9 label-only · รางเตี้ย=งานในระบุในใบ
    defaults: { w: 600, h: 300, p: 3 }, defGlass: 'เขียว 6มม.', minP: 2, maxP: 6,
    vars: {
      F2: "form==='อิสระ'?P:(form==='ลากจูง'?P-1:P-2)",
      F3: "form==='เปิดคู่กลาง'?4:2",
      F4: "form==='เปิดคู่กลาง'?P-2:P-1",
    },
    alu: [
      { name: 'เฟรมบน E-01', price: 2235, kg: 12.41667, seg: 'W', count: '1' },
      { name: 'เฟรมล่างกันน้ำ E-03', price: 2152, kg: 11.95556, seg: 'W', count: '1' },
      { name: 'เฟรมข้าง E-02C', price: 1995, kg: 11.08333, seg: 'H', count: '2' },
      { name: 'ถาดลองน้ำ E-03B', price: 742, kg: 4.12222, seg: 'W', count: '1' },
      { name: 'เสากุญแจสลิม E-04e', price: 1080, kg: 6, seg: 'H', count: 'F3' },
      { name: 'เสาเกี่ยวสลิม E-05e', price: 1072, kg: 5.95556, seg: 'H', count: '2*F4' },
      { name: 'ขวางบน/ล่าง E-07e', price: 1162, kg: 6.45556, seg: 'W/P', count: '2*P' },
      { name: 'ตบปิดเฟรมบน E-01A', price: 270, kg: 1.5, seg: 'W', count: "(form==='อิสระ'&&P===3)?0:(W>3?2:1)" },
      { name: 'ตบธรณีเฟรมล่าง E-03C', price: 450, kg: 2.5, seg: 'W', count: "(form==='อิสระ'&&P===3)?0:(W>3?2:1)" },
    ],
    glass: '((W)+(P-1)*0.1)*H',
    hardware: [
      { name: 'ล้อ ehr-80 (2/บานเลื่อน)', price: 135, unit: 'ลูก', count: '2*F2' },
      { name: 'ล็อคก้นหอย', price: 100, unit: 'ตัว', count: '2' },
    ],
    consum: [
      { name: 'สักหลาด', price: 1.5, unit: 'ม.', count: '6*H+9*W+2*(F3+F4)*H' },
      { name: 'น็อต', price: 1, unit: 'ตัว', count: '8+4*P' },
      SILICONE,
    ],
    note: 'รางล่างดีฟอลต์ภายนอก · ออปชั่นรางใน/มุ้ง ยังไม่ทำ',
  },

  velora: {
    id: 'velora', group: 1, name: 'Velora บานเปิด', brand: 'VELORA', laborKey: 'Velora',
    icon: '🚪', defForm: 'เดี่ยว', forms: ['เดี่ยว', 'คู่'], stockLen: 6.0,
    defaults: { w: 220, h: 200, p: 1 }, defGlass: 'เทมเปอร์ใส 6มม.', defColor: 'sahara', minP: 1, maxP: 2,
    vars: {
      HANDLE: '450',
      NBAN: "P===1 ? Math.ceil(2*(W+H)/6 -1e-9) : (Math.ceil(2*(W+H)/6 -1e-9) + Math.ceil(H/6 -1e-9))",
    },
    alu: [
      { name: 'วงกบ 3 ด้าน (บน+ซ้าย+ขวา)', price: 768, kg: 3.576, seg: 'W+2*H', count: '1' },
      { name: 'บาน (วิ่งรอบ 4 ด้าน)', price: 720, kg: 2.886, seg: 6.0, count: 'NBAN' },
    ],
    glass: 'W*H',
    hardware: [
      { name: 'บานพับ (4 ตัว/บาน)', price: 110, unit: 'ตัว', count: '4*P' },
      { name: 'มือจับ', price: 1, unit: 'ชุด', count: 'HANDLE' },
    ],
    consum: [
      { name: 'ซิลิโคน', price: 90, unit: 'หลอด', count: 'Math.ceil(2*(W+H)/1*2/12.5 -1e-9)' },
    ],
    note: 'Velora เป็นบานเปิด (casement) · สีตั้งต้น เทาซาฮาร่า ตามชีต · form "คู่"(2บาน) ถอดจากสูตร ยังไม่ทดสอบเลขจริง (เช็คซ้ำ)',
  },

  pcdoor: {
    id: 'pcdoor', group: 1, name: 'ประตูบานเปิด PC Door', brand: 'EURO', laborKey: 'PC Door',
    icon: '🚪', defForm: 'แบ่ง 2', forms: ['แบ่ง 2', 'แบ่ง 4'],
    specOpts: [ // มด dropdown: ธรณี (B8) + ล้อ/ซอฟต์โคลส (B10) — default = มีธรณี+ใส่ (เท่าเดิม · verify anchor ไม่ขยับ)
      { key: 'pcsill', label: 'ธรณี', opts: ['มีธรณี', 'ไม่มีธรณี'], def: 'มีธรณี' },
      { key: 'pcsoft', label: 'ล้อ + ซอฟต์โคลส', opts: ['ใส่', 'ไม่ใส่'], def: 'ใส่' },
    ],
    addons: ['mosquito', 'cmech', 'stainless', 'digihandle', 'frame_wrap', 'drop_floor', 'demolish'],   // ห้องกระจก G6 พาริตี้ (2ก.ค.)
    defaults: { w: 150, h: 200, p: 2 }, defGlass: 'เขียว 6มม.', minP: 2, maxP: 4,
    vars: { SILL: "spec.pcsill==='ไม่มีธรณี'?0:1" },
    alu: [
      { name: 'วงกบ 3 ด้าน F7859', price: 1100, kg: 6.11111, seg: 'W+2*H', count: '1' },
      { name: 'ธรณี F7938B', price: 1400, kg: 7.77778, seg: 'W', count: 'SILL' },
      { name: 'ตบธรณี F7960', price: 575, kg: 3.19444, seg: 'W', count: 'SILL' },
      { name: 'เสริมใต้บาน F7863', price: 435, kg: 2.41667, seg: 'W', count: '1-SILL' },
      { name: 'กรอบประตู 7864', price: 1995, kg: 11.08333, seg: '2*P*H+2*W', count: '1' },
      { name: 'คิ้ว F7935', price: 360, kg: 2, seg: '2*P*H+2*W', count: '1' },
      { name: 'เปิดกลาง F7945c', price: 775, kg: 4.30556, seg: 'H', count: "form==='แบ่ง 4'?1:0" },
    ],
    glass: 'W*H',
    hardware: [
      { name: 'บานพับ hyda', price: 117, unit: 'ตัว', count: "form==='แบ่ง 2'?4:8" },
      { name: 'ล้อ+ซอฟโค้ด (ชุด)', price: 1170, unit: 'ชุด', count: "spec.pcsoft==='ไม่ใส่'?0:(form==='แบ่ง 2'?1:2)" },
      { name: 'มือจับ Align SMS', price: 198, unit: 'บาน', count: 'P' },
      { name: 'กลอนบานลอง', price: 450, unit: 'ชุด', count: '1' },
      { name: 'น็อตเฟรม', price: 1, unit: 'ตัว', count: 'SILL?8:6' },
      { name: 'ยาง', price: 11, unit: 'ม.', count: 'Math.round(2*(W+H)*P)' },
    ],
    consum: [
      { name: 'ซิลิโคน ใน+นอก', price: 90, unit: 'หลอด', count: 'Math.ceil(2*(W+H)*2/12.5)' },
    ],
    note: 'ดีฟอลต์ มีธรณี + ใส่ซอฟโค้ด · ออปชั่นไม่มีธรณี/ไม่ใส่ซอฟโค้ด = spec (มด dropdown B8/B10) แล้ว · มุ้ง=addon ยังไม่ทำ',
  },

  banyok: {
    id: 'banyok', group: 1, name: 'บานยก', brand: 'EURO', laborKey: 'บานยก (เซมิ)',
    icon: '🪟', defForm: 'เดี่ยว', forms: ['เดี่ยว', 'ถ่วง'],
    defaults: { w: 100, h: 50, p: 1 }, defGlass: 'เขียว 6มม.', minP: 1, maxP: 1,
    specOpts: [{ key: 'liftmode', label: 'ลักษณะการยก', opts: ['ยกบานบน', 'ยกบานบน-ล่างสลับ'], def: 'ยกบานบน' }], // R3.9 o-liftmode · label พิมพ์ลงใบ
    vars: {
      NW: 'Math.ceil(W/6.4)',
      NH: 'Math.ceil(H/6.4)',
      DW: "form==='ถ่วง'?0:1",
    },
    alu: [
      { name: 'กล่องร่องมีสกรู', price: 995, kg: 5.52778, seg: 6.4, count: 'NW' },
      { name: 'เฟรมบน', price: 1000, kg: 5.55556, seg: 6.4, count: 'NW' },
      { name: 'อแดปเตอร์บน', price: 395, kg: 2.19444, seg: 6.4, count: 'NW' },
      { name: 'เฟรมล่าง', price: 840, kg: 4.66667, seg: 6.4, count: 'NW' },
      { name: 'กรอบบาน', price: 600, kg: 3.33333, seg: 6.4, count: 'NH' },
      { name: 'รางข้าง', price: 1175, kg: 6.52778, seg: 6.4, count: 'NH' },
    ],
    glass: 'W*H',
    hardware: [
      { name: 'อแดปเตอร์รูสกรู', price: 60, unit: 'เส้น', count: 'NW' },
      { name: 'เสาเกี่ยว', price: 195, unit: 'เส้น', count: 'NH' },
      { name: 'กล่องอุปกรณ์', price: 1350, unit: 'ชุด', count: "form==='ถ่วง'?0:1" },
      { name: 'กล่องอุปกรณ์ (ถ่วง)', price: 2520, unit: 'ชุด', count: "form==='ถ่วง'?1:0" },
      { name: 'มือจับ', price: 60, unit: 'ตัว', count: '1' },
      { name: 'ล๊อคกลาง', price: 70, unit: 'ตัว', count: '1' },
      { name: 'คอยสปริง', price: 160, unit: 'ตัว', count: '2*DW' },
      { name: 'ฝาปิดฝุ่น', price: 10, unit: 'ตัว', count: '2*DW' },
      { name: 'ตลับตะขอเกี่ยว', price: 130, unit: 'ตัว', count: '4*DW' },
      { name: 'กิ๊ปล็อค', price: 20, unit: 'ตัว', count: '4*DW' },
      { name: 'กล่องใส่สปริง', price: 30, unit: 'ตัว', count: '2*DW' },
    ],
    consum: [
      SILICONE,
    ],
    note: 'ออปชั่นชุด auto / มุ้ง ยังไม่ทำ (ดีฟอลต์ไม่มี)',
  },

  fold_euro: {
    id: 'fold_euro', group: 1, name: 'บานเฟี้ยม ยูโร', brand: 'EURO', laborKey: 'บานเฟี้ยมยูโร',
    icon: '🪟', laborPerPanel: true, pFromForm: true,
    specOpts: [ // สเปก label เท่านั้น (R3.9 folddir/threshf — ไม่กระทบราคา · พิมพ์ลงใบ) · threshf ตรง มด (ปกติ/รางยู)
      { key: 'folddir', label: 'ทิศเปิด', opts: ['เปิดขวา', 'เปิดซ้าย', 'แยกกลาง'], def: 'เปิดซ้าย' },
      { key: 'threshf', label: 'ธรณีเฟี้ยม', opts: ['ธรณีกันน้ำ (ปกติ)', 'รางยู'], def: 'ธรณีกันน้ำ (ปกติ)' }, // มด dropdown B6 (label · รางยู เช็คซ้ำราคา)
    ],
    defForm: '2บาน: รวบเปิดซ้าย (2-0)',
    // เฟี้ยมเปิด 3 แบบ (พี่สั่ง 1ก.ค.): รวบเปิดซ้าย (X-0) · รวบเปิดขวา (0-X · mirror ราคาเท่ารวบซ้าย) · เปิดกลาง (แยกครึ่ง) · เลิก "พับสลับ" · โค้ด (X-Y) คงไว้ให้ HINGE parse
    forms: ['2บาน: รวบเปิดซ้าย (2-0)', '2บาน: รวบเปิดขวา (0-2)', '2บาน: เปิดกลาง (1-1)', '3บาน: รวบเปิดซ้าย (3-0)', '3บาน: รวบเปิดขวา (0-3)', '3บาน: เปิดกลาง (2-1)', '4บาน: รวบเปิดซ้าย (4-0)', '4บาน: รวบเปิดขวา (0-4)', '4บาน: เปิดกลาง (2-2)', '5บาน: รวบเปิดซ้าย (5-0)', '5บาน: รวบเปิดขวา (0-5)', '5บาน: เปิดกลาง (3-2)', '6บาน: รวบเปิดซ้าย (6-0)', '6บาน: รวบเปิดขวา (0-6)', '6บาน: เปิดกลาง (3-3)'],
    defaults: { w: 180, h: 280, p: 2 }, defGlass: 'เขียว 6มม.', minP: 2, maxP: 6,
    vars: {
      bw: '(W*1000-110)/P/1000',
      // เสาชนกลาง (F7974) เฉพาะ "เปิดกลาง" แยกครึ่งเท่า (1-1/2-2/3-3) · เปิดกลางจำนวนคี่ (2-1/3-2) = ไม่มีเสากลาง (ตาม R3.9 baseline)
      cmid: "((form.indexOf('1-1')>=0||form.indexOf('2-2')>=0||form.indexOf('3-3')>=0)?2:0)",
      // HINGE: รวบขวา (0-X) = รวบซ้าย (X-0) mirror → เพิ่มเช็ค 0-X ทุกจำนวนบาน (เดิมเช็คแค่ X-0)
      HINGE: "(function(){var f=form;var hmm=H*1000;var L;if(f.indexOf('2บาน')===0)L=[2700,7,9999,10,10];else if(f.indexOf('3บาน')===0){L=(f.indexOf('3-0')>=0||f.indexOf('0-3')>=0)?[3000,7,9999,13,13]:[9999,9,9999,12,12];}else if(f.indexOf('4บาน')===0){if(f.indexOf('4-0')>=0||f.indexOf('0-4')>=0)L=[9999,11,9999,16,16];else if(f.indexOf('2-2')>=0)L=[3000,14,9999,26,26];else L=[9999,7,9999,10,10];}else if(f.indexOf('5บาน')===0){if(f.indexOf('5-0')>=0||f.indexOf('0-5')>=0)L=[9999,11,9999,16,16];else L=[9999,14,9999,20,20];}else if(f.indexOf('6บาน')===0){if(f.indexOf('6-0')>=0||f.indexOf('0-6')>=0)L=[9999,15,9999,22,22];else if(f.indexOf('3-3')>=0)L=[3000,14,9999,22,22];else if(f.indexOf('4-2')>=0)L=[9999,16,9999,24,24];else L=[9999,11,9999,16,16];}else L=[2700,7,9999,10,10];if(hmm<=L[0])return L[1];if(hmm<=L[2])return L[3];return L[4];})()",
    },
    alu: [
      { name: 'F7968 เฟรมบน', price: 3140, kg: 0, seg: '(W*1000-36)/1000', count: '1' },
      { name: 'F7969 เฟรมล่าง', price: 1730, kg: 0, seg: '(W*1000-36)/1000', count: '1' },
      { name: 'F7970 เฟรมข้าง', price: 1065, kg: 0, seg: 'H*2', count: '1' },
      { name: 'F7971 คิ้วตบเฟรมข้าง', price: 475, kg: 0, seg: '(H*1000-120)*2/1000', count: '1' },
      { name: 'F7973 ตบปิดเฟรม', price: 230, kg: 0, seg: '(W*1000-36)/1000', count: '1' },
      { name: 'F7972 กรอบบาน (4ด้าน)', price: 1670, kg: 0, seg: '((H*1000-94)*(2*P)+bw*1000*(2*P))/1000', count: '1' },
      { name: 'F7974 ชนกลางบานคู่', price: 540, kg: 0, seg: '(H*1000-94)*cmid/1000', count: "form.indexOf('เปิดกลาง')>=0?1:0" },
      { name: 'F7962 รับล็อค', price: 965, kg: 0, seg: '(H*1000-80)/1000', count: '1' },
      { name: 'F7935 คิ้วกระจก (4ด้าน)', price: 340, kg: 0, seg: '((H*1000-254)*(2*P)+(bw*1000-120)*(2*P))/1000', count: '1' },
    ],
    glass: 'W*H',
    hardware: [
      { name: 'HD-640 บานพับล้อบน', price: 299, unit: 'ตัว', count: '1' },
      { name: 'HD-641 บานพับเฟี้ยม', price: 72, unit: 'ตัว', count: 'HINGE' },
      { name: 'HD-642 บานพับมือจับ', price: 109, unit: 'ตัว', count: '1' },
      { name: 'HD-643 บานพับไกด์ล่าง', price: 199, unit: 'ตัว', count: '1' },
      { name: 'HD-474 มือจับกลอน', price: 85, unit: 'ตัว', count: '1' },
      { name: 'HD-312 ตลับกลอนล็อค', price: 88, unit: 'ตัว', count: '1' },
      { name: 'HD-1180 ก้านสไลด์', price: 73, unit: 'ตัว', count: '2' },
      { name: 'HD-213 ฉากเข้ามุม', price: 15, unit: 'ตัว', count: '4*P' },
      { name: 'HD-200 ฉากประคองมุม', price: 1.5, unit: 'ตัว', count: '12*P' },
    ],
    consum: [
      { name: 'ยางลูกโป่ง 6mm', price: 7, unit: 'ม.', count: 'Math.round(((W*1000-36)+(W*1000-36)+H*1000+(H*1000-120)*2+(H*1000-94)*(2*P)*2+(H*1000-94)*(2*P)*2+bw*1000*3+(H*1000-80))/1000*10)/10' },
      { name: 'สักหลาด 5mm', price: 1.22, unit: 'ม.', count: 'Math.round(((H*1000-94)*2+(H*1000-80)*2)/1000*10)/10' },
      { name: 'ยางอัด', price: 8, unit: 'ม.', count: 'Math.round((((H*1000-224)+(bw*1000-130))*2)*P/1000*10)/10' },
      { name: 'ยางรอง', price: 8, unit: 'ม.', count: 'Math.round((((H*1000-224)+(bw*1000-130))*2)*P/1000*10)/10' },
    ],
    note: 'สีอบขาว/ดำ เท่านั้น (ราคาเส้นตรงต่อ profile) · สีพิเศษ/ลายไม้/รางยู ยังไม่รองรับ (เช็คซ้ำ)',
  },

  banklet: {
    id: 'banklet', group: 1, name: 'บานเกล็ด', brand: 'MTONG', laborKey: 'บานเกล็ด',
    icon: '🪟', defForm: 'นอน', forms: ['นอน'], stockLen: 6.0,
    defaults: { w: 300, h: 150, p: 2 }, defGlass: null, minP: 1, maxP: 6,
    vars: {
      AA: '[29.5,38.4,47.3,56.2,65.1,74,82.9,91.8,100.7,109.6,118.5,127.4,136.3,145.2,154.1,163,171.9,180.8,189.7,198.6,207.5,216.4,225.3,234.2,243.1,252,260.9,269.8,278.7,287.6,296.5,305.4,314.3]',
      AB: '[3,4,5,6,7,8,9,10,11,12,13,14,15,16,17,18,19,20,21,22,23,24,25,26,27,28,29,30,31,32,33,34,35]',
      S: '1?(H*100):((W*100)/P)',
      mRow: '(function(){var s=(1?(H*100):((W*100)/P));var r=0;for(var i=0;i<AA.length;i++){if(AA[i]<=s)r=i;}return r;})()',
      N: 'AB[mRow]',
      G: 'Math.max(0,(1?(H*100):((W*100)/P))-AA[mRow])',
      tie: '(Math.max(0,(1?(H*100):((W*100)/P))-AA[mRow])>0)?Math.ceil(Math.max(0,(1?(H*100):((W*100)/P))-AA[mRow])/8.9):0',
      totalBlades: 'P*(AB[mRow] + ((Math.max(0,(1?(H*100):((W*100)/P))-AA[mRow])>0)?Math.ceil(Math.max(0,(1?(H*100):((W*100)/P))-AA[mRow])/8.9):0))',
      legRate: '1?(0?94:90):(0?92:88)',
      frameLines: 'Math.ceil((2*((W*100)+(H*100))+(P-1)*(H*100))/600)',
      bladeLen: '1?((W*100)/P):(H*100)',
    },
    alu: [],
    glass: null,
    hardware: [
      { name: 'เฟรม 1"×4" (รอบ+เสาแบ่ง)', price: 905, unit: 'เส้น', count: 'frameLines' },
      { name: 'ขาเกล็ดโยก', price: 1, unit: 'ชุด', count: 'P * N * legRate' },
      { name: 'ใบเกล็ด', price: 572, unit: 'เส้น', count: 'Math.ceil(totalBlades*bladeLen/600)' },
      { name: 'ยู4หุน เกล็ดติดตาย', price: 1, unit: 'ชุด', count: '(tie>0?2*P:0) * (tie>0?(G/600)*150:0)' },
    ],
    consum: [],
    note: 'แนว "นอน" · P = จำนวนช่อง · มอเตอร์เลือกได้ (1,800→6,000) · แนว "ตั้ง"/สีพิเศษ/ใบกระจก ยังไม่ทำ (เช็คซ้ำ)',
  },

  curve_fixed: {
    id: 'curve_fixed', group: 1, name: 'บานติดตายดัดโค้ง', brand: 'MTONG', laborKey: 'ตายดัดโค้ง',
    icon: '🌙', defForm: 'กระจกล้วน', forms: ['กระจกล้วน'],
    defaults: { w: 100, h: 50, p: 1 }, defGlass: 'เขียว 6มม.', minP: 1, maxP: 6,
    vars: {
      RAW: '(Math.ceil((W+H+0.4)*1.4*220+1500)*P + (W*H)*264 + Math.ceil(2*(W*100+H*100)/100*2/12.5)*90 + Math.ceil((W*100)/600)*(1267+582))',
    },
    alu: [],
    glass: 'W*H',
    hardware: [],
    consum: [
      { name: 'ค่าดัดโค้ง (อลูทั้งชุด รวมกล่อง)', price: 1, unit: 'ชุด', count: 'Math.ceil((W+H+0.4)*1.4*220+1500)*P' },
      { name: 'ซิลิโคน (ใน+นอก)', price: 90, unit: 'หลอด', count: 'Math.ceil(2*(W*100+H*100)/100*2/12.5)' },
      { name: 'กล่องเปิด+ตบปิดเปิด', price: 1849, unit: 'เส้น', count: 'Math.ceil((W*100)/600)' },
      { name: 'ปัดขึ้นหลักร้อย', price: 1, unit: '', count: 'Math.ceil(RAW/100)*100 - RAW' },
    ],
    note: 'โมเดลเหมาค่าดัดโค้ง (P = จำนวนโค้ง) · ราคากระจก 264 ฝังในก้อนปัดเศษ ถ้าเปลี่ยนชนิดกระจกอาจคลาด ≤100฿ · กระจกดัดโค้งเลือกในชนิดกระจกได้ · สีพิเศษไม่บวกค่าอบ (เช็คซ้ำ)',
  },

  curve_open: {
    id: 'curve_open', group: 1, name: 'บานเปิดดัดโค้ง', brand: 'EURO', laborKey: 'เปิดดัดโค้ง',
    icon: '🚪', defForm: 'ดัดโค้ง', forms: ['ดัดโค้ง'], showColor: true,
    defaults: { w: 90, h: 240, p: 1 }, defGlass: 'เทมเปอร์ 6มม.', minP: 1, maxP: 2,
    vars: {
      HB: "H<=2.4?'2.4':(H<=2.6?'2.6':(H<=2.7?'2.7':(H<=2.8?'2.8':'X')))",
      CCOL: "(({white:1,sahara:2,woodStock:3,special:1,woodSpecial:1})[color]||1)",
      DOOR_LUT: "({'1|2.4':[16000,16500,21000],'1|2.6':[16500,17000,21500],'1|2.7':[17000,17500,22000],'1|2.8':[17000,17500,22000],'2|2.4':[26000,26500,34500],'2|2.6':[26500,27000,35000],'2|2.7':[27000,27500,35000],'2|2.8':[28000,28500,36000]})",
      DOOR: "((DOOR_LUT[P+'|'+HB]||[0,0,0])[CCOL-1]||0)",
    },
    alu: [],
    glass: 'W*H',
    hardware: [
      { name: 'ราคาบาน (สั่งร้านอื่น รวมอุปกรณ์)', price: 1, unit: 'ชุด', count: 'DOOR' },
    ],
    consum: [
      { name: 'ซิลิโคน (PU) ใน+นอก', price: 90, unit: 'หลอด', count: 'Math.ceil(2*(W+H)*2/12.5)' },
    ],
    note: 'บานสั่งร้านอื่น (ราคาตาม จำนวนบาน|สูง|สี · รองรับสูง ≤2.8ม.) · สีอบพิเศษไม่บวกค่าอบ (เช็คซ้ำ)',
  },

  // (รุ่น R3.9 fallback ที่ R4.0 ยังขาด — auto-generate ตอน build จาก r39-data.gen.json · ดู build-index.mjs)

  // ═══════════════════════ G2 ระแนง/รั้ว/ราว ═══════════════════════
  louver: {
    id: 'louver', group: 2, name: 'ระแนงบังตา', brand: 'MTONG', laborKey: 'ระแนง', ranaeDisc: true,
    showColor: true, outdoor: true,   // งานนอก → ตัดสีชุบ (label-only · ทุนใบระแนงไม่ผูกสี → พิมพ์ลงใบเฉยๆ)
    icon: '🪵', defForm: 'นอน', forms: ['นอน', 'ตั้ง'],
    defaults: { w: 200, h: 240, p: 1 }, defGlass: null, minP: 1, maxP: 1,
    addons: ['mosquito', 'frame_wrap', 'louver_door'],   // มุ้งติดระแนง + ครอบวงกบ + ค่าทำบาน(เลื่อน/เฟี้ยม/เปิด)
    rnCascade: true,                       // กล่อง→หน้าโชว์→ช่องห่าง(กรอกเอง)→โครง (BOM cost ตามชีต "คิดทุน ระแนง 38.4" · UI ใน app.js)
    specOpts: [
      { key: 'panelform', label: 'รูปแบบ', opts: ['ติดตาย', 'บานเลื่อน', 'บานเฟี้ยม', 'บานเปิด'], def: 'ติดตาย', priced: true },   // ทำเป็นบาน เลื่อน/เฟี้ยม/เปิด = +ค่าทำบาน R3.9 (addon louver_door)
      { key: 'foldDir', label: 'ทิศเปิด (ถ้าเลื่อน/เฟี้ยม/เปิด)', opts: ['เปิดซ้าย', 'เปิดขวา', 'แยกกลาง'], def: 'เปิดซ้าย' },
    ],
    // BOM ตามชีต Excel: pitch=หน้าโชว์(ซม.)+ช่องห่าง · จำนวนใบ=INT(ช่วงกระจาย/pitch)+1 · เส้นใบ=ceil(ใบ/INT(600/ยาวใบ)) · ราคากล่อง/เส้น×ปัจจัยสี · โครงดาม 1"×1.6"=485 · สีพิเศษ +2,000
    vars: {
      PITCH: '(+spec.rnFace || 4.06) + Math.max(1, +spec.rnGap || 5)',                 // หน้าโชว์(ซม.) + ช่องห่าง(กรอกเอง ซม.)
      LONGV: "(form==='ตั้ง' ? H*100 : W*100)",                                          // ยาว/ใบ (ตามแนวเกล็ด)
      SPREAD: "(form==='ตั้ง' ? W*100 : H*100)",                                         // ช่วงกระจาย
      NLEAF: 'Math.floor(SPREAD/PITCH)+1',                                              // จำนวนใบ
      NLINE: 'Math.ceil(NLEAF / Math.max(Math.floor(600/LONGV),1))',                    // เส้นใบ (สต็อก 6ม.)
      CF: CF_EXPR,   // ปัจจัยสีกล่อง (R3.9)
      BOXP: "Math.round((({'1x5':500,'1x1':310,'1x1.5':395,'1x1.6':485,'1x4':905,'1.6x1.6':770,'1.6x4':1220})[spec.rnBox]||1220)*CF/5)*5",   // ราคากล่อง/เส้น × ปัจจัยสี
      NFRAME: "(spec.rnFrame==='รวมโครง' ? Math.ceil((H*100<=250?2:3)/Math.max(Math.floor(600/(W*100)),1)) : 0)",   // เส้นโครงดาม (เฉพาะรวมโครง)
      FRAMEP: 'Math.round(485*CF/5)*5',                                                 // โครงดาม 1"×1.6" × ปัจจัยสี
    },
    alu: [], glass: null,
    hardware: [],
    consum: [
      { name: 'ใบระแนง (กล่อง)', price: 'BOXP', unit: 'เส้น', count: 'NLINE' },
      { name: 'โครงดาม 1"×1.6" (รวมโครง)', price: 'FRAMEP', unit: 'เส้น', count: 'NFRAME' },
      { name: 'สีพิเศษ (ค่าเปิดตู้อบ)', price: 2000, unit: 'งาน', count: 'spec.rnCustomColor ? 1 : 0' },
    ],
    note: 'ระแนงบังตา — คิดทุน BOM ตามชีต Excel: กล่อง→หน้าโชว์→**ช่องห่างกรอกเอง**→โครง(รวม/ไม่รวม) · pitch=หน้าโชว์+ช่องห่าง · นับใบ/เส้น (สต็อก 6ม.) × ราคากล่อง×ปัจจัยสี · โครงดาม 1"×1.6" · สีพิเศษ +2,000 · ค่าแรง 300+600/ตร.ม. · ส่วนลดปริมาณ >10ตร.ม. · บานเลื่อน/เฟี้ยม/เปิด +ค่าบาน รอราคา',
  },

  gate: {
    id: 'gate', group: 2, name: 'ประตูรั้วบานเลื่อน', brand: 'MTONG', laborKey: 'ประตูรั้ว',
    showColor: true, outdoor: true,   // งานนอก → ตัดสีชุบ (ชุดเดียวกับระแนง · label-only)
    icon: '🚧', defForm: 'นอน', forms: ['นอน', 'ตั้ง'],
    materialLabel: 'ลายระแนง (กล่อง)',
    materials: ['1x5', '1x1', '1x1.5', '1x1.6', '1x4', '1.6x1.6', '1.6x4'], defMaterial: '1.6x4',
    materialLabels: { '1x5': '1×5″ · 500', '1x1': '1×1″ · 310', '1x1.5': '1×1.5″ · 395', '1x1.6': '1×1.6″ · 485', '1x4': '1×4″ · 905', '1.6x1.6': '1.6×1.6″ · 770', '1.6x4': '1.6×4″ · 1,220' },
    defaults: { w: 350, h: 180, p: 1 }, defGlass: null, minP: 1, maxP: 1,
    vars: {
      BOXP: "({'1x5':500,'1x1':310,'1x1.5':395,'1x1.6':485,'1x4':905,'1.6x1.6':770,'1.6x4':1220}[material]||1220)",
      E8: "Math.ceil( (Math.trunc((form==='ตั้ง'?(W*100):(H*100))/9.06)+1) / Math.max(Math.trunc(600/(form==='ตั้ง'?(H*100):(W*100))),1) )",
      E12: 'Math.ceil(2*((W*100)+(H*100))/600 - 1e-9)',
      E15: 'Math.ceil(2*(W*100)/600 - 1e-9)',   // ราง = 2×กว้าง (matrix มด note) · เดิม ceil(7/6)=2 ตายตัว → narrow gate แพงเกิน',
    },
    alu: [],
    glass: null,
    hardware: [
      { name: 'ใบระแนง (กล่องที่เลือก)', price: 'BOXP', unit: 'เส้น', count: 'E8', mult: true },
      { name: 'โครงกรอบบาน 2"×4"', price: 1540, unit: 'เส้น', count: 'E12', mult: true },
      { name: 'เสารับไกด์ 4"×4"', price: 2210, unit: 'ต้น', count: '1', mult: true },
      { name: 'เหล็กยัดเสา 4"×4"', price: 860, unit: 'ชิ้น', count: '1' },
      { name: 'ล้อ 3" (ล้อวิ่ง)', price: 299, unit: 'ลูก', count: '2' },
      { name: 'ล้อไกด์ประคองหลัง', price: 30, unit: 'ชิ้น', count: '4' },
      { name: 'ราง (ชุด 6 ม.)', price: 1090, unit: 'ชุด', count: "(spec && spec.gaterail && spec.gaterail.indexOf('ใช้รางเดิม') >= 0) ? 0 : E15" },  // ใช้รางเดิม = ตัดค่าราง (R3.9 railreuse)
      { name: 'มอเตอร์', price: 16000, ref: 'MOTOR.ประตูรั้ว', unit: 'ตัว', count: "(spec && spec.drive && spec.drive.indexOf('มือผลัก') >= 0) ? 0 : 1" },  // มือผลัก = ตัดมอเตอร์ออก (ประหยัด 16,000)
    ],
    consum: [],
    addons: ['gate_curve', 'gate_motor', 'gate_wire'],
    specOpts: [
      { key: 'drive', label: 'ระบบขับเคลื่อน', opts: ['มอเตอร์อัตโนมัติ', 'มือผลัก (ไม่มีมอเตอร์)'], def: 'มอเตอร์อัตโนมัติ', priced: true }, // มือผลัก = ตัดมอเตอร์ 16,000 (กระทบราคา)
      { key: 'gaterail', label: 'ราง', opts: ['รางใหม่', 'ใช้รางเดิม'], def: 'รางใหม่', priced: true }, // ตรง/โค้ง เลือกที่ "ลักษณะบาน" (gate_curve) แทน · ใช้รางเดิม=ตัดค่าราง 1,090
    ],
    note: 'รวมมอเตอร์อัตโนมัติ default (เลือกมือผลัก = ตัดมอเตอร์) · บานโค้ง = ค่าทำบาน 4,000/บาน (R3.9) · ราง=สเปกพิมพ์ลงใบ · ระแนงสลับ/รีโมท ทำทีหลัง',
  },

  louver_slip: {
    id: 'louver_slip', group: 2, name: 'ระแนงสลับ', brand: 'MTONG', laborKey: 'ระแนง', ranaeDisc: true,
    showColor: true, outdoor: true,   // งานนอก → ตัดสีชุบ (label-only)
    icon: '🪵', defForm: 'นอน', forms: ['นอน'], stockLen: 6.0,
    defaults: { w: 400, h: 200, p: 1 }, defGlass: null, minP: 1, maxP: 1,
    addons: ['mosquito', 'frame_wrap'],   // มุ้งติดระแนง + ครอบวงกบ
    vars: {
      SIM: "(function(){var Wcm=W*100,Pp=0,a=0,b=0;for(var m=1;m<=200;m++){var isA=((m-1)%(3+5))<3;var O=isA?10.16:4.06;Pp+=O;var Q=Pp+(m-1)*2.5;if(Q<=Wcm){if(isA)a++;else b++;}}return{a:a,b:b};})()",
      cntA: 'SIM.a',
      cntB: 'SIM.b',
      Hused: "(function(){var hc=H*100,V=[50,60,75,100,120,150,200,300,600];var lo=V[0];for(var i=0;i<V.length;i++){if(V[i]<=hc)lo=V[i];}var up=99999;for(var i=0;i<V.length;i++){if(V[i]>hc){up=V[i];break;}}if(hc-lo<=20)return lo;if(up-hc<=20)return up;return hc;})()",
      perBar: 'Math.max(Math.trunc(600/Hused),1)',
      barsA: 'Math.ceil(cntA/perBar)',
      barsB: 'Math.ceil(cntB/perBar)',
    },
    alu: [],
    glass: null,
    hardware: [],
    consum: [
      { name: 'กล่อง A (โชว์ 4")', price: 1220, unit: 'เส้น', count: 'barsA', mult: true },
      { name: 'กล่อง B (โชว์ 1.6")', price: 485, unit: 'เส้น', count: 'barsB', mult: true },
    ],
    note: 'ระแนงวางสลับ 2 โปรไฟล์ · ใบคิด/เส้น (stock 6ม.) · ระยะห่าง 2.5ซม. · ขายปัด ceil100 (ชีต R3.9 ไม่ปัด ต่าง ~30฿) · ออปชั่นต่อ/โครงดาม/สีพิเศษ ยังไม่ทำ',
  },

  louver_rotate: {
    id: 'louver_rotate', group: 2, name: 'ระแนงปรับหมุนได้', brand: 'MTONG', laborKey: 'ระแนงหมุน', ranaeDisc: true,
    showColor: true, outdoor: true,   // งานนอก → ตัดสีชุบ (label-only)
    icon: '🌀', defForm: 'นอน', forms: ['นอน', 'ตั้ง'], stockLen: 6.0,
    defaults: { w: 200, h: 240, p: 1 }, defGlass: null, minP: 1, maxP: 1,
    addons: ['mosquito', 'frame_wrap'],   // มุ้งติดระแนง + ครอบวงกบ
    vars: {
      NLINE: "Math.ceil( (Math.trunc((form==='นอน' ? (H*100) : (W*100))/(4.06+0.2))+1) / Math.max(Math.trunc(600/(form==='นอน' ? (W*100) : (H*100))),1) )",
      NSHAFT: 'Math.ceil((W*100)/600)',
    },
    alu: [],
    glass: null,
    hardware: [],
    consum: [
      { name: 'ใบระแนง (กล่อง 1.6"×4")', price: 1220, unit: 'เส้น', count: 'NLINE', mult: true },
      { name: 'เพลาหมุน กล่อง 4"×4"', price: 2208, unit: 'เส้น', count: 'NSHAFT', mult: true },
      { name: 'มอเตอร์ระแนงหมุน', price: 1800, ref: 'MOTOR.ระแนงหมุน', unit: 'ตัว', count: '1' },
      { name: 'อุปกรณ์หมุน+จุดหมุน', price: 1, unit: 'ชุด', count: "Math.round(200*(W*100)/100) + Math.round(160*(Math.trunc((form==='นอน' ? (H*100) : (W*100))/(4.06+0.2))+1))" },
    ],
    note: 'ระแนงปรับหมุนได้ + มอเตอร์ default · กล่องเมืองทอง stock 6ม. · ค่าแรงใช้เรต "ระแนง" กลาง (ชีตจริง 965 vs 900 ต่าง ~312฿ เช็คซ้ำ) · โครงดาม/ต่อ/สีพิเศษ ยังไม่ทำ',
  },

  // ราวกันตก/ราวบันได กระจก (R3.9 imp1-6 · per_length_tier · ราคา R3.9 flagged · ทุน R4.0 รอ Excel)
  handrail: {
    // ถอดทุน BOM R4.0 (ชีต "คิดทุน ราวกันตก") — คิดตามความยาว · ยูเหล็ก+เพลท+ครอบอลู เสมอ
    // + หมุดจับ (ระบบหมุด) หรือ เสา (ระบบเสาตั้ง) · กระจก area · ค่าแรงแบน 1575 (พับในทุน) · เส้น 6ม.=600ซม.
    // W(กว้าง)=ความยาวราว(ซม.) · H=สูง · P=จำนวนช่อง(เสา) · เศษเส้นคิดตามสัดส่วน (ตรง Excel /600)
    id: 'handrail', group: 2, name: 'ราวกันตก/ราวบันได กระจก', brand: '-', laborKey: 'ราวกันตก (ในวัสดุ)',
    showColor: true,   // กล่องสี 13 สี (อลูราวจับ/เสา · label-only)
    icon: '🛡️', cascade: true,
    materialLabel: 'ทรง · ระบบยึด', cascadeLabels: ['ทรง', 'ระบบยึด'],
    addons: ['handrail_grip'],
    specOpts: [{ key: 'glassThick', label: 'ความหนากระจก', opts: ['เทมเปอร์ใส 10มม.', 'เทมเปอร์ใส 12มม.'], def: 'เทมเปอร์ใส 10มม.' }],
    materials: ['เฉียง|หมุดแปะข้าง', 'เฉียง|ยูเหล็ก+ครอบอลู', 'เฉียง|เสาตั้ง+ราวจับอลู', 'ตรง|หมุดแปะข้าง', 'ตรง|ยูเหล็ก+ครอบอลู', 'ตรง|เสาตั้ง+ราวจับอลู'],
    defMaterial: 'เฉียง|ยูเหล็ก+ครอบอลู',
    defForm: 'มาตรฐาน', forms: ['มาตรฐาน'],
    defaults: { w: 300, h: 110, p: 1 }, defGlass: 'เทมเปอร์ใส 10มม.', minP: 1, maxP: 8,
    alu: [],
    glass: 'W*H',
    hardware: [
      { name: 'ยูเหล็กฐาน 6หุน×1½', price: 225, unit: 'เส้น6ม', count: 'W*100/600' },
      { name: 'เพลท 2 ฝั่ง', price: 600, unit: 'เส้น6ม', count: '2*W*100/600' },
      { name: 'อลูครอบ 2"×6"', price: 3207, unit: 'เส้น6ม', count: 'W*100/600' },
      { name: 'ตัวหนีบกระจก (หมุด)', price: 175, unit: 'ตัว', count: "material.includes('หมุด')?Math.ceil(2*W*100/100):0" },
      { name: 'เสา กล่องอลู1×1.6', price: 598, unit: 'เส้น6ม', count: "material.includes('เสาตั้ง')?(P+1)*H*100/600:0" },
      { name: 'เสา เหล็ก1×1½ ยัดใน', price: 225, unit: 'เส้น6ม', count: "material.includes('เสาตั้ง')?(P+1)*H*100/600:0" },
      { name: 'ยู5หุน จับกระจก', price: 200, unit: 'เส้น6ม', count: "material.includes('เสาตั้ง')?2*P*H*100/600:0" },
      { name: 'มือจับบน กล่อง1×1.6', price: 598, unit: 'เส้น6ม', count: "material.includes('เสาตั้ง')?W*100/600:0" },
    ],
    consum: [
      { name: 'PU ยิงร่อง (2ฝั่ง)', price: 90, unit: 'หลอด', count: 'Math.ceil(2*W*100/300)' },
      { name: 'ค่าแรง (ผลิต+ติดตั้ง)', price: 1575, unit: 'งาน', count: '1' },   // (ผลิต4 + ติดตั้ง7×2คน)×87.5 แบน (Excel E29)
    ],
    note: 'กรอก "กว้าง(ซม.)" = ความยาวราว · P = จำนวนช่อง(เสา) · ถอดทุน R4.0 (ยูเหล็ก+ครอบอลู+กระจก · หมุด/เสาตามระบบ)',
  },

  // อลูลูกฟูกทึบ / คอมโพสิตทึบ (R3.9 rn89-92 · ขายตรง ฿/ตร.ม.)
  aluwave: {
    id: 'aluwave', group: 2, name: 'อลูลูกฟูกทึบ / คอมโพสิต', brand: 'MTONG', laborKey: '-',
    showColor: true, outdoor: true,   // งานนอก → ตัดสีชุบ (สีแผ่น · label-only · สีพิเศษคิดเพิ่มทีหลัง)
    icon: '▤', sellDirect: true, sellRate: 'RATE', sellInstallRate: 'IRATE', heightRound: true,   // ปัดสูงตามแผ่นสต็อก (R3.9 ranae)
    materialLabel: 'ชนิดแผ่น',
    materials: ['ลูกฟูก 1 ทาง', 'ลูกฟูก 2 ทาง', 'คอมโพสิต 3มม.', 'คอมโพสิต 4มม.'],
    defMaterial: 'ลูกฟูก 2 ทาง',
    defForm: 'มาตรฐาน', forms: ['มาตรฐาน'],
    defaults: { w: 200, h: 240, p: 1 }, defGlass: null, minP: 1, maxP: 1,
    vars: {
      RATE: "({'ลูกฟูก 1 ทาง':3500,'ลูกฟูก 2 ทาง':3500,'คอมโพสิต 3มม.':3300,'คอมโพสิต 4มม.':4000}[material]||3500)",
      IRATE: '0',
    },
    alu: [], glass: null, hardware: [], consum: [],
    note: 'แผ่นทึบ ลูกฟูก/คอมโพสิต ขายตรง ฿/ตร.ม. (R3.9 rn89-92 · ลูกฟูก 3,500 · คอมโพ 3มม.3,300 · 4มม.4,000) · สีลูกฟูกพิเศษ คิดเพิ่มทีหลัง',
  },

  // ── ระแนงบานเกล็ด/เลื่อน/หมุนเปิด-ปิด (R3.9 ข้อ 38.1-38.3) — R3.9 hasCost:false = ไม่มีสูตรทุน คิดราคามือ → sellDirect กรอกราคา/ตร.ม.เอง (ไม่เดาเลข · รอ BOM มดถ้าต้องการคิดอัตโนมัติ) ──
  bar_grid_z: {
    id: 'bar_grid_z', group: 2, subcat: 'ระแนง', name: 'ระแนงบานเกล็ดอลู (ลูกฟูกเรียบ 2 หน้า · ข้อ 38.1)', brand: 'MTONG', laborKey: '-',
    showColor: true, outdoor: true, icon: '▦', sellDirect: true, sellRate: 'spec.barRate||0', sellInstallRate: '0',
    defForm: 'นอน', forms: ['นอน', 'ตั้ง'],
    defaults: { w: 200, h: 240, p: 1 }, defGlass: null, minP: 1, maxP: 1,
    vars: {}, alu: [], glass: null, hardware: [], consum: [],
    specOpts: [{ key: 'barmat', label: 'ชนิดแผ่น', opts: ['ลูกฟูก', 'กระจก'], def: 'ลูกฟูก' }, { key: 'barRate', type: 'number', label: 'ราคาขาย ฿/ตร.ม. (กรอกเอง)', placeholder: 'รอราคา' }], // มด บานเกล็ด B6 ลูกฟูก/กระจก (label)
    note: 'ระแนงบานเกล็ด (R3.9 ข้อ 38.1) — R3.9 ไม่มีสูตรทุน คิดราคามือ → กรอกราคา/ตร.ม. · รอ BOM มดถ้าต้องการคิดอัตโนมัติ',
  },
  bar_slide: {
    // ถอดทุน BOM R4.0 (ชีต "คิดทุน บานระแนงเลื่อน") — SMS + ลูกฟูก2ทางแทนกระจก + ล้อ + ดามกล่อง
    // form = รางล่าง (ภายใน/ภายนอก) · material = โหมด (อิสระ/ลากจูง/เปิดคู่กลาง) → F2-F6 · auto = addon slide_auto เดิม
    id: 'bar_slide', group: 2, subcat: 'ระแนง', name: 'ระแนงเลื่อน (ลูกฟูกเรียบ 2 ทาง · ข้อ 38.2)', brand: 'SMS', laborKey: 'บานระแนงเลื่อน',
    showColor: true, outdoor: true, icon: '▤',
    materialLabel: 'โหมด', materials: ['อิสระ', 'ลากจูง', 'เปิดคู่กลาง'], defMaterial: 'อิสระ',
    defForm: 'ภายนอก', forms: ['ภายนอก', 'ภายใน'],
    defaults: { w: 300, h: 240, p: 2 }, defGlass: null, minP: 1, maxP: 6,
    addons: ['slide_auto', 'mosquito', 'frame_wrap', 'demolish'],
    vars: {
      F2: "material==='อิสระ'?P:(material==='ลากจูง'?P-1:P-2)",
      F3: "material==='ลากจูง'?1:2",
      F4: "material==='อิสระ'?2:1",
      F5: "material==='เปิดคู่กลาง'?4:2",
      F6: "material==='เปิดคู่กลาง'?P-2:P-1",
    },
    alu: [
      { name: 'เฟรมบน B22001', price: 1235, kg: 0, seg: 'W', count: '1' },
      { name: 'เฟรมข้าง B22002', price: 1045, kg: 0, seg: 'H', count: '2' },
      { name: 'เฟรมล่างกันน้ำ (ภายใน) B20047', price: 825, kg: 0, seg: 'W', count: "form==='ภายใน'?1:0" },
      { name: 'เฟรมล่างกันน้ำ (ภายนอก) B20041', price: 2070, kg: 0, seg: 'W', count: "form==='ภายนอก'?1:0" },
      { name: 'เสากุญแจ ML B20051', price: 885, kg: 0, seg: 'H', count: 'F5' },
      { name: 'เสาเกี่ยวธรรมดา B20009', price: 745, kg: 0, seg: 'H', count: 'H>2.4?F6:2*F6' },
      { name: 'เสาเกี่ยวรับแรง B20010', price: 1235, kg: 0, seg: 'H', count: 'H>2.4?F6:0' },
      { name: 'ขวางบน/ล่าง B20054', price: 1060, kg: 0, seg: 'W/P', count: '2*P' },
      { name: 'ตบปิดเฟรม B20019', price: 175, kg: 0, seg: 'H', count: '4' },
      { name: 'ตบราง (ภายนอก) B20050', price: 150, kg: 0, seg: 'W', count: "form==='ภายนอก'?F2:0" },
    ],
    glass: null,
    hardware: [
      { name: 'ตบปิดรางเตี้ย (ภายใน) 20050', price: 145, unit: 'เส้น6ม', count: "form==='ภายใน'?2*Math.ceil(W*100/600):0" },
      { name: 'ลูกฟูก2ทาง (แทนกระจก)', price: 432, unit: 'เส้น6ม', count: 'Math.ceil( Math.ceil(W*100/10) / Math.max(1, Math.trunc(600/Math.max(1,H*100))) )' },
      { name: 'ล้อ 27 (2/บาน)', price: 80, unit: 'ตัว', count: '2*F2' },
      { name: 'มือจับ Align (2/บาน)', price: 99, unit: 'ตัว', count: '2*F3' },
      { name: 'ชุดล็อค', price: 189, unit: 'ชุด', count: 'F4' },
      { name: 'น็อต', price: 1, unit: 'ตัว', count: '8+4*P' },
      { name: 'ล้อลูกฟูก (=จำนวนลูกฟูก)', price: 7, unit: 'ตัว', count: 'Math.ceil(W*100/10)' },
      { name: 'ดาม กล่อง1×1 (นอก+ใน กลาง)', price: 310, unit: 'เส้น6ม', count: '2*W*100/600' },
    ],
    consum: [
      { name: 'สักหลาด', price: 1.5, unit: 'ม.', count: '6*H+9*W+2*(F5+F6)*H' },
      { name: 'ซิลิโคน', price: 90, unit: 'หลอด', count: 'Math.ceil(2*(W+H)*2/12.5)' },
    ],
    note: 'ระแนงเลื่อน — ถอดทุน R4.0 (SMS + ลูกฟูก2ทาง) · form=รางล่าง(ภายใน/ภายนอก) · โหมด=material · auto=ออปชั่น',
  },
  bar_openclose: {
    id: 'bar_openclose', group: 2, subcat: 'ระแนง', name: 'ระแนงหมุนเปิด-ปิด (กล่อง 1"x4" โชว์ 4" · ข้อ 38.3)', brand: 'MTONG', laborKey: '-',
    showColor: true, outdoor: true, icon: '▥', sellDirect: true, sellRate: 'spec.barRate||0', sellInstallRate: '0',
    defForm: 'เปิด-ปิด', forms: ['เปิด-ปิด'],
    defaults: { w: 200, h: 240, p: 1 }, defGlass: null, minP: 1, maxP: 1,
    vars: {}, alu: [], glass: null, hardware: [], consum: [],
    specOpts: [{ key: 'barRate', type: 'number', label: 'ราคาขาย ฿/ตร.ม. (กรอกเอง)', placeholder: 'รอราคา' }],
    note: 'ระแนงหมุนเปิด-ปิด (R3.9 ข้อ 38.3) — R3.9 ไม่มีสูตรทุน คิดราคามือ → กรอกราคา/ตร.ม. · รอ BOM มด',
  },

  // ═══════════════════════ G3 หลังคา/ฝ้า/ผนัง ═══════════════════════
  roof: {
    id: 'roof', group: 3, name: 'หลังคา', brand: 'MTONG', laborKey: 'หลังคา', roofSegments: true, roofShape: true,   // ตัวเข้า picker เดียว → เลือกทรง (สโลป/จั่ว/เลื่อน) ผ่าน renderRoofShapeBar (พี่สั่ง 1ก.ค.)
    showColor: true, outdoor: true,   // งานนอก → สีโครงตัดสีชุบ colorNote: '🎨 สีโครงอลู — เลือกได้ พิมพ์ลงใบ · ยังไม่บวกเงิน (รอราคาทุนสีโครง/ตร.ม. ใน Excel แล้วคิดทันที)',
    icon: '🏠', defForm: 'หลังคาเพิง', forms: ['หลังคาเพิง'],
    defaults: { w: 400, h: 200, p: 1 }, defGlass: null, minP: 1, maxP: 1,
    // ออปหลังคา (R3.9 ราคาขายตรง) + สเปก label
    addons: ['roof_pole', 'truss_beam', 'roof_eave', 'gutter', 'chain_drain', 'pipe_cover', 'gutter_cover', 'beam_cover', 'hide_slope', 'roof_sealer', 'roof_film', 'roof_2nd', 'ceil_under', 'demolish'],
    specOpts: [
      { key: 'batten', label: 'แป', opts: ['แปเดี่ยว', 'แปคู่'], def: 'แปเดี่ยว' },              // R3.9 ไม่คิดเพิ่ม (text)
      { key: 'roofframe', label: 'โครงหลังคา', opts: ['โครงอลูมิเนียม', 'โครงเหล็กชุบซิงค์'], def: 'โครงอลูมิเนียม' }, // เหล็กชุบ=ราคาเท่าอลู (เช็คซ้ำ)
      { key: 'glassfilm', label: 'ชนิดฟิล์ม (ถ้ากระจกลามิเนต)', opts: ['—', 'ใส', 'เขียว', 'กันร้อน'], def: '—' },   // เลือกเมื่อวัสดุมุง=กระจก (label)
      { key: 'drainsys', label: 'ระบบระบายน้ำ', opts: ['ท่อ PVC (ดำ)', 'ท่อ PVC (เทา)', 'ท่อ PVC (ขาว)', 'โซ่ทิวลิป (ขาว)', 'โซ่ทิวลิป (น้ำตาล)', 'โซ่โลตัส (ขาว)', 'โซ่โลตัส (น้ำตาล)'], def: 'ท่อ PVC (ดำ)' },  // R3.9 ท่อ/โซ่ + สีท่อ/ลายโซ่ (label · รวมตะแกรงกันใบไม้)
      { key: 'rfsample', label: 'ยืนยันตัวอย่าง (สีพิเศษ/สีชุบ)', opts: ['—', 'ลูกค้าเห็นตัวอย่างจริง + ถ่ายรูปยืนยัน'], def: '—' },  // R3.9 checkbox (label)
      // เสริมโครง/ตะแกรง — R3.9 รวมในราคา (ฟรี) · ทำเป็น toggle กดเลือก/ระบุลงใบได้ (พี่สั่ง 1ก.ค.)
      { key: 'rfleaf', label: 'ตะแกรงกันใบไม้ (ในรางน้ำ)', opts: ['มี · รวมในราคา', 'ไม่ใส่'], def: 'มี · รวมในราคา' },
      { key: 'rfplate', label: 'เพลทเหล็กรับล่าง', opts: ['มี · รวมในราคา', 'ไม่ใส่'], def: 'มี · รวมในราคา' },
      { key: 'rfpull', label: 'เหล็กดึงด้านบน', opts: ['มี · รวมในราคา', 'ไม่ใส่'], def: 'มี · รวมในราคา' },
    ],
    sampleNote: 'ท่อน้ำทิ้ง PVC 2.5" รวมในราคา · เพลท/เหล็กดึง/ตะแกรง เลือกได้ด้านบน (R3.9 ฟรี · ลงใบ)',  // โชว์เป็น note
    // สีวัสดุมุง ต่อรุ่น (สว็อต+ชื่อเต็ม · label พิมพ์ลงใบ ไม่กระทบทุน · ดึงจริงจากดราฟ G3 draft-full-G3) · เมทัล 8 ชนิดใช้ชุดสีเดียว
    sheetColors: {
      'ไวนิล': SC_VINYL,
      'ดีไลท์': SC_DELIGHT,
      'โพลีตัน': [{ n: 'Clear 101 ใส (แสง 83%)', dot: 'rgba(150,200,240,.7)' }, { n: 'Opal 103 ขาวขุ่น (20%)', dot: '#f3f4f6' }, { n: 'Bronze 107 ชาใส (30%)', dot: '#b45309' }, { n: 'Green 109 เขียวใส (45%)', dot: '#166534' }, { n: 'Australian Grey 108 (40%)', dot: '#6b7280' }, { n: 'Silver 501 ซิลเวอร์ (4.8%)', dot: '#9ca3af' }, { n: 'Bronze Metallic 503 (1%)', dot: '#92400e' }, { n: 'Green Metallic 504 (13.9%)', dot: '#166534' }],
      'ชินโคร์ HC': [{ n: 'Modern Grey HC-N828', dot: '#6b7280' }, { n: 'Royal Blue HC-B703', dot: '#1d4ed8' }, { n: 'Classic Brown HC-570', dot: '#92400e' }, { n: 'Noble Green HC-N590', dot: '#166534' }],
      'ชินโคร์ Sup': [{ n: 'SP-NB00 ขาวขุ่น', dot: '#e5e7eb' }, { n: 'SP-NB30 Foggy Brown', dot: '#78350f' }, { n: 'SP-B857 Marine Blue', dot: '#1e3a8a' }, { n: 'SP-NC95 Light Brown', dot: '#b45309' }],
      'ชินโคร์ Nature 6มม': [{ n: 'NT-001 ใส', dot: '#bfdbfe' }, { n: 'NT-332 เทาอ่อน', dot: '#9ca3af' }],
      'ชินโคร์ Shade 4มม': [{ n: 'Shade-430S Pearl White', dot: '#f9fafb' }],
      'ชินโคร์ Prime 10มม': [{ n: 'Prime 562 Brownish Green', dot: '#3d6b4f' }],
      'เมทัล 1" PVC': 'METAL', 'เมทัล 2" PVC': 'METAL', 'เมทัล 1" เหล็ก-EPS': 'METAL', 'เมทัล 2" เหล็ก-EPS': 'METAL',
      'เมทัล 1" ฟอยล์-PU': 'METAL', 'เมทัล 2" ฟอยล์-PU': 'METAL', 'เมทัล 1" เหล็ก-PU': 'METAL', 'เมทัล 2" เหล็ก-PU': 'METAL',
    },
    sheetColorSets: { METAL: SC_METAL },
    // วัสดุมุง (ตรงชีต "คิดทุน หลังคา" B2 · ราคา ราคาวัสดุ D14–D23)
    materialLabel: 'วัสดุมุง',
    materials: ['ไวนิล', 'ดีไลท์', 'โพลีตัน', 'ชินโคร์ HC', 'ชินโคร์ Sup',
      'ชินโคร์ Nature 6มม', 'ชินโคร์ Shade 4มม', 'ชินโคร์ Prime 10มม', 'ชินโคร์ Grand 10มม',
      'เมทัล 1" PVC', 'เมทัล 2" PVC', 'เมทัล 1" เหล็ก-EPS', 'เมทัล 2" เหล็ก-EPS',
      'เมทัล 1" ฟอยล์-PU', 'เมทัล 2" ฟอยล์-PU', 'เมทัล 1" เหล็ก-PU', 'เมทัล 2" เหล็ก-PU',
      'กระจก 4+4', 'กระจก 5+5'],
    defMaterial: 'ไวนิล',
    vars: {
      Wc: 'W*100', Dc: 'H*100',
      // E1 = ระยะจันทัน (ซม.) ตามวัสดุ: โพลีตัน 122 · ชินโคร์ 138 · อื่นๆ 100
      E1: "material==='โพลีตัน'?122:(material.indexOf('ชินโคร์')>=0?138:100)", // ชินโคร์ทุกรุ่น จันทัน 138
      E2: 'Math.ceil((W*100)/E1)+1',                 // จำนวนแนวจันทัน/เพลท
      E5: 'Math.ceil((H*100)/50)+1',
      E7: '(H*100)<=300?3:((H*100)<=400?4:((H*100)<=500?5:6))', // จำนวนแผ่นชินโคร์ตามยื่น
      nJantan: 'Math.ceil((2*(W*100) + E2*(H*100))/600)',
      nPae: 'Math.ceil(E5*1*(W*100)/600)',
      nChak: 'Math.ceil((W*100)/600)',
      nZ: 'Math.ceil((W*100)/600)',
      nSteel: 'E2 * Math.ceil((H*100)/600)',
      nPlate: '2*E2',
      nCapBox: 'Math.ceil(((H*100)/3*E2)/600)',
      nRingBox: 'Math.ceil(2*((W*100)+(H*100))/600)',
      // ปัจจัยสีโครงอลู (R3.9/Excel · ขาว/ดำ=1 · ซาฮาร่า1.52 · ลายไม้สต๊อก1.59 · สีอบพิเศษ1.90 · ลายไม้อบพิเศษ1.99) — คูณเฉพาะกล่องอลู ไม่คูณเหล็ก/แผ่นมุง
      CF: CF_EXPR,
    },
    alu: [],
    glass: null,
    hardware: [],
    consum: [
      { name: 'จันทัน 1.6×4', price: 'CF*1220', unit: 'เส้น', count: 'nJantan' },
      { name: 'แป', price: 'CF*770', unit: 'เส้น', count: 'nPae' },
      { name: 'ฉาก 6 หุน', price: 'CF*140', unit: 'เส้น', count: 'nChak' },
      { name: 'แซด 4"', price: 'CF*140', unit: 'เส้น', count: 'nZ' },
      { name: 'กล่องเหล็ก 1"×1"', price: 110, ref: 'STEEL.box1', unit: 'เส้น', count: 'nSteel' },
      { name: 'เพลทเหล็ก', price: 15, ref: 'STEEL.plate', unit: 'แผ่น', count: 'nPlate' },
      // ── แผ่นมุง + ฝาครอบ ตามวัสดุที่เลือก (สูตร E8/E9 ชีตหลัก) ──
      rm('ไวนิล', 'แผ่นไวนิล (7ม.)', "material==='ไวนิล'?Math.ceil(Wc/25):0"),
      rm('ฝาครอบไวนิล', 'ฝาครอบไวนิล', "material==='ไวนิล'?Math.ceil(Wc/25):0"),
      rm('ดีไลท์', 'แผ่นดีไลท์ (6ม.)', "material==='ดีไลท์'?Math.ceil(Wc/100):0"),
      rm('โพลีตัน', 'แผ่นโพลีตัน', "material==='โพลีตัน'?Math.ceil(Wc/122)*Math.ceil(Dc/100):0"),
      rm('ครอบโพลีตัน', 'ตัวครอบโพลีตัน', "material==='โพลีตัน'?E2:0"),
      rm('ชินโคร์ HC', 'ชินโคร์ไลท์ Heat Cut', "material==='ชินโคร์ HC'?Math.ceil(Wc/138)*(1.38*E7):0"),
      rm('ชินโคร์ Sup', 'ชินโคร์ไลท์ Superior', "material==='ชินโคร์ Sup'?Math.ceil(Wc/138)*(1.38*E7):0"),
      // ── ชินโคร์ไลท์ 4 รุ่นเพิ่ม (R3.9 imp17-20) · ทุน R4.0/ตร.ม. รอกรอก Excel (price 0 = รอราคาทุน) ──
      { name: 'ชินโคร์ Nature 6มม (รอราคาทุน)', price: 0, unit: 'ตร.ม.', count: "material==='ชินโคร์ Nature 6มม'?Math.ceil(Wc/138)*(1.38*E7):0" },
      { name: 'ชินโคร์ Shade 4มม (รอราคาทุน)', price: 0, unit: 'ตร.ม.', count: "material==='ชินโคร์ Shade 4มม'?Math.ceil(Wc/138)*(1.38*E7):0" },
      { name: 'ชินโคร์ Prime 10มม (รอราคาทุน)', price: 0, unit: 'ตร.ม.', count: "material==='ชินโคร์ Prime 10มม'?Math.ceil(Wc/138)*(1.38*E7):0" },
      { name: 'ชินโคร์ Grand 10มม (รอราคาทุน)', price: 0, unit: 'ตร.ม.', count: "material==='ชินโคร์ Grand 10มม'?Math.ceil(Wc/138)*(1.38*E7):0" },
      // ── เมทัลชีท 8 ชนิด (ทุนวัสดุจริง/ตร.ม. หลังคา จาก PDF ทุนเมทัลชีท · โครง=ร่วมกับไวนิล) ──
      rm('เมทัล 1" PVC', 'แผ่นเมทัลชีท 1" PVC (EPS)', "material==='เมทัล 1\" PVC'?area:0"),
      rm('เมทัล 2" PVC', 'แผ่นเมทัลชีท 2" PVC (EPS)', "material==='เมทัล 2\" PVC'?area:0"),
      rm('เมทัล 1" เหล็ก-EPS', 'แผ่นเมทัลชีท 1" เหล็ก (EPS)', "material==='เมทัล 1\" เหล็ก-EPS'?area:0"),
      rm('เมทัล 2" เหล็ก-EPS', 'แผ่นเมทัลชีท 2" เหล็ก (EPS)', "material==='เมทัล 2\" เหล็ก-EPS'?area:0"),
      rm('เมทัล 1" ฟอยล์-PU', 'แผ่นเมทัลชีท 1" ฟอยล์ (PU)', "material==='เมทัล 1\" ฟอยล์-PU'?area:0"),
      rm('เมทัล 2" ฟอยล์-PU', 'แผ่นเมทัลชีท 2" ฟอยล์ (PU)', "material==='เมทัล 2\" ฟอยล์-PU'?area:0"),
      rm('เมทัล 1" เหล็ก-PU', 'แผ่นเมทัลชีท 1" เหล็ก (PU)', "material==='เมทัล 1\" เหล็ก-PU'?area:0"),
      rm('เมทัล 2" เหล็ก-PU', 'แผ่นเมทัลชีท 2" เหล็ก (PU)', "material==='เมทัล 2\" เหล็ก-PU'?area:0"),
      rm('กระจก 4+4', 'กระจกลามิเนต 4+4', "material==='กระจก 4+4'?area:0"),
      rm('กระจก 5+5', 'กระจกลามิเนต 5+5', "material==='กระจก 5+5'?area:0"),
      { name: 'กล่องครอบเพลท 1.6×4', price: 'CF*1220', unit: 'เส้น', count: 'nCapBox' },
      { name: 'กล่องรัดรอบ 1×1½', price: 'CF*393', unit: 'เส้น', count: 'nRingBox' },
    ],
    note: 'วัสดุมุงครบ (ตรงสูตรชีตหลัก) · ระยะจันทันต่างตามวัสดุ (โพลีตัน 122/ชินโคร์ 138/อื่นๆ 100) · ⚠️ ชินโคร์ Nature/Shade/Prime/Grand = ทุน R4.0/ตร.ม. รอกรอก Excel (BOM โชว์ "รอราคาทุน") · ปลายหลังคา/รางน้ำ/แปคู่ ยังไม่ทำ',
  },

  roof_gable: {
    id: 'roof_gable', group: 3, name: 'หลังคาจั่ว', brand: 'MTONG', laborKey: 'หลังคาจั่ว (เรตล้วน)', roofShape: true, pickerHide: true,
    icon: '🏠', defForm: 'หลังคาจั่ว', forms: ['หลังคาจั่ว'],
    addons: ['roof_pole', 'truss_beam', 'roof_eave', 'gutter', 'chain_drain', 'pipe_cover', 'gutter_cover', 'beam_cover', 'hide_slope', 'roof_sealer', 'roof_film', 'roof_2nd', 'ceil_under', 'demolish'],  // ของเสริมหลังคา (ชุดเดียวกับ roof)
    // วัสดุมุง 8 ชนิด (ตรงชีต "คิดทุน หลังคาจั่ว" E6 · เมทัลชีท=1 ชนิด 2200 ตามชีต · ไวนิล=anchor 50936)
    materialLabel: 'วัสดุมุง',
    materials: ['ไวนิล', 'ดีไลท์', 'โพลีตัน', 'ชินโคร์ HC', 'ชินโคร์ Sup', 'เมทัลชีท', 'กระจก 4+4', 'กระจก 5+5'],
    defMaterial: 'ไวนิล',
    sheetColors: {
      'ไวนิล': SC_VINYL,
      'ดีไลท์': SC_DELIGHT,
      'โพลีตัน': [{ n: 'Clear 101 ใส', dot: 'rgba(150,200,240,.7)' }, { n: 'Bronze 107 ชาใส', dot: '#b45309' }, { n: 'Green 109 เขียวใส', dot: '#166534' }, { n: 'Australian Grey 108', dot: '#6b7280' }],
      'ชินโคร์ HC': [{ n: 'Modern Grey HC-N828', dot: '#6b7280' }, { n: 'Classic Brown HC-570', dot: '#92400e' }],
      'ชินโคร์ Sup': [{ n: 'SP-NB00 ขาวขุ่น', dot: '#e5e7eb' }, { n: 'SP-NC95 Light Brown', dot: '#b45309' }],
      'เมทัลชีท': SC_METAL,
    },
    defaults: { w: 400, h: 200, p: 1 }, defGlass: null, minP: 1, maxP: 1,
    vars: {
      Wc: 'W*100',
      Dc: 'H*100',
      PKc: '150',
      E1: "material==='โพลีตัน'?122:(material&&material.indexOf('ชินโคร์')>=0?138:100)",   // จันทันห่างตามวัสดุ (ไวนิล/เมทัล/กระจก=100)
      E2: 'Math.round(Math.sqrt((W*100/2)*(W*100/2)+150*150)*10)/10',                       // เฉียง/ด้าน
      E3: 'Math.ceil(Dc/E1)+1',                                                              // จำนวนแนวจันทัน/เพลท (ตามจันทันห่างวัสดุ · ไวนิล E1=100=เดิม)
      E5: 'E2<=300?3:(E2<=400?4:(E2<=500?5:6))',                                            // จำนวนแผ่นชินโคร์ตามเฉียง
      nRafterBars: 'Math.ceil(E2/600)',
      nDeepBars: 'Math.ceil(Dc/600)',
      CF: CF_EXPR,
    },
    alu: [],
    glass: null,
    hardware: [],
    consum: [
      { name: 'จันทัน 1.6"×4" (เฉียง×2 ด้าน)', price: 'CF*1220', unit: 'เส้น', count: '2*E3*nRafterBars' },
      { name: 'แป (×2 ด้าน)', price: 'CF*770', unit: 'เส้น', count: '2*(Math.ceil(E2/50)+1)*nDeepBars' },
      { name: 'ฉาก 6 หุน (2 ชายคา)', price: 'CF*140', unit: 'เส้น', count: '2*nDeepBars' },
      { name: 'แซด 4" (2 ชายคา)', price: 'CF*140', unit: 'เส้น', count: '2*nDeepBars' },
      { name: 'กล่องเหล็ก 1"×1"', price: 110, ref: 'STEEL.box1', unit: 'เส้น', count: '2*E3*nRafterBars' },
      { name: 'เพลทเหล็ก', price: 15, ref: 'STEEL.plate', unit: 'แผ่น', count: '4*E3' },
      { name: 'คาน 4"×4" T', price: 'CF*2208', unit: 'เส้น', count: 'Math.ceil(E3/2)*Math.ceil((W*100+150)/600)' },
      // ── แผ่นมุง ×2 ด้าน ตามวัสดุ (ชีต "คิดทุน หลังคาจั่ว" E6/E7) · ไวนิล = anchor 50936 ──
      rm('ไวนิล', 'แผ่นไวนิล (2 ด้าน)', "material==='ไวนิล'?2*Math.ceil(Dc/25):0"),
      rm('ฝาครอบไวนิล', 'ฝาครอบไวนิล (2 ด้าน)', "material==='ไวนิล'?2*Math.ceil(Dc/25):0"),
      rm('ดีไลท์', 'แผ่นดีไลท์ (2 ด้าน)', "material==='ดีไลท์'?2*Math.ceil(Dc/100):0"),
      rm('โพลีตัน', 'แผ่นโพลีตัน (2 ด้าน)', "material==='โพลีตัน'?2*Math.ceil(Dc/122)*Math.ceil(E2/100):0"),
      rm('ครอบโพลีตัน', 'ตัวครอบโพลีตัน (2 ด้าน)', "material==='โพลีตัน'?2*E3:0"),
      rm('ชินโคร์ HC', 'ชินโคร์ไลท์ Heat Cut (2 ด้าน)', "material==='ชินโคร์ HC'?2*Math.ceil(Dc/138)*(1.38*E5):0"),
      rm('ชินโคร์ Sup', 'ชินโคร์ไลท์ Superior (2 ด้าน)', "material==='ชินโคร์ Sup'?2*Math.ceil(Dc/138)*(1.38*E5):0"),
      rm('เมทัลชีท', 'แผ่นเมทัลชีท (2 ด้าน)', "material==='เมทัลชีท'?2*Math.ceil(Dc/34)*(0.34*E2/100):0"),
      rm('กระจก 4+4', 'กระจกลามิเนต 4+4 (2 ด้าน)', "material==='กระจก 4+4'?2*(Dc/100)*(E2/100):0"),
      rm('กระจก 5+5', 'กระจกลามิเนต 5+5 (2 ด้าน)', "material==='กระจก 5+5'?2*(Dc/100)*(E2/100):0"),
    ],
    note: 'หลังคาจั่ว วัสดุมุง=ไวนิล · กว้าง×ลึก (H=ความลึก/ยื่น ไม่ใช่สูง) · สูงยอดจั่วตรึง 150ซม. · ค่าแรงใช้เรตล้วนตามชีตคิดทุน (เช็คซ้ำ: ตารางค่าแรงกลางมีฐาน) · วัสดุมุงชนิดอื่น/แปคู่/ปลายหลังคา ยังไม่ทำ',
  },

  roof_slide: {
    id: 'roof_slide', group: 3, name: 'หลังคาเลื่อน (เปิด-ปิดได้)', brand: 'MTONG', laborKey: 'เหมารวม (ค่าแรงในวัสดุ)', roofShape: true, pickerHide: true,
    icon: '🏠', defForm: 'เลื่อนยื่น', forms: ['เลื่อนยื่น', 'เลื่อนข้าง', 'เลื่อนเปิดกลาง'], // มด หลังคาเลื่อน B3 (3 ทิศ · label · ไม่กระทบ BOM)
    addons: ['slide_motor', 'roof_pole', 'truss_beam', 'roof_eave', 'gutter', 'chain_drain', 'pipe_cover', 'gutter_cover', 'beam_cover', 'roof_sealer', 'demolish'],  // มอเตอร์(เลือก 80/300/1500) + ของเสริมหลังคา
    // วัสดุมุง 8 ชนิด (ตรงชีต "คิดทุน หลังคาเลื่อน" H7/J7 · ทั้งติดตาย+เลื่อน · ไวนิล=anchor 88836)
    materialLabel: 'วัสดุมุง',
    materials: ['ไวนิล', 'ดีไลท์', 'โพลีตัน', 'ชินโคร์ HC', 'ชินโคร์ Sup', 'เมทัลชีท', 'กระจก 4+4', 'กระจก 5+5'],
    defMaterial: 'ไวนิล',
    sheetColors: {
      'ไวนิล': SC_VINYL,
      'ดีไลท์': SC_DELIGHT,
      'โพลีตัน': [{ n: 'Clear 101 ใส', dot: 'rgba(150,200,240,.7)' }, { n: 'Bronze 107 ชาใส', dot: '#b45309' }, { n: 'Green 109 เขียวใส', dot: '#166534' }],
      'ชินโคร์ HC': [{ n: 'Modern Grey HC-N828', dot: '#6b7280' }, { n: 'Classic Brown HC-570', dot: '#92400e' }],
      'ชินโคร์ Sup': [{ n: 'SP-NB00 ขาวขุ่น', dot: '#e5e7eb' }, { n: 'SP-NC95 Light Brown', dot: '#b45309' }],
      'เมทัลชีท': SC_METAL,
    },
    defaults: { w: 400, h: 200, p: 2 }, defGlass: null, minP: 1, maxP: 6,
    vars: {
      SW: '150',
      SH: '150',
      Wcm: 'W*100',
      Hcm: 'H*100',
      E1: "material==='โพลีตัน'?122:(material&&material.indexOf('ชินโคร์')>=0?138:100)",   // จันทันห่างตามวัสดุ (ส่วนติดตาย)
      H6: 'Hcm<=300?3:(Hcm<=400?4:(Hcm<=500?5:6))',                                        // จำนวนแผ่นชินโคร์ (ส่วนติดตาย)
      fJ: 'Math.ceil(Wcm/E1)+1',                                                            // จันทันส่วนติดตาย (ตามจันทันห่างวัสดุ · ไวนิล E1=100=เดิม)
      sJ: 'Math.ceil(150/100)+1',
      fArea: '(W*100/100)*(H*100/100)',
      sArea: '(150/100)*(150/100)',
      railLen: "form==='เลื่อนยื่น'?150:150",
      CF: CF_EXPR,
    },
    alu: [],
    glass: null,
    hardware: [],
    consum: [
      { name: 'จันทัน 1.6×4 (ติดตาย)', price: 'CF*1220', unit: 'เส้น', count: 'fJ*Math.ceil(Hcm/600)' },
      { name: 'แป กล่อง (ติดตาย)', price: 'CF*770', unit: 'เส้น', count: '(Math.ceil(Hcm/50)+1)*Math.ceil(Wcm/600)' },
      { name: 'ฉาก 6 หุน (ติดตาย)', price: 'CF*140', unit: 'เส้น', count: 'Math.ceil(Wcm/600)' },
      { name: 'แซด 4" (ติดตาย)', price: 'CF*140', unit: 'เส้น', count: 'Math.ceil(Wcm/600)' },
      { name: 'กล่องเหล็ก 1×1 (ติดตาย)', price: 110, ref: 'STEEL.box1', unit: 'เส้น', count: 'fJ*Math.ceil(Hcm/600)' },
      { name: 'เพลทเหล็ก (ติดตาย)', price: 15, ref: 'STEEL.plate', unit: 'แผ่น', count: '2*fJ' },
      // แผ่นมุงส่วนติดตาย ตามวัสดุ (ชีต H7/H8 · B6=Wcm C6=Hcm) · ไวนิล=anchor
      rm('ไวนิล', 'แผ่นไวนิล (ติดตาย)', "material==='ไวนิล'?Math.ceil(Wcm/25):0"),
      rm('ฝาครอบไวนิล', 'ฝาครอบไวนิล (ติดตาย)', "material==='ไวนิล'?Math.ceil(Wcm/25):0"),
      rm('ดีไลท์', 'แผ่นดีไลท์ (ติดตาย)', "material==='ดีไลท์'?Math.ceil(Wcm/100):0"),
      rm('โพลีตัน', 'แผ่นโพลีตัน (ติดตาย)', "material==='โพลีตัน'?Math.ceil(Wcm/122)*Math.ceil(Hcm/100):0"),
      rm('ครอบโพลีตัน', 'ตัวครอบโพลีตัน (ติดตาย)', "material==='โพลีตัน'?fJ:0"),
      rm('ชินโคร์ HC', 'ชินโคร์ Heat Cut (ติดตาย)', "material==='ชินโคร์ HC'?Math.ceil(Wcm/138)*(1.38*H6):0"),
      rm('ชินโคร์ Sup', 'ชินโคร์ Superior (ติดตาย)', "material==='ชินโคร์ Sup'?Math.ceil(Wcm/138)*(1.38*H6):0"),
      rm('เมทัลชีท', 'เมทัลชีท (ติดตาย)', "material==='เมทัลชีท'?Math.ceil(Wcm/34)*(0.34*Hcm/100):0"),
      rm('กระจก 4+4', 'กระจก 4+4 (ติดตาย)', "material==='กระจก 4+4'?fArea:0"),
      rm('กระจก 5+5', 'กระจก 5+5 (ติดตาย)', "material==='กระจก 5+5'?fArea:0"),
      { name: 'จันทัน 1.6×4 (เลื่อน)', price: 'CF*1220', unit: 'เส้น', count: 'P*(sJ*Math.ceil(SH/600))' },
      { name: 'แป กล่อง (เลื่อน)', price: 'CF*770', unit: 'เส้น', count: 'P*((Math.ceil(SH/50)+1)*Math.ceil(SW/600))' },
      { name: 'ฉาก 6 หุน (เลื่อน)', price: 'CF*140', unit: 'เส้น', count: 'P*Math.ceil(SW/600)' },
      { name: 'แซด 4" (เลื่อน)', price: 'CF*140', unit: 'เส้น', count: 'P*Math.ceil(SW/600)' },
      { name: 'กล่องเหล็ก 1×1 (เลื่อน)', price: 110, ref: 'STEEL.box1', unit: 'เส้น', count: 'P*(sJ*Math.ceil(SH/600))' },
      { name: 'เพลทเหล็ก (เลื่อน)', price: 15, ref: 'STEEL.plate', unit: 'แผ่น', count: 'P*(2*sJ)' },
      // แผ่นมุงส่วนเลื่อน ตามวัสดุ ×P บาน (ชีต J7/J8 · B7=SW=150 C7=SH=150 · J6=3) · ไวนิล=anchor
      rm('ไวนิล', 'แผ่นไวนิล (เลื่อน)', "material==='ไวนิล'?P*Math.ceil(SW/25):0"),
      rm('ฝาครอบไวนิล', 'ฝาครอบไวนิล (เลื่อน)', "material==='ไวนิล'?P*Math.ceil(SW/25):0"),
      rm('ดีไลท์', 'แผ่นดีไลท์ (เลื่อน)', "material==='ดีไลท์'?P*Math.ceil(SW/100):0"),
      rm('โพลีตัน', 'แผ่นโพลีตัน (เลื่อน)', "material==='โพลีตัน'?P*Math.ceil(SW/122)*Math.ceil(SH/100):0"),
      rm('ครอบโพลีตัน', 'ตัวครอบโพลีตัน (เลื่อน)', "material==='โพลีตัน'?P*sJ:0"),
      rm('ชินโคร์ HC', 'ชินโคร์ Heat Cut (เลื่อน)', "material==='ชินโคร์ HC'?P*Math.ceil(SW/138)*(1.38*3):0"),
      rm('ชินโคร์ Sup', 'ชินโคร์ Superior (เลื่อน)', "material==='ชินโคร์ Sup'?P*Math.ceil(SW/138)*(1.38*3):0"),
      rm('เมทัลชีท', 'เมทัลชีท (เลื่อน)', "material==='เมทัลชีท'?P*Math.ceil(SW/34)*(0.34*SH/100):0"),
      rm('กระจก 4+4', 'กระจก 4+4 (เลื่อน)', "material==='กระจก 4+4'?P*sArea:0"),
      rm('กระจก 5+5', 'กระจก 5+5 (เลื่อน)', "material==='กระจก 5+5'?P*sArea:0"),
      { name: 'ราง (2 ฝั่ง)', price: 4080, unit: 'เส้น', count: '2*Math.ceil(railLen/600)' },
      // มอเตอร์ย้ายไปเป็น addon "slide_motor" (เลือก 80/300/1500 + ฟันเฟือง + เซนเซอร์ · ขาย ×2.5/6,000) — ดึงออกจาก markup ×2 ปกติ
      { name: 'ค่าแรงผลิต (15.4/ตร.ม.)', price: 1, unit: 'งาน', count: 'Math.round(15.4*(fArea+sArea*P))' },
      { name: 'ค่าแรงติดตั้ง (15.4/ตร.ม.)', price: 1, unit: 'งาน', count: 'Math.round(15.4*(fArea+sArea*P))' },
    ],
    note: 'หลังคาเลื่อน = ติดตาย(W×H) + บานเลื่อน P บาน (ฝังขนาด 150×150ซม.) + ราง + มอเตอร์ · ค่าแรงฝังในวัสดุ (laborKey ศูนย์ กันคิดซ้ำ) · ขนาดบานเลื่อนแยก/วัสดุมุงอื่น/มอเตอร์รุ่นอื่น ยังไม่ทำ',
  },

  // ── ฝ้า/ผนัง (G3) — โมเดล BOM ถอดทุนเต็ม → ขาย = ทุน×2 (ค่าแรงฝังในก้อนทุน) · กว้าง×ยาว เป็นเมตร (กรอก ซม.) ──
  ceil_gypsum: {
    id: 'ceil_gypsum', group: 3, name: 'ฝ้ายิปซัม (ฉาบเรียบ ทาสีขาว)', brand: 'MTONG', laborKey: 'เหมารวม (ค่าแรงในวัสดุ)',
    icon: '🏚️', defForm: 'ไม่ใส่ฉนวน', forms: ['ไม่ใส่ฉนวน', 'ใส่ฉนวน rockwool 3"'],
    defaults: { w: 500, h: 600, p: 1 }, defGlass: null, minP: 1, maxP: 1,
    specOpts: [  // R3.9 label · พิมพ์ลงใบ (ทาสีฝังในค่าแรงแล้ว · เฉียง=เช็คซ้ำค่าแรง)
      { key: 'ceilfinish', label: 'ผิว/ทาสี', opts: ['ทาสีขาว', 'รองพื้นสีขาว', 'ไม่ทาสี'], def: 'ทาสีขาว' },
      { key: 'ceilslope', label: 'แนวฝ้า', opts: ['ฝ้าตรง', 'ฝ้าเฉียงตามหลังคา'], def: 'ฝ้าตรง' },
      { key: 'ceilframe', label: 'โครงฝ้า', opts: ['อลูมิเนียม', 'เหล็กชุบซิงค์ (ไร้สนิม)'], def: 'เหล็กชุบซิงค์ (ไร้สนิม)' },
    ],
    vars: PERIM_VARS,
    alu: [], glass: null, hardware: [],
    consum: [
      { name: 'แผ่นยิปซัม 9มม. (1.2×2.4)', price: 284, unit: 'แผ่น', count: 'Math.ceil(area*1.1/2.88)' },
      { name: 'โครงซีไลน์ (ฟิวริ่ง)', price: 50, unit: 'เส้น', count: 'Math.ceil(area*2.5/4)' },
      { name: 'โครงเคร่าหลัก (อาบ)', price: 50, unit: 'เส้น', count: 'Math.ceil(area/4)' },
      { name: 'ขาแขวน', price: 50, unit: 'เส้น', count: 'Math.ceil(area*0.3/4)' },
      { name: 'สกรูยึดแผ่น', price: 0.5, unit: 'ตัว', count: 'Math.ceil(area*15-1e-9)' },
      { name: 'สกรูยึดโครง', price: 0.5, unit: 'ตัว', count: 'Math.ceil(area*5-1e-9)' },
      { name: 'ปูนฉาบรอยต่อ', price: 240, unit: 'ถุง', count: 'Math.ceil(area*0.5/50)' },
      { name: 'เทป/ตาข่าย', price: 70, unit: 'ม้วน', count: 'Math.ceil(area/60)' },
      { name: 'ฉากโอบ อลู 4หุน (เส้น 6ม.)', price: 70, unit: 'เส้น', count: 'Math.ceil(PERIM/6)' },
      { name: 'ฉนวน rockwool 3"', price: 130, unit: 'แผ่น', count: "form==='ใส่ฉนวน rockwool 3\"'?Math.ceil(area/0.72):0" },
      { name: 'ค่าแรง (ติดโครง+แผ่น+ฉาบ+ทาสี)', price: 280, unit: 'ตร.ม.', count: 'area' },
    ],
    note: 'ฝ้ายิปซัมเวเทอร์บล็อค 9มม. · กรอก กว้าง×ยาว (ซม. = เมตร÷100) · ค่าแรง 280/ตร.ม. รวมทาสี (ฝังในทุน) → ขาย ทุน×2 ปัดร้อย · ราคารวมติดตั้งแล้ว (ชีตไม่แยกผลิต/ติดตั้ง)',
  },

  wall_smartboard: {
    id: 'wall_smartboard', group: 3, name: 'ผนังสมาร์ทบอร์ด 12มม. (2 หน้า)', brand: 'MTONG', laborKey: 'เหมารวม (ค่าแรงในวัสดุ)',
    icon: '🧱', defForm: 'ใส่ฉนวน 3"', forms: ['ใส่ฉนวน 3"', 'ไม่ใส่ฉนวน'],
    defaults: { w: 300, h: 270, p: 1 }, defGlass: null, minP: 1, maxP: 1,
    specOpts: [  // R3.9 label · พิมพ์ลงใบ (ทาสี/สีระบุเอง = label)
      { key: 'smartthick', label: 'ความหนา', opts: ['12มม.', '20มม. (รอทุนแผ่นมด)'], def: '12มม.' },  // R3.9 o-smartthick 12/20 · 20มม.=รอทุนแผ่น (ยังคิดเท่า 12มม. · จด Excel ④ · ห้ามเดา)
      { key: 'wallpaint', label: 'ทาสี', opts: ['ทาสีขาว', 'รองพื้นสีขาว', 'ไม่ทาสี', 'ระบุสีเอง'], def: 'ทาสีขาว' },
      { key: 'wallpaintcolor', type: 'text', label: 'รหัส/ชื่อสีผนัง', placeholder: 'เช่น TOA 1234 / เทาเข้ม' },
      { key: 'wallpaintprice', type: 'number', label: 'ค่าทาสีผนังเพิ่มเติม (บาท · เว้น=รวมในราคาแล้ว)', placeholder: '0' },  // R3.9 wallpaintprice · บวกตรง sell
      { key: 'wallframe', label: 'โครงผนัง', opts: ['อลูมิเนียม', 'เหล็กชุบซิงค์ (ไร้สนิม)'], def: 'เหล็กชุบซิงค์ (ไร้สนิม)' },
    ],
    vars: PERIM_VARS,
    alu: [], glass: null, hardware: [],
    consum: [
      { name: 'แผ่นสมาร์ทบอร์ด 12มม. (2 หน้า)', price: 500, unit: 'แผ่น', count: 'Math.ceil(area*2*1.1/2.88)' },
      { name: 'โครงเหล็กกรอบ 1½×3" (รอบ)', price: 440, unit: 'เส้น', count: 'Math.ceil(PERIM/6)' },
      { name: 'ซีไลน์ 3" เสาตั้ง (ดิ่ง) @0.60', price: 62, unit: 'เส้น', count: 'Math.ceil((Math.ceil(W/0.6)-1)*H/3)' },
      { name: 'ซีไลน์ 3" ถักนอน (ราบ) @0.40', price: 62, unit: 'เส้น', count: 'Math.ceil((Math.ceil(H/0.4)-1)*W/3)' },
      { name: 'ฉนวน 3" (60×120)', price: 130, unit: 'แผ่น', count: "form==='ใส่ฉนวน 3\"'?Math.ceil(area/0.72):0" },
      { name: 'สกรูยึดแผ่น (2 หน้า)', price: 0.5, unit: 'ตัว', count: 'Math.ceil(area*30-1e-9)' },
      { name: 'สกรูยึดโครง', price: 0.5, unit: 'ตัว', count: 'Math.ceil(area*10-1e-9)' },
      { name: 'ปูนฉาบรอยต่อ (2 หน้า)', price: 240, unit: 'ถุง', count: 'Math.ceil(area*1/50)' },
      { name: 'เทป/ตาข่าย (2 หน้า)', price: 70, unit: 'ม้วน', count: 'Math.ceil(area/30)' },
      { name: 'ค่าแรงผลิต', price: 700, unit: 'ตร.ม.', count: 'area' },
      { name: 'ค่าแรงติดตั้ง', price: 400, unit: 'ตร.ม.', count: 'area' },
    ],
    note: 'ผนังสมาร์ทบอร์ด 12มม. กรุ 2 หน้า · ค่าแรงผลิต 700 + ติดตั้ง 400/ตร.ม. (ฝังในทุน) → ขาย ทุน×2 ปัดร้อย · ฉนวน 3" default ใส่ (R3.9 ข้อ 40.1) · ผนัง 1 หน้า ยังไม่ทำ',
  },

  wall_isowall: {
    id: 'wall_isowall', group: 3, name: 'ผนังไอโซวอล 100มม.', brand: 'MTONG', laborKey: 'เหมารวม (ค่าแรงในวัสดุ)',
    icon: '🧱', defForm: 'มาตรฐาน', forms: ['มาตรฐาน'],
    defaults: { w: 300, h: 270, p: 1 }, defGlass: null, minP: 1, maxP: 1,
    specOpts: [{ key: 'isocolor', type: 'text', label: 'สีแผ่นไอโซวอล', placeholder: 'เช่น ขาว / เทา / ครีม' }, { key: 'wallpaintprice', type: 'number', label: 'ค่าทาสีผนังเพิ่มเติม (บาท · เว้น=รวมในราคาแล้ว)', placeholder: '0' }],  // R3.9 input สี + wallpaintprice (บวกตรง sell)
    vars: PERIM_VARS,
    alu: [], glass: null, hardware: [],
    consum: [
      { name: 'แผ่นไอโซวอล 100มม. (≤2.4ม.)', price: 2016, unit: 'แผ่น', count: 'H<=2.4?Math.ceil(W/1.2)*Math.ceil(H/2.4):0' },
      { name: 'แผ่นไอโซวอล 100มม. (>2.4ม.)', price: 2520, unit: 'แผ่น', count: 'H>2.4?Math.ceil(W/1.2)*Math.ceil(H/3):0' },
      { name: 'กล่อง 1.6×4" โครงรอบ (เส้น 6ม.)', price: 1220, unit: 'เส้น', count: 'Math.ceil(PERIM/6)' },
      { name: 'ฉาก 4หุน นอก+ใน (เส้น 6ม.)', price: 70, unit: 'เส้น', count: 'Math.ceil(2*PERIM/6)' },
      { name: 'สกรู/รีเวท + ยึด (เหมา)', price: 50, unit: 'งาน', count: '1' },
      { name: 'ซิลิโคน/ซีล', price: 90, unit: 'หลอด', count: 'Math.ceil((2*PERIM+2*(Math.ceil(W/1.2)-1)*H)/10)' },
      { name: 'ค่าแรงผลิต', price: 700, unit: 'ตร.ม.', count: 'area' },
      { name: 'ค่าแรงติดตั้ง', price: 440, unit: 'ตร.ม.', count: 'area' },
    ],
    note: 'ผนังไอโซวอล 100มม. สีขาว · แผ่นเลือกอัตโนมัติตามสูง (≤2.4ม.→2016 · >2.4ม.→2520) นับแบบเสาตั้ง 1.2ม. · ค่าแรง 700+440/ตร.ม. (ฝังในทุน) → ขาย ทุน×2 ปัดร้อย',
  },

  // ── ฝ้าระแนงอลู 3 ชนิด (R3.9 per_sqm · ราคาขายรวมติดตั้ง · ดึงเรตจริง index.html:738-740) ──
  ceil_ranae_1x5: {
    id: 'ceil_ranae_1x5', group: 3, name: 'ฝ้าระแนงอลู 1×5 ซม. (โชว์ 1 เว้น 5)', brand: 'MTONG',
    sellR39: true, r39method: 'per_sqm', r39rate: 3300, r39min: 0,
    icon: '▦', defForm: 'มาตรฐาน', forms: ['มาตรฐาน'], defaults: { w: 300, h: 400, p: 1 }, defGlass: null, minP: 1, maxP: 1,
    alu: [], glass: null, hardware: [], consum: [],
    note: 'ฝ้าระแนงอลู 1×5 ซม. · ราคาขาย R3.9 3,300/ตร.ม. (รวมติดตั้ง · ยังไม่ถอดทุน)',
  },
  ceil_ranae_16_5: {
    id: 'ceil_ranae_16_5', group: 3, name: 'ฝ้าระแนงอลู 1.6" (โชว์ 1" เว้น 5)', brand: 'MTONG',
    sellR39: true, r39method: 'per_sqm', r39rate: 3700, r39min: 0,
    icon: '▦', defForm: 'มาตรฐาน', forms: ['มาตรฐาน'], defaults: { w: 300, h: 400, p: 1 }, defGlass: null, minP: 1, maxP: 1,
    alu: [], glass: null, hardware: [], consum: [],
    note: 'ฝ้าระแนงอลู 1.6" โชว์ 1" เว้น 5 ซม. · ราคาขาย R3.9 3,700/ตร.ม. (รวมติดตั้ง · ยังไม่ถอดทุน)',
  },
  ceil_ranae_16_2: {
    id: 'ceil_ranae_16_2', group: 3, name: 'ฝ้าระแนงอลู 1.6" (โชว์ 1" เว้น 2)', brand: 'MTONG',
    sellR39: true, r39method: 'per_sqm', r39rate: 4800, r39min: 0,
    icon: '▦', defForm: 'มาตรฐาน', forms: ['มาตรฐาน'], defaults: { w: 300, h: 400, p: 1 }, defGlass: null, minP: 1, maxP: 1,
    alu: [], glass: null, hardware: [], consum: [],
    note: 'ฝ้าระแนงอลู 1.6" โชว์ 1" เว้น 2 ซม. · ราคาขาย R3.9 4,800/ตร.ม. (รวมติดตั้ง · ยังไม่ถอดทุน)',
  },

  ceil_wood: {
    id: 'ceil_wood', group: 3, name: 'ฝ้าไม้เทียม / ฝ้าอลู', brand: 'MTONG', laborKey: 'เหมารวม (ค่าแรงในวัสดุ)',
    icon: '🪵', defForm: 'มาตรฐาน', forms: ['มาตรฐาน'],
    defaults: { w: 300, h: 400, p: 1 }, defGlass: null, minP: 1, maxP: 1,
    cascade: true,  // material = "ร้าน|รุ่น" → app.js โชว์ ร้าน chips + รุ่น dropdown
    // LUT 24 รุ่น (ถอดจากชีต "LUT_ฝ้าไม้เทียม") · price=฿/หน่วย · edge_p=ราคาฉากขอบ · carrier=ขาจับ(ไม้ทิพย์) · bundled=คิด ตร.ม.รวม(fameline)
    lut: {
      'ไม้ทิพย์|สีพื้น': { width: 0.085, len: 6, price: 420, edge_p: 70, edge_len: 6, carrier: 1, bundled: 0, unit: 'เส้น' },
      'ไม้ทิพย์|ลายไม้': { width: 0.085, len: 6, price: 580, edge_p: 70, edge_len: 6, carrier: 1, bundled: 0, unit: 'เส้น' },
      'fameline|สีมาตรฐาน': { width: 0.085, len: 6, price: 1300, edge_p: 0, edge_len: 1, carrier: 0, bundled: 1, unit: 'ตร.ม.' },
      'fameline|สีอื่น': { width: 0.085, len: 6, price: 1400, edge_p: 0, edge_len: 1, carrier: 0, bundled: 1, unit: 'ตร.ม.' },
      'HIGO|C19 (ใน)': { width: 0.204, len: 3, price: 140, edge_p: 130, edge_len: 3, carrier: 0, bundled: 0, unit: 'เส้น' },
      'HIGO|G15 (ใน)': { width: 0.153, len: 3, price: 140, edge_p: 130, edge_len: 3, carrier: 0, bundled: 0, unit: 'เส้น' },
      'HIGO|R16 (ใน)': { width: 0.16, len: 3, price: 140, edge_p: 130, edge_len: 3, carrier: 0, bundled: 0, unit: 'เส้น' },
      'HIGO|Y18 (ใน)': { width: 0.158, len: 3, price: 140, edge_p: 130, edge_len: 3, carrier: 0, bundled: 0, unit: 'เส้น' },
      'HIGO|P155 (นอก)': { width: 0.152, len: 2.9, price: 310, edge_p: 275, edge_len: 2.9, carrier: 0, bundled: 0, unit: 'เส้น' },
      'HIGO|WH200 (นอก)': { width: 0.185, len: 2.9, price: 310, edge_p: 275, edge_len: 2.9, carrier: 0, bundled: 0, unit: 'เส้น' },
      'remood|Entree เรียบ': { width: 0.140, len: 2.8, price: 500, edge_p: 300, edge_len: 2.8, carrier: 0, bundled: 0, unit: 'แผ่น' },
      'remood|Entree มีลาย': { width: 0.165, len: 2.8, price: 600, edge_p: 300, edge_len: 2.8, carrier: 0, bundled: 0, unit: 'แผ่น' },
      'remood|Entree ชักร่อง': { width: 0.219, len: 2.8, price: 950, edge_p: 300, edge_len: 2.8, carrier: 0, bundled: 0, unit: 'แผ่น' },
      'remood|Duratech+ เรียบ13': { width: 0.13, len: 2.8, price: 730, edge_p: 300, edge_len: 2.8, carrier: 0, bundled: 0, unit: 'แผ่น' },
      'remood|Duratech+ เรียบ16': { width: 0.162, len: 2.8, price: 900, edge_p: 300, edge_len: 2.8, carrier: 0, bundled: 0, unit: 'แผ่น' },
      'remood|Duratech+ เรียบ14': { width: 0.140, len: 2.8, price: 850, edge_p: 300, edge_len: 2.8, carrier: 0, bundled: 0, unit: 'แผ่น' },
      'remood|Duratech+ ชักร่อง15': { width: 0.15, len: 2.8, price: 950, edge_p: 300, edge_len: 2.8, carrier: 0, bundled: 0, unit: 'แผ่น' },
      'remood|Duratech+ ชักร่อง21': { width: 0.219, len: 2.8, price: 1300, edge_p: 300, edge_len: 2.8, carrier: 0, bundled: 0, unit: 'แผ่น' },
      'remood|LIGHT+ เรียบ12': { width: 0.12, len: 2.8, price: 390, edge_p: 300, edge_len: 2.8, carrier: 0, bundled: 0, unit: 'แผ่น' },
      'remood|LIGHT+ ลอนเล็ก': { width: 0.149, len: 2.8, price: 680, edge_p: 300, edge_len: 2.8, carrier: 0, bundled: 0, unit: 'แผ่น' },
      'remood|LIGHT+ ชักร่อง16': { width: 0.168, len: 2.8, price: 780, edge_p: 300, edge_len: 2.8, carrier: 0, bundled: 0, unit: 'แผ่น' },
      'remood|LIGHT+ ชักร่อง21': { width: 0.212, len: 2.8, price: 980, edge_p: 300, edge_len: 2.8, carrier: 0, bundled: 0, unit: 'แผ่น' },
      'remood|Duralight+ เรียบ15': { width: 0.15, len: 2.8, price: 2500, edge_p: 300, edge_len: 2.8, carrier: 0, bundled: 0, unit: 'แผ่น' },
      'remood|Duralight+ ชักร่อง': { width: 0.116, len: 2.8, price: 2100, edge_p: 300, edge_len: 2.8, carrier: 0, bundled: 0, unit: 'แผ่น' },
    },
    materials: ['ไม้ทิพย์|สีพื้น', 'ไม้ทิพย์|ลายไม้', 'fameline|สีมาตรฐาน', 'fameline|สีอื่น', 'HIGO|C19 (ใน)', 'HIGO|G15 (ใน)', 'HIGO|R16 (ใน)', 'HIGO|Y18 (ใน)', 'HIGO|P155 (นอก)', 'HIGO|WH200 (นอก)', 'remood|Entree เรียบ', 'remood|Entree มีลาย', 'remood|Entree ชักร่อง', 'remood|Duratech+ เรียบ13', 'remood|Duratech+ เรียบ16', 'remood|Duratech+ เรียบ14', 'remood|Duratech+ ชักร่อง15', 'remood|Duratech+ ชักร่อง21', 'remood|LIGHT+ เรียบ12', 'remood|LIGHT+ ลอนเล็ก', 'remood|LIGHT+ ชักร่อง16', 'remood|LIGHT+ ชักร่อง21', 'remood|Duralight+ เรียบ15', 'remood|Duralight+ ชักร่อง'],
    defMaterial: 'ไม้ทิพย์|สีพื้น',
    vars: PERIM_VARS,
    alu: [], glass: null, hardware: [],
    consum: [
      { name: 'เส้นฝ้า (ตามรุ่น)', price: 'ROW.price', unit: 'หน่วย', count: 'ROW.bundled? area : Math.ceil(area/(ROW.width*ROW.len)-1e-9)' },
      { name: 'ขาจับฝ้า (ไม้ทิพย์)', price: 190, unit: 'เส้น', count: 'ROW.carrier? Math.ceil(area-1e-9) : 0' },
      { name: 'ฉากเก็บขอบรอบ', price: 'ROW.edge_p', unit: 'เส้น', count: 'ROW.edge_p>0? Math.ceil(PERIM/ROW.edge_len-1e-9) : 0' },
      { name: 'โครงซีไลน์ (มาตรฐาน @1.2)', price: 50, unit: 'เส้น', count: 'Math.ceil((area/1.2 + Math.ceil(area/1.44-1e-9)*0.3)/4 -1e-9)' },
      { name: 'ค่าแรง (ผลิต+ติดตั้ง)', price: 352, unit: 'ตร.ม.', count: 'area' },
    ],
    note: 'ฝ้าไม้เทียม/ฝ้าอลู 4 ร้าน (ไม้ทิพย์/fameline/HIGO/remood) 24 รุ่น · ราคา/ขนาดต่อรุ่นจาก LUT จริง · ค่าแรง 352/ตร.ม. (ฝังในทุน) → ขาย ทุน×2 ปัดร้อย · สีไม่กระทบราคา (ยังไม่ทำตัวเลือกสี 117 สี — เช็คซ้ำกับพี่นัท)',
  },

  // ═══════════════════════ G5 มุ้ง ═══════════════════════
  screen: {
    id: 'screen', group: 5, name: 'มุ้งเฟรมเล็ก', brand: 'EURO', laborKey: 'มุ้งเฟรมเล็ก',
    laborPerLeaf: true, laborLeaves: 'N',   // ค่าแรงต่อใบ (ชีต ราคามุ้ง): 120+30/ตร.ม. ผลิต · 70+18 ติดตั้ง
    icon: '🦟', defForm: 'อิสระ', forms: ['อิสระ', 'อิสระ2บาน'],
    defaults: { w: 600, h: 300, p: 3 }, defGlass: null, minP: 1, maxP: 6,
    // ผ้ามุ้ง 4 ชนิด (ราคา ฿/ตร.ม. ตรงชีต "ราคามุ้ง" J2–J5 = ROUND(ราคา/ม้วน ÷ 36.6))
    materialLabel: 'ผ้ามุ้ง',
    materials: ['ไฟเบอร์', 'ไนล่อน', 'สแตนเลส', 'กันแมว', 'กันหนู'],
    defMaterial: 'ไฟเบอร์',
    addons: ['ms_color', 'screen_demo', 'screen_existing', 'frame_wrap'],
    specOpts: [FAB_SPEC],
    vars: {
      N: "(form==='อิสระ2บาน'?1:P)",
      SW: '(W/P)',
      FABQ: 'Math.round(N*SW*H*100)/100',  // พื้นที่ผ้ารวม (ตร.ม.)
    },
    alu: [],
    glass: null,
    hardware: [],
    consum: [
      { name: 'เสา (เส้น 6ม.)', price: 625, unit: 'เส้น', count: 'Math.round(N*2*H/6*100)/100' },
      { name: 'ขวาง (เส้น 6ม.)', price: 625, unit: 'เส้น', count: 'Math.round(N*2*SW/6*100)/100' },
      { name: 'ยางอัด (ม.)', price: 5, unit: 'ม.', count: 'Math.round(N*2*(SW+H)*100)/100' },
      ...SCREEN_FABRIC_ROWS,
    ],
    note: 'มุ้งเฟรมเล็ก · เลือกผ้า 4 ชนิด (ไฟเบอร์23/ไนล่อน38/สแตนเลส352/กันแมว82 ฿/ตร.ม. ตรงชีต) · ค่าแรงต่อใบ 120+30/70+18 (ชีตราคามุ้ง)',
  },

  screen_big: {
    id: 'screen_big', group: 5, name: 'มุ้งเฟรมใหญ่', brand: 'SMS', laborKey: 'มุ้งเฟรมใหญ่',
    laborPerLeaf: true, laborLeaves: 'N',   // เหมาต่อใบ 140 ผลิต / 44 ติดตั้ง (ชีตราคามุ้ง L14/N14)
    icon: '🦟', defForm: 'อิสระ', forms: ['อิสระ', 'อิสระ2บาน'],
    defaults: { w: 600, h: 300, p: 3 }, defGlass: null, minP: 1, maxP: 6,
    materialLabel: 'ผ้ามุ้ง',
    materials: ['ไฟเบอร์', 'ไนล่อน', 'สแตนเลส', 'กันแมว', 'กันหนู', 'นิรภัยสแตน 304'],   // นิรภัย = ผ้าตัวเลือกของเฟรมใหญ่ (R3.9 imp23 · พี่สั่ง 1ก.ค.) ไม่ใช่รุ่นแยก
    defMaterial: 'ไฟเบอร์',
    addons: ['ms_color', 'screen_demo', 'screen_existing', 'frame_wrap'],
    specOpts: [FAB_SPEC],
    vars: { N: "(form==='อิสระ2บาน'?1:P)", SW: '(W/P)', FABQ: 'Math.round(N*SW*H*100)/100' },
    alu: [],
    glass: null,
    hardware: [],
    consum: [
      { name: 'เสากุญแจบาน 20051 (เส้น 6ม.)', price: 885, unit: 'เส้น', count: 'Math.round(N*2*H/6*100)/100' },
      { name: 'ขวาง 20051 (เส้น 6ม.)', price: 885, unit: 'เส้น', count: 'Math.round(N*2*SW/6*100)/100' },
      { name: 'ยางอัด (ม.)', price: 5, unit: 'ม.', count: 'Math.round(N*2*(SW+H)*100)/100' },
      ...SCREEN_FABRIC_ROWS,
      { name: 'ผ้าสแตนเลสนิรภัย 304', price: 650, unit: 'ตร.ม.', count: "material==='นิรภัยสแตน 304'?FABQ:0" },   // ⚠️ทุน 650/ตร.ม. · R3.9 ขายเป็น tier 3500/3200/3000 ตามพื้นที่ — รอพี่เคาะใน Excel ทุนรวม
    ],
    note: 'มุ้งเฟรมใหญ่ — กรอบเสากุญแจบาน 20051 (885/เส้น) · ผ้า 6 ชนิด (รวมนิรภัยสแตน304 · R3.9 นิรภัยเฉพาะเฟรมใหญ่) · ค่าแรงเหมา 140/44 ต่อใบ',
  },

  // (ลบ screen_safety รุ่นแยกทิ้ง 1ก.ค. — นิรภัย = ผ้าตัวเลือกของ screen_big 'นิรภัยสแตน 304' ตาม R3.9 · พี่สั่ง)

  screen_ready: {
    id: 'screen_ready', group: 5, name: 'มุ้งจีบ / ม้วน / รังผึ้ง', brand: '-', laborKey: '-',
    pickerHide: true,   // ซ่อนจาก picker G5 (รุ่นจริงจีบ/ม้วน/รังผึ้ง = R3.9 4 หมวด imp28/29/mj_*) · คงไว้ให้ computeMosquitoR4 (มุ้งบวกบาน จีบ/ม้วน) เรียกใช้
    sellDirect: true, sellRate: 'RATE', sellInstallRate: 'IRATE', sellMin: 'MIN',
    icon: '🦟', defForm: 'อิสระ', forms: ['อิสระ'],
    defaults: { w: 200, h: 240, p: 1 }, defGlass: null, minP: 1, maxP: 1,
    // ราคาขายตรง ฿/ตร.ม. (ชีต "ราคามุ้ง" B2–B12) · ค่าแรงติดตั้ง F (160 ทั่วไป / 180 จีบนิรภัย) · เลิกคำ "สำเร็จ" (พี่สั่ง 1ก.ค. · R3.9 ไม่มี)
    materialLabel: 'ชนิดมุ้ง',
    materials: ['มุ้งจีบ', 'มุ้งม้วน ขาว/ดำ/น้ำตาล', 'มุ้งม้วน ซาฮาร่า', 'มุ้งม้วน ลายไม้สักทอง', 'มุ้งม้วน ไลท์โอ๊ค', 'มุ้งจีบนิรภัย ≤3ม. ขาว/ดำ', 'มุ้งจีบนิรภัย ≤3ม. ซาฮาร่า', 'มุ้งจีบนิรภัย ≤3ม. สักทอง', 'มุ้งจีบนิรภัย >3ม. ขาว/ดำ', 'มุ้งจีบนิรภัย >3ม. ซาฮาร่า', 'มุ้งจีบนิรภัย >3ม. สักทอง', 'ม่านรังผึ้ง Blackout', 'ม่านรังผึ้ง SD ทูเวย์', 'ม่านรังผึ้ง KeepRail ทูเวย์', 'ม่านรังผึ้ง KeepRail Honey', 'มุ้งม้วนเตะ ≤1.5ม.', 'มุ้งม้วนเตะ 1.5–3ม.', 'มุ้งม้วนเตะ 3–6ม.', 'มุ้งจีบ SD พื้นฐาน', 'มุ้งแม่เหล็กพับ'],
    defMaterial: 'มุ้งจีบ',
    addons: ['ms_color', 'screen_demo', 'screen_existing', 'frame_wrap'],
    specOpts: [FAB_SPEC],
    vars: {
      RATE: "({'มุ้งจีบ':1179,'มุ้งม้วน ขาว/ดำ/น้ำตาล':1300,'มุ้งม้วน ซาฮาร่า':1500,'มุ้งม้วน ลายไม้สักทอง':1600,'มุ้งม้วน ไลท์โอ๊ค':1700,'มุ้งจีบนิรภัย ≤3ม. ขาว/ดำ':2750,'มุ้งจีบนิรภัย ≤3ม. ซาฮาร่า':3150,'มุ้งจีบนิรภัย ≤3ม. สักทอง':3250,'มุ้งจีบนิรภัย >3ม. ขาว/ดำ':4050,'มุ้งจีบนิรภัย >3ม. ซาฮาร่า':4450,'มุ้งจีบนิรภัย >3ม. สักทอง':4550,'ม่านรังผึ้ง Blackout':2500,'ม่านรังผึ้ง SD ทูเวย์':4000,'ม่านรังผึ้ง KeepRail ทูเวย์':6000,'ม่านรังผึ้ง KeepRail Honey':4500,'มุ้งม้วนเตะ ≤1.5ม.':7500,'มุ้งม้วนเตะ 1.5–3ม.':7500,'มุ้งม้วนเตะ 3–6ม.':7500,'มุ้งจีบ SD พื้นฐาน':2500,'มุ้งแม่เหล็กพับ':1500}[material]||1179)",
      IRATE: "(String(material).indexOf('นิรภัย')>=0?180:160)",
      MIN: "({'มุ้งม้วนเตะ ≤1.5ม.':15000,'มุ้งม้วนเตะ 1.5–3ม.':37500,'มุ้งม้วนเตะ 3–6ม.':67500,'มุ้งจีบ SD พื้นฐาน':3500}[material]||0)",
    },
    alu: [],
    glass: null,
    hardware: [],
    consum: [],
    note: 'มุ้งสำเร็จ (ซื้อสำเร็จ) — ราคาขายตรง ฿/ตร.ม. ตรงชีต "ราคามุ้ง" B2–B12 (ไม่ ×กำไร) + ค่าแรงติดตั้ง 160(ทั่วไป)/180(จีบนิรภัย) ฿/ตร.ม. · ปัดร้อยตามระบบ · ➕ เพิ่มรังผึ้ง/ม้วนเตะ/SD/แม่เหล็ก (เรตขายตรงจากดราฟ ⚠️ติดธงเช็คซ้ำ) · ม้วนเตะ≤1.5/1.5–3/3–6ม. มีขั้นต่ำ 15,000/37,500/67,500 · SD พื้นฐานขั้นต่ำ 3,500 · ม่านรังผึ้งขั้นต่ำ+ความกว้างสูงสุด(maxW) รอยืนยัน',
  },

  // ═══════════════════════ G4 ตู้ ═══════════════════════
  cabinet: {
    id: 'cabinet', group: 4, name: 'ตู้อลูมิเนียม', brand: 'SMS', sellCabinet: true,
    showColor: true, colorNote: '🎨 สีอบ/ผิว — เลือกได้ พิมพ์ลงใบ · ยังไม่บวกเงิน (รอราคาทุนสีต่อ ตร.ม. ใน Excel) · "ฐานเฟรม" ด้านล่างมีผลราคาจริง',
    icon: '📦', materialLabel: 'ฐานเฟรม (มีผลราคา)', materials: ['สีดำ', 'สีทอง'], defMaterial: 'สีดำ',
    defForm: 'บานเลื่อน', forms: ['บานเลื่อน', 'บานเปิด'],
    kindOpts: [
      { key: 'kind', label: 'ประเภทตู้', def: 'wardrobe', opts: [['wardrobe', 'ตู้ทั่วไป'], ['shoe', 'ตู้รองเท้า (ชั้นถี่)']] }, // shoe=ชั้นถี่ spacing 0.2 + ลึก 0.4
      { key: 'shelfMat', label: 'ชนิดชั้น', def: 'alu', opts: [['alu', 'ชั้นอลู'], ['glass', 'ชั้นกระจก (รอราคา)']] },          // glass=ทุน/ตร.ม. รอกรอก (สูตรพร้อม)
      { key: 'faceGlass', label: 'กระจกหน้าบาน', def: 'clear', opts: [['clear', 'ใส'], ['frost', 'ฝ้า (+500)'], ['black', 'ชาดำ (+500)']] }, // R3.9 ftglasscolor +500/ตร.ม.
      { key: 'faceColor', label: 'สีหน้าบาน (อลู)', def: 'white', opts: [['white', 'ขาว (ฟรี)'], ['black', 'ดำ (ฟรี)'], ['special', 'สีพิเศษ (+1,500–3,500/บาน)']] }, // R3.9 FT_COLOR_PLUS ตามพื้นที่/บาน
      { key: 'glassGrade', label: 'เกรดกระจกชั้น', def: 'clear6', opts: [['clear6', 'ใส 6มม.'], ['clear8', 'ใส 8มม. (+1,200)'], ['clear10', 'ใส 10มม. (+1,200)'], ['temper6', 'เทมเปอร์ 6มม. (+600)'], ['temper8', 'เทมเปอร์ 8มม. (+1,300)'], ['temper10', 'เทมเปอร์ 10มม. (+2,100)']], showIf: { key: 'shelfMat', val: 'glass' } }, // R3.9 o-shelfglass 6 ระดับ · โผล่เฉพาะชั้น=กระจก
    ],
    defaults: { w: 120, h: 240, p: 2 }, defGlass: null, minP: 1, maxP: 3, defDepth: 0.6,   // R3.9 ตู้อลู 1-3 บาน
    alu: [], glass: null, hardware: [], consum: [],
    note: 'ตู้อลู Future Tech — ทุนจริงจากบานตู้.xlsx: บานหน้า(เส้น+กระจก+ค่าแรง ต่อบาน) + ผนัง 2 ข้าง(1,383/ตร.ม.) + ชั้น(1,416/ตร.ม.) → ×กำไร R4.0 · จำนวนบาน 1-3 · ตู้รองเท้า=ชั้นถี่(0.2ม.)+ลึก 0.4ม. · ⚠️บานเปิดกว้าง/ทอง-เปิด-เล็ก + ชั้นกระจก(ทุนรอ) เช็คซ้ำ',
  },
  cabinet_face: {
    id: 'cabinet_face', group: 4, name: 'ฝาตู้ Future Tech (เฉพาะบานหน้า)', brand: 'SMS', sellCabinet: true, faceOnly: true,
    showColor: true, colorNote: '🎨 สีอบ/ผิว — เลือกได้ พิมพ์ลงใบ · ยังไม่บวกเงิน (รอราคาทุนสีต่อ ตร.ม. ใน Excel) · "ฐานเฟรม" ด้านล่างมีผลราคาจริง',
    icon: '🚪', materialLabel: 'ฐานเฟรม (มีผลราคา)', materials: ['สีดำ', 'สีทอง'], defMaterial: 'สีดำ',
    defForm: 'บานเลื่อน', forms: ['บานเลื่อน', 'บานเปิด'],
    kindOpts: [
      { key: 'faceMat', label: 'วัสดุหน้าบาน', def: 'glass', opts: [['glass', 'หน้ากระจก'], ['alu', 'หน้าอลูทึบ (รอราคา X)']] },   // FutureTech อลู/กระจก (มติ 14มิ.ย. · ส่วนต่าง รอ BOM)
      { key: 'faceGlass', label: 'กระจกหน้าบาน', def: 'clear', opts: [['clear', 'ใส'], ['frost', 'ฝ้า (+500)'], ['black', 'ชาดำ (+500)']], showIf: { key: 'faceMat', val: 'glass' } }, // R3.9 ftglasscolor +500/ตร.ม.
      { key: 'faceColor', label: 'สีหน้าบาน (อลู)', def: 'white', opts: [['white', 'ขาว (ฟรี)'], ['black', 'ดำ (ฟรี)'], ['special', 'สีพิเศษ (+1,500–3,500/บาน)']], showIf: { key: 'faceMat', val: 'alu' } }, // R3.9 FT_COLOR_PLUS ตามพื้นที่/บาน
    ],
    defaults: { w: 120, h: 240, p: 2 }, defGlass: null, minP: 1, maxP: 3, faceHint: 'แนะนำพื้นที่/บาน ≤ 1.7 ตร.ม. (บานใหญ่กว่านี้เสี่ยงแอ่น)',
    alu: [], glass: null, hardware: [], consum: [],
    note: 'ฝาตู้ Future Tech — เฉพาะบานหน้า · ทุนจริง/บาน = เส้น+อุปกรณ์(ตาราง ถอดของ) + กระจก(300/ตร.ม.) + วัสดุ/ค่าแรง/ค่ารถ 4,100 → ×กำไร R4.0 · ⚠️บานเปิดกว้าง/ทอง-เปิด-เล็ก เช็คซ้ำ',
  },

  // ═══════════════════════ G6 ห้องกระจก ═══════════════════════
  room: {
    id: 'room', group: 6, name: 'ห้องกระจก (ประกอบ)', brand: '-', composite: true,
    icon: '🔲', defForm: 'มาตรฐาน', forms: ['มาตรฐาน'],
    defaults: { w: 300, h: 300, p: 1 }, defGlass: null, minP: 1, maxP: 1,
    room: { roomH: 250, nwall: 3, walltype: 'fixed', roofOn: true, roofmat: 'ไวนิล', floorOn: false, floorRate: 5000 },
    wallTypes: ['fixed', 'sms_slide', 'open_door'],  // ชนิดผนัง (รุ่นจริงที่ประกอบ)
    alu: [], glass: null, hardware: [], consum: [],
    note: 'ห้องกระจก R4.0 — ประกอบจากรุ่นจริง: ผนังกระจก(เลือกชนิดบาน) + หลังคา(เลือกวัสดุ) + พื้น(ออปชั่น) · คิดด้วย cost-engine ของแต่ละชิ้น (ราคา R4.0 จริง · แยกราคาทุกด้าน) · room builder หลายช่อง/ต่อด้าน ทำต่อ',
  },
  shower: {
    // ถอดทุน BOM R4.0 (ชีต "คิดทุน ชุด Shower") — บานตาย(W×H) + ประตู(spec.dw×spec.dh) + ช่องปูน(spec.cw)
    // material=ชุด(สแตนเลส/อลู) · form=แบบ(บานตาย/+เปิด/+เลื่อน) · ค่าแรงติดตั้งพับในทุน (ผลิต0)
    id: 'shower', group: 1, subcat: 'พิเศษ · กระจกเปลือย · สำเร็จ', name: 'ห้องอาบน้ำ Shower (กระจกเทมเปอร์)', brand: '-', laborKey: 'Shower (ในวัสดุ)',
    icon: '🚿',
    materialLabel: 'ชุด', materials: ['สแตนเลส', 'อลูมิเนียม'], defMaterial: 'สแตนเลส',
    defForm: 'บานตาย+บานเปิด', forms: ['บานตาย', 'บานตาย+บานเปิด', 'บานตาย+บานเลื่อน'],
    defaults: { w: 60, h: 200, p: 1 }, defGlass: 'เทมเปอร์ใส 10มม.', minP: 1, maxP: 1,
    addons: ['shower_corner', 'shower_hw'],
    specOpts: [
      { key: 'dw', type: 'number', step: 1, label: 'ประตู: กว้าง (ซม.)', def: '60' },
      { key: 'dh', type: 'number', step: 1, label: 'ประตู: สูง (ซม.)', def: '200' },
      { key: 'cw', type: 'number', step: 1, label: 'ช่องปูน: กว้าง (ซม. · สำหรับราว/ราง)', def: '120' },
      { key: 'rail', label: 'ราวกลมด้านบน', opts: ['มี', 'ไม่มี'], def: 'มี' },
    ],
    vars: {},
    glass: 'W*H + (+spec.dw||0)/100*(+spec.dh||0)/100',   // บานตาย(W×H ม²) + ประตู(dw×dh ซม→ม²)
    hardware: [
      { name: 'ยูจับกระจก', price: 200, unit: 'ตัว', count: "material==='สแตนเลส'?4:0" },
      { name: 'ราวสแตนเลสกลม', price: 430, unit: 'เส้น6ม', count: "material==='สแตนเลส'&&spec.rail==='มี'&&form!=='บานตาย+บานเลื่อน'?(+spec.cw||0)/600:0" },
      { name: 'ตัวจับกระจกคู่ราว', price: 175, unit: 'ตัว', count: "material==='สแตนเลส'&&spec.rail==='มี'&&form!=='บานตาย+บานเลื่อน'?2:0" },
      { name: 'บานพับสแตนเลส', price: 1450, unit: 'ตัว', count: "material==='สแตนเลส'&&form==='บานตาย+บานเปิด'?2:0" },
      { name: 'ยางปิดหน้าบาน', price: 150, unit: 'เส้น', count: "material==='สแตนเลส'&&form==='บานตาย+บานเปิด'?1:0" },
      { name: 'รางสแตนเลสเลื่อน', price: 3500, unit: 'เส้น6ม', count: "material==='สแตนเลส'&&form==='บานตาย+บานเลื่อน'?(+spec.cw||0)/600:0" },
      { name: 'มือจับสแตนเลส', price: 1500, unit: 'ตัว', count: "form==='บานตาย'?0:1" },
      { name: 'ยู5หุนอลู (รอบแผ่น)', price: 200, unit: 'เส้น6ม', count: "material==='อลูมิเนียม'?(2*(W*100+H*100)+2*((+spec.dw||0)+(+spec.dh||0)))/600:0" },
    ],
    consum: [
      { name: 'ค่าแรงติดตั้ง', price: 87.5, unit: 'ชม.', count: "form==='บานตาย'?5:6" },   // ตาย5/เปิด-เลื่อน6 ชม. × 87.5 (Excel E28)
    ],
    note: 'ห้องอาบน้ำกระจกเทมเปอร์ 10มม. — ถอดทุน R4.0 (สแตนเลส/อลู · บานตาย+ประตู) · กรอกขนาดประตู/ช่องปูนในช่องเสริม',
  },

  // ── รุ่นใหม่ที่รอ BOM (พี่อนุมัติ 29มิ.ย. · sellDirect X รอราคา → เลือกได้ทั้ง G1 และ G6) ──
  frameless_door: {
    // ถอดทุน BOM R4.0 (ชีต "คิดทุน บานเปลือย") — กระจกเทมเปอร์ + อุปกรณ์ตามแบบ (ไม่มีเฟรมอลู · ค่าแรงติดตั้ง=บานเปิด)
    id: 'frameless_door', group: 1, subcat: 'พิเศษ · กระจกเปลือย · สำเร็จ', name: 'บานเปลือย (ติดตาย/สวิง/เลื่อน)', brand: '-', laborKey: 'บานเปลือย',
    icon: '🚪', materialLabel: 'แบบบานเปลือย', materials: ['ติดตาย', 'สวิง (ประตู)', 'เลื่อน'], defMaterial: 'สวิง (ประตู)',
    addons: ['stainless', 'demolish'],
    defForm: 'มาตรฐาน', forms: ['มาตรฐาน'], defaults: { w: 100, h: 220, p: 1 }, defGlass: 'เทมเปอร์ 10มม.', minP: 1, maxP: 4,
    vars: {}, alu: [],
    glass: 'W*H',
    hardware: [
      { name: 'ชุดล้อ+ราง (เลื่อน)', price: 3600, unit: 'ชุด', count: "material==='เลื่อน'?P:0" },
      { name: 'โช้ค+จุดหมุน (สวิง)', price: 2330, unit: 'ชุด', count: "material==='สวิง (ประตู)'?P:0" },
      { name: 'มือจับ', price: 1500, unit: 'ตัว', count: "material==='ติดตาย'?0:P" },
      { name: 'ล็อค', price: 1200, unit: 'ชุด', count: "material==='ติดตาย'?0:P" },
    ],
    consum: [],
  },
  pivot: {
    // ถอดทุน BOM R4.0 (ไฟล์ "ถอดทุน_งานใหม่" ชีต "คิดทุน บานหมุน") — เหมือนบานเปิด แต่จุดหมุนแทนบานพับ
    id: 'pivot', group: 1, name: 'บานหมุน (Pivot)', brand: 'EURO', laborKey: 'บานหมุน',
    icon: '🚪', defForm: 'มีธรณี', forms: ['มีธรณี', 'ไม่มีธรณี'],
    addons: ['stainless', 'frame_wrap', 'demolish'],
    defaults: { w: 150, h: 200, p: 1 }, defGlass: 'เขียว 6มม.', minP: 1, maxP: 2,
    vars: { S: "form==='มีธรณี'?1:0" },
    alu: [
      { name: 'วงกบ 3 ด้าน F7859', price: 1100, kg: 6.11111, seg: 'W+2*H', count: '1' },
      { name: 'ธรณี F7938B', price: 1400, kg: 7.77778, seg: 'W', count: 'S' },
      { name: 'ตบธรณี F7960', price: 575, kg: 3.19444, seg: 'W', count: 'S' },
      { name: 'เสริมใต้บาน F7863', price: 435, kg: 2.41667, seg: 'W', count: '1-S' },
      { name: 'กรอบประตู 7864', price: 1995, kg: 11.08333, seg: '2*P*H+2*W', count: '1' },
      { name: 'คิ้ว F7935', price: 360, kg: 2, seg: '2*P*H+2*W', count: '1' },
      { name: 'เปิดกลาง F7945c', price: 775, kg: 4.30556, seg: 'H', count: 'P>1?1:0' },
    ],
    glass: 'W*H',
    hardware: [
      { name: 'จุดหมุน (2 ตัว/บาน)', price: 450, unit: 'ชุด', count: '2*P' },
      { name: 'มือจับ+ล็อค ใบหลัก', price: 1045, unit: 'ชุด', count: '1' },
      { name: 'ชุดกลอน ใบลอง', price: 450, unit: 'ชุด', count: 'Math.max(P-1,0)' },
      { name: 'น็อตเฟรม', price: 1, unit: 'ตัว', count: 'S?8:6' },
    ],
    consum: [
      { name: 'ยาง', price: 11, unit: 'ม.', count: 'Math.round(2*(W+H)*P)' },
      SILICONE,
    ],
  },
  fold_lift: {
    // ถอดทุน BOM R4.0 (ชีต "คิดทุน เฟี้ยมยก") — เฟี้ยมยูโรหมุน 90° · เฟรม F79xx (ราคาสีอบขาว/ดำ D-col) + HD + ยาง + กระจก
    // seg = Σยาว(ซม.)/100 เป็นเมตร (STOCK_LEN 6.4) · P = จำนวนบานเฟี้ยม N · ราคาสีพิเศษยังใช้ฐานอบขาว/ดำ (kg=0 · ปรับทีหลัง)
    id: 'fold_lift', group: 1, name: 'บานเฟี้ยมยก', brand: 'EURO', laborKey: 'บานเฟี้ยมยก',
    icon: '🚪', defForm: 'มาตรฐาน', forms: ['มาตรฐาน'],
    addons: ['mosquito', 'frame_wrap', 'demolish'],
    defaults: { w: 200, h: 120, p: 2 }, defGlass: 'เขียว 6มม.', minP: 2, maxP: 8,
    vars: {},
    alu: [
      { name: 'F7968 เฟรมข้าง', price: 3435, kg: 0, seg: '(2*(H*100-2))/100', count: '1' },
      { name: 'F7969 เฟรมล่าง', price: 1905, kg: 0, seg: '(W*100-11)/100', count: '1' },
      { name: 'F7970 เฟรมบน', price: 1125, kg: 0, seg: 'W', count: '1' },
      { name: 'F7971 คิ้วเฟรมบน', price: 520, kg: 0, seg: '(W*100-15)/100', count: '1' },
      { name: 'F7973 ตบปิดเฟรม', price: 245, kg: 0, seg: '((H*100-6.5)*2+(W*100-11))/100', count: '1' },
      { name: 'F7972 กรอบบาน', price: 1885, kg: 0, seg: '(((H*100-8.2)/2)*4+(W*100-12.4)*4)/100', count: '1' },
      { name: 'F7935 คิ้วกระจก', price: 385, kg: 0, seg: '(((H*100-39.5)/2)*4+(W*100-24)*4)/100', count: '1' },
    ],
    glass: '((W*100-25.4)/100)*(((H*100-8.2)/2-13)/100)*P',
    hardware: [
      { name: 'HD-640 บานพับล้อบน', price: 299, unit: 'ตัว', count: '1' },
      { name: 'HD-641 บานพับเฟี้ยม', price: 72, unit: 'ตัว', count: '(W*100)<=270?7:10' },
      { name: 'HD-642 บานพับมือจับ', price: 109, unit: 'ตัว', count: '1' },
      { name: 'HD-643 บานพับไกด์ล่าง', price: 199, unit: 'ตัว', count: '1' },
      { name: 'HD-474 มือจับกลอน', price: 85, unit: 'ตัว', count: '1' },
      { name: 'HD-312 ตลับกลอนล็อค', price: 88, unit: 'ตัว', count: '1' },
      { name: 'HD-1180 ก้านสไลด์', price: 73, unit: 'ตัว', count: '2' },
      { name: 'HD-213 ฉากเข้ามุม', price: 15, unit: 'ตัว', count: '4*P' },
      { name: 'HD-200 ฉากประคองมุม', price: 1.5, unit: 'ตัว', count: '12*P' },
    ],
    consum: [
      { name: 'ยางอัด', price: 8, unit: 'ม.', count: '2*((W*100-25.4)+((H*100-8.2)/2-13))*P/100' },
      { name: 'ยางรอง', price: 8, unit: 'ม.', count: '2*((W*100-25.4)+((H*100-8.2)/2-13))*P/100' },
      { name: 'ยางลูกโป่ง 6mm', price: 7, unit: 'ม.', count: '2*((W*100-12.4)+((H*100-8.2)/2))*P/100' },
    ],
  },

  bansolid: {
    // ถอดทุน BOM R4.0 (ชีต "คิดทุน บานโซลิด") — บานเปิด + ลูกฟูก2ทาง 2 ฝั่ง + เส้นคาดตาราง 2 ฝั่ง (ไม่มีกระจก)
    // ลูกฟูก/คาดตาราง = SlimLux (mult_slim=1) · ราคาสีอบขาว/ดำ ลูกฟูก 432 · คาดตาราง 140 (แปรตามสีทีหลัง)
    id: 'bansolid', group: 1, name: 'บานโซลิด', brand: 'EURO', laborKey: 'บานโซลิด',
    icon: '🚪', defForm: 'มีธรณี', forms: ['มีธรณี', 'ไม่มีธรณี'],
    addons: ['stainless', 'frame_wrap', 'demolish'],
    defaults: { w: 150, h: 200, p: 1 }, defGlass: null, minP: 1, maxP: 2,
    vars: { S: "form==='มีธรณี'?1:0", HG: '(H>3||(W/P)>1.2)?5:4' },
    alu: [
      { name: 'วงกบ 3 ด้าน F7859', price: 1100, kg: 6.11111, seg: 'W+2*H', count: '1' },
      { name: 'ธรณี F7938B', price: 1400, kg: 7.77778, seg: 'W', count: 'S' },
      { name: 'ตบธรณี F7960', price: 575, kg: 3.19444, seg: 'W', count: 'S' },
      { name: 'เสริมใต้บาน F7863', price: 435, kg: 2.41667, seg: 'W', count: '1-S' },
      { name: 'กรอบประตู 7864', price: 1995, kg: 11.08333, seg: '2*P*H+2*W', count: '1' },
      { name: 'คิ้ว F7935', price: 360, kg: 2, seg: '2*P*H+2*W', count: '1' },
      { name: 'เปิดกลาง F7945c', price: 775, kg: 4.30556, seg: 'H', count: 'P>1?1:0' },
    ],
    glass: null,
    hardware: [
      { name: 'บานพับ hyda', price: 117, unit: 'ตัว', count: 'HG*P' },
      { name: 'มือจับ+ล็อค ใบหลัก', price: 1045, unit: 'ชุด', count: '1' },
      { name: 'ชุดกลอน ใบลอง', price: 450, unit: 'ชุด', count: 'Math.max(P-1,0)' },
      { name: 'น็อตเฟรม', price: 1, unit: 'ตัว', count: 'S?8:6' },
      // ลูกฟูก2ทาง 2 ฝั่ง (SlimLux ตัดไม่ต่อ) — จำนวนเส้น 6ม. ตามการตัด · Excel R24
      { name: 'ลูกฟูก2ทาง 2 ฝั่ง', price: 432, unit: 'เส้น', count: 'Math.ceil( Math.ceil((W*100/P)/10) * P * 2 / Math.max(1, Math.trunc(600/Math.max(1,H*100))) )' },
      // เส้นคาดตาราง แนวตั้ง 2 ฝั่ง — Excel R33 (เส้นกว้าง1.8 ช่อง2 เว้นข้าง10)
      { name: 'เส้นคาดตาราง 2 ฝั่ง', price: 140, unit: 'เส้น', count: 'Math.ceil( Math.max(0, Math.trunc((W*100/P-18)/3.8)) * P * 2 / Math.max(1, Math.trunc(600/Math.max(1,H*100))) )' },
    ],
    consum: [
      { name: 'ยาง', price: 11, unit: 'ม.', count: 'Math.round(2*(W+H)*P)' },
      SILICONE,
    ],
  },

  ykk: {
    id: 'ykk', group: 1, subcat: 'พิเศษ · กระจกเปลือย · สำเร็จ', name: 'บานสำเร็จ YKK', brand: 'YKK',
    sellDirect: true, sellRate: 'SR', sellInstallRate: '0', sellMin: "material==='Exhido'?120000:(material==='Tostem Airflow'?34000:30000)",
    icon: '🚪', materialLabel: 'รุ่น', materials: ['Ventilation', 'Exhido', 'Tostem Airflow'], defMaterial: 'Ventilation',
    defForm: 'มาตรฐาน', forms: ['มาตรฐาน'], defaults: { w: 120, h: 200, p: 1 }, defGlass: 'เขียว 6มม.', minP: 1, maxP: 4,
    vars: { SR: "material==='Exhido'?(area<4?30000:20000):17500" }, alu: [], glass: null, hardware: [], consum: [],
    note: 'บานสำเร็จ YKK — ราคาขายอ้างอิง R3.9: Ventilation 17,500/ตร.ม. ขั้นต่ำ 30,000 · Exhido bucket 30,000/20,000 ขั้นต่ำ 120,000 · Tostem 17,500 ขั้นต่ำ 34,000 · ⚠️ ทุนจริง+เช็คขนาดรอ Excel',
  },

  // ═══════════════════════ G7 ม่านซิป ═══════════════════════
  // R4.0 ของแท้: ซื้อสำเร็จจากจีน (¥×5 = ทุน) → ×2 (กำไร 100%) = ขาย · ข้อมูลจริงจากโฟลเดอร์ "ทำแคตตาล็อกสินค้าจีน" (Hunan)
  zipscreen: {
    id: 'zipscreen', group: 7, name: 'ม่านซิป (Zip Screen กันลม)', brand: '-', sellZip: true, addons: ['zip_motor', 'zip_noremote', 'zip_smart', 'zip_remote', 'pullrod'],
    icon: '🎐', materialLabel: 'ผ้า (ความโปร่ง)',
    specOpts: [{ key: 'frameColor', label: 'สีกล่อง/ราง/โครง', opts: ['ขาว', 'ดำ', 'เทา', 'ลายไม้'], def: 'ขาว' }],
    materials: ['0', '1', '2', '3', '5', '10', '30', 'PET'],
    materialLabels: { '0': 'F00 ทึบ 99%', '1': 'F01 1%', '2': 'F02 2%', '3': 'F03 ไฟเบอร์', '5': 'F05 5% (ขายดี)', '10': 'F10 10%', '30': 'F30 30%', 'PET': 'PET ใส' },
    defMaterial: '5',
    defForm: 'อัตโนมัติ', forms: ['อัตโนมัติ', 'Z100', 'Z120', 'Double 2 ชั้น', 'Ultra Wide', 'Skylight 100', 'Skylight 120'],
    defaults: { w: 300, h: 240, p: 1 }, defGlass: null, minP: 1, maxP: 1,
    // ราคาขาย ฿/ตร.ม. (= ทุนจีน ¥×5 ×2) ต่อ series+ผ้า · มอเตอร์/อุปกรณ์ ฿/ชุด (ขาย) · ทุน = ขาย÷2
    zip: {
      mult: 2, yuan: 5,
      series: {
        Z100: { minH: 1.5, minA: 3, maxW: 5, maxH: 3, fab: { '0': 1880, '1': 1780, '2': 1780, '3': 1880, '5': 1680, '10': 1680, '30': 1680, 'PET': 1980 } },
        Z120: { minH: 1.5, minA: 3, maxW: 5, maxH: 4, fab: { '0': 2050, '1': 1950, '2': 1950, '3': 2050, '5': 1850, '10': 1850, '30': 1850, 'PET': 2150 } },
        Z200D: { minH: 1.5, minA: 3, maxW: 4, maxH: 3, fab: { '0': 3680, '1': 3680, '2': 3680, '3': 3680, '5': 3680, '10': 3680, '30': 3680, 'PET': 3680 } },
        Z120W: { minH: 2, minA: 6, maxW: 30, maxH: 3, fab: { '0': 3400, '1': 3300, '2': 3300, '3': 3400, '5': 3200, '10': 3200, '30': 3200 } },
        Z100S: { minH: 1.5, minA: 3, fab: { '5': 3680, '10': 3680, '30': 3680 } },
        Z120S: { minH: 1.5, minA: 3, fab: { '5': 3880, '10': 3880, '30': 3880 } },
      },
      motor: { dooya: 3000, hybrid: 5900, solar: 6900, manual: 1000, uw: 3800, uwdual: 8000, sky: 6000, skydual: 12000 },
      motorLabel: { dooya: 'Dooya AM45 (มาตรฐาน)', hybrid: 'มือ+ไฟ 2-in-1', solar: 'โซลาร์', manual: 'มือดึงล้วน', uw: 'Ultra Wide', uwdual: 'Ultra Wide Dual', sky: 'Skylight', skydual: 'Skylight Dual' },
      acc: { remote1: 300, remote_multi: 400, smart: 800, pullrod: 250 },
    },
    alu: [], glass: null, hardware: [], consum: [],
    note: 'ม่านซิป R4.0 — ซื้อสำเร็จจากจีน (Hunan ¥×5=ทุน · ×2=ขาย กำไร 100%) · รุ่น auto ตามขนาด(กว้าง>5→UltraWide) · มอเตอร์ auto ตามรุ่น (Dooya มาตรฐาน · UltraWide/Skylight แยก) · สูงต่ำสุด 1.5ม.(UW 2ม.) · ขั้นต่ำ 3ตร.ม.(UW 6) · เลือกมอเตอร์/Smart/Solar อื่น = add-on (ทำต่อ) · ไม่รวมติดตั้ง/ขนส่ง/ภาษี',
  },

};

// รุ่นที่ยังไม่ลงระบบ — แสดงเป็นป้าย TODO ใต้กลุ่ม (ดู TODO.md)
// (ว่างแล้ว: ตู้ G4 = cabinet/cabinet_face · ม่านซิป G7 = zipscreen ลงระบบจริงแล้ว มีทุน R4.0)
export const PRODUCTS_TODO = [];
