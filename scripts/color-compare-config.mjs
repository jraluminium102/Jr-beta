/**
 * color-compare-config — ตั้งค่ากลางของตัวเทียบไฟล์ เทียบค่าอบสี.xlsx (gen-color-r39-compare-xlsx · check-color-file-vs-web)
 *   ชื่อสินค้าในไฟล์ → รุ่นในคิดราคา 4.0 + ตัวเลือกที่ตรงกับช่อง "อลูที่ใช้" ของไฟล์
 *   ⚠ 12 ต.ค.69 เจอว่าเดิมคิดเว็บด้วยค่าตั้งต้น → เฟี้ยม 6 บานถูกคิดเป็นแบบ "2 บาน" · ประตูรั้วใบ 1×1.6 แทน 1.6×4 ฯลฯ
 *     = เทียบคนละชิ้นงาน → ต้องตั้งตัวเลือกให้ตรงไฟล์ทุกครั้ง
 */
export const IDOF = {
  "บานเลื่อน SMS": "sms_slide", "บานเลื่อน ยูโร": "euro_slide", "บานเลื่อน SlimLux": "slimlux",
  "บานเลื่อนรางบน": "topslide", "บานเลื่อน E-series": "eseries", "บานระแนงเลื่อน": "bar_slide",
  "บานเปิด": "open_door", "บานหมุน": "pivot", "บานกระทุ้ง": "awning", "เฟี้ยม": "folding",
  "เฟี้ยมยูโร": "fold_euro", "ติดตาย": "fixed", "PC Door": "pcdoor", "บานยก": "banyok",
  "เปิดดัดโค้ง": "curve_open", "บานเกล็ด": "banklet", "บานโซลิด": "bansolid", "Velora": "velora",
  "หลังคาเพิง ไวนิล": "roof", "ระแนง": "louver", "ระแนงหมุน": "louver_rotate", "ระแนงสลับ": "louver_slip",
  "ประตูรั้ว": "gate",
};

/** ตัวเลือกต่อรุ่นให้ตรงไฟล์ (ทับค่าตั้งต้นของเว็บ) — { form, material, spec } */
export const FILE_OPTS = {
  // "6 บาน" ในไฟล์ → รูปแบบ 6 บาน (ค่าตั้งต้นเว็บเป็น 2 บาน)
  folding: { form: "6บาน: เปิดกลาง (3-3)" },
  fold_euro: { form: "6บาน: เปิดกลาง (3-3)" },
  // ระแนง: ใบ กล่อง 1"×1.6" · โชว์ 1" · ห่าง 2 ซม. · มีโครงดาม 1"×1.6"
  louver: { spec: { rnBox: "1x1.6", rnFace: "2.54", rnGap: "2", rnFrame: "รวมโครง" } },
  // ระแนงสลับ: A 1"×4" โชว์ 4" ×3 ท่อน · B 1.6"×1.6" ×5 ท่อน · ห่าง 2 ซม.
  louver_slip: { spec: { boxA: "1x4", showA: "10.16", cntA: "3", boxB: "1.6x1.6", showB: "4.06", cntB: "5", rnGap: "2" } },
  // ประตูรั้ว: ใบ กล่อง 1.6"×4" โชว์ 4" ห่าง 2 ซม.
  gate: { material: "1.6x4", spec: { rnFace: "10.16", rnGap: "2" } },
  roof: { material: "ไวนิล" },
};

/** สีในไฟล์ → คีย์สีบนหน้าคิดราคา */
export const KEYOF = (s) => {
  const t = String(s).replace(/\s+/g, "");
  if (/มะฮอกกานี/.test(t)) return "wood_maho";
  if (/ไวท์โอ/.test(t)) return "wood_whiteoak";
  if (/ลายไม้อบพิเศษ/.test(t)) return "wood_special";
  if (/อบพิเศษ|สีพิเศษ/.test(t)) return "special";
  if (/ลายไม้/.test(t)) return "wood_teak";
  return null;
};

/** อินพุตเครื่องคิดราคาของรุ่นนี้ ตามขนาด/จำนวนบานในไฟล์ + ตัวเลือกให้ตรงไฟล์ */
export function baseInput(id, p, size, panels) {
  const [w, h] = String(size).split(/\s*x\s*/i).map(Number);
  const o = FILE_OPTS[id] || {};
  return { w, h, p: Number(panels) || 1, form: o.form ?? p.defForm, material: o.material ?? p.defMaterial,
    glassType: p.defGlass, spec: { ...(o.spec || {}) }, addons: {} };
}

/**
 * อินพุตให้เหมือนหน้าเว็บ: หน้าคิดราคาตั้ง spec เริ่มต้นจาก specOpts ทุกตัว (Calculator40Client:348) แต่ fixture R4.1 ส่ง spec ว่าง
 *   → รุ่นที่มีออปชั่นราคาในค่าตั้งต้น (บานเปิด มือจับ · PC Door ซอฟต์โคลส · Shower ราวกลม · SlimLux มือจับ) ทุนในสคริปต์เทียบต่ำกว่าเว็บจริง
 *   (agent ตรวจ 13 ต.ค.69) · ค่าที่ fixture ระบุมาแล้วชนะค่าตั้งต้นเสมอ
 */
export function withSpecDefaults(prod, inputs) {
  const spec = {};
  for (const o of prod?.specOpts ?? []) if (!/^(side\d|joint\d)/.test(o.key)) spec[o.key] = o.def ?? o.opts?.[0] ?? "";
  return { ...inputs, spec: { ...spec, ...(inputs?.spec || {}) } };
}
