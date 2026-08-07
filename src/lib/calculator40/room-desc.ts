/**
 * room-desc — ข้อความรายละเอียด "รายด้าน" ของห้องกระจก (G6) ที่ไปขึ้นใบเสนอราคา
 *
 * แยกออกจาก RoomComposer.tsx เพื่อให้เทสได้จริง (scripts/verify-room-desc.mjs)
 * — ของเดิมฝังอยู่ในคอมโพเนนต์ เทสไม่ได้ ต้องเปิดเว็บดูอย่างเดียว
 *
 * รูปแบบที่เจ้าของเคาะ 7 ส.ค.69:
 *   "ประตู/หน้าต่างก่อน → พื้นล่าง (ถ้าเป็นประตู) → มุ้ง → กระจกติดตายท้ายสุด → ขนาดรวมของด้าน"
 *   · ไม่ใส่ ":" หลังชื่อด้าน (เว้นวรรคแทน)
 *   · ไม่ใส่ชนิดกระจกในบรรทัดนี้ — ไปอยู่หัวข้อ "รายละเอียดงาน" ด้านล่างแล้ว จะซ้ำ
 *   · ไม่ใส่ขนาดรายบาน — ใช้ "ขนาดรวมของทั้งด้าน" แทน
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
import { PRODUCTS } from "./products.mjs";
// eslint-disable-next-line @typescript-eslint/no-explicit-any
import { mosquitoTypeLabel } from "./mosquito.mjs";

export type PaneUse = "door" | "window" | "fixed";
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type DescPane = { typeKey: string; form?: string; w: number; h: number; n: number; addons?: Record<string, any>; use?: PaneUse; sill?: string };
export type DescCol = { pcs: DescPane[] };
export type DescSide = { kind: "glass" | "wall" | "open"; cols?: DescCol[]; aw?: number; ah?: number };

const FIXED_IDS = new Set(["fixed", "curve_fixed"]);                                                                // ติดตายเสมอ
const DOOR_IDS = new Set(["pcdoor", "frameless_door", "pivot", "bansolid", "fold_euro", "folding", "fold_lift"]);    // เป็นประตูเสมอ
const SLIDE_IDS = new Set(["sms_slide", "euro_slide", "eseries", "slimlux", "topslide", "bar_slide"]);               // พื้นล่างเป็นราง
export const SILL_OPTS = ["รางล่าง", "มีธรณี", "ไม่มีธรณี"];

/** ประตู/หน้าต่าง/ติดตาย — ผู้ใช้เลือกเองได้ · ไม่เลือก = เดา (บานสูง ≥1.9ม. = ประตู) */
export function paneUse(p: DescPane): PaneUse {
  if (FIXED_IDS.has(p.typeKey)) return "fixed";
  if (p.use) return p.use;
  if (DOOR_IDS.has(p.typeKey)) return "door";
  return (p.h || 0) >= 1.9 ? "door" : "window";
}
export const defaultSill = (typeKey: string) => (SLIDE_IDS.has(typeKey) ? "รางล่าง" : "มีธรณี");
export const paneSill = (p: DescPane) => p.sill || defaultSill(p.typeKey);

export const ADDON_LABELS: Record<string, string> = {
  mosquito: "มุ้ง", grid: "คาดตาราง", cmech: "มือจับ CMECH", stainless: "สแตนเลส",
  digihandle: "มือจับดิจิตอล", digiNc: "ดิจิตอล", frame_wrap: "ครอบวงกบ", drop_floor: "ดรอปพื้น",
  demolish: "รื้อของเดิม", closer: "โช้คอัพ", thresh: "ธรณี", lock: "ชุดล็อค", handle: "มือจับ",
  solid_panel: "แผ่นทึบ", slide_auto: "ระบบออโต้", louver: "เกล็ด",
  // ของเสริมหลังคา
  roof_pole: "เสา", truss_beam: "คานรับ", roof_eave: "ครอบชายคา", gutter: "รางน้ำ",
  chain_drain: "โซ่ระบายน้ำ", pipe_cover: "ท่อน้ำทิ้ง", gutter_cover: "ตะแกรงกันใบไม้",
  beam_cover: "ครอบคาน", hide_slope: "ซ่อนสโลป", roof_sealer: "ซีลเลอร์", roof_film: "ฟิล์มหลังคา",
  roof_2nd: "หลังคาชั้น 2", ceil_under: "ฝ้าใต้หลังคา",
};

