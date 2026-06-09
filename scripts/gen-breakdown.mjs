// gen-breakdown.mjs — สร้าง docs/breakdown-sample.html
// ส่วน 1: ตารางคิดราคารายข้อ (breakdown ฐาน + ออปชันแต่ละตัว)
// ส่วน 2: ใบราคาแยกย่อยชุดกั้นห้องกระจก 3 ด้าน + หลังคา

import { JSDOM, VirtualConsole } from "jsdom";
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");
const DOCS = join(ROOT, "docs");
mkdirSync(DOCS, { recursive: true });

const calcHtml = readFileSync(
  join(ROOT, "public/calculator/index.html"),
  "utf8"
);
const dom = new JSDOM(calcHtml, {
  runScripts: "dangerously",
  pretendToBeVisual: true,
  virtualConsole: new VirtualConsole(),
  url: "http://localhost/",
});
await new Promise((r) => {
  dom.window.addEventListener("load", r);
  setTimeout(r, 1500);
});
const w = dom.window;

// expose globals
w.eval(`
  window.__PRODUCTS__ = PRODUCTS;
  window.__PBYID__    = PBYID;
  window.__GLASS__    = GLASS;
  window.__COLORS__   = COLORS;
  window.__RATES__    = RATES;
  window.__calcUnit__ = calcUnit;
  window.__fmt__      = fmt;
  window.__roundUp__  = roundUp;
  window.__addonCalc__= addonCalc;
`);

const PBYID = w.__PBYID__;

// calcUnit wrapper (shipOnly=false, gi=ci=0)
const cu = (p, ww, hh, panels, optSel) =>
  w.__calcUnit__(p, ww, hh, 0, 0, panels, optSel, false);

const fmtN = (n) => Math.round(n).toLocaleString("en-US");

// ================================================================
// ส่วนที่ 1 — SAMPLE ITEMS
// สำหรับแต่ละรายการ:
//   baseOpts   = optSel ที่ไม่มีออปชัน → ราคาฐาน
//   addedOpts  = รายการออปชันแต่ละตัวที่เพิ่ม (incremental)
// ================================================================

