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

// ── หน้าตา (รอบ 2 · เจ้าของ 14 พ.ย.69: รวมตารางตัด+เบิกเส้น · เขียนยาวเส้น · วาดสัญลักษณ์เปิด/เลื่อน · ตัวหนังสือน้อย · ไม่เอาสารบัญ · มีรูปหน้าตัด) ──
const IMG: Record<string, string> = JSON.parse(fs.readFileSync("scripts/fixtures/profile-images.json", "utf8"));
const imgSrc = (code: string) => { const u = IMG[code]; return !u ? "" : u.startsWith("/") ? "file:///" + process.cwd().replace(/\\/g, "/") + "/public" + u : u; };
const esc = (s: unknown) => String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
const num = (x: number) => (Math.round(x * 10) / 10).toLocaleString("en-US", { maximumFractionDigits: 1 });
const isRoof = (id: string) => /awning|gable|glasshouse/.test(id);

// ขนาดบนหัวกระดาษ — เฉพาะตัวที่ใช้ตัดจริง
const DIM: [string, string][] = [
  ["W", "กว้าง"], ["H", "สูง"], ["P", "ยื่น"], ["D", "ยาว"], ["ridgeH", "สูงสัน"], ["hiH", "สูงชนบ้าน"], ["loH", "สูงหน้า"],
  ["WA", "ผนัง A"], ["WB", "ผนัง B"], ["LA", "ผนัง A"], ["PA", "ยื่น A"], ["LB", "ผนัง B"], ["PB", "ยื่น B"],
  ...[1, 2, 3, 4, 5, 6].flatMap((i) => [[`side${i}W`, `ด้าน ${i} กว้าง`], [`side${i}P`, `ด้าน ${i} ยื่น`], [`side${i}D`, `ด้าน ${i} ยาว`]] as [string, string][]),
];
function dims(p: Page) {
  const o = p.input, id = p.c.spec, out: string[] = [];
  for (const [k, lab] of DIM) {
    const v = Number(o[k]);
    if (!Number.isFinite(v) || v <= 0) continue;
    if (k === "W" && (id === "euro_bifold_corner" || /multi/.test(id) || id === "awning_l")) continue;
    if (k === "H" && isRoof(id)) continue;
    out.push(`<span class="dim">${lab} <b>${num(v)}</b></span>`);
  }
  const n = Number(o.N);
  if (id === "euro_bifold_corner") out.push(`<span class="dim">บาน <b>${o.nA}+${o.nB}</b></span>`);
  else if (!isRoof(id) && !["gate_slide", "louver_panel"].includes(id) && n > 0) out.push(`<span class="dim"><b>${p.sets > 1 ? p.sets : n}</b> บาน</span>`);
  return out.join("");
}
// ตัวเลือกที่เปลี่ยนการตัดเท่านั้น (มือจับ/สี ไม่โชว์ — ตัวหนังสือน้อย)
const KEEP = new Set(["sys", "fit", "work", "box", "solidLayer", "doorSplit", "slatDir", "slatType", "foldSill", "sheet", "purlin", "roofEnd", "beam", "sill"]);
function optsLine(p: Page) {
  const o = p.input, out: string[] = [];
  if (p.spec.rails.length && o.rail && p.c.spec !== "sms240_bifold") out.push(esc(o.rail));
  for (const op of p.spec.opts ?? []) if (KEEP.has(op.key) && o[op.key]) out.push(esc(o[op.key]));
  return out.join(" · ");
}