/** สรุปของเสริมเป็นข้อความ — คืน " + ก, ข" (มีช่องว่างนำ) หรือ "" */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function addonSummary(addons: Record<string, any> | undefined): string {
  const on = Object.entries(addons || {})
    .filter(([, v]) => v && (typeof v !== "object" || Object.keys(v).length > 0))
    .map(([k, v]) => {
      if (k === "mosquito") { const t = mosquitoTypeLabel(v); return t ? `มุ้ง${t}` : "มุ้ง"; }
      if (k === "roof_zip") return v === "none" ? "" : `ม่านซิปหลังคา Skylight ${v === "sky120" ? "120" : "100"}`;
      if (k === "rzFab" || k === "rzNoRemote") return "";
      if (k === "door_zip") return v === "none" ? "" : `ม่านซิปประตู ${v === "z120" ? "Z120" : "Z100"}`;
      if (k === "dzFab" || k === "dzNoRemote") return "";
      return ADDON_LABELS[k] || k;
    })
    .filter(Boolean);
  return on.length ? ` + ${on.join(", ")}` : "";
}

const fmtM = (n: number) => (Math.round((n + Number.EPSILON) * 100) / 100).toLocaleString("th-TH", { maximumFractionDigits: 2 });
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const prodOf = (k: string): any => (PRODUCTS as any)[k];

/** ข้อความของบานเดียว (ประตู/หน้าต่าง) — บานติดตายคืน "" เพราะรวบไปท้ายด้านทีเดียว */
export function paneDescQuote(p: DescPane): string {
  const use = paneUse(p);
  if (use === "fixed") return "";
  const prod = prodOf(p.typeKey);
  const label: string = prod?.name || p.typeKey;
  const kind = use === "door" ? "ประตู" : "หน้าต่าง";
  const nm = label.startsWith(kind) ? label : kind + label;   // ชื่อรุ่นบางตัวขึ้นต้นด้วย "ประตู" อยู่แล้ว (PC Door)
  const form = prod?.forms?.length ? (p.form || prod.defForm) : "";
  const mq = mosquitoTypeLabel(p.addons?.mosquito);
  // ของเสริมอื่น (ครอบวงกบ/โช้ค/มือจับ ฯลฯ) ยังต้องขึ้นใบ — ตัดมุ้งออกเพราะพูดตามลำดับที่เจ้าของสั่งแล้ว
  const extras = addonSummary({ ...(p.addons || {}), mosquito: undefined }).replace(/^ \+ /, "");
  return [
    nm,
    form || "",
    (p.n || 1) > 1 ? `${p.n} บาน` : "",
    use === "door" ? paneSill(p) : "",
    mq ? `พร้อมมุ้ง${mq}` : "",
    extras ? `(${extras})` : "",
  ].filter(Boolean).join(" ");
}

export const sideCols = (s: DescSide): DescCol[] => s.cols || [];
export const sidePanes = (s: DescSide): DescPane[] => sideCols(s).flatMap((c) => c.pcs);

/** ขนาดรวมของด้าน (ม.) — ผนังใช้ขนาดผนัง · กระจก/เปิดโล่ง = รวมกว้างทุกช่อง × สูงสุดของช่อง */
export function sideSize(s: DescSide): { w: number; h: number } {
  const cols = sideCols(s);
  const pw = cols.length ? cols.reduce((a, c) => a + Math.max(0, ...c.pcs.map((p) => p.w || 0)), 0) : 0;
  const ph = cols.length ? Math.max(0, ...cols.map((c) => c.pcs.reduce((a, p) => a + (p.h || 0), 0))) : 0;
  // ผนัง: ขนาดด้าน = ขนาดผนัง แต่ถ้าบานที่เจาะใหญ่กว่า (กรอกผนังไว้เล็กกว่าประตู) ให้ครอบบานด้วย
  if (s.kind === "wall") return { w: Math.max(s.aw || 0, pw), h: Math.max(s.ah || 0, ph) };
  return { w: pw, h: ph };
}

/** บรรทัดเดียวของด้าน — เรียง ประตู → หน้าต่าง → กระจกติดตาย แล้วปิดท้ายด้วยขนาดรวม */
export function sideDescQuote(s: DescSide, wallLabel = ""): string {
  const panes = sidePanes(s);
  const doors = panes.filter((p) => paneUse(p) === "door");
  const wins = panes.filter((p) => paneUse(p) === "window");
  const nFixed = panes.filter((p) => paneUse(p) === "fixed").length;
  const parts = [...doors, ...wins].map(paneDescQuote).filter(Boolean);
  if (wallLabel) parts.unshift(wallLabel);              // ด้านผนัง — บอกว่าเป็นผนังอะไรก่อน
  let txt = parts.join(" + ");
  if (nFixed > 0) txt += `${txt ? " และ" : ""}กระจกติดตาย${nFixed > 1 ? ` ${nFixed} ช่อง` : ""}`;
  const sz = sideSize(s);
  if (sz.w > 0 && sz.h > 0) txt += `${txt ? " " : ""}${fmtM(sz.w)}×${fmtM(sz.h)} ม.`;
  return txt || "เปิดโล่ง";
}