const SAMPLE_ITEMS = [
  // 1. บานเลื่อนยูโร 2 บาน + เสริมคาน + มุ้งจีบ SD
  {
    label: "บานเลื่อน ยูโร 2 บาน + เสริมคาน + มุ้งจีบ",
    prodId: "sliding_euro",
    w: 1.8, h: 2.1, panels: 2, qty: 1,
    note: "กว้าง 1.80 × สูง 2.10 ม. · 2 บาน",
    baseOpts: {},
    addedOpts: [
      {
        name: "เสริมคาน ×1 ม.",
        build: (o) => ({ ...o, beamM: "2400", beamMlen: "1" }),
      },
      {
        name: "มุ้งจีบ SD พื้นฐาน (ผ้าไฟเบอร์เทา)",
        build: (o) => ({ ...o, mosqId: "mj_sd_basic", mosqFabric: "fiber_gray" }),
        useAddonLines: true,  // ราคามุ้งอยู่ใน addonLines ไม่ใช่ sell diff
      },
    ],
  },
  // 2. บานเปิดยูโร + ธรณีหลังเต่า + Drop Seal
  {
    label: "บานเปิด ยูโร + ธรณีหลังเต่า + Drop Seal",
    prodId: "casement_euro",
    w: 0.9, h: 2.1, panels: 1, qty: 1,
    note: "กว้าง 0.90 × สูง 2.10 ม. · บานเปิดเดี่ยว",
    baseOpts: { thresh: "flat" },
    addedOpts: [
      {
        name: "ธรณีหลังเต่า + Drop Seal",
        build: (o) => ({ ...o, thresh: "turtle" }),
      },
    ],
  },
  // 3. บานเปิดยูโร คู่ + คาดตาราง + มือจับดิจิตอล S3
  {
    label: "บานเปิด ยูโร คู่ + คาดตาราง + ดิจิตอล S3",
    prodId: "casement_euro",
    w: 1.6, h: 2.1, panels: 2, qty: 1,
    note: "กว้าง 1.60 × สูง 2.10 ม. · ประตูคู่",
    baseOpts: {},
    addedOpts: [
      {
        name: "คาดตาราง 2นอน+2ตั้ง 200 บ./ม.",
        build: (o) => ({
          ...o,
          gridmark: true,
          gmNh: "2", gmNv: "2", gmRate: "200", gmCurve: "0",
        }),
      },
      {
        name: "มือจับดิจิตอล S3 (+โช๊ค)",
        build: (o) => ({ ...o, digi: "2" }),  // DIGI[2] = S3, nc:1 → +18,000+5,000
      },
    ],
  },
  // 4. หลังคาไวนิล + ปิดปลาย + รางน้ำอลู S
  {
    label: "หลังคา ไวนิล + ปิดปลาย + รางน้ำอลู S",
    prodId: "roof_vinyl",
    w: 4.0, h: 3.5, panels: 1, qty: 1,
    note: "กว้าง 4.0 × ลึก 3.5 ม. = 14.0 ตร.ม.",
    baseOpts: { rfend: "ปล่อย" },
    addedOpts: [
      {
        name: "ปิดปลายหลังคา",
        build: (o) => ({ ...o, rfend: "ปิดปลาย" }),
      },
      {
        // rfgut = rate/ม. (1000=อลู S), rfgutlen = ยาวรวม (ม.)
        name: "รางน้ำอลู S 1,000/ม. ยาว 3.5 ม.",
        build: (o) => ({ ...o, rfgut: "1000", rfgutlen: "3.5" }),
      },
    ],
  },
  // 5. บานเฟี้ยม 4 บาน + เสริมคาน
  {
    label: "บานเฟี้ยม เซมิยูโร 4 บาน + เสริมคาน",
    prodId: "folding",
    w: 3.0, h: 2.4, panels: 4, qty: 1,
    note: "กว้าง 3.0 × สูง 2.4 ม. · 4 บาน",
    baseOpts: {},
    addedOpts: [
      {
        name: "เสริมคาน (BEAM rate × พื้นที่)",
        build: (o) => ({ ...o, beam: true }),
      },
    ],
  },
  // 6. Shower + อุปกรณ์ดำ + เข้ามุม
  {
    label: "Shower (ประตู+ติดตาย) + อุปกรณ์ดำ + เข้ามุม",
    prodId: "shower",
    w: 1.2, h: 2.0, panels: 1, qty: 1,
    note: "กว้าง 1.2 × สูง 2.0 ม. · ประตูสวิง + ติดตาย",
    baseOpts: { shtype: "door_fixed", shdoortype: "swing" },
    addedOpts: [
      {
        name: "อุปกรณ์ดำ",
        build: (o) => ({ ...o, blackhw: true }),
      },
      {
        name: "เข้ามุม",
        build: (o) => ({ ...o, corner: true }),
      },
    ],
  },
  // 7. กระจกติดตาย + คาดตาราง
  {
    label: "กระจกติดตาย + คาดตาราง 2นอน+3ตั้ง",
    prodId: "fixed_glass",
    w: 2.4, h: 2.4, panels: 1, qty: 1,
    note: "กว้าง 2.4 × สูง 2.4 ม. · ช่องกระจก",
    baseOpts: {},
    addedOpts: [
      {
        name: "คาดตาราง 2นอน+3ตั้ง 200 บ./ม.",
        build: (o) => ({
          ...o, gridmark: true,
          gmNh: "2", gmNv: "3", gmRate: "200", gmCurve: "0",
        }),
      },
    ],
  },
  // 8. บานกระทุ้งยูโร 2 บาน + มุ้ง + Cmech Black
  {
    label: "บานกระทุ้ง ยูโร 2 บาน + มุ้ง SD + Cmech",
    prodId: "awning_euro",
    w: 1.6, h: 1.2, panels: 2, qty: 1,
    note: "กว้าง 1.6 × สูง 1.2 ม. · 2 บาน",
    baseOpts: {},
    addedOpts: [
      {
        name: "มุ้งจีบ SD พื้นฐาน",
        build: (o) => ({ ...o, mosqId: "mj_sd_basic", mosqFabric: "fiber_gray" }),
        useAddonLines: true,
      },
      {
        name: "Cmech Black (+1,200 บ.)",
        build: (o) => ({ ...o, cmech: "1", cmechprice: "1200" }),
      },
    ],
  },
  // 9. มุ้งเฟรมใหญ่ IMP23 — เปรียบฐานกับผ้าสแตนนิรภัย
  {
    label: "มุ้งเฟรมใหญ่ IMP23 + ผ้าสแตนนิรภัย 0.8มม.",
    prodId: "imp23",
    w: 1.8, h: 2.1, panels: 1, qty: 1,
    note: "กว้าง 1.8 × สูง 2.1 ม. · มุ้งเฟรมใหญ่",
    baseOpts: { screenFabric: "fiber" },
    addedOpts: [
      {
        name: "ผ้าสแตนนิรภัย 304 สีดำ 0.8มม.",
        build: (o) => ({ ...o, screenFabric: "safety" }),
      },
    ],
  },
  // 10. เส้นคาดตาราง + โค้ง 2 เส้น
  {
    label: "เส้นคาดตาราง 3นอน+3ตั้ง + โค้ง 2 เส้น",
    prodId: "grid_bars",
    w: 1.8, h: 2.1, panels: 1, qty: 1,
    note: "ช่องกระจก 1.8×2.1 ม. · 3 เส้นนอน + 3 เส้นตั้ง",
    baseOpts: { nh: "3", nv: "3", gridcolor: "200", nc: "0" },
    addedOpts: [
      {
        name: "เส้นโค้ง 2 เส้น ×3,000",
        build: (o) => ({ ...o, nc: "2" }),
      },
    ],
  },
];