// ── รูปบาน + สัญลักษณ์การเปิด (มองจากด้านนอก) ──
type Kind = "slide" | "swing" | "fold" | "up" | "fixed" | "plain";
function moveOf(p: Page): { kind: Kind; panes: string[]; widths?: number[] } {
  const o = p.input, id = p.c.spec, n = Math.max(1, Number(o.N) || 1);
  const all = (s: string) => Array(n).fill(s);
  const center = () => all("").map((_, i) => (i < n / 2 ? "L" : "R"));
  if (id === "sms_slide_center" || id === "fuji_slide_center") return { kind: "slide", panes: center().map((d, i) => (i === 0 || i === n - 1 ? "F" : d)) };
  if (id === "sms_slide_tow") return { kind: "slide", panes: all("L") };
  if (id === "slimlux_slide" || id === "toprail_frame") {
    const m = String(o.sashMode);
    return { kind: "slide", panes: m === "ลากจูง" ? all("L") : m === "เปิดคู่กลาง" ? center() : all("LR") };
  }
  if (["sms_slide_free", "fuji_slide", "fuji_slide_multi"].includes(id)) return { kind: "slide", panes: all("LR") };
  if (id === "gate_slide") return { kind: "slide", panes: ["L"] };
  if (id === "fuji_hung" || id === "euro_lift") return { kind: "up", panes: all(id === "euro_lift" ? "fold" : "") };
  if (id === "fixed_panel" || id === "fuji_fix") return { kind: "fixed", panes: all("F") };
  if (["velora_swing", "fuji_door", "fuji_swing"].includes(id)) return { kind: "swing", panes: ["hL"] };
  if (id === "fuji_door_double") return { kind: "swing", panes: ["hL", "hR"] };
  if (id === "solid_door" || id === "woodjamb_swing") {
    if (n === 1) return { kind: "swing", panes: ["hL"] };
    const W = Number(o.W), mw = /แม่/.test(String(o.doorSplit)) ? Number(o.motherW) || W / 2 : W / 2;
    return { kind: "swing", panes: ["hL", "hR"], widths: [mw, W - mw] };
  }
  if (id === "sms240_bifold" || id === "euro_bifold") {
    let L = 0;
    if (id === "euro_bifold") L = Number(o.L) || 0; else { const m = /(\d+)L(\d+)R/.exec(String(o.rail)); L = m ? Number(m[1]) : n; }
    return { kind: "fold", panes: all("").map((_, i) => (i < L ? "L" : "R")) };
  }
  return { kind: "plain", panes: all("") };
}
function sketch(p: Page) {
  const o = p.input, id = p.c.spec;
  if (id === "euro_bifold_corner" || /multi/.test(id) || id === "awning_l") return "";
  let w = Number(o.W), h = Number(o.H), lh = "สูง";
  const roof = isRoof(id);
  if (roof) { h = Number(o.P || o.D); lh = id === "gable_straight" ? "ยาว" : "ยื่น"; }
  if (p.sets > 1) w = w * p.sets;   // Velora ใบตัดทีละบาน — รูปโชว์ทั้งช่อง
  if (!(w > 0 && h > 0)) return "";
  const mv = roof ? { kind: "plain" as Kind, panes: [""] } : p.sets > 1 ? { kind: "swing" as Kind, panes: Array(p.sets).fill("").map((_, i) => (i % 2 ? "hR" : "hL")) } : moveOf(p);
  const BW = 160, BH = 104, s = Math.min(BW / w, BH / h), rw = w * s, rh = h * s, x0 = 34 + (BW - rw) / 2, y0 = 14 + (BH - rh) / 2;
  const n = mv.panes.length;
  const ws = mv.widths ? mv.widths.map((x) => (x / w) * rw) : Array(n).fill(rw / n);
  const xs: number[] = []; ws.reduce((a, x) => (xs.push(a), a + x), x0);
  const g: string[] = [];
  xs.slice(1).forEach((x) => g.push(`<line x1="${x}" y1="${y0}" x2="${x}" y2="${y0 + rh}" class="sk-div"/>`));
  const cy = y0 + rh / 2, ah = Math.min(9, rh * 0.12);
  const arrow = (x1: number, x2: number, y: number) => {
    const d = x2 > x1 ? 1 : -1;
    return `<line x1="${x1}" y1="${y}" x2="${x2}" y2="${y}" class="sk-mv"/><path d="M${x2} ${y} l${-d * ah} ${-ah * 0.6} l0 ${ah * 1.2} z" class="sk-ah"/>`;
  };
  mv.panes.forEach((pn, i) => {
    const a = xs[i], b = a + ws[i], m = (a + b) / 2, q = ws[i] * 0.3;
    if (mv.kind === "slide") {
      if (pn === "F") g.push(`<text x="${m}" y="${cy}" class="sk-f" text-anchor="middle" dominant-baseline="central">F</text>`);
      else if (pn === "L") g.push(arrow(m + q, m - q, cy));
      else if (pn === "R") g.push(arrow(m - q, m + q, cy));
      else g.push(arrow(m, m - q, cy), arrow(m, m + q, cy));
    } else if (mv.kind === "swing") {
      // เส้นประเปิด: ปลายแหลมอยู่ฝั่งบานพับ
      const hx = pn === "hL" ? a : b, fx = pn === "hL" ? b : a;
      g.push(`<path d="M${fx} ${y0} L${hx} ${cy} L${fx} ${y0 + rh}" class="sk-sw"/>`);
    } else if (mv.kind === "fold") {
      // พับ: ลายฟันปลาใต้กรอบ + ลูกศรไปทางที่รวบ
      const zy = y0 + rh + 3, up = i % 2 === 0;
      g.push(`<path d="M${a} ${up ? zy + 9 : zy} L${b} ${up ? zy : zy + 9}" class="sk-zz"/>`);
    } else if (mv.kind === "up") {
      g.push(`<line x1="${m}" y1="${cy + rh * 0.25}" x2="${m}" y2="${cy - rh * 0.25}" class="sk-mv"/><path d="M${m} ${cy - rh * 0.25} l${-ah * 0.6} ${ah} l${ah * 1.2} 0 z" class="sk-ah"/>`);
    } else if (mv.kind === "fixed") {
      g.push(`<text x="${m}" y="${cy}" class="sk-f" text-anchor="middle" dominant-baseline="central">F</text>`);
    }
  });
  if (mv.kind === "fold") {
    const nl = mv.panes.filter((x) => x === "L").length, nr = n - nl, ay = y0 + rh * 0.5;
    if (nl) g.push(arrow(x0 + rw * 0.3, x0 + 6, ay));
    if (nr) g.push(arrow(x0 + rw - rw * 0.3, x0 + rw - 6, ay));
  }
  return `<svg class="sketch" viewBox="0 0 200 ${mv.kind === "fold" ? 140 : 128}" aria-hidden="true">
    <rect x="${x0}" y="${y0}" width="${rw}" height="${rh}" class="sk-box"/>${g.join("")}
    <text x="${x0 + rw / 2}" y="${y0 - 3.5}" class="sk-t" text-anchor="middle">${num(w)}</text>
    <text x="${x0 - 4}" y="${y0 + rh / 2}" class="sk-t" text-anchor="end" dominant-baseline="middle">${num(h)}</text>
    ${roof ? `<text x="${x0 - 4}" y="${y0 + rh / 2 + 10}" class="sk-s" text-anchor="end">${lh}</text>` : ""}
  </svg>`;
}

