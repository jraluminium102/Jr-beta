/**
 * gen-boq-check-pdf — ใบตรวจใบตัด/BOQ ให้ช่างตรวจ (เจ้าของ 14 พ.ย.69)
 *   "ก๊อปขนาดทั้งหมด ไปทดสอบเป็นถอด BOQ · เอา 2 ขนาด ครบทุกรูปแบบบานที่มีในเว็บ · อันไหนไม่มีก็ไม่ต้องทำ
 *    · pdf 1 หน้า 1 บาน 1 ขนาด · ให้ช่างบ้าน ๆ อ่านเข้าใจ ดูว่าถูกไหม"
 *
 *   ขนาด = ขนาดกลาง/ใหญ่ จากใบตรวจราคา (docs/ใบตรวจราคา-ผลเทียบ-data/key.json)
 *   ตัวเลข = เอนจินใบตัดของเว็บตัวจริง (src/lib/cutlist) · แปลงจากสูตรคิดราคาผ่าน cutInputFromRecipe ตัวเดียวกับเว็บ
 *   รูปแบบที่ใบตรวจราคาไม่มีขนาด → ยืมขนาดรุ่นที่ใกล้สุด และเขียนบอกบนหน้า
 *
 *   รัน: node --experimental-strip-types scripts/gen-boq-check-pdf.mts [--keep-html]
 */
import fs from "node:fs";
import { chromium } from "playwright";
import { CUT_SPEC_BY_ID } from "../src/lib/cutlist/products.ts";
import { computeCutList, type CutSpec, type CutResult } from "../src/lib/cutlist/engine.ts";
import { cutInputFromRecipe } from "../src/lib/cutlist/from-recipe.ts";
import { PRODUCTS } from "../src/lib/calculator40/products.mjs";

const OUT = "docs/ใบตรวจใบตัด-BOQ-2ขนาด.pdf";
const key: any[] = JSON.parse(fs.readFileSync("docs/ใบตรวจราคา-ผลเทียบ-data/key.json", "utf8"));
const K = (id: string, nameHas?: string) => {
  const p = key.find((x) => x.id === id && (!nameHas || x.name.includes(nameHas)));
  if (!p) throw new Error("ไม่มีใน key.json: " + id);
  return p;
};
type Sz = { w: number; h: number; p: number };
const sizesOf = (id: string, nameHas?: string): [Sz, Sz] => {
  const p = K(id, nameHas);
  return [{ w: p.mid.w, h: p.mid.h, p: p.mid.p || 1 }, { w: p.big.w, h: p.big.h, p: p.big.p || 1 }];
};
const formForN = (prodId: string, n: number) => ((PRODUCTS as any)[prodId].forms as string[]).find((f) => f.startsWith(n + "บาน"));

// ── รายการรูปแบบ (ใบตัดในเว็บ) × 2 ขนาด ──
type Case = {
  spec: string;          // spec id ใบตัด
  title: string;         // ชื่อที่ช่างเรียก
  form: string;          // รูปแบบ
  src: string;           // ขนาดเอามาจากไหน
  sizes: [Sz, Sz];
  recipe?: (s: Sz) => any;               // ผ่านตัวแปลงของเว็บ (ใบเสนอ → ใบตัด)
  input?: (s: Sz) => Record<string, any>; // ไม่มีในใบเสนอ → ตั้งค่าเอง (ค่าตั้งต้นของใบตัด + ขนาด)
};
const R = (prodId: string, extra: Record<string, any> = {}) => (s: Sz) => ({ kind: "std", prodId, w: s.w, h: s.h, p: s.p, color: "อบขาว", glassType: "เขียว 6มม.", ...extra });
const fromCheck = (name: string) => `ขนาดจากใบตรวจราคา (${name})`;
const borrow = (name: string) => `ใบตรวจราคาไม่มีรุ่นนี้ — ยืมขนาด ${name}`;

