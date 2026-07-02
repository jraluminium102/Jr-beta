// mosquito.mjs — ก๊อปตรงจาก mockup R4.0 app.js (บรรทัด ~314-358)
// มุ้งบวกบาน R4.0 — คิดครั้งเดียว ใช้ร่วม G1 + G6 + door-picker (แก้ที่เดียว · พี่สั่ง 1ก.ค.)
// ห้ามแก้สูตร/เงื่อนไข — ก๊อปตรง
/* eslint-disable @typescript-eslint/no-explicit-any */
import { computeCost } from "./engine.mjs";

// ชิปเลือกชนิดมุ้งบวกบาน — 4 หมวดตรง G5/R3.9 (เฟรมเล็ก/ใหญ่/จีบ/จีบม่านรังผึ้ง/ม้วน) · จีบนิรภัย=variant ในจีบ · ใช้ร่วมทุกที่ (G1 addon + door-picker)
export const MOSQ_CHIPS = [
  { val: 'none', label: 'ไม่มี' }, { val: 'small', label: 'เฟรมเล็ก' }, { val: 'big', label: 'เฟรมใหญ่' },
  { val: 'pleat', label: 'จีบ' }, { val: 'honey', label: 'จีบม่านรังผึ้ง' }, { val: 'roll', label: 'ม้วน' },
];

// รุ่นย่อยมุ้ง (จีบ/รังผึ้ง/ม้วน) = ดึงจาก screen_ready.materials จริง (ลิงค์ G5 · ครบทุก variant · พี่สั่ง 1ก.ค.) — filter ตามหมวด
export function mosqVariants(PRODUCTS, cat) {
  const mats = (PRODUCTS.screen_ready && PRODUCTS.screen_ready.materials) || [];
  if (cat === 'pleat') return mats.filter((m) => /จีบ|แม่เหล็ก/.test(m) && !/รังผึ้ง/.test(m));
  if (cat === 'honey') return mats.filter((m) => /รังผึ้ง/.test(m));
  if (cat === 'roll') return mats.filter((m) => /ม้วน/.test(m));
  return [];
}

// มุ้งบวกบาน R4.0 — A = ออปชั่นมุ้ง (mosquito/mqFabric/mqSize/mqW/mqH/mqPanels/mqPrice/mqVariant) · d = {wCm,hCm,movePanes,form}
export function computeMosquitoR4(PRODUCTS, A, d, PB, profitPct, installProfitPct) {
  const mq = A && A.mosquito;
  if (!mq || mq === 'none') return null;
  // รุ่นย่อย (variant) จาก dropdown A.mqVariant (ลิงค์ screen_ready.materials จริง) · fallback = ตัวแรกของหมวด
  const _mqV = A.mqVariant;
  const M = {
    small: ['screen'], big: ['screen_big'],
    pleat: ['screen_ready', (_mqV && /จีบ|แม่เหล็ก/.test(_mqV) && !/รังผึ้ง/.test(_mqV)) ? _mqV : 'มุ้งจีบ'],
    honey: ['screen_ready', (_mqV && /รังผึ้ง/.test(_mqV)) ? _mqV : 'ม่านรังผึ้ง Blackout'],
    roll: ['screen_ready', (_mqV && /ม้วน/.test(_mqV)) ? _mqV : 'มุ้งม้วน ขาว/ดำ/น้ำตาล'],
  }[mq];
  const mp = M && PRODUCTS[M[0]];
  if (!mp) return null;
  const custom = A.mqSize === 'custom';
  const mw = custom ? Math.round((+A.mqW || 1) * 100) : d.wCm;
  const mh = custom ? Math.round((+A.mqH || 1) * 100) : d.hCm;
  let movePanes = d.movePanes;
  if (d.form === 'สลับ' && mq === 'roll') movePanes = Math.ceil(movePanes / 2);   // R3.9: บานเลื่อนสลับ + มุ้งม้วน คิดครึ่งช่องเปิด
  const mpan = Math.max(1, +A.mqPanels || movePanes);
  // ผ้านิรภัย = ตัวเลือกผ้าของเฟรมเล็ก/ใหญ่ → คิดฐานด้วยไฟเบอร์ + upcharge tier R3.9 (safety08 · บวกบนฐาน ไม่ใช่แทนผ้า · พี่สั่ง 1ก.ค.) · ทุนมด 650/ตร.ม. คงไว้ (markup ≈4.6-5.4×)
  const isSafety = ['small', 'big'].includes(mq) && A.mqFabric === 'safety';
  const baseMat = ['small', 'big'].includes(mq) ? (isSafety ? 'ไฟเบอร์' : ({ fiber: 'ไฟเบอร์', cat: 'กันแมว', rat: 'กันหนู' }[A.mqFabric] || 'ไฟเบอร์')) : (M[1] || mp.defMaterial);
  const mr = computeCost(PB, mp, { w: mw, h: mh, p: mpan, form: mp.defForm, material: baseMat, profitPct, installProfitPct });
  let safetyExtra = 0, safetyLbl = '';
  if (isSafety) {
    const aM = (mw / 100) * (mh / 100);
    const tier = aM <= 1.5 ? 3500 : (aM <= 3 ? 3200 : 3000);   // R3.9 ผ้านิรภัยสแตน 0.8มม. ขาย/ตร.ม. (RATES.IMP31 / fabricExtra safety08)
    safetyExtra = Math.round(tier * aM);
    safetyLbl = ' + ผ้านิรภัยสแตน 304 (' + tier.toLocaleString() + '/ตร.ม.)';
  }
  const fabLbl = ['small', 'big'].includes(mq) ? (isSafety ? safetyLbl : ' · ' + baseMat) : '';
  const dispName = ['small', 'big'].includes(mq) ? mp.name : (M[1] || mp.name);   // จีบ/รังผึ้ง/ม้วน โชว์ชื่อ variant จริง (ไม่ใช่ชื่อรวม)
  const ovr = +A.mqPrice || 0;
  return {
    amount: ovr > 0 ? ovr : (mr.sell.withInstall + safetyExtra),
    label: dispName + ' ' + mpan + ' บาน' + fabLbl + (custom ? ` (${A.mqW || 1}×${A.mqH || 1}ม.)` : '') + (ovr > 0 ? ' (ราคากำหนดเอง)' : ''),
  };
}