const unsure = (note?: string) => !!note && /⏳|สมมติ|รอเจ้าของ|ยังไม่|เดา/.test(note);
const flag = (note?: string) => (unsure(note) ? ` <span class="flag">⚠ ดูพิเศษ</span>` : "");
const pcs = (p: Page) => p.res.rows.filter((r) => r.qty > 0 && r.len > 0);

// ตารางเดียว: รูปหน้าตัด · ชื่อเส้น · ยาวตัด · กี่ท่อน · เบิกกี่เส้น (ยาวเส้น) — เส้นรหัสเดียวกันรวมกลุ่ม
type Grp = { code: string; rows: CutResult["rows"]; bars?: CutResult["barsByCode"][number] };
function groupsOf(p: Page): Grp[] {
  const gs: Grp[] = [];
  for (const r of pcs(p)) {
    const key = r.code && r.code !== "-" ? r.code : "__" + gs.length;
    let g = gs.find((x) => x.code === key);
    if (!g) { g = { code: key, rows: [], bars: p.res.barsByCode.find((b) => b.code === r.code) }; gs.push(g); }
    g.rows.push(r);
  }
  return gs;
}
function aluTable(gs: Grp[], start: number) {
  let i = start;
  const body = gs.map((g) => g.rows.map((r, k) => {
    i++;
    const first = k === 0, span = g.rows.length;
    const src = first ? imgSrc(r.code) : "";
    return `<tr class="${first ? "g1" : ""}">
      ${first ? `<td class="img" rowspan="${span}">${src ? `<img src="${esc(src)}" alt="">` : ""}<small>${esc(g.code.startsWith("__") ? "" : g.code)}</small></td>` : ""}
      <td class="nm">${esc(r.name)}${flag(r.note)}</td>
      <td class="len">${num(r.len)}</td>
      <td class="qty">${r.qty}</td>
      ${first ? `<td class="bar" rowspan="${span}">${g.bars ? `<b>${g.bars.bars}</b><i> เส้น</i><small>ยาว ${num(g.bars.stockLen / 100)} ม.</small>` : "—"}</td>` : ""}
      <td class="ck"><span class="box"></span></td><td class="fix"></td></tr>`;
  }).join("")).join("");
  return `<table class="t alu"><colgroup><col class="c-img"><col><col class="c-len"><col class="c-q"><col class="c-bar"><col class="c-ck"><col class="c-fix"></colgroup>
    <thead><tr><th>หน้าตัด</th><th>ชื่อเส้น</th><th class="r">ยาวตัด<br>ซม.</th><th class="r">ท่อน</th><th class="c">เบิก</th><th>ถูก</th><th>แก้เป็น</th></tr></thead><tbody>${body}</tbody></table>`;
}
// แบ่ง 2 คอลัมน์ตามกลุ่ม เมื่อยาว
function splitGroups(gs: Grp[], limit: number): Grp[][] {
  const total = gs.reduce((s, g) => s + Math.max(g.rows.length, 2), 0);
  if (total <= limit) return [gs];
  let acc = 0, cut = gs.length;
  for (let k = 0; k < gs.length; k++) { acc += Math.max(gs[k].rows.length, 2); if (acc >= total / 2) { cut = k + 1; break; } }
  return [gs.slice(0, cut), gs.slice(cut)];
}
const halves = <T,>(a: T[], min: number): T[][] => (a.length > min ? [a.slice(0, Math.ceil(a.length / 2)), a.slice(Math.ceil(a.length / 2))] : [a]);

