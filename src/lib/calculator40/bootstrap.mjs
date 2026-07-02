// bootstrap.mjs — ก๊อปตรงจาก mockup R4.0 (index.html script บล็อกฝัง "R39 FALLBACK: auto-register รุ่นที่ขาด")
// สกัดไว้ที่ scratchpad/r40/bootstrap.embedded.js (source of truth) — พอร์ตเป็น export function เดียว
// ห้ามแก้กติกา: SKIP list / SKIPCAT / เงื่อนไข regex ชื่อรุ่น / ลำดับ push addons ต้องตรงต้นฉบับเป๊ะ
//
// ทำ 3 อย่าง (ตรงคอมเมนต์เดิมในต้นฉบับ):
//  (1) auto-register รุ่น R3.9 fallback จาก R39DATA.products เข้า PRODUCTS (ที่ยังไม่มี native cost-engine)
//  (2) auto-เติม p.addons + p.specOpts ให้ทุกรุ่น G1/G2 ตามชื่อรุ่น (regex）— มุ้ง/มือจับ/ครอบวงกบ/แผ่นทึบ/คาดตาราง/ล็อค ฯลฯ
//  (3) auto-เติม p.colorKeys (สีอลูที่เลือกได้ต่อรุ่น) ตาม dropdown Excel มด
//
// idempotent: เรียกซ้ำได้ (HMR/หลาย mount) — เช็ค PRODUCTS.__r39BootstrapApplied ก่อน mutate ซ้ำ
/* eslint-disable @typescript-eslint/no-explicit-any */

