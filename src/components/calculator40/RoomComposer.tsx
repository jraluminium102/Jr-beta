"use client";

/**
 * 🏗️ ห้องกระจก (G6) composer — ประกอบห้องหลายด้าน (กระจก/ผนัง/เปิดโล่ง) + ฝ้า + หลังคา + พื้น + พัดลม + งานบริการ
 * คิดราคาทุกชิ้นด้วย R4.0 cost-engine จริง (computeCost/computeAddon) — ไม่ทำสูตรราคาซ้ำเอง
 *
 * พาริตี้เครื่องเดิม (G6-module.js — G6R state/G6GROUPS/G6PROF/sideTotal/roomTotal) เก็บทุกฟีเจอร์:
 *   - per-pane option เต็ม: มือจับ(Cmech 6สี/ดิจิตอล/สแตนเลส)/ธรณี/โช้คอัพ/Tilt&Turn/แขนค้ำ/มุ้ง(หมวด+รุ่น+ผ้า)/
 *     ครอบวงกบ/ดรอปพื้น/รื้อของเดิม — reuse <AddonsSection> ต่อบาน (ตรง prod.addons ของแต่ละชนิดบานจริงใน products.mjs)
 *   - สี/กระจกแยกต่อด้าน (sideOvr) + premium
 *   - หลังคาเต็ม: วัสดุมุง + หลายช่วง + ของเสริมครบ (รางน้ำ/เสา/เลื่อน+มอเตอร์/ซ่อนสโลป/ครอบ/sealer ฯลฯ) — reuse <AddonsSection> ของ prod.roof
 *   - ฝ้าเต็ม (บอร์ด/ทาสี/ฉนวน/ตำแหน่ง/แนว) ผ่าน ceil_* products จริง
 *   - พื้น + พัดลม + งานบริการ (demo/protect) — flat rate ตรงมติเดิม (ไม่มี R4.0 product คู่ตรง ๆ)
 *
 * โมเดล:
 *   RoomState.sides[] = ด้าน (glass|wall|open)
 *     glass side: panes[] แต่ละ pane = {typeKey(R4.0 product id), w,h,n,fixedPanes,addons,colorOvr,glassOvr}
 *     wall side: ชนิดผนัง (สมาร์ทบอร์ด/ไอโซวอล R4.0 จริง หรือ ผนังเบา flat R3.9)
 *     open side: 0
 *   ceiling: ชนิด × พื้นที่ผ่าน ceil_* product จริง (PERIM/area ตรงกว้าง×ยาวจริง) + ฉนวน/ตำแหน่ง/แนว
 *   roof: กว้าง×ยาว(+หลายช่วง) × R4.0 'roof' product + addons เต็ม (รางน้ำ/เสา/ฯลฯ ผ่าน AddonsSection)
 *   floor/fan/services = flat ตรงมติ 16มิ.ย. (สมาร์ทบอร์ด/ไม้เทียม 5,000/ตร.ม. · SPC กรอกเรต · min 5 · ลด10%≥20)
 *   roomTotal = ceil100(Σ sideTotal + roofTotal + ceilTotal + floorTotal + fanTotal + servicesTotal + svcTotal + roomColorPremium)
 */
import { useEffect, useMemo, useRef, useState } from "react";
import type { MutableRefObject } from "react";
import Icon from "@/components/Icon";
import { fmt } from "@/lib/calculator40/fmt";
import AddonsSection from "@/components/calculator40/AddonsSection";
import { ALU_COLOR_LABEL, resolveAluColor, aluColorKeysFor } from "@/lib/calculator40/alu-colors";
import { groupGlass, allGlassKeys } from "@/lib/calculator40/glass-cats";
// @ts-expect-error — engine เป็น ESM JS ล้วน
import { computeCost, ceil100, CEIL_RATE } from "@/lib/calculator40/engine.mjs";
import { stockColorOfCalc } from "@/lib/calculator40/stock-link";
// บานในห้องกระจก: ชนิดบาน + ราคาต่อบาน + ค่าตั้งต้น spec — ก้อนเดียวกับหน้า G1
import { PANE_TYPES, PANE_BY_KEY, SHEET_FIN, panePrice, paneSpec, paneCut, type Pane } from "@/lib/calculator40/pane-calc";
// กติกาจำนวนบานต่อรูปแบบ (เปิดคู่กลาง = 4/6) — ก้อนเดียวกับหน้า G1
import { formRule, formNote, allowedPanes, snapPanes } from "@/lib/calculator40/form-rules";
// อุปกรณ์ "ค่าของ" ดึงจากใบตัดชุดเดียวกับหน้า G1 — บานในห้องกระจกต้องคิดเท่ากันเป๊ะ (เจ้าของสั่ง 21 ส.ค.69)
import { cutHardwareLines, HANDLE_FIELDS, HW_FROM_CUTLIST } from "@/lib/calculator40/hardware-from-cutlist";
// @ts-expect-error — products เป็น ESM JS ล้วน
import { PRODUCTS } from "@/lib/calculator40/products.mjs";
// @ts-expect-error — mosquito helper เป็น ESM JS ล้วน
import { computeMosquitoR4, mosquitoTypeLabel } from "@/lib/calculator40/mosquito.mjs";
// ข้อความรายด้านที่ไปขึ้นใบเสนอ + ตัวช่วยประตู/หน้าต่าง — แหล่งเดียว เทสได้ที่ scripts/verify-room-desc.mjs
import { addonSummary, paneUse, paneSill, sideDescQuote, SILL_OPTS, type PaneUse } from "@/lib/calculator40/room-desc";
// @ts-expect-error — roof-zip helper เป็น ESM JS ล้วน
import { computeRoofZipR4, isRoofZipProd } from "@/lib/calculator40/roof-zip.mjs";
import { withUniversalAddons } from "@/lib/calculator40/universal-addons";
// @ts-expect-error — door-zip helper เป็น ESM JS ล้วน
import { computeDoorZipR4 } from "@/lib/calculator40/door-zip.mjs";

/* eslint-disable @typescript-eslint/no-explicit-any */

function fmtBaht(n: number) {
  return "฿" + Math.round(n || 0).toLocaleString("th-TH");
}
function fmtNum(n: number) {
  return (n || 0).toLocaleString("th-TH", { maximumFractionDigits: 2 });
}

// ชนิดบาน / ราคาต่อบาน / ค่าตั้งต้น spec — ย้ายไป lib/calculator40/pane-calc
//   เพื่อให้ "บานในห้องกระจก" กับ "บานหน้า G1" คิดจากก้อนเดียวกัน (verify-room-parity เทียบให้)

// ช่อง (column) = ตำแหน่งซ้าย→ขวา · pcs = บานซ้อนบน→ล่างในช่องนั้น (2 มิติ เหมือน R3.9 G6R)
type Col = { key: number; pcs: Pane[] };
// stash = จำข้อมูลของชนิดอื่นไว้ตอนสลับชนิดด้าน (กระจก/ผนัง/เปิดโล่ง) → สลับกลับมาไม่หาย (เจ้าของสั่ง 4ส.ค.69)
// cols ของ wall/open (ประตู/หน้าต่างในด้านนี้ — เจ้าของสั่ง 5ส.ค.69) ก็ stash แยกตามชนิดด้วย (กันหายตอนสลับ)
type WallData = { wallType: "light" | "smartboard" | "isowall"; aw: number; ah: number; addons: Record<string, any>; cols?: Col[] };
type SideStash = { glass?: Col[]; wall?: WallData; open?: Col[] };
type Side =
  | { kind: "glass"; cols: Col[]; stash?: SideStash }
  | { kind: "wall"; wallType: "light" | "smartboard" | "isowall"; aw: number; ah: number; addons: Record<string, any>; cols?: Col[]; stash?: SideStash }
  | { kind: "open"; cols?: Col[]; stash?: SideStash };

const WALL_RATE = 1350; // ผนังเบา ฿/ตร.ม. (R3.9 flat — ไม่มี R4.0 product คู่ตรง ๆ ของ "ผนังเบา" ชนิดบาง — ยังใช้ราคานี้ ติดป้าย (R3.9))

const WALL_TYPES: { key: Side extends { kind: "wall" } ? Side["wallType"] : never; label: string }[] = [
  { key: "light", label: "ผนังเบา (R3.9)" },
  { key: "smartboard", label: "สมาร์ทบอร์ด 12มม. (R4.0)" },
  { key: "isowall", label: "ไอโซวอล 100มม. (R4.0)" },
];

// ทรงหลังคาในห้อง (สลับ product จริงเหมือน G3) · มีผลราคา (คนละ BOM)
const ROOF_SHAPES: [string, string][] = [["roof", "กันสาด"], ["roof_gable", "จั่ว"], ["roof_slide", "เลื่อน"]];
const ROOF_SHAPE_LABEL: Record<string, string> = { roof: "กันสาด", roof_gable: "จั่ว", roof_slide: "เลื่อน" };

const CEIL_TYPES: { key: string; label: string; r4id?: string }[] = [
  { key: "smooth", label: "ฉาบเรียบ", r4id: "ceil_gypsum" },
  { key: "cshape", label: "อลูตัวซี" }, // ไม่มี R4.0 product ตรง → CEIL_RATE flat (R3.9)
  { key: "wood", label: "ไม้เทียม", r4id: "ceil_wood" },
  { key: "ranae_1x5", label: "ระแนงอลู 1×5", r4id: "ceil_ranae_1x5" },
  { key: "ranae_16_5", label: "ระแนงอลู 1.6 เว้น5", r4id: "ceil_ranae_16_5" },
  { key: "ranae_16_2", label: "ระแนงอลู 1.6 เว้น2", r4id: "ceil_ranae_16_2" },
];
// map key → CEIL_RATE label (engine.mjs CEIL_RATE ใช้ label ภาษาไทยเป็น key)
const CEIL_FLAT_LABEL: Record<string, string> = {
  smooth: "ฉาบเรียบ", cshape: "อลูตัวซี", wood: "ไม้เทียม remood",
  ranae_1x5: "ระแนงอลู 1×5", ranae_16_5: "ระแนงอลู เว้นร่อง", ranae_16_2: "ระแนงอลู เว้นร่อง",
};

const COLOR_LABEL: Record<string, string> = { white: "อบขาว/ดำ", sahara: "เทาซาฮาร่า", special: "สีอบพิเศษ", woodSpecial: "ลายไม้อบพิเศษ", woodStock: "ลายไม้สต็อค" };

function L(i: number) {
  return String.fromCharCode(65 + i);
}

// key ใหม่ (React key + ใช้แยก pane ตอนแก้) — ไม่ซ้ำแม้ก๊อปหลายด้านรัว ๆ (มี Math.random)
const newKey = () => Date.now() + Math.random();

function freshPane(): Pane {
  return { key: newKey(), typeKey: "open_door", w: 0.9, h: 2.2, n: 1, addons: {} };
}
function freshCol(): Col {
  return { key: Date.now() + Math.random(), pcs: [freshPane()] };
}
function freshGlassSide(): Side {
  return { kind: "glass", cols: [freshCol()] };
}
function freshWallSide(): Side {
  return { kind: "wall", wallType: "light", aw: 3, ah: 2.6, addons: {}, cols: [] };
}

// cols ของด้าน — glass ใช้ cols เดิม · wall/open ก็ถือ cols ได้เหมือนกัน (ใส่ประตู/หน้าต่างในด้านผนัง/เปิดโล่ง)
function sideCols(s: Side): Col[] {
  if (s.kind === "glass") return s.cols;
  return s.cols || [];
}
// pane ทั้งหมดของด้าน (ทุกช่อง ทุกชนิดด้าน)
function sidePanes(s: Side): Pane[] {
  return sideCols(s).flatMap((c) => c.pcs);
}
// สีที่เลือกได้ "ทั้งด้าน" — ต้องเป็นสีที่ทุกบานในด้านนั้นทำได้จริง (intersection)
//   ด้านที่มีบานยูโรอย่างเดียว = ได้ 3 สีพิเศษด้วย · มีบานรุ่นอื่นปนแม้บานเดียว = ตัดออก (กันเลือกสีที่ผลิตไม่ได้)
function colorKeysForSide(s: Side): string[] {
  const panes = sidePanes(s);
  if (!panes.length) return aluColorKeysFor(null);
  return panes.reduce<string[]>((acc, p) => {
    const ok = new Set(aluColorKeysFor(p.typeKey));
    return acc.filter((c) => ok.has(c));
  }, aluColorKeysFor(panes[0].typeKey));
}

// พื้นที่รวมของบาน (ประตู/หน้าต่าง) ในด้านนี้ — ใช้หักพื้นที่ผนังสุทธิ (wall net-area)
function paneAreaSum(s: Side): number {
  return sidePanes(s).reduce((a, p) => a + (p.w || 0) * (p.h || 0) * (p.n || 1), 0);
}