function pageHtml(p: Page, idx: number, total: number) {
  const gs = groupsOf(p);
  const two = splitGroups(gs, 0);
  const n1 = two[0].reduce((s, g) => s + g.rows.length, 0);
  const aluHtml = gs.length ? `<div class="cols one">${aluTable(gs, 0)}</div>${two.length > 1 ? `<div class="cols two alt">${aluTable(two[0], 0)}${aluTable(two[1], n1)}</div>` : ""}` : `<div class="empty">— ไม่มีเส้นอลู —</div>`;
  const totalBars = p.res.barsByCode.reduce((s, b) => s + b.bars, 0);
  const hwCols = halves(p.res.hardware, 5);
  const hwTable = (part: CutResult["hardware"]) => `<table class="t hw"><colgroup><col><col class="c-q2"><col class="c-ck"><col class="c-fix2"></colgroup>
    <thead><tr><th>อุปกรณ์</th><th class="r">จำนวน</th><th>ถูก</th><th>แก้เป็น</th></tr></thead><tbody>${part.map((h) => `<tr>
      <td class="nm">${esc(h.name)}${flag(h.note)}</td>
      <td class="qty">${num(h.qty)} <span class="u">${esc(h.unit)}</span></td>
      <td class="ck"><span class="box"></span></td><td class="fix"></td></tr>`).join("")}</tbody></table>`;
  const hwHtml = p.res.hardware.length ? `<div class="cols${hwCols.length > 1 ? " two" : ""}">${hwCols.map(hwTable).join("")}</div>` : `<div class="empty">— เว็บยังไม่มีรายการอุปกรณ์ —</div>`;
  const borrowed = /ยืมขนาด/.test(p.c.src);
  return `<section class="page"><div class="fit">
  <header class="top">
    <div class="ttl"><h1>${esc(p.c.title)}</h1><div class="form">${esc(p.form)}<span class="tag">${p.tag}</span></div>
      <div class="dims">${dims(p)}</div>
      ${optsLine(p) ? `<div class="opts">${optsLine(p)}</div>` : ""}
      ${borrowed ? `<div class="src">ขนาดสมมติ (ใบตรวจราคาไม่มีรุ่นนี้)</div>` : ""}
      ${p.sets > 1 ? `<div class="warn">ตัวเลขคูณ ${p.sets} บานแล้ว</div>` : ""}
    </div>
    ${sketch(p)}
  </header>
  <h2>เส้นอลู <em>เบิกรวม ${totalBars} เส้น</em></h2>
  ${aluHtml}
  <h2>อุปกรณ์</h2>
  ${hwHtml}
  <div class="more">ขาด / เกิน :</div>
  <footer class="sign"><span>ผู้ตรวจ ..............................................</span><span>วันที่ ......................</span><span class="pg">${idx}/${total}</span></footer>
  </div></section>`;
}