const sms = sizesOf("sms_slide"), euro = sizesOf("euro_slide"), slx = sizesOf("slimlux"), top = sizesOf("topslide");
const cases: Case[] = [
  { spec: "sms_slide_free", title: "บานเลื่อน SMS", form: "อิสระ / สลับ", src: fromCheck("บานเลื่อน SMS"), sizes: sms, recipe: R("sms_slide", { form: "อิสระ" }) },
  { spec: "sms_slide_center", title: "บานเลื่อน SMS", form: "เปิดคู่กลาง (4 บาน)", src: fromCheck("บานเลื่อน SMS") + " · เปิดคู่กลางทำได้แค่ 4 บาน",
    sizes: [{ ...sms[0], p: 4 }, { ...sms[1], p: 4 }], recipe: R("sms_slide", { form: "เปิดคู่กลาง" }) },
  { spec: "sms_slide_tow", title: "บานเลื่อน SMS", form: "ลากจูง (กองข้างเดียว)", src: fromCheck("บานเลื่อน SMS"), sizes: sms, recipe: R("sms_slide", { form: "ลากจูง" }) },
  { spec: "fuji_slide", title: "บานเลื่อน ยูโร (FUJI)", form: "อิสระ / สลับ 2–3 บาน", src: fromCheck("บานเลื่อน ยูโร") + " · ใหญ่ใช้ 3 บาน (รูปแบบนี้ทำได้ 2–3 บาน)",
    sizes: [euro[0], { ...euro[1], p: 3 }], recipe: R("euro_slide", { form: "อิสระ" }) },
  { spec: "fuji_slide_multi", title: "บานเลื่อน ยูโร (FUJI)", form: "4–5 บาน (เฟรมต่อ)", src: fromCheck("บานเลื่อน ยูโร") + " · กลางใช้ 4 บาน ใหญ่ 5 บาน",
    sizes: [{ ...euro[0], p: 4 }, { ...euro[1], p: 5 }], recipe: R("euro_slide", { form: "อิสระ" }) },
  { spec: "fuji_slide_center", title: "บานเลื่อน ยูโร (FUJI)", form: "เปิดคู่กลาง (4 / 6 บาน)", src: fromCheck("บานเลื่อน ยูโร") + " · กลาง 4 บาน ใหญ่ 6 บาน",
    sizes: [{ ...euro[0], p: 4 }, { ...euro[1], p: 6 }], recipe: R("euro_slide", { form: "เปิดคู่กลาง" }) },
  { spec: "slimlux_slide", title: "บานเลื่อนเฟรมบาง SlimLux", form: "อิสระ", src: fromCheck("SlimLux"), sizes: slx, recipe: R("slimlux", { form: "อิสระ" }) },
  { spec: "slimlux_slide", title: "บานเลื่อนเฟรมบาง SlimLux", form: "ลากจูง", src: fromCheck("SlimLux"), sizes: slx, recipe: R("slimlux", { form: "ลากจูง" }) },
  { spec: "slimlux_slide", title: "บานเลื่อนเฟรมบาง SlimLux", form: "เปิดคู่กลาง", src: fromCheck("SlimLux") + " · เปิดคู่กลางใช้จำนวนบานคู่ (กลาง 4 บาน)",
    sizes: [{ ...slx[0], p: 4 }, slx[1]], recipe: R("slimlux", { form: "เปิดคู่กลาง" }) },
  { spec: "toprail_frame", title: "บานเลื่อนรางบน (Hafele)", form: "ระบบ SMS · อิสระ", src: fromCheck("บานเลื่อนรางบน"), sizes: top, recipe: R("topslide", { form: "เลื่อนซ้อน", spec: { sys: "SMS", sashmode: "อิสระ" } }) },
  { spec: "toprail_frame", title: "บานเลื่อนรางบน (Hafele)", form: "ระบบ SMS · ลากจูง", src: fromCheck("บานเลื่อนรางบน"), sizes: top, recipe: R("topslide", { form: "เลื่อนซ้อน", spec: { sys: "SMS", sashmode: "ลากจูง" } }) },
  { spec: "toprail_frame", title: "บานเลื่อนรางบน (Hafele)", form: "ระบบ SMS · เปิดคู่กลาง", src: fromCheck("บานเลื่อนรางบน") + " · เปิดคู่กลางใช้จำนวนบานคู่ (กลาง 2 บาน)",
    sizes: [{ ...top[0], p: 2 }, top[1]], recipe: R("topslide", { form: "เลื่อนซ้อน", spec: { sys: "SMS", sashmode: "เปิดคู่กลาง" } }) },
  { spec: "toprail_frame", title: "บานเลื่อนรางบน (Hafele)", form: "ระบบยูโร · อิสระ", src: fromCheck("บานเลื่อนรางบน"), sizes: top, recipe: R("topslide", { form: "เลื่อนซ้อน", spec: { sys: "ยูโร", sashmode: "อิสระ" } }) },
  { spec: "fixed_panel", title: "บานติดตาย", form: "กล่อง 1.6×3 + 9014", src: fromCheck("บานติดตาย"), sizes: sizesOf("fixed"), recipe: R("fixed", { form: "กระจกล้วน" }) },
  { spec: "fuji_fix", title: "บานติดตาย ยูโร (FUJI)", form: "Fix", src: borrow("บานติดตาย"), sizes: sizesOf("fixed"), input: (s) => ({ W: s.w, H: s.h, N: 1 }) },
  { spec: "velora_swing", title: "Velora บานเปิด", form: "เดี่ยว · ยัดในช่อง", src: fromCheck("Velora บานเปิด"), sizes: sizesOf("velora"), recipe: R("velora") },
  { spec: "fuji_swing", title: "หน้าต่างบานเปิด/กระทุ้ง ยูโร (FUJI)", form: "บานเดียว", src: borrow("บานกระทุ้ง"), sizes: sizesOf("awning"), input: (s) => ({ W: s.w, H: s.h, N: 1 }) },
  { spec: "fuji_hung", title: "บานยก ยูโร (FUJI)", form: "เดี่ยว", src: fromCheck("บานยก"), sizes: sizesOf("banyok"), recipe: R("banyok", { form: "เดี่ยว" }) },
  { spec: "fuji_door", title: "ประตูบานเปิด ยูโร (FUJI)", form: "ประตูเดี่ยว", src: borrow("ประตูเดี่ยว (Velora / โซลิด)"), sizes: sizesOf("velora"), input: (s) => ({ W: s.w, H: s.h, N: 1 }) },
  { spec: "fuji_door_double", title: "ประตูบานเปิด ยูโร (FUJI)", form: "ประตูคู่ 2 บาน", src: borrow("ประตู PC Door (2 บาน)"), sizes: sizesOf("pcdoor"), input: (s) => ({ W: s.w, H: s.h, N: 2 }) },
  { spec: "pc_door", title: "ประตู PC Door", form: "แบ่ง 2", src: fromCheck("ประตู PC Door"), sizes: sizesOf("pcdoor"), recipe: R("pcdoor", { form: "แบ่ง 2" }) },
  { spec: "pc_door", title: "ประตู PC Door", form: "แบ่ง 4", src: fromCheck("ประตู PC Door"), sizes: sizesOf("pcdoor"), recipe: R("pcdoor", { form: "แบ่ง 4" }) },
  { spec: "solid_door", title: "บานโซลิด", form: "โซลิด 2 ชั้น · มีธรณี", src: fromCheck("บานโซลิด 2 ชั้น"), sizes: sizesOf("bansolid", "2 ชั้น"), recipe: R("bansolid", { form: "มีธรณี", spec: { solidLayer: "โซลิด 2 ชั้น" } }) },
  { spec: "solid_door", title: "บานโซลิด", form: "โซลิด 1 ชั้น · มีธรณี", src: fromCheck("บานโซลิด 1 ชั้น"), sizes: sizesOf("bansolid", "1 ชั้น"), recipe: R("bansolid", { form: "มีธรณี", spec: { solidLayer: "โซลิด 1 ชั้น" } }) },
  { spec: "woodjamb_swing", title: "บานเปิดครอบวงกบไม้", form: "แม่ลูก", src: borrow("บานเปิด"), sizes: sizesOf("open_door"), recipe: R("woodjamb", { form: "แม่ลูก" }) },
  { spec: "sms240_bifold", title: "บานเฟี้ยม (SMS 240)", form: "", src: fromCheck("บานเฟี้ยม"), sizes: sizesOf("folding"), recipe: (s) => R("folding", { form: formForN("folding", s.p) })(s) },
  { spec: "euro_bifold", title: "บานเฟี้ยม ยูโร 45°", form: "", src: fromCheck("บานเฟี้ยม ยูโร"), sizes: sizesOf("fold_euro"), recipe: (s) => R("fold_euro", { form: formForN("fold_euro", s.p) })(s) },
  { spec: "euro_bifold_corner", title: "บานเฟี้ยม ยูโร เข้ามุม", form: "ผนัง A + ผนัง B เท่ากัน", src: borrow("บานเฟี้ยม ยูโร (ใช้ขนาดเดียวกันทั้ง 2 ผนัง)"), sizes: sizesOf("fold_euro"),
    input: (s) => ({ W: 0, H: s.h, N: 1, WA: s.w, WB: s.w, nA: s.p, nB: s.p, openSide: "A" }) },
  { spec: "euro_lift", title: "บานเฟี้ยมยก (พับขึ้น)", form: "2 บาน", src: fromCheck("บานเฟี้ยมยก"), sizes: sizesOf("fold_lift"), recipe: R("fold_lift", { form: "มาตรฐาน" }) },
  { spec: "gate_slide", title: "ประตูรั้วบานเลื่อน", form: "ใบระแนง", src: fromCheck("ประตูรั้ว · ระแนง"), sizes: sizesOf("gate", "· ระแนง"), recipe: R("gate", { form: "ตั้ง", spec: { gslat: "ระแนง" } }) },
  { spec: "gate_slide", title: "ประตูรั้วบานเลื่อน", form: "ใบระแนงสลับ", src: fromCheck("ประตูรั้ว · ระแนงสลับ"), sizes: sizesOf("gate", "ระแนงสลับ"), recipe: R("gate", { form: "ตั้ง", spec: { gslat: "ระแนงสลับ" } }) },
  { spec: "louver_panel", title: "บานระแนง", form: "ใบระแนง", src: borrow("ระแนงบังตา"), sizes: sizesOf("louver", "1x4"), input: (s) => ({ W: s.w, H: s.h, N: 1, slatType: "ระแนง" }) },
  { spec: "louver_panel", title: "บานระแนง", form: "ใบระแนงสลับ", src: borrow("ระแนงสลับ"), sizes: sizesOf("louver_slip"), input: (s) => ({ W: s.w, H: s.h, N: 1, slatType: "ระแนงสลับ" }) },
  { spec: "awning", title: "หลังคากันสาดเพิง", form: "แผ่นไวนิล", src: fromCheck("หลังคา · ไวนิล") + " (กว้าง × ยื่น)", sizes: sizesOf("roof"), recipe: R("roof", { form: "หลังคาเพิง", material: "ไวนิล" }) },
  { spec: "awning_l", title: "หลังคากันสาด ตัวแอล", form: "แผ่นไวนิล · มุมยุบ", src: borrow("หลังคา · ไวนิล (ผนัง A = กว้าง · ผนัง B = 3/4 ของกว้าง · ยื่นเท่ากัน)"), sizes: sizesOf("roof"),
    input: (s) => ({ W: 0, H: 0, N: 1, shape: "ตัวแอล", LA: s.w, LB: Math.round(s.w * 0.75), PA: s.h, PB: s.h }) },
  { spec: "awning_multi", title: "หลังคากันสาดหลายด้าน", form: "2 ด้าน · แผ่นไวนิล", src: borrow("หลังคา · ไวนิล (ด้าน 1 = กว้าง · ด้าน 2 = 3/4 ของกว้าง)"), sizes: sizesOf("roof"),
    recipe: (s) => R("roof_multi", { material: "ไวนิล", spec: { side1W: s.w, side1P: s.h, side2W: Math.round(s.w * 0.75), side2P: s.h } })(s) },
  { spec: "gable_straight", title: "หลังคาจั่วตรง", form: "แผ่นไวนิล", src: fromCheck("หลังคาจั่ว · ไวนิล") + " (กว้าง × ยาว)", sizes: sizesOf("roof_gable"), recipe: R("roof_gable", { form: "หลังคาจั่ว", material: "ไวนิล" }) },
  { spec: "gable_multi", title: "หลังคาจั่วหลายด้าน", form: "2 ด้าน · แผ่นไวนิล", src: borrow("หลังคาจั่ว (ด้าน 1 = กว้าง · ด้าน 2 = 3/4 ของกว้าง)"), sizes: sizesOf("roof_gable"),
    recipe: (s) => R("gable_multi", { material: "ไวนิล", spec: { side1D: s.w, side2D: Math.round(s.w * 0.75) } })(s) },
  { spec: "glasshouse", title: "กลาสเฮ้าส์", form: "เพิงตรง · แผ่นไวนิล", src: borrow("หลังคา · ไวนิล (กว้าง × ยื่น)"), sizes: sizesOf("roof"), recipe: R("glasshouse", { form: "กลาสเฮ้าส์", material: "ไวนิล" }) },
  { spec: "glasshouse_multi", title: "กลาสเฮ้าส์หลายด้าน", form: "2 ด้าน · แผ่นไวนิล", src: borrow("หลังคา · ไวนิล (ด้าน 1 = กว้าง · ด้าน 2 = 3/4 ของกว้าง)"), sizes: sizesOf("roof"),
    recipe: (s) => R("glasshouse_multi", { material: "ไวนิล", spec: { side1W: s.w, side1P: s.h, side2W: Math.round(s.w * 0.75), side2P: s.h } })(s) },
];