// ราคาผนัง (ไม่รวมบานที่เจาะในผนัง) — คิดจาก "พื้นที่สุทธิ" (พื้นที่ผนังเต็ม − Σพื้นที่ช่องบาน) กันคิดสมาร์ทบอร์ด/
// ไอโซวอลทับพื้นที่ที่เป็นประตู/หน้าต่างไปแล้ว (เจ้าของย้ำ "คิดเต็มไม่ได้" 5ส.ค.69)
// วิธี: คิดต้นทุนผนังเต็ม (BOM จริงรวมโครง/PERIM) แล้วสเกลลงตามสัดส่วนพื้นที่สุทธิ/พื้นที่เต็ม — เป็น app-layer
// approximation (ไม่แตะ engine) ที่สเกล "รวมโครง" ไปด้วย ไม่ใช่แค่แผ่นบอร์ด แต่เจ้าของรับได้ (ระบุชัดในคอมเมนต์)
function wallPrice(s: Extract<Side, { kind: "wall" }>, pb: any, profitPct: number): number {
  const fullArea = (s.aw || 3) * (s.ah || 2.6);
  const paneArea = paneAreaSum(s);
  const netArea = Math.max(0, fullArea - paneArea); // clamp ≥0 กันบานใหญ่กว่าผนัง
  if (s.wallType === "light") return Math.round(netArea * WALL_RATE); // เรต/ตร.ม. ตรงตัว → net-area ตรง ๆ
  const prod = (PRODUCTS as any)[s.wallType === "smartboard" ? "wall_smartboard" : "wall_isowall"];
  if (!prod) return 0;
  const r: any = computeCost(pb, prod, {
    w: (s.aw || 3) * 100, h: (s.ah || 2.6) * 100, p: 1, form: prod.defForm, profitPct, installProfitPct: profitPct, addons: s.addons || {},
  });
  const fullCost = r.sell.withInstall;
  if (fullArea <= 0) return 0;
  return Math.round(fullCost * netArea / fullArea);
}

function sideTotal(s: Side, pb: any, color: string, glassType: string, profitPct: number): number {
  // ราคาบาน (ประตู/หน้าต่าง) ในด้านนี้ — glass ใช้ cols เดิม · wall/open ก็คิดจาก cols เหมือนกัน (0 ถ้าไม่มีบาน)
  const paneCost = sidePanes(s).reduce((a, p) => a + panePrice(p, pb, color, glassType, profitPct).amount, 0);
  if (s.kind === "wall") return wallPrice(s, pb, profitPct) + paneCost; // ผนัง(สุทธิหักช่องบาน) + บานที่เจาะ
  return paneCost; // glass = Σบาน · open = Σบาน (ไม่มีบาน = 0, เปิดโล่งจริง)
}

// ฝ้า — ใช้ ceil_* product จริง (w/h = กว้าง/ยาวห้องจริง ซม. ตรง PERIM_VARS ของ products.mjs) หรือ flat CEIL_RATE ถ้าไม่มี product ตรง
function ceilPrice(typeKey: string, w: number, l: number, insul: boolean, pb: any, profitPct: number): number {
  const area = w * l;
  if (area <= 0) return 0;
  const t = CEIL_TYPES.find((x) => x.key === typeKey);
  if (t?.r4id && (PRODUCTS as any)[t.r4id]) {
    const prod = (PRODUCTS as any)[t.r4id];
    const form = insul && prod.forms?.includes('ใส่ฉนวน rockwool 3"') ? 'ใส่ฉนวน rockwool 3"' : prod.defForm;
    const material = t.key === "wood" ? "ไม้ทิพย์|สีพื้น" : undefined;
    const r: any = computeCost(pb, prod, { w: w * 100, h: l * 100, p: 1, form, material, profitPct, installProfitPct: profitPct, addons: {} });
    return r.sell.withInstall;
  }
  // ไม่มี R4.0 product ตรง → flat CEIL_RATE (engine.mjs, แหล่งเดียวกับเครื่องเดิม + G3) — ติดป้าย (R3.9)
  const label = CEIL_FLAT_LABEL[typeKey] || "ฉาบเรียบ";
  const rate = ((CEIL_RATE as Record<string, number>)[label] || 480) + (insul ? 600 : 0);
  return Math.round(area * rate);
}

// พื้น (มติ 16มิ.ย.): สมาร์ทบอร์ด/ไม้เทียม 5,000/ตร.ม. · SPC กรอกเรตเอง · min 5 ตร.ม. · ลด auto 10% ถ้า ≥20 (แก้ %ได้)
function floorPrice(mat: string, w: number, l: number, rate: number, discOvr: string): number {
  const raw = (w || 0) * (l || 0);
  if (raw <= 0) return 0;
  const a = Math.max(5, raw);
  const r = mat === "spc" ? rate || 0 : 5000;
  const base = a * r;
  const dp = discOvr !== "" ? Number(discOvr) || 0 : (a >= 20 ? 10 : 0);
  return Math.round(base * (1 - dp / 100));
}

function svcDemoTotal(demo: { roof: number; floor: number; rail: number; railLen: number; door: number }): number {
  let t = 0;
  if (demo.roof) t += 5000 * (demo.roof || 0);
  if (demo.floor) t += 5000 * (demo.floor || 0);
  if (demo.rail) t += 3000 + 700 * (demo.railLen || 0);
  if (demo.door) t += demo.door || 0;
  return t;
}

// state = สแนป state ทั้งห้อง (0093) — เก็บเป็น "สูตร" ในใบเสนอ แล้วโหลดกลับมาแก้ได้ (ผ่าน prop initial)
export type RoomTotals = { total: number; sides: number[]; sideDescs?: string[]; roofDesc?: string; ceilDesc?: string; specLines?: string[]; roof: number; ceil: number; floor: number; fan: number; services: number; svc: number; state?: any };

// ── รูปด้านผนัง (elevation) — วาดผนังลายทแยง + ประตู/หน้าต่างเจาะในผนัง + ป้ายชนิดผนัง/พื้นที่สุทธิ (เจ้าของสั่ง 5ส.ค.69 · แบบรูปด้านจริง)
//   คลิกบานในรูป = เลือกบานนั้น (ไฮไลต์แดง · เชื่อม selKey เดียวกับ ColsEditor) · บานวางชิดพื้นเรียงซ้าย→ขวา ที่เหลือเป็นเนื้อผนัง (ลายทแยง)
function WallElevation({
  aw, ah, wallLabel, cols, netArea, fullArea, paneArea, selKey, onSelect,
}: {
  aw: number; ah: number; wallLabel: string; cols: Col[];
  netArea: number; fullArea: number; paneArea: number; selKey: number | null; onSelect: (key: number) => void;
}) {
  const W = Math.max(0.5, aw), H = Math.max(0.5, ah);
  const scale = Math.min(360 / W, 200 / H);              // px/ม. — พอดีกล่อง ~360×200
  const drawW = W * scale, drawH = H * scale;
  const padL = 26, padT = 10, padR = 8, padB = 24;
  const svgW = drawW + padL + padR, svgH = drawH + padT + padB;
  const x0 = padL, y0 = padT, yBottom = padT + drawH;
  // วางบานซ้าย→ขวา · ในช่องซ้อนจากพื้นขึ้น (ประตูวางชิดพื้น เหมือนรูปด้าน)
  let cursor = x0 + Math.min(10, drawW * 0.05);
  const rects: { x: number; y: number; w: number; h: number; key: number; label: string; sel: boolean }[] = [];
  for (const col of cols) {
    const colW = Math.max(0.3, ...col.pcs.map((p) => p.w || 0)) * scale;
    let yb = yBottom;
    for (const pc of col.pcs) {
      const pw = Math.min(colW, (pc.w || 0.3) * scale);
      const ph = Math.min(drawH, (pc.h || 0.3) * scale);
      const y = yb - ph;
      rects.push({ x: cursor, y, w: pw, h: ph, key: pc.key, label: PANE_TYPES.find((t) => t.key === pc.typeKey)?.label || "บาน", sel: pc.key === selKey });
      yb = y;
    }
    cursor += colW + 6;
  }
  return (
    <div className="rounded-lg border border-black/5 bg-white/50 p-2">
      <svg viewBox={`0 0 ${svgW} ${svgH}`} width="100%" style={{ maxWidth: svgW, height: "auto" }} role="img" aria-label="รูปด้านผนัง">
        <defs>
          <pattern id="wallhatch" width="7" height="7" patternTransform="rotate(45)" patternUnits="userSpaceOnUse">
            <line x1="0" y1="0" x2="0" y2="7" stroke="#c9ccd1" strokeWidth="1" />
          </pattern>
        </defs>
        {/* ตัวผนัง (ลายทแยง) */}
        <rect x={x0} y={y0} width={drawW} height={drawH} fill="url(#wallhatch)" stroke="#9aa0a6" strokeWidth="1.2" />
        {/* ช่องบาน (ประตู/หน้าต่าง) เจาะในผนัง = พื้นขาว */}
        {rects.map((r) => (
          <g key={r.key} onClick={() => onSelect(r.key)} style={{ cursor: "pointer" }}>
            <rect x={r.x} y={r.y} width={r.w} height={r.h} fill="#ffffff" stroke={r.sel ? "#b3151d" : "#5f6368"} strokeWidth={r.sel ? 2 : 1.2} />
            {r.w > 30 && r.h > 20 && (
              <text x={r.x + r.w / 2} y={r.y + r.h / 2} textAnchor="middle" dominantBaseline="middle" fontSize="8.5" fill="#5f6368">{r.label}</text>
            )}
          </g>
        ))}
        {/* มิติ กว้าง/สูง */}
        <text x={x0 + drawW / 2} y={svgH - 7} textAnchor="middle" fontSize="9" fill="#80868b">{fmtNum(aw)} ม.</text>
        <text x={9} y={y0 + drawH / 2} textAnchor="middle" fontSize="9" fill="#80868b" transform={`rotate(-90 9 ${y0 + drawH / 2})`}>{fmtNum(ah)} ม.</text>
      </svg>
      <p className="text-[11px] text-ink-2 mt-1 leading-snug">
        <b>{wallLabel}</b>
        {paneArea > 0
          ? <> · พื้นที่สุทธิ <b className="tabular-nums">{fmtNum(netArea)}</b> ตร.ม. <span className="text-ink-3">(เต็ม {fmtNum(fullArea)} − หักช่องบาน {fmtNum(paneArea)})</span></>
          : <> · {fmtNum(fullArea)} ตร.ม.</>}
      </p>
    </div>
  );
}