// ================================================================
// คำนวณราคา incremental
// ================================================================
function computeItem(spec) {
  const p = PBYID[spec.prodId];
  if (!p) return null;

  // ราคาฐาน
  const rBase = cu(p, spec.w, spec.h, spec.panels, spec.baseOpts);
  let prevOpts = { ...spec.baseOpts };
  let prevSell = rBase.sell;

  const optionRows = [];

  for (const ao of spec.addedOpts) {
    const newOpts = ao.build(prevOpts);
    const rNew = cu(p, spec.w, spec.h, spec.panels, newOpts);

    let delta = rNew.sell - prevSell;
    let detailMsgs = [];
    let addonLinesNew = [];

    if (ao.useAddonLines) {
      // ราคาจาก addonLines (เช่น มุ้ง — ไม่ถูก reflect ใน sell)
      const prevAddon = cu(p, spec.w, spec.h, spec.panels, prevOpts).addonLines || [];
      const prevAddonIds = new Set(prevAddon.map((al) => al.n));
      addonLinesNew = (rNew.addonLines || []).filter((al) => !prevAddonIds.has(al.n));
      // compute delta from addonLines สะสม
      delta = addonLinesNew.reduce((s, al) => s + (al.p || 0), 0);
      // msgs
      const prevMsgsSet = new Set((cu(p, spec.w, spec.h, spec.panels, prevOpts).msgs || []));
      detailMsgs = (rNew.msgs || []).filter((m) => !prevMsgsSet.has(m));
    } else {
      // msgs ใหม่ที่เกิดจาก option นี้
      const prevMsgsSet = new Set((cu(p, spec.w, spec.h, spec.panels, prevOpts).msgs || []));
      detailMsgs = (rNew.msgs || []).filter((m) => !prevMsgsSet.has(m));
    }

    optionRows.push({
      name: ao.name,
      delta,
      detailMsgs,
      addonLinesNew,
      sell: rNew.sell,
    });

    prevOpts = newOpts;
    prevSell = rNew.sell;
  }

  const rFull = cu(p, spec.w, spec.h, spec.panels, prevOpts);

  // คำนวณ "ราคาสุดท้าย" รวม addonLines ที่ไม่ได้อยู่ใน sell
  const allAddonLines = rFull.addonLines || [];
  const addonLinesTotal = allAddonLines.reduce((s, al) => s + (al.p || 0), 0);
  // total = sell + addonLines ที่ไม่ได้ถูก roundUp เข้า sell
  // (addonLines ราคาถูกนับเป็น opt แล้วใน sell ยกเว้นมุ้ง — ซึ่ง useAddonLines)
  const totalUnit = rFull.sell + (spec.addedOpts.some((ao) => ao.useAddonLines) ? addonLinesTotal : 0);
  const totalLine = totalUnit * spec.qty;

  return {
    label: spec.label,
    prodName: p.name,
    size: `${spec.w}×${spec.h} ม.`,
    panels: spec.panels,
    qty: spec.qty,
    note: spec.note,
    basePrice: rBase.sell,
    baseMsgs: rBase.msgs || [],
    baseAddonLabel: rBase.addonLabel || "",
    optionRows,
    totalUnit,
    totalLine,
  };
}