const total = pages.length;
const html = `<!doctype html><html lang="th"><head><meta charset="utf-8"><title>ใบตรวจใบตัด BOQ</title><style>
@page { size: A4; margin: 0; }
:root { --ink:#1b1a19; --mut:#6a655f; --line:#cbc6bf; --soft:#f1eee9; --acc:#8a1f24; }
* { box-sizing: border-box; }
body { margin:0; font-family: "Leelawadee UI", Tahoma, sans-serif; color: var(--ink); background:#fff; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
.page { width:210mm; height:297mm; padding:9mm 10mm 8mm; overflow:hidden; page-break-after:always; }
.fit { font-size: 11pt; line-height: 1.25; transform-origin: top left; }
.top { display:flex; justify-content:space-between; gap:4mm; align-items:flex-start; border-bottom: 2.4pt solid var(--acc); padding-bottom: 2mm; }
.ttl { flex:1; min-width:0; }
h1 { margin:0; font-size: 1.9em; line-height:1.1; }
.form { font-size:1.15em; font-weight:600; margin-top:.6mm; display:flex; gap:3mm; align-items:baseline; }
.tag { font-size:.75em; font-weight:700; color:#fff; background: var(--acc); border-radius:1.2mm; padding:.2mm 2mm; }
.dims { display:flex; flex-wrap:wrap; gap:1.4mm; margin-top:2mm; }
.dim { background: var(--soft); border-radius:1.6mm; padding:.8mm 2.4mm; font-size:.9em; color:#333; }
.dim b { font-size:1.35em; color: var(--ink); font-variant-numeric: tabular-nums; }
.opts { margin-top:1.5mm; font-size:.9em; color:#333; }
.src { margin-top:1mm; font-size:.78em; color: var(--mut); }
.warn { margin-top:1mm; font-size:.85em; font-weight:700; color: var(--acc); }
.sketch { width:58mm; flex:none; }
.sk-box { fill:#fbfbfa; stroke: var(--ink); stroke-width:1.6; }
.sk-div { stroke: var(--ink); stroke-width:1.1; }
.sk-mv { stroke: var(--acc); stroke-width:1.8; }
.sk-ah { fill: var(--acc); }
.sk-sw { fill:none; stroke: var(--acc); stroke-width:1.2; stroke-dasharray:4 2.5; }
.sk-zz { fill:none; stroke: var(--acc); stroke-width:1.4; }
.sk-f { font: 700 13px "Leelawadee UI", Tahoma; fill: var(--mut); }
.sk-t { font: 600 9.5px "Leelawadee UI", Tahoma; fill: var(--ink); }
.sk-s { font: 8px "Leelawadee UI", Tahoma; fill: var(--mut); }
h2 { font-size:1.12em; margin:2.6mm 0 1mm; display:flex; gap:3mm; align-items:baseline; }
h2 em { font-style:normal; font-weight:700; font-size:.85em; color: var(--acc); }
.t { width:100%; border-collapse:collapse; table-layout:fixed; }
.t th { font-size:.74em; font-weight:700; color:#444; text-align:left; background: var(--soft); padding:.8mm 1.2mm; border-bottom:0.8pt solid var(--line); line-height:1.1; }
.t th.r { text-align:right; } .t th.c { text-align:center; }
.t td { padding:.6mm 1.2mm; border-bottom:0.5pt solid var(--line); vertical-align:middle; }
.t tr.g1 td { border-top:0.9pt solid #9d978f; }
.t td.nm { line-height:1.15; }
.t td.len, .t td.qty { white-space:nowrap; text-align:right; font-size:1.25em; font-weight:700; font-variant-numeric: tabular-nums; }
.t td.img { text-align:center; padding:.6mm .6mm; border-right:0.5pt solid var(--line); }
.t td.img img { display:block; margin:0 auto; max-width:100%; max-height:12.5mm; object-fit:contain; }
.t td.img small { display:block; font-size:.62em; color: var(--mut); line-height:1.1; margin-top:.3mm; white-space:nowrap; overflow:hidden; text-overflow:clip; }
.t td.bar { text-align:center; border-left:0.5pt solid var(--line); background:#faf7f2; line-height:1.1; }
.t td.bar b { font-size:1.45em; font-variant-numeric: tabular-nums; }
.t td.bar small { display:block; font-size:.72em; color:#444; }
.t td.ck { text-align:center; }
.t td.fix { border-left:0.5pt dashed var(--line); }
.t .u { font-size:.7em; font-weight:400; color: var(--mut); }
.box { display:inline-block; width:4.2mm; height:4.2mm; border:1pt solid var(--ink); border-radius:.6mm; vertical-align:middle; }
col.c-img { width:26mm } col.c-len { width:17mm } col.c-q { width:11mm } col.c-bar { width:17mm } col.c-ck { width:8mm } col.c-fix { width:20mm }
col.c-q2 { width:19mm } col.c-fix2 { width:20mm }
.cols.alt { display:none !important; }
.cols.two { display:grid; grid-template-columns: 1fr 1fr; gap:3mm; }
.cols.two col.c-img { width:17mm } .cols.two col.c-len { width:13mm } .cols.two col.c-q { width:8mm } .cols.two col.c-bar { width:12mm } .cols.two .t td.bar i { display:none; } .cols.two .t td.bar small { font-size:.6em; white-space:nowrap; } .cols.two col.c-ck { width:6mm } .cols.two col.c-fix { width:11mm }
.cols.two col.c-q2 { width:16mm } .cols.two col.c-fix2 { width:13mm }
.cols.two .t td.len, .cols.two .t td.qty { font-size:1.08em; }
.cols.two .t td.nm { font-size:.88em; }
.cols.two .t td.img img { max-height:12mm; } .cols.two .t td.img small { font-size:.55em; }
.flag { display:inline-block; font-size:.66em; font-weight:700; color:#9a5b00; background:#fff3d6; border-radius:1mm; padding:0 1mm; white-space:nowrap; }
.empty { color: var(--mut); font-size:.9em; }
.more { margin-top:2.6mm; border:0.8pt solid var(--line); border-radius:1.5mm; padding:1mm 2.4mm; height:13mm; font-size:.85em; font-weight:700; color:#444; }
.sign { display:flex; justify-content:space-between; gap:3mm; margin-top:3mm; font-size:.9em; }
.sign .pg { color: var(--mut); }
</style></head><body>${pages.map((p, i) => pageHtml(p, i + 1, total)).join("")}</body></html>`;