// ── ตัวแก้ไข "ช่องบาน" ของด้าน — reuse ได้ทั้ง glass (บานเต็มด้าน) และ wall/open (ประตู/หน้าต่างในด้านนั้น)
//   แยกเป็น top-level component (ไม่ nested ใน RoomComposer) กัน remount ทุกครั้งที่ parent re-render (จะเสีย focus inputs)
//   รูปด้าน 2 มิติ (ช่องซ้าย→ขวา · ในช่องซ้อนบน→ล่าง) + แถบจัดเรียง ◀▶▲▼＋บน/ล่าง/ช่อง + การ์ดตั้งค่าบานที่เลือกเต็ม (พาริตี้ R3.9 G6R)
//   cols=[] ใช้ได้ (เช่น เปิดโล่งที่ยังไม่ใส่บาน) — ปุ่ม ＋ช่อง ยังโชว์ให้เริ่มใส่บานแรกได้เสมอ
function ColsEditor({
  cols, selKey, onSelect, cardRefs, pb, color, glassFallback, profitPct,
  onPatchPane, onRemovePane, onAddColumn, onAddPiece, onMoveCol, onMovePc,
}: {
  cols: Col[];
  selKey: number | null;
  onSelect: (key: number) => void;
  cardRefs: MutableRefObject<Record<number, HTMLDivElement | null>>;
  pb: any;
  color: string;
  glassFallback: string;
  profitPct: number;
  onPatchPane: (key: number, p: Partial<Pane>) => void;
  onRemovePane: (key: number) => void;
  onAddColumn: () => void;
  onAddPiece: (key: number, dir: -1 | 1) => void;
  onMoveCol: (key: number, dir: -1 | 1) => void;
  onMovePc: (key: number, dir: -1 | 1) => void;
}) {
  const allPcs = cols.flatMap((c) => c.pcs);
  const sel = allPcs.find((p) => p.key === selKey) || allPcs[0];
  const colH = cols.map((c) => c.pcs.reduce((a, p) => a + (p.h || 0), 0));
  const maxColH = Math.max(1, ...colH);
  const scale = 150 / maxColH; // px/เมตร แนวตั้ง (สแต็คสูงสุด ≈ 150px)
  const totalW = cols.reduce((a, c) => a + Math.max(0.3, ...c.pcs.map((p) => p.w || 0)), 0);
  const arrCls = "press min-h-[32px] min-w-[34px] px-2 rounded-lg text-xs font-bold glass-soft text-ink-2 hover:bg-white/80";
  const prod = sel ? PANE_BY_KEY[sel.typeKey] : null;
  const { amount: price, mosqLabel } = sel ? panePrice(sel, pb, color, glassFallback, profitPct) : { amount: 0, mosqLabel: undefined as string | undefined };
  const movePanes = sel ? Math.max(1, (sel.n || 1) - (sel.fixedPanes || 0)) : 1;
  const glassKeys = allGlassKeys(pb);

  return (
    <div className="space-y-2">
      <div className="rounded-lg border border-black/5 bg-white/40 p-2 overflow-x-auto">
        <div className="flex items-start gap-2" style={{ minHeight: 170 }}>
          {cols.map((col, ci) => {
            const colW = Math.max(0.3, ...col.pcs.map((p) => p.w || 0));
            const wPx = Math.max(54, colW * scale);
            return (
              <div key={col.key} className="shrink-0 flex flex-col gap-1" style={{ width: wPx }}>
                {col.pcs.map((pc) => {
                  const hPx = Math.max(32, (pc.h || 0.4) * scale);
                  const isSel = sel?.key === pc.key;
                  const lbl = PANE_TYPES.find((t) => t.key === pc.typeKey)?.label || "บาน";
                  return (
                    <div key={pc.key} role="button" tabIndex={0} onClick={() => onSelect(pc.key)}
                      onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onSelect(pc.key); } }}
                      title="คลิกเพื่อเลือก/ตั้งค่าบานนี้"
                      className={`cursor-pointer rounded-md border-2 flex flex-col items-center justify-center text-center px-1 transition-colors ${isSel ? "border-brand bg-brand/10" : "border-black/25 bg-white/70 hover:border-brand/50"}`}
                      style={{ height: hPx }}>
                      <span className="text-[10px] font-semibold text-ink-2 leading-tight line-clamp-2">{lbl}{(pc.n || 1) > 1 ? ` ×${pc.n}` : ""}</span>
                      <span className="text-[10px] text-ink-3 tabular-nums">{fmtNum(pc.w)}×{fmtNum(pc.h)}</span>
                    </div>
                  );
                })}
                <div className="text-center text-[10px] text-ink-3">ช่อง {ci + 1}</div>
              </div>
            );
          })}
          <button type="button" onClick={onAddColumn} title="เพิ่มช่องใหม่"
            className="press shrink-0 rounded-md border-2 border-dashed border-black/25 text-ink-3 hover:border-brand/50 hover:text-brand flex flex-col items-center justify-center font-bold"
            style={{ width: 54, minHeight: 110 }}><span className="text-lg leading-none">＋</span><span className="text-[10px]">ช่อง</span></button>
        </div>
        <p className="text-[11px] text-ink-3 mt-1.5">รวมกว้าง ≈ {fmtNum(totalW)} ม. · {cols.length} ช่อง · {allPcs.length} บาน</p>
      </div>

      {sel && (
        <div className="flex items-center gap-1 flex-wrap rounded-lg bg-white/50 border border-black/5 px-2 py-1.5">
          <span className="text-[11px] font-semibold text-ink-3 mr-0.5">จัดเรียงบานที่เลือก:</span>
          <button type="button" className={arrCls} title="เลื่อนช่องไปซ้าย" onClick={() => onMoveCol(sel.key, -1)}>◀</button>
          <button type="button" className={arrCls} title="เลื่อนช่องไปขวา" onClick={() => onMoveCol(sel.key, 1)}>▶</button>
          <button type="button" className={arrCls} title="เลื่อนบานขึ้น (ในช่อง)" onClick={() => onMovePc(sel.key, -1)}>▲</button>
          <button type="button" className={arrCls} title="เลื่อนบานลง (ในช่อง)" onClick={() => onMovePc(sel.key, 1)}>▼</button>
          <button type="button" className={arrCls} title="เพิ่มบานด้านบน (ช่องเดียวกัน)" onClick={() => onAddPiece(sel.key, -1)}>＋บน</button>
          <button type="button" className={arrCls} title="เพิ่มบานด้านล่าง (ช่องเดียวกัน)" onClick={() => onAddPiece(sel.key, 1)}>＋ล่าง</button>
          {allPcs.length > 1 && (
            <button type="button" onClick={() => onRemovePane(sel.key)}
              className="press min-h-[32px] px-2.5 rounded-lg text-xs font-bold text-red-600 bg-red-50 hover:bg-red-100 ml-auto">ลบบานนี้</button>
          )}
        </div>
      )}

      {sel && (
        <div key={sel.key} ref={(el) => { cardRefs.current[sel.key] = el; }}
          className="rounded-lg border border-brand ring-2 ring-brand/30 bg-white/70 p-2.5 space-y-2 scroll-mt-2">
          <div className="text-[11px] font-semibold text-brand-dark">⚙️ ตั้งค่าบานที่เลือก</div>
          <div className="flex items-center gap-2 flex-wrap">
            <select value={sel.typeKey} onChange={(e) => onPatchPane(sel.key, { typeKey: e.target.value, addons: {}, form: undefined, spec: undefined, cut: undefined })}
              className="min-h-[40px] glass-soft rounded-lg px-2 py-1.5 text-xs font-semibold outline-none">
              {PANE_TYPES.map((t) => <option key={t.key} value={t.key}>{t.label}</option>)}
            </select>
            {(prod?.forms?.length ?? 0) > 0 && (
              <select value={sel.form || prod.defForm}
                onChange={(e) => onPatchPane(sel.key, { form: e.target.value, n: snapPanes(prod, e.target.value, sel.n || 1) })}
                className="min-h-[40px] glass-soft rounded-lg px-2 py-1.5 text-xs font-semibold outline-none" title="รูปแบบการเปิด (เหมือน G1)">
                {prod.forms.map((f: string) => <option key={f} value={f}>{f}</option>)}
              </select>
            )}
            {/* ประตู/หน้าต่าง — คุมคำขึ้นต้นในใบเสนอ · บานติดตายไม่ต้องเลือก (เป็นกระจกติดตายเสมอ) */}
            {paneUse(sel) !== "fixed" && (
              <select value={paneUse(sel)} onChange={(e) => onPatchPane(sel.key, { use: e.target.value as "door" | "window" })}
                className="min-h-[40px] glass-soft rounded-lg px-2 py-1.5 text-xs font-semibold outline-none" title="ขึ้นใบเสนอเป็นประตูหรือหน้าต่าง">
                <option value="door">ประตู</option>
                <option value="window">หน้าต่าง</option>
              </select>
            )}
            {/* พื้นล่างของประตู — label เท่านั้น ไม่กระทบราคา (ค่าธรณีหลังเต่าอยู่ในของเสริม) */}
            {paneUse(sel) === "door" && (
              <select value={paneSill(sel)} onChange={(e) => onPatchPane(sel.key, { sill: e.target.value })}
                className="min-h-[40px] glass-soft rounded-lg px-2 py-1.5 text-xs font-semibold outline-none" title="พื้นล่างประตู (ขึ้นในใบเสนอ)">
                {SILL_OPTS.map((o) => <option key={o} value={o}>{o}</option>)}
              </select>
            )}
            <input type="number" step={0.1} value={sel.w || ""} placeholder="กว้าง(ม.)"
              onChange={(e) => onPatchPane(sel.key, { w: +e.target.value || 0 })}
              className="min-h-[40px] glass-soft rounded-lg px-2 py-1.5 w-20 outline-none tabular-nums text-sm" />
            <input type="number" step={0.1} value={sel.h || ""} placeholder="สูง(ม.)"
              onChange={(e) => onPatchPane(sel.key, { h: +e.target.value || 0 })}
              className="min-h-[40px] glass-soft rounded-lg px-2 py-1.5 w-20 outline-none tabular-nums text-sm" />
            {/* รูปแบบที่ล็อกจำนวนบาน (เปิดคู่กลาง = 4/6) → เลือกจากลิสต์ · อื่น ๆ พิมพ์เลขได้ตามเดิม */}
            {formRule(prod, sel.form || prod?.defForm)?.panes?.length ? (
              <select value={String(sel.n || 1)} title="จำนวนบาน (รูปแบบนี้ล็อกไว้)"
                onChange={(e) => onPatchPane(sel.key, { n: Number(e.target.value) })}
                className="min-h-[40px] glass-soft rounded-lg px-2 py-1.5 outline-none text-xs font-semibold">
                {allowedPanes(prod, sel.form || prod?.defForm).map((v) => (
                  <option key={v} value={v}>{v} บาน (เลื่อน {v - 2} + ติดตาย 2)</option>
                ))}
              </select>
            ) : (
              <input type="number" value={sel.n || 1} placeholder="บาน"
                onChange={(e) => onPatchPane(sel.key, { n: Math.max(1, Math.round(+e.target.value) || 1) })}
                className="min-h-[40px] glass-soft rounded-lg px-2 py-1.5 w-16 outline-none tabular-nums text-sm" />
            )}
            <span className="text-sm font-semibold text-brand-dark tabular-nums">{fmtBaht(price)}</span>
            <button type="button" onClick={() => onRemovePane(sel.key)} className="press text-ink-3 hover:text-red-600 ml-auto min-h-[36px] min-w-[36px]">
              <Icon name="trash" size={14} />
            </button>
          </div>

          {/* คำอธิบายรูปแบบ (เปิดคู่กลาง = เลื่อน N−2 + ติดตาย 2) — ข้อความเดียวกับหน้า G1 */}
          {formNote(prod, sel.form || prod?.defForm) && (
            <p className="text-[11px] text-brand-dark bg-brand/5 border border-brand/20 rounded-lg px-2 py-1.5">
              ⓘ {formNote(prod, sel.form || prod?.defForm)}
            </p>
          )}

          {sel.typeKey === "sms_slide" || sel.typeKey === "euro_slide" ? (
            <label className="flex items-center gap-2 text-xs text-ink-3">
              บานติดตาย (ไม่เลื่อน)
              <input type="number" min={0} max={Math.max(0, (sel.n || 1) - 1)} value={sel.fixedPanes || 0}
                onChange={(e) => onPatchPane(sel.key, { fixedPanes: Math.max(0, Math.min((sel.n || 1) - 1, Math.round(+e.target.value) || 0)) })}
                className="min-h-[32px] w-16 glass-soft rounded-lg px-2 py-1 outline-none tabular-nums" />
              <span>· ที่เหลือ {movePanes} บานเลื่อน (ใช้คำนวณขนาดมุ้ง)</span>
            </label>
          ) : null}

          {/* ตัวเลือกของรุ่น (ราง / มือจับ SlimLux ฯลฯ) + มือจับจากใบตัด — ชุดเดียวกับหน้า G1 เป๊ะ
              เดิมห้องกระจกไม่มีช่องพวกนี้เลย → บานเดียวกันคิดคนละราคากับ G1 (แก้ 21 ส.ค.69) */}
          {((prod?.specOpts?.length ?? 0) > 0 || HW_FROM_CUTLIST.has(sel.typeKey)) && (
            <div className="flex items-center gap-2 flex-wrap text-[11px]">
              {(prod?.specOpts ?? []).map((o: any) => {
                // specOpts ตัวเลข (ขนาดประตู/ช่องปูนของ Shower) — ต้องกรอกได้เหมือน G1 ไม่งั้นคิดจากค่าตั้งต้นเสมอ
                if (o.type === "number") {
                  return (
                    <span key={o.key} className="inline-flex items-center gap-1">
                      <span className="text-ink-3">{o.label}</span>
                      <input type="number" step={o.step ?? 0.1} min={0} value={paneSpec(prod, sel)[o.key] ?? ""}
                        onChange={(e) => onPatchPane(sel.key, { spec: { ...paneSpec(prod, sel), [o.key]: e.target.value } })}
                        className="min-h-[32px] w-20 glass-soft rounded-lg px-2 py-1 outline-none tabular-nums text-xs" />
                    </span>
                  );
                }
                const opts: string[] = (o.optsByMaterial && o.optsByMaterial[prod.defMaterial]) || o.opts || [];
                const cur = paneSpec(prod, sel)[o.key];
                return (
                  <span key={o.key} className="inline-flex items-center gap-1">
                    <span className="text-ink-3">{o.label}</span>
                    <select value={opts.includes(cur) ? cur : (opts[0] ?? "")}
                      onChange={(e) => onPatchPane(sel.key, { spec: { ...paneSpec(prod, sel), [o.key]: e.target.value } })}
                      className="min-h-[32px] glass-soft rounded-lg px-2 py-1 outline-none text-xs">
                      {opts.map((v) => <option key={v} value={v}>{o.labels?.[v] ?? v}</option>)}
                    </select>
                  </span>
                );
              })}
              {HW_FROM_CUTLIST.has(sel.typeKey) && HANDLE_FIELDS.map((f) => (
                <span key={f.key} className="inline-flex items-center gap-1">
                  <span className="text-ink-3">{f.label}</span>
                  <select value={paneCut(sel)[f.key]}
                    onChange={(e) => onPatchPane(sel.key, { cut: { ...paneCut(sel), [f.key]: e.target.value } })}
                    className="min-h-[32px] glass-soft rounded-lg px-2 py-1 outline-none text-xs">
                    {f.choices.map((v) => <option key={v} value={v}>{v}</option>)}
                  </select>
                </span>
              ))}
            </div>
          )}

          {/* สี/กระจกต่อบาน override (ค่าว่าง = ตามด้าน/ห้อง) */}
          <div className="flex items-center gap-2 flex-wrap text-[11px]">
            <span className="text-ink-3">สีเฟรมบานนี้</span>
            <select value={sel.colorIdx || ""} onChange={(e) => onPatchPane(sel.key, { colorIdx: e.target.value })}
              className="min-h-[32px] glass-soft rounded-lg px-2 py-1 outline-none text-xs">
              <option value="">ตามด้าน ({ALU_COLOR_LABEL[color] ?? COLOR_LABEL[color] ?? color})</option>
              {aluColorKeysFor(sel?.typeKey).map((c) => <option key={c} value={c}>{ALU_COLOR_LABEL[c]}</option>)}
            </select>
            {prod?.defGlass && (
              <>
                <span className="text-ink-3">กระจก</span>
                <select value={sel.glassOvr || ""} onChange={(e) => onPatchPane(sel.key, { glassOvr: e.target.value })}
                  className="min-h-[32px] glass-soft rounded-lg px-2 py-1 outline-none text-xs">
                  <option value="">ตามด้าน ({glassFallback || prod.defGlass})</option>
                  {groupGlass(glassKeys).map((gp) => (
                    <optgroup key={gp.cat} label={gp.cat}>
                      {gp.items.map((g) => <option key={g} value={g}>{g}</option>)}
                    </optgroup>
                  ))}
                </select>
              </>
            )}
          </div>
          {/* ผนังแผ่นอลู (ลูกฟูก/คอมโพ) — สีพิเศษบวกอัตโนมัติตาม "สีเฟรม" ที่เลือก (เรตจาก R3.9) */}
          {prod?.showColor && (() => {
            const fin = SHEET_FIN[resolveAluColor(sel.colorIdx || color).bake] || 0;
            return <p className="text-[11px] text-ink-3">สีแผ่น: {fin > 0
              ? `สีพิเศษ +${fin.toLocaleString("th-TH")}/ตร.ม. (คิดอัตโนมัติตามสีที่เลือกด้านบน)`
              : "สีมาตรฐาน (อบขาว/ดำ) — ไม่บวกเพิ่ม"}</p>;
          })()}
          {mosqLabel && <p className="text-[11px] text-ink-3">มุ้ง: {mosqLabel}</p>}

          {/* per-pane option เต็ม — reuse AddonsSection ตรงกับ prod.addons จริงของชนิดบานนี้ (มือจับ/ล็อค/ธรณี/มุ้ง/ครอบวงกบ/ดรอปพื้น/รื้อของเดิม/ม่านซิปประตู ฯลฯ) */}
          {prod && (prod.addons || []).length > 0 && (
            <AddonsSection
              prod={prod}
              addons={sel.addons || {}}
              setAddons={(fn) => onPatchPane(sel.key, { addons: fn(sel.addons || {}) })}
              area={(sel.w || 1) * (sel.h || 1)}
              W={sel.w || 1}
              movePanes={movePanes}
              color={resolveAluColor(sel.colorIdx || color).bake}
              form={sel.form || prod.defForm}
            />
          )}
        </div>
      )}
    </div>
  );
}

