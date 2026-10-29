/**
 * sub-pane — "ผสมบาน" (บานย่อยในชุดเดียวกับบานหลัก G1) คิดราคายังไง
 * ─────────────────────────────────────────────────────────────────────────────
 * เจ้าของสั่ง 29 ต.ค.69: "ผสมบานยังคิดเป็นตารางเมตร ไม่คิดเป็นของ · กดเพิ่มแล้วไม่ขึ้นค่าของ"
 *   เดิม (SubPanesSection.tsx): ราคาขาย = panePrice (ถอดของจริง) ✓ แต่
 *     ① ทุนบานย่อย = ขาย ÷ (1+กำไร%)  ← ถอดจากมาร์กอัป ไม่ใช่ทุนจริง
 *     ② "จัดเต็ม" = มุ้ง +3,000 เหมา · อลูทึบ พื้นที่×3,500 · คาดตาราง +2,000  ← R3.9 ตร.ม./เหมา ไม่ใช่ของ
 *     ③ รายการของ (lines) ของบานย่อยไม่ถูกส่งต่อ → ตาราง "ค่าของ"/BOM ไม่มีของบานย่อย
 *   ตอนนี้: บานย่อย = computeCost ของรุ่นจริงทั้งก้อน (ผ่าน panePrice ชุดเดียวกับ G1/ห้องกระจก)
 *     ขาย/ทุนของ/ค่าแรง/รายการของ ครบ · ของเสริมใช้ addons จริงของรุ่น (มุ้ง R4.0 · คาดตาราง · ทึบล่าง ฯลฯ)
 *   ⚠ ใบเก่าที่บันทึก mat/gridmark (แบบเหมา) ไว้และยังไม่มี addons → คงราคาเหมาเดิม (เปิดกลับมาต้องเท่าเดิม)
 *
 * ไฟล์นี้ไม่มี JSX → สคริปต์ตรวจ (verify-sub-pane.mjs) import ได้ตรง ๆ
 */
/* eslint-disable @typescript-eslint/no-explicit-any */
// @ts-expect-error — products เป็น ESM JS ล้วน
import { PRODUCTS } from "./products.mjs";
import { panePrice, PANE_BY_KEY, type PaneProfit } from "./pane-calc.ts";
import { addonSummary } from "./room-desc.ts";

export type SubPane = {
  key: number;
  pid: string; // product id หรือ '_custom'
  label: string;
  w: number; h: number; n: number; // เมตร, เมตร, จำนวนบาน
  form?: string; // รูปแบบบานย่อย (เลือกให้ต่างจากบานหลักได้) — เว้น = defForm ของชนิดนั้น
  desc?: string; price?: number; // เฉพาะ _custom
  openCt?: number; fixCt?: number; // แบ่งบาน (เฉพาะ SUB_WORKING)
  addons?: Record<string, any>; // ของเสริมจริงของรุ่น (ชุดเดียวกับหน้า G1 / ห้องกระจก)
  mat?: "none" | "frame" | "pleat" | "solid"; // ⚠ ใบเก่า: มุ้ง/วัสดุเสริมแบบเหมา (ไม่ใช้กับบานใหม่)
  gridmark?: "none" | "yes";                   // ⚠ ใบเก่า: คาดตารางแบบเหมา
  note?: string;
  fprice?: number; // ราคาแยก override
  _open?: boolean; // ขยาย "ปรับ"
  _full?: boolean; // ขยาย "จัดเต็ม"
};

// 2 กลุ่มปุ่มเพิ่ม (pid, label, w, h เริ่มต้นเป็นเมตร)
export const SUB_GROUPS: { g: string; items: [string, string, number, number][] }[] = [
  { g: "บานทำงาน", items: [["open_door", "บานเปิด", 0.9, 2.2], ["sms_slide", "บานเลื่อน", 1.8, 2.2], ["folding", "เฟี้ยม", 2.4, 2.2], ["awning", "กระทุ้ง", 0.6, 0.6]] },
  { g: "ติดตาย / ช่องแสง", items: [["fixed", "ช่องแสงบน", 1.2, 0.4], ["fixed", "บานข้างติดตาย", 0.6, 2.2], ["fixed", "ช่องแสงติดตาย", 1.0, 0.5], ["_custom", "อื่นๆ (กรอกเอง)", 1.0, 1.0]] },
];
// บานที่แบ่งเปิด/ติดตายได้ (ปุ่ม "ปรับ" → แบ่งบาน)
export const SUB_WORKING = ["open_door", "sms_slide", "folding", "awning"];

/** รุ่นของบานย่อย (รวมของเสริม universal เหมือนห้องกระจก) — ใช้ทั้งคิดราคาและกล่อง AddonsSection */
export function subProd(pid: string): any {
  return PANE_BY_KEY[pid] || (PRODUCTS as any)[pid] || null;
}

/** ใบเก่า = มี mat/gridmark แบบเหมา และยังไม่เคยตั้ง addons จริง */
export function subIsLegacy(s: SubPane): boolean {
  return s.addons == null && ((!!s.mat && s.mat !== "none") || s.gridmark === "yes");
}