export function applyBootstrap(PRODUCTS, R39DATA) {
  if (!PRODUCTS || (PRODUCTS).__r39BootstrapApplied) {
    return { fallbackCount: 0, addonCount: 0, colorCount: 0, alreadyApplied: true };
  }
  if (typeof R39DATA === 'undefined' || typeof PRODUCTS === 'undefined' || !R39DATA || !R39DATA.products) {
    return { fallbackCount: 0, addonCount: 0, colorCount: 0, alreadyApplied: false };
  }

  const CAT2G = { 'บานเลื่อน': 1, 'บานเปิด': 1, 'ติดตาย': 1, 'บานกระทุ้ง': 1, 'บานหมุน': 1, 'บานเฟี้ยม': 1, 'เลื่อนภายใน': 1, 'บานยก': 1, 'shower': 1, 'บานเปลือย': 1, 'ดัดโค้ง': 1, 'PC Door': 1, 'YKK': 1, 'ระแนง': 2, 'ประตูรั้ว': 2, 'เส้นคาด': 2, 'ราวบันได': 2, 'ระแนง-บังตา': 2, 'ระแนง-ผนัง': 2, 'ระแนง-เกล็ด': 2, 'หลังคา': 3, 'ฝ้า-ผนัง': 3, 'ตู้อลู': 4, 'ฝาตู้': 4, 'มุ้ง': 5, 'ม่านซิป': 7 };
  // ข้ามรุ่นที่ R4.0 มี cost-engine แล้ว
  // inner_top_* รางบน = topslide cost-engine คุมแล้ว → ข้าม (กัน dup) · folding_xseries/inner_bottom_* ปล่อยลง fallback
  const SKIP = new Set(['sliding_sms', 'sliding_euro', 'sliding_eseries', 'fixed_glass', 'awning_euro', 'awning_aluinch', 'casement_euro', 'casement_velora', 'folding', 'folding_euro', 'lift_sms', 'lift_aluinch', 'pc_door_2', 'pc_door_4', 'curved_fixed', 'inner_top_stack', 'inner_top_slimlux', 'inner_bottom_sms', 'inner_bottom_euro', 'shower', 'pivot', 'frameless_fixed', 'ykk_vent', 'ykk_exhido', 'tostem_a01', 'roof_vinyl', 'roof_delight', 'roof_polyton', 'roof_laminate', 'ceiling_smooth', 'isowall', 'wall_ext', 'wall_int', 'ceil_cshape', 'ceil_bsc', 'steel_mesh',
    // มุ้ง G5 (พี่สั่ง 1ก.ค. · จัดตาม R3.9 4 หมวด): imp21/imp23=ซ้ำ native screen/screen_big · imp32/imp33/imp35=ผ้า(จีบนิรภัยสแตน/กันแมว/สแตนเลสกันหนู) R3.9 ซ่อนจากชิป (เป็นตัวเลือกผ้าในรุ่นเฟรม ไม่ใช่รุ่นแยก)
    'imp21', 'imp23', 'imp32', 'imp33', 'imp35',
    // หลังคา (แก้ 1ก.ค. · bug พี่จับ): imp7-14=เมทัลชีท 8 ชนิด · imp15-20=ชินโคไลท์ 6 รุ่น — ซ้ำ "วัสดุมุง" ใน roof product (ถอดทุนจริงแล้ว L764-819) · เดิม leak เป็น card แยกไม่มีทุน → "รอทุน X" · SKIP ให้เลือกผ่าน material ของ "หลังคา" (เหมือน ไวนิล/ดีไลท์/โพลีตัน)
    'imp7', 'imp8', 'imp9', 'imp10', 'imp11', 'imp12', 'imp13', 'imp14', 'imp15', 'imp16', 'imp17', 'imp18', 'imp19', 'imp20',
    // ราวกันตก (แก้ 1ก.ค.): imp1-6 = native handrail cascade ครอบครบ (LUT IMP1-6 · เฉียง/ตรง × 3 ระบบยึด) → SKIP fallback ซ้ำ
    'imp1', 'imp2', 'imp3', 'imp4', 'imp5', 'imp6',
    // ฝ้าระแนงอลู (แก้ 1ก.ค.): native ceil_ranae_* (sellR39) มีอยู่แล้ว id เดียวกัน → fallback ซ้ำเป๊ะ · SKIP
    'ceil_ranae_1x5', 'ceil_ranae_16_5', 'ceil_ranae_16_2',
    // บานดัดโค้ง (แก้ 1ก.ค.): native curve_fixed (บานติดตายดัดโค้ง มีทุน BOM) + curve_open (บานเปิดดัดโค้ง DOOR_LUT ครอบ P=1 เดี่ยว/P=2 คู่) → fallback ซ้ำ · SKIP (curved_slim สลิม = native ไม่ครอบ คงไว้)
    'curved_fixed', 'curved_single', 'curved_double']);
  // หมายเหตุ: inner_top_xseries เอาออกจาก SKIP → ปล่อยลง fallback (R4.0 ไม่มี native รางบน X-series) · shower/pivot/frameless_fixed/ykk_* SKIP เพราะ native มีราคา R3.9 แล้ว (กันรุ่นซ้ำ)
  // ข้ามหมวดที่ทำแยก (ระแนงมีโครง=cascade ด้านล่าง · เสริม=ออปชั่น)
  const SKIPCAT = new Set(['เสริม', 'ลูกฟูก+คอมโพสิททึบ', 'ระแนง-บังตา', 'ระแนง-ผนัง', 'ระแนง-เกล็ด']);
  const OKM = new Set(['bucket', 'area_rate', 'per_sqm', 'per_length_tier', 'area_rate_addon', 'fold_flat']);
  const BESPOKE = ['cabinet', 'future_tech', 'zipscreen', 'gate', 'bar_grid', 'bar_slide', 'bar_openclose', 'grid', 'frame_wrap', 'custom_item', 'glass_replace', 'gutter_cover', 'pvc_cover', 'truss_cover', 'ranae', 'screen_addon'];
  let n = 0;
  R39DATA.products.forEach(function (p) {
    if (SKIP.has(p.id) || SKIPCAT.has(p.cat)) return;
    if (/ยกเลิกขาย/.test(p.name || '')) return;
    if (BESPOKE.some(function (f) { return p[f]; })) return;
    if (!OKM.has(p.method)) return;
    if (p.method === 'per_sqm') { if (!p.rate) return; }
    else if (p.method === 'fold_flat') { if (!p.unit_rate) return; }
    else if (p.method === 'area_rate_addon') { if (!p.rates) return; }
    else { if (!p.rates) return; }
    const id = 'r39_' + p.id; if (PRODUCTS[id]) return;
    const isLen = (p.method === 'per_length_tier');
    const isSlide = (p.method === 'area_rate_addon');   // เลื่อนภายในรางล่าง = บานเลื่อน 1-4 บาน
    PRODUCTS[id] = {
      id: id, group: (CAT2G[p.cat] || 1), name: p.name, brand: 'MTONG', sellR39: true,
      r39key: p.rates || null, r39min: p.min || 0, r39method: p.method, r39rate: p.rate || 0, r39fin: 0,
      r39unitRate: p.unit_rate || 0, r39addon: p.addon || null,
      icon: '•', dimLabel: (isLen ? 'ความยาว (ซม.)' : null), defForm: 'มาตรฐาน', forms: ['มาตรฐาน'],
      defaults: { w: (isLen ? 300 : (isSlide ? 200 : 100)), h: (isLen ? 100 : 240), p: (isSlide ? 2 : 1) }, defGlass: null, minP: 1, maxP: (isSlide ? 4 : 1),
      alu: [], glass: null, hardware: [], consum: [],
      isR39Fallback: true,   // flag บอกว่าเป็นรุ่น fallback (ราคาขาย R3.9 ยังไม่ถอดทุน) — UI ใช้โชว์ badge "R3.9"
      note: 'ราคาอ้างอิง R3.9 (' + (isLen ? 'ตามความยาว' : (p.method === 'per_sqm' ? 'ตร.ม.×เรต' : (p.method === 'fold_flat' ? 'max(ขั้นต่ำ, พื้นที่×เรต/บาน)' : (isSlide ? 'พื้นที่×เรต + เพิ่มตามจำนวนบาน' : 'ตามขนาด')))) + ' · รวมติดตั้ง · ยังไม่ถอดต้นทุน/ออปชั่น)',
    };
    n++;
  });
  // ── ระแนง (บังตา/ผนัง/เกล็ด) R3.9 cascade = ลบทิ้ง (พี่เคาะ 30มิ.ย.) ──
  // เหตุ: "บังตา" ซ้ำกับ louver (ระแนงบังตา · BOM ทุนจริง) · ผนัง/เกล็ด ไม่ขายแยก · เรต R3.9 เก่า (ตัวที่หน้าโชว์ 5/7.5/10 มั่ว)
  // ระแนง-บังตา/ผนัง/เกล็ด ยังอยู่ใน SKIPCAT แล้ว (ไม่ auto-register เป็นรุ่นแยก) — จึงไม่มี r39_ranae อีกต่อไป
  // ── ใส่ออปชั่นเสริม default ให้รุ่นที่ควรมี (ทับเฉพาะที่ยังไม่ระบุเอง) ──
  // G1 บาน: ครอบวงกบ+คาดตาราง ทุกบาน · บานเปิด/ประตู +โช้ค+ธรณี · G2 ระแนง/รั้ว: ครอบวงกบ
  let na = 0;
  Object.values(PRODUCTS).forEach(function (p) {
    if (p.composite || p.sellZip || p.addons) return;
    const nm = p.name || '';
    if (p.group === 1) {
      const ads = ['frame_wrap', 'grid'];
      if (/เปิด|ประตู|door|casement|ดัดโค้ง|YKK|เฟี้ยม/i.test(nm)) { ads.push('closer'); if (/เปิด|เฟี้ยม|ประตู/.test(nm)) ads.push('thresh'); }
      if (!/ติดตาย/.test(nm)) ads.push('mosquito');           // มุ้งบวกบาน (เว้นติดตาย)
      if (/เลื่อน|เปิด|ประตู|หมุน|ดัดโค้ง|PC|เฟี้ยม/i.test(nm)) ads.push('digihandle'); // มือจับดิจิตอล
      // ── เฟส2 ②: มือจับ Cmech/สแตนเลส + มอเตอร์ + กระทุ้ง + ซ่อนราง (ราคา R3.9) ──
      if (/เปิด|ประตู|กระทุ้ง|เฟี้ยม|หมุน|PC|door|casement/i.test(nm)) ads.push('cmech');  // มือจับ Cmech
      if (/เลื่อน|เปิด|ประตู|PC/i.test(nm)) ads.push('stainless');                          // มือจับสแตนเลส
      if (/บานยก/.test(nm)) ads.push('motor');                                              // มอเตอร์บานยก
      if (/เกล็ด/.test(nm)) ads.push('banklet_motor');                                      // มอเตอร์บานเกล็ด (1,800→6,000)
      if (/เลื่อน/.test(nm)) ads.push('slide_auto');                                        // ชุดออโต้บานเลื่อน Evecca/ช่างแซก/SlimLux (×2.5/6,000)
      if (/กระทุ้ง/.test(nm)) ads.push('awn_tt', 'awn_brace', 'awn_auto');                    // กระทุ้ง tilt&turn + แขนค้ำ + ชุดออโต้ (โช้ค/โซ่)
      if (/เฟี้ยม/.test(nm)) ads.push('hide_track');                                        // ซ่อนราง เฟี้ยม
      if (/SlimLux|รางบน|เลื่อนซ้อน/i.test(nm)) ads.push('inner_track');                     // ซ่อนราง +5,000 (เลื่อนภายในรางบน R3.9:2000)
      // ── เฟส3 (ดราฟ-parity): อุปกรณ์เสริมบาน R3.9 COMMON_OPTS + แผ่นทึบ ──
      if (/เลื่อน|เปิด|ประตู|เฟี้ยม|ติดตาย|ทึบ/i.test(nm) && !/ดัดโค้ง|ระแนง/.test(nm)) ads.push('solid_panel'); // แผ่นทึบล่าง อลูลูกฟูก/คอมโพสิต (บานกระจกหลัก)
      if (/SlimLux|รางบน|เลื่อนซ้อน/i.test(nm)) ads.push('soft_close', 'sling');              // เลื่อนภายในรางบน (R3.9 inner_top)
      if (/SlimLux|รางบน|เลื่อนซ้อน|เฟี้ยม/i.test(nm)) ads.push('hide_beam', 'u_track');       // ซ่อนคาน + ฝังรางยู (inner_top + เฟี้ยม)
      if (/SlimLux|รางบน|เลื่อนซ้อน|เฟี้ยม|PC/i.test(nm)) ads.push('beam_support');           // เสริมคาน (inner_top + เฟี้ยม + PC)
      ads.push('demolish', 'drop_floor');                                                   // รื้อของเดิม + ดรอปพื้น (กรอกราคา · ทุกรุ่น)
      p.addons = ads;
      if (!/ติดตาย|ดัดโค้ง|ระแนง/.test(nm)) p.specOpts = (p.specOpts || []).concat([{ key: 'lock', label: 'ล็อค', opts: ['ไม่มี', 'มีล็อค', 'มีล็อค+กุญแจ'], def: 'ไม่มี' }]); // ล็อค (label พิมพ์ลงใบ · ราคา X)
      na++;
    } else if (p.group === 2 && /ระแนง|รั้ว|บังตา/.test(nm)) {
      p.addons = ['frame_wrap']; na++;
    }
  });
  // ── สีอลูที่เลือกได้ต่อรุ่น (ตาม dropdown Excel มด) — ล็อกสีเฉพาะที่รุ่นนั้นมีจริง ──
  const C6 = ['white', 'black', 'sahara', 'sahara_black', 'wood_teak', 'wood_maho', 'wood_whiteoak', 'special', 'wood_special'];       // SMS/รางบน/เฟี้ยม/E-series (6 หมวด)
  const C9 = C6.concat(['aztec']);                                                                                              // ยูโร/เปิด/กระทุ้ง/PC/รั้ว (+แอทแทคเกรย์)
  const C5 = ['white', 'black', 'sahara', 'wood_teak', 'wood_maho', 'wood_whiteoak', 'special', 'wood_special'];                       // ติดตาย/ดัดโค้ง (ไม่มีดำซาฮาร่า)
  const C4 = ['white', 'black', 'sahara', 'special', 'wood_special'];                                                              // SlimLux/Velora (4 หมวด)
  let nc = 0;
  Object.values(PRODUCTS).forEach(function (p) {
    if (p.colorKeys || p.composite) return; const nm = p.name || '';
    let set = null;
    if (/SlimLux|Velora/i.test(nm)) set = C4;
    else if (/ติดตาย|ดัดโค้ง/.test(nm)) set = C5;
    else if (/ยูโร|บานเปิด|กระทุ้ง|PC Door|ประตูรั้ว|Velora|YKK/i.test(nm)) set = C9;
    else if (/เลื่อน|รางบน|เฟี้ยม|E-series|บานยก|เกล็ด/i.test(nm)) set = C6;
    if (set) { p.colorKeys = set; nc++; }
  });

  (PRODUCTS).__r39BootstrapApplied = true;
  return { fallbackCount: n, addonCount: na, colorCount: nc, alreadyApplied: false };
}