export default function RoomComposer({
  pb, mainColor, mainGlass, profitPct, onTotal, initial,
}: {
  pb: any;
  mainColor: string;
  mainGlass: string;
  profitPct: number;
  onTotal?: (t: RoomTotals) => void;
  initial?: any; // state ที่บันทึกไว้ (0093) — ตั้งต้นทุกช่องตามสูตรเดิม (parent remount ด้วย key ตอนโหลด)
}) {
  const ini: any = initial || {};
  const [sides, setSides] = useState<Side[]>(() => (Array.isArray(ini.sides) && ini.sides.length ? ini.sides : [freshGlassSide(), freshGlassSide()]));
  const [tab, setTab] = useState<number>(0); // 0..sides.length-1 = ด้าน, +1 สี/กระจก, +2 หลังคา/ฝ้า, +3 งานเสริม, +4 สรุป
  const [selKey, setSelKey] = useState<number | null>(null); // บานที่เลือกในรูปด้าน (ไฮไลต์ + เลื่อนไปการ์ดตั้งค่า)
  const cardRefs = useRef<Record<number, HTMLDivElement | null>>({}); // อ้างการ์ดแต่ละบาน เพื่อ scrollIntoView ตอนคลิกในรูปด้าน
  function selectPane(key: number) {
    setSelKey(key);
    requestAnimationFrame(() => cardRefs.current[key]?.scrollIntoView({ behavior: "smooth", block: "nearest" }));
  }

  // สีอลู/กระจก แยกต่อด้าน (sideOvr) — key = side index, "" = ตามห้อง (ค่าใน pb.BAKE)
  const [sideColorOvr, setSideColorOvr] = useState<Record<number, { color: string; glass: string }>>(() => ini.sideColorOvr || {});

  // หลังคา
  const [roofOn, setRoofOn] = useState(!!ini.roofOn);
  // ทรงหลังคา (กันสาด/จั่ว/เลื่อน) — สลับ product จริงเหมือน G3 · มีผลราคา (คนละ BOM)
  const [roofShapeId, setRoofShapeId] = useState<string>(ini.roofShapeId ?? "roof");
  const [roofW, setRoofW] = useState(ini.roofW ?? "4");
  const [roofL, setRoofL] = useState(ini.roofL ?? "3");
  const [roofMaterial, setRoofMaterial] = useState(ini.roofMaterial ?? "ไวนิล");
  const [roofSegs, setRoofSegs] = useState<{ w: string; l: string }[]>(() => (Array.isArray(ini.roofSegs) ? ini.roofSegs : []));
  const [roofAddons, setRoofAddons] = useState<Record<string, any>>(() => ini.roofAddons || {});
  // product ของทรงที่เลือก (roof/roof_gable/roof_slide มีอยู่ครบใน products.mjs)
  //   ออปชั่น universal (roof_zip/elec/solid_panel) ใช้ตัวกลางตัวเดียวกับหน้าหลัก — ไม่แตะ products.mjs/verify
  const roofProdBase = (PRODUCTS as any)[roofShapeId] || (PRODUCTS as any).roof;
  const roofProd = useMemo(() => withUniversalAddons(roofProdBase), [roofProdBase]);
  const roofIsAwning = roofShapeId === "roof"; // มีเฉพาะกันสาดที่ทำ "หลายช่วง (ขยัก)"
  const roofShapeLabel = ROOF_SHAPE_LABEL[roofShapeId] || "";
  // สลับทรง → รีเซ็ตวัสดุถ้าทรงใหม่ไม่มีวัสดุนั้น (จั่ว/เลื่อน materials ≠ กันสาด)
  useEffect(() => {
    const mats: string[] = roofProd.materials || [];
    if (mats.length && !mats.includes(roofMaterial)) setRoofMaterial(roofProd.defMaterial || mats[0]);
    if (!roofIsAwning && roofSegs.length) setRoofSegs([]); // ขยักมีเฉพาะกันสาด
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [roofShapeId]);

  // ฝ้า
  const [ceilOn, setCeilOn] = useState(!!ini.ceilOn);
  const [ceilType, setCeilType] = useState(ini.ceilType ?? "smooth");
  const [ceilW, setCeilW] = useState(ini.ceilW ?? "4");
  const [ceilL, setCeilL] = useState(ini.ceilL ?? "3");
  const [ceilInsul, setCeilInsul] = useState(!!ini.ceilInsul);
  const [ceilPos, setCeilPos] = useState<"in" | "out">(ini.ceilPos === "out" ? "out" : "in");
  const [ceilDir, setCeilDir] = useState<"flat" | "slope">(ini.ceilDir === "slope" ? "slope" : "flat");

  // พื้น
  const [floorOn, setFloorOn] = useState(!!ini.floorOn);
  const [floorMat, setFloorMat] = useState<"smart" | "spc">(ini.floorMat === "spc" ? "spc" : "smart");
  const [floorW, setFloorW] = useState(ini.floorW ?? "4");
  const [floorL, setFloorL] = useState(ini.floorL ?? "3");
  const [floorRate, setFloorRate] = useState(ini.floorRate ?? "");
  const [floorDisc, setFloorDisc] = useState(ini.floorDisc ?? "");

  // พัดลม
  const [fanOn, setFanOn] = useState(!!ini.fanOn);
  const [fanQty, setFanQty] = useState(ini.fanQty ?? "1");
  const [fanPrice, setFanPrice] = useState(ini.fanPrice ?? "2500");

  // งานบริการเพิ่มเติม (กรอกเอง)
  const [services, setServices] = useState<{ desc: string; qty: string; rate: string }[]>(() => (Array.isArray(ini.services) ? ini.services : []));

  // รื้อ/ป้องกันหน้างาน
  const [demoRoof, setDemoRoof] = useState(ini.demoRoof ?? "0");
  const [demoFloor, setDemoFloor] = useState(ini.demoFloor ?? "0");
  const [demoRail, setDemoRail] = useState(!!ini.demoRail);
  const [demoRailLen, setDemoRailLen] = useState(ini.demoRailLen ?? "0");
  const [demoDoor, setDemoDoor] = useState(ini.demoDoor ?? "0");
  const [protectOn, setProtectOn] = useState(!!ini.protectOn);
  const [protectPts, setProtectPts] = useState(ini.protectPts ?? "0");

  const [remarks, setRemarks] = useState(ini.remarks ?? "");

  const nSideTabs = sides.length;
  const TAB_COLOR = nSideTabs, TAB_ROOF = nSideTabs + 1, TAB_EXTRA = nSideTabs + 2, TAB_SUMMARY = nSideTabs + 3;

  function sideColor(i: number) { return sideColorOvr[i]?.color || mainColor; }
  function sideGlass(i: number) { return sideColorOvr[i]?.glass || mainGlass; }

  const sideTotals = useMemo(
    () => sides.map((s, i) => sideTotal(s, pb, sideColor(i), sideGlass(i), profitPct)),
    [sides, pb, sideColorOvr, mainColor, mainGlass, profitPct]
  );

  const roofArea = useMemo(() => {
    const base = (Number(roofW) || 0) * (Number(roofL) || 0);
    const extra = roofSegs.reduce((a, s) => a + (Number(s.w) || 0) * (Number(s.l) || 0), 0);
    return base + extra;
  }, [roofW, roofL, roofSegs]);

  const roofTotal = useMemo(() => {
    if (!roofOn) return 0;
    const prod = roofProd;
    if (!prod) return 0;
    const w = Number(roofW) || 4, l = Number(roofL) || 3;
    // เลื่อน (roof_slide) จำนวนบานเริ่ม 2 · อื่น ๆ 1
    const pnl = prod.defaults?.p ?? 1;
    const rOpt: any = {
      w: w * 100, h: l * 100, p: pnl, form: prod.defForm, material: roofMaterial, profitPct, installProfitPct: profitPct, addons: roofAddons,
    };
    // ม่านซิปบนหลังคา (Skylight) — คิดจากรุ่นม่านซิปจริง ส่งเข้า opt.roofZipR4 (แบบ mosquito)
    const rzR4 = computeRoofZipR4(roofAddons, { wCm: w * 100, hCm: l * 100 }, pb, profitPct);
    if (rzR4) rOpt.roofZipR4 = rzR4;
    const r: any = computeCost(pb, prod, rOpt);
    let t = r.sell.withInstall;
    // หลังคาหลายช่วง (ขยัก) — เฉพาะกันสาด · ช่วงเพิ่มคิดตามขนาดจริง วัสดุ/สีตามช่วงหลัก
    if (roofIsAwning) roofSegs.forEach((sg) => {
      const sw = (Number(sg.w) || 0) * 100, sh = (Number(sg.l) || 0) * 100;
      if (!(sw > 0 && sh > 0)) return;
      const sr: any = computeCost(pb, prod, { w: sw, h: sh, p: 1, form: prod.defForm, material: roofMaterial, profitPct, installProfitPct: profitPct, addons: {} });
      t += sr.sell.withInstall;
    });
    return t;
  }, [roofOn, roofShapeId, roofW, roofL, roofMaterial, roofSegs, roofAddons, pb, profitPct]);

  const ceilTotal = useMemo(() => {
    if (!ceilOn) return 0;
    return ceilPrice(ceilType, Number(ceilW) || 0, Number(ceilL) || 0, ceilInsul, pb, profitPct);
  }, [ceilOn, ceilType, ceilW, ceilL, ceilInsul, pb, profitPct]);

  const floorTotal = useMemo(() => {
    if (!floorOn) return 0;
    return floorPrice(floorMat, Number(floorW) || 0, Number(floorL) || 0, Number(floorRate) || 0, floorDisc);
  }, [floorOn, floorMat, floorW, floorL, floorRate, floorDisc]);

  const fanTotal = useMemo(() => {
    if (!fanOn) return 0;
    return (Number(fanQty) || 0) * (Number(fanPrice) || 0);
  }, [fanOn, fanQty, fanPrice]);

  const servicesTotal = useMemo(
    () => services.reduce((a, s) => a + (Number(s.qty) || 0) * (Number(s.rate) || 0), 0),
    [services]
  );

  const svcTotal = useMemo(() => {
    let t = svcDemoTotal({ roof: Number(demoRoof) || 0, floor: Number(demoFloor) || 0, rail: demoRail ? 1 : 0, railLen: Number(demoRailLen) || 0, door: Number(demoDoor) || 0 });
    if (protectOn) t += 2000 + (Number(protectPts) || 0) * 1000;
    return t;
  }, [demoRoof, demoFloor, demoRail, demoRailLen, demoDoor, protectOn, protectPts]);

  // ส่วนเพิ่มราคาระดับห้อง (สี/กระจกหลัก) — เฉพาะด้านที่ "ไม่ได้" override ต่อด้าน (ด้าน override คิดราคาแล้วใน sideTotal ตรงๆ)
  // หมายเหตุ: sideColor()/sideGlass() ผูกกับ mainColor/mainGlass อยู่แล้วเมื่อไม่ override → ไม่มี premium ซ้ำซ้อนให้คิดเพิ่มที่นี่ (ต่างจากเครื่องเดิมที่แยก mode real/opt)
  const roomTotal = useMemo(() => {
    const t = sideTotals.reduce((a, b) => a + b, 0) + roofTotal + ceilTotal + floorTotal + fanTotal + servicesTotal + svcTotal;
    return ceil100(t);
  }, [sideTotals, roofTotal, ceilTotal, floorTotal, fanTotal, servicesTotal, svcTotal]);

  // รายละเอียดรายด้าน (ชนิดบาน+รูปแบบ+ขนาด+กระจก) — ไปขึ้นใบเสนอราคาให้ครบ (แก้ปัญหา G6 ปริ้นไม่มีรายละเอียด)
  const sideDescs = useMemo(() => sides.map((s) => {
    // ผนัง: บอกชนิดผนัง + ของเสริมผนัง ไว้หน้าสุด (ขนาดไปรวมท้ายบรรทัดแล้ว ไม่ซ้ำตรงนี้)
    const wallLabel = s.kind === "wall"
      ? `${WALL_TYPES.find((w) => w.key === s.wallType)?.label || "ผนัง"}${addonSummary(s.addons).replace(/^ \+ /, " ")}`
      : "";
    return sideDescQuote(s, wallLabel);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }), [sides]);

  // รายละเอียดหลังคา/ฝ้า (ชนิด+ขนาด) → ขึ้นใบเสนอราคา (เดิมมีแค่ยอด ฿)
  const roofDesc = roofOn ? `หลังคา${roofShapeLabel} ${roofMaterial} ${roofW}×${roofL} ม.` : "";
  const ceilDesc = ceilOn ? `ฝ้า ${CEIL_TYPES.find((t) => t.key === ceilType)?.label || ceilType} ${ceilW}×${ceilL} ม.` : "";

  // สเปคสรุป (หมวด "รายละเอียดงาน") — มุ้ง(ด้านไหน) / หลังคา(วัสดุ+รางน้ำ ฯลฯ) · สีอลู+กระจก เติมฝั่ง client
  const specLines = useMemo(() => {
    const out: string[] = [];
    const mosqSides = sides.map((s, i) => (sidePanes(s).some((p) => p.addons?.mosquito) ? L(i) : "")).filter(Boolean);
    if (mosqSides.length) out.push(`มุ้ง: ด้าน ${mosqSides.join(", ")}`);
    if (roofOn) {
      const extras = addonSummary(roofAddons).replace(/^ \+ /, "");
      out.push(`หลังคา${roofShapeLabel}: ${roofMaterial}${extras ? ` (${extras})` : ""}`);
    }
    return out;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sides, roofOn, roofShapeId, roofMaterial, roofAddons]);

  // สแนป state ทั้งห้อง (0093) — parent เก็บเป็น "สูตร" ในใบเสนอ · โหลดกลับผ่าน prop initial
  const savedState = {
    sides, sideColorOvr,
    roofOn, roofShapeId, roofW, roofL, roofMaterial, roofSegs, roofAddons,
    ceilOn, ceilType, ceilW, ceilL, ceilInsul, ceilPos, ceilDir,
    floorOn, floorMat, floorW, floorL, floorRate, floorDisc,
    fanOn, fanQty, fanPrice, services,
    demoRoof, demoFloor, demoRail, demoRailLen, demoDoor, protectOn, protectPts, remarks,
  };
  const savedKey = JSON.stringify(savedState);

  // แจ้ง parent (Calculator40Client เอาไปโชว์เป็นราคาหลัก + เพิ่มลงใบเสนอราคา)
  // dep รวม savedKey — state เปลี่ยนแม้ยอดเท่าเดิม (เช่น สลับตำแหน่ง/หมายเหตุ) สูตรก็ตามทัน
  useMemo(() => {
    onTotal?.({ total: roomTotal, sides: sideTotals, sideDescs, roofDesc, ceilDesc, specLines, roof: roofTotal, ceil: ceilTotal, floor: floorTotal, fan: fanTotal, services: servicesTotal, svc: svcTotal, state: savedState });
    return null;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [roomTotal, savedKey]);

  function addSide() {
    setSides((s) => [...s, freshGlassSide()]);
    setTab(sides.length);
  }
  // ก๊อปด้าน (เจ้าของสั่ง 18 ส.ค.69) — ด้าน A/C มักเหมือนกัน (กลับซ้าย-ขวา) ก๊อปแล้วแก้ต่อเร็วกว่าทำใหม่
  //   แทรกด้านใหม่ต่อท้ายด้านที่ก๊อป · re-key ทุก col/pane (กันชน React key + แก้ด้านนึงไปโดนอีกด้าน)
  //   + เลื่อน sideColorOvr (map ผูกด้วย index) ให้ตรงตำแหน่งใหม่ + ก๊อป override ของด้านต้นทางไปด้านสำเนา
  function copySide(i: number) {
    const reKey = (cols?: Col[]) =>
      cols?.map((c) => ({ ...c, key: newKey(), pcs: c.pcs.map((p) => ({ ...p, key: newKey() })) }));
    setSides((s) => {
      const cloned = JSON.parse(JSON.stringify(s[i])) as Side;
      const c = cloned as { cols?: Col[]; stash?: SideStash };
      if (Array.isArray(c.cols)) c.cols = reKey(c.cols);
      if (c.stash) {
        if (c.stash.glass) c.stash.glass = reKey(c.stash.glass);
        if (c.stash.open) c.stash.open = reKey(c.stash.open);
        if (c.stash.wall?.cols) c.stash.wall.cols = reKey(c.stash.wall.cols);
      }
      return [...s.slice(0, i + 1), cloned, ...s.slice(i + 1)];
    });
    // map ผูกด้วย index → sides หลังจุดแทรกขยับ +1 · ด้านสำเนา (i+1) รับ override ของด้านต้นทาง
    setSideColorOvr((m) => {
      const next: Record<number, { color: string; glass: string }> = {};
      for (const [k, v] of Object.entries(m)) {
        const idx = Number(k);
        next[idx <= i ? idx : idx + 1] = v;
      }
      if (m[i]) next[i + 1] = { ...m[i] };
      return next;
    });
    setTab(i + 1);
  }
  function removeSide(i: number) {
    setSides((s) => s.filter((_, xi) => xi !== i));
    // sideColorOvr ผูกด้วย index → ลบคีย์ของด้านที่ลบ + เลื่อนคีย์ด้านหลังลง 1 (เดิมไม่เลื่อน = สีไปโผล่ผิดด้าน)
    setSideColorOvr((m) => {
      const next: Record<number, { color: string; glass: string }> = {};
      for (const [k, v] of Object.entries(m)) {
        const idx = Number(k);
        if (idx === i) continue;
        next[idx < i ? idx : idx - 1] = v;
      }
      return next;
    });
    setTab((t) => Math.max(0, Math.min(t, sides.length - 2)));
  }
  function setSideKind(i: number, kind: Side["kind"]) {
    setSides((s) => s.map((x, xi) => {
      if (xi !== i || x.kind === kind) return x;
      // เก็บข้อมูลชนิดปัจจุบันลง stash ก่อนสลับ → สลับกลับมาได้เหมือนเดิม (ไม่หาย) — cols (ประตู/หน้าต่าง) ของ
      // wall/open ก็ stash ไปด้วย (wall: ผูกกับ WallData เดียวกัน · open: เก็บแยก stash.open)
      const stash: SideStash = { ...(x.stash || {}) };
      if (x.kind === "glass") stash.glass = x.cols;
      else if (x.kind === "wall") stash.wall = { wallType: x.wallType, aw: x.aw, ah: x.ah, addons: x.addons, cols: x.cols };
      else if (x.kind === "open") stash.open = x.cols;
      // สลับไปชนิดใหม่ → คืนค่าจาก stash ถ้าเคยตั้งไว้ · ไม่เคย = ค่าตั้งต้น
      if (kind === "glass") return { kind: "glass", cols: stash.glass ?? [freshCol()], stash };
      if (kind === "wall") return stash.wall ? { kind: "wall", ...stash.wall, stash } : { ...(freshWallSide() as Extract<Side, { kind: "wall" }>), stash };
      return { kind: "open", cols: stash.open ?? [], stash };
    }));
  }
  function patchWall(i: number, p: Partial<Extract<Side, { kind: "wall" }>>) {
    setSides((s) => s.map((x, xi) => (xi === i && x.kind === "wall" ? { ...x, ...p } : x)));
  }
  // แก้ cols ของด้าน — ใช้ร่วมกันทั้ง glass/wall/open (ประตู/หน้าต่างในด้านผนัง/เปิดโล่ง ก็แก้ผ่านฟังก์ชันเดียวกัน)
  function updateCols(i: number, fn: (cols: Col[]) => Col[]) {
    setSides((s) => s.map((x, xi) => {
      if (xi !== i) return x;
      if (x.kind === "glass") return { ...x, cols: fn(x.cols) };
      if (x.kind === "wall" || x.kind === "open") return { ...x, cols: fn(x.cols || []) };
      return x;
    }));
  }
  function patchPane(i: number, key: number, p: Partial<Pane>) {
    updateCols(i, (cols) => cols.map((c) => ({ ...c, pcs: c.pcs.map((pc) => (pc.key === key ? { ...pc, ...p } : pc)) })));
  }
  function removePane(i: number, key: number) {
    updateCols(i, (cols) => cols.map((c) => ({ ...c, pcs: c.pcs.filter((pc) => pc.key !== key) })).filter((c) => c.pcs.length > 0));
  }
  // ＋ช่อง — เพิ่มช่องใหม่ (คอลัมน์) ทางขวา
  function addColumn(i: number) {
    const col = freshCol();
    updateCols(i, (cols) => [...cols, col]);
    setSelKey(col.pcs[0].key);
  }
  // ＋บน(-1)/＋ล่าง(1) — เพิ่มบานซ้อนในช่องเดียวกับบานที่เลือก
  function addPiece(i: number, key: number, dir: -1 | 1) {
    const np = freshPane();
    updateCols(i, (cols) => cols.map((c) => {
      const idx = c.pcs.findIndex((x) => x.key === key);
      if (idx < 0) return c;
      const pcs = [...c.pcs];
      pcs.splice(dir < 0 ? idx : idx + 1, 0, np);
      return { ...c, pcs };
    }));
    setSelKey(np.key);
  }
  // ◀▶ — เลื่อนทั้งช่องซ้าย/ขวา
  function moveCol(i: number, key: number, dir: -1 | 1) {
    updateCols(i, (cols) => {
      const ci = cols.findIndex((c) => c.pcs.some((x) => x.key === key));
      const j = ci + dir;
      if (ci < 0 || j < 0 || j >= cols.length) return cols;
      const arr = [...cols];
      [arr[ci], arr[j]] = [arr[j], arr[ci]];
      return arr;
    });
  }
  // ▲▼ — เลื่อนบานขึ้น/ลงในช่องเดียวกัน
  function movePc(i: number, key: number, dir: -1 | 1) {
    updateCols(i, (cols) => cols.map((c) => {
      const idx = c.pcs.findIndex((x) => x.key === key);
      if (idx < 0) return c;
      const j = idx + dir;
      if (j < 0 || j >= c.pcs.length) return c;
      const pcs = [...c.pcs];
      [pcs[idx], pcs[j]] = [pcs[j], pcs[idx]];
      return { ...c, pcs };
    }));
  }

  return (
    <div className="mt-4 space-y-3 rounded-2xl glass-soft p-4">
      <div className="text-sm font-bold text-brand-dark flex items-center gap-1.5">
        <Icon name="building" size={16} /> ห้องกระจก (ประกอบ) <span className="text-xs font-normal text-ink-3">(หลายด้าน + ผนัง + ฝ้า + หลังคา + พื้น/พัดลม/บริการ · คิดด้วย R4.0 จริง)</span>
      </div>

      {/* แท็บ */}
      <div className="flex flex-wrap gap-1.5">
        {sides.map((_, i) => (
          <button key={i} type="button" onClick={() => setTab(i)}
            className={`press text-xs font-semibold rounded-full px-3 py-1.5 min-h-[36px] ${tab === i ? "bg-brand text-white" : "glass-soft text-ink-2"}`}>
            ด้าน {L(i)}
          </button>
        ))}
        <button type="button" onClick={addSide}
          className="press text-xs font-semibold rounded-full px-3 py-1.5 min-h-[36px] glass-soft text-ink-2 hover:bg-white/70">
          ＋ด้าน
        </button>
        <button type="button" onClick={() => setTab(TAB_COLOR)}
          className={`press text-xs font-semibold rounded-full px-3 py-1.5 min-h-[36px] ${tab === TAB_COLOR ? "bg-brand text-white" : "glass-soft text-ink-2"}`}>
          สี/กระจก
        </button>
        <button type="button" onClick={() => setTab(TAB_ROOF)}
          className={`press text-xs font-semibold rounded-full px-3 py-1.5 min-h-[36px] ${tab === TAB_ROOF ? "bg-brand text-white" : "glass-soft text-ink-2"}`}>
          หลังคา/ฝ้า
        </button>
        <button type="button" onClick={() => setTab(TAB_EXTRA)}
          className={`press text-xs font-semibold rounded-full px-3 py-1.5 min-h-[36px] ${tab === TAB_EXTRA ? "bg-brand text-white" : "glass-soft text-ink-2"}`}>
          พื้น/พัดลม/บริการ
        </button>
        <button type="button" onClick={() => setTab(TAB_SUMMARY)}
          className={`press text-xs font-semibold rounded-full px-3 py-1.5 min-h-[36px] ${tab === TAB_SUMMARY ? "bg-brand text-white" : "glass-soft text-ink-2"}`}>
          สรุป
        </button>
      </div>

      {/* หน้าด้าน */}
      {tab < nSideTabs && (() => {
        const i = tab, s = sides[i];
        return (
          <div className="rounded-xl border border-black/5 bg-white/60 p-3 space-y-2.5">
            <div className="flex items-center justify-between">
              <span className="text-sm font-semibold text-ink-2">ด้าน {L(i)}</span>
              <div className="flex items-center gap-3">
                <button type="button" onClick={() => copySide(i)} className="press text-xs text-brand flex items-center gap-1 min-h-[36px]" title="ก๊อปด้านนี้เป็นด้านใหม่ (แล้วแก้ต่อได้)">
                  <Icon name="copy" size={13} /> ก๊อปด้านนี้
                </button>
                {sides.length > 1 && (
                  <button type="button" onClick={() => removeSide(i)} className="press text-xs text-red-600 flex items-center gap-1 min-h-[36px]">
                    <Icon name="trash" size={13} /> ลบด้าน
                  </button>
                )}
              </div>
            </div>
            <div className="flex flex-wrap gap-1.5">
              {([["glass", "กระจก/บาน"], ["wall", "ผนัง"], ["open", "เปิดโล่ง"]] as [Side["kind"], string][]).map(([k, l]) => (
                <button key={k} type="button" onClick={() => setSideKind(i, k)}
                  className={`press text-xs font-semibold rounded-full px-3 py-1.5 min-h-[36px] ${s.kind === k ? "bg-brand text-white" : "glass-soft text-ink-2"}`}>
                  {l}
                </button>
              ))}
            </div>

            {s.kind === "glass" && (
              <div className="space-y-2">
                {/* 🖼️ รูปด้าน (2 มิติ) — ช่องซ้าย→ขวา · ในช่องซ้อนบน→ล่าง · คลิกเลือกบาน แล้วใช้แถบจัดเรียง ◀▶▲▼ ＋บน/ล่าง/ช่อง (พาริตี้ R3.9 G6R) */}
                <ColsEditor
                  cols={s.cols}
                  selKey={selKey}
                  onSelect={selectPane}
                  cardRefs={cardRefs}
                  pb={pb}
                  color={sideColor(i)}
                  glassFallback={sideGlass(i)}
                  profitPct={profitPct}
                  onPatchPane={(key, p) => patchPane(i, key, p)}
                  onRemovePane={(key) => removePane(i, key)}
                  onAddColumn={() => addColumn(i)}
                  onAddPiece={(key, dir) => addPiece(i, key, dir)}
                  onMoveCol={(key, dir) => moveCol(i, key, dir)}
                  onMovePc={(key, dir) => movePc(i, key, dir)}
                />
              </div>
            )}

            {s.kind === "wall" && (() => {
              const wallPaneArea = paneAreaSum(s);
              const fullArea = (s.aw || 3) * (s.ah || 2.6);
              const netArea = Math.max(0, fullArea - wallPaneArea);
              return (
                <div className="space-y-2.5">
                  <div className="flex flex-wrap gap-1.5">
                    {WALL_TYPES.map((t) => (
                      <button key={t.key} type="button" onClick={() => patchWall(i, { wallType: t.key })}
                        className={`press text-xs font-semibold rounded-full px-3 py-1.5 min-h-[36px] ${s.wallType === t.key ? "bg-brand text-white" : "glass-soft text-ink-2"}`}>
                        {t.label}
                      </button>
                    ))}
                  </div>
                  <div className="flex items-center gap-2 flex-wrap text-sm">
                    <span className="text-xs text-ink-3">ขนาด</span>
                    <input type="number" step={0.1} value={s.aw || ""} onChange={(e) => patchWall(i, { aw: +e.target.value || 0 })}
                      className="min-h-[40px] glass-soft rounded-lg px-2 py-1.5 w-20 outline-none tabular-nums" />
                    <span className="text-ink-3">×</span>
                    <input type="number" step={0.1} value={s.ah || ""} onChange={(e) => patchWall(i, { ah: +e.target.value || 0 })}
                      className="min-h-[40px] glass-soft rounded-lg px-2 py-1.5 w-20 outline-none tabular-nums" />
                    <span className="text-ink-3">ม.</span>
                    <span className="ml-2 font-semibold text-brand-dark tabular-nums">{fmtBaht(wallPrice(s, pb, profitPct))}</span>
                  </div>
                  {/* รูปด้านผนัง — วาดประตู/หน้าต่างเจาะในผนัง (ลายทแยง) + ป้ายชนิดผนัง + พื้นที่สุทธิ (หักช่องบาน) */}
                  <WallElevation
                    aw={s.aw || 3}
                    ah={s.ah || 2.6}
                    wallLabel={`ผนัง ${WALL_TYPES.find((t) => t.key === s.wallType)?.label || ""}`.trim()}
                    cols={sideCols(s)}
                    netArea={netArea}
                    fullArea={fullArea}
                    paneArea={wallPaneArea}
                    selKey={selKey}
                    onSelect={selectPane}
                  />
                  {s.wallType === "light" && (
                    <p className="text-[11px] text-ink-3">ผนังเบา flat 1,350/ตร.ม. (R3.9 — ยังไม่มี R4.0 cost ของผนังเบาชนิดบางนี้)</p>
                  )}
                  {s.wallType !== "light" && (prod => prod?.addons?.length ? (
                    <AddonsSection
                      prod={prod}
                      addons={s.addons || {}}
                      setAddons={(fn) => patchWall(i, { addons: fn(s.addons || {}) })}
                      area={(s.aw || 3) * (s.ah || 2.6)}
                      W={s.aw || 3}
                      movePanes={1}
                      color={resolveAluColor(mainColor).bake}
                      form={prod.defForm}
                    />
                  ) : null)((PRODUCTS as any)[s.wallType === "smartboard" ? "wall_smartboard" : "wall_isowall"])}

                  {/* ประตู/หน้าต่างในด้านผนังนี้ — reuse ตัวแก้ไขบานเดียวกับด้านกระจก (หักพื้นที่ผนังสุทธิด้านบนอัตโนมัติ) */}
                  <div className="pt-2.5 border-t border-black/5">
                    <div className="text-xs font-semibold text-ink-2 mb-1.5 flex items-center gap-1">
                      <Icon name="door-open" size={13} /> ประตู/หน้าต่างในด้านนี้
                    </div>
                    <ColsEditor
                      cols={sideCols(s)}
                      selKey={selKey}
                      onSelect={selectPane}
                      cardRefs={cardRefs}
                      pb={pb}
                      color={sideColor(i)}
                      glassFallback={sideGlass(i)}
                      profitPct={profitPct}
                      onPatchPane={(key, p) => patchPane(i, key, p)}
                      onRemovePane={(key) => removePane(i, key)}
                      onAddColumn={() => addColumn(i)}
                      onAddPiece={(key, dir) => addPiece(i, key, dir)}
                      onMoveCol={(key, dir) => moveCol(i, key, dir)}
                      onMovePc={(key, dir) => movePc(i, key, dir)}
                    />
                  </div>
                </div>
              );
            })()}

            {s.kind === "open" && (
              <div className="space-y-2.5">
                <p className="text-sm text-ink-3">เปิดโล่ง / ติดอาคารเดิม — ไม่มีงานกั้นด้านนี้ (0 บาท) · ใส่ประตู/หน้าต่างเพิ่มได้ด้านล่าง</p>
                <div className="pt-2.5 border-t border-black/5">
                  <div className="text-xs font-semibold text-ink-2 mb-1.5 flex items-center gap-1">
                    <Icon name="door-open" size={13} /> ประตู/หน้าต่างในด้านนี้
                  </div>
                  <ColsEditor
                    cols={sideCols(s)}
                    selKey={selKey}
                    onSelect={selectPane}
                    cardRefs={cardRefs}
                    pb={pb}
                    color={sideColor(i)}
                    glassFallback={sideGlass(i)}
                    profitPct={profitPct}
                    onPatchPane={(key, p) => patchPane(i, key, p)}
                    onRemovePane={(key) => removePane(i, key)}
                    onAddColumn={() => addColumn(i)}
                    onAddPiece={(key, dir) => addPiece(i, key, dir)}
                    onMoveCol={(key, dir) => moveCol(i, key, dir)}
                    onMovePc={(key, dir) => movePc(i, key, dir)}
                  />
                </div>
              </div>
            )}
          </div>
        );
      })()}

      {/* หน้าสี/กระจกต่อด้าน */}
      {tab === TAB_COLOR && (
        <div className="rounded-xl border border-black/5 bg-white/60 p-3 space-y-3">
          <p className="text-xs text-ink-3">ค่าเริ่มต้นทุกด้าน = สี/กระจกหลักของฟอร์ม (ด้านบนสุด) · override เฉพาะด้านที่ต้องการเปลี่ยน</p>
          {sides.map((s, i) => s.kind !== "glass" ? null : (
            <div key={i} className="flex items-center gap-2 flex-wrap text-sm border-b border-black/5 pb-2 last:border-0">
              <span className="font-semibold text-ink-2 w-16 shrink-0">ด้าน {L(i)}</span>
              <select value={sideColorOvr[i]?.color || ""} onChange={(e) => setSideColorOvr((m) => ({ ...m, [i]: { color: e.target.value, glass: m[i]?.glass || "" } }))}
                className="min-h-[40px] glass-soft rounded-lg px-2 py-1.5 outline-none text-xs">
                <option value="">สีตามห้อง ({ALU_COLOR_LABEL[mainColor] ?? COLOR_LABEL[mainColor] ?? mainColor})</option>
                {colorKeysForSide(s).map((c) => <option key={c} value={c}>{ALU_COLOR_LABEL[c]}</option>)}
              </select>
              <select value={sideColorOvr[i]?.glass || ""} onChange={(e) => setSideColorOvr((m) => ({ ...m, [i]: { color: m[i]?.color || "", glass: e.target.value } }))}
                className="min-h-[40px] glass-soft rounded-lg px-2 py-1.5 outline-none text-xs">
                <option value="">กระจกตามห้อง ({mainGlass || "—"})</option>
                {groupGlass(allGlassKeys(pb)).map((gp) => (
                  <optgroup key={gp.cat} label={gp.cat}>
                    {gp.items.map((g) => <option key={g} value={g}>{g}</option>)}
                  </optgroup>
                ))}
              </select>
              {(sideColorOvr[i]?.color || sideColorOvr[i]?.glass) && (
                <button type="button" onClick={() => setSideColorOvr((m) => { const n = { ...m }; delete n[i]; return n; })}
                  className="press text-[11px] text-red-600 min-h-[32px]">ล้าง override</button>
              )}
            </div>
          ))}
          <p className="text-[11px] text-ink-3">แต่ละบานยังปรับสี/กระจกเฉพาะบานได้อีกชั้นในหน้าด้าน (ละเอียดกว่าระดับด้าน)</p>
        </div>
      )}

      {/* หน้าหลังคา/ฝ้า */}
      {tab === TAB_ROOF && (
        <div className="rounded-xl border border-black/5 bg-white/60 p-3 space-y-4">
          <div>
            <div className="flex items-center justify-between">
              <span className="text-sm font-semibold text-ink-2 flex items-center gap-1.5"><Icon name="factory" size={14} /> หลังคา</span>
              <button type="button" onClick={() => setRoofOn((v) => !v)}
                className={`press text-xs font-semibold rounded-full px-3 py-1.5 min-h-[36px] ${roofOn ? "bg-brand text-white" : "glass-soft text-ink-2"}`}>
                {roofOn ? "มีหลังคา ✓" : "＋ ใส่หลังคา"}
              </button>
            </div>
            {roofOn && (
              <div className="mt-2 space-y-2.5">
                {/* ทรงหลังคา (กันสาด/จั่ว/เลื่อน) — สลับ product จริงเหมือน G3 · มีผลราคา */}
                <div>
                  <span className="text-xs font-medium text-ink-3">ทรงหลังคา</span>
                  <div className="flex flex-wrap gap-1.5 mt-1">
                    {ROOF_SHAPES.filter(([pid]) => (PRODUCTS as any)[pid]).map(([pid, label]) => (
                      <button key={pid} type="button" onClick={() => setRoofShapeId(pid)}
                        className={`press text-xs font-semibold rounded-full px-3 py-1.5 min-h-[32px] ${roofShapeId === pid ? "bg-brand text-white" : "glass-soft text-ink-2"}`}>
                        {label}
                      </button>
                    ))}
                  </div>
                </div>
                <div className="flex items-center gap-2 flex-wrap text-sm">
                  <span className="text-xs text-ink-3">{roofIsAwning ? "กว้าง×ยื่น" : "กว้าง×ลึก"}</span>
                  <input type="number" step={0.1} value={roofW} onChange={(e) => setRoofW(e.target.value)}
                    className="min-h-[40px] glass-soft rounded-lg px-2 py-1.5 w-20 outline-none tabular-nums" />
                  <span className="text-ink-3">×</span>
                  <input type="number" step={0.1} value={roofL} onChange={(e) => setRoofL(e.target.value)}
                    className="min-h-[40px] glass-soft rounded-lg px-2 py-1.5 w-20 outline-none tabular-nums" />
                  <span className="text-ink-3">ม.</span>
                  <span className="ml-2 font-semibold text-brand-dark tabular-nums">{fmtBaht(roofTotal)}</span>
                </div>
                <label className="block">
                  <span className="text-xs font-medium text-ink-3">วัสดุมุงหลังคา</span>
                  <select value={roofMaterial} onChange={(e) => setRoofMaterial(e.target.value)}
                    className="w-full min-h-[40px] glass-soft rounded-lg px-2 py-1.5 mt-1 outline-none text-sm">
                    {(roofProd.materials || []).map((m: string) => <option key={m} value={m}>{m}</option>)}
                  </select>
                </label>

                {/* หลังคาหลายช่วง (ขยัก) — เฉพาะกันสาด */}
                {roofIsAwning && (
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-semibold text-ink-2">หลังคาหลายช่วง (ขยัก)</span>
                    <button type="button" onClick={() => setRoofSegs((s) => [...s, { w: "3", l: "2" }])}
                      className="press text-[11px] font-semibold rounded-full px-2.5 py-1 min-h-[32px] glass-soft text-ink-2">＋ เพิ่มช่วง</button>
                  </div>
                  {roofSegs.map((sg, si) => (
                    <div key={si} className="flex items-center gap-2">
                      <span className="text-[11px] text-ink-3 w-14">ช่วง {si + 2}</span>
                      <input type="number" step={0.1} placeholder="กว้าง(ม.)" value={sg.w}
                        onChange={(e) => setRoofSegs((arr) => arr.map((x, xi) => xi === si ? { ...x, w: e.target.value } : x))}
                        className="min-h-[36px] glass-soft rounded-lg px-2 py-1 w-20 outline-none tabular-nums text-xs" />
                      <input type="number" step={0.1} placeholder="ลึก(ม.)" value={sg.l}
                        onChange={(e) => setRoofSegs((arr) => arr.map((x, xi) => xi === si ? { ...x, l: e.target.value } : x))}
                        className="min-h-[36px] glass-soft rounded-lg px-2 py-1 w-20 outline-none tabular-nums text-xs" />
                      <button type="button" onClick={() => setRoofSegs((arr) => arr.filter((_, xi) => xi !== si))}
                        className="press text-ink-3 hover:text-red-600 min-h-[32px] min-w-[32px]"><Icon name="trash" size={13} /></button>
                    </div>
                  ))}
                  {roofSegs.length > 0 && <p className="text-[11px] text-ink-3">รวมพื้นที่หลังคา ≈ {fmtNum(roofArea)} ตร.ม. (ของเสริมด้านล่างคิดที่ช่วงหลัก)</p>}
                </div>
                )}

                {/* ของเสริมหลังคาเต็ม (รางน้ำ/เสา/เลื่อน+มอเตอร์/ซ่อนสโลป/ครอบ/sealer/ฝ้าใต้หลังคา ฯลฯ) — ตาม addons ของทรงที่เลือก */}
                <AddonsSection
                  prod={roofProd}
                  addons={roofAddons}
                  setAddons={setRoofAddons}
                  area={roofArea}
                  W={Number(roofW) || 4}
                  movePanes={roofProd.defaults?.p ?? 1}
                  color={resolveAluColor(mainColor).bake}
                  form={roofProd.defForm}
                />
              </div>
            )}
          </div>
          <div className="pt-2 border-t border-black/5">
            <div className="flex items-center justify-between">
              <span className="text-sm font-semibold text-ink-2 flex items-center gap-1.5"><Icon name="boxes" size={14} /> ฝ้า (ในห้อง — แยกจากฝ้าใต้หลังคาด้านบน)</span>
              <button type="button" onClick={() => setCeilOn((v) => !v)}
                className={`press text-xs font-semibold rounded-full px-3 py-1.5 min-h-[36px] ${ceilOn ? "bg-brand text-white" : "glass-soft text-ink-2"}`}>
                {ceilOn ? "มีฝ้า ✓" : "＋ ใส่ฝ้า"}
              </button>
            </div>
            {ceilOn && (
              <div className="mt-2 space-y-2">
                <div className="flex flex-wrap gap-1.5">
                  {CEIL_TYPES.map((t) => (
                    <button key={t.key} type="button" onClick={() => setCeilType(t.key)}
                      className={`press text-xs font-semibold rounded-full px-3 py-1.5 min-h-[36px] ${ceilType === t.key ? "bg-brand text-white" : "glass-soft text-ink-2"}`}>
                      {t.label}
                    </button>
                  ))}
                </div>
                <div className="flex items-center gap-2 flex-wrap text-sm">
                  <span className="text-xs text-ink-3">กว้าง×ยาว</span>
                  <input type="number" step={0.1} value={ceilW} onChange={(e) => setCeilW(e.target.value)}
                    className="min-h-[40px] glass-soft rounded-lg px-2 py-1.5 w-20 outline-none tabular-nums" />
                  <span className="text-ink-3">×</span>
                  <input type="number" step={0.1} value={ceilL} onChange={(e) => setCeilL(e.target.value)}
                    className="min-h-[40px] glass-soft rounded-lg px-2 py-1.5 w-20 outline-none tabular-nums" />
                  <span className="text-ink-3">ม.</span>
                  <span className="ml-2 font-semibold text-brand-dark tabular-nums">{fmtBaht(ceilTotal)}</span>
                </div>
                <div className="flex flex-wrap gap-1.5">
                  <button type="button" onClick={() => setCeilInsul((v) => !v)}
                    className={`press text-[11px] font-semibold rounded-full px-2.5 py-1 min-h-[32px] ${ceilInsul ? "bg-brand text-white" : "glass-soft text-ink-2"}`}>
                    {ceilInsul ? "มีฉนวนกันร้อน 3\" ✓" : "＋ ฉนวนกันร้อน 3\" (+600/ตร.ม.)"}
                  </button>
                  <button type="button" onClick={() => setCeilPos((v) => v === "in" ? "out" : "in")}
                    className="press text-[11px] font-semibold rounded-full px-2.5 py-1 min-h-[32px] glass-soft text-ink-2">
                    ตำแหน่ง: {ceilPos === "in" ? "ในห้อง" : "นอกห้อง"}
                  </button>
                  <button type="button" onClick={() => setCeilDir((v) => v === "flat" ? "slope" : "flat")}
                    className="press text-[11px] font-semibold rounded-full px-2.5 py-1 min-h-[32px] glass-soft text-ink-2">
                    แนว: {ceilDir === "flat" ? "ตรง" : "เฉียงตามหลังคา"}
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* หน้าพื้น/พัดลม/งานบริการ */}
      {tab === TAB_EXTRA && (
        <div className="rounded-xl border border-black/5 bg-white/60 p-3 space-y-4">
          {/* พื้น */}
          <div>
            <div className="flex items-center justify-between">
              <span className="text-sm font-semibold text-ink-2 flex items-center gap-1.5"><Icon name="ruler" size={14} /> พื้น</span>
              <button type="button" onClick={() => setFloorOn((v) => !v)}
                className={`press text-xs font-semibold rounded-full px-3 py-1.5 min-h-[36px] ${floorOn ? "bg-brand text-white" : "glass-soft text-ink-2"}`}>
                {floorOn ? "มีงานพื้น ✓" : "＋ ใส่งานพื้น"}
              </button>
            </div>
            {floorOn && (
              <div className="mt-2 space-y-2">
                <div className="flex flex-wrap gap-1.5">
                  <button type="button" onClick={() => setFloorMat("smart")}
                    className={`press text-xs font-semibold rounded-full px-3 py-1.5 min-h-[36px] ${floorMat === "smart" ? "bg-brand text-white" : "glass-soft text-ink-2"}`}>
                    สมาร์ทบอร์ด/ไม้เทียม (5,000/ตร.ม.)
                  </button>
                  <button type="button" onClick={() => setFloorMat("spc")}
                    className={`press text-xs font-semibold rounded-full px-3 py-1.5 min-h-[36px] ${floorMat === "spc" ? "bg-brand text-white" : "glass-soft text-ink-2"}`}>
                    ลามิเนต/SPC (กรอกเรตเอง)
                  </button>
                </div>
                <div className="flex items-center gap-2 flex-wrap text-sm">
                  <span className="text-xs text-ink-3">กว้าง×ยาว</span>
                  <input type="number" step={0.1} value={floorW} onChange={(e) => setFloorW(e.target.value)}
                    className="min-h-[40px] glass-soft rounded-lg px-2 py-1.5 w-20 outline-none tabular-nums" />
                  <span className="text-ink-3">×</span>
                  <input type="number" step={0.1} value={floorL} onChange={(e) => setFloorL(e.target.value)}
                    className="min-h-[40px] glass-soft rounded-lg px-2 py-1.5 w-20 outline-none tabular-nums" />
                  <span className="text-ink-3">ม. (ขั้นต่ำ 5 ตร.ม.)</span>
                </div>
                {floorMat === "spc" && (
                  <label className="block">
                    <span className="text-xs font-medium text-ink-3">เรต SPC/ลามิเนต (฿/ตร.ม.)</span>
                    <input type="number" value={floorRate} onChange={(e) => setFloorRate(e.target.value)} placeholder="กรอกเรต"
                      className="w-full min-h-[40px] glass-soft rounded-lg px-2 py-1.5 mt-1 outline-none tabular-nums text-sm" />
                  </label>
                )}
                <label className="block">
                  <span className="text-xs font-medium text-ink-3">ส่วนลด % (เว้น = auto 10% ถ้า ≥20 ตร.ม.)</span>
                  <input type="number" value={floorDisc} onChange={(e) => setFloorDisc(e.target.value)} placeholder="auto"
                    className="w-full min-h-[40px] glass-soft rounded-lg px-2 py-1.5 mt-1 outline-none tabular-nums text-sm" />
                </label>
                <div className="font-semibold text-brand-dark tabular-nums">{fmtBaht(floorTotal)}</div>
              </div>
            )}
          </div>

          {/* พัดลม */}
          <div className="pt-3 border-t border-black/5">
            <div className="flex items-center justify-between">
              <span className="text-sm font-semibold text-ink-2">พัดลม</span>
              <button type="button" onClick={() => setFanOn((v) => !v)}
                className={`press text-xs font-semibold rounded-full px-3 py-1.5 min-h-[36px] ${fanOn ? "bg-brand text-white" : "glass-soft text-ink-2"}`}>
                {fanOn ? "มีพัดลม ✓" : "＋ ใส่พัดลม"}
              </button>
            </div>
            {fanOn && (
              <div className="mt-2 flex items-center gap-2 flex-wrap text-sm">
                <span className="text-xs text-ink-3">จำนวน</span>
                <input type="number" min={1} value={fanQty} onChange={(e) => setFanQty(e.target.value)}
                  className="min-h-[40px] glass-soft rounded-lg px-2 py-1.5 w-16 outline-none tabular-nums" />
                <span className="text-xs text-ink-3">฿/ตัว</span>
                <input type="number" value={fanPrice} onChange={(e) => setFanPrice(e.target.value)}
                  className="min-h-[40px] glass-soft rounded-lg px-2 py-1.5 w-24 outline-none tabular-nums" />
                <span className="ml-2 font-semibold text-brand-dark tabular-nums">{fmtBaht(fanTotal)}</span>
              </div>
            )}
          </div>

          {/* งานบริการเพิ่มเติม (กรอกเอง) */}
          <div className="pt-3 border-t border-black/5 space-y-1.5">
            <div className="flex items-center justify-between">
              <span className="text-sm font-semibold text-ink-2">งานบริการเพิ่มเติม</span>
              <button type="button" onClick={() => setServices((s) => [...s, { desc: "", qty: "1", rate: "0" }])}
                className="press text-[11px] font-semibold rounded-full px-2.5 py-1 min-h-[32px] glass-soft text-ink-2">＋ เพิ่มรายการ</button>
            </div>
            {services.map((sv, si) => (
              <div key={si} className="flex items-center gap-2 flex-wrap">
                <input type="text" placeholder="รายการ" value={sv.desc}
                  onChange={(e) => setServices((arr) => arr.map((x, xi) => xi === si ? { ...x, desc: e.target.value } : x))}
                  className="min-h-[36px] glass-soft rounded-lg px-2 py-1 flex-1 min-w-[120px] outline-none text-xs" />
                <input type="number" placeholder="จำนวน" value={sv.qty}
                  onChange={(e) => setServices((arr) => arr.map((x, xi) => xi === si ? { ...x, qty: e.target.value } : x))}
                  className="min-h-[36px] glass-soft rounded-lg px-2 py-1 w-20 outline-none tabular-nums text-xs" />
                <input type="number" placeholder="ราคา/หน่วย" value={sv.rate}
                  onChange={(e) => setServices((arr) => arr.map((x, xi) => xi === si ? { ...x, rate: e.target.value } : x))}
                  className="min-h-[36px] glass-soft rounded-lg px-2 py-1 w-24 outline-none tabular-nums text-xs" />
                <button type="button" onClick={() => setServices((arr) => arr.filter((_, xi) => xi !== si))}
                  className="press text-ink-3 hover:text-red-600 min-h-[32px] min-w-[32px]"><Icon name="trash" size={13} /></button>
              </div>
            ))}
            {services.length > 0 && <div className="font-semibold text-brand-dark tabular-nums">{fmtBaht(servicesTotal)}</div>}
          </div>

          {/* รื้อของเดิม / ป้องกันหน้างาน */}
          <div className="pt-3 border-t border-black/5 space-y-2">
            <span className="text-sm font-semibold text-ink-2">รื้อของเดิม / ป้องกันหน้างาน</span>
            <div className="grid grid-cols-2 gap-2 text-xs">
              <label className="block">
                <span className="text-ink-3">รื้อหลังคาเดิม (จุด × 5,000)</span>
                <input type="number" min={0} value={demoRoof} onChange={(e) => setDemoRoof(e.target.value)}
                  className="w-full min-h-[36px] glass-soft rounded-lg px-2 py-1 mt-1 outline-none tabular-nums" />
              </label>
              <label className="block">
                <span className="text-ink-3">รื้อพื้นเดิม (จุด × 5,000)</span>
                <input type="number" min={0} value={demoFloor} onChange={(e) => setDemoFloor(e.target.value)}
                  className="w-full min-h-[36px] glass-soft rounded-lg px-2 py-1 mt-1 outline-none tabular-nums" />
              </label>
              <label className="block">
                <span className="text-ink-3">รื้อประตู/บานเดิม (กรอกราคา)</span>
                <input type="number" min={0} value={demoDoor} onChange={(e) => setDemoDoor(e.target.value)}
                  className="w-full min-h-[36px] glass-soft rounded-lg px-2 py-1 mt-1 outline-none tabular-nums" />
              </label>
              <div>
                <span className="text-ink-3">รื้อราวเดิม</span>
                <div className="flex items-center gap-2 mt-1">
                  <button type="button" onClick={() => setDemoRail((v) => !v)}
                    className={`press text-[11px] font-semibold rounded-full px-2.5 py-1 min-h-[32px] ${demoRail ? "bg-brand text-white" : "glass-soft text-ink-2"}`}>
                    {demoRail ? "มี ✓" : "ไม่มี"}
                  </button>
                  {demoRail && (
                    <input type="number" min={0} placeholder="ยาว(ม.)" value={demoRailLen} onChange={(e) => setDemoRailLen(e.target.value)}
                      className="min-h-[32px] w-20 glass-soft rounded-lg px-2 py-1 outline-none tabular-nums" />
                  )}
                </div>
              </div>
            </div>
            <div className="flex items-center gap-2 flex-wrap">
              <button type="button" onClick={() => setProtectOn((v) => !v)}
                className={`press text-[11px] font-semibold rounded-full px-2.5 py-1 min-h-[32px] ${protectOn ? "bg-brand text-white" : "glass-soft text-ink-2"}`}>
                {protectOn ? "ป้องกันหน้างาน ✓ (+2,000 ฐาน)" : "＋ ป้องกันหน้างาน"}
              </button>
              {protectOn && (
                <label className="flex items-center gap-1.5 text-xs text-ink-3">
                  จุดเพิ่ม (×1,000)
                  <input type="number" min={0} value={protectPts} onChange={(e) => setProtectPts(e.target.value)}
                    className="min-h-[32px] w-16 glass-soft rounded-lg px-2 py-1 outline-none tabular-nums" />
                </label>
              )}
            </div>
            {svcTotal > 0 && <div className="font-semibold text-brand-dark tabular-nums">{fmtBaht(svcTotal)}</div>}
          </div>

          <label className="block pt-3 border-t border-black/5">
            <span className="text-xs font-medium text-ink-3">หมายเหตุ (พิมพ์ลงใบเสนอราคา)</span>
            <textarea value={remarks} onChange={(e) => setRemarks(e.target.value)} rows={2}
              className="w-full glass-soft rounded-lg px-3 py-2 mt-1 outline-none text-sm" placeholder="ระบุเงื่อนไข/ข้อตกลงเพิ่มเติม" />
          </label>
        </div>
      )}

      {/* หน้าสรุป */}
      {tab === TAB_SUMMARY && (
        <div className="rounded-xl border border-black/5 bg-white/60 p-3 space-y-1.5 text-sm">
          {sides.map((s, i) => {
            const doorCount = sidePanes(s).length;
            const doorNote = (s.kind === "wall" || s.kind === "open") && doorCount ? ` + ${doorCount} บาน` : "";
            const kindLabel = s.kind === "glass"
              ? `กระจก ${s.cols.length} ช่อง · ${s.cols.reduce((a, c) => a + c.pcs.length, 0)} บาน`
              : s.kind === "wall"
                ? `ผนัง${s.wallType === "light" ? "เบา" : s.wallType === "smartboard" ? "สมาร์ทบอร์ด" : "ไอโซวอล"}${doorNote}`
                : `เปิดโล่ง${doorNote}`;
            return (
              <div key={i} className="flex items-center justify-between">
                <span className="text-ink-2">ด้าน {L(i)} ({kindLabel})</span>
                <span className="tabular-nums font-medium">{fmtBaht(sideTotals[i] || 0)}</span>
              </div>
            );
          })}
          {roofOn && (
            <div className="flex items-center justify-between">
              <span className="text-ink-2">หลังคา ({roofMaterial} · {fmtNum(roofArea)} ตร.ม.)</span>
              <span className="tabular-nums font-medium">{fmtBaht(roofTotal)}</span>
            </div>
          )}
          {ceilOn && (
            <div className="flex items-center justify-between">
              <span className="text-ink-2">ฝ้า ({CEIL_TYPES.find((t) => t.key === ceilType)?.label})</span>
              <span className="tabular-nums font-medium">{fmtBaht(ceilTotal)}</span>
            </div>
          )}
          {floorOn && (
            <div className="flex items-center justify-between">
              <span className="text-ink-2">พื้น</span>
              <span className="tabular-nums font-medium">{fmtBaht(floorTotal)}</span>
            </div>
          )}
          {fanOn && (
            <div className="flex items-center justify-between">
              <span className="text-ink-2">พัดลม × {fanQty}</span>
              <span className="tabular-nums font-medium">{fmtBaht(fanTotal)}</span>
            </div>
          )}
          {servicesTotal > 0 && (
            <div className="flex items-center justify-between">
              <span className="text-ink-2">งานบริการเพิ่มเติม</span>
              <span className="tabular-nums font-medium">{fmtBaht(servicesTotal)}</span>
            </div>
          )}
          {svcTotal > 0 && (
            <div className="flex items-center justify-between">
              <span className="text-ink-2">รื้อของเดิม/ป้องกันหน้างาน</span>
              <span className="tabular-nums font-medium">{fmtBaht(svcTotal)}</span>
            </div>
          )}
          <div className="pt-1.5 mt-1.5 border-t border-black/10 flex items-center justify-between font-bold text-brand-dark">
            <span>รวมทั้งห้อง</span>
            <span className="tabular-nums text-base">{fmtBaht(roomTotal)}</span>
          </div>
          {remarks && <p className="text-[11px] text-ink-3 pt-1.5 border-t border-black/5">หมายเหตุ: {remarks}</p>}
        </div>
      )}

      {/* ราคารวมห้อง — โชว์ล่างสุดตลอด (ตามเครื่องเดิม) */}
      <div className="flex items-center justify-between rounded-xl px-4 py-3 bg-brand text-white shadow-brand">
        <span className="text-sm font-medium text-red-100">รวมทั้งห้อง (ทุกด้าน + ฝ้า + หลังคา + พื้น/พัดลม/บริการ)</span>
        <span className="text-xl font-bold tabular-nums">{fmtBaht(roomTotal)}</span>
      </div>

      <p className="text-[11px] text-ink-3">
        หมายเหตุ: ดัดโค้ง (curved_*) ยังไม่มีแหล่งราคา R4.0/R3.9 อัตโนมัติในระบบ — ไม่มีในลิสต์ชนิดบาน (สั่งทำแยกนอกระบบ) ·
        ผนังเบา flat R3.9 1,350/ตร.ม. (ยังไม่มี R4.0 cost ของผนังเบาชนิดบาง) ·
        ฝ้าอลูตัวซี/ระแนงอลู 3 แบบ ใช้ราคาขายรวมติดตั้ง R3.9 ต่อตร.ม. (ยังไม่ถอดทุน R4.0)
      </p>
    </div>
  );
}