// ── คิดใบตัด ──
type Page = { c: Case; form: string; tag: string; sz: Sz; spec: CutSpec; input: Record<string, any>; sets: number; res: CutResult };
const pages: Page[] = [];
const problems: string[] = [];
for (const c of cases) {
  const spec = CUT_SPEC_BY_ID[c.spec];
  if (!spec) { problems.push("ไม่มีใบตัด " + c.spec); continue; }
  c.sizes.forEach((sz, i) => {
    let input: Record<string, any>; let sets = 1;
    if (c.recipe) {
      const m = cutInputFromRecipe(c.recipe(sz), { rawCompare: true });
      if (!m) { problems.push(`${c.title} ${c.form} ${sz.w}×${sz.h}/${sz.p}: เว็บแปลงเป็นใบตัดไม่ได้ (ข้าม)`); return; }
      if (m.spec_id !== c.spec) { problems.push(`${c.title} ${c.form}: ได้ ${m.spec_id} ไม่ใช่ ${c.spec} (ข้าม)`); return; }
      input = m.input; sets = m.multiplier ?? 1;
    } else input = c.input!(sz);
    if (c.spec === "sms240_bifold" && !spec.rails.includes(String(input.rail))) { problems.push(`${c.title}: ไม่มีแบบพับ ${input.rail} (ข้าม)`); return; }
    const full = { ...spec.defaults, ...input };
    const res = computeCutList(spec, full, sets);
    const form = c.form || String(c.recipe?.(sz)?.form ?? "").replace(/^\d+บาน:\s*/, "") || String(full.rail ?? "");
    pages.push({ c, form, tag: i === 0 ? "ขนาดกลาง" : "ขนาดใหญ่", sz, spec, input: full, sets, res });
  });
}