export type SubCalc = {
  amount: number;                          // ราคาขาย (รวมติดตั้ง · ขายส่ง = mfgOnlyNet)
  cost: number;                            // ทุนค่าของ (จาก BOM จริง)
  labor: { prod: number; install: number }; // ทุนค่าแรง
  lines: any[];                            // รายการของ (computeCost.lines) — ตาราง "ค่าของ"/BOM ใช้
  mosqLabel?: string;
  legacyExtra?: number;                    // ส่วนเหมาแบบเก่า (ใบเก่าเท่านั้น)
};

/**
 * คิดบานย่อย 1 บาน — ทั้งก้อน (ขาย/ทุน/ค่าแรง/รายการของ)
 *   mainColor = คีย์สี (white/sahara/…) · mainGlass = ชื่อกระจกของบานหลัก · laborMode "mfg" = ขายส่งไม่ติดตั้ง
 */
export function subCalc(
  s: SubPane, pb: any, mainColor: string, mainGlass: string, profitPct: number, profitOpt?: PaneProfit, laborMode: "all" | "mfg" = "all",
): SubCalc {
  const none: SubCalc = { amount: 0, cost: 0, labor: { prod: 0, install: 0 }, lines: [] };
  if (s.pid === "_custom") {
    const amt = +s.price! || 0;
    // บานกรอกเอง ไม่มีของ → ทุน ≈ ถอดจากกำไร% (ของเดิม) ไว้โชว์กำไรรวมพอประมาณ
    return { ...none, amount: amt, cost: Math.round(amt / (1 + (profitPct || 100) / 100)) };
  }
  const prod = subProd(s.pid);
  if (!prod) return none;
  const sForm = s.form && (prod.forms ?? []).includes(s.form) ? s.form : prod.defForm;
  const x = panePrice(
    { key: 0, typeKey: s.pid, w: s.w || 1, h: s.h || 1, n: s.n || 1, form: sForm, fixedPanes: s.fixCt || 0, addons: s.addons || {} },
    pb, mainColor, mainGlass, profitPct, undefined, profitOpt,
  );
  const r: any = x.r;
  if (!r || !r.sell) return none;
  let amount = s.fprice! > 0 ? +s.fprice! : (laborMode === "mfg" ? r.sell.mfgOnlyNet : r.sell.withInstall);
  // ⚠ ใบเก่า (mat/gridmark แบบเหมา · ยังไม่มี addons) — คงราคาเหมาเดิม ไม่งั้นเปิดใบเก่าแล้วราคาเปลี่ยน
  let legacyExtra = 0;
  if (subIsLegacy(s)) {
    if (s.mat === "frame" || s.mat === "pleat") legacyExtra += 3000;
    else if (s.mat === "solid") legacyExtra += Math.ceil(((s.w || 1) * (s.h || 1) * 3500) / 100) * 100;
    if (s.gridmark === "yes") legacyExtra += 2000;
    amount += legacyExtra;
  }
  return {
    amount,
    cost: Number(r.cost?.total) || 0,
    labor: { prod: Number(r.labor?.prod) || 0, install: laborMode === "mfg" ? 0 : (Number(r.labor?.install) || 0) },
    lines: Array.isArray(r.lines) ? r.lines : [],
    mosqLabel: x.mosqLabel,
    legacyExtra: legacyExtra || undefined,
  };
}

/** ราคาขายบานย่อย (ตัวเลขเดียว) — การ์ดในหน้าจอใช้ */
export function subPrice(s: SubPane, pb: any, mainColor: string, mainGlass: string, profitPct: number, profitOpt?: PaneProfit, laborMode: "all" | "mfg" = "all"): number {
  return subCalc(s, pb, mainColor, mainGlass, profitPct, profitOpt, laborMode).amount;
}

/** ข้อความบานย่อยลงใบเสนอ — ขนาด · จำนวน · แบ่งบาน · ของเสริม · หมายเหตุ */
export function subDesc(s: SubPane): string {
  if (s.pid === "_custom") return (s.desc || "บานอื่นๆ") + " (กรอกเอง)";
  const sp = (PRODUCTS as any)[s.pid];
  const formTxt = s.form && sp && (sp.forms ?? []).includes(s.form) && s.form !== sp.defForm ? ` แบบ${s.form}` : "";
  let d = `${s.label}${formTxt} ${s.w || 1}×${s.h || 1}ม.${(s.n || 1) > 1 ? ` ${s.n}บาน` : ""}`;
  if ((s.openCt || 0) + (s.fixCt || 0) > 0) d += ` (เปิด ${s.openCt || 0}/ติดตาย ${s.fixCt || 0})`;
  if (subIsLegacy(s)) {
    if (s.mat === "frame") d += " +มุ้งเฟรม";
    else if (s.mat === "pleat") d += " +มุ้งจีบ";
    else if (s.mat === "solid") d += " +อลูทึบ";
    if (s.gridmark === "yes") d += " +คาดตาราง";
  } else {
    d += addonSummary(s.addons);   // " + มุ้งเฟรม, คาดตาราง" (ว่าง = "")
  }
  if (s.note) d += " · " + s.note;
  return d;
}