const part1Items = SAMPLE_ITEMS.map(computeItem).filter(Boolean);

// ================================================================
// ส่วนที่ 2 — ชุดกั้นห้องกระจก split view
// ================================================================
const GH_SET = {
  name: "กั้นห้องกระจก ระเบียงหลังบ้าน (3 ด้าน + หลังคา)",
  sides: [
    {
      prodId: "sliding_euro",
      w: 3.6, h: 2.4, panels: 4,
      pos: "ด้าน A — ประตูเลื่อน ยูโร 4 บาน",
    },
    {
      prodId: "fixed_glass",
      w: 2.4, h: 2.4, panels: 1,
      pos: "ด้าน B — กระจกติดตาย",
    },
    {
      prodId: "casement_euro",
      w: 1.8, h: 2.4, panels: 2,
      pos: "ด้าน C — บานเปิดคู่ ยูโร",
    },
  ],
  roof: {
    prodId: "roof_vinyl",
    w: 9.0, h: 3.5, panels: 1,
    pos: "หลังคา — ไวนิล",
  },
};

function computeGHPart(part) {
  const p = PBYID[part.prodId];
  if (!p) return null;
  const r = cu(p, part.w, part.h, part.panels, {});
  const addonLabel = r.addonLabel || "";
  const allMsgs = [...(addonLabel ? [addonLabel] : []), ...(r.msgs || [])];
  return {
    pos: part.pos,
    prodName: p.name,
    size: `${part.w}×${part.h} ม.`,
    panels: part.panels,
    area: r.a,
    msgs: allMsgs,
    sell: r.sell,
  };
}

const ghSides    = GH_SET.sides.map(computeGHPart).filter(Boolean);
const ghRoof     = computeGHPart(GH_SET.roof);
const ghAllParts = [...ghSides, ...(ghRoof ? [ghRoof] : [])];
const ghTotal    = ghAllParts.reduce((s, x) => s + x.sell, 0);