// ── หน้าตา ──
const esc = (s: unknown) => String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
const num = (x: number) => (Math.round(x * 10) / 10).toLocaleString("en-US", { maximumFractionDigits: 1 });
const DIM: [string, string, string][] = [
  ["W", "กว้าง", "ซม."], ["H", "สูง", "ซม."], ["N", "จำนวนบาน", "บาน"], ["P", "ยื่น", "ซม."], ["D", "ยื่น/ยาว", "ซม."],
  ["drop", "สูงตก", "ซม."], ["ridgeH", "สูงสัน", "ซม."], ["hiH", "สูงฝั่งชนบ้าน", "ซม."], ["loH", "สูงฝั่งหน้า", "ซม."],
  ["WA", "ผนัง A กว้าง", "ซม."], ["nA", "ผนัง A", "บาน"], ["WB", "ผนัง B กว้าง", "ซม."], ["nB", "ผนัง B", "บาน"],
  ["LA", "ยาวผนัง A", "ซม."], ["PA", "ยื่น A", "ซม."], ["LB", "ยาวผนัง B", "ซม."], ["PB", "ยื่น B", "ซม."],
  ["L", "พับไปซ้าย", "บาน"], ["motherW", "บานแม่กว้าง", "ซม."], ["glass", "กระจกหนา", "มม."],
  ...[1, 2, 3, 4, 5, 6].flatMap((i) => [[`side${i}W`, `ด้าน ${i} กว้าง`, "ซม."], [`side${i}P`, `ด้าน ${i} ยื่น`, "ซม."], [`side${i}D`, `ด้าน ${i} ยาว`, "ซม."]] as [string, string, string][]),
];
const isRoof = (id: string) => /awning|gable|glasshouse/.test(id);
function dims(p: Page) {
  const o = p.input, out: string[] = [];
  for (const [k, lab, u] of DIM) {
    const v = Number(o[k]);
    if (!Number.isFinite(v) || v <= 0) continue;
    if (k === "W" && (p.c.spec === "euro_bifold_corner" || /multi/.test(p.c.spec) || p.c.spec === "awning_l")) continue;
    if (k === "N" && (isRoof(p.c.spec) || p.c.spec === "euro_bifold_corner" || p.c.spec === "gate_slide" || p.c.spec === "louver_panel")) continue;
    if (k === "H" && isRoof(p.c.spec)) continue;
    if (k === "glass" && v < 0) continue;
    out.push(`<span class="dim"><i>${lab}</i><b>${num(v)}</b><u>${u}</u></span>`);
  }
  return out.join("");
}
function optsLine(p: Page) {
  const o = p.input, out: string[] = [];
  if (p.spec.rails.length && o.rail) out.push(`<span class="opt"><i>ราง/แบบ</i>${esc(o.rail)}</span>`);
  const noMesh = !o.mesh || o.mesh === "ไม่มี" || o.mesh === "ไม่ใส่";
  for (const op of p.spec.opts ?? []) {
    if (op.type === "number" || DIM.some((d) => d[0] === op.key)) continue;
    if (/^mesh(Handle|Count)/.test(op.key) && noMesh) continue;
    if (/^joint/.test(op.key)) { const i = Number(op.key.slice(5)); if (!(Number(o[`side${i + 1}W`]) > 0 || Number(o[`side${i + 1}D`]) > 0)) continue; }
    const v = o[op.key];
    if (v == null || v === "") continue;
    out.push(`<span class="opt"><i>${esc(op.label)}</i>${esc(v)}</span>`);
  }
  return out.join("");
}
// รูปร่างคร่าว ๆ (บาน = กรอบแบ่งตามจำนวนบาน · หลังคา = มองจากบน กว้าง × ยื่น)
function sketch(p: Page) {
  const o = p.input, id = p.c.spec;
  let w = Number(o.W), h = Number(o.H), n = Math.max(1, Number(o.N) || 1), lw = "กว้าง", lh = "สูง";
  if (id === "euro_bifold_corner") return "";
  if (isRoof(id)) {
    if (/multi/.test(id) || id === "awning_l") return "";
    h = Number(o.P || o.D); lh = id === "gable_straight" ? "ยาว" : "ยื่น"; n = 1;
  }
  if (id === "velora_swing" || id === "fuji_swing" || id === "fuji_door" || id === "fuji_fix" || id === "fixed_panel" && n === 1) n = Math.max(1, n);
  if (!(w > 0 && h > 0)) return "";
  const BW = 150, BH = 110, s = Math.min(BW / w, BH / h), rw = w * s, rh = h * s, x0 = 30 + (BW - rw) / 2, y0 = 14 + (BH - rh) / 2;
  const lines = Array.from({ length: n - 1 }, (_, i) => { const x = x0 + (rw * (i + 1)) / n; return `<line x1="${x}" y1="${y0}" x2="${x}" y2="${y0 + rh}" class="sk-div"/>`; }).join("");
  return `<svg class="sketch" viewBox="0 0 190 140" aria-hidden="true">
    <rect x="${x0}" y="${y0}" width="${rw}" height="${rh}" class="sk-box"/>${lines}
    <text x="${x0 + rw / 2}" y="${y0 - 3}" class="sk-t" text-anchor="middle">${lw} ${num(w)}</text>
    <text x="${x0 - 4}" y="${y0 + rh / 2}" class="sk-t" text-anchor="end" dominant-baseline="middle">${lh} ${num(h)}</text>
    ${n > 1 ? `<text x="${x0 + rw / 2}" y="${y0 + rh + 11}" class="sk-s" text-anchor="middle">${n} บาน</text>` : ""}
  </svg>`;
}
const pcs = (p: Page) => p.res.rows.filter((r) => r.qty > 0 && r.len > 0);
// แบ่งรายการเป็น 2 คอลัมน์ซ้าย-ขวา เมื่อยาว (ให้ลง 1 หน้าโดยตัวไม่เล็กลง)
const unsure = (note?: string) => !!note && /⏳|สมมติ|รอเจ้าของ|ยังไม่|เดา/.test(note);
const flag = (note?: string) => (unsure(note) ? ` <span class="flag">⚠ ช่วยดูพิเศษ เว็บยังไม่แน่ใจ</span>` : "");
const halves = <T,>(a: T[], min: number): T[][] => (a.length > min ? [a.slice(0, Math.ceil(a.length / 2)), a.slice(Math.ceil(a.length / 2))] : [a]);
function pageHtml(p: Page, idx: number, total: number) {
  const rows = pcs(p);
  const aluCols = halves(rows.map((r, i) => ({ r, i })), 13);
  const aluTable = (part: { r: (typeof rows)[number]; i: number }[]) => `<table class="t alu"><colgroup><col class="c-n"><col><col class="c-len"><col class="c-q"><col class="c-ck"><col class="c-fix"></colgroup>
    <thead><tr><th>#</th><th>ชื่อเส้น · รหัส</th><th class="r">ยาวตัด ซม.</th><th class="r">กี่ท่อน</th><th>ถูก</th><th>แก้เป็น</th></tr></thead><tbody>${part.map(({ r, i }) => `<tr>
      <td class="n">${i + 1}</td>
      <td class="nm">${esc(r.name)}<small>${esc(r.code === "-" ? "" : r.code)}</small>${flag(r.note)}</td>
      <td class="len">${num(r.len)}</td>
      <td class="qty">${r.qty}</td>
      <td class="ck"><span class="box"></span></td><td class="fix"></td></tr>`).join("")}</tbody></table>`;
  const aluHtml = rows.length ? `<div class="cols${aluCols.length > 1 ? " two" : ""}">${aluCols.map(aluTable).join("")}</div>` : `<div class="empty">— ไม่มีเส้นอลู —</div>`;
  // หลายเส้นใช้รหัสเดียวกัน (เช่น กรอบตั้ง+กรอบขวาง = F7972) → บอกว่ารวมกี่ชนิด ไม่ให้ช่างเข้าใจว่าเป็นของชิ้นเดียว
  const nameOfCode = (code: string) => { const ns = [...new Set(rows.filter((r) => r.code === code).map((r) => r.name))]; return ns.length > 1 ? `${ns[0]} +อีก ${ns.length - 1}` : ns[0] ?? ""; };
  const bars = p.res.barsByCode.map((b) => `<div class="bar"><span class="box"></span><div class="bar-t"><b>${esc(nameOfCode(b.code))}</b><small>${esc(b.code)} · ใช้จริง ${num(b.totalLenCm / 100)} ม.</small></div><div class="bar-q"><b>${b.bars}</b> เส้น<small>เส้นยาว ${num(b.stockLen / 100)} ม.</small></div></div>`).join("");
  const hwCols = halves(p.res.hardware.map((h, i) => ({ h, i })), 8);
  const hwTable = (part: { h: CutResult["hardware"][number]; i: number }[]) => `<table class="t hw"><colgroup><col class="c-n"><col><col class="c-q2"><col class="c-ck"><col class="c-fix2"></colgroup>
    <thead><tr><th>#</th><th>ชื่ออุปกรณ์ · รหัส</th><th class="r">จำนวน</th><th>ถูก</th><th>แก้เป็น</th></tr></thead><tbody>${part.map(({ h, i }) => `<tr>
      <td class="n">${i + 1}</td>
      <td class="nm">${esc(h.name)}<small>${esc(h.sku)}${h.noStock ? " · ซื้อแยก/สั่งตามงาน" : ""}</small>${flag(h.note)}</td>
      <td class="qty">${num(h.qty)} <span class="u">${esc(h.unit)}</span></td>
      <td class="ck"><span class="box"></span></td><td class="fix"></td></tr>`).join("")}</tbody></table>`;
  const hwHtml = p.res.hardware.length ? `<div class="cols${hwCols.length > 1 ? " two" : ""}">${hwCols.map(hwTable).join("")}</div>` : `<div class="empty">— ไม่มีอุปกรณ์ —</div>`;
  const setsNote = p.sets > 1 ? `<div class="warn">ใบตัดรุ่นนี้คิดทีละบาน — ตัวเลขข้างล่างคูณ ${p.sets} บานแล้ว (บานละ ${num(Number(p.input.W))} ซม.)</div>` : "";
  return `<section class="page"><div class="fit">
  <header class="top">
    <div class="ttl"><div class="eyebrow">ใบตรวจใบตัด · ${p.tag}</div><h1>${esc(p.c.title)}</h1><div class="form">${esc(p.form)}</div></div>
    <div class="pg">หน้า ${idx}/${total}</div>
  </header>
  <div class="spec">
    <div class="spec-l"><div class="dims">${dims(p)}</div><div class="opts">${optsLine(p)}</div><div class="src">${esc(p.c.src)}</div>${setsNote}</div>
    ${sketch(p)}
  </div>
  <h2>① ตัดเส้นอลู <em>${rows.length} รายการ · ยาวตัด = ซม. ต่อท่อน</em></h2>
  ${aluHtml}
  ${bars ? `<h2>② เบิกเส้นเต็มจากสโตร์ <em>รวม ${p.res.barsByCode.reduce((s, b) => s + b.bars, 0)} เส้น · ถูกติ๊ก ผิดเขียนข้าง ๆ</em></h2><div class="bars">${bars}</div>` : ""}
  <h2>③ อุปกรณ์ <em>${p.res.hardware.length} รายการ</em></h2>
  ${hwHtml}
  <div class="more"><div class="more-h">ของที่ขาด / เกิน / ตัดไม่ได้จริง (เขียนเพิ่ม)</div><div class="ln"></div><div class="ln"></div></div>
  <footer class="sign"><span>ผู้ตรวจ ...................................................</span><span>วันที่ ............................</span><span>ผล ☐ ถูกทั้งหน้า &nbsp; ☐ มีแก้</span></footer>
  </div></section>`;
}