fs.mkdirSync("docs", { recursive: true });
const tmp = "docs/_boq-check.html";
fs.writeFileSync(tmp, html, "utf8");
const browser = await chromium.launch();
const page = await browser.newPage();
await page.goto("file:///" + process.cwd().replace(/\\/g, "/") + "/" + tmp, { waitUntil: "networkidle" });
// ย่อตัวอักษรทีละนิดจนลง 1 หน้า (หน้าที่รายการเยอะ) — ต่ำสุด 7pt
const fitLog = await page.evaluate(() => {
  const out: string[] = [];
  document.querySelectorAll<HTMLElement>(".page").forEach((pg, i) => {
    const fit = pg.querySelector<HTMLElement>(".fit")!;
    const avail = pg.clientHeight - 17 * 3.78;   // padding บน+ล่าง ≈ 17 มม.
    let fs = 11;
    const one = pg.querySelector<HTMLElement>(".cols.one"), alt = pg.querySelector<HTMLElement>(".cols.alt");
    if (alt) {
      while (fit.scrollHeight > avail && fs > 10) { fs -= 0.25; fit.style.fontSize = fs + "pt"; }
      if (fit.scrollHeight > avail) { one!.remove(); alt.classList.remove("alt"); fs = 11; fit.style.fontSize = fs + "pt"; } else alt.remove();
    }
    while (fit.scrollHeight > avail && fs > 8.5) { fs -= 0.25; fit.style.fontSize = fs + "pt"; }
    if (fit.scrollHeight > avail) {
      const k = avail / fit.scrollHeight; fit.style.transform = `scale(${k})`; fit.style.width = 100 / k + "%";
      out.push(`หน้า ${i + 1}: ย่อ scale ${k.toFixed(2)}`);
    } else if (fs < 11) out.push(`หน้า ${i + 1}: ${fs}pt`);
  });
  return out;
});
if (process.argv.includes("--keep-html")) fs.writeFileSync(tmp, await page.content(), "utf8");   // เก็บหน้าหลังจัดแล้วไว้ดู
await page.pdf({ path: OUT, format: "A4", printBackground: true, margin: { top: "0", bottom: "0", left: "0", right: "0" } });
const nPdf = (await page.evaluate(() => document.querySelectorAll(".page").length));
await browser.close();
if (!process.argv.includes("--keep-html")) fs.unlinkSync(tmp);
console.log(OUT, "· หน้า", nPdf, "(รูปแบบ", cases.length, "· หน้าใบตัด", pages.length, ")");
if (fitLog.length) console.log("ย่อตัวอักษร:", fitLog.join(" · "));
if (problems.length) console.log("ข้าม:\n  " + problems.join("\n  "));