// ================================================================
// HTML helpers
// ================================================================
function escHtml(s) {
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

const today = "08/06/2569";

// ================================================================
// Render ส่วนที่ 1
// ================================================================
function renderPart1Rows() {
  let out = "";
  let grandTotal = 0;

  for (let i = 0; i < part1Items.length; i++) {
    const it = part1Items[i];
    grandTotal += it.totalLine;
    const rowCls = i % 2 === 0 ? "row-even" : "row-odd";

    // ราคาฐาน cell
    let baseCellHtml = `<div class="price-num">${fmtN(it.basePrice)}</div>`;
    if (it.baseAddonLabel) {
      baseCellHtml += `<span class="msg-info addon-label">${escHtml(it.baseAddonLabel)}</span>`;
    }
    if (it.baseMsgs.length) {
      baseCellHtml += it.baseMsgs
        .map((m) => `<span class="msg-info">${escHtml(m)}</span>`)
        .join("");
    }

    // ออปชัน cell — แต่ละ option row
    let optsCellHtml = "";
    if (it.optionRows.length === 0) {
      optsCellHtml = `<span class="msg-none">—</span>`;
    } else {
      for (const or of it.optionRows) {
        const deltaStr =
          or.delta !== 0
            ? ` <span class="delta">(+${fmtN(or.delta)})</span>`
            : "";
        optsCellHtml += `<div class="opt-row">`;
        optsCellHtml += `<span class="opt-name">${escHtml(or.name)}${deltaStr}</span>`;

        // detail msgs from engine
        for (const m of or.detailMsgs) {
          optsCellHtml += `<span class="msg-opt-detail">${escHtml(m)}</span>`;
        }
        // addonLines (มุ้ง)
        for (const al of or.addonLinesNew) {
          optsCellHtml += `<span class="msg-opt-detail">${escHtml(al.det || al.n)} · ${fmtN(al.p)} บ. · พื้นที่ ${(al.mosqArea || 0).toFixed(2)} ตร.ม.</span>`;
        }
        optsCellHtml += `</div>`;
      }
    }

    out += `
    <tr class="${rowCls}">
      <td class="col-num">${i + 1}</td>
      <td class="col-item">
        <div class="item-name">${escHtml(it.label)}</div>
        <div class="item-detail">${escHtml(it.note)}</div>
      </td>
      <td class="col-base">${baseCellHtml}</td>
      <td class="col-opts">${optsCellHtml}</td>
      <td class="col-unit">${fmtN(it.totalUnit)}</td>
      <td class="col-qty">${it.qty}</td>
      <td class="col-line">${fmtN(it.totalLine)}</td>
    </tr>`;
  }

  out += `
    <tr class="row-total">
      <td colspan="6" style="text-align:right;font-weight:700;padding:10px 14px;font-size:14px;">
        รวมทั้งหมด (${part1Items.length} รายการ)
      </td>
      <td class="col-line" style="font-weight:800;font-size:17px;">${fmtN(grandTotal)}</td>
    </tr>`;
  return out;
}

// ================================================================
// Render ส่วนที่ 2
// ================================================================
function renderPart2Rows() {
  let out = "";

  for (let i = 0; i < ghAllParts.length; i++) {
    const pt = ghAllParts[i];
    const isRoof = ghRoof && i === ghAllParts.length - 1;
    const rowCls = isRoof
      ? "row-roof"
      : i % 2 === 0
      ? "row-even"
      : "row-odd";

    const bdHtml = pt.msgs.length
      ? pt.msgs.map((m) => `<span class="msg-info">${escHtml(m)}</span>`).join("")
      : `<span class="msg-none">—</span>`;

    out += `
    <tr class="${rowCls}">
      <td class="col-num">${i + 1}</td>
      <td class="col-pos">${escHtml(pt.pos)}</td>
      <td class="col-item">
        <div class="item-name">${escHtml(pt.prodName)}</div>
        <div class="item-detail">${escHtml(pt.size)} · ${pt.area.toFixed(2)} ตร.ม.${pt.panels > 1 ? ` · ${pt.panels} บาน` : ""}</div>
      </td>
      <td class="col-bd">${bdHtml}</td>
      <td class="col-line" style="font-weight:700;">${fmtN(pt.sell)}</td>
    </tr>`;
  }

  const sidesTotal = ghSides.reduce((s, x) => s + x.sell, 0);
  const roofSell   = ghRoof ? ghRoof.sell : 0;

  out += `
    <tr class="row-subtotal">
      <td colspan="4" style="text-align:right;font-weight:600;padding:7px 14px;font-size:13px;color:#555;">
        รวมบาน/กระจก (3 ด้าน)
      </td>
      <td class="col-line" style="font-size:13px;">${fmtN(sidesTotal)}</td>
    </tr>
    <tr class="row-subtotal">
      <td colspan="4" style="text-align:right;font-weight:600;padding:7px 14px;font-size:13px;color:#555;">
        รวมหลังคา
      </td>
      <td class="col-line" style="font-size:13px;">${fmtN(roofSell)}</td>
    </tr>
    <tr class="row-total">
      <td colspan="4" style="text-align:right;font-weight:700;padding:10px 14px;font-size:14px;">
        รวมชุดกั้นห้องกระจก (ทั้งหมด)
      </td>
      <td class="col-line" style="font-weight:800;font-size:17px;">${fmtN(ghTotal)}</td>
    </tr>`;
  return out;
}

// ================================================================
// Full HTML
// ================================================================
const html = `<!DOCTYPE html>
<html lang="th">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>JR ใบราคาแยกย่อย — Breakdown Sample</title>
<style>
  :root {
    --red:        #B3151D;
    --red-bg:     #FDECEC;
    --red-border: #E5A0A0;
    --ink:        #1F2937;
    --muted:      #6B7280;
    --line:       #E5E7EB;
    --bg:         #F7F8FA;
    --white:      #fff;
    --green:      #1E7E45;
    --green-bg:   #e6f5ec;
    --green-dark: #145c32;
    --yellow-bg:  #FFFBEB;
    --yellow-bdr: #F0C040;
  }
  * { box-sizing: border-box; }
  body {
    margin: 0;
    font-family: "Sarabun","Prompt","Leelawadee UI","Noto Sans Thai","Segoe UI",Tahoma,sans-serif;
    background: var(--bg);
    color: var(--ink);
    font-size: 14px;
    line-height: 1.5;
  }
  .wrap { max-width: 1120px; margin: 0 auto; padding: 24px 16px 60px; }

  /* Page Header */
  .page-header {
    background: var(--white);
    border: 1px solid var(--line);
    border-radius: 14px;
    padding: 18px 22px;
    margin-bottom: 22px;
    display: flex;
    align-items: center;
    gap: 16px;
  }
  .logo { font-size: 34px; font-weight: 800; color: var(--red); font-style: italic; letter-spacing: -1px; line-height: 1; flex: none; }
  .hdr-div { width: 2px; height: 42px; background: var(--red); opacity: .3; border-radius: 2px; flex: none; }
  .hdr-txt h1 { font-size: 17px; margin: 0 0 3px; font-weight: 700; }
  .hdr-txt p  { font-size: 12px; margin: 0; color: var(--muted); }

  /* Section */
  .section { background: var(--white); border: 1px solid var(--line); border-radius: 12px; margin-bottom: 30px; overflow: hidden; }
  .section-head {
    background: var(--red);
    color: #fff;
    padding: 13px 18px;
    font-size: 15px;
    font-weight: 700;
    display: flex;
    align-items: center;
    gap: 10px;
  }
  .badge { background: rgba(255,255,255,.22); border-radius: 6px; padding: 1px 9px; font-size: 12px; font-weight: 600; }
  .note-box {
    background: var(--yellow-bg);
    border-bottom: 1px solid var(--yellow-bdr);
    padding: 9px 16px;
    font-size: 12.5px;
    color: #7a5c00;
    line-height: 1.6;
  }
  .gh-set-name {
    padding: 9px 16px;
    font-weight: 700;
    font-size: 14px;
    color: var(--red);
    background: var(--red-bg);
    border-bottom: 1px solid var(--red-border);
  }

  /* Table */
  table { width: 100%; border-collapse: collapse; font-size: 13.5px; }
  thead th {
    background: #3a0507;
    color: #fff;
    padding: 9px 10px;
    text-align: right;
    font-size: 12px;
    font-weight: 600;
    white-space: nowrap;
    position: sticky;
    top: 0;
    z-index: 1;
  }
  thead th.left { text-align: left; }
  td { padding: 7px 10px; border-bottom: 1px solid var(--line); vertical-align: top; }

  .row-even    { background: var(--white); }
  .row-odd     { background: #FAFBFD; }
  .row-total   { background: var(--red-bg); }
  .row-subtotal{ background: #f3f3f3; }
  .row-roof    { background: var(--yellow-bg); }

  /* Columns */
  .col-num  { text-align: center; color: var(--muted); font-size: 11px; width: 28px; }
  .col-item { min-width: 200px; }
  .col-pos  { min-width: 200px; font-weight: 600; color: var(--ink); }
  .col-base { min-width: 150px; text-align: right; }
  .col-opts { min-width: 220px; }
  .col-bd   { min-width: 250px; }
  .col-unit { text-align: right; white-space: nowrap; font-variant-numeric: tabular-nums; min-width: 85px; }
  .col-qty  { text-align: center; width: 44px; }
  .col-line { text-align: right; white-space: nowrap; font-variant-numeric: tabular-nums; color: var(--red); min-width: 100px; padding-right: 14px; }

  /* Cell content */
  .item-name   { font-weight: 700; color: var(--ink); margin-bottom: 2px; line-height: 1.35; }
  .item-detail { font-size: 11.5px; color: var(--muted); }
  .price-num   { font-weight: 700; font-variant-numeric: tabular-nums; font-size: 14px; color: var(--ink); }
  .addon-label { font-style: italic; color: var(--red) !important; }

  /* msgs info (grey) */
  .msg-info {
    display: block;
    font-size: 11.5px;
    color: var(--muted);
    margin-top: 1px;
    line-height: 1.4;
  }
  /* option rows (green) */
  .opt-row { margin-bottom: 5px; }
  .opt-name {
    display: inline-flex;
    align-items: baseline;
    gap: 4px;
    background: var(--green-bg);
    color: var(--green-dark);
    font-size: 12px;
    font-weight: 700;
    border-radius: 5px;
    padding: 2px 7px;
    margin-bottom: 2px;
  }
  .delta {
    font-size: 11px;
    font-weight: 700;
    font-variant-numeric: tabular-nums;
    color: var(--green);
    white-space: nowrap;
  }
  .msg-opt-detail {
    display: block;
    font-size: 11px;
    color: var(--muted);
    margin-left: 8px;
    line-height: 1.4;
  }
  .msg-none { font-size: 12px; color: #bbb; }

  /* Legend */
  .legend {
    display: flex;
    gap: 20px;
    padding: 8px 16px;
    font-size: 12px;
    color: var(--muted);
    border-top: 1px solid var(--line);
    background: #fafbfd;
    flex-wrap: wrap;
  }
  .legend-item { display: flex; align-items: center; gap: 6px; }
  .ldot { width: 10px; height: 10px; border-radius: 50%; flex: none; }

  /* Footer */
  .footer {
    text-align: center;
    font-size: 11.5px;
    color: var(--muted);
    margin-top: 28px;
    padding: 12px 0 16px;
    border-top: 1px solid var(--line);
  }
</style>
</head>
<body>
<div class="wrap">

  <div class="page-header">
    <div class="logo">JR</div>
    <div class="hdr-div"></div>
    <div class="hdr-txt">
      <h1>ใบราคาแยกย่อย — Breakdown Report</h1>
      <p>ราคาฐาน + ออปชันที่บวกเพิ่มทีละรายการ · JR เครื่องคิดราคา R3.9 · ${today}</p>
    </div>
  </div>

  <!-- ===== ส่วน 1 ===== -->
  <div class="section">
    <div class="section-head">
      ส่วนที่ 1 — ตารางคิดราคารายข้อ (ราคาฐาน + ออปชันที่บวกเพิ่ม)
      <span class="badge">${part1Items.length} รายการ</span>
    </div>
    <div class="note-box">
      <b>วิธีอ่าน:</b>
      "ราคาฐาน" = ราคาก่อนออปชัน ·
      แถบสีเขียว = ออปชันที่บวกเพิ่ม พร้อมผลต่าง (+xxx) ·
      "รวม/หน่วย" = ฐาน + ออปชันทั้งหมด ·
      "รวม" = ×จำนวน
    </div>
    <div style="overflow-x:auto;">
      <table>
        <thead>
          <tr>
            <th class="left">#</th>
            <th class="left">รายการ / ขนาด</th>
            <th>ราคาฐาน (บ.)</th>
            <th class="left">ออปชันที่บวกเพิ่ม</th>
            <th>รวม/หน่วย</th>
            <th>×จำนวน</th>
            <th>รวม (บ.)</th>
          </tr>
        </thead>
        <tbody>${renderPart1Rows()}</tbody>
      </table>
    </div>
    <div class="legend">
      <div class="legend-item">
        <div class="ldot" style="background:var(--ink);"></div>
        <span>ราคาฐาน (ก่อนออปชัน)</span>
      </div>
      <div class="legend-item">
        <div class="ldot" style="background:var(--green);"></div>
        <span>ออปชันที่บวกเพิ่ม + ผลต่างราคา</span>
      </div>
      <div class="legend-item">
        <div class="ldot" style="background:var(--muted);"></div>
        <span>ข้อมูลการคิด / รายละเอียด (สีเทา)</span>
      </div>
    </div>
  </div>

  <!-- ===== ส่วน 2 ===== -->
  <div class="section">
    <div class="section-head">
      ส่วนที่ 2 — ใบราคาแยกย่อยชุดกั้นห้องกระจก (Split View)
      <span class="badge">3 ด้าน + หลังคา</span>
    </div>
    <div class="gh-set-name">${escHtml(GH_SET.name)}</div>
    <div class="note-box">
      <b>ชุดกั้นห้องกระจก:</b>
      ราคาแสดงแยกตามด้าน (ด้าน A, B, C + หลังคา) ·
      แต่ละด้านคิดราคาตามสินค้าและขนาดจริง ·
      รวมชุด = ผลรวมทุกด้าน ·
      แถวสีเหลือง = หลังคา
    </div>
    <div style="overflow-x:auto;">
      <table>
        <thead>
          <tr>
            <th class="left">#</th>
            <th class="left">ตำแหน่ง / ด้าน</th>
            <th class="left">สินค้า / ขนาด</th>
            <th class="left">การคิดราคา (Breakdown)</th>
            <th>ราคา (บ.)</th>
          </tr>
        </thead>
        <tbody>${renderPart2Rows()}</tbody>
      </table>
    </div>
    <div class="legend">
      <div class="legend-item">
        <div class="ldot" style="background:var(--yellow-bdr);"></div>
        <span>แถวสีเหลือง = หลังคา</span>
      </div>
      <div class="legend-item">
        <span>รวมชุด: <b style="color:var(--red);font-variant-numeric:tabular-nums;font-size:15px;">${fmtN(ghTotal)} บาท</b></span>
      </div>
    </div>
  </div>

  <div class="footer">
    สร้างโดย scripts/gen-breakdown.mjs · ข้อมูลจากเครื่องคิดราคา JR R3.9 · ${today}
  </div>

</div>
</body>
</html>`;

const outPath = join(DOCS, "breakdown-sample.html");
writeFileSync(outPath, html, "utf8");
console.log("สร้าง docs/breakdown-sample.html สำเร็จ");
console.log("path:", outPath);

// ================================================================
// Console summary
// ================================================================
console.log("\n--- breakdown ส่วนที่ 1 ---");
for (const it of part1Items) {
  const optSummary = it.optionRows
    .map((or) => {
      const sign = or.delta >= 0 ? "+" : "";
      return `${or.name} (${sign}${fmtN(or.delta)})`;
    })
    .join(" | ");
  console.log(
    `[${it.label}]\n  ฐาน=${fmtN(it.basePrice)} · opts=[${optSummary || "—"}] · รวม/หน่วย=${fmtN(it.totalUnit)}`
  );
}

console.log("\n--- ส่วนที่ 2: ชุดกั้นห้องกระจก ---");
for (const pt of ghAllParts) {
  console.log(
    `  ${pt.pos}\n    ${pt.prodName} ${pt.size} · ${pt.area.toFixed(2)} ตร.ม. → ${fmtN(pt.sell)} บ.`
  );
  if (pt.msgs.length) console.log(`    [${pt.msgs.slice(0, 2).join(" | ")}]`);
}
console.log(`  รวมชุด: ${fmtN(ghTotal)} บ.`);

process.exit(0);