const idxRows = pages.map((p, i) => `<tr><td class="n">${i + 2}</td><td>${esc(p.c.title)}<small>${esc(p.form)}</small></td><td>${p.tag.replace("ขนาด", "")}</td><td class="r">${p.c.spec === "euro_bifold_corner" ? `ผนังละ ${num(p.sz.w)} · ${p.sz.p} บาน` : isRoof(p.c.spec) ? `${num(p.sz.w)} × ยื่น ${num(p.sz.h)}` : `${num(p.sz.w)} × ${num(p.sz.h)} · ${p.sz.p} บาน`}</td></tr>`).join("");
const cover = `<section class="page cover"><div class="fit">
  <div class="eyebrow">JR อลูมิเนียม · ทดสอบใบตัดจากเว็บ</div>
  <h1 class="big">ใบตรวจใบตัด / BOQ</h1>
  <p class="lead">ตัวเลขทุกหน้าออกจาก <b>ระบบใบตัดในเว็บ</b> ตรง ๆ — ขอให้ช่างดูว่า ตัดยาวเท่านี้ กี่ท่อน อุปกรณ์ครบไหม ถ้าทำจริงจะถูกหรือผิด</p>
  <ol class="steps">
    <li>ดูขนาดบานกับรูปแบบบนหัวกระดาษ</li>
    <li>ไล่ทีละบรรทัด ถูก <b>ติ๊ก ✓</b> · ผิด <b>เขียนตัวเลขที่ถูก</b> ในช่อง "แก้เป็น"</li>
    <li>ของที่ขาด หรือที่เว็บใส่เกิน เขียนในกรอบท้ายหน้า</li>
    <li>เซ็นชื่อ ลงวันที่ ทุกหน้า</li>
  </ol>
  <p class="small">${pages.length} หน้า (${cases.length} รูปแบบ × 2 ขนาด) · สีอบขาว · กระจกเขียว 6 มม. · ตัวเลือกอื่นใช้ค่าตั้งต้นของเว็บ · ขนาดเอามาจากใบตรวจราคา รุ่นที่ใบตรวจราคาไม่มี ยืมขนาดรุ่นที่ใกล้เคียง (เขียนบอกไว้ทุกหน้า) · พิมพ์ ${new Date().toLocaleDateString("th-TH", { day: "numeric", month: "short", year: "numeric" })}</p>
  <div class="idx2">${halves(idxRows.split("</tr>").filter(Boolean).map((r) => r + "</tr>"), 0).map((part) => `<table class="t idx"><colgroup><col class="c-n"><col><col class="c-tag"><col class="c-sz"></colgroup><thead><tr><th>หน้า</th><th>รุ่น · รูปแบบ</th><th>ขนาด</th><th class="r">กว้าง × สูง</th></tr></thead><tbody>${part.join("")}</tbody></table>`).join("")}</div>
</div></section>`;

const total = pages.length + 1;
const html = `<!doctype html><html lang="th"><head><meta charset="utf-8"><title>ใบตรวจใบตัด BOQ</title><style>
@page { size: A4; margin: 0; }
:root { --ink:#1b1a19; --mut:#5c5853; --line:#c9c4bd; --soft:#f1eee9; --acc:#8a1f24; }
* { box-sizing: border-box; }
body { margin:0; font-family: "Leelawadee UI", Tahoma, sans-serif; color: var(--ink); background:#fff; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
.page { width:210mm; height:297mm; padding:9mm 10mm 8mm; overflow:hidden; page-break-after:always; position:relative; }
.fit { font-size: 10.5pt; line-height: 1.3; transform-origin: top left; }
.top { display:flex; justify-content:space-between; align-items:flex-start; border-bottom: 2.4pt solid var(--acc); padding-bottom: 2mm; }
.eyebrow { font-size:.78em; letter-spacing:.06em; color: var(--acc); font-weight:700; }
h1 { margin:.5mm 0 0; font-size: 1.85em; line-height:1.1; text-wrap: balance; }
.form { font-size:1.12em; font-weight:600; color:#333; }
.pg { font-size:.85em; color: var(--mut); white-space:nowrap; }
.spec { display:flex; gap:4mm; align-items:flex-start; margin-top:2.5mm; }
.spec-l { flex:1; }
.dims { display:flex; flex-wrap:wrap; gap:1.5mm; }
.dim { display:inline-flex; align-items:baseline; gap:1.2mm; background: var(--soft); border-radius:2mm; padding:1mm 2.4mm; }
.dim i { font-style:normal; font-size:.82em; color: var(--mut); }
.dim b { font-size:1.35em; font-variant-numeric: tabular-nums; }
.dim u { text-decoration:none; font-size:.8em; color: var(--mut); }
.opts { margin-top:1.6mm; display:flex; flex-wrap:wrap; gap:1mm 3mm; font-size:.86em; }
.opt i { font-style:normal; color: var(--mut); margin-right:1mm; }
.opt i::after { content:":"; }
.src { margin-top:1.4mm; font-size:.76em; color: var(--mut); }
.warn { margin-top:1.4mm; font-size:.85em; font-weight:700; color: var(--acc); }
.sketch { width:40mm; height:29mm; flex:none; }
.sk-box { fill:#fafafa; stroke: var(--ink); stroke-width:1.6; }
.sk-div { stroke: var(--ink); stroke-width:1; stroke-dasharray:3 2; }
.sk-t { font: 600 9px "Leelawadee UI", Tahoma; fill: var(--ink); }
.sk-s { font: 8px "Leelawadee UI", Tahoma; fill: var(--mut); }
.how { margin:2.4mm 0 1mm; font-size:.82em; color:#333; background:#fbf6e9; border:0.6pt solid #e6d6a8; border-radius:1.5mm; padding:1mm 2.4mm; }
h2 { font-size:1.08em; margin:2.6mm 0 1mm; display:flex; gap:2mm; align-items:baseline; }
h2 em { font-style:normal; font-weight:400; font-size:.8em; color: var(--mut); }
.t { width:100%; border-collapse:collapse; table-layout:fixed; }
.t th { font-size:.78em; font-weight:700; color:#333; text-align:left; background: var(--soft); padding:1mm 1.4mm; border-bottom:0.8pt solid var(--line); }
.t td { padding:.55mm 1.2mm; border-bottom:0.5pt solid var(--line); vertical-align:middle; }
.t .r, .t td.len, .t td.qty { text-align:right; }
.t td.n { color: var(--mut); font-size:.85em; }
.t td.nm { line-height:1.15; } .t td.nm small { display:block; font-size:.72em; color: var(--mut); line-height:1.15; }
.t td.cd { font-size:.82em; color:#333; font-variant-numeric: tabular-nums; word-break:break-all; }
.t td.len { font-size:1.22em; font-weight:700; font-variant-numeric: tabular-nums; }
.t td.qty { font-size:1.22em; font-weight:700; font-variant-numeric: tabular-nums; }
.t td.u { font-size:.88em; }
.t td.sm { font-size:.85em; color: var(--mut); }
.t td.ck { text-align:center; }
.box { display:inline-block; width:4.2mm; height:4.2mm; border:1pt solid var(--ink); border-radius:.6mm; vertical-align:middle; }
.t td.fix { border-left:0.5pt dashed var(--line); }
.t td.empty { color: var(--mut); text-align:center; }
col.c-n { width:6mm } col.c-len { width:20mm } col.c-q { width:13mm } col.c-q2 { width:20mm } col.c-ck { width:8mm } col.c-fix { width:24mm } col.c-fix2 { width:22mm }
.cols.two { display:grid; grid-template-columns: 1fr 1fr; gap:3mm; }
.cols.two col.c-fix, .cols.two col.c-fix2 { width:14mm } .cols.two col.c-len { width:16mm } .cols.two col.c-q { width:10mm } .cols.two col.c-q2 { width:17mm }
.cols.two .t td.len, .cols.two .t td.qty { font-size:1.1em; }
.t .u { font-size:.75em; font-weight:400; color: var(--mut); }
.bars { display:grid; grid-template-columns: repeat(3, 1fr); gap:1.4mm; }
.bar { display:flex; align-items:center; gap:1.6mm; border:0.6pt solid var(--line); border-radius:1.5mm; padding:.9mm 1.6mm; }
.bar-t { flex:1; min-width:0; line-height:1.15; }
.bar-t b { display:block; font-size:.86em; font-weight:600; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
.bar-t small, .bar-q small { display:block; font-size:.68em; color: var(--mut); white-space:nowrap; }
.bar-q { text-align:right; font-size:.8em; line-height:1.1; }
.bar-q b { font-size:1.55em; font-variant-numeric: tabular-nums; }
.empty { color: var(--mut); font-size:.9em; }
.more { margin-top:2.6mm; border:0.8pt solid var(--line); border-radius:1.5mm; padding:1.2mm 2.4mm 1.6mm; }
.more-h { font-size:.82em; font-weight:700; color:#333; }
.ln { border-bottom:0.6pt dotted #999; height:6mm; }
.sign { display:flex; justify-content:space-between; gap:3mm; margin-top:3mm; font-size:.88em; }
.cover .big { font-size:2.6em; margin:2mm 0 3mm; }
.cover .lead { font-size:1.12em; max-width:62ch; }
.cover .steps { font-size:1.05em; padding-left:6mm; margin:2mm 0 3mm; }
.cover .steps li { margin:.8mm 0; }
.cover .small { font-size:.8em; color: var(--mut); max-width:80ch; }
.idx2 { display:grid; grid-template-columns:1fr 1fr; gap:3mm; margin-top:3mm; }
.t.idx { font-size:.74em; } col.c-tag { width:9mm } col.c-sz { width:26mm }
.t.idx td small { display:block; font-size:.85em; color: var(--mut); }
.flag { display:inline-block; font-size:.68em; font-weight:700; color:#9a5b00; background:#fff3d6; border-radius:1mm; padding:0 1mm; }
.t.idx td { padding:.3mm 1.2mm; line-height:1.15; }
</style></head><body>${cover}${pages.map((p, i) => pageHtml(p, i + 2, total)).join("")}</body></html>`;

fs.mkdirSync("docs", { recursive: true });
const tmp = "docs/_boq-check.html";
fs.writeFileSync(tmp, html, "utf8");
const browser = await chromium.launch();
const page = await browser.newPage();
await page.goto("file:///" + process.cwd().replace(/\\/g, "/") + "/" + tmp, { waitUntil: "load" });
// ย่อตัวอักษรทีละนิดจนลง 1 หน้า (หน้าที่รายการเยอะ) — ต่ำสุด 7pt
const fitLog = await page.evaluate(() => {
  const out: string[] = [];
  document.querySelectorAll<HTMLElement>(".page").forEach((pg, i) => {
    const fit = pg.querySelector<HTMLElement>(".fit")!;
    const avail = pg.clientHeight - 17 * 3.78;   // padding บน+ล่าง ≈ 17 มม.
    let fs = 10.5;
    while (fit.scrollHeight > avail && fs > 8.5) { fs -= 0.25; fit.style.fontSize = fs + "pt"; }
    if (fit.scrollHeight > avail) {
      const k = avail / fit.scrollHeight; fit.style.transform = `scale(${k})`; fit.style.width = 100 / k + "%";
      out.push(`หน้า ${i + 1}: ย่อ scale ${k.toFixed(2)}`);
    } else if (fs < 10.5) out.push(`หน้า ${i + 1}: ${fs}pt`);
  });
  return out;
});
await page.pdf({ path: OUT, format: "A4", printBackground: true, margin: { top: "0", bottom: "0", left: "0", right: "0" } });
const nPdf = (await page.evaluate(() => document.querySelectorAll(".page").length));
await browser.close();
if (!process.argv.includes("--keep-html")) fs.unlinkSync(tmp);
console.log(OUT, "· หน้า", nPdf, "(รูปแบบ", cases.length, "· หน้าใบตัด", pages.length, ")");
if (fitLog.length) console.log("ย่อตัวอักษร:", fitLog.join(" · "));
if (problems.length) console.log("ข้าม:\n  " + problems.join("\n  "));
